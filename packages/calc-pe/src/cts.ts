import { z } from "zod";
import {
  cerrarConceptos,
  compararFechas,
  dec,
  mesesYDiasCompletos,
  sumarDias,
  monto,
  parametroUsado,
  type Decimal,
  type FechaISO,
  type Paso,
  type ResultadoCalculo,
} from "@calc/core";
import {
  NOMBRE_REGIMEN,
  condicionMype,
  factorRegimen,
  fechaSchema,
  fmtDiaMes,
  fmtFecha,
  fmtTiempo,
  montoSchema,
  porcentaje,
  regimenSchema,
  remuneracionComputable,
  soles,
  type Contexto,
} from "./comun";
import { calcularGratificacion } from "./gratificacion";

/*
 * Compensación por Tiempo de Servicios (docs/01 §4).
 * - DS 001-97-TR (TUO Ley de CTS) y DS 004-97-TR (reglamento).
 * - Art. 4: requiere jornada mínima promedio de 4 horas diarias (params: cts_jornada_minima_horas).
 * - Arts. 9 y 18–19: remuneración computable + 1/6 de la gratificación percibida en el semestre;
 *   la bonificación extraordinaria de la Ley 30334 no la integra.
 * - Arts. 21–22: depósitos semestrales por los periodos noviembre–abril y mayo–octubre, dentro
 *   de los primeros 15 días de mayo y noviembre (params: cts_fechas_deposito); fracciones de
 *   mes por dozavos (meses) y treintavos (días).
 * - DS 013-2013-PRODUCE: pequeña empresa 50% (15 remuneraciones diarias por año) con tope de 90
 *   remuneraciones diarias (params: regimenes.pequena.cts_tope_dias); micro sin CTS. El régimen MYPE
 *   solo aplica con inscripción en el REMYPE y contrato desde la vigencia del DL 1086.
 * Conteo de tiempo: meses por aniversario + días (docs/decisiones.md).
 */

export const ctsSchema = z
  .object({
    periodo: z.enum(["mayo", "noviembre"]),
    anio: z.number().int().min(2000).max(2100),
    regimen: regimenSchema,
    sueldoBasico: montoSchema,
    asignacionFamiliar: z.boolean().default(false),
    otrosRegulares: montoSchema.default("0"),
    /** Gratificación percibida en el semestre. Si no se indica, se estima con el motor. */
    gratiSemestre: montoSchema.optional(),
    /** Tiempo computable del semestre. Si se indica, prevalece sobre las fechas. */
    mesesCompletos: z.number().int().min(0).max(6).optional(),
    diasAdicionales: z.number().int().min(0).max(30).default(0),
    jornadaHorasDiarias: z.number().positive().max(24).default(8),
    fechaIngreso: fechaSchema.optional(),
    fechaCese: fechaSchema.optional(),
  })
  .refine((v) => v.mesesCompletos !== undefined || v.fechaIngreso !== undefined, {
    message: "Indica los meses completos o la fecha de ingreso",
    path: ["mesesCompletos"],
  })
  .refine((v) => v.mesesCompletos !== 6 || v.diasAdicionales === 0, {
    message: "El semestre tiene como máximo 6 meses",
    path: ["diasAdicionales"],
  })
  .refine((v) => !v.fechaIngreso || !v.fechaCese || compararFechas(v.fechaCese, v.fechaIngreso) >= 0, {
    message: "La fecha de cese no puede ser anterior a la de ingreso",
    path: ["fechaCese"],
  });

export type EntradaCts = z.input<typeof ctsSchema>;
type PeriodoCts = "mayo" | "noviembre";

function periodoCts(ctx: Contexto, periodo: PeriodoCts, anio: number) {
  const p =
    periodo === "mayo"
      ? { inicio: `${anio - 1}-11-01`, fin: `${anio}-04-30`, nombre: `noviembre ${anio - 1} – abril ${anio}` }
      : { inicio: `${anio}-05-01`, fin: `${anio}-10-31`, nombre: `mayo – octubre ${anio}` };
  const fechas = ctx.params.value<Record<PeriodoCts, string>>("cts_fechas_deposito", p.inicio);
  return { ...p, depositoMMDD: fechas[periodo] };
}

