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
import { montoSchema, porcentaje, soles, type Contexto } from "./comun";

/*
 * Participación en las utilidades (docs/01 §7).
 * - DL 892, art. 2: empresas con más de 20 trabajadores que generan renta de tercera categoría;
 *   porcentaje de la renta neta según actividad (params: utilidades_porcentajes).
 * - DL 892, art. 2 y DS 009-98-TR: 50% en proporción a los días laborados y 50% a las
 *   remuneraciones percibidas en el ejercicio.
 * - DL 892, art. 5: tope individual de 18 remuneraciones mensuales.
 * Modo estimado (docs/decisiones.md, D7): reparto igual entre trabajadores, ponderado por meses
 * trabajados y, si se indica, por el sueldo frente al promedio de la empresa.
 */

const sectorSchema = z.enum(["pesquera", "telecomunicaciones", "industrial", "minera", "comercio_restaurantes", "otras"]);
type Sector = z.infer<typeof sectorSchema>;

const NOMBRE_SECTOR: Record<Sector, string> = {
  pesquera: "pesca",
  telecomunicaciones: "telecomunicaciones",
  industrial: "industria",
  minera: "minería",
  comercio_restaurantes: "comercio y restaurantes",
  otras: "otras actividades",
};

const comunes = {
  sector: sectorSchema,
  rentaNeta: montoSchema,
  /** Ejercicio (año) de las utilidades; si falta, se usa la fecha de referencia del contexto. */
  ejercicio: z.number().int().min(2000).max(2100).optional(),
  /** Sueldo mensual del trabajador, para el tope de 18 remuneraciones. */
  remuneracionMensual: montoSchema.optional(),
};

export const utilidadesSchema = z.discriminatedUnion("modo", [
  z.object({
    modo: z.literal("exacto"),
    ...comunes,
    diasTotales: z.number().int().positive(),
    diasTrabajador: z.number().int().min(0).max(366),
    remuneracionesTotales: montoSchema,
    remuneracionesTrabajador: montoSchema,
    numeroTrabajadores: z.number().int().positive().optional(),
  }),
  z.object({
    modo: z.literal("estimado"),
    ...comunes,
    numeroTrabajadores: z.number().int().positive(),
    mesesTrabajados: z.number().int().min(0).max(12).default(12),
    /** Opcional: con él, la mitad por remuneraciones se pondera con tu sueldo. */
    sueldoPromedioEmpresa: montoSchema.optional(),
  }),
]);

export type EntradaUtilidades = z.input<typeof utilidadesSchema>;

