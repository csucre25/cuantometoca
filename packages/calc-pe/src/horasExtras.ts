import { z } from "zod";
import { cerrarConceptos, dec, monto, parametroUsado, type FechaISO, type ResultadoCalculo } from "@calc/core";
import { fechaSchema, fmtFecha, montoSchema, porcentaje, remuneracionComputable, soles, type Contexto } from "./comun";

/*
 * Horas extras (docs/01 §9).
 * - DS 007-2002-TR (TUO Ley de jornada), art. 9: el sobretiempo es voluntario.
 * - Art. 10: sobretasa mínima de 25% por hora en las dos primeras horas diarias y 35% desde la
 *   tercera (params: horas_extras_recargos); puede compensarse con descanso por acuerdo.
 * - Valor hora = remuneración mensual ÷ 30 ÷ horas de la jornada diaria.
 * Entrada (docs/decisiones.md, D10): horas extra por día × número de días.
 */

export const horasExtrasSchema = z.object({
  sueldoBasico: montoSchema,
  asignacionFamiliar: z.boolean().default(false),
  otrosRegulares: montoSchema.default("0"),
  horasExtraPorDia: z.number().positive().max(16).multipleOf(0.25),
  dias: z.number().int().min(1).max(31).default(1),
  jornadaHorasDiarias: z.number().positive().max(12).default(8),
  fecha: fechaSchema.optional(),
});

export type EntradaHorasExtras = z.input<typeof horasExtrasSchema>;

type Recargos = { horas_primer_tramo: string; primeras_2h: string; desde_3ra_h: string };

export function calcularHorasExtras(entrada: EntradaHorasExtras, ctx: Contexto): ResultadoCalculo {
  const input = horasExtrasSchema.parse(entrada);
  const fecha: FechaISO | undefined = input.fecha ?? ctx.fechaReferencia;
  if (!fecha) throw new Error("Falta la fecha del cálculo");

  const { rc, paso: pasoRc, parametros } = remuneracionComputable(ctx, input, fecha);
  const metaRec = ctx.params.meta<Recargos>("horas_extras_recargos", fecha);
  const limite = dec(metaRec.value.horas_primer_tramo);
  const r1 = dec(metaRec.value.primeras_2h);
  const r2 = dec(metaRec.value.desde_3ra_h);

  const jornada = dec(String(input.jornadaHorasDiarias));
  const horas = dec(String(input.horasExtraPorDia));
  const valorHora = rc.div(30).div(jornada);
  const hora1 = valorHora.times(r1.plus(1));
  const hora2 = valorHora.times(r2.plus(1));
  const h1 = horas.lessThan(limite) ? horas : limite;
  const h2 = horas.minus(h1);
  const tramo1 = hora1.times(h1).times(input.dias);
  const tramo2 = hora2.times(h2).times(input.dias);

  const items = [{ id: "primer_tramo", etiqueta: `Primeras ${limite.toString()} horas (${porcentaje(r1)})`, valor: tramo1 }];
  if (!h2.isZero()) items.push({ id: "segundo_tramo", etiqueta: `Desde la hora ${limite.plus(1).toString()} (${porcentaje(r2)})`, valor: tramo2 });
  const { conceptos, total, ajusteRedondeo } = cerrarConceptos(items);

  const porDias = input.dias === 1 ? "" : ` × ${input.dias} días`;
  const steps = [
    pasoRc,
    { descripcion: "Valor hora", formula: `${monto(rc)} ÷ 30 ÷ ${jornada.toString()}`, valor: monto(valorHora) },
    { descripcion: `Hora extra con ${porcentaje(r1)}`, formula: `${monto(valorHora)} × ${r1.plus(1).toString()}`, valor: monto(hora1) },
    { descripcion: conceptos[0]!.etiqueta, formula: `${monto(hora1)} × ${h1.toString()} h${porDias}`, valor: monto(tramo1) },
  ];
  if (!h2.isZero()) {
    steps.push(
      { descripcion: `Hora extra con ${porcentaje(r2)}`, formula: `${monto(valorHora)} × ${r2.plus(1).toString()}`, valor: monto(hora2) },
      { descripcion: conceptos[1]!.etiqueta, formula: `${monto(hora2)} × ${h2.toString()} h${porDias}`, valor: monto(tramo2) },
    );
  }

  const supuestos = [
    `Jornada de ${jornada.toString()} horas diarias.`,
    `${horas.toString()} ${horas.equals(1) ? "hora extra" : "horas extra"} por día durante ${input.dias} ${input.dias === 1 ? "día" : "días"}.`,
  ];
  if (input.asignacionFamiliar) {
    const rmv = ctx.params.get("rmv", fecha);
    supuestos.push(`Asignación familiar calculada con la remuneración mínima al ${fmtFecha(fecha)} (${soles(rmv)}).`);
  }

  return {
    total,
    moneda: "PEN",
    conceptos,
    steps,
    parametrosUsados: [...parametros, parametroUsado(metaRec)],
    advertencias: [],
    baseLegal: ["DS 007-2002-TR"],
    ajusteRedondeo,
    condiciones: {
      requisitos: [
        "Las horas extra son voluntarias: ni el empleador puede obligarte ni tú exigir hacerlas.",
        `Las primeras ${limite.toString()} horas extra de cada día se pagan con ${porcentaje(r1)} adicional; desde la siguiente, con ${porcentaje(r2)}.`,
        "El valor hora es tu remuneración mensual dividida entre 30 y entre las horas de tu jornada diaria.",
        "Pueden compensarse con descanso si lo acuerdas con tu empleador.",
        "Tienen descuento de AFP u ONP y de renta de quinta categoría; aquí se muestra el monto bruto.",
      ],
      supuestos,
    },
  };
}
