import { describe, expect, it } from "vitest";
import { dec, monto, redondear2, sumar } from "../src";

describe("utilidades Decimal", () => {
  it("redondea half-up a 2 decimales", () => {
    expect(monto("1.005")).toBe("1.01");
    expect(monto("2.675")).toBe("2.68"); // en float sería 2.67
    expect(monto("1415.3333333")).toBe("1415.33");
    expect(monto("127.38")).toBe("127.38");
    expect(monto("0")).toBe("0.00");
  });

  it("no acumula error de coma flotante", () => {
    expect(sumar("0.1", "0.2").toFixed(2)).toBe("0.30");
    expect(sumar("0.1", "0.2").eq(dec("0.3"))).toBe(true);
  });

  it("mantiene precisión completa hasta el redondeo final", () => {
    // G3: 2123 × 4/6 = 1415.333…; bonificación 9% sobre el valor sin redondear
    const grati = dec("2123").times(4).div(6);
    expect(monto(grati.times("0.09"))).toBe("127.38");
    expect(redondear2(grati).toFixed(2)).toBe("1415.33");
  });

  it("rechaza números no enteros", () => {
    expect(() => dec(0.1)).toThrow(TypeError);
    expect(dec(6).toString()).toBe("6");
  });
});
