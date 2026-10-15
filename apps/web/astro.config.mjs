import { defineConfig } from "astro/config";
import preact from "@astrojs/preact";
import { loadSite, repoRoot } from "./site-loader.mjs";

// Salida 100% estática. `site` (dominio canónico) sale de config/sites/${SITE}.yaml.
process.env.CALC_REPO_ROOT ||= repoRoot();
const site = loadSite();

export default defineConfig({
  site: site.url,
  output: "static",
  integrations: [preact()],
  trailingSlash: "always",
  build: { format: "directory", inlineStylesheets: "always" },
});
