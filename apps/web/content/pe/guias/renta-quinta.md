---
titulo: "Renta de quinta categoría: cuánto pagas de impuesto por tu sueldo"
descripcion: "Guía del impuesto a la renta de quinta categoría: desde qué sueldo se paga, cómo se calcula, qué gastos puedes deducir y cómo funciona la retención mensual."
calculadora: renta_quinta
estado: aprobado
actualizado: 2026-10-16
---

La renta de quinta categoría es el impuesto a la renta que pagas por tu trabajo en planilla. Tu empleador lo retiene de tu sueldo cada mes y lo paga a SUNAT por ti.

## ¿Desde qué sueldo se paga?

Cada año se deducen {{param:renta5ta_deduccion_uit}} UIT de tus ingresos, y solo pagas por lo que excede ese monto. En el año en curso, la UIT es de {{param:uit}}.

Para saber si llegas, suma todo lo que ganas en el año: tus sueldos, las dos gratificaciones y sus bonificaciones extraordinarias, y otros ingresos como bonos o comisiones. La CTS no se cuenta.

## ¿Cómo se calcula?

1. Se suman tus ingresos del año.
2. Se restan las {{param:renta5ta_deduccion_uit}} UIT y, si los tienes, tus gastos deducibles.
3. Al resultado se le aplica una escala progresiva: cada tasa se aplica solo a la parte de la renta que cae en ese tramo. La primera tasa es de {{param:renta5ta_tramos.0.tasa|pct}} y la más alta de {{param:renta5ta_tramos.4.tasa|pct}}. Puedes ver la escala completa en [Parámetros vigentes](/parametros-vigentes/).

| Sueldo mensual | Impuesto del año |
| --- | --- |
| {{monto:3000}} | {{calc:renta_quinta sueldo=3000}} |
| {{monto:5000}} | {{calc:renta_quinta sueldo=5000}} |
| {{monto:10000}} | {{calc:renta_quinta sueldo=10000}} |

Ejemplos con sueldo igual todo el año, dos gratificaciones y bonificación con EsSalud, sin gastos deducibles.

## Gastos que puedes deducir

Además de las {{param:renta5ta_deduccion_uit}} UIT, puedes deducir una parte de ciertos gastos, como alquiler de vivienda u honorarios de profesionales, hasta un máximo de {{param:renta5ta_deduccion_adicional_max_uit}} UIT al año. Para que cuenten, deben estar sustentados con comprobantes electrónicos a tu nombre.

## La retención mensual

Tu empleador proyecta tus ingresos del año y retiene cada mes una parte del impuesto. En diciembre regulariza la diferencia. Si al final del año te retuvieron más de lo que correspondía, SUNAT te devuelve la diferencia; en muchos casos lo hace de oficio, sin que tengas que pedirlo.
