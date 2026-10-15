import { z } from "zod";
import {
  cerrarConceptos,
  compararFechas,
  dec,
  mesesYDiasCompletos,
  monto,
  sumarDias,
  type Decimal,
  type FechaISO,
  type Paso,
  type ParametroUsado,
  type ResultadoCalculo,
} from "@calc/core";
import {
  NOMBRE_REGIMEN,
  fechaSchema,
  fmtFecha,
  montoSchema,
  regimenSchema,
  remuneracionComputable,
  soles,
  type Contexto,
  type Regimen,
} from "./comun";

/*
 * Indemnización por despido arbitrario (docs/01 §6).
 * - DS 003-97-TR, art. 38: contrato indeterminado, 1.5 remuneraciones ordinarias mensuales por
 *   año completo; fracciones por dozavos y treintavos; tope 12 remuneraciones.
 * - DS 003-97-TR, art. 76: contrato a plazo fijo, 1.5 remuneraciones por cada mes dejado de
 *   laborar hasta el vencimiento; tope 12. Aplica también en MYPE: la escala reducida de la
 *   Ley MYPE es por años de servicio (contratos indeterminados).
 * - DS 003-97-TR, art. 10: protección contra el despido arbitrario superado el período de prueba.
 * - DS 013-2013-PRODUCE: pequeña empresa 20 remuneraciones diarias por año (tope 120); micro 10 (tope 90).
 * Base: sueldo + asignación familiar + regulares, sin sexto de gratificación (docs/decisiones.md, D3).
 */

export const indemnizacionSchema = z
  .object({
    regimen: regimenSchema,
    tipoContrato: z.enum(["indeterminado", "plazo_fijo"]).default("indeterminado"),
    remuneracionComputable: montoSchema.optional(),
    sueldoBasico: montoSchema.optional(),
    asignacionFamiliar: z.boolean().default(false),
    otrosRegulares: montoSchema.default("0"),
    /** Tiempo de servicios indicado a mano. Si se indica, prevalece sobre las fechas. */
    anios: z.number().int().min(0).max(80).optional(),
    meses: z.number().int().min(0).max(11).default(0),
    dias: z.number().int().min(0).max(30).default(0),
    fechaIngreso: fechaSchema.optional(),
    fechaCese: fechaSchema.optional(),
    /** Plazo fijo: vencimiento pactado del contrato. */
    fechaFinContrato: fechaSchema.optional(),
  })
  .refine((v) => v.remuneracionComputable !== undefined || v.sueldoBasico !== undefined, {
    message: "Indica el sueldo básico o la remuneración computable",
    path: ["sueldoBasico"],
  })
  .refine((v) => v.anios !== undefined || (v.fechaIngreso !== undefined && v.fechaCese !== undefined), {
    message: "Indica el tiempo de servicios o las fechas de ingreso y cese",
    path: ["anios"],
  })
  .refine((v) => !v.fechaIngreso || !v.fechaCese || compararFechas(v.fechaCese, v.fechaIngreso) >= 0, {
    message: "La fecha de cese no puede ser anterior a la de ingreso",
    path: ["fechaCese"],
  })
  .refine((v) => v.tipoContrato !== "plazo_fijo" || (v.fechaCese !== undefined && v.fechaFinContrato !== undefined), {
    message: "En contratos a plazo fijo indica la fecha de cese y la de fin del contrato",
    path: ["fechaFinContrato"],
  })
  .refine((v) => !v.fechaCese || !v.fechaFinContrato || compararFechas(v.fechaFinContrato, v.fechaCese) >= 0, {
    message: "La fecha de fin del contrato no puede ser anterior al cese",
    path: ["fechaFinContrato"],
  });

export type EntradaIndemnizacion = z.input<typeof indemnizacionSchema>;

type Indemnizacion = { tipo: "remuneraciones" | "dias"; por_anio: string; tope: string };
type TablaRegimenes = Record<Regimen, { indemnizacion: Indemnizacion }>;

