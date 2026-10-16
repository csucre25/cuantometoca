import { calcularGratificacion } from "@calc/calc-pe";
import { solesCorto } from "../../components/calc/formato";
import type { Definicion } from "../tipos";
import { REGIMENES, anioDe, contexto, si } from "./contexto";

/** Próxima gratificación: julio hasta el 15/07, diciembre hasta el 15/12, luego julio del año siguiente. */
function proxima(hoy: string) {
  const anio = anioDe(hoy);
  const mmdd = hoy.slice(5);
  if (mmdd <= "07-15") return { periodo: "julio", anio };
  if (mmdd <= "12-15") return { periodo: "diciembre", anio };
  return { periodo: "julio", anio: anio + 1 };
}

export const gratificacion: Definicion = {
  etiquetaTotal: "Te corresponde",
  campos: [
    {
      tipo: "opciones",
      id: "periodo",
      etiqueta: "Gratificación de",
      estilo: "segmentado",
      opciones: [
        { valor: "julio", etiqueta: "Julio" },
        { valor: "diciembre", etiqueta: "Diciembre" },
      ],
    },
    { tipo: "dinero", id: "sueldo", etiqueta: "Sueldo básico mensual", placeholder: "Ej. 1500" },
    {
      tipo: "opciones",
      id: "tiempo",
      etiqueta: "Tiempo trabajado en el semestre",
      estilo: "segmentado",
      opciones: [
        { valor: "meses", etiqueta: "Por meses" },
        { valor: "fechas", etiqueta: "Por fechas" },
      ],
    },
    { tipo: "entero", id: "meses", etiqueta: "Meses completos trabajados", min: 0, max: 6, sufijo: "de 6", ayuda: "Solo cuentan meses calendario completos." },
    { tipo: "fecha", id: "ingreso", etiqueta: "Fecha de ingreso" },
    { tipo: "fecha", id: "cese", etiqueta: "Fecha de cese (si ya no trabajas ahí)" },
    { tipo: "si-no", id: "asig", etiqueta: "Recibo asignación familiar", ayuda: "Si tienes hijos menores de 18 años o que estudian." },
  ],
  avanzados: [
    { tipo: "opciones", id: "regimen", etiqueta: "Régimen laboral", estilo: "lista", opciones: REGIMENES },
    {
      tipo: "opciones",
      id: "seguro",
      etiqueta: "Seguro de salud",
      estilo: "segmentado",
      opciones: [
        { valor: "essalud", etiqueta: "EsSalud" },
        { valor: "eps", etiqueta: "EPS" },
      ],
    },
    { tipo: "dinero", id: "otros", etiqueta: "Otros ingresos regulares (promedio mensual)", ayuda: "Comisiones, horas extras u otros pagos que recibiste al menos 3 meses del semestre." },
    { tipo: "entero", id: "anio", etiqueta: "Año", min: 2025, max: 2100 },
  ],
  faltante: (v) =>
    !v.sueldo ? "Ingresa tu sueldo para ver el resultado." : v.tiempo === "fechas" && !v.ingreso ? "Ingresa tu fecha de ingreso." : null,
  iniciales: (hoy) => {
    const p = proxima(hoy);
    return { periodo: p.periodo, anio: String(p.anio), sueldo: "", tiempo: "meses", meses: "6", asig: "0", regimen: "general", seguro: "essalud", otros: "" };
  },
  visible: (campo, v) => {
    if (campo === "meses") return v.tiempo !== "fechas";
    if (campo === "ingreso" || campo === "cese") return v.tiempo === "fechas";
    return true;
  },
  ejemplo: () => ({ valores: { sueldo: "2000", meses: "6" }, leyenda: `Sueldo de ${solesCorto("2000")} y semestre completo` }),
  calcular: (v, hoy) =>
    calcularGratificacion(
      {
        periodo: v.periodo as "julio" | "diciembre",
        anio: Number(v.anio),
        regimen: v.regimen as "general",
        sueldoBasico: v.sueldo ?? "",
        asignacionFamiliar: si(v.asig),
        otrosRegulares: v.otros || "0",
        seguroSalud: v.seguro as "essalud" | "eps",
        ...(v.tiempo === "fechas"
          ? { fechaIngreso: v.ingreso || undefined, fechaCese: v.cese || undefined }
          : { mesesCompletos: Number(v.meses) }),
      },
      contexto(hoy),
    ),
};
