import { describe, expect, it } from "vitest";
import { calcularIndemnizacion, type EntradaIndemnizacion } from "../src";
import { ctx } from "./helpers";

const calc = (e: EntradaIndemnizacion) => calcularIndemnizacion(e, { ...ctx, fechaReferencia: "2026-08-15" });

describe("indemnización por despido arbitrario", () => {
  it("desde fechas, con la base armada desde el sueldo", () => {
    const r = calc({ regimen: "general", sueldoBasico: "2500", asignacionFamiliar: true, fechaIngreso: "2023-03-01", fechaCese: "2026-08-20" });
    expect(r.steps[1]).toMatchObject({ descripcion: "Tiempo de servicios", valor: "3 años, 5 meses y 20 días" });
    expect(r.total).toBe("13609.38");
    expect(r.steps.at(-1)?.formula).toBe("3919.50 × 3 + 3919.50 ÷ 12 × 5 + 3919.50 ÷ 360 × 20");
  });

  it("sin superar el período de prueba → no corresponde", () => {
    const r = calc({ regimen: "general", sueldoBasico: "3000", fechaIngreso: "2026-06-01", fechaCese: "2026-08-15" });
    expect(r.total).toBe("0.00");
    expect(r.advertencias[0]).toContain("período de prueba de 3 meses");
    expect(r.parametrosUsados.map((p) => p.clave)).toContain("periodo_prueba_meses");
  });

  it("tope de 12 remuneraciones", () => {
    const r = calc({ regimen: "general", remuneracionComputable: "3000", anios: 10 });
    expect(r.total).toBe("36000.00");
    expect(r.steps.at(-1)).toMatchObject({ descripcion: "Se aplica el tope", formula: "12 × 3000.00" });
    expect(r.condiciones.supuestos.at(-1)).toBe("Se aplicó el tope de 12 remuneraciones (S/ 36,000.00).");
  });

  it("pequeña empresa: 20 remuneraciones diarias por año", () => {
    const r = calc({ regimen: "pequena", remuneracionComputable: "3000", anios: 2 });
    expect(r.total).toBe("4000.00");
    expect(r.steps[2]?.formula).toBe("3000.00 ÷ 30 × 20");
  });

  it("microempresa: tope de 90 remuneraciones diarias", () => {
    expect(calc({ regimen: "micro", remuneracionComputable: "3000", anios: 10 }).total).toBe("9000.00");
  });

  it("plazo fijo: 1.5 remuneraciones por mes pendiente, días por treintavos", () => {
    const r = calc({
      regimen: "general",
      tipoContrato: "plazo_fijo",
      remuneracionComputable: "3000",
      anios: 1,
      fechaCese: "2026-08-15",
      fechaFinContrato: "2026-12-31",
    });
    expect(r.steps.find((s) => s.descripcion === "Tiempo que faltaba del contrato")?.valor).toBe("4 meses y 16 días");
    expect(r.total).toBe("20400.00"); // 4500 × 4 + 4500 ÷ 30 × 16
  });

  it("plazo fijo con tope", () => {
    const r = calc({
      regimen: "general",
      tipoContrato: "plazo_fijo",
      remuneracionComputable: "3000",
      anios: 1,
      fechaCese: "2026-08-15",
      fechaFinContrato: "2027-12-31",
    });
    expect(r.total).toBe("36000.00");
  });

  it("plazo fijo en MYPE: aviso de no disponible", () => {
    const r = calc({
      regimen: "pequena",
      tipoContrato: "plazo_fijo",
      remuneracionComputable: "3000",
      anios: 1,
      fechaCese: "2026-08-15",
      fechaFinContrato: "2026-12-31",
    });
    expect(r.total).toBe("0.00");
    expect(r.advertencias[0]).toContain("aún no está disponible");
  });

  it("condiciones con valores desde params", () => {
    const { requisitos, supuestos } = calc({ regimen: "general", remuneracionComputable: "3000", anios: 2 }).condiciones;
    expect(requisitos[2]).toBe(
      "Contrato indeterminado: 1.5 sueldos por año, con un máximo de 12. En pequeña empresa, 20 remuneraciones diarias por año (máximo 120); en microempresa, 10 (máximo 90).",
    );
    expect(supuestos[1]).toBe("Contrato: indeterminado.");
  });

  it("valida la entrada", () => {
    expect(() => calc({ regimen: "general", anios: 2 })).toThrow(/sueldo básico/);
    expect(() => calc({ regimen: "general", remuneracionComputable: "3000" })).toThrow(/tiempo de servicios/);
    expect(() => calc({ regimen: "general", remuneracionComputable: "3000", anios: 1, tipoContrato: "plazo_fijo" })).toThrow(/plazo fijo/);
    expect(() =>
      calc({ regimen: "general", remuneracionComputable: "3000", anios: 1, tipoContrato: "plazo_fijo", fechaCese: "2026-08-15", fechaFinContrato: "2026-08-01" }),
    ).toThrow(/fin del contrato/);
    expect(() => calc({ regimen: "general", sueldoBasico: "3000", fechaIngreso: "2026-05-01", fechaCese: "2026-04-01" })).toThrow(/cese/);
    expect(() => calcularIndemnizacion({ regimen: "general", remuneracionComputable: "3000", anios: 2 }, ctx)).toThrow(/fecha/);
  });
});
