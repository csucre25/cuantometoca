import { describe, expect, it } from "vitest";
import { calcularCts, type EntradaCts } from "../src";
import { ctx } from "./helpers";

const base: EntradaCts = {
  periodo: "mayo",
  anio: 2026,
  regimen: "general",
  sueldoBasico: "3000",
  asignacionFamiliar: false,
  otrosRegulares: "0",
};

const calc = (cambios: Partial<EntradaCts>) => calcularCts({ ...base, ...cambios }, ctx);
const paso = (r: ReturnType<typeof calc>, descripcion: string) => r.steps.find((s) => s.descripcion === descripcion);

describe("CTS: tiempo desde fechas", () => {
  it("semestre completo, gratificación de diciembre estimada", () => {
    const r = calc({ fechaIngreso: "2024-01-01" });
    expect(r.total).toBe("1750.00"); // (3000 + 3000/6) / 12 × 6
    expect(r.condiciones.supuestos).toContain(
      "Gratificación de diciembre 2025 estimada en S/ 3,000.00; corrígela si recibiste otro monto.",
    );
  });

  it("ingreso el 15/01: 3 meses y 16 días, sin gratificación previa", () => {
    const r = calc({ fechaIngreso: "2026-01-15" });
    expect(paso(r, "Tiempo computable")).toMatchObject({ formula: "Del 15/01/2026 al 30/04/2026", valor: "3 meses y 16 días" });
    expect(paso(r, "Sexto de gratificación")?.valor).toBe("0.00");
    expect(r.total).toBe("883.33"); // 3000/12×3 + 3000/360×16
  });

  it("trunca: cese el 20/08 en el periodo mayo–octubre", () => {
    const r = calc({ periodo: "noviembre", fechaIngreso: "2020-01-01", fechaCese: "2026-08-20" });
    expect(paso(r, "Tiempo computable")?.valor).toBe("3 meses y 20 días");
    expect(r.conceptos[0]).toMatchObject({ etiqueta: "CTS trunca", monto: "1069.44" }); // 875 + 194.44
    expect(r.condiciones.supuestos).toContain("CTS trunca por cese el 20/08/2026.");
  });

  it("ingreso después del periodo → sin tiempo computable", () => {
    const r = calc({ fechaIngreso: "2026-05-01" });
    expect(r.total).toBe("0.00");
    expect(r.advertencias).toContain("No hay tiempo computable en el periodo.");
  });
});

describe("CTS: reglas", () => {
  it("jornada menor al mínimo → no corresponde", () => {
    const r = calc({ mesesCompletos: 6, jornadaHorasDiarias: 3 });
    expect(r.total).toBe("0.00");
    expect(r.advertencias.join(" ")).toContain("menor a 4 horas");
    expect(r.parametrosUsados.map((p) => p.clave)).toContain("cts_jornada_minima_horas");
  });

  it("asignación familiar con la RMV al cierre del periodo; grati asumida con la RMV de julio", () => {
    const r = calc({ periodo: "noviembre", asignacionFamiliar: true, mesesCompletos: 6 });
    expect(r.steps[0]?.valor).toBe("3123.00"); // RMV 1230 al 31/10/2026
    expect(r.condiciones.supuestos).toContain(
      "Se asumió la gratificación completa de julio 2026 (S/ 3,113.00); corrígela si recibiste otro monto.",
    );
  });

  it("solo días: la fórmula omite los meses", () => {
    const r = calc({ mesesCompletos: 0, diasAdicionales: 15, gratiSemestre: "0" });
    expect(paso(r, "CTS")?.formula).toBe("3000.00 ÷ 360 × 15");
    expect(r.total).toBe("125.00");
  });

  it("pequeña empresa: factor visible en la fórmula", () => {
    const r = calc({ regimen: "pequena", mesesCompletos: 6, gratiSemestre: "1500" });
    expect(paso(r, "CTS")?.formula).toBe("(3250.00 ÷ 12 × 6) × 50%");
    expect(r.baseLegal).toContain("DS 013-2013-PRODUCE");
  });

  it("sueldo menor a la RMV → advertencia", () => {
    expect(calc({ sueldoBasico: "1000", mesesCompletos: 6 }).advertencias[0]).toContain("S/ 1,130.00");
  });

  it("valida la entrada", () => {
    expect(() => calc({ mesesCompletos: 6, diasAdicionales: 5 })).toThrow(/máximo 6 meses/);
    expect(() => calc({})).toThrow(/meses completos o la fecha de ingreso/);
    expect(() => calc({ fechaIngreso: "2026-03-01", fechaCese: "2026-02-01" })).toThrow(/cese/);
  });
});

describe("CTS: condiciones (desplegable)", () => {
  it("requisitos con jornada mínima y fecha de depósito desde params", () => {
    const { requisitos } = calc({ mesesCompletos: 6 }).condiciones;
    expect(requisitos[0]).toBe("Tener una jornada mínima promedio de 4 horas diarias.");
    expect(requisitos[1]).toContain("15 de mayo");
    expect(calc({ periodo: "noviembre", mesesCompletos: 6 }).condiciones.requisitos[1]).toContain("15 de noviembre");
  });

  it("supuestos del cálculo", () => {
    const { supuestos } = calc({ mesesCompletos: 6, gratiSemestre: "3000" }).condiciones;
    expect(supuestos).toEqual([
      "Periodo: noviembre 2025 – abril 2026.",
      "Régimen: régimen general (100% de la CTS).",
      "Jornada: 8 horas diarias.",
      "Gratificación del semestre indicada por el usuario (S/ 3,000.00).",
    ]);
  });
});
