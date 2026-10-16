import type { Campo } from "../tipos";
import { REGIMENES } from "./contexto";

// Campos que se repiten entre calculadoras de Perú: mismo texto, mismo comportamiento.

export const sueldo = (placeholder = "Ej. 2000"): Campo => ({ tipo: "dinero", id: "sueldo", etiqueta: "Sueldo básico mensual", placeholder });

export const asignacion: Campo = {
  tipo: "si-no",
  id: "asig",
  etiqueta: "Recibo asignación familiar",
  ayuda: "Si tienes hijos menores de 18 años o que estudian.",
};

export const regimen: Campo = { tipo: "opciones", id: "regimen", etiqueta: "Régimen laboral", estilo: "lista", opciones: REGIMENES };

export const otros: Campo = {
  tipo: "dinero",
  id: "otros",
  etiqueta: "Otros ingresos regulares (promedio mensual)",
  ayuda: "Comisiones, horas extras u otros pagos que recibes de forma habitual.",
};

export const seguro: Campo = {
  tipo: "opciones",
  id: "seguro",
  etiqueta: "Seguro de salud",
  estilo: "segmentado",
  opciones: [
    { valor: "essalud", etiqueta: "EsSalud" },
    { valor: "eps", etiqueta: "EPS" },
  ],
};

export const ingreso: Campo = { tipo: "fecha", id: "ingreso", etiqueta: "Fecha de ingreso" };
export const cese: Campo = { tipo: "fecha", id: "cese", etiqueta: "Último día de trabajo" };

export const modoTiempo = (etiqueta: string): Campo => ({
  tipo: "opciones",
  id: "tiempo",
  etiqueta,
  estilo: "segmentado",
  opciones: [
    { valor: "fechas", etiqueta: "Por fechas" },
    { valor: "meses", etiqueta: "Por meses" },
  ],
});

export const faltaSueldo = "Ingresa tu sueldo para ver el resultado.";
