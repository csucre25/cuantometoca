import { z } from "zod";
import {
  cerrarConceptos,
  compararFechas,
  dec,
  mesesYDiasCompletos,
  monto,
  type Decimal,
  type FechaISO,
  type Paso,
  type ParametroUsado,
  type ResultadoCalculo,
} from "@calc/core";
import {
  NOMBRE_REGIMEN,
  condicionMype,
  fechaSchema,
  fmtFecha,
  fmtTiempo,
  montoSchema,
  regimenSchema,
  remuneracionComputable,
  soles,
  type Contexto,
  type Regimen,
} from "./comun";

/*
 * Vacaciones truncas (docs/01 §5).
 * - DL 713, art. 10: 30 días de descanso por cada año completo de servicios.
 * - DL 713, art. 22 y DS 012-92-TR: al cese sin completar el año, el récord trunco se paga
 *   por dozavos (meses) y treintavos (días), si el trabajador acredita al menos un mes de servicios.
 * - DS 013-2013-PRODUCE: micro y pequeña empresa, 15 días por año (tabla regimenes en params).
 * Es remuneración (afecta a aportes y renta); se muestra el monto bruto (docs/decisiones.md).
 */

export const vacacionesSchema = z
  .object({
    regimen: regimenSchema,
    /** Remuneración computable ya calculada. Alternativa a sueldoBasico + asignación + otros. */
    remuneracionComputable: montoSchema.optional(),
    sueldoBasico: montoSchema.optional(),
    asignacionFamiliar: z.boolean().default(false),
    otrosRegulares: montoSchema.default("0"),
    /** Récord trunco indicado a mano. Si se indica, prevalece sobre las fechas. */
    meses: z.number().int().min(0).max(11).optional(),
    dias: z.number().int().min(0).max(30).default(0),
    fechaIngreso: fechaSchema.optional(),
    fechaCese: fechaSchema.optional(),
  })
  .refine((v) => v.remuneracionComputable !== undefined || v.sueldoBasico !== undefined, {
    message: "Indica el sueldo básico o la remuneración computable",
    path: ["sueldoBasico"],
  })
  .refine((v) => v.meses !== undefined || (v.fechaIngreso !== undefined && v.fechaCese !== undefined), {
    message: "Indica el tiempo trunco o las fechas de ingreso y cese",
    path: ["meses"],
  })
  .refine((v) => !v.fechaIngreso || !v.fechaCese || compararFechas(v.fechaCese, v.fechaIngreso) >= 0, {
    message: "La fecha de cese no puede ser anterior a la de ingreso",
    path: ["fechaCese"],
  });

export type EntradaVacaciones = z.input<typeof vacacionesSchema>;

type TablaRegimenes = Record<Regimen, { vacaciones_dias: string }>;

