import { z } from "zod";
import {
  cerrarConceptos,
  dec,
  monto,
  parametroUsado,
  type Decimal,
  type Paso,
  type ResultadoCalculo,
} from "@calc/core";
import { montoSchema, porcentaje, soles, type Contexto } from "./comun";

/*
 * Impuesto a la renta de quinta categoría, cálculo anual (docs/01 §8.2).
 * - TUO LIR (DS 179-2004-EF), art. 34: rentas de quinta categoría (incluye gratificaciones
 *   y bonificación extraordinaria).
 * - Art. 46: deducción fija de 7 UIT y deducción adicional por gastos de hasta 3 UIT.
 * - Art. 53: escala progresiva acumulativa (params: renta5ta_tramos).
 * Retención mensual (docs/decisiones.md, D9): impuesto anual ÷ 12, con sueldo constante.
 */

export const renta5taSchema = z
  .object({
    anio: z.number().int().min(2000).max(2100),
    /** Proyección desde el sueldo mensual (12 sueldos + 2 gratificaciones + bonificación). */
    sueldoMensual: montoSchema.optional(),
    seguroSalud: z.enum(["essalud", "eps"]).default("essalud"),
    remuneracionesAnuales: montoSchema.optional(),
    gratificaciones: montoSchema.default("0"),
    bonificacionesExtraordinarias: montoSchema.default("0"),
    otrosIngresos: montoSchema.default("0"),
    /** Gastos deducibles sustentados (se aplica el tope de params). */
    deduccionAdicional: montoSchema.default("0"),
  })
  .refine((v) => v.sueldoMensual !== undefined || v.remuneracionesAnuales !== undefined, {
    message: "Indica tu sueldo mensual o tus remuneraciones del año",
    path: ["sueldoMensual"],
  });

export type EntradaRenta5ta = z.input<typeof renta5taSchema>;

type Tramo = { hasta_uit: string | null; tasa: string };

