import { calcularUtilidades } from "@calc/calc-pe";
import { solesCorto } from "../../components/calc/formato";
import type { Definicion } from "../tipos";
import { anioDe, contexto } from "./contexto";

const exacto = (v: Record<string, string>) => v.modo === "exacto";

export const utilidades: Definicion = {
  etiquetaTotal: "Te corresponde",
  campos: [
    {
      tipo: "opciones",
      id: "modo",
      etiqueta: "¿Cómo quieres calcular?",
      estilo: "segmentado",
      opciones: [
        { valor: "estimado", etiqueta: "Estimar" },
        { valor: "exacto", etiqueta: "Con el comunicado" },
      ],
      ayuda: "Si tu empresa ya te entregó la hoja de liquidación de utilidades, usa sus datos.",
    },
    {
      tipo: "opciones",
      id: "sector",
      etiqueta: "Actividad de la empresa",
      estilo: "lista",
      opciones: [
        { valor: "otras", etiqueta: "Otras actividades" },
        { valor: "comercio_restaurantes", etiqueta: "Comercio o restaurantes" },
        { valor: "minera", etiqueta: "Minería" },
        { valor: "industrial", etiqueta: "Industria" },
        { valor: "pesquera", etiqueta: "Pesca" },
        { valor: "telecomunicaciones", etiqueta: "Telecomunicaciones" },
      ],
    },
    { tipo: "dinero", id: "renta", etiqueta: "Renta neta de la empresa en el año", placeholder: "Ej. 5000000" },
    { tipo: "entero", id: "trabajadores", etiqueta: "Número de trabajadores", min: 1, max: 1_000_000 },
    { tipo: "entero", id: "meses", etiqueta: "Meses que trabajaste en el año", min: 0, max: 12, sufijo: "de 12" },
    { tipo: "entero", id: "diasTotales", etiqueta: "Días trabajados por todos los trabajadores", min: 1, max: 100_000_000 },
    { tipo: "entero", id: "diasTrab", etiqueta: "Tus días trabajados", min: 0, max: 366 },
    { tipo: "dinero", id: "remTotales", etiqueta: "Remuneraciones pagadas a todos" },
    { tipo: "dinero", id: "remTrab", etiqueta: "Tus remuneraciones del año" },
  ],
  avanzados: [
    { tipo: "dinero", id: "sueldo", etiqueta: "Tu sueldo mensual", ayuda: "Para aplicar el tope de 18 sueldos y, si estimas, para ponderar tu parte." },
    { tipo: "dinero", id: "promedio", etiqueta: "Sueldo promedio en tu empresa", ayuda: "Solo para estimar. Si lo dejas vacío, asumimos que ganas el promedio." },
    { tipo: "entero", id: "anio", etiqueta: "Año de las utilidades", min: 2020, max: 2100 },
  ],
  errores: { rentaNeta: "renta", numeroTrabajadores: "trabajadores", remuneracionMensual: "sueldo", sueldoPromedioEmpresa: "promedio" },
  iniciales: (hoy) => ({
    modo: "estimado",
    sector: "otras",
    renta: "",
    trabajadores: "",
    meses: "12",
    diasTotales: "",
    diasTrab: "",
    remTotales: "",
    remTrab: "",
    sueldo: "",
    promedio: "",
    // Las utilidades que se pagan en un año corresponden al ejercicio anterior.
    anio: String(anioDe(hoy) - 1),
  }),
  visible: (campo, v) => {
    if (["trabajadores", "meses", "promedio"].includes(campo)) return !exacto(v);
    if (["diasTotales", "diasTrab", "remTotales", "remTrab"].includes(campo)) return exacto(v);
    return true;
  },
  faltante: (v) => {
    if (!v.renta) return "Ingresa la renta neta de tu empresa para ver el resultado.";
    if (!exacto(v) && !v.trabajadores) return "Indica cuántos trabajadores tiene la empresa.";
    if (exacto(v) && (!v.diasTotales || !v.diasTrab || !v.remTotales || !v.remTrab)) return "Completa los datos del comunicado de utilidades.";
    return null;
  },
  ejemplo: () => ({ valores: { sector: "minera", renta: "5000000", trabajadores: "100" }, leyenda: `Minera con renta de ${solesCorto("5000000")} y 100 trabajadores` }),
  calcular: (v, hoy) =>
    calcularUtilidades(
      exacto(v)
        ? {
            modo: "exacto",
            sector: v.sector as "otras",
            rentaNeta: v.renta,
            ejercicio: Number(v.anio),
            diasTotales: Number(v.diasTotales),
            diasTrabajador: Number(v.diasTrab),
            remuneracionesTotales: v.remTotales,
            remuneracionesTrabajador: v.remTrab,
            remuneracionMensual: v.sueldo || undefined,
          }
        : {
            modo: "estimado",
            sector: v.sector as "otras",
            rentaNeta: v.renta,
            ejercicio: Number(v.anio),
            numeroTrabajadores: Number(v.trabajadores),
            mesesTrabajados: Number(v.meses || 12),
            remuneracionMensual: v.sueldo || undefined,
            sueldoPromedioEmpresa: v.promedio || undefined,
          },
      contexto(hoy),
    ),
};
