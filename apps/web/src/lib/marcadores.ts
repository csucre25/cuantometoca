import { paises } from "../calc";
import { configurarMoneda, porcentaje, soles, solesCorto } from "../components/calc/formato";

/*
 * Marcadores en textos editoriales (CLAUDE.md, regla 6: los números salen del motor, nunca del texto).
 *
 *   {{calc:gratificacion sueldo=1500 meses=6 campo=total}}  → "S/ 1,635.00"
 *   {{calc:cts sueldo=2000 campo=cts}}                      → monto de un concepto
 *   {{param:rmv}}                                           → "S/ 1,230.00"
 *   {{param:bonificacion_extraordinaria_essalud}}           → "9%"
 *   {{param:gratificacion_fechas_pago.julio}}               → "15 de julio"
 *   {{param:cts_retiro_extraordinario.hasta}}               → "31 de diciembre de 2026"
 *   {{monto:1500}}                                          → "S/ 1,500" (un monto de entrada de un ejemplo)
 *   {{param:horas_extras_recargos.primeras_2h|pct}}         → "25%" (formato explícito: pct, soles)
 *
 * Los parámetros del cálculo son los mismos campos del formulario (los de la URL compartible).
 * Un marcador desconocido o un cálculo inválido lanza error: el build falla en vez de publicar algo mal.
 */

const MARCADOR = /\{\{\s*(calc|param|monto):([^}]+?)\s*\}\}/g;

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

type Moneda = { locale: string; codigo: string; simbolo: string };

export function resolverMarcadores(texto: string, opciones: { country: string; hoy: string; moneda: Moneda }): string {
  const pais = paises[opciones.country];
  if (!pais) throw new Error(`País sin calculadoras: ${opciones.country}`);
  configurarMoneda(opciones.moneda.locale, opciones.moneda.codigo, opciones.moneda.simbolo);

  return texto.replace(MARCADOR, (original, tipo: string, cuerpo: string) => {
    try {
      if (tipo === "monto") return solesCorto(cuerpo.trim());
      if (tipo === "param") return valorParametro(cuerpo.trim(), opciones.hoy, pais.params.params);
      return valorCalculo(cuerpo.trim(), opciones.hoy, pais.definiciones);
    } catch (e) {
      throw new Error(`Marcador inválido ${original}: ${(e as Error).message}`);
    }
  });
}

function valorCalculo(cuerpo: string, hoy: string, definiciones: (typeof paises)[string]["definiciones"]): string {
  const [id, ...pares] = cuerpo.split(/\s+/);
  const def = definiciones[id!];
  if (!def) throw new Error(`calculadora "${id}" no existe`);
  const args = Object.fromEntries(pares.map((p) => p.split("=") as [string, string]));
  const { campo = "total", ...valores } = args;
  const r = def.calcular({ ...def.iniciales(hoy), ...valores }, hoy);
  if (campo === "total") return soles(r.total);
  const concepto = r.conceptos.find((c) => c.id === campo);
  if (!concepto) throw new Error(`el resultado no tiene el concepto "${campo}" (hay: ${r.conceptos.map((c) => c.id).join(", ") || "ninguno"})`);
  return soles(concepto.monto);
}

function valorParametro(marcador: string, hoy: string, params: (typeof paises)[string]["params"]["params"]): string {
  const [ruta, formato] = marcador.split("|").map((x) => x.trim()) as [string, string | undefined];
  const [clave, ...sub] = ruta.split(".");
  const def = params[clave!];
  if (!def) throw new Error(`parámetro "${clave}" no existe`);
  const entrada = def.history.find((e) => e.from <= hoy && (e.to === null || hoy <= e.to));
  if (!entrada) throw new Error(`parámetro "${clave}" sin vigencia al ${hoy}`);
  let valor: unknown = entrada.value;
  for (const k of sub) valor = (valor as Record<string, unknown> | undefined)?.[k];
  if (typeof valor !== "string") throw new Error(`"${ruta}" no es un valor simple`);
  if (formato === "pct") return porcentaje(valor);
  if (formato === "soles") return soles(valor);
  if (formato) throw new Error(`formato "${formato}" desconocido (usa pct o soles)`);
  if (/^\d{2}-\d{2}$/.test(valor)) return `${Number(valor.slice(3))} de ${MESES[Number(valor.slice(0, 2)) - 1]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return `${Number(valor.slice(8))} de ${MESES[Number(valor.slice(5, 7)) - 1]} de ${valor.slice(0, 4)}`;
  if (def.unit === "PEN") return soles(valor);
  if (def.unit === "ratio") return porcentaje(valor);
  return valor;
}