export function calcularIndemnizacion(entrada: EntradaIndemnizacion, ctx: Contexto): ResultadoCalculo {
  const input = indemnizacionSchema.parse(entrada);
  const fechaCorte: FechaISO | undefined = input.fechaCese ?? ctx.fechaReferencia;
  if (!fechaCorte) throw new Error("Falta la fecha de cese o la fecha de referencia del cálculo");

  const advertencias: string[] = [];
  const baseLegal = ["DS 003-97-TR"];
  if (input.regimen === "pequena" || input.regimen === "micro") baseLegal.push("DS 013-2013-PRODUCE");
  const parametrosUsados: ParametroUsado[] = [];
  const steps: Paso[] = [];

  let rc: Decimal;
  if (input.remuneracionComputable !== undefined) {
    rc = dec(input.remuneracionComputable);
    steps.push({ descripcion: "Remuneración computable", formula: "Indicada por el usuario", valor: monto(rc) });
  } else {
    const r = remuneracionComputable(ctx, { ...input, sueldoBasico: input.sueldoBasico! }, fechaCorte);
    rc = r.rc;
    steps.push(r.paso);
    parametrosUsados.push(...r.parametros);
  }

  // Tiempo de servicios
  let anios: number;
  let meses: number;
  let dias: number;
  if (input.anios !== undefined) {
    ({ anios, meses, dias } = input);
  } else {
    const t = mesesYDiasCompletos(input.fechaIngreso!, input.fechaCese!);
    anios = Math.floor(t.meses / 12);
    meses = t.meses % 12;
    dias = t.dias;
  }
  steps.push({
    descripcion: "Tiempo de servicios",
    formula: input.anios !== undefined ? "Indicado por el usuario" : `Del ${fmtFecha(input.fechaIngreso!)} al ${fmtFecha(input.fechaCese!)}`,
    valor: fmtAnios(anios, meses, dias),
  });

  const metaPrueba = ctx.params.meta<string>("periodo_prueba_meses", fechaCorte);
  const mesesPrueba = Number(metaPrueba.value);
  const metaReg = ctx.params.meta<TablaRegimenes>("regimenes", fechaCorte);
  const general = metaReg.value.general.indemnizacion;
  // Plazo fijo: el art. 76 aplica en todos los regímenes, también en MYPE (docs/decisiones.md, D5).
  const regla = input.tipoContrato === "plazo_fijo" ? general : metaReg.value[input.regimen].indemnizacion;
  const pequena = metaReg.value.pequena.indemnizacion;
  const micro = metaReg.value.micro.indemnizacion;

  const supuestos = [
    `Régimen: ${NOMBRE_REGIMEN[input.regimen]}.`,
    `Contrato: ${input.tipoContrato === "plazo_fijo" ? `a plazo fijo hasta el ${fmtFecha(input.fechaFinContrato!)}` : "indeterminado"}.`,
    "La base es tu remuneración mensual ordinaria (sueldo, asignación familiar y conceptos regulares), sin sexto de gratificación.",
  ];
  const condiciones = {
    requisitos: [
      "Corresponde solo si el despido es arbitrario: sin causa justa o sin seguir el procedimiento legal. No aplica en renuncia, mutuo acuerdo ni fin de contrato.",
      `Debes haber superado el período de prueba (${mesesPrueba} meses en general).`,
      `Contrato indeterminado: ${general.por_anio} sueldos por año, con un máximo de ${general.tope}. En pequeña empresa, ${pequena.por_anio} remuneraciones diarias por año (máximo ${pequena.tope}); en microempresa, ${micro.por_anio} (máximo ${micro.tope}).`,
      `Contrato a plazo fijo: ${general.por_anio} sueldos por cada mes que faltaba para el vencimiento, con un máximo de ${general.tope}, en cualquier régimen (también en MYPE).`,
      "No tiene descuentos de AFP, ONP ni renta de quinta categoría.",
    ],
    supuestos,
  };

  const vacio = (motivo: string): ResultadoCalculo => ({
    total: "0.00",
    moneda: "PEN",
    conceptos: [],
    steps,
    parametrosUsados: [...parametrosUsados, { clave: "periodo_prueba_meses", valor: metaPrueba.value, vigenteDesde: metaPrueba.from, fuente: metaPrueba.source }],
    advertencias: [...advertencias, motivo],
    baseLegal,
    ajusteRedondeo: false,
    condiciones,
  });

  if (anios * 12 + meses < mesesPrueba) {
    return vacio(`No corresponde indemnización: no se superó el período de prueba de ${mesesPrueba} meses.`);
  }

  parametrosUsados.push({
    clave: `regimenes.${input.tipoContrato === "plazo_fijo" ? "general" : input.regimen}.indemnizacion`,
    valor: `${regla.por_anio} ${regla.tipo === "dias" ? "remuneraciones diarias" : "remuneraciones"} por ${input.tipoContrato === "plazo_fijo" ? "mes pendiente" : "año"}, tope ${regla.tope}`,
    vigenteDesde: metaReg.from,
    fuente: metaReg.source,
  });

  // Unidad: una remuneración mensual o una diaria (RC / 30) según el régimen.
  const unidad = regla.tipo === "dias" ? rc.div(30) : rc;
  const tope = unidad.times(regla.tope);
  let bruto: Decimal;

  if (input.tipoContrato === "plazo_fijo") {
    const pendiente = mesesYDiasCompletos(sumarDias(input.fechaCese!, 1), input.fechaFinContrato!);
    const porMes = unidad.times(regla.por_anio);
    bruto = porMes.times(pendiente.meses).plus(porMes.div(30).times(pendiente.dias));
    steps.push({
      descripcion: "Tiempo que faltaba del contrato",
      formula: `Del ${fmtFecha(sumarDias(input.fechaCese!, 1))} al ${fmtFecha(input.fechaFinContrato!)}`,
      valor: fmtAnios(0, pendiente.meses, pendiente.dias),
    });
    steps.push({
      descripcion: "Indemnización",
      formula: terminos([[porMes, pendiente.meses, 1], [porMes, pendiente.dias, 30]]),
      valor: monto(bruto),
    });
  } else {
    const porAnio = unidad.times(regla.por_anio);
    bruto = porAnio.times(anios).plus(porAnio.div(12).times(meses)).plus(porAnio.div(360).times(dias));
    steps.push({
      descripcion: "Indemnización por año",
      formula: regla.tipo === "dias" ? `${monto(rc)} ÷ 30 × ${regla.por_anio}` : `${monto(rc)} × ${regla.por_anio}`,
      valor: monto(porAnio),
    });
    steps.push({
      descripcion: "Indemnización",
      formula: terminos([[porAnio, anios, 1], [porAnio, meses, 12], [porAnio, dias, 360]]),
      valor: monto(bruto),
    });
  }

  const conTope = bruto.greaterThan(tope);
  const valor = conTope ? tope : bruto;
  if (conTope) {
    steps.push({ descripcion: "Se aplica el tope", formula: `${regla.tope} × ${monto(unidad)}`, valor: monto(tope) });
    supuestos.push(`Se aplicó el tope de ${regla.tope} ${regla.tipo === "dias" ? "remuneraciones diarias" : "remuneraciones"} (${soles(tope)}).`);
  }

  const { conceptos, total, ajusteRedondeo } = cerrarConceptos([
    { id: "indemnizacion", etiqueta: "Indemnización por despido arbitrario", valor },
  ]);
  return { total, moneda: "PEN", conceptos, steps, parametrosUsados, advertencias, baseLegal, ajusteRedondeo, condiciones };
}

/** "4500.00 × 2 + 4500.00 ÷ 12 × 3", omitiendo los términos en cero. */
function terminos(items: [Decimal, number, number][]): string {
  return items
    .filter(([, n]) => n > 0)
    .map(([base, n, div]) => (div === 1 ? `${monto(base)} × ${n}` : `${monto(base)} ÷ ${div} × ${n}`))
    .join(" + ");
}

export function fmtAnios(anios: number, meses: number, dias: number): string {
  const partes = [];
  if (anios > 0) partes.push(`${anios} ${anios === 1 ? "año" : "años"}`);
  if (meses > 0) partes.push(`${meses} ${meses === 1 ? "mes" : "meses"}`);
  if (dias > 0 || partes.length === 0) partes.push(`${dias} ${dias === 1 ? "día" : "días"}`);
  return partes.length > 1 ? `${partes.slice(0, -1).join(", ")} y ${partes.at(-1)}` : partes[0]!;
}
