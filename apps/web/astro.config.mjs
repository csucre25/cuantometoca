import { defineConfig } from "astro/config";

// Salida 100% estática. El dominio (site) y el resto de la configuración por país
// se cargan desde config/sites/${SITE}.yaml en la tarea 2.1.
export default defineConfig({
  output: "static",
});