export function calcularCts(entrada: EntradaCts, ctx: Contexto): ResultadoCalculo {
  const input = ctsSchema.parse(entrada);
  const per = periodoCts(ctx, input.periodo, input.anio);
  const advertencias: string[] = [];
  const baseLegal = ["DS 001-97-TR", "DS 004-97-TR"];
  if (input.regimen === "pequena" || input.regimen === "micro") baseLegal.push("DS 013-2013-PRODUCE");

  // Trunca: el cese ocurre dentro del periodo; se paga con la liquidación, no se deposita.
  const trunca = input.fechaCese !== undefined && compararFechas(input.fechaCese, per.fin) < 0;
  const fechaCorte: FechaISO = trunca ? input.fechaCese! : per.fin;

  // Tiempo computable
  let meses: number;
  let dias: number;
  let formulaTiempo: string;
  if (input.mesesCompletos !== undefined) {
    meses = input.mesesCompletos;
    dias = input.diasAdicionales;
    formulaTiempo = "Indicado por el usuario";
  } else {
    const desde = compararFechas(input.fechaIngreso!, per.inicio) > 0 ? input.fechaIngreso! : per.inicio;
    const hasta = trunca ? input.fechaCese! : per.fin;
    ({ meses, dias } = compararFechas(hasta, desde) < 0 ? { meses: 0, dias: 0 } : mesesYDiasCompletos(desde, hasta));
    formulaTiempo = `Del ${fmtFecha(desde)} al ${fmtFecha(hasta)}`;
  }
  const pasoTiempo: Paso = { descripcion: "Tiempo computable", formula: formulaTiempo, valor: fmtTiempo(meses, dias) };

  const { rc, rmv, paso: pasoRc, parametros } = remuneracionComputable(ctx, input, fechaCorte);
  const parametrosUsados = [...parametros];
  if (dec(input.sueldoBasico).lessThan(rmv)) {
    advertencias.push(`El sueldo básico es menor a la remuneración mínima vigente (${soles(rmv)}).`);
  }

  const metaJornada = ctx.params.meta<string>("cts_jornada_minima_horas", fechaCorte);
  const jornadaMinima = dec(metaJornada.value);
  const { factor, parametro: paramFactor } = factorRegimen(ctx, input.regimen, "cts", fechaCorte);
  if (!factor.equals(1)) parametrosUsados.push(paramFactor);

  // Sexto de gratificación: indicado, o estimado con el motor de gratificación.
  const grati = gratificacionDelSemestre(ctx, input);

  const mype = condicionMype(ctx, input.regimen, input.fechaIngreso, fechaCorte);
  if (mype.advertencia) advertencias.push(mype.advertencia);
  const metaReg = ctx.params.meta<Record<string, { cts_tope_dias?: string }>>("regimenes", fechaCorte);
  const topeDias = metaReg.value[input.regimen]?.cts_tope_dias;

  const condiciones = {
    requisitos: [
      `Tener una jornada mínima promedio de ${jornadaMinima.toString()} horas diarias.`,
      `Se deposita en tu cuenta CTS hasta el ${fmtDiaMes(per.depositoMMDD)}. Si cesas, la CTS trunca se paga directamente con tu liquidación.`,
      "Se calcula por semestre (noviembre–abril para el depósito de mayo y mayo–octubre para el de noviembre): un dozavo por cada mes completo y un treintavo por cada día.",
      "La base incluye un sexto de la gratificación recibida en el semestre; la bonificación extraordinaria no se considera.",
      `En la microempresa no corresponde CTS; en la pequeña empresa corresponde la mitad (15 remuneraciones diarias por año), con un máximo de ${metaReg.value.pequena?.cts_tope_dias} remuneraciones diarias en total.`,
      ...(mype.requisito ? [mype.requisito] : []),
    ],
    supuestos: [
      `Periodo: ${per.nombre}.`,
      `Régimen: ${NOMBRE_REGIMEN[input.regimen]}${factor.isZero() ? "" : ` (${factor.equals(1) ? "100%" : porcentaje(factor)} de la CTS)`}.`,
      `Jornada: ${input.jornadaHorasDiarias} horas diarias.`,
      grati.supuesto,
      ...(input.asignacionFamiliar ? [`Asignación familiar calculada con la remuneración mínima al ${fmtFecha(fechaCorte)} (${soles(rmv)}).`] : []),
      ...(trunca ? [`CTS trunca por cese el ${fmtFecha(input.fechaCese!)}.`] : []),
    ],
  };

  const vacio = (motivo: string): ResultadoCalculo => ({
    total: "0.00",
    moneda: "PEN",
    conceptos: [],
    steps: [pasoTiempo],
    parametrosUsados,
    advertencias: [...advertencias, motivo],
    baseLegal,
    ajusteRedondeo: false,
    condiciones,
  });

  if (factor.isZero()) return vacio(`En la ${NOMBRE_REGIMEN[input.regimen]} no corresponde CTS.`);
  if (dec(input.jornadaHorasDiarias).lessThan(jornadaMinima)) {
    parametrosUsados.push(parametroUsado(metaJornada));
    return vacio(`No corresponde CTS: la jornada promedio es menor a ${jornadaMinima.toString()} horas diarias.`);
  }
  if (meses === 0 && dias === 0) return vacio("No hay tiempo computable en el periodo.");

  const sexto = grati.monto.div(6);
  const base = rc.plus(sexto);
  const porMeses = base.div(12).times(meses);
  const porDias = base.div(360).times(dias);
  let cts = porMeses.plus(porDias).times(factor);
  const pasosTope: Paso[] = [];

  // Tope en remuneraciones diarias (pequeña empresa): lo acumulado desde el ingreso hasta el inicio
  // del periodo limita lo que se puede pagar en este periodo.
  if (topeDias) {
    const tope = dec(topeDias);
    const diasPorMes = factor.times(30).div(12); // 15 rem. diarias por año = 1.25 por mes
    const diasPorDia = factor.times(30).div(360);
    if (input.fechaIngreso) {
      const previo =
        compararFechas(input.fechaIngreso, per.inicio) < 0 ? mesesYDiasCompletos(input.fechaIngreso, sumarDias(per.inicio, -1)) : { meses: 0, dias: 0 };
      const acumulado = diasPorMes.times(previo.meses).plus(diasPorDia.times(previo.dias));
      const restante = tope.minus(acumulado);
      const periodo = diasPorMes.times(meses).plus(diasPorDia.times(dias));
      parametrosUsados.push({ clave: `regimenes.${input.regimen}.cts_tope_dias`, valor: topeDias, vigenteDesde: metaReg.from, fuente: metaReg.source });
      if (!restante.greaterThan(0)) {
        return vacio(`Ya alcanzaste el tope de ${topeDias} remuneraciones diarias de CTS de la pequeña empresa: no corresponden más depósitos.`);
      }
      if (periodo.greaterThan(restante)) {
        cts = base.div(30).times(restante);
        pasosTope.push({
          descripcion: `Tope de ${topeDias} remuneraciones diarias`,
          formula: `${monto(base)} ÷ 30 × (${topeDias} − ${acumulado.toDecimalPlaces(2).toString()} ya acumuladas)`,
          valor: monto(cts),
        });
        advertencias.push(`Con este periodo completas el tope de ${topeDias} remuneraciones diarias de CTS de la pequeña empresa.`);
      }
    } else {
      const anios = tope.div(factor.times(30)).toString();
      advertencias.push(`En la pequeña empresa la CTS tiene un tope de ${topeDias} remuneraciones diarias (unos ${anios} años de servicio). Si llevas ese tiempo o más, ingresa tu fecha de ingreso para aplicarlo.`);
    }
  }

  const { conceptos, total, ajusteRedondeo } = cerrarConceptos([
    { id: "cts", etiqueta: trunca ? "CTS trunca" : "CTS", valor: cts },
  ]);

  const terminos = [
    meses > 0 ? `${monto(base)} ÷ 12 × ${meses}` : null,
    dias > 0 ? `${monto(base)} ÷ 360 × ${dias}` : null,
  ].filter(Boolean);
  let formulaCts = terminos.join(" + ");
  if (!factor.equals(1)) formulaCts = `(${formulaCts}) × ${porcentaje(factor)}`;

  return {
    total,
    moneda: "PEN",
    conceptos,
    steps: [
      pasoRc,
      { descripcion: "Sexto de gratificación", formula: `${monto(grati.monto)} ÷ 6`, valor: monto(sexto) },
      { descripcion: "Base de cálculo", formula: `${monto(rc)} + ${monto(sexto)}`, valor: monto(base) },
      pasoTiempo,
      { descripcion: conceptos[0]!.etiqueta, formula: formulaCts, valor: monto(porMeses.plus(porDias).times(factor)) },
      ...pasosTope,
    ],
    parametrosUsados,
    advertencias,
    baseLegal,
    ajusteRedondeo,
    condiciones,
  };
}

