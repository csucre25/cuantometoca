# 02 — Especificación técnica

## 1. Visión general
```
                        ┌─────────────── GitHub (repo) ───────────────┐
 config/sites/*.yaml ──►│ apps/web (Astro SSG)  ◄── packages/calc-<pais> │
 config/countries/*  ──►│        ▲                    ▲                  │
                        │        │ content/<pais>/*.md (aprobado)        │
                        └────────┼────────────────────┼─────────────────┘
                                 │                    │
         pipeline/ (Python) ─────┘  PR/commit         │ GitHub Actions (matrix por site)
   - vigila normas (El Peruano, SBS)                  ▼
   - propone cambios de params                wrangler pages deploy
   - redacta borradores (LLM NVIDIA)          (cuenta Cloudflare del site)
   - bot Telegram del site (aprobación)               ▼
                                              https://<dominio-del-site>
```
- **Sin backend público.** El sitio es HTML estático + JS mínimo para las calculadoras.
- El **pipeline** corre en GitHub Actions (tareas ligeras, programadas) y en la PC del usuario vía Docker (bot de Telegram en modo polling y tareas pesadas).

## 2. Estructura del repositorio
```
.
├── CLAUDE.md
├── .claude/                      # settings y comandos de Claude Code
├── config/
│   ├── sites/
│   │   ├── _template.yaml        # plantilla documentada
│   │   └── pe.yaml               # site Perú (dominio, cuentas, adsense, bot)
│   └── countries/
│       └── pe/
│           ├── params.json       # parámetros legales con vigencia
│           ├── calculators.yaml  # calculadoras habilitadas + matriz de casos SEO
│           └── glossary.yaml     # vocabulario local (ej. "grati", "CTS")
├── packages/
│   ├── core/                     # getParam, redondeo, tipos ResultadoCalculo, fechas
│   └── calc-pe/
│       ├── src/{gratificacion,cts,vacaciones,liquidacion,utilidades,renta5ta,pensiones,horasExtras}.ts
│       └── tests/fixtures/*.json # casos dorados
├── apps/web/                     # Astro
│   ├── src/
│   │   ├── site.config.ts        # carga config/sites/${SITE}.yaml
│   │   ├── layouts/ components/ (Calculadora, Desglose, AdSlot, Aviso)
│   │   └── pages/[...slug].astro # rutas generadas desde calculators.yaml + content
│   └── content/<pais>/           # guías y textos aprobados (Markdown)
├── pipeline/                     # Python 3.12, uv
│   ├── pyproject.toml
│   └── src/pipeline/
│       ├── cli.py                # Typer
│       ├── config.py             # carga sites/*.yaml + env
│       ├── watchers/             # elperuano.py, sbs_afp.py
│       ├── llm/client.py         # cliente OpenAI-compatible (NVIDIA por defecto)
│       ├── drafts/               # generación de borradores de texto
│       ├── bot/                  # bot de Telegram (aiogram 3)
│       └── store.py              # SQLite local (estado, colas, hashes)
├── scripts/                      # utilidades (validar config, listar sites habilitados)
├── .github/workflows/            # ci.yml, deploy.yml, watchers.yml
├── docker-compose.yml            # bot + worker en la PC del usuario
└── .env.example
```

## 3. Configuración multi-site (clave del diseño)

### 3.1 `config/sites/<site>.yaml`
Un *site* = un país + un dominio + una cuenta de Cloudflare + un bot. Campos (ver `_template.yaml`):
- `site_id`, `country`, `enabled`, `locale`, `currency`, `timezone`.
- `domain` (canónico, sin protocolo), `brand` (nombre, tagline, colores).
- `cloudflare`: `pages_project`, `account_id_env`, `api_token_env` → **nombres** de variables de entorno, nunca valores.
- `telegram`: `bot_token_env`, `admin_chat_id_env`.
- `adsense`: `client_env` (ID `ca-pub-…`), slots por posición, `enabled`.
- `analytics`: `cf_beacon_token_env`, `ga4_id_env` (opcional).
- `calculators`: lista de IDs habilitados (deben existir en `countries/<pais>/calculators.yaml`).
- `legal`: nombre del responsable, email de contacto (para páginas legales).

