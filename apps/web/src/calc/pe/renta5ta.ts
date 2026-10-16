import { calcularRenta5ta } from "@calc/calc-pe";
import type { Definicion } from "../tipos";
import { faltaSueldo, seguro } from "./campos";
import { anioDe, contexto } from "./contexto";

export const renta5ta: Definicion = {
  etiquetaTotal: "Impuesto del año",
  campos: [
    { tipo: "dinero", id: "sueldo", etiqueta: "Sueldo bruto mensual", placeholder: "Ej. 5000", ayuda: "Incluye asignación familiar y otros pagos fijos." },
    { tipo: "entero", id: "anio", etiqueta: "Año", min: 2025, max: 2100 },
  ],
  avanzados: [
    { tipo: "dinero", id: "gastos", etiqueta: "Gastos deducibles del año", ayuda: "Alquiler, honorarios y otros gastos con comprobante electrónico." },
    { tipo: "dinero", id: "otros", etiqueta: "Otros ingresos del año (bonos, comisiones)" },
    seguro,
  ],
  iniciales: (hoy) => ({ sueldo: "", anio: String(anioDe(hoy)), gastos: "", otros: "", seguro: "essalud" }),
  errores: { sueldoMensual: "sueldo", deduccionAdicional: "gastos", otrosIngresos: "otros" },
  faltante: (v) => (!v.sueldo ? faltaSueldo : null),
  calcular: (v, hoy) =>
    calcularRenta5ta(
      {
        anio: Number(v.anio),
        sueldoMensual: v.sueldo,
        deduccionAdicional: v.gastos || "0",
        otrosIngresos: v.otros || "0",
        seguroSalud: v.seguro as "essalud",
      },
      contexto(hoy),
    ),
};
