import { describe, expect, it } from "vitest";
import { calcularLiquidacion, type EntradaLiquidacion } from "../src";
import { ctx } from "./helpers";

const base: EntradaLiquidacion = {
  regimen: "general",
  sueldoBasico: "3000",
  fechaIngreso: "2024-01-01",
  fechaCese: "2026-08-20",
  motivoCese: "renuncia",
};
const calc = (cambios: Partial<EntradaLiquidacion>) => calcularLiquidacion({ ...base, ...cambios }, ctx);
const ids = (r: ReturnType<typeof calc>) => r.conceptos.map((c) => c.id);
const montoDe = (r: ReturnType<typeof calc>, id: string) => r.conceptos.find((c) => c.id === id)?.monto;

describe("liquidación", () => {
  it("renuncia: sin indemnización", () => {
    const r = calc({});
    expect(ids(r)).toEqual(["cts", "gratificacion", "bonificacion_extraordinaria", "vacaciones_truncas"]);
    expect(r.condiciones.supuestos[0]).toBe("Motivo de cese: renuncia.");
  });

  it("caso L2: el total suma valores exactos y avisa del ajuste por redondeo", () => {
    const r = calc({
      sueldoBasico: "2500",
      asignacionFamiliar: true,
      fechaIngreso: "2023-03-01",
      motivoCese: "despido_arbitrario",
      diasLaboradosUltimoMes: 20,
    });
    expect(r.total).toBe("17991.47");
    expect(r.ajusteRedondeo).toBe(true);
    expect(r.steps.find((s) => s.descripcion === "Días trabajados del último mes")?.formula).toBe("2613.00 ÷ 30 × 20");
  });

  it("cese el 10/05: CTS de nov–abr aún no depositada + CTS trunca de mayo", () => {
    const r = calc({ fechaCese: "2026-05-10" });
    expect(montoDe(r, "cts_pendiente")).toBe("1750.00");
    expect(r.conceptos.find((c) => c.id === "cts_pendiente")?.etiqueta).toBe("CTS pendiente (noviembre 2025 – abril 2026)");
    expect(montoDe(r, "cts")).toBe("92.59"); // (3000 + 2000/6) / 360 × 10
    expect(montoDe(r, "gratificacion")).toBe("2000.00"); // 4 meses de ene–jun
  });

  it("cese el 10/07: gratificación de julio trunca con el semestre completo, sin avisos contradictorios", () => {
    const r = calc({ fechaCese: "2026-07-10" });
    expect(r.conceptos.find((c) => c.id === "gratificacion")).toMatchObject({ etiqueta: "Gratificación trunca", monto: "3000.00" });
    expect(r.advertencias.join(" ")).not.toContain("al menos un mes");
  });

  it("vacaciones pendientes + aviso de indemnización vacacional", () => {
    const r = calc({ diasVacacionesPendientes: 15 });
    expect(montoDe(r, "vacaciones_pendientes")).toBe("1500.00");
    expect(r.condiciones.supuestos.at(-1)).toContain("indemnización vacacional");
  });

  it("despido con tope: el supuesto del tope llega a la liquidación", () => {
    const r = calc({ fechaIngreso: "2010-01-01", motivoCese: "despido_arbitrario" });
    expect(montoDe(r, "indemnizacion")).toBe("36000.00");
    expect(r.condiciones.supuestos).toContain("Se aplicó el tope de 12 remuneraciones (S/ 36,000.00).");
  });

  it("despido sin superar el período de prueba: solo el aviso", () => {
    const r = calc({ fechaIngreso: "2026-07-01", motivoCese: "despido_arbitrario" });
    expect(ids(r)).not.toContain("indemnizacion");
    expect(r.advertencias.join(" ")).toContain("período de prueba");
  });

  it("microempresa: solo vacaciones truncas a 15 días por año, con avisos de régimen", () => {
    const r = calc({ regimen: "micro", sueldoBasico: "1500", fechaIngreso: "2025-01-01", fechaCese: "2026-03-31" });
    expect(ids(r)).toEqual(["vacaciones_truncas"]);
    expect(r.total).toBe("187.50");
    expect(r.advertencias.filter((a) => a.includes("microempresa"))).toHaveLength(2);
  });

  it("valida fechas", () => {
    expect(() => calc({ fechaCese: "2023-12-31" })).toThrow(/cese/);
  });
});

describe("liquidación: microempresa", () => {
  it("no menciona indemnización vacacional (no le corresponde) e incluye el requisito del REMYPE", () => {
    const r = calc({ regimen: "micro", sueldoBasico: "1500", fechaIngreso: "2025-01-01", fechaCese: "2026-03-31", diasVacacionesPendientes: 10 });
    expect(r.condiciones.supuestos.join(" ")).not.toContain("indemnización vacacional");
    expect(r.condiciones.requisitos.join(" ")).toContain("REMYPE");
  });
});
