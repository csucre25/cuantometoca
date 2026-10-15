import { crearLectorParametros, type ParametrosPais } from "@calc/core";
import type { Contexto } from "@calc/calc-pe";
import params from "../../../../../config/countries/pe/params.json";

// Un solo lector de parámetros para todas las calculadoras de Perú (navegador y build).
const lector = crearLectorParametros(params as unknown as ParametrosPais);

export const contexto = (hoy: string): Contexto => ({ params: lector, fechaReferencia: hoy });

export const paramsPe = params as unknown as ParametrosPais;

/** Valor booleano desde la URL/formulario. */
export const si = (v: string | undefined) => v === "1";

/** Año en curso de una fecha ISO. */
export const anioDe = (hoy: string) => Number(hoy.slice(0, 4));

/** Nombres cortos de parámetros para el desglose (si falta, se usa la descripción de params.json). */
export const ETIQUETAS_PARAMETROS: Record<string, string> = {
  rmv: "Remuneración mínima",
  uit: "UIT",
  asignacion_familiar_pct: "Asignación familiar",
  bonificacion_extraordinaria_essalud: "Bonificación extraordinaria (EsSalud)",
  bonificacion_extraordinaria_eps: "Bonificación extraordinaria (EPS)",
  cts_jornada_minima_horas: "Jornada mínima para CTS (horas)",
  regimenes: "Factor del régimen",
  periodo_prueba_meses: "Período de prueba (meses)",
  onp_tasa: "Aporte ONP",
  afp_aporte_obligatorio: "Aporte al fondo AFP",
  afp_prima_seguro: "Prima de seguro AFP",
  afp_remuneracion_maxima_asegurable: "Tope de remuneración asegurable",
  afp_comisiones: "Comisiones AFP",
  renta5ta_deduccion_uit: "Deducción de renta de quinta (UIT)",
  renta5ta_deduccion_adicional_max_uit: "Deducción adicional máxima (UIT)",
  renta5ta_tramos: "Escala de renta de quinta",
  utilidades_porcentajes: "Porcentaje de utilidades",
  utilidades_tope_remuneraciones: "Tope de utilidades (sueldos)",
  utilidades_min_trabajadores: "Mínimo de trabajadores",
  horas_extras_recargos: "Recargos de horas extras",
};

/** Opciones comunes. */
export const REGIMENES = [
  { valor: "general", etiqueta: "Régimen general" },
  { valor: "pequena", etiqueta: "Pequeña empresa" },
  { valor: "micro", etiqueta: "Microempresa" },
  { valor: "hogar", etiqueta: "Trabajador del hogar" },
];
