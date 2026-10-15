import { z } from "zod";
import {
  cerrarConceptos,
  compararFechas,
  dec,
  mesesCalendarioCompletos,
  monto,
  parametroUsado,
  type FechaISO,
  type Paso,
  type ResultadoCalculo,
} from "@calc/core";
import {
  NOMBRE_REGIMEN,
  factorRegimen,
  fechaSchema,
  fmtDiaMes,
  fmtFecha,
  montoSchema,
  porcentaje,
  regimenSchema,
  remuneracionComputable,
  soles,
  type Contexto,
} from "./comun";

/*
 * Gratificación por Fiestas Patrias y Navidad (docs/01 §3).
 * - Ley 27735, arts. 1–3: una remuneración en julio y otra en diciembre, por los semestres
 *   enero–junio y julio–diciembre; proporcional si no se laboró el semestre completo.
 *   Art. 5: se paga en la primera quincena del mes (fecha en params: gratificacion_fechas_pago).
 * - DS 005-2002-TR (reglamento): solo cuentan meses calendario completos; la trunca se
 *   calcula con los meses completos hasta el cese y se paga con la liquidación.
 * - Ley 30334, arts. 1 y 3: la gratificación no está afecta a aportes; bonificación
 *   extraordinaria igual al aporte a EsSalud o EPS (tasas en params).
 * - DS 013-2013-PRODUCE (TUO Ley MYPE): factor por régimen (tabla regimenes en params).
 */

export const gratificacionSchema = z
  .object({
    periodo: z.enum(["julio", "diciembre"]),
    anio: z.number().int().min(2000).max(2100),
    regimen: regimenSchema,
    sueldoBasico: montoSchema,
    asignacionFamiliar: z.boolean().default(false),
    otrosRegulares: montoSchema.default("0"),
    seguroSalud: z.enum(["essalud", "eps"]).default("essalud"),
    /** Meses calendario completos del semestre. Si se indica, prevalece sobre las fechas. */
    mesesCompletos: z.number().int().min(0).max(6).optional(),
    fechaIngreso: fechaSchema.optional(),
    fechaCese: fechaSchema.optional(),
  })
  .refine((v) => v.mesesCompletos !== undefined || v.fechaIngreso !== undefined, {
    message: "Indica los meses completos o la fecha de ingreso",
    path: ["mesesCompletos"],
  })
  .refine((v) => !v.fechaIngreso || !v.fechaCese || compararFechas(v.fechaCese, v.fechaIngreso) >= 0, {
    message: "La fecha de cese no puede ser anterior a la de ingreso",
    path: ["fechaCese"],
  });

export type EntradaGratificacion = z.input<typeof gratificacionSchema>;
export type PeriodoGratificacion = "julio" | "diciembre";

const MESES_SEMESTRE = 6;

function semestre(ctx: Contexto, periodo: PeriodoGratificacion, anio: number) {
  // La vigencia de la fecha de pago se consulta al inicio del semestre.
  const inicio = periodo === "julio" ? `${anio}-01-01` : `${anio}-07-01`;
  const fechasPago = ctx.params.value<Record<PeriodoGratificacion, string>>("gratificacion_fechas_pago", inicio);
  const pagoMMDD = fechasPago[periodo];
  return periodo === "julio"
    ? { inicio, fin: `${anio}-06-30`, pago: `${anio}-${pagoMMDD}`, pagoMMDD, nombre: `enero–junio ${anio}` }
    : { inicio, fin: `${anio}-12-31`, pago: `${anio}-${pagoMMDD}`, pagoMMDD, nombre: `julio–diciembre ${anio}` };
}

