import { z } from "zod";
import {
  cerrarConceptos,
  compararFechas,
  dec,
  monto,
  type Decimal,
  type Paso,
  type ParametroUsado,
  type ResultadoCalculo,
} from "@calc/core";
import {
  NOMBRE_REGIMEN,
  condicionMype,
  fechaSchema,
  montoSchema,
  regimenSchema,
  remuneracionComputable,
  type Contexto,
} from "./comun";
import { calcularCts } from "./cts";
import { calcularGratificacion } from "./gratificacion";
import { calcularIndemnizacion } from "./indemnizacion";
import { calcularVacacionesTruncas } from "./vacaciones";

/*
 * Liquidación de beneficios sociales al cese (docs/01 §6). Reúne, con una sola implementación
 * por concepto: CTS trunca (DS 001-97-TR), gratificación trunca y bonificación (Ley 27735,
 * DS 005-2002-TR, Ley 30334), vacaciones truncas y pendientes (DL 713), indemnización por
 * despido arbitrario (DS 003-97-TR arts. 38 y 76) y remuneración de los días del último mes.
 * Supuesto (docs/decisiones.md, D6): los periodos ya vencidos antes del cese se pagaron.
 */

export const liquidacionSchema = z
  .object({
    regimen: regimenSchema,
    sueldoBasico: montoSchema,
    asignacionFamiliar: z.boolean().default(false),
    otrosRegulares: montoSchema.default("0"),
    seguroSalud: z.enum(["essalud", "eps"]).default("essalud"),
    jornadaHorasDiarias: z.number().positive().max(24).default(8),
    fechaIngreso: fechaSchema,
    fechaCese: fechaSchema,
    motivoCese: z.enum(["renuncia", "despido_arbitrario", "fin_contrato", "mutuo_disenso"]),
    tipoContrato: z.enum(["indeterminado", "plazo_fijo"]).default("indeterminado"),
    fechaFinContrato: fechaSchema.optional(),
    diasVacacionesPendientes: z.number().int().min(0).max(365).default(0),
    diasLaboradosUltimoMes: z.number().int().min(0).max(31).default(0),
  })
  .refine((v) => compararFechas(v.fechaCese, v.fechaIngreso) >= 0, {
    message: "La fecha de cese no puede ser anterior a la de ingreso",
    path: ["fechaCese"],
  });

export type EntradaLiquidacion = z.input<typeof liquidacionSchema>;

const NOMBRE_MOTIVO = {
  renuncia: "renuncia",
  despido_arbitrario: "despido arbitrario",
  fin_contrato: "fin de contrato",
  mutuo_disenso: "mutuo acuerdo",
} as const;

// Ruido que no aporta en la liquidación (periodos sin tiempo computable).
const ADVERTENCIAS_OMITIDAS = new Set(["No hay tiempo computable en el periodo."]);

type Item = { id: string; etiqueta: string; valor: Decimal; pasos: Paso[] };

