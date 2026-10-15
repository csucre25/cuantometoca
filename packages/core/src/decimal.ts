import DecimalBase from "decimal.js";

// Precisión amplia para los cálculos intermedios; el redondeo a 2 decimales (half-up)
// se aplica solo al final de cada concepto (CLAUDE.md, regla 5).
export const Decimal = DecimalBase.clone({ precision: 40, rounding: DecimalBase.ROUND_HALF_UP });
export type Decimal = InstanceType<typeof Decimal>;

export type DecimalInput = string | number | Decimal;

/** Crea un Decimal. Los montos deben llegar como string; `number` solo para enteros (meses, días). */
export function dec(x: DecimalInput): Decimal {
  if (typeof x === "number" && !Number.isInteger(x)) {
    throw new TypeError(`Número no entero ${x}: usa un string decimal para evitar errores de coma flotante`);
  }
  return new Decimal(x);
}

/** Redondea a 2 decimales, half-up (0.005 → 0.01). */
export function redondear2(x: DecimalInput): Decimal {
  return dec(x).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Monto como string con exactamente 2 decimales, redondeado half-up: "2180.00". */
export function monto(x: DecimalInput): string {
  return redondear2(x).toFixed(2);
}

export function sumar(...xs: DecimalInput[]): Decimal {
  return xs.reduce<Decimal>((acc, x) => acc.plus(dec(x)), new Decimal(0));
}