/** Gratificación percibida en el semestre de la CTS: diciembre anterior (mayo) o julio (noviembre). */
function gratificacionDelSemestre(
  ctx: Contexto,
  input: z.output<typeof ctsSchema>,
): { monto: Decimal; supuesto: string } {
  if (input.gratiSemestre !== undefined) {
    return { monto: dec(input.gratiSemestre), supuesto: `Gratificación del semestre indicada por el usuario (${soles(input.gratiSemestre)}).` };
  }
  const g = input.periodo === "mayo" ? { periodo: "diciembre" as const, anio: input.anio - 1 } : { periodo: "julio" as const, anio: input.anio };
  const nombre = `${g.periodo} ${g.anio}`;
  const r = calcularGratificacion(
    {
      ...g,
      regimen: input.regimen,
      sueldoBasico: input.sueldoBasico,
      asignacionFamiliar: input.asignacionFamiliar,
      otrosRegulares: input.otrosRegulares,
      ...(input.fechaIngreso ? { fechaIngreso: input.fechaIngreso, fechaCese: input.fechaCese } : { mesesCompletos: 6 }),
    },
    ctx,
  );
  const montoGrati = dec(r.conceptos.find((c) => c.id === "gratificacion")?.monto ?? "0");
  const supuesto = input.fechaIngreso
    ? `Gratificación de ${nombre} estimada en ${soles(montoGrati)}; corrígela si recibiste otro monto.`
    : `Se asumió la gratificación completa de ${nombre} (${soles(montoGrati)}); corrígela si recibiste otro monto.`;
  return { monto: montoGrati, supuesto };
}