export function calcularLiquidacion(entrada: EntradaLiquidacion, ctx: Contexto): ResultadoCalculo {
  const input = liquidacionSchema.parse(entrada);
  const cese = input.fechaCese;
  const anio = Number(cese.slice(0, 4));
  const comunes = {
    regimen: input.regimen,
    sueldoBasico: input.sueldoBasico,
    asignacionFamiliar: input.asignacionFamiliar,
    otrosRegulares: input.otrosRegulares,
  };
  const fechas = { fechaIngreso: input.fechaIngreso, fechaCese: cese };

  const items: Item[] = [];
  const advertencias = new Set<string>();
  const parametros = new Map<string, ParametroUsado>();
  const supuestosExtra: string[] = [];
  const baseLegal = new Set<string>();

  const absorber = (r: ResultadoCalculo) => {
    r.advertencias.filter((a) => !ADVERTENCIAS_OMITIDAS.has(a)).forEach((a) => advertencias.add(a));
    r.parametrosUsados.forEach((p) => parametros.set(p.clave, p));
    r.baseLegal.forEach((b) => baseLegal.add(b));
  };
  const valorDe = (r: ResultadoCalculo, id: string) => dec(r.conceptos.find((c) => c.id === id)!.valorExacto);

  // CTS: periodos cuyo depósito vence después del cese.
  const deposito = ctx.params.value<Record<"mayo" | "noviembre", string>>("cts_fechas_deposito", cese);
  const periodosCts = [
    { periodo: "mayo" as const, anio, inicio: `${anio - 1}-11-01`, vence: `${anio}-${deposito.mayo}`, nombre: `noviembre ${anio - 1} – abril ${anio}` },
    { periodo: "noviembre" as const, anio, inicio: `${anio}-05-01`, vence: `${anio}-${deposito.noviembre}`, nombre: `mayo – octubre ${anio}` },
    { periodo: "mayo" as const, anio: anio + 1, inicio: `${anio}-11-01`, vence: `${anio + 1}-${deposito.mayo}`, nombre: `noviembre ${anio} – abril ${anio + 1}` },
  ].filter((p) => compararFechas(p.inicio, cese) <= 0 && compararFechas(cese, p.vence) < 0);

  for (const p of periodosCts) {
    const r = calcularCts({ ...comunes, ...fechas, periodo: p.periodo, anio: p.anio, jornadaHorasDiarias: input.jornadaHorasDiarias }, ctx);
    absorber(r);
    if (r.conceptos.length === 0) continue;
    const trunca = r.conceptos[0]!.etiqueta === "CTS trunca";
    items.push({
      id: trunca ? "cts" : "cts_pendiente",
      etiqueta: trunca ? "CTS trunca" : `CTS pendiente (${p.nombre})`,
      valor: valorDe(r, "cts"),
      pasos: r.steps.slice(-1),
    });
    const sup = r.condiciones.supuestos.find((s) => s.startsWith("Gratificación de") || s.startsWith("Se asumió"));
    if (sup) supuestosExtra.push(sup);
  }

  // Gratificación: semestres cuya fecha de pago es posterior al cese.
  const pago = ctx.params.value<Record<"julio" | "diciembre", string>>("gratificacion_fechas_pago", cese);
  const semestres = [
    { periodo: "julio" as const, inicio: `${anio}-01-01`, vence: `${anio}-${pago.julio}` },
    { periodo: "diciembre" as const, inicio: `${anio}-07-01`, vence: `${anio}-${pago.diciembre}` },
  ].filter((s) => compararFechas(s.inicio, cese) <= 0 && compararFechas(cese, s.vence) < 0);

  for (const s of semestres) {
    const r = calcularGratificacion({ ...comunes, ...fechas, periodo: s.periodo, anio, seguroSalud: input.seguroSalud }, ctx);
    // Un semestre sin meses completos no es noticia en la liquidación; el aviso de régimen sí.
    if (r.conceptos.length === 0) {
      if (input.regimen === "micro") absorber(r);
      continue;
    }
    absorber(r);
    for (const [i, c] of r.conceptos.entries()) {
      items.push({ id: c.id, etiqueta: c.etiqueta, valor: dec(c.valorExacto), pasos: [r.steps[2 + i]!] });
    }
  }

  // Vacaciones truncas
  const vac = calcularVacacionesTruncas({ ...comunes, ...fechas }, ctx);
  absorber(vac);
  if (vac.conceptos.length > 0) {
    items.push({ id: "vacaciones_truncas", etiqueta: "Vacaciones truncas", valor: valorDe(vac, "vacaciones_truncas"), pasos: vac.steps.slice(-1) });
  }

  // Vacaciones pendientes y días del último mes: remuneración ÷ 30 × días.
  const { rc } = remuneracionComputable(ctx, comunes, cese);
  const porDias = (id: string, etiqueta: string, dias: number) => {
    if (dias === 0) return;
    const valor = rc.div(30).times(dias);
    items.push({ id, etiqueta, valor, pasos: [{ descripcion: etiqueta, formula: `${monto(rc)} ÷ 30 × ${dias}`, valor: monto(valor) }] });
  };
  porDias("vacaciones_pendientes", "Vacaciones pendientes", input.diasVacacionesPendientes);
  porDias("remuneracion_pendiente", "Días trabajados del último mes", input.diasLaboradosUltimoMes);

  // Indemnización: solo por despido arbitrario.
  if (input.motivoCese === "despido_arbitrario") {
    const r = calcularIndemnizacion(
      { ...comunes, ...fechas, tipoContrato: input.tipoContrato, fechaFinContrato: input.fechaFinContrato },
      ctx,
    );
    absorber(r);
    if (r.conceptos.length > 0) {
      items.push({ id: "indemnizacion", etiqueta: "Indemnización por despido arbitrario", valor: valorDe(r, "indemnizacion"), pasos: r.steps.slice(-1) });
      const tope = r.condiciones.supuestos.find((s) => s.startsWith("Se aplicó el tope"));
      if (tope) supuestosExtra.push(tope);
    }
  }

  const { conceptos, total, ajusteRedondeo } = cerrarConceptos(items);
  const steps: Paso[] = items.flatMap((it) => it.pasos.map((p, i) => (i === 0 && it.pasos.length === 1 ? { ...p, descripcion: it.etiqueta } : p)));

  const supuestos = [
    `Motivo de cese: ${NOMBRE_MOTIVO[input.motivoCese]}.`,
    `Régimen: ${NOMBRE_REGIMEN[input.regimen]}.`,
    "Se asume que te pagaron las CTS y gratificaciones de periodos anteriores.",
    ...supuestosExtra,
  ];
  // La microempresa no tiene indemnización por vacaciones no gozadas (DS 013-2013-PRODUCE).
  if (input.diasVacacionesPendientes > 0 && input.regimen !== "micro") {
    supuestos.push("Si esos días de vacaciones se vencieron sin gozarlos, además te corresponde una indemnización vacacional, que no está incluida en el total.");
  }

  return {
    total,
    moneda: "PEN",
    conceptos,
    steps,
    parametrosUsados: [...parametros.values()],
    advertencias: [...advertencias],
    baseLegal: [...baseLegal],
    ajusteRedondeo,
    condiciones: {
      requisitos: [
        "Al terminar la relación laboral te corresponden la CTS, la gratificación y las vacaciones truncas por el tiempo aún no pagado.",
        "La indemnización solo corresponde por despido arbitrario, superado el período de prueba.",
        "Las vacaciones y la remuneración pendiente están afectas a AFP u ONP y a renta de quinta categoría; aquí se muestran en bruto.",
        ...[condicionMype(ctx, input.regimen, input.fechaIngreso, cese).requisito].filter((r): r is string => Boolean(r)),
      ],
      supuestos,
    },
  };
}

