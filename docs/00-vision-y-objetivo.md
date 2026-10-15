# 00 — Visión y objetivo

## Problema
Cada julio, diciembre, mayo y noviembre millones de trabajadores peruanos buscan "cuánto me toca" de gratificación o CTS. Lo mismo ocurre con la liquidación al renunciar o ser despedidos, con las utilidades (marzo–abril) y con el descuento de AFP o renta de 5ta. Las respuestas disponibles suelen ser artículos largos con fórmulas genéricas, sin cálculo personalizado ni desglose claro.

## Propuesta de valor
"Pon tu sueldo y tus meses, y ve exactamente cuánto te toca, paso a paso, con la norma que lo respalda."
- Cálculo personalizado en segundos, sin registro.
- Desglose paso a paso (para confiar en el número y poder reclamar si el empleador paga menos).
- Parámetros siempre al día (RMV, UIT, tasas AFP) con fecha de vigencia visible.
- Rápido en celular (el 80%+ del tráfico será móvil).

## Objetivo de negocio
Ingresos por AdSense con mínimo mantenimiento. Expectativa realista (Perú, solo AdSense, RPM de página ~US$1–2.5):
| Hito | Tráfico | Ingreso aprox. |
|---|---|---|
| Mes 3 | 10k–30k PV/mes | US$10–60 |
| Mes 6 (incluye temporada grati diciembre) | 50k–150k PV/mes | US$60–300 |
| Mes 12 | 150k–400k PV/mes (picos 2–4x en jul/dic/may/nov) | US$150–800 |

La expansión a otros países (Chile, Colombia, México) multiplica el activo con el mismo motor. Cada país tendrá su propio dominio y gancho (finiquito, prima/cesantías, aguinaldo).

## Métricas
- **Norte**: páginas vistas mensuales con anuncio visible × RPM.
- Cálculos completados por sesión (engagement).
- % de tráfico orgánico vs social.
- Tiempo desde que se publica una norma (ej. nueva RMV) hasta que el sitio la refleja: **objetivo < 24 h**.
- Errores de cálculo reportados: **objetivo 0** (cada reporte se convierte en caso dorado).

## No-objetivos (por ahora)
- No es asesoría legal ni reemplaza a SUNAFIL/MTPE (avisos visibles).
- No hay cuentas de usuario, ni base de datos en línea, ni backend público.
- No se cubren regímenes especiales complejos en el MVP (construcción civil, agrario Ley 31110, sector público). Quedan en el roadmap.

## Restricciones del usuario
- Desarrollador Python con experiencia en IA y automatización; tiempo limitado (proyecto paralelo).
- Infraestructura a costo ~0: Cloudflare Pages gratis, GitHub Actions, PC propia para tareas pesadas, API de NVIDIA (tier gratuito) para LLM.
- Cada país/site debe poder vivir en una **cuenta de Cloudflare distinta** solo cambiando configuración.
