import type { APIRoute } from "astro";
import { definicion } from "../calc";
import { site } from "../site.config";

// Sitemap del site: inicio, calculadoras publicadas y páginas institucionales.
export const GET: APIRoute = () => {
  const rutas = [
    "/",
    ...site.calculators.filter((c) => definicion(site.country, c.id)).map((c) => `/${c.slug}/`),
    "/parametros-vigentes/",
    "/sobre-nosotros/",
    "/contacto/",
    "/privacidad/",
    "/terminos/",
  ];
  const urls = rutas.map((r) => `  <url><loc>${new URL(r, site.url).href}</loc></url>`).join("\n");
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
