// Fechas de calendario sin hora ni zona horaria. Internamente se trabaja con
// "YYYY-MM-DD" para que el resultado no dependa de la zona del navegador o del CI.

export type FechaISO = string;
export type FechaInput = Date | FechaISO;

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

type YMD = { y: number; m: number; d: number }; // m: 1–12

function diasEnMes(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function parse(fecha: FechaISO): YMD {
  const match = ISO_RE.exec(fecha);
  if (!match) throw new RangeError(`Fecha inválida "${fecha}": se espera YYYY-MM-DD`);
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (m < 1 || m > 12 || d < 1 || d > diasEnMes(y, m)) {
    throw new RangeError(`Fecha inexistente "${fecha}"`);
  }
  return { y, m, d };
}

function format({ y, m, d }: YMD): FechaISO {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Normaliza a "YYYY-MM-DD". Un `Date` se lee en UTC, que es como JavaScript interpreta
 * `new Date("2026-10-01")`; así la fecha no se corre un día en Lima (UTC-5).
 */
export function toFechaISO(fecha: FechaInput): FechaISO {
  if (typeof fecha === "string") return format(parse(fecha));
  if (Number.isNaN(fecha.getTime())) throw new RangeError("Fecha inválida (Invalid Date)");
  return format({ y: fecha.getUTCFullYear(), m: fecha.getUTCMonth() + 1, d: fecha.getUTCDate() });
}

/** Compara dos fechas ISO: negativo si a < b, 0 si iguales, positivo si a > b. */
export function compararFechas(a: FechaInput, b: FechaInput): number {
  const [x, y] = [toFechaISO(a), toFechaISO(b)];
  return x < y ? -1 : x > y ? 1 : 0;
}

export function sumarDias(fecha: FechaInput, dias: number): FechaISO {
  const { y, m, d } = parse(toFechaISO(fecha));
  return toFechaISO(new Date(Date.UTC(y, m - 1, d + dias)));
}

/**
 * Inicio del mes número `meses` contado desde `inicio`. Si ese día no existe en el mes
 * destino, el mes empieza el día 1 del mes siguiente (inicio 31/01 → 2.º mes desde 01/03),
 * de modo que un mes iniciado el 31/01 se completa el 28/02.
 */
function inicioDeMes({ y, m, d }: YMD, meses: number): YMD {
  const total = y * 12 + (m - 1) + meses;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  if (d <= diasEnMes(ny, nm)) return { y: ny, m: nm, d };
  return nm === 12 ? { y: ny + 1, m: 1, d: 1 } : { y: ny, m: nm + 1, d: 1 };
}

/**
 * Tiempo de servicios entre dos fechas, ambas inclusive, en meses completos y días restantes.
 *
 * Convención: se cuentan meses completos por aniversario desde `desde` y el resto en días
 * calendario. Ej.: 15/03 al 30/06 = 3 meses (15/03–14/06) y 16 días (15/06–30/06);
 * 01/01 al 30/06 = 6 meses y 0 días; 31/01 al 28/02 = 1 mes (ver inicioDeMes).
 * Convención pendiente de confirmar por el usuario: docs/decisiones.md.
 *
 * Ojo: no equivale a "meses calendario completos" (gratificación, Ley 27735), que se
 * calcula con otra función en la Fase 1.
 */
export function mesesYDiasCompletos(desde: FechaInput, hasta: FechaInput): { meses: number; dias: number } {
  const inicio = toFechaISO(desde);
  const fin = toFechaISO(hasta);
  if (compararFechas(fin, inicio) < 0) {
    throw new RangeError(`La fecha final (${fin}) es anterior a la inicial (${inicio})`);
  }
  const ini = parse(inicio);
  const finExclusivo = sumarDias(fin, 1);

  const f = parse(finExclusivo);
  let meses = (f.y - ini.y) * 12 + (f.m - ini.m);
  if (compararFechas(format(inicioDeMes(ini, meses)), finExclusivo) > 0) meses -= 1;

  const corte = format(inicioDeMes(ini, meses));
  const msPorDia = 86_400_000;
  const a = parse(corte);
  const dias = Math.round((Date.UTC(f.y, f.m - 1, f.d) - Date.UTC(a.y, a.m - 1, a.d)) / msPorDia);
  return { meses, dias };
}