export function calcularRenta5ta(entrada: EntradaRenta5ta, ctx: Contexto): ResultadoCalculo {
  const input = renta5taSchema.parse(entrada);
  const fecha = `${input.anio}-12-31`;
  const metaUit = ctx.params.meta<string>("uit", fecha);
  const uit = dec(metaUit.value);
  const metaDed = ctx.params.meta<string>("renta5ta_deduccion_uit", fecha);
  const metaDedAd = ctx.params.meta<string>("renta5ta_deduccion_adicional_max_uit", fecha);
  const metaTramos = ctx.params.meta<Tramo[]>("renta5ta_tramos", fecha);
  const parametrosUsados = [parametroUsado(metaUit), parametroUsado(metaDed), parametroUsado(metaTramos)];
  const supuestos = [`Año ${input.anio}: UIT de ${soles(uit)}.`];
  const steps: Paso[] = [];

  // Ingresos del año: indicados o proyectados desde el sueldo mensual.
  let rem: Decimal;
  let grati: Decimal;
  let bonif: Decimal;
  if (input.sueldoMensual !== undefined) {
    const sueldo = dec(input.sueldoMensual);
    const claveBonif = input.seguroSalud === "eps" ? "bonificacion_extraordinaria_eps" : "bonificacion_extraordinaria_essalud";
    const metaBonif = ctx.params.meta<string>(claveBonif, fecha);
    parametrosUsados.push(parametroUsado(metaBonif));
    rem = sueldo.times(12);
    grati = sueldo.times(2);
    bonif = grati.times(metaBonif.value);
    supuestos.push(
      `Proyección con sueldo constante de ${soles(sueldo)}: 12 sueldos, 2 gratificaciones y bonificación extraordinaria de ${porcentaje(dec(metaBonif.value))}.`,
    );
  } else {
    rem = dec(input.remuneracionesAnuales!);
    grati = dec(input.gratificaciones);
    bonif = dec(input.bonificacionesExtraordinarias);
  }
  const otros = dec(input.otrosIngresos);
  const bruta = rem.plus(grati).plus(bonif).plus(otros);
  const partes = [rem, grati, bonif, otros].filter((x) => !x.isZero()).map(monto);
  steps.push({ descripcion: "Ingresos del año", formula: partes.join(" + "), valor: monto(bruta) });

  const deduccion = uit.times(metaDed.value);
  steps.push({ descripcion: `Deducción de ${metaDed.value} UIT`, formula: `${metaDed.value} × ${monto(uit)}`, valor: monto(deduccion) });

  let adicional = dec(input.deduccionAdicional);
  if (!adicional.isZero()) {
    const topeAd = uit.times(metaDedAd.value);
    parametrosUsados.push(parametroUsado(metaDedAd));
    if (adicional.greaterThan(topeAd)) {
      adicional = topeAd;
      supuestos.push(`La deducción por gastos se limitó a ${metaDedAd.value} UIT (${soles(topeAd)}).`);
    }
    steps.push({ descripcion: "Deducción por gastos", formula: "Indicada por el usuario", valor: monto(adicional) });
  }

  const neta = max0(bruta.minus(deduccion).minus(adicional));
  steps.push({ descripcion: "Renta neta", formula: `${monto(bruta)} − ${monto(deduccion.plus(adicional))}`, valor: monto(neta) });

  // Escala acumulativa: cada tramo grava solo la parte de la renta que cae en él.
  let impuesto = dec(0);
  let desde = dec(0);
  for (const t of metaTramos.value) {
    if (neta.lessThanOrEqualTo(desde)) break;
    const hasta = t.hasta_uit === null ? null : uit.times(t.hasta_uit);
    const enTramo = (hasta === null || neta.lessThan(hasta) ? neta : hasta).minus(desde);
    const parcial = enTramo.times(t.tasa);
    impuesto = impuesto.plus(parcial);
    steps.push({
      descripcion: t.hasta_uit === null ? `Tramo de más de ${desdeUit(desde, uit)} UIT` : `Tramo hasta ${t.hasta_uit} UIT`,
      formula: `${monto(enTramo)} × ${porcentaje(dec(t.tasa))}`,
      valor: monto(parcial),
    });
    if (hasta === null) break;
    desde = hasta;
  }

  const advertencias: string[] = [];
  if (neta.isZero()) {
    advertencias.push(`No pagas impuesto: tus ingresos del año no superan las ${metaDed.value} UIT de deducción.`);
  }
  if (input.sueldoMensual !== undefined && !impuesto.isZero()) {
    steps.push({ descripcion: "Retención mensual aproximada", formula: `${monto(impuesto)} ÷ 12`, valor: monto(impuesto.div(12)) });
  }

  const { conceptos, total, ajusteRedondeo } = cerrarConceptos([
    { id: "impuesto_anual", etiqueta: "Impuesto anual", valor: impuesto },
  ]);

  const escala = metaTramos.value
    .map((t, i, arr) => {
      const tasa = porcentaje(dec(t.tasa));
      if (i === 0) return `hasta ${t.hasta_uit} UIT, ${tasa}`;
      return t.hasta_uit === null ? `más de ${arr[i - 1]!.hasta_uit} UIT, ${tasa}` : `hasta ${t.hasta_uit} UIT, ${tasa}`;
    })
    .join("; ");

  return {
    total,
    moneda: "PEN",
    conceptos,
    steps,
    parametrosUsados,
    advertencias,
    baseLegal: ["TUO de la Ley del Impuesto a la Renta (DS 179-2004-EF)"],
    ajusteRedondeo,
    condiciones: {
      requisitos: [
        "Aplica a los ingresos de quienes trabajan en planilla (rentas de quinta categoría).",
        `Cada año se deducen ${metaDed.value} UIT (${soles(deduccion)} en ${input.anio}); solo pagas por lo que exceda.`,
        `Puedes deducir hasta ${metaDedAd.value} UIT adicionales por gastos sustentados con comprobante electrónico, como alquiler u honorarios.`,
        `La escala es progresiva: ${escala}. Cada tasa se aplica solo a la parte de la renta que cae en ese tramo.`,
        "Las gratificaciones y la bonificación extraordinaria pagan este impuesto; la CTS no.",
        "Tu empleador retiene el impuesto cada mes y regulariza en diciembre.",
      ],
      supuestos,
    },
  };
}

/** Renta neta no negativa. */
function max0(x: Decimal): Decimal {
  return x.isNegative() ? dec(0) : x;
}

function desdeUit(desde: Decimal, uit: Decimal): string {
  return desde.div(uit).toDecimalPlaces(2).toString();
}
