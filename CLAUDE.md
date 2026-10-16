# CLAUDE.md — Calculadoras Laborales (multipaís, inicio Perú)

Lee este archivo completo antes de cualquier tarea. Después lee el documento de `docs/` que corresponda a la tarea.

## Qué es este proyecto
Red de sitios estáticos de **calculadoras de beneficios laborales** (gratificación, CTS, vacaciones, liquidación, utilidades, renta de 5ta, AFP/ONP, horas extras), monetizada con Google AdSense.
- Fase actual: **Perú** (`site_id: pe`).
- Arquitectura **multipaís desde el día 1**: cada país es un *site* con su propio dominio, cuenta de Cloudflare, bot de Telegram, AdSense y parámetros legales. Agregar un país = agregar configuración + un paquete de cálculo, **sin tocar el núcleo**.

Objetivo de negocio y métricas: `docs/00-vision-y-objetivo.md`.

## Mapa de documentación
| Necesitas… | Lee |
|---|---|
| Qué hace cada calculadora y sus fórmulas | `docs/01-especificacion-funcional.md` |
| Arquitectura, estructura, modelo de datos, deploy | `docs/02-especificacion-tecnica.md` |
| Cómo trabajamos día a día (pipeline, aprobaciones, releases) | `docs/03-flujo-de-trabajo.md` |
| Qué construir y en qué orden | `docs/04-roadmap.md` |
| Keywords, tipos de página, calendario estacional | `docs/05-seo-y-contenido.md` |
| Dominios y marca | `docs/06-dominios-y-marca.md` |
| AdSense, páginas legales, avisos | `docs/07-monetizacion-y-politicas.md` |
| Guiones y distribución en redes | `docs/08-distribucion-social.md` |
| Riesgos legales, privacidad y revisión final antes de desplegar | `docs/09-revision-legal.md` |

## Stack (no cambiar sin aprobación del usuario)
- **Monorepo pnpm** — `apps/web` (Astro, salida 100% estática), `packages/core` (motor de parámetros y utilidades, TypeScript), `packages/calc-pe` (fórmulas de Perú, TypeScript puro sin dependencias de UI).
- **Pipeline en Python 3.12** — `pipeline/` (vigilancia de normas, actualización de parámetros, borradores de contenido con LLM, bot de Telegram). Gestión con `uv`.
- **LLM**: API compatible con OpenAI; por defecto NVIDIA (`LLM_BASE_URL`, `LLM_MODEL` configurables). Nunca acoplar el código a un proveedor.
- **Hosting**: Cloudflare Pages vía `wrangler pages deploy` (direct upload desde GitHub Actions). La cuenta se elige por configuración, nunca por código.

## Reglas inquebrantables
1. **Cero valores legales en el código.** RMV, UIT, tasas, porcentajes, topes y fechas viven en `config/countries/<pais>/params.json` con vigencia (`from`/`to`) y fuente legal. El código pide `getParam('pe', 'rmv', fecha)`.
2. **Cero dominios, IDs de cuenta, tokens o IDs de AdSense en el código.** Todo sale de `config/sites/<site>.yaml` + variables de entorno. `grep` de un dominio real en `apps/` o `packages/` debe devolver vacío.
3. **Toda fórmula tiene tests con casos dorados** (`packages/calc-pe/tests/fixtures/casos-dorados.json`). Ningún cambio en una fórmula se integra si un caso dorado falla. Si un caso dorado parece incorrecto, NO lo cambies: repórtalo al usuario con la norma que lo contradice.
4. **El motor de cálculo es puro**: funciones sin efectos secundarios, entradas validadas con `zod`, salidas con desglose paso a paso (`steps[]`) para mostrar al usuario cómo se llegó al número.
5. **Redondeo**: se calcula con precisión completa y se redondea a 2 decimales (half-up) **solo** al final de cada concepto. Usar enteros en céntimos o `decimal.js`, nunca aritmética flotante directa para montos finales.
6. **Contenido generado por LLM nunca se publica sin aprobación** por el bot de Telegram. Los números en un texto siempre vienen del motor de cálculo, jamás del LLM.
7. **SEO programático con valor real**: no crear páginas que solo cambian un número sin desglose propio. Ver reglas en `docs/05-seo-y-contenido.md`.
8. **Rendimiento**: cada página < 100 KB de JS, LCP < 2.5 s en móvil. Los anuncios no deben causar CLS (reservar espacio).
9. Español neutro peruano en la UI de Perú; cada país usa su vocabulario (`config/sites/<site>.yaml` → `locale`, glosario).

## Comandos
```bash
pnpm install
pnpm --filter @calc/web dev              # SITE=pe por defecto
SITE=pe pnpm --filter @calc/web build    # build de un país
pnpm test                                # vitest en todos los paquetes
cd pipeline && uv sync && uv run pytest
uv run python -m pipeline.cli params-check --country pe    # vigila cambios normativos
uv run python -m pipeline.cli bot --site pe                # bot de Telegram del site
```

## Comandos personalizados de Claude Code
- `/nueva-calculadora <pais> <concepto>` — scaffolding de fórmula + tests + página.
- `/nuevo-pais <codigo>` — crea site, paquete de cálculo y parámetros vacíos.
- `/actualizar-parametros <pais>` — revisa la norma, actualiza `params.json` con vigencia y fuente.
- `/revisar-calculo <concepto>` — audita una fórmula contra la norma y los casos dorados.
- `/publicar <site>` — checklist previo a deploy.

## Cómo trabajar en este repo
- Avanza por el roadmap (`docs/04-roadmap.md`) tarea por tarea; marca `[x]` al terminar y deja nota breve si algo cambió.
- Antes de implementar una fórmula, cita en el código (comentario) la norma y artículo.
- Si una regla legal es ambigua o no está en `docs/01`, **pregunta** antes de asumir.
- Al tocar formularios, URL, anuncios, analítica, textos legales o contenido LLM, revisa la sección correspondiente de `docs/09-revision-legal.md`. Ningún deploy a producción sin su revisión final (`/publicar`).
- Commits pequeños, en español, formato `tipo(ámbito): mensaje` (ej. `feat(calc-pe): gratificación trunca`).
- No instales dependencias nuevas sin justificarlo en el PR/commit.

## Lo que NO debes hacer
- No uses SSR ni funciones de servidor: el sitio es estático.
- No agregues trackers aparte de los definidos en config (Cloudflare Web Analytics, GA4 opcional).
- No copies texto de otros sitios de calculadoras ni de estudios contables.
- No borres casos dorados ni bajes umbrales de tests para "hacer pasar" algo.
