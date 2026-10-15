import { z } from "zod";
import {
  cerrarConceptos,
  dec,
  monto,
  parametroUsado,
  type Decimal,
  type FechaISO,
  type Paso,
  type ResultadoCalculo,
} from "@calc/core";
import { fechaSchema, fmtFecha, montoSchema, porcentaje, remuneracionComputable, soles, type Contexto } from "./comun";
import { calcularRenta5ta } from "./renta5ta";

/*
 * Sueldo neto mensual: pensiones + retención de renta de quinta (docs/01 §8).
 * - ONP: DL 19990, aporte sobre la remuneración (params: onp_tasa).
 * - AFP: TUO Ley del SPP (DS 054-97-EF), aporte obligatorio al fondo, prima de seguro con
 *   tope de remuneración asegurable y comisión de la AFP (params actualizados desde la SBS).
 * - Ley 30334: las gratificaciones de julio y diciembre no están afectas a aportes.
 * - Ley 26790, art. 6: EsSalud lo paga el empleador (solo informativo).
 * - Renta de quinta: impuesto anual ÷ 12 con sueldo constante (docs/decisiones.md, D9).
 */

const afpSchema = z.enum(["habitat", "integra", "prima", "profuturo"]);
type Afp = z.infer<typeof afpSchema>;
const NOMBRE_AFP: Record<Afp, string> = { habitat: "Habitat", integra: "Integra", prima: "Prima", profuturo: "Profuturo" };

export const sueldoNetoSchema = z
  .object({
    sueldoBasico: montoSchema,
    asignacionFamiliar: z.boolean().default(false),
    otrosRegulares: montoSchema.default("0"),
    sistema: z.enum(["afp", "onp"]),
    afp: afpSchema.optional(),
    tipoComision: z.enum(["flujo", "mixta"]).default("flujo"),
    incluirRenta5ta: z.boolean().default(true),
    seguroSalud: z.enum(["essalud", "eps"]).default("essalud"),
    /** Mes del cálculo; si falta, se usa la fecha de referencia del contexto. */
    fecha: fechaSchema.optional(),
  })
  .refine((v) => v.sistema !== "afp" || v.afp !== undefined, { message: "Elige tu AFP", path: ["afp"] });

export type EntradaSueldoNeto = z.input<typeof sueldoNetoSchema>;

type Comisiones = Record<Afp, { flujo: string; mixta_flujo: string; mixta_saldo_anual: string } | null>;