### 3.2 Reglas
- `SITE` (variable de entorno) selecciona el site en build: `SITE=pe pnpm build`.
- El build **falla** si falta una variable referenciada por `*_env` (excepto las marcadas `optional`).
- Dos sites pueden compartir país (ej. un dominio de marca distinta para Perú) sin duplicar parámetros.
- Agregar un país: `config/sites/<site>.yaml` + `config/countries/<pais>/` + `packages/calc-<pais>`. El núcleo (`core`, `apps/web`) no cambia.

### 3.3 Secretos por site en GitHub Actions
Convención: `CF_API_TOKEN_PE`, `CF_ACCOUNT_ID_PE`, `ADSENSE_CLIENT_PE`, `TELEGRAM_BOT_TOKEN_PE`, `TELEGRAM_ADMIN_CHAT_ID_PE`. El YAML del site referencia esos nombres. En el workflow:
```yaml
env:
  CLOUDFLARE_API_TOKEN: ${{ secrets[format('CF_API_TOKEN_{0}', matrix.site_upper)] }}
  CLOUDFLARE_ACCOUNT_ID: ${{ secrets[format('CF_ACCOUNT_ID_{0}', matrix.site_upper)] }}
```
Así cada site despliega en su propia cuenta de Cloudflare.

## 4. Parámetros legales con vigencia

### 4.1 Formato (`config/countries/pe/params.json`)
```json
{
  "country": "pe",
  "params": {
    "rmv": {
      "unit": "PEN",
      "history": [
        { "value": "1130.00", "from": "2025-01-01", "to": "2026-09-30", "source": "DS 006-2024-TR" },
        { "value": "1230.00", "from": "2026-10-01", "to": null, "source": "DS 015-2026-TR" }
      ]
    }
  }
}
```
- `value` siempre como string decimal.
- `to: null` = vigente.
- Validación con JSON Schema (`config/schemas/params.schema.json`): sin solapamientos ni huecos de fechas, fuente obligatoria.

### 4.2 API (`packages/core`)
```ts
getParam(country: string, key: string, date: Date | string): Decimal   // lanza si no existe vigencia
getParamMeta(country, key, date): { value, from, to, source }
```
Cada resultado incluye `parametrosUsados` (para mostrar "RMV S/ 1,230 vigente desde 01/10/2026 – DS 015-2026-TR").

### 4.3 Actualización
- El watcher detecta normas candidatas → el bot de Telegram avisa con el enlace → el usuario confirma el valor y la fecha de vigencia → el pipeline crea un commit/PR que **agrega** una entrada al `history` (nunca sobrescribe). CI corre los casos dorados.
- Valores dependientes (asignación familiar = 10% RMV) **no** se guardan: se derivan en el motor.

## 5. Motor de cálculo (`packages/calc-pe`)
- TypeScript estricto, sin dependencias de DOM. Dependencias: `decimal.js`, `zod`, `date-fns`.
- Una función por concepto: `calcularGratificacion(input, ctx) → ResultadoCalculo`. `ctx` trae `country`, `fechaReferencia` y el lector de parámetros.
- Funciones auxiliares compartidas: `mesesYDiasCompletos(desde, hasta)`, `remuneracionComputable(...)`, `factorRegimen(regimen, concepto)`.
- **Tests**: vitest. Cada fixture es `{ id, descripcion, input, fechaReferencia, esperado: { total, conceptos? } }`. Un test genérico recorre todos los fixtures. Cobertura mínima del paquete: 95%.
- El motor se usa en dos lugares: en el navegador (calculadora interactiva) y en build (páginas de caso precalculadas). **Una sola implementación.**

## 6. Frontend (`apps/web`)
- **Astro** con salida `static`. Islas de interactividad para las calculadoras con **Preact** (liviano) o JS vanilla; nada de React completo.
- Estilos: CSS propio con variables (o Tailwind si se justifica). Tipografía del sistema para no cargar fuentes.
- Rutas generadas en build desde `calculators.yaml` (calculadoras + casos) y `content/<pais>/` (guías).
- Componentes clave:
  - `Calculadora.astro` + isla `CalcForm` (lee/escribe query string para compartir).
  - `Desglose` (acordeón con `steps` y `parametrosUsados`).
  - `AdSlot` (espacio reservado con dimensiones fijas; no renderiza si `adsense.enabled=false` o en desarrollo).
  - `Aviso` legal, `Breadcrumbs`, `FAQ` (con schema FAQPage solo si el contenido es único).