export function calcularUtilidades(entrada: EntradaUtilidades, ctx: Contexto): ResultadoCalculo {
  const input = utilidadesSchema.parse(entrada);
  const fecha: FechaISO | undefined = input.ejercicio ? `${input.ejercicio}-12-31` : ctx.fechaReferencia;
  if (!fecha) throw new Error("Falta el ejercicio o la fecha de referencia del cálculo");

  const metaPct = ctx.params.meta<Record<Sector, string>>("utilidades_porcentajes", fecha);
  const metaTope = ctx.params.meta<string>("utilidades_tope_remuneraciones", fecha);
  const metaMin = ctx.params.meta<string>("utilidades_min_trabajadores", fecha);
  const pct = dec(metaPct.value[input.sector]);
  const parametrosUsados = [
    { clave: `utilidades_porcentajes.${input.sector}`, valor: metaPct.value[input.sector], vigenteDesde: metaPct.from, fuente: metaPct.source },
  ];
  const advertencias: string[] = [];
  const baseLegal = ["DL 892", "DS 009-98-TR"];

  const supuestos = [`Actividad: ${NOMBRE_SECTOR[input.sector]} (${porcentaje(pct)} de la renta neta).`];
  const condiciones = { requisitos: requisitos(metaPct.value, metaMin.value, metaTope.value), supuestos };

  const vacio = (motivo: string): ResultadoCalculo => ({
    total: "0.00",
    moneda: "PEN",
    conceptos: [],
    steps: [],
    parametrosUsados: [...parametrosUsados, parametroUsado(metaMin)],
    advertencias: [...advertencias, motivo],
    baseLegal,
    ajusteRedondeo: false,
    condiciones,
  });

  if (input.numeroTrabajadores !== undefined && dec(input.numeroTrabajadores).lessThanOrEqualTo(metaMin.value)) {
    return vacio(`No corresponden utilidades: la empresa debe tener más de ${metaMin.value} trabajadores.`);
  }

  const aRepartir = dec(input.rentaNeta).times(pct);
  const mitad = aRepartir.div(2);
  const steps: Paso[] = [
    { descripcion: "Monto a repartir", formula: `${monto(input.rentaNeta)} × ${porcentaje(pct)}`, valor: monto(aRepartir) },
  ];

  let porDias: Decimal;
  let porRem: Decimal;
  if (input.modo === "exacto") {
    porDias = mitad.times(input.diasTrabajador).div(input.diasTotales);
    porRem = mitad.times(input.remuneracionesTrabajador).div(input.remuneracionesTotales);
    steps.push(
      { descripcion: "Por días trabajados (50%)", formula: `${monto(mitad)} × ${input.diasTrabajador} ÷ ${input.diasTotales}`, valor: monto(porDias) },
      {
        descripcion: "Por remuneraciones (50%)",
        formula: `${monto(mitad)} × ${monto(input.remuneracionesTrabajador)} ÷ ${monto(input.remuneracionesTotales)}`,
        valor: monto(porRem),
      },
    );
    supuestos.push("Datos del comunicado de utilidades de tu empresa.");
  } else {
    const n = input.numeroTrabajadores;
    const partDias = dec(input.mesesTrabajados).div(12).div(n);
    porDias = mitad.times(partDias);
    steps.push({
      descripcion: "Por días trabajados (50%)",
      formula: `${monto(mitad)} ÷ ${n}${input.mesesTrabajados === 12 ? "" : ` × ${input.mesesTrabajados}/12`}`,
      valor: monto(porDias),
    });
    if (input.sueldoPromedioEmpresa && input.remuneracionMensual) {
      // Tu remuneración anual frente a la de toda la planilla (n × promedio × 12).
      const partRem = dec(input.remuneracionMensual).times(input.mesesTrabajados).div(dec(input.sueldoPromedioEmpresa).times(12).times(n));
      porRem = mitad.times(partRem);
      steps.push({
        descripcion: "Por remuneraciones (50%)",
        formula: `${monto(mitad)} × ${monto(input.remuneracionMensual)} × ${input.mesesTrabajados} ÷ (${monto(input.sueldoPromedioEmpresa)} × 12 × ${n})`,
        valor: monto(porRem),
      });
      supuestos.push(`Sueldo promedio en tu empresa: ${soles(input.sueldoPromedioEmpresa)}.`);
    } else {
      porRem = mitad.times(partDias);
      steps.push({ descripcion: "Por remuneraciones (50%)", formula: "Igual que por días (sueldo promedio)", valor: monto(porRem) });
      supuestos.push("Se asume que tu sueldo es igual al promedio de la empresa.");
    }
    supuestos.push(`Reparto entre ${n} trabajadores; trabajaste ${input.mesesTrabajados} de 12 meses.`);
    advertencias.push("Es una estimación: el monto real depende de los días y sueldos de todos los trabajadores.");
  }

  const items = [
    { id: "por_dias", etiqueta: "Por días trabajados", valor: porDias },
    { id: "por_remuneraciones", etiqueta: "Por remuneraciones", valor: porRem },
  ];
  if (input.remuneracionMensual) {
    const tope = dec(input.remuneracionMensual).times(metaTope.value);
    const bruto = porDias.plus(porRem);
    parametrosUsados.push(parametroUsado(metaTope));
    if (bruto.greaterThan(tope)) {
      items.push({ id: "tope", etiqueta: `Tope de ${metaTope.value} sueldos`, valor: tope.minus(bruto) });
      steps.push({ descripcion: "Se aplica el tope", formula: `${metaTope.value} × ${monto(input.remuneracionMensual)}`, valor: monto(tope) });
      supuestos.push(`Se aplicó el tope de ${metaTope.value} sueldos (${soles(tope)}).`);
    }
  }

  const { conceptos, total, ajusteRedondeo } = cerrarConceptos(items);
  return { total, moneda: "PEN", conceptos, steps, parametrosUsados, advertencias, baseLegal, ajusteRedondeo, condiciones };
}

function requisitos(pcts: Record<Sector, string>, minimo: string, tope: string): string[] {
  // Agrupa actividades por porcentaje, de mayor a menor: "10% en pesca, telecomunicaciones e industria; …"
  const grupos = new Map<string, string[]>();
  for (const [sector, p] of Object.entries(pcts) as [Sector, string][]) {
    grupos.set(p, [...(grupos.get(p) ?? []), NOMBRE_SECTOR[sector]]);
  }
  const lista = [...grupos.entries()]
    .sort(([a], [b]) => dec(b).comparedTo(a))
    .map(([p, nombres]) => `${porcentaje(dec(p))} en ${enumerar(nombres)}`)
    .join("; ");
  return [
    `Tu empresa debe tener más de ${minimo} trabajadores y generar renta de tercera categoría.`,
    `Se reparte un porcentaje de la renta neta según la actividad: ${lista}.`,
    "La mitad se reparte según los días que trabajaste en el año y la otra mitad según lo que ganaste.",
    `El máximo por trabajador es de ${tope} sueldos mensuales; el exceso no se paga al trabajador.`,
    "Tienen descuento de renta de quinta categoría, pero no de AFP ni ONP.",
  ];
}

/** "a, b y c"; usa "e" ante palabra con sonido i ("telecomunicaciones e industria") y coma si el último ya lleva "y". */
function enumerar(nombres: string[]): string {
  if (nombres.length === 1) return nombres[0]!;
  const ultimo = nombres.at(-1)!;
  const conector = ultimo.includes(" y ") ? ", " : /^h?i(?!e)/i.test(ultimo) ? " e " : " y ";
  return `${nombres.slice(0, -1).join(", ")}${conector}${ultimo}`;
}
