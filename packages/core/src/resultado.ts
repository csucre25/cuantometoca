import { monto, sumar, type Decimal } from "./decimal";
import type { MetaParametro } from "./params";

// Salida estándar de toda calculadora (docs/01 §2.4). Montos como string con 2 decimales.

export type Concepto = { id: string; etiqueta: string; monto: string };

export type Paso = { descripcion: string; formula: string; valor: string };

export type ParametroUsado = { clave: string; valor: string; vigenteDesde: string; fuente: string };

export type ResultadoCalculo = {
  total: string;
  moneda: string; // ISO 4217 del país ("PEN")
  conceptos: Concepto[];
  steps: Paso[];
  parametrosUsados: ParametroUsado[];
  advertencias: string[];
  baseLegal: string[];
  /** true si los conceptos mostrados (redondeados) no suman exactamente el total. */
  ajusteRedondeo: boolean;
  /**
   * Texto para el desplegable "Condiciones" (plegado por defecto en la UI):
   * - requisitos: qué se necesita para recibir el beneficio.
   * - supuestos: condiciones concretas consideradas en este cálculo (régimen, periodo, etc.).
   * Los números que aparecen aquí salen de params.json, nunca literales.
   */
  condiciones: { requisitos: string[]; supuestos: string[] };
};

/**
 * Cierra los conceptos de un cálculo: cada monto se redondea para mostrarse, pero el total
 * es el redondeo de la suma sin redondear (docs/decisiones.md), para no acumular errores.
 */
export function cerrarConceptos(items: { id: string; etiqueta: string; valor: Decimal }[]): {
  conceptos: Concepto[];
  total: string;
  ajusteRedondeo: boolean;
} {
  const conceptos = items.map(({ id, etiqueta, valor }) => ({ id, etiqueta, monto: monto(valor) }));
  const total = monto(sumar(...items.map((i) => i.valor)));
  const sumaMostrada = monto(sumar(...conceptos.map((c) => c.monto)));
  return { conceptos, total, ajusteRedondeo: sumaMostrada !== total };
}

export function parametroUsado(meta: MetaParametro): ParametroUsado {
  return {
    clave: meta.clave,
    valor: typeof meta.value === "string" ? meta.value : JSON.stringify(meta.value),
    vigenteDesde: meta.from,
    fuente: meta.source,
  };
}