- SEO técnico: `sitemap.xml` y `robots.txt` generados por site; canonical con el dominio del site; datos estructurados `WebApplication`/`SoftwareApplication` para calculadoras y `BreadcrumbList`; `hreflang` entre sites de países distintos cuando exista contenido equivalente.
- `ads.txt` generado desde `adsense.client` del site.
- Páginas legales generadas desde plantilla + `legal` del site: privacidad, términos, contacto, "sobre nosotros".

## 7. Pipeline (`pipeline/`)
- Python 3.12, `uv`, `httpx` (también para el LLM: endpoint estándar `/chat/completions`, sin SDK de proveedor), `selectolax` (HTML, backend lexbor), `pymupdf` (PDF), `pydantic`, `typer`, `aiogram` 3, `tenacity` (reintentos), `sqlite3`.
- `config.py` carga `config/sites/*.yaml` y resuelve variables de entorno. **Resolución de secretos**: primero la variable genérica (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID`, `CLOUDFLARE_API_TOKEN`…, usadas en CI donde ya se filtró el site), luego el nombre indicado en `*_env` del site (uso local con varios sites en un mismo `.env`). Lo mismo aplica en `apps/web/src/site.config.ts` (`ADSENSE_CLIENT` → `ADSENSE_CLIENT_PE`).
- **Watchers** (idempotentes, con hash de contenido en SQLite):
  - `elperuano`: busca en normas legales del día términos como "Remuneración Mínima Vital", "Unidad Impositiva Tributaria", "gratificación", "compensación por tiempo de servicios", "utilidades", "AFP". Resultado: alerta con título, enlace y extracto.
  - `sbs_afp`: obtiene comisiones, prima de seguro y tope de remuneración asegurable vigentes; si cambian, propone actualización de params.
- **LLM** (`llm/client.py`): POST a `${LLM_BASE_URL}/chat/completions` con `LLM_API_KEY`, modelo por tarea: `LLM_MODEL` para borradores y uso general (por defecto `nvidia/nemotron-3-super-120b-a12b`) y `LLM_MODEL_EXTRACT` para extraer datos de normas (por defecto `nvidia/nemotron-3-ultra-550b-a55b`; si no está definida, se usa `LLM_MODEL`). Reintentos con backoff ante 429. Proveedor de respaldo opcional (`LLM_FALLBACK_*`, ej. Ollama local `http://localhost:11434/v1`) **solo para borradores**: si la extracción falla en el proveedor principal, se avisa por Telegram y se reintenta en la siguiente corrida, nunca se propone un parámetro extraído por el modelo de respaldo. Las extracciones fallidas quedan en `extraction_queue` y se reintentan en cada `params-check`.
  - Uso permitido: extraer el valor y la fecha de vigencia desde el texto de una norma (salida JSON validada con pydantic), redactar borradores de guías/FAQ y textos de redes. **Nunca** generar números de cálculo.
- **Bot de Telegram** (uno por site, token por configuración): ver `docs/03-flujo-de-trabajo.md`.
- **Store**: SQLite en `pipeline/data/<site>.db` (no versionado): `seen_items`, `drafts`, `param_proposals`, `events`.

## 8. CI/CD
- `ci.yml` (en cada push/PR): validar config (schemas), tests TS, tests Python, build de cada site habilitado.
- `deploy.yml` (push a `main` o manual): job `sites` lista los sites habilitados → matrix → build con `SITE=<id>` → `wrangler pages deploy apps/web/dist --project-name=<pages_project> --branch=main` con los secretos de ese site.
- `watchers.yml` (cron diario 07:15 hora Lima = 12:15 UTC, y manual): corre `params-check` por país y envía alertas a Telegram.
- Agrupar publicaciones: no más de ~10 deploys por día por site (límite de builds en el plan gratuito).

## 9. Ejecución local (PC del usuario)
`docker-compose.yml` con:
- `bot-pe`: bot de Telegram en polling (siempre activo mientras la PC esté encendida).
- `worker`: tareas pesadas a demanda (generación masiva de borradores).
Límites recomendados en `.wslconfig` (memoria 8 GB, 4 CPU). Comandos `/pausa` y `/reanudar` del bot detienen el worker.

## 10. Seguridad
- Secretos solo en `.env` (local, en `.gitignore`) y GitHub Secrets.
- Token de Cloudflare con permiso mínimo: *Account → Cloudflare Pages → Edit* sobre la cuenta del site.
- El bot ignora mensajes de chats distintos a `admin_chat_id`.
- Sin datos personales de usuarios: los cálculos no salen del navegador.
