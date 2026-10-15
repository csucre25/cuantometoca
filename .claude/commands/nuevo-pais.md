---
description: Crea el esqueleto de un nuevo país/site sin tocar el núcleo
argument-hint: <codigo-pais> (ej. cl, co, mx)
---
Crea el esqueleto del país `$ARGUMENTS`:

1. Copia `config/sites/_template.yaml` a `config/sites/$ARGUMENTS.yaml` con `enabled: false` y sufijos de variables `_${ARGUMENTS^^}`.
2. Crea `config/countries/$ARGUMENTS/` con `params.json` (estructura vacía válida), `calculators.yaml` y `glossary.yaml`.
3. Crea `packages/calc-$ARGUMENTS/` copiando la estructura de `packages/calc-pe` SIN fórmulas (solo tipos, index y un test vacío).
4. Registra el paquete en el workspace y en el cargador de módulos de cálculo de `apps/web` (debe resolverse por `country`, sin `if` por país en componentes).
5. Lista al usuario: beneficios laborales típicos de ese país a investigar, variables de entorno a crear (`CF_ACCOUNT_ID_*`, `CF_API_TOKEN_*`, `TELEGRAM_*`, `ADSENSE_*`) y dominios candidatos según `docs/06-dominios-y-marca.md`.
6. No implementes fórmulas sin especificación aprobada por el usuario.
