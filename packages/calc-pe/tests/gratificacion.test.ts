import { describe, expect, it } from "vitest";
import { calcularGratificacion, type EntradaGratificacion } from "../src";
import { ctx } from "./helpers";

const base: EntradaGratificacion = {
  periodo: "julio",
  anio: 2026,
  regimen: "general",
  sueldoBasico: "2000",
  asignacionFamiliar: false,
  otrosRegulares: "0",
  seguroSalud: "essalud",
};

const calc = (cambios: Partial<EntradaGratificacion>) => calcularGratificacion({ ...base, ...cambios }, ctx);

describe("gratificación: meses desde fechas", () => {
  it("ingreso el 15/03 en julio → 3 meses (abr–jun)", () => {
    const r = calc({ fechaIngreso: "2026-03-15" });
    expect(r.steps.find((s) => s.descripcion.startsWith("Meses"))?.valor).toBe("3");
    expect(r.total).toBe("1090.00"); // 2000 × 3/6 = 1000 + 9%
  });

  it("ingreso antes del semestre → semestre completo", () => {
    expect(calc({ fechaIngreso: "2024-05-10" }).total).toBe("2180.00");
  });

  it("diciembre sin cese cuenta diciembre como mes completo", () => {
    const r = calc({ periodo: "diciembre", fechaIngreso: "2026-09-01" });
    expect(r.steps.find((s) => s.descripcion.startsWith("Meses"))?.valor).toBe("4");
  });

  it("trunca: cese el 15/06 → 5 meses, etiqueta trunca", () => {
    const r = calc({ fechaIngreso: "2025-01-01", fechaCese: "2026-06-15" });
    expect(r.conceptos[0]).toMatchObject({ etiqueta: "Gratificación trunca", monto: "1666.67" });
    expect(r.total).toBe("1816.67"); // 1666.666… + 150.00
  });

  it("trunca de diciembre usa la RMV a la fecha de cese para la asignación familiar", () => {
    // Cese 30/09/2026: RMV 1130 → asignación 113; 3 meses completos (jul–sep)
    const r = calc({ periodo: "diciembre", asignacionFamiliar: true, fechaIngreso: "2020-01-01", fechaCese: "2026-09-30" });
    expect(r.steps[0]?.valor).toBe("2113.00");
    expect(r.steps.find((s) => s.descripcion.startsWith("Meses"))?.valor).toBe("3");
  });

  it("cese después de la fecha de pago no es trunca", () => {
    const r = calc({ fechaIngreso: "2025-01-01", fechaCese: "2026-07-20" });
    expect(r.conceptos[0]?.etiqueta).toBe("Gratificación");
    expect(r.total).toBe("2180.00");
  });

  it("los meses indicados por el usuario prevalecen sobre las fechas", () => {
    const r = calc({ fechaIngreso: "2026-03-15", mesesCompletos: 6 });
    expect(r.total).toBe("2180.00");
    expect(r.steps.find((s) => s.descripcion.startsWith("Meses"))?.formula).toBe("Indicado por el usuario");
  });

  it("ingreso después del semestre → no corresponde", () => {
    const r = calc({ fechaIngreso: "2026-07-01" });
    expect(r.total).toBe("0.00");
    expect(r.advertencias.join(" ")).toContain("al menos un mes");
  });
});

describe("gratificación: reglas y avisos", () => {
  it("0 meses → no corresponde", () => {
    expect(calc({ mesesCompletos: 0 })).toMatchObject({ total: "0.00", conceptos: [] });
  });

  it("trabajador del hogar: 100%", () => {
    expect(calc({ regimen: "hogar", mesesCompletos: 6 }).total).toBe("2180.00");
  });

  it("sueldo menor a la RMV → advertencia, no bloqueo", () => {
    const r = calc({ sueldoBasico: "1000", mesesCompletos: 6 });
    expect(r.total).toBe("1090.00");
    expect(r.advertencias[0]).toContain("menor a la remuneración mínima");
  });

  it("otros conceptos regulares integran la base", () => {
    const r = calc({ otrosRegulares: "300", mesesCompletos: 6 });
    expect(r.conceptos[0]?.monto).toBe("2300.00");
    expect(r.steps[0]?.formula).toBe("S/ 2,000.00 + S/ 300.00");
  });

  it("desglose, parámetros y base legal", () => {
    const r = calc({ asignacionFamiliar: true, mesesCompletos: 4, periodo: "diciembre" });
    expect(r.steps.map((s) => s.descripcion)).toEqual([
      "Remuneración computable",
      "Meses completos (julio–diciembre 2026)",
      "Gratificación",
      "Bonificación extraordinaria",
    ]);
    expect(r.parametrosUsados.map((p) => p.clave)).toEqual(["rmv", "asignacion_familiar_pct", "bonificacion_extraordinaria_essalud"]);
    expect(r.baseLegal).toEqual(["Ley 27735", "DS 005-2002-TR", "Ley 30334"]);
    expect(r.ajusteRedondeo).toBe(false);
  });

  it("pequeña empresa muestra el factor y su norma", () => {
    const r = calc({ regimen: "pequena", mesesCompletos: 6 });
    expect(r.steps[2]?.formula).toBe("2000.00 × 50%");
    expect(r.baseLegal).toContain("DS 013-2013-PRODUCE");
  });

  it("valida la entrada", () => {
    expect(() => calc({ sueldoBasico: "-5", mesesCompletos: 6 })).toThrow();
    expect(() => calc({ mesesCompletos: 7 })).toThrow();
    expect(() => calc({})).toThrow(/meses completos o la fecha de ingreso/);
    expect(() => calc({ fechaIngreso: "2026-05-01", fechaCese: "2026-04-01" })).toThrow(/cese/);
  });
});

describe("gratificación: condiciones (desplegable)", () => {
  it("requisitos con tasas y fecha de pago desde params", () => {
    const { requisitos } = calc({ mesesCompletos: 6 }).condiciones;
    expect(requisitos.join(" ")).toContain("15 de julio");
    expect(requisitos.join(" ")).toContain("9% con EsSalud o 6.75% con EPS");
  });

  it("supuestos reflejan lo considerado en este cálculo", () => {
    const { supuestos } = calc({
      regimen: "pequena",
      seguroSalud: "eps",
      asignacionFamiliar: true,
      fechaIngreso: "2025-01-01",
      fechaCese: "2026-05-31",
    }).condiciones;
    expect(supuestos).toEqual([
      "Semestre: enero–junio 2026.",
      "Régimen: pequeña empresa (REMYPE) (50% de la gratificación).",
      "Seguro de salud: EPS (bonificación de 6.75%).",
      "Asignación familiar calculada con la remuneración mínima al 31/05/2026 (S/ 1,130.00).",
      "Gratificación trunca por cese el 31/05/2026.",
    ]);
  });

  it("también se devuelven cuando no corresponde", () => {
    const r = calc({ regimen: "micro", mesesCompletos: 6 });
    expect(r.condiciones.supuestos[1]).toBe("Régimen: microempresa (REMYPE).");
  });

  it("diciembre usa el 15 de diciembre", () => {
    expect(calc({ periodo: "diciembre", mesesCompletos: 6 }).condiciones.requisitos[2]).toContain("15 de diciembre");
  });
});
