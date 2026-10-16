import { Decimal } from "./decimal";
import { compararFechas, sumarDias, toFechaISO, type FechaInput, type FechaISO } from "./fechas";

// Parámetros legales con vigencia (config/countries/<pais>/params.json).
// El núcleo no lee archivos: quien lo usa (web, tests, build) registra el JSON del país.

export type EntradaParametro = {
  value: unknown;
  from: FechaISO;
  to: FechaISO | null;
  /** Fuente pública (norma o entidad). Se muestra al usuario. */
  source: string;
  /** Comentario interno (cómo se obtuvo, qué falta verificar). No se muestra. */
  nota?: string;
  verified?: boolean;
};

export type DefinicionParametro = {
  description?: string;
  unit: string;
  history: EntradaParametro[];
};

export type ParametrosPais = {
  country: string;
  currency?: string;
  params: Record<string, DefinicionParametro>;
};

export type MetaParametro<T = unknown> = {
  clave: string;
  value: T;
  from: FechaISO;
  to: FechaISO | null;
  source: string;
  verified: boolean;
};

export class ParametroNoEncontradoError extends Error {
  override name = "ParametroNoEncontradoError";
}

/**
 * Errores de un historial de vigencias: cada `to` ≥ `from`, entradas consecutivas sin
 * huecos ni solapamientos (`from` = `to` anterior + 1 día) y solo la última puede tener `to: null`.
 */
export function erroresHistorial(clave: string, history: EntradaParametro[]): string[] {
  const errores: string[] = [];
  if (history.length === 0) return [`${clave}: el historial está vacío`];

  const ordenado = [...history].sort((a, b) => compararFechas(a.from, b.from));
  ordenado.forEach((e, i) => {
    if (e.to !== null && compararFechas(e.to, e.from) < 0) {
      errores.push(`${clave}: entrada ${e.from} termina (${e.to}) antes de empezar`);
    }
    const siguiente = ordenado[i + 1];
    if (!siguiente) return;
    if (e.to === null) {
      errores.push(`${clave}: la entrada ${e.from} tiene to=null pero no es la última (siguiente: ${siguiente.from})`);
      return;
    }
    const esperado = sumarDias(e.to, 1);
    const cmp = compararFechas(siguiente.from, esperado);
    if (cmp < 0) errores.push(`${clave}: solapamiento entre ${e.from}..${e.to} y ${siguiente.from}`);
    if (cmp > 0) errores.push(`${clave}: hueco entre ${e.to} y ${siguiente.from}`);
  });
  return errores;
}

export function erroresParametros(data: ParametrosPais): string[] {
  return Object.entries(data.params).flatMap(([clave, def]) => erroresHistorial(clave, def.history));
}

export type LectorParametros = {
  country: string;
  meta<T = unknown>(clave: string, fecha: FechaInput): MetaParametro<T>;
  /** Valor escalar como Decimal; lanza si el parámetro es una tabla u objeto. */
  get(clave: string, fecha: FechaInput): Decimal;
  /** Valor tal cual está en params.json (tablas, objetos). */
  value<T = unknown>(clave: string, fecha: FechaInput): T;
};

export function crearLectorParametros(data: ParametrosPais): LectorParametros {
  const errores = erroresParametros(data);
  if (errores.length > 0) {
    throw new Error(`params.json de "${data.country}" inválido:\n- ${errores.join("\n- ")}`);
  }

  function meta<T>(clave: string, fecha: FechaInput): MetaParametro<T> {
    const def = data.params[clave];
    if (!def) throw new ParametroNoEncontradoError(`Parámetro "${clave}" no existe para "${data.country}"`);
    const dia = toFechaISO(fecha);
    const entrada = def.history.find(
      (e) => compararFechas(e.from, dia) <= 0 && (e.to === null || compararFechas(dia, e.to) <= 0),
    );
    if (!entrada) {
      throw new ParametroNoEncontradoError(`Parámetro "${clave}" de "${data.country}" sin vigencia al ${dia}`);
    }
    return {
      clave,
      value: entrada.value as T,
      from: entrada.from,
      to: entrada.to,
      source: entrada.source,
      verified: entrada.verified ?? false,
    };
  }

  return {
    country: data.country,
    meta,
    value: <T>(clave: string, fecha: FechaInput) => meta<T>(clave, fecha).value,
    get(clave, fecha) {
      const { value } = meta(clave, fecha);
      if (typeof value !== "string") {
        throw new TypeError(`Parámetro "${clave}" no es un valor decimal escalar; usa value()`);
      }
      return new Decimal(value);
    },
  };
}

// Registro por país para la API de conveniencia getParam('pe', 'rmv', fecha).
const registro = new Map<string, LectorParametros>();

export function registrarParametros(data: ParametrosPais): LectorParametros {
  const lector = crearLectorParametros(data);
  registro.set(data.country, lector);
  return lector;
}

export function lectorDe(country: string): LectorParametros {
  const lector = registro.get(country);
  if (!lector) throw new ParametroNoEncontradoError(`No hay parámetros registrados para "${country}"`);
  return lector;
}

export function getParam(country: string, clave: string, fecha: FechaInput): Decimal {
  return lectorDe(country).get(clave, fecha);
}

export function getParamMeta<T = unknown>(country: string, clave: string, fecha: FechaInput): MetaParametro<T> {
  return lectorDe(country).meta<T>(clave, fecha);
}
