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
};

export function parametroUsado(meta: MetaParametro): ParametroUsado {
  return {
    clave: meta.clave,
    valor: typeof meta.value === "string" ? meta.value : JSON.stringify(meta.value),
    vigenteDesde: meta.from,
    fuente: meta.source,
  };
}
