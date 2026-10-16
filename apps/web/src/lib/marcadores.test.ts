import { describe, expect, it } from "vitest";
import { resolverMarcadores } from "./marcadores";

const op = { country: "pe", hoy: "2026-11-15", moneda: { locale: "es-PE", codigo: "PEN", simbolo: "S/" } };
// El formato de moneda usa espacio no separable entre "S/" y el número; se normaliza para comparar.
const r = (t: string) => resolverMarcadores(t, op).replace(/\u00a0/g, " ");

describe("marcadores editoriales", () => {
  it("calcula con el motor (caso G1) y devuelve un concepto", () => {
    expect(r("Te tocan {{calc:gratificacion sueldo=2000 meses=6 periodo=julio anio=2026}}.")).toBe("Te tocan S/ 2,180.00.");
    expect(r("{{calc:gratificacion sueldo=2000 meses=6 periodo=julio anio=2026 campo=bonificacion_extraordinaria}}")).toBe("S/ 180.00");
  });

  it("lee parámetros vigentes con su formato", () => {
    expect(r("{{param:rmv}}")).toBe("S/ 1,230.00");
    expect(r("{{param:bonificacion_extraordinaria_essalud}}")).toBe("9%");
    expect(r("{{param:gratificacion_fechas_pago.diciembre}}")).toBe("15 de diciembre");
    expect(r("{{param:cts_jornada_minima_horas}}")).toBe("4");
  });

  it("formatea montos de entrada", () => {
    expect(r("Con {{monto:1500}} al mes")).toBe("Con S/ 1,500 al mes");
  });

  it("falla ante marcadores inválidos en vez de publicar un número equivocado", () => {
    expect(() => r("{{calc:no_existe sueldo=1}}")).toThrow(/no existe/);
    expect(() => r("{{calc:gratificacion sueldo=2000 meses=6 campo=xyz}}")).toThrow(/concepto "xyz"/);
    expect(() => r("{{calc:gratificacion sueldo=abc meses=6}}")).toThrow(/Marcador inválido/);
    expect(() => r("{{param:no_existe}}")).toThrow(/no existe/);
    expect(() => r("{{param:afp_comisiones}}")).toThrow(/no es un valor simple/);
  });

  it("deja intacto el texto sin marcadores", () => {
    expect(r("Texto normal { con llaves }")).toBe("Texto normal { con llaves }");
  });
});
