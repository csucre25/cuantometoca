---
titulo: "Sueldo neto: qué te descuentan y por qué"
descripcion: "Guía de los descuentos de tu sueldo: AFP u ONP, comisión de la AFP, prima de seguro y renta de quinta categoría, con ejemplos."
calculadora: sueldo_neto
estado: borrador
actualizado: 2026-10-16
---

Tu sueldo bruto es lo que figura en tu contrato. Lo que llega a tu cuenta, tu **sueldo neto**, es menor porque se descuentan tu aporte de pensiones y, si corresponde, el impuesto a la renta.

## Los descuentos

**Pensiones.** Es obligatorio aportar a uno de los dos sistemas:

- **ONP:** se descuenta el {{param:onp_tasa}} de tu remuneración. El aporte va a un fondo común.
- **AFP:** se descuenta el {{param:afp_aporte_obligatorio}} para tu fondo individual, más la prima de seguro ({{param:afp_prima_seguro}}) y la comisión de tu AFP, que varía según la AFP y el tipo de comisión.

**Renta de quinta categoría.** Solo se descuenta si tus ingresos del año superan {{param:renta5ta_deduccion_uit}} UIT. Tu empleador retiene cada mes una parte del impuesto anual.

**Lo que no te descuentan.** EsSalud ({{param:essalud_tasa}}) lo paga tu empleador. Y en julio y diciembre, la gratificación no tiene descuento de AFP ni ONP.

## Comisión sobre el sueldo o mixta

- **Sobre el sueldo (flujo):** la AFP cobra un porcentaje de tu remuneración cada mes.
- **Mixta:** la AFP cobra un porcentaje anual sobre tu fondo acumulado. No se descuenta de tu sueldo, pero reduce tu fondo con el tiempo.

## Ejemplos

| Sueldo bruto | Sistema | Sueldo neto |
| --- | --- | --- |
| {{monto:3000}} | ONP | {{calc:sueldo_neto sueldo=3000 sistema=onp}} |
| {{monto:3000}} | AFP Integra, comisión sobre el sueldo | {{calc:sueldo_neto sueldo=3000 sistema=afp afp=integra}} |
| {{monto:5000}} | ONP | {{calc:sueldo_neto sueldo=5000 sistema=onp}} |

Ejemplos sin asignación familiar, con la retención de renta de quinta estimada para un sueldo igual todo el año.

## Si te descuentan de más

Revisa tu boleta y compara cada descuento con el cálculo de arriba. Si hay un error, pide la corrección a tu empleador. Si te retuvieron más renta de la que correspondía en el año, puedes solicitar la devolución a SUNAT.
