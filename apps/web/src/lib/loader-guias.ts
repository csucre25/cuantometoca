import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Loader } from "astro/loaders";
import { parse as parseYaml } from "yaml";
import { resolverMarcadores } from "./marcadores";

/**
 * Carga las guías Markdown de una carpeta, resuelve los marcadores {{calc:…}} / {{param:…}}
 * con el motor y renderiza el resultado. Se recalcula en cada build: si cambia un parámetro
 * (ej. la remuneración mínima), los montos de las guías cambian con él.
 */
export function guiasLoader(dir: string, opciones: Parameters<typeof resolverMarcadores>[1]): Loader {
  return {
    name: "guias-con-marcadores",
    load: async ({ store, parseData, renderMarkdown, generateDigest }) => {
      store.clear();
      if (!existsSync(dir)) return;
      for (const archivo of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
        const crudo = readFileSync(join(dir, archivo), "utf-8");
        const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(crudo);
        if (!m) throw new Error(`${archivo}: falta el frontmatter (--- … ---)`);
        const id = archivo.replace(/\.md$/, "");
        const data = await parseData({ id, data: parseYaml(m[1]!) as Record<string, unknown> });
        const cuerpo = resolverMarcadores(m[2]!, opciones);
        store.set({ id, data, body: cuerpo, rendered: await renderMarkdown(cuerpo), digest: generateDigest(cuerpo + JSON.stringify(data)) });
      }
    },
  };
}