export function calcularSueldoNeto(entrada: EntradaSueldoNeto, ctx: Contexto): ResultadoCalculo {
  const input = sueldoNetoSchema.parse(entrada);
  const fecha: FechaISO | undefined = input.fecha ?? ctx.fechaReferencia;
  if (!fecha) throw new Error("Falta la fecha del cálculo");

  const { rc, paso: pasoRc, parametros } = remuneracionComputable(ctx, input, fecha);
  const parametrosUsados = [...parametros];
  const steps: Paso[] = [{ ...pasoRc, descripcion: "Remuneración bruta" }];
  const descuentos: { id: string; etiqueta: string; valor: Decimal }[] = [];
  const supuestos: string[] = [];

  const metaOnp = ctx.params.meta<string>("onp_tasa", fecha);
  const metaAporte = ctx.params.meta<string>("afp_aporte_obligatorio", fecha);
  const metaPrima = ctx.params.meta<string>("afp_prima_seguro", fecha);
  const metaTope = ctx.params.meta<string>("afp_remuneracion_maxima_asegurable", fecha);
  const essalud = ctx.params.get("essalud_tasa", fecha);
  const descuento = (id: string, etiqueta: string, formula: string, valor: Decimal) => {
    descuentos.push({ id, etiqueta, valor: valor.negated() });
    steps.push({ descripcion: etiqueta, formula, valor: monto(valor) });
  };

  if (input.sistema === "onp") {
    const tasa = dec(metaOnp.value);
    parametrosUsados.push(parametroUsado(metaOnp));
    descuento("onp", `ONP (${porcentaje(tasa)})`, `${monto(rc)} × ${porcentaje(tasa)}`, rc.times(tasa));
    supuestos.push("Sistema de pensiones: ONP.");
  } else {
    const afp = input.afp!;
    const metaCom = ctx.params.meta<Comisiones>("afp_comisiones", fecha);
    const com = metaCom.value[afp];
    if (!com) throw new Error(`Las comisiones de ${NOMBRE_AFP[afp]} no están disponibles`);
    parametrosUsados.push(parametroUsado(metaAporte), parametroUsado(metaPrima), parametroUsado(metaTope), parametroUsado(metaCom));

    const aporte = dec(metaAporte.value);
    descuento("afp_aporte", `Aporte a tu fondo (${porcentaje(aporte)})`, `${monto(rc)} × ${porcentaje(aporte)}`, rc.times(aporte));

    const tope = dec(metaTope.value);
    const basePrima = rc.greaterThan(tope) ? tope : rc;
    const prima = dec(metaPrima.value);
    descuento("afp_prima", `Prima de seguro (${porcentaje(prima)})`, `${monto(basePrima)} × ${porcentaje(prima)}`, basePrima.times(prima));
    if (rc.greaterThan(tope)) supuestos.push(`La prima de seguro se calcula sobre el tope de ${soles(tope)}.`);

    const tasaCom = dec(input.tipoComision === "flujo" ? com.flujo : com.mixta_flujo);
    if (!tasaCom.isZero()) {
      descuento("afp_comision", `Comisión ${NOMBRE_AFP[afp]} (${porcentaje(tasaCom)})`, `${monto(rc)} × ${porcentaje(tasaCom)}`, rc.times(tasaCom));
    }
    supuestos.push(
      input.tipoComision === "flujo"
        ? `AFP ${NOMBRE_AFP[afp]} con comisión sobre el sueldo (${porcentaje(tasaCom)}).`
        : `AFP ${NOMBRE_AFP[afp]} con comisión mixta: ${porcentaje(tasaCom)} sobre el sueldo y ${porcentaje(dec(com.mixta_saldo_anual))} anual sobre tu fondo, que no sale de tu sueldo.`,
    );
    supuestos.push(`Comisiones y prima de seguro vigentes al ${fmtFecha(fecha)}.`);
  }

  if (input.incluirRenta5ta) {
    const anio = Number(fecha.slice(0, 4));
    const renta = calcularRenta5ta({ anio, sueldoMensual: rc.toFixed(), seguroSalud: input.seguroSalud }, ctx);
    const anual = dec(renta.total);
    if (!anual.isZero()) {
      descuento("renta5ta", "Renta de quinta categoría", `${monto(anual)} ÷ 12 (impuesto anual estimado)`, anual.div(12));
      supuestos.push("Retención de quinta estimada con el mismo sueldo todo el año.");
    }
    renta.parametrosUsados.forEach((p) => parametrosUsados.some((q) => q.clave === p.clave) || parametrosUsados.push(p));
  }

  const { conceptos, total, ajusteRedondeo } = cerrarConceptos([
    { id: "remuneracion", etiqueta: "Remuneración bruta", valor: rc },
    ...descuentos,
  ]);

  const deduccion = ctx.params.get("renta5ta_deduccion_uit", fecha);
  return {
    total,
    moneda: "PEN",
    conceptos,
    steps,
    parametrosUsados,
    advertencias: [],
    baseLegal: input.sistema === "onp" ? ["DL 19990", "Ley 30334"] : ["DS 054-97-EF (TUO Ley del SPP)", "Ley 30334"],
    ajusteRedondeo,
    condiciones: {
      requisitos: [
        `ONP: se descuenta el ${porcentaje(dec(metaOnp.value))} de tu remuneración.`,
        `AFP: ${porcentaje(dec(metaAporte.value))} va a tu fondo, más la prima de seguro (${porcentaje(dec(metaPrima.value))}, sobre un máximo de ${soles(metaTope.value)}) y la comisión de tu AFP.`,
        "Con comisión mixta, la parte sobre el saldo se cobra de tu fondo, no de tu sueldo.",
        `La renta de quinta solo se retiene si tus ingresos del año superan ${deduccion.toString()} UIT.`,
        `EsSalud (${porcentaje(essalud)}) lo paga tu empleador; no se descuenta de tu sueldo.`,
        "En julio y diciembre, las gratificaciones no tienen descuento de AFP ni ONP.",
      ],
      supuestos,
    },
  };
}
