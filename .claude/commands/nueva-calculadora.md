---
description: Crea una nueva calculadora (fórmula + casos dorados + página) para un país
argument-hint: <pais> <concepto>
---
Crea la calculadora `$ARGUMENTS` siguiendo este orden estricto:

1. Lee `CLAUDE.md`, la sección del concepto en `docs/01-especificacion-funcional.md` y `docs/02-especificacion-tecnica.md` §5.
2. Si el concepto no está especificado en `docs/01`, DETENTE y pide al usuario la regla legal y su fuente.
3. Agrega los parámetros legales que falten a `config/countries/<pais>/params.json` (con `from`, `to`, `source`, `verified`).
4. Escribe primero los casos dorados en `packages/calc-<pais>/tests/fixtures/casos-dorados.json` (al menos 3: caso base, caso proporcional y caso límite). Muestra al usuario el cálculo manual de cada uno.
5. Implementa la función pura en `packages/calc-<pais>/src/<concepto>.ts`: validación zod, Decimal, `steps[]`, `parametrosUsados`, `baseLegal`, comentario con la norma y el artículo.
6. Corre `pnpm test` hasta que todo esté en verde.
7. Registra la calculadora en `config/countries/<pais>/calculators.yaml` y habilítala en el site correspondiente.
8. Verifica la página con `SITE=<site> pnpm --filter @calc/web build`.
9. Marca la tarea en `docs/04-roadmap.md` y haz commit `feat(calc-<pais>): <concepto>`.
