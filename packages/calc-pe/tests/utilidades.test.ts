import { describe, expect, it } from "vitest";
import { calcularUtilidades, type EntradaUtilidades } from "../src";
import { ctx } from "./helpers";

const calc = (e: EntradaUtilidades) => calcularUtilidades(e, { ...ctx, fechaReferencia: "2026-04-15" });
const exacto: EntradaUtilidades = {
  modo: "exacto",
  sector: "industrial",
  rentaNeta: "1000000",
  diasTotales: 7300,
  diasTrabajador: 365,
  remuneracionesTotales: "720000",
  remuneracionesTrabajador: "36000",
};

describe("utilidades: modo exacto", () => {
  it("desglose por días y por remuneraciones", () => {
    const r = calc(exacto);
    expect(r.steps.map((s) => s.formula)).toEqual(["1000000.00 × 10%", "50000.00 × 365 ÷ 7300", "50000.00 × 36000.00 ÷ 720000.00"]);
    expect(r.total).toBe("5000.00");
  });

  it("tope de 18 sueldos como concepto de ajuste", () => {
    const r = calc({ ...exacto, remuneracionMensual: "250" }); // tope 4500
    expect(r.conceptos.at(-1)).toMatchObject({ id: "tope", etiqueta: "Tope de 18 sueldos", monto: "-500.00" });
    expect(r.total).toBe("4500.00");
  });

  it("sin tope cuando no se alcanza", () => {
    expect(calc({ ...exacto, remuneracionMensual: "3000" }).conceptos.map((c) => c.id)).toEqual(["por_dias", "por_remuneraciones"]);
  });

  it("20 trabajadores o menos → no corresponde", () => {
    const r = calc({ ...exacto, numeroTrabajadores: 20 });
    expect(r.total).toBe("0.00");
    expect(r.advertencias[0]).toContain("más de 20 trabajadores");
  });

  it("usa el ejercicio para leer los parámetros", () => {
    expect(calcularUtilidades({ ...exacto, ejercicio: 2025 }, ctx).total).toBe("5000.00");
    expect(() => calcularUtilidades(exacto, ctx)).toThrow(/ejercicio/);
  });
});

describe("utilidades: modo estimado", () => {
  const estimado: EntradaUtilidades = { modo: "estimado", sector: "minera", rentaNeta: "5000000", numeroTrabajadores: 100 };

  it("reparto igual entre trabajadores, con aviso de estimación", () => {
    const r = calc(estimado);
    expect(r.total).toBe("4000.00"); // 5M × 8% ÷ 100
    expect(r.advertencias[0]).toContain("estimación");
    expect(r.condiciones.supuestos).toContain("Se asume que tu sueldo es igual al promedio de la empresa.");
  });

  it("ponderado por meses y por sueldo frente al promedio", () => {
    const r = calc({ ...estimado, mesesTrabajados: 6, remuneracionMensual: "6000", sueldoPromedioEmpresa: "3000" });
    // por días: 200000 ÷ 100 × 6/12 = 1000; por remuneraciones: 200000 × 6000×6 ÷ (3000×12×100) = 2000
    expect(r.conceptos.map((c) => c.monto)).toEqual(["1000.00", "2000.00"]);
    expect(r.condiciones.supuestos).toContain("Sueldo promedio en tu empresa: S/ 3,000.00.");
  });

  it("requisitos con porcentajes agrupados desde params", () => {
    expect(calc(estimado).condiciones.requisitos[1]).toBe(
      "Se reparte un porcentaje de la renta neta según la actividad: 10% en pesca, telecomunicaciones e industria; 8% en minería, comercio y restaurantes; 5% en otras actividades.",
    );
  });

  it("valida la entrada", () => {
    expect(() => calc({ modo: "estimado", sector: "minera", rentaNeta: "1000" } as EntradaUtilidades)).toThrow();
  });
});
