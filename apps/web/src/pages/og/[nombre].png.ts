import type { APIRoute } from "astro";
import { definicion } from "../../calc";
import { configurarMoneda, soles } from "../../components/calc/formato";
import { pngOg } from "../../lib/og";
import { site } from "../../site.config";

// /og/inicio.png y /og/<slug>.png. El monto de ejemplo sale del motor de cálculo (CLAUDE.md, regla 6).
const hoy = new Date().toISOString().slice(0, 10);

export function getStaticPaths() {
  const calculadoras = site.calculators.filter((c) => definicion(site.country, c.id));
  return [{ params: { nombre: "inicio" } }, ...calculadoras.map((c) => ({ params: { nombre: c.slug } }))];
}

export const GET: APIRoute = async ({ params }) => {
  configurarMoneda(site.locale, site.currency, site.glossary.moneda.simbolo);
  const base = { marca: site.brand.name, simbolo: site.glossary.moneda.simbolo, color: site.brand.primary_color, pie: site.domain };
  const calc = site.calculators.find((c) => c.slug === params.nombre);
  const def = calc && definicion(site.country, calc.id);

  let png: Uint8Array;
  if (!calc || !def) {
    png = await pngOg({ ...base, titulo: "Calculadoras laborales", leyenda: site.brand.tagline });
  } else {
    const { valores, leyenda } = def.ejemplo(hoy);
    const r = def.calcular({ ...def.iniciales(hoy), ...valores }, hoy);
    png = await pngOg({ ...base, titulo: calc.nombre, leyenda, etiqueta: def.etiquetaTotal, monto: soles(r.total) });
  }
  return new Response(png as BodyInit, { headers: { "Content-Type": "image/png" } });
};
