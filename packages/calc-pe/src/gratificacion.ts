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
  montoSchema,
  porcentaje,
  soles,
  regimenSchema,
  remuneracionComputable,
  type Contexto,
} from "./comun";

/*
 * Gratificación por Fiestas Patrias y Navidad (docs/01 §3).
 * - Ley 27735, arts. 1–3: una remuneración en julio y otra en diciembre, por los semestres
 *   enero–junio y julio–diciembre; proporcional si no se laboró el semestre completo.
 * - DS 005-2002-TR (reglamento): solo cuentan meses calendario completos; la trunca se
 *   calcula con los meses completos hasta el cese y se paga con la liquidación.
 * - Ley 30334, art. 3: bonificación extraordinaria igual al aporte a EsSalud (9%) o EPS (6.75%).
 * - DS 013-2013-PRODUCE (TUO Ley MYPE): pequeña empresa 50%, microempresa sin gratificación.
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

const MESES_SEMESTRE = 6;

function semestre(periodo: "julio" | "diciembre", anio: number) {
  return periodo === "julio"
    ? { inicio: `${anio}-01-01`, fin: `${anio}-06-30`, pago: `${anio}-07-15`, nombre: `enero–junio ${anio}` }
    : { inicio: `${anio}-07-01`, fin: `${anio}-12-31`, pago: `${anio}-12-15`, nombre: `julio–diciembre ${anio}` };
}

export function calcularGratificacion(entrada: EntradaGratificacion, ctx: Contexto): ResultadoCalculo {
  const input = gratificacionSchema.parse(entrada);
  const sem = semestre(input.periodo, input.anio);
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
      formula: `Del ${desde} al ${hasta}`,
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

  const vacio = (motivo: string): ResultadoCalculo => ({
    total: "0.00",
    moneda: "PEN",
    conceptos: [],
    steps: [pasoMeses],
    parametrosUsados,
    advertencias: [...advertencias, motivo],
    baseLegal,
    ajusteRedondeo: false,
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
  };
}
