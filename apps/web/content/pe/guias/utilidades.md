---
titulo: "Utilidades: quién las recibe, cuánto te toca y cuándo se pagan"
descripcion: "Guía de la participación en las utilidades: qué empresas las reparten, cómo se calcula tu parte, el tope por trabajador y la fecha de pago."
calculadora: utilidades
estado: aprobado
actualizado: 2026-10-16
---

Si la empresa donde trabajas tuvo ganancias, una parte se reparte entre los trabajadores. Es la **participación en las utilidades**, y se paga una vez al año por el ejercicio anterior.

## ¿Quién tiene derecho?

- Quienes trabajan en planilla en empresas con más de {{param:utilidades_min_trabajadores}} trabajadores que generan renta de tercera categoría.
- Basta con haber trabajado durante el ejercicio, aunque no haya sido el año completo: tu parte se calcula según los días que trabajaste.

## ¿Cuánto te toca?

La empresa reparte un porcentaje de su renta neta según su actividad: {{param:utilidades_porcentajes.pesquera|pct}} en pesca, telecomunicaciones e industria; {{param:utilidades_porcentajes.minera|pct}} en minería, comercio y restaurantes; y {{param:utilidades_porcentajes.otras|pct}} en las demás actividades.

Ese monto se divide en dos mitades:

- **Por días trabajados:** se reparte en proporción a los días que trabajó cada persona.
- **Por remuneraciones:** se reparte en proporción a lo que ganó cada persona en el año.

El máximo por trabajador es de {{param:utilidades_tope_remuneraciones}} sueldos mensuales.

Por ejemplo, en una empresa minera con una renta neta de {{monto:5000000}} y 100 trabajadores, si todos trabajaron el año completo y ganan lo mismo, a cada uno le tocan {{calc:utilidades sector=minera renta=5000000 trabajadores=100}}.

## ¿Cuándo se pagan?

Dentro de los {{param:utilidades_plazo_pago_dias}} días naturales siguientes al vencimiento del plazo para que la empresa presente su declaración anual del impuesto a la renta. En la práctica, suelen pagarse entre marzo y abril. La empresa debe entregarte una hoja con el detalle del cálculo.

Las utilidades tienen descuento de renta de quinta categoría, pero no de AFP ni ONP.

## ¿Qué hacer si no te pagan?

1. Pide a tu empresa la hoja de liquidación de utilidades y revisa los datos con la calculadora, en el modo "Con el comunicado".
2. Pide la corrección por escrito.
3. Si no se resuelve, puedes presentar una denuncia ante SUNAFIL.
