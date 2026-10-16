import { calcularLiquidacion } from "@calc/calc-pe";
import { solesCorto } from "../../components/calc/formato";
import type { Definicion } from "../tipos";
import { asignacion, cese, faltaSueldo, ingreso, otros, regimen, seguro, sueldo } from "./campos";
import { contexto, si } from "./contexto";

export const liquidacion: Definicion = {
  etiquetaTotal: "Te deben pagar",
  campos: [
    sueldo(),
    ingreso,
    cese,
    {
      tipo: "opciones",
      id: "motivo",
      etiqueta: "¿Por qué terminó?",
      estilo: "lista",
      opciones: [
        { valor: "renuncia", etiqueta: "Renuncié" },
        { valor: "despido_arbitrario", etiqueta: "Me despidieron sin causa justa" },
        { valor: "fin_contrato", etiqueta: "Terminó mi contrato" },
        { valor: "mutuo_disenso", etiqueta: "Acuerdo con mi empleador" },
      ],
    },
    {
      tipo: "opciones",
      id: "contrato",
      etiqueta: "Tipo de contrato",
      estilo: "segmentado",
      opciones: [
        { valor: "indeterminado", etiqueta: "Indefinido" },
        { valor: "plazo_fijo", etiqueta: "A plazo fijo" },
      ],
    },
    { tipo: "fecha", id: "fin", etiqueta: "Fecha en que vencía tu contrato" },
    asignacion,
  ],
  avanzados: [
    { tipo: "entero", id: "vacPend", etiqueta: "Días de vacaciones ganadas que no gozaste", min: 0, max: 365 },
    { tipo: "entero", id: "diasMes", etiqueta: "Días trabajados del último mes que aún no te pagaron", min: 0, max: 31 },
    regimen,
    seguro,
    otros,
    { tipo: "entero", id: "jornada", etiqueta: "Horas de trabajo al día (promedio)", min: 1, max: 24 },
  ],
  errores: { fechaFinContrato: "fin" },
  iniciales: (hoy) => ({
    sueldo: "",
    ingreso: "",
    cese: hoy,
    motivo: "renuncia",
    contrato: "indeterminado",
    fin: "",
    asig: "0",
    vacPend: "0",
    diasMes: "0",
    regimen: "general",
    seguro: "essalud",
    otros: "",
    jornada: "8",
  }),
  visible: (campo, v) => {
    if (campo === "contrato") return v.motivo === "despido_arbitrario";
    if (campo === "fin") return v.motivo === "despido_arbitrario" && v.contrato === "plazo_fijo";
    return true;
  },
  faltante: (v) => {
    if (!v.sueldo) return faltaSueldo;
    if (!v.ingreso) return "Ingresa tu fecha de ingreso.";
    if (!v.cese) return "Ingresa tu último día de trabajo.";
    if (v.motivo === "despido_arbitrario" && v.contrato === "plazo_fijo" && !v.fin) return "Ingresa la fecha en que vencía tu contrato.";
    return null;
  },
  ejemplo: (hoy) => ({
    // Un año antes de hoy (el 29/02 pasa a 28/02 en un año no bisiesto).
    valores: { sueldo: "2000", ingreso: `${Number(hoy.slice(0, 4)) - 1}${hoy.slice(4).replace("02-29", "02-28")}`, cese: hoy, motivo: "renuncia" },
    leyenda: `Renuncia tras 1 año con sueldo de ${solesCorto("2000")}`,
  }),
  calcular: (v, hoy) =>
    calcularLiquidacion(
      {
        regimen: v.regimen as "general",
        sueldoBasico: v.sueldo,
        asignacionFamiliar: si(v.asig),
        otrosRegulares: v.otros || "0",
        seguroSalud: v.seguro as "essalud",
        jornadaHorasDiarias: Number(v.jornada || 8),
        fechaIngreso: v.ingreso,
        fechaCese: v.cese,
        motivoCese: v.motivo as "renuncia",
        tipoContrato: v.motivo === "despido_arbitrario" ? (v.contrato as "indeterminado") : "indeterminado",
        fechaFinContrato: v.motivo === "despido_arbitrario" && v.contrato === "plazo_fijo" ? v.fin : undefined,
        diasVacacionesPendientes: Number(v.vacPend || 0),
        diasLaboradosUltimoMes: Number(v.diasMes || 0),
      },
      contexto(hoy),
    ),
};
