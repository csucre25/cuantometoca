---
titulo: "Horas extras: cuánto te deben pagar por tu sobretiempo"
descripcion: "Guía de las horas extras: cuándo hay sobretiempo, los recargos que corresponden, cómo se calcula el valor de tu hora y qué hacer si no te las pagan."
calculadora: horas_extras
estado: borrador
actualizado: 2026-10-16
---

La jornada máxima es de {{param:jornada_maxima_horas.diaria}} horas diarias o {{param:jornada_maxima_horas.semanal}} semanales. Lo que trabajas por encima de tu jornada es **sobretiempo**, y se paga con un recargo.

## ¿Cuánto te deben pagar?

Primero se calcula el valor de tu hora: tu remuneración mensual dividida entre 30 y luego entre las horas de tu jornada diaria. Después se suma el recargo:

- **Las primeras {{param:horas_extras_recargos.horas_primer_tramo}} horas extra de cada día:** al menos {{param:horas_extras_recargos.primeras_2h|pct}} adicional.
- **Desde la siguiente hora:** al menos {{param:horas_extras_recargos.desde_3ra_h|pct}} adicional.

| Sueldo | Horas extra | Te deben pagar |
| --- | --- | --- |
| {{monto:2000}} | 2 horas diarias por 20 días | {{calc:horas_extras sueldo=2000 horas=2 dias=20}} |
| {{monto:2000}} | 3 horas diarias por 20 días | {{calc:horas_extras sueldo=2000 horas=3 dias=20}} |

Ejemplos con jornada de {{param:jornada_maxima_horas.diaria}} horas, sin asignación familiar.

## Lo que debes saber

- El sobretiempo es voluntario: tu empleador no puede obligarte, y tampoco puedes exigir hacerlo.
- Con tu acuerdo, puede compensarse con horas de descanso en lugar de pago.
- Tu empleador debe registrar tu hora de ingreso y de salida. Ese registro sirve como prueba si hay un reclamo.
- Las horas extras tienen descuento de AFP u ONP y, si corresponde, de renta de quinta categoría.

## ¿Qué hacer si no te las pagan?

1. Lleva tu propio registro de los días y las horas que trabajaste de más.
2. Pide el pago a tu empleador, de preferencia por escrito.
3. Si no se resuelve, puedes presentar una denuncia ante SUNAFIL.
