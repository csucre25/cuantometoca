import { dec } from "@calc/core";
import { fecha, porcentaje, soles } from "../../components/calc/formato";
import type { PaginaParametros, Seccion } from "../tipos";
import { contexto } from "./contexto";

// Página "Parámetros vigentes" de Perú. Valores, fechas y fuentes salen de params.json.

type Tramo = { hasta_uit: string | null; tasa: string };
type Comision = { flujo: string; mixta_flujo: string; mixta_saldo_anual: string } | null;

/** Porcentaje con dos decimales fijos, para alinear columnas: 0.016 → "1.60%". */
const pct2 = (r: string) => `${(Number(r) * 100).toFixed(2)}%`;

const AFP: Record<string, string> = { habitat: "Habitat", integra: "Integra", prima: "Prima", profuturo: "Profuturo" };
const SECTOR: Record<string, string> = {
  pesquera: "Pesca",
  telecomunicaciones: "Telecomunicaciones",
  industrial: "Industria",
  minera: "Minería",
  comercio_restaurantes: "Comercio y restaurantes",
  otras: "Otras actividades",
};

/** "07-15" → "15 de julio". */
function diaMes(mmdd: string) {
  const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const [m, d] = mmdd.split("-");
  return `${Number(d)} de ${meses[Number(m) - 1]}`;
}

export function paginaParametros(hoy: string): PaginaParametros {
  const { params } = contexto(hoy);
  const meta = <T = string>(k: string) => params.meta<T>(k, hoy);
  const fila = (etiqueta: string, k: string, valor: (v: never) => string) => {
    const m = meta(k);
    return { etiqueta, valor: valor(m.value as never), desde: fecha(m.from), fuente: m.source };
  };

  const rmv = meta("rmv");
  const asig = meta("asignacion_familiar_pct");
  const uit = meta("uit");
  const ded = meta("renta5ta_deduccion_uit");
  const tramos = meta<Tramo[]>("renta5ta_tramos");
  const comisiones = meta<Record<string, Comision>>("afp_comisiones");

  const secciones: Seccion[] = [
    {
      titulo: "Remuneraciones",
      calculadora: "sueldo-neto",
      filas: [
        { etiqueta: "Remuneración mínima vital (sueldo mínimo)", valor: soles(rmv.value), desde: fecha(rmv.from), fuente: rmv.source },
        {
          etiqueta: `Asignación familiar (${porcentaje(asig.value)} de la remuneración mínima)`,
          valor: soles(dec(rmv.value).times(asig.value).toFixed(2)),
          desde: fecha(rmv.from > asig.from ? rmv.from : asig.from),
          fuente: asig.source,
        },
      ],
    },
    {
      titulo: "Gratificación y CTS",
      calculadora: "gratificacion",
      filas: [
        fila("Bonificación extraordinaria con EsSalud", "bonificacion_extraordinaria_essalud", porcentaje),
        fila("Bonificación extraordinaria con EPS", "bonificacion_extraordinaria_eps", porcentaje),
        fila("Pago de gratificaciones", "gratificacion_fechas_pago", (v: Record<string, string>) => `Hasta el ${diaMes(v.julio!)} y el ${diaMes(v.diciembre!)}`),
        fila("Depósito de CTS", "cts_fechas_deposito", (v: Record<string, string>) => `Hasta el ${diaMes(v.mayo!)} y el ${diaMes(v.noviembre!)}`),
        fila("Jornada mínima para tener CTS", "cts_jornada_minima_horas", (v: string) => `${v} horas diarias`),
      ],
    },
    {
      titulo: "Impuesto a la renta de quinta categoría",
      calculadora: "renta-quinta-categoria",
      filas: [
        { etiqueta: "Unidad Impositiva Tributaria (UIT)", valor: soles(uit.value), desde: fecha(uit.from), fuente: uit.source },
        {
          etiqueta: `Deducción anual (${ded.value} UIT)`,
          valor: soles(dec(uit.value).times(ded.value).toFixed(2)),
          desde: fecha(uit.from > ded.from ? uit.from : ded.from),
          fuente: ded.source,
        },
        fila("Deducción adicional máxima por gastos", "renta5ta_deduccion_adicional_max_uit", (v: string) => `${v} UIT`),
      ],
      tabla: {
        titulo: "Escala anual",
        columnas: ["Renta neta anual", "Tasa"],
        filas: tramos.value.map((t, i, arr) => [
          t.hasta_uit === null ? `Más de ${arr[i - 1]!.hasta_uit} UIT` : i === 0 ? `Hasta ${t.hasta_uit} UIT` : `Más de ${arr[i - 1]!.hasta_uit} hasta ${t.hasta_uit} UIT`,
          porcentaje(t.tasa),
        ]),
        nota: `Desde ${fecha(tramos.from)} · ${tramos.source}`,
      },
    },
    {
      titulo: "Pensiones",
      calculadora: "sueldo-neto",
      filas: [
        fila("Aporte a la ONP", "onp_tasa", porcentaje),
        fila("Aporte obligatorio al fondo AFP", "afp_aporte_obligatorio", porcentaje),
        fila("Prima de seguro AFP", "afp_prima_seguro", porcentaje),
        fila("Remuneración máxima asegurable (tope de la prima)", "afp_remuneracion_maxima_asegurable", soles),
      ],
      tabla: {
        titulo: "Comisiones de las AFP",
        columnas: ["AFP", "Sobre el sueldo", "Mixta: sobre el saldo (anual)"],
        filas: Object.entries(comisiones.value)
          .filter(([, c]) => c)
          .map(([afp, c]) => [AFP[afp] ?? afp, pct2(c!.flujo), pct2(c!.mixta_saldo_anual)]),
        nota: `Desde ${fecha(comisiones.from)} · ${comisiones.source}`,
      },
    },
    {
      titulo: "Utilidades",
      calculadora: "utilidades",
      filas: [
        fila("Empresas obligadas", "utilidades_min_trabajadores", (v: string) => `Más de ${v} trabajadores`),
        fila("Tope por trabajador", "utilidades_tope_remuneraciones", (v: string) => `${v} sueldos mensuales`),
      ],
      tabla: (() => {
        const m = meta<Record<string, string>>("utilidades_porcentajes");
        return {
          titulo: "Porcentaje de la renta neta según actividad",
          columnas: ["Actividad", "Porcentaje"],
          filas: Object.entries(m.value).map(([s, p]) => [SECTOR[s] ?? s, porcentaje(p)]),
          nota: `Desde ${fecha(m.from)} · ${m.source}`,
        };
      })(),
    },
    {
      titulo: "Horas extras e indemnización",
      calculadora: "horas-extras",
      filas: [
        fila("Recargo de horas extras", "horas_extras_recargos", (v: Record<string, string>) => `${porcentaje(v.primeras_2h!)} las primeras ${v.horas_primer_tramo} horas; ${porcentaje(v.desde_3ra_h!)} desde la siguiente`),
        fila("Período de prueba", "periodo_prueba_meses", (v: string) => `${v} meses`),
      ],
    },
  ];

  return {
    titulo: "Parámetros laborales vigentes en Perú",
    descripcion: "Sueldo mínimo, UIT, tasas de AFP y ONP, bonificaciones y demás valores que usan nuestras calculadoras, con su fecha de vigencia y su norma.",
    secciones,
  };
}
