import { describe, expect, it } from "vitest";
import paramsPe from "../../../config/countries/pe/params.json";
import {
  ParametroNoEncontradoError,
  crearLectorParametros,
  erroresHistorial,
  getParam,
  getParamMeta,
  registrarParametros,
  type EntradaParametro,
  type ParametrosPais,
} from "../src";

registrarParametros(paramsPe as ParametrosPais);

describe("getParam con vigencia (params.json real de Perú)", () => {
  it("RMV al 30/09/2026 = 1130", () => {
    expect(getParam("pe", "rmv", "2026-09-30").toFixed(2)).toBe("1130.00");
  });

  it("RMV al 01/10/2026 = 1230", () => {
    expect(getParam("pe", "rmv", "2026-10-01").toFixed(2)).toBe("1230.00");
  });

  it("acepta Date sin correrse por zona horaria", () => {
    expect(getParam("pe", "rmv", new Date("2026-10-01")).toFixed(2)).toBe("1230.00");
    expect(getParam("pe", "rmv", new Date("2026-09-30")).toFixed(2)).toBe("1130.00");
  });

  it("getParamMeta devuelve fuente y vigencia", () => {
    const meta = getParamMeta("pe", "rmv", "2026-12-15");
    expect(meta).toMatchObject({ clave: "rmv", value: "1230.00", from: "2026-10-01", to: null, verified: true });
    expect(meta.source).toContain("DS 015-2026-TR");
  });

  it("lanza si no hay vigencia en la fecha", () => {
    expect(() => getParam("pe", "rmv", "2024-12-31")).toThrow(ParametroNoEncontradoError);
  });

  it("lanza si el parámetro o el país no existen", () => {
    expect(() => getParam("pe", "no_existe", "2026-10-01")).toThrow(ParametroNoEncontradoError);
    expect(() => getParam("zz", "rmv", "2026-10-01")).toThrow(ParametroNoEncontradoError);
  });

  it("get() rechaza tablas; value() las devuelve tal cual", () => {
    const lector = crearLectorParametros(paramsPe as ParametrosPais);
    expect(() => lector.get("renta5ta_tramos", "2026-01-01")).toThrow(TypeError);
    expect(lector.value<unknown[]>("renta5ta_tramos", "2026-01-01")).toHaveLength(5);
  });
});

describe("erroresHistorial", () => {
  const e = (from: string, to: string | null): EntradaParametro => ({ value: "1", from, to, source: "x" });

  it("acepta un historial continuo", () => {
    expect(erroresHistorial("k", [e("2025-01-01", "2025-12-31"), e("2026-01-01", null)])).toEqual([]);
  });

  it("acepta entradas desordenadas", () => {
    expect(erroresHistorial("k", [e("2026-01-01", null), e("2025-01-01", "2025-12-31")])).toEqual([]);
  });

  it("detecta solapamiento", () => {
    expect(erroresHistorial("k", [e("2025-01-01", "2026-01-15"), e("2026-01-01", null)])[0]).toMatch(/solapamiento/);
  });

  it("detecta hueco", () => {
    expect(erroresHistorial("k", [e("2025-01-01", "2025-11-30"), e("2026-01-01", null)])[0]).toMatch(/hueco/);
  });

  it("detecta to=null que no es la última", () => {
    expect(erroresHistorial("k", [e("2025-01-01", null), e("2026-01-01", null)])[0]).toMatch(/to=null/);
  });

  it("detecta to anterior a from", () => {
    expect(erroresHistorial("k", [e("2025-01-01", "2024-12-31")])[0]).toMatch(/antes de empezar/);
  });

  it("crearLectorParametros rechaza un params con solapamiento", () => {
    const malo: ParametrosPais = {
      country: "xx",
      params: { rmv: { unit: "XXX", history: [e("2025-01-01", "2026-06-30"), e("2026-01-01", null)] } },
    };
    expect(() => crearLectorParametros(malo)).toThrow(/solapamiento/);
  });
});
