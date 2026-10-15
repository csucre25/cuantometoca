---
description: Audita una fórmula contra la norma, la especificación y los casos dorados
argument-hint: <concepto>
---
Audita la calculadora `$ARGUMENTS`:

1. Compara la implementación con `docs/01-especificacion-funcional.md` línea por línea.
2. Verifica que no haya valores legales literales en el código (todo vía `getParam`).
3. Revisa redondeo (solo al final de cada concepto, half-up, 2 decimales) y uso de Decimal.
4. Propón 3 casos límite nuevos (0 meses, cambio de RMV a mitad del periodo, régimen MYPE) con su cálculo manual.
5. Entrega un informe breve: ✅ correcto / ⚠️ dudoso (con la norma a verificar) / ❌ error. No cambies código sin aprobación si el hallazgo es ⚠️.
