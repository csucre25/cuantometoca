import { describe, expect, it } from "vitest";
import { calcularHorasExtras, type EntradaHorasExtras } from "../src";
import { ctx } from "./helpers";

const calc = (e: Partial<EntradaHorasExtras>) =>
  calcularHorasExtras({ sueldoBasico: "2400", horasExtraPorDia: 3, ...e }, { ...ctx, fechaReferencia: "2026-11-15" });

describe("horas extras", () => {
  it("2 h al 25% + 1 h al 35% (caso del roadmap)", () => {
    const r = calc({});
    expect(r.steps.map((s) => [s.descripcion, s.formula, s.valor])).toEqual([
      ["Remuneración computable", "Sueldo básico", "2400.00"],
      ["Valor hora", "2400.00 ÷ 30 ÷ 8", "10.00"],
      ["Hora extra con 25%", "10.00 × 1.25", "12.50"],
      ["Primeras 2 horas (25%)", "12.50 × 2 h", "25.00"],
      ["Hora extra con 35%", "10.00 × 1.35", "13.50"],
      ["Desde la hora 3 (35%)", "13.50 × 1 h", "13.50"],
    ]);
    expect(r.total).toBe("38.50");
  });

  it("solo primer tramo y varios días", () => {
    const r = calc({ horasExtraPorDia: 1.5, dias: 10 });
    expect(r.conceptos).toHaveLength(1);
    expect(r.steps.at(-1)?.formula).toBe("12.50 × 1.5 h × 10 días");
    expect(r.total).toBe("187.50");
  });

  it("jornada distinta y asignación familiar", () => {
    const r = calc({ jornadaHorasDiarias: 6, asignacionFamiliar: true, horasExtraPorDia: 2 });
    // (2400 + 123) ÷ 30 ÷ 6 = 14.0166…; × 1.25 × 2 = 35.04
    expect(r.total).toBe("35.04");
    expect(r.condiciones.supuestos).toContain("Asignación familiar calculada con la remuneración mínima al 15/11/2026 (S/ 1,230.00).");
  });

  it("condiciones con recargos desde params", () => {
    expect(calc({}).condiciones.requisitos[1]).toBe(
      "Las primeras 2 horas extra de cada día se pagan con 25% adicional; desde la siguiente, con 35%.",
    );
    expect(calc({ horasExtraPorDia: 1 }).condiciones.supuestos[1]).toBe("1 hora extra por día durante 1 día.");
  });

  it("valida la entrada y exige una fecha", () => {
    expect(() => calc({ horasExtraPorDia: 0 })).toThrow();
    expect(() => calc({ horasExtraPorDia: 1.3 })).toThrow();
    expect(() => calcularHorasExtras({ sueldoBasico: "2400", horasExtraPorDia: 2 }, ctx)).toThrow(/fecha/);
  });
});