export function calcularGratificacion(entrada: EntradaGratificacion, ctx: Contexto): ResultadoCalculo {
  const input = gratificacionSchema.parse(entrada);
  const sem = semestre(ctx, input.periodo, input.anio);
  const advertencias: string[] = [];
  const baseLegal = ["Ley 27735", "DS 005-2002-TR", "Ley 30334"];
  if (input.regimen === "pequena" || input.regimen === "micro") baseLegal.push("DS 013-2013-PRODUCE");

  // Trunca: el cese ocurre antes de la fecha de pago del semestre.
  const trunca = input.fechaCese !== undefined && compararFechas(input.fechaCese, sem.pago) < 0;
  const fechaCorte: FechaISO = trunca ? input.fechaCese! : sem.pago;

  let meses: number;
  let pasoMeses: Paso;
  if (input.mesesCompletos !== undefined) {
    meses = input.mesesCompletos;
    pasoMeses = { descripcion: `Meses completos (${sem.nombre})`, formula: "Indicado por el usuario", valor: String(meses) };
  } else {
    const desde = compararFechas(input.fechaIngreso!, sem.inicio) > 0 ? input.fechaIngreso! : sem.inicio;
    const hasta = trunca && compararFechas(input.fechaCese!, sem.fin) < 0 ? input.fechaCese! : sem.fin;
    meses = compararFechas(hasta, desde) < 0 ? 0 : mesesCalendarioCompletos(desde, hasta);
    pasoMeses = {
      descripcion: `Meses calendario completos (${sem.nombre})`,
      formula: `Del ${fmtFecha(desde)} al ${fmtFecha(hasta)}`,
      valor: String(meses),
    };
  }

  const { rc, rmv, paso: pasoRc, parametros } = remuneracionComputable(ctx, input, fechaCorte);
  const parametrosUsados = [...parametros];
  if (dec(input.sueldoBasico).lessThan(rmv)) {
    advertencias.push(`El sueldo básico es menor a la remuneración mínima vigente (${soles(rmv)}).`);
  }

  const { factor, parametro: paramFactor } = factorRegimen(ctx, input.regimen, "gratificacion", fechaCorte);
  if (!factor.equals(1)) parametrosUsados.push(paramFactor);

  const tasaEssalud = ctx.params.get("bonificacion_extraordinaria_essalud", fechaCorte);
  const tasaEps = ctx.params.get("bonificacion_extraordinaria_eps", fechaCorte);
  const condiciones = condicionesGratificacion({
    sem,
    regimen: input.regimen,
    factor: factor.equals(1) ? "100%" : factor.isZero() ? null : porcentaje(factor),
    seguro: input.seguroSalud === "eps" ? `EPS (bonificación de ${porcentaje(tasaEps)})` : `EsSalud (bonificación de ${porcentaje(tasaEssalud)})`,
    tasas: { essalud: porcentaje(tasaEssalud), eps: porcentaje(tasaEps) },
    asignacion: input.asignacionFamiliar ? `remuneración mínima al ${fmtFecha(fechaCorte)} (${soles(rmv)})` : null,
    trunca: trunca ? fmtFecha(input.fechaCese!) : null,
  });

  const vacio = (motivo: string): ResultadoCalculo => ({
    total: "0.00",
    moneda: "PEN",
    conceptos: [],
    steps: [pasoMeses],
    parametrosUsados,
    advertencias: [...advertencias, motivo],
    baseLegal,
    ajusteRedondeo: false,
    condiciones,
  });

  if (factor.isZero()) {
    return vacio(`En la ${NOMBRE_REGIMEN[input.regimen]} no corresponde gratificación.`);
  }
  if (meses === 0) {
    return vacio("No corresponde gratificación: se necesita al menos un mes calendario completo en el semestre.");
  }

  const grati = rc.times(meses).div(MESES_SEMESTRE).times(factor);

  const claveBonif =
    input.seguroSalud === "eps" ? "bonificacion_extraordinaria_eps" : "bonificacion_extraordinaria_essalud";
  const metaBonif = ctx.params.meta<string>(claveBonif, fechaCorte);
  const tasa = dec(metaBonif.value);
  const bonificacion = grati.times(tasa);
  parametrosUsados.push(parametroUsado(metaBonif));

  const { conceptos, total, ajusteRedondeo } = cerrarConceptos([
    { id: "gratificacion", etiqueta: trunca ? "Gratificación trunca" : "Gratificación", valor: grati },
    { id: "bonificacion_extraordinaria", etiqueta: `Bonificación extraordinaria (${porcentaje(tasa)})`, valor: bonificacion },
  ]);

  const formulaGrati = [monto(rc), meses === MESES_SEMESTRE ? null : `${meses}/6`, factor.equals(1) ? null : porcentaje(factor)]
    .filter(Boolean)
    .join(" × ");

  return {
    total,
    moneda: "PEN",
    conceptos,
    steps: [
      pasoRc,
      pasoMeses,
      { descripcion: conceptos[0]!.etiqueta, formula: formulaGrati, valor: monto(grati) },
      {
        descripcion: "Bonificación extraordinaria",
        formula: `${monto(grati)} × ${porcentaje(tasa)} (${input.seguroSalud === "eps" ? "EPS" : "EsSalud"})`,
        valor: monto(bonificacion),
      },
    ],
    parametrosUsados,
    advertencias,
    baseLegal,
    ajusteRedondeo,
    condiciones,
  };
}

function condicionesGratificacion(d: {
  sem: { nombre: string; pagoMMDD: string };
  regimen: keyof typeof NOMBRE_REGIMEN;
  factor: string | null;
  seguro: string;
  tasas: { essalud: string; eps: string };
  asignacion: string | null;
  trunca: string | null;
}): ResultadoCalculo["condiciones"] {
  const requisitos = [
    "Trabajar en planilla, a tiempo completo o parcial.",
    "Haber laborado al menos un mes calendario completo en el semestre; los días sueltos no se pagan.",
    `Estar trabajando al ${fmtDiaMes(d.sem.pagoMMDD)}, fecha límite de pago. Si cesaste antes, te corresponde la gratificación trunca, que se paga con tu liquidación.`,
    `Se suma una bonificación extraordinaria igual al aporte de salud que el empleador no paga sobre la gratificación: ${d.tasas.essalud} con EsSalud o ${d.tasas.eps} con EPS.`,
    "La gratificación y la bonificación no tienen descuentos de AFP, ONP ni EsSalud.",
    "En la microempresa no corresponde gratificación; en la pequeña empresa corresponde la mitad.",
  ];
  const supuestos = [
    `Semestre: ${d.sem.nombre}.`,
    `Régimen: ${NOMBRE_REGIMEN[d.regimen]}${d.factor ? ` (${d.factor} de la gratificación)` : ""}.`,
    `Seguro de salud: ${d.seguro}.`,
  ];
  if (d.asignacion) supuestos.push(`Asignación familiar calculada con la ${d.asignacion}.`);
  if (d.trunca) supuestos.push(`Gratificación trunca por cese el ${d.trunca}.`);
  return { requisitos, supuestos };
}
