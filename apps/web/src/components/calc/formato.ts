// Formato para mostrar montos, fechas y porcentajes en la UI.

// Moneda del site (config/sites/<site>.yaml → locale, currency); la fija la isla al montarse.
let moneda = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", minimumFractionDigits: 2 });
export let simboloMoneda = "S/";

export function configurarMoneda(locale: string, currency: string, simbolo: string) {
  moneda = new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2 });
  simboloMoneda = simbolo;
}

/** Monto en la moneda del site: "S/ 2,180.00". */
export function soles(valor: string): string {
  return moneda.format(Number(valor));
}

export const esMonto = (s: string) => /^-?\d+\.\d{2}$/.test(s);

export function fecha(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function porcentaje(ratio: string): string {
  return `${Number((Number(ratio) * 100).toFixed(4))}%`;
}

/**
 * Normaliza lo que escribe la persona: "1,500.50" → "1500.50", "1500,5" → "1500.5", " 2 000 " → "2000".
 * Devuelve el texto tal cual si no parece un número (la validación del motor lo marcará).
 */
export function normalizarMonto(texto: string): string {
  let s = texto.replace(/[^\d.,-]/g, "");
  if (s.includes(",") && s.includes(".")) s = s.replace(/,/g, "");
  else if (/,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  else s = s.replace(/,/g, "");
  return s;
}

/** Fecha de hoy en hora local, como YYYY-MM-DD. */
export function hoyLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
