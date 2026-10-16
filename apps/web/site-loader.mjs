// Carga config/sites/${SITE}.yaml y la config del país. Lo usan astro.config.mjs y las páginas.
// Ningún dominio, ID o token vive en el código: todo sale de la config y de variables de entorno.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

// Este módulo también se empaqueta para el prerender (dist/.prerender), donde import.meta.url ya
// no apunta a apps/web: astro.config.mjs fija CALC_REPO_ROOT antes de que eso ocurra.
export function repoRoot() {
  return process.env.CALC_REPO_ROOT || resolve(dirname(fileURLToPath(import.meta.url)), "../..");
}
const configDir = () => join(repoRoot(), "config");

const readYaml = (path) => parse(readFileSync(path, "utf-8"));

let envCargado = false;
function cargarEnvLocal() {
  // .env de la raíz para uso local; no sobrescribe variables ya definidas (CI, shell).
  if (envCargado) return;
  envCargado = true;
  const path = join(repoRoot(), ".env");
  if (existsSync(path) && typeof process.loadEnvFile === "function") process.loadEnvFile(path);
}

let cache;

/**
 * Resuelve el site. Las variables `*_env` se buscan primero con su nombre genérico
 * (ADSENSE_CLIENT, usado en CI) y luego con el del site (ADSENSE_CLIENT_PE, uso local).
 * Con STRICT_ENV=1 (deploy) el build falla si falta una variable requerida.
 */
export function loadSite(siteId = process.env.SITE || "pe") {
  if (cache?.siteId === siteId) return cache;
  cargarEnvLocal();

  const sitePath = join(configDir(), "sites", `${siteId}.yaml`);
  if (!existsSync(sitePath)) throw new Error(`No existe config/sites/${siteId}.yaml`);
  const site = readYaml(sitePath);
  const sufijo = `_${site.site_id.toUpperCase()}`;
  const faltantes = [];

  const env = (nombre, { requerida = true } = {}) => {
    if (!nombre) return undefined;
    const generico = nombre.endsWith(sufijo) ? nombre.slice(0, -sufijo.length) : nombre;
    const valor = process.env[generico] || process.env[nombre];
    if (!valor && requerida) faltantes.push(nombre);
    return valor || undefined;
  };

  const opcionales = new Set(site.analytics?.optional ?? []);
  const adsenseActivo = Boolean(site.adsense?.enabled);
  const slots = Object.fromEntries(
    Object.entries(site.adsense?.slots ?? {}).map(([k, nombre]) => [k.replace(/_env$/, ""), env(nombre, { requerida: adsenseActivo })]),
  );

  const catalogo = readYaml(join(configDir(), "countries", site.country, "calculators.yaml"));
  const calculators = site.calculators.map((id) => ({ id, ...catalogo[id] }));

  const resolved = {
    siteId: site.site_id,
    country: site.country,
    locale: site.locale,
    lang: site.locale.split("-")[0],
    currency: site.currency,
    timezone: site.timezone,
    domain: site.domain,
    url: `https://${site.domain}`,
    brand: site.brand,
    adsense: {
      enabled: adsenseActivo,
      client: env(site.adsense?.client_env, { requerida: adsenseActivo }),
      slots,
      // ADS_PREVIEW=1 dibuja los espacios reservados sin cargar AdSense (medir CLS y revisar el diseño).
      preview: process.env.ADS_PREVIEW === "1",
    },
    analytics: {
      cfBeaconToken: env(site.analytics?.cf_beacon_token_env, { requerida: !opcionales.has("cf_beacon_token_env") }),
      ga4Id: env(site.analytics?.ga4_id_env, { requerida: !opcionales.has("ga4_id_env") }),
    },
    consent: site.consent,
    calculators,
    legal: { ownerName: site.legal.owner_name, contactEmail: env(site.legal.contact_email_env) },
    glossary: readYaml(join(configDir(), "countries", site.country, "glossary.yaml")),
  };

  if (faltantes.length > 0) {
    const msg = `Faltan variables de entorno del site "${siteId}": ${faltantes.join(", ")}`;
    if (process.env.STRICT_ENV === "1") {
      // En GitHub Actions, como anotación legible sin abrir los logs.
      if (process.env.GITHUB_ACTIONS === "true") console.log(`::error title=Variables faltantes::${msg}`);
      throw new Error(msg);
    }
    if (!process.env.CI_BUILD) console.warn(`[site] ${msg} (se continúa: STRICT_ENV no está activo)`);
  }

  cache = resolved;
  return resolved;
}
