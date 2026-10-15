import { describe, expect, it } from "vitest";
import { calcularRenta5ta, type EntradaRenta5ta } from "../src";
import { ctx } from "./helpers";

const calc = (e: EntradaRenta5ta) => calcularRenta5ta(e, ctx);
const paso = (r: ReturnType<typeof calc>, d: string) => r.steps.find((s) => s.descripcion === d);

describe("renta de quinta categoría", () => {
  it("proyección desde el sueldo mensual = caso R1, con retención mensual", () => {
    const r = calc({ anio: 2026, sueldoMensual: "5000" });
    expect(r.total).toBe("2886.00");
    expect(paso(r, "Ingresos del año")?.formula).toBe("60000.00 + 10000.00 + 900.00");
    expect(paso(r, "Retención mensual aproximada")?.valor).toBe("240.50");
    expect(r.condiciones.supuestos[1]).toContain("sueldo constante de S/ 5,000.00");
  });

  it("recorre todos los tramos con ingresos altos", () => {
    const r = calc({ anio: 2026, sueldoMensual: "30000" });
    expect(r.total).toBe("80595.00");
    expect(paso(r, "Tramo de más de 45 UIT")?.formula).toBe("139400.00 × 30%");
  });

  it("ingresos bajo la deducción → no paga", () => {
    const r = calc({ anio: 2026, sueldoMensual: "2000" });
    expect(r.total).toBe("0.00");
    expect(r.advertencias[0]).toContain("no superan las 7 UIT");
    expect(paso(r, "Retención mensual aproximada")).toBeUndefined();
  });

  it("deducción adicional limitada a 3 UIT", () => {
    const r = calc({ anio: 2026, remuneracionesAnuales: "60000", gratificaciones: "10000", bonificacionesExtraordinarias: "900", deduccionAdicional: "20000" });
    expect(paso(r, "Deducción por gastos")?.valor).toBe("16500.00");
    expect(r.total).toBe("1272.00");
    expect(r.condiciones.supuestos).toContain("La deducción por gastos se limitó a 3 UIT (S/ 16,500.00).");
  });

  it("usa la UIT del año", () => {
    expect(calc({ anio: 2025, sueldoMensual: "5000" }).total).toBe("3078.00");
  });

  it("requisitos con la escala desde params", () => {
    expect(calc({ anio: 2026, sueldoMensual: "5000" }).condiciones.requisitos[3]).toBe(
      "La escala es progresiva: hasta 5 UIT, 8%; hasta 20 UIT, 14%; hasta 35 UIT, 17%; hasta 45 UIT, 20%; más de 45 UIT, 30%. Cada tasa se aplica solo a la parte de la renta que cae en ese tramo.",
    );
  });

  it("valida la entrada", () => {
    expect(() => calc({ anio: 2026 })).toThrow(/sueldo mensual/);
  });
});
