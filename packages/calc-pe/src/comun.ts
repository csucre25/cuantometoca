import { z } from "zod";
import {
  dec,
  monto,
  parametroUsado,
  type Decimal,
  type FechaInput,
  type FechaISO,
  type LectorParametros,
  type Paso,
  type ParametroUsado,
} from "@calc/core";

// Piezas compartidas por las calculadoras de Perú (docs/01 §2).

/**
 * `fechaReferencia`: fecha del cálculo cuando la entrada no trae una propia (ej. vacaciones
 * con meses indicados a mano). La web usa la fecha de hoy; los tests, la del caso dorado.
 */
export type Contexto = { params: LectorParametros; fechaReferencia?: FechaISO };

export const montoSchema = z.string().trim().regex(/^\d+(\.\d+)?$/, "Monto inválido: usa números con punto decimal");
export const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida: usa YYYY-MM-DD");
export const regimenSchema = z.enum(["general", "pequena", "micro", "hogar"]);
export type Regimen = z.infer<typeof regimenSchema>;

export const NOMBRE_REGIMEN: Record<Regimen, string> = {
  general: "régimen general",
  pequena: "pequeña empresa (REMYPE)",
  micro: "microempresa (REMYPE)",
  hogar: "trabajador del hogar",
};

/** Formato de moneda para textos de pasos y advertencias: "S/ 1,230.00". */
export function soles(x: Decimal | string): string {
  const [entero, decimales] = monto(x).split(".");
  return `S/ ${entero!.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${decimales}`;
}

/** Fecha para mostrar al usuario: "2026-07-15" → "15/07/2026". */
export function fmtFecha(iso: FechaISO): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** "07-15" → "15 de julio". */
export function fmtDiaMes(mmdd: string): string {
  const [m, d] = mmdd.split("-");
  return `${Number(d)} de ${MESES[Number(m) - 1]}`;
}

/** "4 meses y 10 días", "1 mes", "15 días". */
export function fmtTiempo(meses: number, dias: number): string {
  const partes = [];
  if (meses > 0) partes.push(`${meses} ${meses === 1 ? "mes" : "meses"}`);
  if (dias > 0 || meses === 0) partes.push(`${dias} ${dias === 1 ? "día" : "días"}`);
  return partes.join(" y ");
}

/** Ratio a porcentaje legible: 0.09 → "9%", 0.0675 → "6.75%". */
export function porcentaje(ratio: Decimal): string {
  return `${ratio.times(100).toDecimalPlaces(2).toString()}%`;
}

type TablaRegimenes = Record<Regimen, Record<string, unknown>>;

/**
 * Condiciones del régimen MYPE (DL 1086; DS 013-2013-PRODUCE): solo aplica si la empresa está
 * inscrita en el REMYPE y el trabajador fue contratado desde la vigencia del DL 1086; si no, rige
 * el régimen general. Devuelve el requisito para "Condiciones" y, si corresponde, una advertencia.
 */
export function condicionMype(
  ctx: Contexto,
  regimen: Regimen,
  fechaIngreso: FechaISO | undefined,
  fecha: FechaInput,
): { requisito?: string; advertencia?: string } {
  if (regimen !== "pequena" && regimen !== "micro") return {};
  const desde = ctx.params.value<string>("regimen_mype_desde", fecha);
  const requisito = `El régimen de la micro y pequeña empresa solo aplica si la empresa está inscrita en el REMYPE y te contrataron desde el ${fmtFecha(desde)}. Si no, te corresponden los beneficios del régimen general.`;
  const advertencia =
    fechaIngreso && fechaIngreso < desde
      ? `Ingresaste antes del ${fmtFecha(desde)}: te corresponden los beneficios del régimen general, no los de la ${NOMBRE_REGIMEN[regimen]}.`
      : undefined;
  return { requisito, advertencia };
}

/** Factor del régimen para un concepto (tabla `regimenes` de params.json). */
export function factorRegimen(
  ctx: Contexto,
  regimen: Regimen,
  concepto: "gratificacion" | "cts",
  fecha: FechaInput,
): { factor: Decimal; parametro: ParametroUsado } {
  const meta = ctx.params.meta<TablaRegimenes>("regimenes", fecha);
  const valor = meta.value[regimen][concepto];
  if (typeof valor !== "string") throw new Error(`regimenes.${regimen}.${concepto} no está definido`);
  return {
    factor: dec(valor),
    parametro: { clave: `regimenes.${regimen}.${concepto}`, valor, vigenteDesde: meta.from, fuente: meta.source },
  };
}

export type EntradaRC = { sueldoBasico: string; asignacionFamiliar: boolean; otrosRegulares: string };

/**
 * Remuneración computable: sueldo básico + asignación familiar + otros conceptos regulares.
 * La asignación familiar es un % de la RMV vigente a `fechaCorte` (Ley 25129, art. 1); no se
 * guarda como parámetro porque depende de la RMV.
 */
export function remuneracionComputable(
  ctx: Contexto,
  entrada: EntradaRC,
  fechaCorte: FechaInput,
): { rc: Decimal; rmv: Decimal; paso: Paso; parametros: ParametroUsado[] } {
  const metaRmv = ctx.params.meta<string>("rmv", fechaCorte);
  const rmv = dec(metaRmv.value);
  const parametros: ParametroUsado[] = [parametroUsado(metaRmv)];

  const sueldo = dec(entrada.sueldoBasico);
  const otros = dec(entrada.otrosRegulares);
  let asignacion = dec(0);
  if (entrada.asignacionFamiliar) {
    const metaPct = ctx.params.meta<string>("asignacion_familiar_pct", fechaCorte);
    asignacion = rmv.times(metaPct.value);
    parametros.push(parametroUsado(metaPct));
  }

  // Solo se muestran los componentes presentes, para que el paso sea fácil de leer.
  const partes: [string, Decimal][] = [["sueldo", sueldo]];
  if (!asignacion.isZero()) partes.push(["asignación familiar", asignacion]);
  if (!otros.isZero()) partes.push(["otros regulares", otros]);
  const rc = sueldo.plus(asignacion).plus(otros);

  return {
    rc,
    rmv,
    parametros,
    paso: {
      descripcion: "Remuneración computable",
      formula: partes.length === 1 ? "Sueldo básico" : partes.map(([, v]) => monto(v)).join(" + "),
      valor: monto(rc),
    },
  };
}
