---
description: Actualiza un parámetro legal con vigencia y fuente, sin sobrescribir el historial
argument-hint: <pais> <clave> <valor> <desde YYYY-MM-DD> <fuente>
---
Actualiza el parámetro con `$ARGUMENTS`:

1. Abre `config/countries/<pais>/params.json`.
2. Cierra la entrada vigente: `to` = día anterior a la nueva fecha `from`.
3. Agrega la nueva entrada con `value` (string decimal), `from`, `to: null`, `source`, `verified: true` solo si la fuente es la norma oficial publicada.
4. Valida con `pnpm validate-config` (sin solapamientos ni huecos).
5. Corre `pnpm test`. Si un caso dorado depende de la fecha y cambia su resultado, NO lo modifiques: agrega un caso nuevo con la nueva fecha de referencia.
6. Lista qué páginas de caso cambiarán (ej. casos con `rmv`).
7. Commit `chore(params-<pais>): <clave> = <valor> desde <fecha> (<fuente>)`.
