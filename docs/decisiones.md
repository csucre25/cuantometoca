# Registro de decisiones y dudas

Formato: fecha · decisión o duda · motivo · estado (abierta / resuelta por el usuario).

- 2026-10-15 · Sitio 100% estático (Astro) en Cloudflare Pages, sin backend público · costo 0 y sin mantenimiento de servidores · resuelta.
- 2026-10-15 · Un site por país con dominio, cuenta de Cloudflare, AdSense y bot propios, todo por configuración · requisito del usuario · resuelta.
- 2026-10-15 · Motor de cálculo en TypeScript (no Python) · debe correr en el navegador y en build con una sola implementación · resuelta.
- 2026-10-15 · Parámetros con vigencia por fecha · la RMV cambió el 01/10/2026 (S/ 1,130 → S/ 1,230, DS 015-2026-TR) y tendrá un segundo tramo en 2027 · resuelta.
- 2026-10-15 · Gratificación: solo meses calendario completos · Ley 27735 · **abierta: verificar si alguna norma posterior incorpora días** antes de implementar 1.1.
- 2026-10-15 · Comisiones AFP, prima de seguro y remuneración máxima asegurable · pendientes de poblar desde la SBS (watcher) · abierta.
- 2026-10-15 · UIT 2025 (S/ 5,350) marcada `verified: false` por la fuente citada (DS 260-2024-EF) · verificar · abierta.
- 2026-10-15 · `mesesYDiasCompletos(desde, hasta)`: ambas fechas inclusive, meses completos por aniversario desde la fecha de ingreso y el resto en días calendario (15/03→30/06 = 3 meses 16 días). Si el día de aniversario no existe en el mes (ingreso 31/01), el mes se completa el último día del mes siguiente (31/01→28/02 = 1 mes) · docs/01 no define la convención de conteo; afecta CTS, vacaciones e indemnización · **abierta: confirmar antes de 1.2**.
- 2026-10-15 · Redondeo del total: ¿`total` = suma de los conceptos ya redondeados, o redondeo de la suma sin redondear? Pueden diferir en S/ 0.01. Los casos dorados actuales dan igual con ambos métodos · propuesta: suma de conceptos redondeados (lo que ve el usuario cuadra) · **abierta: confirmar antes de 1.1**.
- 2026-10-15 · Paquetes TS consumidos desde `src/` sin paso de build; `getParam` lee de un registro en memoria que se llena con `registrarParametros(json)` (el núcleo no lee archivos para poder correr en el navegador) · resuelta (técnica).
