import { calcularCts } from "@calc/calc-pe";
import { solesCorto } from "../../components/calc/formato";
import type { Definicion } from "../tipos";
import { REGIMENES, anioDe, contexto, si } from "./contexto";

/** Próximo depósito: mayo hasta el 15/05, noviembre hasta el 15/11, luego mayo del año siguiente. */
function proximo(hoy: string) {
  const anio = anioDe(hoy);
  const mmdd = hoy.slice(5);
  if (mmdd <= "05-15") return { periodo: "mayo", anio };
  if (mmdd <= "11-15") return { periodo: "noviembre", anio };
  return { periodo: "mayo", anio: anio + 1 };
}

export const cts: Definicion = {
  etiquetaTotal: "Te deben depositar",
  campos: [
    {
      tipo: "opciones",
      id: "periodo",
      etiqueta: "Depósito de",
      estilo: "segmentado",
      opciones: [
        { valor: "mayo", etiqueta: "Mayo" },
        { valor: "noviembre", etiqueta: "Noviembre" },
      ],
    },
    { tipo: "dinero", id: "sueldo", etiqueta: "Sueldo básico mensual", placeholder: "Ej. 2000" },
    {
      tipo: "opciones",
      id: "tiempo",
      etiqueta: "Tiempo trabajado en el periodo",
      estilo: "segmentado",
      opciones: [
        { valor: "meses", etiqueta: "Por meses" },
        { valor: "fechas", etiqueta: "Por fechas" },
      ],
    },
    { tipo: "entero", id: "meses", etiqueta: "Meses completos", min: 0, max: 6, sufijo: "de 6" },
    { tipo: "entero", id: "dias", etiqueta: "Días adicionales", min: 0, max: 30 },
    { tipo: "fecha", id: "ingreso", etiqueta: "Fecha de ingreso" },
    { tipo: "fecha", id: "cese", etiqueta: "Fecha de cese (si ya no trabajas ahí)" },
    { tipo: "si-no", id: "asig", etiqueta: "Recibo asignación familiar", ayuda: "Si tienes hijos menores de 18 años o que estudian." },
  ],
  avanzados: [
    { tipo: "dinero", id: "grati", etiqueta: "Gratificación recibida en el periodo", ayuda: "Si la dejas vacía, la estimamos con tu sueldo." },
    { tipo: "opciones", id: "regimen", etiqueta: "Régimen laboral", estilo: "lista", opciones: REGIMENES },
    { tipo: "dinero", id: "otros", etiqueta: "Otros ingresos regulares (promedio mensual)" },
    { tipo: "entero", id: "jornada", etiqueta: "Horas de trabajo al día (promedio)", min: 1, max: 24 },
    { tipo: "entero", id: "anio", etiqueta: "Año del depósito", min: 2025, max: 2100 },
  ],
  faltante: (v) =>
    !v.sueldo ? "Ingresa tu sueldo para ver el resultado." : v.tiempo === "fechas" && !v.ingreso ? "Ingresa tu fecha de ingreso." : null,
  iniciales: (hoy) => {
    const p = proximo(hoy);
    return { periodo: p.periodo, anio: String(p.anio), sueldo: "", tiempo: "meses", meses: "6", dias: "0", asig: "0", grati: "", regimen: "general", otros: "", jornada: "8" };
  },
  visible: (campo, v) => {
    if (campo === "meses" || campo === "dias") return v.tiempo !== "fechas";
    if (campo === "ingreso" || campo === "cese") return v.tiempo === "fechas";
    return true;
  },
  ejemplo: () => ({ valores: { sueldo: "2000", meses: "6", grati: "2000" }, leyenda: `Sueldo de ${solesCorto("2000")} y semestre completo` }),
  calcular: (v, hoy) =>
    calcularCts(
      {
        periodo: v.periodo as "mayo" | "noviembre",
        anio: Number(v.anio),
        regimen: v.regimen as "general",
        sueldoBasico: v.sueldo ?? "",
        asignacionFamiliar: si(v.asig),
        otrosRegulares: v.otros || "0",
        gratiSemestre: v.grati || undefined,
        jornadaHorasDiarias: Number(v.jornada || 8),
        ...(v.tiempo === "fechas"
          ? { fechaIngreso: v.ingreso || undefined, fechaCese: v.cese || undefined }
          : { mesesCompletos: Number(v.meses), diasAdicionales: Number(v.meses) === 6 ? 0 : Number(v.dias || 0) }),
      },
      contexto(hoy),
    ),
};
