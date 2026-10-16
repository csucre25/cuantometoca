import { calcularHorasExtras } from "@calc/calc-pe";
import type { Definicion } from "../tipos";
import { asignacion, faltaSueldo, otros, sueldo } from "./campos";
import { contexto, si } from "./contexto";

export const horasExtras: Definicion = {
  etiquetaTotal: "Te deben pagar",
  campos: [
    sueldo(),
    { tipo: "entero", id: "horas", etiqueta: "Horas extra por día", min: 0.5, max: 16, paso: 0.5 },
    { tipo: "entero", id: "dias", etiqueta: "Días con horas extra", min: 1, max: 31 },
    asignacion,
  ],
  avanzados: [{ tipo: "entero", id: "jornada", etiqueta: "Horas de tu jornada diaria", min: 1, max: 12 }, otros],
  errores: { horasExtraPorDia: "horas", jornadaHorasDiarias: "jornada" },
  iniciales: () => ({ sueldo: "", horas: "2", dias: "1", asig: "0", jornada: "8", otros: "" }),
  faltante: (v) => (!v.sueldo ? faltaSueldo : !v.horas || Number(v.horas) <= 0 ? "Indica cuántas horas extra hiciste por día." : null),
  calcular: (v, hoy) =>
    calcularHorasExtras(
      {
        sueldoBasico: v.sueldo,
        asignacionFamiliar: si(v.asig),
        otrosRegulares: v.otros || "0",
        horasExtraPorDia: Number(v.horas),
        dias: Number(v.dias || 1),
        jornadaHorasDiarias: Number(v.jornada || 8),
      },
      contexto(hoy),
    ),
};
