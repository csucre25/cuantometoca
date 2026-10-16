---
description: Checklist previo a publicar un site
argument-hint: <site_id>
---
Prepara la publicación del site `$ARGUMENTS` (no ejecutes el deploy; eso lo hace GitHub Actions):

1. `pnpm validate-config` y `pnpm test` en verde.
2. `SITE=$ARGUMENTS pnpm --filter @calc/web build` sin advertencias.
3. `grep` del dominio real en `apps/` y `packages/`: debe estar vacío.
4. Confirma que existen `ads.txt` (si `adsense.enabled`), `robots.txt`, `sitemap.xml` y las páginas legales en `apps/web/dist`.
5. Revisa que ningún parámetro usado en páginas publicadas tenga `verified: false`; si lo hay, lístalo y pregunta al usuario.
6. **Revisión legal final**: recorre `docs/09-revision-legal.md` (sección 9). Reporta cada punto 🔴 como cumplido o no; si alguno falla, detente y no sugieras el deploy. Si este despliegue activa AdSense o GA4, exige también los 🟡 indicados. Actualiza la tabla "Estado conocido" del documento.
7. Resume los cambios desde el último deploy (git log), incluye el resultado de la revisión legal para el PR y sugiere el mensaje de commit/tag.
