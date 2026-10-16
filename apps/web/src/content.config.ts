import { join } from "node:path";
import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { loadSite, repoRoot } from "../site-loader.mjs";
import { guiasLoader } from "./lib/loader-guias";

// Guías editoriales del país del site: apps/web/content/<pais>/guias/*.md
// Solo se publican las aprobadas por el usuario (CLAUDE.md, regla 6).
const site = loadSite() as { country: string; locale: string; currency: string; glossary: { moneda: { simbolo: string } } };

const guias = defineCollection({
  loader: guiasLoader(join(repoRoot(), "apps", "web", "content", site.country, "guias"), {
    country: site.country,
    hoy: new Date().toISOString().slice(0, 10),
    moneda: { locale: site.locale, codigo: site.currency, simbolo: site.glossary.moneda.simbolo },
  }),
  schema: z.object({
    titulo: z.string(),
    descripcion: z.string(),
    /** ID de la calculadora (calculators.yaml): la guía se muestra debajo de ella. */
    calculadora: z.string().optional(),
    estado: z.enum(["borrador", "aprobado"]),
    actualizado: z.coerce.date(),
  }),
});

export const collections = { guias };