export function calcularVacacionesTruncas(entrada: EntradaVacaciones, ctx: Contexto): ResultadoCalculo {
  const input = vacacionesSchema.parse(entrada);
  const fechaCorte: FechaISO | undefined = input.fechaCese ?? ctx.fechaReferencia;
  if (!fechaCorte) throw new Error("Falta la fecha de cese o la fecha de referencia del cálculo");

  const advertencias: string[] = [];
  const baseLegal = ["DL 713", "DS 012-92-TR"];
  if (input.regimen === "pequena" || input.regimen === "micro") baseLegal.push("DS 013-2013-PRODUCE");
  const parametrosUsados: ParametroUsado[] = [];
  const steps: Paso[] = [];

  // Remuneración computable: indicada o armada desde el sueldo.
  let rc: Decimal;
  let rmv: Decimal | null = null;
  if (input.remuneracionComputable !== undefined) {
    rc = dec(input.remuneracionComputable);
    steps.push({ descripcion: "Remuneración computable", formula: "Indicada por el usuario", valor: monto(rc) });
  } else {
    const r = remuneracionComputable(ctx, { ...input, sueldoBasico: input.sueldoBasico! }, fechaCorte);
    rc = r.rc;
    rmv = r.rmv;
    steps.push(r.paso);
    parametrosUsados.push(...r.parametros);
    if (dec(input.sueldoBasico!).lessThan(r.rmv)) {
      advertencias.push(`El sueldo básico es menor a la remuneración mínima vigente (${soles(r.rmv)}).`);
    }
  }

  // Días de vacaciones por año según régimen.
  const metaReg = ctx.params.meta<TablaRegimenes>("regimenes", fechaCorte);
  const diasAnio = dec(metaReg.value[input.regimen].vacaciones_dias);
  const diasGeneral = metaReg.value.general.vacaciones_dias;
  const diasMype = metaReg.value.pequena.vacaciones_dias;
  const factor = diasAnio.div(30);
  if (!factor.equals(1)) {
    parametrosUsados.push({
      clave: `regimenes.${input.regimen}.vacaciones_dias`,
      valor: diasAnio.toString(),
      vigenteDesde: metaReg.from,
      fuente: metaReg.source,
    });
  }

  // Récord trunco: indicado, o desde el último aniversario hasta el cese.
  let meses: number;
  let dias: number;
  let menosDeUnMes = false;
  const supuestos = [`Régimen: ${NOMBRE_REGIMEN[input.regimen]} (${diasAnio.toString()} días por año).`];
  if (input.meses !== undefined) {
    meses = input.meses;
    dias = input.dias;
    steps.push({ descripcion: "Récord trunco", formula: "Indicado por el usuario", valor: fmtTiempo(meses, dias) });
  } else {
    const total = mesesYDiasCompletos(input.fechaIngreso!, input.fechaCese!);
    const anios = Math.floor(total.meses / 12);
    meses = total.meses % 12;
    dias = total.dias;
    menosDeUnMes = total.meses === 0;
    const desde = aniversario(input.fechaIngreso!, anios);
    steps.push({
      descripcion: "Récord trunco",
      formula: `Del ${fmtFecha(desde)} al ${fmtFecha(input.fechaCese!)}`,
      valor: fmtTiempo(meses, dias),
    });
    if (anios > 0) {
      supuestos.push("Se asume que ya gozaste o cobraste las vacaciones de los años completos anteriores.");
    }
  }
  if (rmv && input.asignacionFamiliar) {
    supuestos.push(`Asignación familiar calculada con la remuneración mínima al ${fmtFecha(fechaCorte)} (${soles(rmv)}).`);
  }

  const condiciones = {
    requisitos: [
      `Corresponden ${diasGeneral} días de vacaciones por cada año completo de servicios; en la micro y pequeña empresa, ${diasMype}.`,
      "Si cesas antes de completar el año, se paga el récord trunco: un dozavo por cada mes y un treintavo por cada día.",
      "Debes haber trabajado al menos un mes.",
      "Es remuneración: está afecta a AFP u ONP y a renta de quinta categoría. Aquí se muestra el monto bruto.",
    ],
    supuestos,
  };

  const mype = condicionMype(ctx, input.regimen, input.fechaIngreso, fechaCorte);
  if (mype.requisito) condiciones.requisitos.push(mype.requisito);
  if (mype.advertencia) advertencias.push(mype.advertencia);

  const vacio = (motivo: string): ResultadoCalculo => ({
    total: "0.00",
    moneda: "PEN",
    conceptos: [],
    steps,
    parametrosUsados,
    advertencias: [...advertencias, motivo],
    baseLegal,
    ajusteRedondeo: false,
    condiciones,
  });

  if (menosDeUnMes) return vacio("No corresponden vacaciones truncas: se requiere al menos un mes de servicios.");
  if (meses === 0 && dias === 0) return vacio("No hay récord trunco: el cese coincide con el aniversario.");

  const valor = rc.div(12).times(meses).plus(rc.div(360).times(dias)).times(factor);
  const { conceptos, total, ajusteRedondeo } = cerrarConceptos([
    { id: "vacaciones_truncas", etiqueta: "Vacaciones truncas", valor },
  ]);

  let formula = [meses > 0 ? `${monto(rc)} ÷ 12 × ${meses}` : null, dias > 0 ? `${monto(rc)} ÷ 360 × ${dias}` : null]
    .filter(Boolean)
    .join(" + ");
  if (!factor.equals(1)) formula = `(${formula}) × ${diasAnio.toString()}/30`;
  steps.push({ descripcion: "Vacaciones truncas", formula, valor: monto(valor) });

  return { total, moneda: "PEN", conceptos, steps, parametrosUsados, advertencias, baseLegal, ajusteRedondeo, condiciones };
}

/** Fecha del aniversario número `anios` desde el ingreso (29/02 → 28/02 en años no bisiestos). */
function aniversario(ingreso: FechaISO, anios: number): FechaISO {
  const [y, m, d] = ingreso.split("-").map(Number) as [number, number, number];
  const ny = y + anios;
  const ultimo = new Date(Date.UTC(ny, m, 0)).getUTCDate();
  return `${ny}-${String(m).padStart(2, "0")}-${String(Math.min(d, ultimo)).padStart(2, "0")}`;
}
