import { calcularSueldoNeto } from "@calc/calc-pe";
import { solesCorto } from "../../components/calc/formato";
import type { Definicion } from "../tipos";
import { asignacion, faltaSueldo, otros, seguro, sueldo } from "./campos";
import { contexto, si } from "./contexto";

export const sueldoNeto: Definicion = {
  etiquetaTotal: "Tu sueldo neto",
  campos: [
    sueldo("Ej. 3000"),
    {
      tipo: "opciones",
      id: "sistema",
      etiqueta: "Sistema de pensiones",
      estilo: "segmentado",
      opciones: [
        { valor: "afp", etiqueta: "AFP" },
        { valor: "onp", etiqueta: "ONP" },
      ],
    },
    {
      tipo: "opciones",
      id: "afp",
      etiqueta: "Tu AFP",
      estilo: "lista",
      opciones: [
        { valor: "", etiqueta: "Elige tu AFP" },
        { valor: "habitat", etiqueta: "Habitat" },
        { valor: "integra", etiqueta: "Integra" },
        { valor: "prima", etiqueta: "Prima" },
        { valor: "profuturo", etiqueta: "Profuturo" },
      ],
    },
    {
      tipo: "opciones",
      id: "comision",
      etiqueta: "Tipo de comisión",
      estilo: "segmentado",
      opciones: [
        { valor: "flujo", etiqueta: "Sobre el sueldo" },
        { valor: "mixta", etiqueta: "Mixta" },
      ],
      ayuda: "Si te afiliaste desde 2013 y no elegiste, probablemente tienes comisión mixta.",
    },
    asignacion,
  ],
  avanzados: [
    { tipo: "si-no", id: "renta", etiqueta: "Incluir la retención de renta de quinta" },
    otros,
    seguro,
  ],
  iniciales: () => ({ sueldo: "", sistema: "afp", afp: "", comision: "flujo", asig: "0", renta: "1", otros: "", seguro: "essalud" }),
  visible: (campo, v) => (campo === "afp" || campo === "comision" ? v.sistema === "afp" : true),
  faltante: (v) => (!v.sueldo ? faltaSueldo : v.sistema === "afp" && !v.afp ? "Elige tu AFP para ver el resultado." : null),
  ejemplo: () => ({ valores: { sueldo: "3000", sistema: "onp" }, leyenda: `Sueldo de ${solesCorto("3000")} con ONP` }),
  calcular: (v, hoy) =>
    calcularSueldoNeto(
      {
        sueldoBasico: v.sueldo,
        asignacionFamiliar: si(v.asig),
        otrosRegulares: v.otros || "0",
        sistema: v.sistema as "afp" | "onp",
        afp: v.sistema === "afp" ? (v.afp as "integra") : undefined,
        tipoComision: v.comision as "flujo" | "mixta",
        incluirRenta5ta: si(v.renta),
        seguroSalud: v.seguro as "essalud",
      },
      contexto(hoy),
    ),
};
