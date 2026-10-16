import type { ResultadoCalculo } from "@calc/core";

// Definición declarativa de un formulario de calculadora. Los valores viajan como strings
// (igual que en la URL), y cada definición los convierte a la entrada de su motor.

export type Valores = Record<string, string>;

type Base = { id: string; etiqueta: string; ayuda?: string };

export type Campo =
  | (Base & { tipo: "dinero"; placeholder?: string })
  | (Base & { tipo: "opciones"; opciones: { valor: string; etiqueta: string }[]; estilo?: "segmentado" | "lista" })
  | (Base & { tipo: "si-no" })
  | (Base & { tipo: "fecha" })
  | (Base & { tipo: "entero"; min: number; max: number; sufijo?: string; paso?: number });

export type Definicion = {
  /** Campos esenciales, siempre visibles. */
  campos: Campo[];
  /** Campos plegados en "Más opciones". */
  avanzados: Campo[];
  /** Valores por defecto según la fecha actual (ej. el próximo periodo de pago). */
  iniciales: (hoy: string) => Valores;
  /** Oculta campos que no aplican con los valores actuales. */
  visible?: (campo: string, v: Valores) => boolean;
  /** Mensaje si falta un dato imprescindible (se muestra en lugar del resultado), o null. */
  faltante: (v: Valores) => string | null;
  /** Campos del motor → campos del formulario, además de los comunes (para ubicar errores). */
  errores?: Record<string, string>;
  /** Etiqueta del total ("Te corresponde", "Tu sueldo neto"…). */
  etiquetaTotal: string;
  calcular: (v: Valores, hoy: string) => ResultadoCalculo;
  /** Caso de ejemplo para la imagen OG: el monto lo calcula el motor en el build. */
  ejemplo: (hoy: string) => { valores: Valores; leyenda: string };
};

/** Página "Parámetros vigentes": contenido ya formateado, generado desde params.json. */
export type Seccion = {
  titulo: string;
  /** Slug de la calculadora relacionada. */
  calculadora?: string;
  filas: { etiqueta: string; valor: string; desde: string; fuente: string }[];
  tabla?: { titulo: string; columnas: string[]; filas: string[][]; nota: string };
};

export type PaginaParametros = { titulo: string; descripcion: string; secciones: Seccion[] };
