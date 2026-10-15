import { describe, expect, it } from "vitest";
import { compararFechas, mesesYDiasCompletos, sumarDias, toFechaISO } from "../src";

describe("toFechaISO", () => {
  it("valida formato y fechas inexistentes", () => {
    expect(toFechaISO("2026-02-28")).toBe("2026-02-28");
    expect(() => toFechaISO("2026-02-29")).toThrow(RangeError);
    expect(() => toFechaISO("01/10/2026")).toThrow(RangeError);
    expect(() => toFechaISO(new Date("x"))).toThrow(RangeError);
  });

  it("sumarDias y compararFechas cruzan meses y años", () => {
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(sumarDias("2028-02-28", 1)).toBe("2028-02-29");
    expect(compararFechas("2026-09-30", "2026-10-01")).toBeLessThan(0);
  });
});

describe("mesesYDiasCompletos (ambas fechas inclusive)", () => {
  it.each([
    ["2026-01-01", "2026-06-30", 6, 0],
    ["2026-03-15", "2026-06-30", 3, 16],
    ["2026-01-01", "2026-01-01", 0, 1],
    ["2026-01-01", "2026-01-31", 1, 0],
    ["2026-02-01", "2026-02-28", 1, 0],
    ["2026-11-01", "2027-04-30", 6, 0],
    ["2025-12-15", "2026-08-29", 8, 15],
    ["2024-05-20", "2026-08-19", 27, 0],
    ["2026-01-31", "2026-02-27", 0, 28],
    ["2026-01-31", "2026-02-28", 1, 0],
  ])("%s → %s = %i meses %i días", (desde, hasta, meses, dias) => {
    expect(mesesYDiasCompletos(desde, hasta)).toEqual({ meses, dias });
  });

  it("lanza si la fecha final es anterior", () => {
    expect(() => mesesYDiasCompletos("2026-06-30", "2026-01-01")).toThrow(RangeError);
  });
});
