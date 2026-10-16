import { calcularVacacionesTruncas } from "@calc/calc-pe";
import type { Definicion } from "../tipos";
import { asignacion, cese, faltaSueldo, ingreso, modoTiempo, otros, regimen, sueldo } from "./campos";
import { contexto, si } from "./contexto";

export const vacaciones: Definicion = {
  etiquetaTotal: "Te corresponde",
  campos: [
    sueldo(),
    modoTiempo("Tiempo trabajado"),
    ingreso,
    cese,
    { tipo: "entero", id: "meses", etiqueta: "Meses desde tu último aniversario", min: 0, max: 11, ayuda: "Meses completos del año de vacaciones que no llegaste a completar." },
    { tipo: "entero", id: "dias", etiqueta: "Días adicionales", min: 0, max: 30 },
    asignacion,
  ],
  avanzados: [regimen, otros],
  iniciales: (hoy) => ({ sueldo: "", tiempo: "fechas", ingreso: "", cese: hoy, meses: "6", dias: "0", asig: "0", regimen: "general", otros: "" }),
  visible: (campo, v) => {
    if (campo === "meses" || campo === "dias") return v.tiempo === "meses";
    if (campo === "ingreso" || campo === "cese") return v.tiempo !== "meses";
    return true;
  },
  faltante: (v) => {
    if (!v.sueldo) return faltaSueldo;
    if (v.tiempo !== "meses" && !v.ingreso) return "Ingresa tu fecha de ingreso.";
    if (v.tiempo !== "meses" && !v.cese) return "Ingresa tu último día de trabajo.";
    return null;
  },
  calcular: (v, hoy) =>
    calcularVacacionesTruncas(
      {
        regimen: v.regimen as "general",
        sueldoBasico: v.sueldo,
        asignacionFamiliar: si(v.asig),
        otrosRegulares: v.otros || "0",
        ...(v.tiempo === "meses"
          ? { meses: Number(v.meses), dias: Number(v.dias || 0), fechaCese: hoy }
          : { fechaIngreso: v.ingreso, fechaCese: v.cese }),
      },
      contexto(hoy),
    ),
};
