/**
 * Valida config/sites/*.yaml y config/countries/<pais>/params.json.
 *
 *   pnpm validate-config                         -> todo el directorio config/
 *   pnpm validate-config --params <archivo.json> -> solo ese params (útil para probar casos)
 *
 * Además del JSON Schema: vigencias sin solapamientos ni huecos, el país del site existe,
 * sus calculadoras están en calculators.yaml, y site_id / pages_project no se repiten.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv, type ValidateFunction } from "ajv";
import addFormatsModule from "ajv-formats";
import { parse as parseYaml } from "yaml";
import { erroresParametros, type ParametrosPais } from "@calc/core";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = join(ROOT, "config");

const ajv = new Ajv({ allErrors: true });
// ajv-formats publica CJS: según el cargador, la función llega directa o en .default.
const addFormats = ((addFormatsModule as unknown as { default?: unknown }).default ?? addFormatsModule) as (a: Ajv) => void;
addFormats(ajv);

const loadJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf-8"));
const loadYaml = (path: string): unknown => parseYaml(readFileSync(path, "utf-8"));
const rel = (path: string) => path.slice(ROOT.length + 1).replaceAll("\\", "/");

const validarSite = ajv.compile(loadJson(join(CONFIG, "schemas", "site.schema.json")) as object);
const validarParams = ajv.compile(loadJson(join(CONFIG, "schemas", "params.schema.json")) as object);

function erroresSchema(validar: ValidateFunction, data: unknown): string[] {
  if (validar(data)) return [];
  return (validar.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message}${e.params ? ` ${JSON.stringify(e.params)}` : ""}`);
}

function revisarParams(path: string): string[] {
  const data = loadJson(path);
  const schema = erroresSchema(validarParams, data);
  if (schema.length > 0) return schema;
  return erroresParametros(data as ParametrosPais);
}

type Site = { site_id: string; country: string; calculators: string[]; cloudflare: { pages_project: string } };

function revisarTodo(): Map<string, string[]> {
  const resultado = new Map<string, string[]>();
  const add = (archivo: string, errores: string[]) =>
    resultado.set(archivo, [...(resultado.get(archivo) ?? []), ...errores]);

  const countriesDir = join(CONFIG, "countries");
  for (const pais of readdirSync(countriesDir)) {
    const params = join(countriesDir, pais, "params.json");
    if (!existsSync(params)) {
      add(rel(join(countriesDir, pais)), ["falta params.json"]);
      continue;
    }
    const errores = revisarParams(params);
    const country = (loadJson(params) as { country?: string }).country;
    if (country && country !== pais) errores.push(`country "${country}" no coincide con la carpeta "${pais}"`);
    add(rel(params), errores);
  }

  const sitesDir = join(CONFIG, "sites");
  const vistos = { site_id: new Map<string, string>(), pages_project: new Map<string, string>() };
  for (const nombre of readdirSync(sitesDir).filter((f) => f.endsWith(".yaml"))) {
    const path = join(sitesDir, nombre);
    const data = loadYaml(path);
    const errores = erroresSchema(validarSite, data);
    add(rel(path), errores);
    // La plantilla solo se valida contra el schema; sus referencias (país xx) son ficticias.
    if (errores.length > 0 || nombre.startsWith("_")) continue;

    const site = data as Site;
    if (site.site_id !== basename(nombre, ".yaml")) {
      errores.push(`site_id "${site.site_id}" no coincide con el nombre del archivo`);
    }
    for (const [campo, valor] of [["site_id", site.site_id], ["pages_project", site.cloudflare.pages_project]] as const) {
      const previo = vistos[campo].get(valor);
      if (previo) errores.push(`${campo} "${valor}" repetido (también en ${previo})`);
      vistos[campo].set(valor, nombre);
    }
    const calcPath = join(countriesDir, site.country, "calculators.yaml");
    if (!existsSync(calcPath)) {
      errores.push(`no existe ${rel(calcPath)} para country "${site.country}"`);
    } else {
      const disponibles = Object.keys((loadYaml(calcPath) as object | null) ?? {});
      for (const id of site.calculators) {
        if (!disponibles.includes(id)) errores.push(`calculadora "${id}" no está en ${rel(calcPath)}`);
      }
    }
    add(rel(path), errores);
  }
  return resultado;
}

function main(): number {
  const i = process.argv.indexOf("--params");
  const resultado = new Map<string, string[]>();
  if (i !== -1) {
    const arg = process.argv[i + 1];
    if (!arg) {
      console.error("Uso: validate-config --params <archivo.json>");
      return 2;
    }
    const path = resolve(process.env.INIT_CWD ?? process.cwd(), arg);
    resultado.set(path.startsWith(ROOT) ? rel(path) : path, revisarParams(path));
  } else {
    for (const [k, v] of revisarTodo()) resultado.set(k, v);
  }

  let fallos = 0;
  for (const [archivo, errores] of resultado) {
    if (errores.length === 0) {
      console.log(`✓ ${archivo}`);
    } else {
      fallos += 1;
      console.error(`✗ ${archivo}\n  - ${errores.join("\n  - ")}`);
    }
  }
  return fallos === 0 ? 0 : 1;
}

process.exit(main());
