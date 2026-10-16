---
titulo: "Liquidación de beneficios sociales: qué te deben pagar al salir"
descripcion: "Guía de la liquidación al dejar tu trabajo: qué conceptos incluye, cuándo corresponde indemnización, en qué plazo te deben pagar y qué hacer si no te pagan."
calculadora: liquidacion
estado: borrador
actualizado: 2026-10-16
---

Cuando termina tu relación laboral, por renuncia, despido o fin de contrato, tu empleador debe pagarte los beneficios que generaste y aún no cobraste. Ese pago es la **liquidación de beneficios sociales**.

## ¿Qué incluye?

- **CTS trunca:** lo acumulado desde el último depósito.
- **Gratificación trunca**, con su bonificación extraordinaria: por los meses completos del semestre en curso.
- **Vacaciones truncas:** lo avanzado desde tu último aniversario, más las vacaciones ganadas que no tomaste.
- **Los días trabajados** del último mes que aún no te pagaron.
- **Indemnización**, solo si te despidieron de forma arbitraria.

## ¿Cuándo hay indemnización?

Solo cuando el despido es arbitrario: sin una causa justa o sin seguir el procedimiento que exige la ley. No corresponde si renuncias, si termina tu contrato en la fecha pactada o si llegas a un acuerdo con tu empleador. Además, debes haber superado el período de prueba, que en general es de {{param:periodo_prueba_meses}} meses.

- **Contrato indefinido:** {{param:regimenes.general.indemnizacion.por_anio}} sueldos por cada año trabajado, con un máximo de {{param:regimenes.general.indemnizacion.tope}}. Las fracciones de año se pagan en proporción.
- **Contrato a plazo fijo:** {{param:regimenes.general.indemnizacion.por_anio}} sueldos por cada mes que faltaba para que venciera el contrato, con el mismo máximo.
- En la pequeña empresa son {{param:regimenes.pequena.indemnizacion.por_anio}} remuneraciones diarias por año, y en la microempresa {{param:regimenes.micro.indemnizacion.por_anio}}, con contrato indefinido.

## Un ejemplo

Con un sueldo de {{monto:2000}}, ingreso el 1 de marzo de 2025 y cese el 31 de agosto de 2026:

| Motivo | Te deben pagar |
| --- | --- |
| Renuncia | {{calc:liquidacion sueldo=2000 ingreso=2025-03-01 cese=2026-08-31 motivo=renuncia}} |
| Despido arbitrario | {{calc:liquidacion sueldo=2000 ingreso=2025-03-01 cese=2026-08-31 motivo=despido_arbitrario}} |

Régimen general, sin asignación familiar.

## ¿En qué plazo te deben pagar?

Tu empleador debe pagar la liquidación dentro de las {{param:liquidacion_plazo_pago_horas}} horas siguientes a tu cese. Pide siempre la hoja de liquidación con el detalle de cada concepto.

## ¿Qué hacer si no te pagan o te pagan menos?

1. Compara la hoja de liquidación con el cálculo de arriba. En "¿Cómo se calculó?" ves cada concepto.
2. Pide la corrección a tu empleador, de preferencia por escrito.
3. Si no se resuelve, puedes presentar una denuncia ante SUNAFIL.
