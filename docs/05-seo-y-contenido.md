# 05 — SEO y contenido

## 1. Principios (para no caer en "scaled content abuse")
Google penaliza las páginas generadas en masa sin valor para el usuario, no el uso de IA. Reglas del proyecto:
1. Cada página programática tiene **un cálculo único resuelto** con desglose propio, casos vecinos y FAQ específica. Si dos páginas solo difieren en un número sin cambiar la explicación, se fusionan.
2. Solo se generan combinaciones con **demanda observable** (Search Console, Google Trends, autocompletado). Se empieza con ~150 páginas, no miles.
3. Ninguna página con un solo párrafo genérico de LLM. Todo texto se revisa por Telegram.
4. Poda trimestral: páginas sin impresiones a 90 días → `noindex` o fusión.

## 2. Arquitectura de URLs (Perú)
```
/                                   → hub con todas las calculadoras
/gratificacion/                     → calculadora + guía
/gratificacion/julio-2027/          → temporada (actualizada cada año)
/gratificacion/julio-2027-sueldo-1500/  → caso
/cts/  /cts/mayo-2027/  /cts/mayo-2027-sueldo-2000/
/liquidacion/  /liquidacion/renuncia-1-anio/  /liquidacion/despido-arbitrario/
/utilidades/  /utilidades/mineria/  /utilidades/comercio/
/vacaciones-truncas/
/sueldo-neto/  /sueldo-neto/afp-vs-onp/
/renta-quinta-categoria/
/horas-extras/
/parametros-vigentes/               → RMV, UIT, tasas (siempre al día)
/calendario-de-pagos-2027/
/guias/<slug>/                      → guías editoriales
```

## 3. Keywords objetivo (Perú)
Hallazgos de Google Trends (2026-10, Perú, 5 años; detalle en `docs/06` → Decisión):
- **Prioridad por demanda:** CTS > gratificación > liquidación (pareja todo el año) > vacaciones > utilidades.
- **Forma de preguntar:** "cuánto me **corresponde**" se busca el doble que "cuánto me toca". En títulos, H1 y FAQ usar "¿Cuánto te corresponde de …?". Mantener "toca" como tono de marca.
- **Término paraguas:** "beneficios sociales" es el término dominante en Perú; usarlo en el hub y en liquidación ("Liquidación de beneficios sociales").
- **En aumento:** "cuándo depositan la cts", "cuándo pagan la cts 2026", "calculadora cts 2026". Refuerza la página `/calendario-de-pagos-<año>/` y la mención del año en los títulos.

Intención transaccional (calculadora) — prioridad máxima:
- calcular gratificación / calculadora de gratificación / gratificación julio 2027 / cuánto me toca de gratificación
- calcular cts / calculadora cts 2027 / cts mayo 2027 / cuánto me corresponde de cts / cuánto me depositan de cts
- calcular liquidación / liquidación por renuncia / liquidación por despido arbitrario / beneficios sociales al renunciar
- calcular utilidades / utilidades minería cuánto me toca / cuándo pagan utilidades 2027
- vacaciones truncas cálculo
- descuento afp / cuánto me descuentan de afp / afp o onp cuál conviene
- renta de quinta categoría cálculo / cuánto me descuentan de impuesto a la renta
- calcular horas extras perú

Variantes de caso (programático):
- gratificación con sueldo mínimo / gratificación con sueldo de 1500 / 2000 / 2500 / 3000
- gratificación 3 meses trabajados / gratificación trunca
- cts 4 meses trabajados / cts con sueldo mínimo
- liquidación 1 año / 6 meses / 2 años trabajados
- gratificación pequeña empresa / mype / trabajadora del hogar

Informativas (apoyan autoridad y enlazan a la calculadora):
- cuándo depositan la cts 2027 / cuándo pagan la gratificación 2027 / qué pasa si no me pagan la grati
- sueldo mínimo 2027 perú / uit 2027
- se puede retirar la cts 2027 (actualizar según norma vigente)

## 4. Matriz inicial de casos (definir en `calculators.yaml`)
| Calculadora | Dimensiones | Nº aprox. |
|---|---|---|
| Gratificación | sueldos [RMV vigente, 1300, 1500, 1800, 2000, 2500, 3000, 4000, 5000] × periodo [julio, diciembre] × régimen [general] + meses [1..5] con sueldo mínimo | ~25 |
| CTS | mismos sueldos × [mayo, noviembre] + meses [1..5] | ~25 |
| Liquidación | motivo [renuncia, despido, fin de contrato] × antigüedad [3m, 6m, 1a, 2a, 3a, 5a] | ~18 |
| Utilidades | sector × 3 rangos de sueldo | ~18 |
| Sueldo neto | sueldos × [AFP, ONP] | ~18 |
| Otras (vacaciones, horas extras, 5ta) | rangos de sueldo representativos | ~30 |

Los casos con sueldo mínimo se regeneran automáticamente cuando cambia la RMV.

## 5. Calendario de contenido estacional
| Mes | Pico de búsqueda | Publicar/actualizar antes de |
|---|---|---|
| Mar–Abr | Utilidades | 15 feb |
| May | CTS mayo | 15 abr |
| Jul | Gratificación julio | 15 jun |
| Nov | CTS noviembre | 15 oct |
| Dic | Gratificación diciembre | 15 nov |
| Dic–Ene | UIT, RMV, calendario del año | 15 dic |

## 6. Enlazado interno
- Cada caso enlaza a: calculadora madre, 2–3 casos vecinos (sueldo ±), guía relacionada.
- Cada guía enlaza a su calculadora en el primer párrafo.
- El hub enlaza a todas las calculadoras y a la temporada activa (bloque "Ahora mismo: Gratificación de diciembre").

## 7. Google Discover y social
- Imagen OG 1200×630 por calculadora y por temporada (generada en build con el monto de ejemplo).
- Titulares claros, sin clickbait engañoso (ver políticas en `docs/07`).
