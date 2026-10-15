import { describe, expect, it } from "vitest";
import { calcularVacacionesTruncas, type EntradaVacaciones } from "../src";
import { ctx } from "./helpers";

const calc = (e: EntradaVacaciones) => calcularVacacionesTruncas(e, { ...ctx, fechaReferencia: "2026-08-15" });
const record = (r: ReturnType<typeof calc>) => r.steps.find((s) => s.descripcion === "Récord trunco");

describe("vacaciones truncas", () => {
  it("desde fechas: récord desde el último aniversario", () => {
    const r = calc({ regimen: "general", sueldoBasico: "3000", fechaIngreso: "2024-03-10", fechaCese: "2026-08-24" });
    expect(record(r)).toMatchObject({ formula: "Del 10/03/2026 al 24/08/2026", valor: "5 meses y 15 días" });
    expect(r.total).toBe("1375.00"); // 3000/12×5 + 3000/360×15
    expect(r.condiciones.supuestos).toContain("Se asume que ya gozaste o cobraste las vacaciones de los años completos anteriores.");
  });

  it("menos de un mes de servicios → no corresponde", () => {
    const r = calc({ regimen: "general", sueldoBasico: "3000", fechaIngreso: "2026-08-01", fechaCese: "2026-08-20" });
    expect(r.total).toBe("0.00");
    expect(r.advertencias.join(" ")).toContain("al menos un mes");
  });

  it("cese el día anterior al aniversario → año completo, sin récord trunco", () => {
    const r = calc({ regimen: "general", sueldoBasico: "3000", fechaIngreso: "2025-08-01", fechaCese: "2026-07-31" });
    expect(r.total).toBe("0.00");
    expect(r.advertencias.join(" ")).toContain("No hay récord trunco");
  });

  it("MYPE: 15 días por año", () => {
    const r = calc({ regimen: "micro", remuneracionComputable: "3000", meses: 6 });
    expect(r.total).toBe("750.00");
    expect(r.steps.at(-1)?.formula).toBe("(3000.00 ÷ 12 × 6) × 15/30");
    expect(r.condiciones.requisitos[0]).toBe("Corresponden 30 días de vacaciones por cada año completo de servicios; en la micro y pequeña empresa, 15.");
  });

  it("asignación familiar con la RMV a la fecha de cese", () => {
    const r = calc({ regimen: "general", sueldoBasico: "1500", asignacionFamiliar: true, fechaIngreso: "2026-01-01", fechaCese: "2026-10-31" });
    expect(r.steps[0]?.valor).toBe("1623.00");
    expect(r.condiciones.supuestos.at(-1)).toContain("31/10/2026 (S/ 1,230.00)");
  });

  it("sueldo menor a la RMV → advertencia", () => {
    expect(calc({ regimen: "general", sueldoBasico: "900", meses: 3 }).advertencias[0]).toContain("menor a la remuneración mínima");
  });

  it("valida la entrada y exige una fecha", () => {
    expect(() => calc({ regimen: "general", meses: 3 })).toThrow(/sueldo básico/);
    expect(() => calc({ regimen: "general", sueldoBasico: "3000" })).toThrow(/tiempo trunco/);
    expect(() => calc({ regimen: "general", sueldoBasico: "3000", fechaIngreso: "2026-05-01", fechaCese: "2026-04-01" })).toThrow(/cese/);
    expect(() => calcularVacacionesTruncas({ regimen: "general", remuneracionComputable: "3000", meses: 3 }, ctx)).toThrow(/fecha/);
  });
});
