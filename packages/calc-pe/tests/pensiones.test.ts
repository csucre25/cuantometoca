import { describe, expect, it } from "vitest";
import { crearLectorParametros, type ParametrosPais } from "@calc/core";
import paramsPe from "../../../config/countries/pe/params.json";
import { calcularSueldoNeto, type Contexto, type EntradaSueldoNeto } from "../src";
import { ctx as ctxReal } from "./helpers";

// Valores AFP FICTICIOS (redondos) para que los tests no dependan de las tasas mensuales de la SBS:
// comisión sobre flujo 2%, comisión mixta 0% sobre flujo y 1% sobre saldo, prima 2%, tope S/ 10,000.
function conAfpFicticia(): ParametrosPais {
  const data = structuredClone(paramsPe) as unknown as ParametrosPais;
  const entrada = (value: unknown) => [{ value, from: "2026-01-01", to: null, source: "ficticio (tests)", verified: false }];
  const afp = { flujo: "0.02", mixta_flujo: "0", mixta_saldo_anual: "0.01" };
  data.params.afp_comisiones!.history = entrada({ habitat: afp, integra: afp, prima: afp, profuturo: null });
  data.params.afp_prima_seguro!.history = entrada("0.02");
  data.params.afp_remuneracion_maxima_asegurable!.history = entrada("10000");
  return data;
}

const ctx: Contexto = { params: crearLectorParametros(conAfpFicticia()), fechaReferencia: "2026-11-15" };
const calc = (e: EntradaSueldoNeto) => calcularSueldoNeto(e, ctx);
const ids = (r: ReturnType<typeof calc>) => r.conceptos.map((c) => c.id);

describe("sueldo neto", () => {
  it("ONP sin renta de quinta", () => {
    const r = calc({ sueldoBasico: "3000", sistema: "onp", incluirRenta5ta: false });
    expect(r.conceptos.map((c) => c.monto)).toEqual(["3000.00", "-390.00"]);
    expect(r.total).toBe("2610.00");
  });

  it("AFP con comisión sobre flujo", () => {
    const r = calc({ sueldoBasico: "3000", sistema: "afp", afp: "integra", incluirRenta5ta: false });
    expect(ids(r)).toEqual(["remuneracion", "afp_aporte", "afp_prima", "afp_comision"]);
    expect(r.total).toBe("2580.00"); // 3000 − 300 − 60 − 60
  });

  it("prima de seguro con tope de remuneración asegurable", () => {
    const r = calc({ sueldoBasico: "12000", sistema: "afp", afp: "habitat", incluirRenta5ta: false });
    expect(r.steps.find((s) => s.descripcion.startsWith("Prima"))?.formula).toBe("10000.00 × 2%");
    expect(r.total).toBe("10360.00"); // 12000 − 1200 − 200 − 240
    expect(r.condiciones.supuestos).toContain("La prima de seguro se calcula sobre el tope de S/ 10,000.00.");
  });

  it("comisión mixta: nada sobre el sueldo, se informa la del saldo", () => {
    const r = calc({ sueldoBasico: "3000", sistema: "afp", afp: "prima", tipoComision: "mixta", incluirRenta5ta: false });
    expect(ids(r)).not.toContain("afp_comision");
    expect(r.total).toBe("2640.00");
    expect(r.condiciones.supuestos[0]).toBe("AFP Prima con comisión mixta: 0% sobre el sueldo y 1% anual sobre tu fondo, que no sale de tu sueldo.");
  });

  it("incluye la retención de quinta (anual ÷ 12)", () => {
    const r = calc({ sueldoBasico: "5000", sistema: "onp" });
    expect(r.steps.at(-1)).toMatchObject({ descripcion: "Renta de quinta categoría", formula: "2886.00 ÷ 12 (impuesto anual estimado)", valor: "240.50" });
    expect(r.total).toBe("4109.50"); // 5000 − 650 − 240.50
  });

  it("sin retención de quinta con sueldo bajo", () => {
    expect(ids(calc({ sueldoBasico: "2000", sistema: "onp" }))).toEqual(["remuneracion", "onp"]);
  });

  it("asignación familiar con la RMV vigente", () => {
    expect(calc({ sueldoBasico: "2000", asignacionFamiliar: true, sistema: "onp", incluirRenta5ta: false }).conceptos[0]?.monto).toBe("2123.00");
  });

  it("condiciones con valores desde params", () => {
    const { requisitos } = calc({ sueldoBasico: "3000", sistema: "onp" }).condiciones;
    expect(requisitos[1]).toBe("AFP: 10% va a tu fondo, más la prima de seguro (2%, sobre un máximo de S/ 10,000.00) y la comisión de tu AFP.");
    expect(requisitos[4]).toBe("EsSalud (9%) lo paga tu empleador; no se descuenta de tu sueldo.");
  });

  it("funciona con los parámetros reales cargados", () => {
    const r = calcularSueldoNeto({ sueldoBasico: "3000", sistema: "afp", afp: "integra", incluirRenta5ta: false }, { ...ctxReal, fechaReferencia: "2026-11-15" });
    expect(r.total).toBe("2612.40"); // 3000 − 300 − 41.10 − 46.50
  });

  it("valida la entrada y la disponibilidad de comisiones", () => {
    expect(() => calc({ sueldoBasico: "3000", sistema: "afp" })).toThrow(/Elige tu AFP/);
    expect(() => calc({ sueldoBasico: "3000", sistema: "afp", afp: "profuturo" })).toThrow(/no están disponibles/);
    expect(() => calcularSueldoNeto({ sueldoBasico: "3000", sistema: "onp" }, ctxReal)).toThrow(/fecha/);
  });
});
