# 04 — Roadmap

Marca `[x]` al completar. Cada tarea tiene un criterio de aceptación (CA). No avances de fase sin cumplir los CA de la anterior.

## Fase 0 — Cimientos (1–2 sesiones)
- [x] 0.1 Monorepo pnpm (`apps/web`, `packages/core`, `packages/calc-pe`) + `pipeline/` con uv. **CA**: `pnpm install`, `pnpm test` y `uv run pytest` corren (aunque sin tests reales); `pnpm-lock.yaml` y `pipeline/uv.lock` versionados (los workflows usan `--frozen`). El pipeline lee `CONFIG_DIR` y `REPO_DIR` (por defecto, rutas relativas a la raíz del repo).
  - Nota: los paquetes TS se consumen desde `src/` (sin paso de build). Node ≥ 22.12 (lo exige Astro 7). Pipeline fijado a Python 3.12 (`pipeline/.python-version`). `@calc/web` es una página provisional que compila.
- [x] 0.2 JSON Schemas para `config/sites/*.yaml` y `config/countries/*/params.json` + script `scripts/validate-config.ts`. **CA**: los archivos de ejemplo validan; un params con solapamiento de fechas falla.
  - Nota: el chequeo de solapamientos/huecos vive en `@calc/core` (`erroresParametros`) y lo usan el script y la carga en runtime. Fixture negativo: `pnpm validate-config --params scripts/fixtures/params-solapado.json`. También verifica que las calculadoras del site existan en `calculators.yaml`.
- [x] 0.3 `packages/core`: `getParam`, `getParamMeta`, utilidades Decimal, `mesesYDiasCompletos`, tipo `ResultadoCalculo`. **CA**: tests de vigencia por fecha (RMV 30/09/2026 = 1130; 01/10/2026 = 1230).
  - Nota: convención de `mesesYDiasCompletos` y del redondeo del total pendientes de confirmar (ver `docs/decisiones.md`).
- [ ] 0.4 CI (`ci.yml`) con validación de config + tests. **CA**: verde en GitHub.

## Fase 1 — Motor de cálculo Perú (2–4 sesiones)
- [ ] 1.1 Gratificación (incluye trunca). **CA**: fixtures G1–G6 pasan.
- [ ] 1.2 CTS. **CA**: C1–C4.
- [ ] 1.3 Vacaciones truncas. **CA**: V1.
- [ ] 1.4 Indemnización + liquidación completa. **CA**: L1 + un caso integral de liquidación (agregar fixture verificado manualmente).
- [ ] 1.5 Utilidades (exacto y estimado). **CA**: U1.
- [ ] 1.6 Renta de 5ta anual. **CA**: R1.
- [ ] 1.7 Pensiones ONP/AFP (con params SBS de ejemplo marcados `"verified": false`). **CA**: tests con valores ficticios documentados.
- [ ] 1.8 Horas extras. **CA**: un caso con 2 h al 25% + 1 h al 35%.
- [ ] 1.9 Revisión: cada función cita su base legal en comentarios y devuelve `steps` legibles.

## Fase 2 — Sitio web Perú MVP (2–3 sesiones)
- [ ] 2.1 Astro: carga de `config/sites/${SITE}.yaml`, layout, header, footer, páginas legales generadas. **CA**: `SITE=pe pnpm build` sin dominios hardcodeados (`grep` limpio).
- [ ] 2.2 Componente calculadora + desglose + query string compartible. **CA**: gratificación y CTS funcionales en móvil.
- [ ] 2.3 Resto de calculadoras en la UI.
- [ ] 2.4 `AdSlot` con espacio reservado + `ads.txt` desde config. **CA**: CLS = 0 en Lighthouse con slots vacíos.
- [ ] 2.5 SEO técnico: sitemap, robots, canonical, schema, OG images estáticas por calculadora. **CA**: Lighthouse SEO ≥ 95, rendimiento móvil ≥ 90.
- [ ] 2.6 Página "Parámetros vigentes" generada desde params.
- [ ] 2.7 Guías editoriales base (una por beneficio), redactadas con LLM y revisadas por el usuario.

## Fase 3 — Despliegue configurable (1 sesión)
- [ ] 3.1 `deploy.yml` con matrix de sites habilitados y secretos por sufijo. **CA**: deploy a la cuenta de Cloudflare del site `pe` usando solo secretos.
- [ ] 3.2 Documentar en `README.md` cómo conectar un dominio nuevo y una cuenta nueva de Cloudflare.
- [ ] 3.3 Cloudflare Web Analytics vía config.

## Fase 4 — Pipeline y bot (2–3 sesiones)
- [ ] 4.1 `config.py` + `store.py` (SQLite) + CLI Typer.
- [ ] 4.2 Watcher El Peruano (con fixtures HTML guardados para tests offline).
- [ ] 4.3 Watcher SBS (comisiones AFP, prima, tope).
- [ ] 4.4 Cliente LLM compatible OpenAI con fallback + extracción estructurada de normas (pydantic).
- [ ] 4.5 Bot de Telegram del site: aprobación de parámetros y borradores, comandos de `docs/03`.
- [ ] 4.6 Commit/PR automático de parámetros confirmados.
- [ ] 4.7 `watchers.yml` (cron) y `docker-compose.yml` (bot local).

## Fase 5 — SEO programático y contenido (continuo)
- [ ] 5.1 Matriz de casos en `calculators.yaml` (empezar con ~150 páginas de alto valor, ver `docs/05`).
- [ ] 5.2 Shortcodes `{{calc:...}}` resueltos en build.
- [ ] 5.3 Enlazado interno automático (casos vecinos, guías relacionadas).
- [ ] 5.4 Generador de textos para redes desde el bot (guiones de `docs/08`).
- [ ] 5.5 Medir en Search Console y podar páginas sin impresiones a los 90 días (noindex o fusión).

## Fase 6 — AdSense y optimización
- [ ] 6.1 Solicitar AdSense cuando haya ≥ 20 páginas útiles + legales + dominio propio.
- [ ] 6.2 Ubicaciones: debajo del resultado (la de mayor valor), dentro del desglose, al final de la guía. Evitar anuncios encima del formulario.
- [ ] 6.3 Experimentos de ubicación (una variable a la vez, 2 semanas).

## Fase 7 — Multipaís (cuando Perú supere ~50k PV/mes)
- [ ] 7.1 Chile (`cl`): finiquito, gratificación legal, vacaciones proporcionales, sueldo líquido (AFP + salud + impuesto único).
- [ ] 7.2 Colombia (`co`): prima de servicios, cesantías e intereses, liquidación, vacaciones.
- [ ] 7.3 México (`mx`): aguinaldo, finiquito/liquidación, PTU, ISR, prima vacacional.
- [ ] 7.4 Regímenes especiales de Perú: agrario (Ley 31110), construcción civil, modo empleador (costo total del trabajador).
