# 01 — Especificación funcional (Perú)

> **Advertencia para el implementador**: las reglas de este documento resumen la normativa peruana vigente a octubre de 2026. Antes de dar por terminada cada calculadora, verifica la norma citada (El Peruano / gob.pe / SUNAT). Si encuentras una contradicción, **no la resuelvas por tu cuenta**: anótala en `docs/decisiones.md` y avisa al usuario.
>
> Todos los valores numéricos legales (RMV, UIT, %, topes) se leen de `config/countries/pe/params.json` con la fecha de referencia del cálculo. Los números de este documento son **ilustrativos**.

## 1. Usuarios y escenarios
| Persona | Escenario | Calculadora |
|---|---|---|
| Trabajador en planilla | "¿Cuánto me pagan de grati el 15 de julio?" | Gratificación |
| Trabajador que renuncia o es despedido | "¿Cuánto me deben pagar al salir?" | Liquidación |
| Trabajador en mayo/noviembre | "¿Cuánto me depositan de CTS?" | CTS |
| Trabajador de empresa grande, marzo–abril | "¿Cuánto me toca de utilidades?" | Utilidades |
| Cualquier trabajador | "¿Por qué me descuentan tanto?" | Sueldo neto (AFP/ONP + 5ta) |
| Trabajador con sobretiempo | "¿Cuánto me deben por mis horas extras?" | Horas extras |
| Pequeño empleador / contador junior | "¿Cuánto debo pagarle?" | Todas (modo empleador, fase 2) |

## 2. Conceptos comunes

### 2.1 Entradas comunes (componente de formulario reutilizable)
| Campo | Tipo | Validación | Notas |
|---|---|---|---|
| `sueldoBasico` | decimal > 0 | ≥ RMV vigente si jornada completa (si es menor: advertencia, no bloqueo) | Mensual |
| `asignacionFamiliar` | booleano | — | Si true: 10% de la RMV vigente a la fecha de corte |
| `otrosRegulares` | decimal ≥ 0 | — | Promedio mensual de comisiones, horas extras u otros conceptos **regulares** (percibidos ≥ 3 meses en el semestre para grati/CTS) |
| `regimen` | enum | `general` \| `pequena` \| `micro` \| `hogar` | Define porcentajes |
| `fechaIngreso` | fecha | ≤ fechaCorte | |
| `fechaCese` | fecha opcional | ≥ fechaIngreso | Solo liquidación / truncas |
| `seguroSalud` | enum | `essalud` \| `eps` | Afecta bonificación extraordinaria |

### 2.2 Remuneración computable (RC)
`RC = sueldoBasico + asignacionFamiliar(fecha) + otrosRegulares`
- La asignación familiar se calcula con la RMV vigente **a la fecha de corte** del concepto (ej. para grati de diciembre 2026 se usa RMV S/ 1,230 → S/ 123; para grati de julio 2026, RMV S/ 1,130 → S/ 113).
- Para CTS se agrega 1/6 de la gratificación percibida en el semestre (ver 4).

### 2.3 Regímenes (tabla en `params.json → regimenes`)
| Régimen | Gratificación | CTS | Vacaciones | Indemnización despido |
|---|---|---|---|---|
| General | 100% | 100% | 30 días/año | 1.5 RC por año (tope 12 RC) |
| Pequeña empresa (REMYPE) | 50% | 50% (15 rem. diarias/año) | 15 días/año | 20 rem. diarias/año (tope 120) |
| Microempresa (REMYPE) | 0% | 0% | 15 días/año | 10 rem. diarias/año (tope 90) |
| Trabajador del hogar (Ley 31047) | 100% | 100% | 30 días/año | régimen general |

Base legal: DS 013-2013-PRODUCE (TUO Ley MYPE), Ley 31047. **Verificar** antes de implementar.

### 2.4 Salida estándar de toda calculadora
```ts
type ResultadoCalculo = {
  total: string;            // "2180.00" (string decimal, 2 dec.)
  moneda: "PEN";
  conceptos: { id: string; etiqueta: string; monto: string }[];
  steps: { descripcion: string; formula: string; valor: string }[]; // desglose legible
  parametrosUsados: { clave: string; valor: string; vigenteDesde: string; fuente: string }[];
  advertencias: string[];   // ej. "Sueldo menor a la RMV vigente"
  baseLegal: string[];      // ej. ["Ley 27735", "DS 005-2002-TR", "Ley 30334"]
  ajusteRedondeo: boolean;  // true si los conceptos redondeados no suman exactamente el total
  condiciones: {            // desplegable "Condiciones", plegado por defecto
    requisitos: string[];   // qué se necesita para recibir el beneficio
    supuestos: string[];    // condiciones consideradas en este cálculo (régimen, periodo, trunca…)
  };
};
```
La UI muestra el total grande y los conceptos. Plegados por defecto: "¿Cómo se calculó?" (`steps`, parámetros, norma y, si `ajusteRedondeo`, una nota breve) y "Condiciones" (requisitos y supuestos). Los números de esos textos salen de `params.json`.

## 3. Gratificación (julio y diciembre)
**Base legal**: Ley 27735; DS 005-2002-TR; Ley 30334 (bonificación extraordinaria).

**Entradas**: comunes + `periodo` (`julio` | `diciembre`) + `anio` + `mesesCompletos` (calculado desde fecha de ingreso o ingresado manualmente, 0–6).

**Reglas**:
1. Semestre computable: enero–junio (julio) y julio–diciembre (diciembre).
2. Solo cuentan **meses calendario completos** laborados en el semestre. Con 0 meses completos no corresponde.
3. `grati = RC × (mesesCompletos / 6) × factorRegimen`.
4. Bonificación extraordinaria = `grati × tasa` (9% EsSalud, 6.75% EPS; leer de params).
5. `total = grati + bonificacion`.
6. Fecha de pago: hasta el 15 de julio / 15 de diciembre (mostrar como dato).
7. Gratificación **trunca** (cese antes de la quincena del mes de pago): misma fórmula con los meses completos laborados en el semestre hasta el cese. Se usa también en Liquidación.

**Casos dorados** (`packages/calc-pe/tests/fixtures/casos-dorados.json`):
| Caso | Entradas | Total esperado |
|---|---|---|
| G1 | Julio 2026, general, sueldo 2000, sin asig., 6 meses, EsSalud | 2180.00 (2000 + 180) |
| G2 | Julio 2026, general, sueldo 2000, **con** asig. (113), 6 meses | 2303.17 (2113 + 190.17) |
| G3 | Diciembre 2026, general, sueldo 2000, con asig. (123), 4 meses | 1542.71 (1415.33 + 127.38) |
| G4 | Julio 2026, pequeña empresa, sueldo 1500, 6 meses | 817.50 (750 + 67.50) |
| G5 | Julio 2026, microempresa | 0.00 + advertencia "No corresponde en microempresa" |
| G6 | Julio 2026, general, sueldo 2000, 6 meses, EPS | 2135.00 (2000 + 135) |

## 4. CTS (depósitos de mayo y noviembre)
**Base legal**: DS 001-97-TR (TUO Ley de CTS) y reglamento DS 004-97-TR.

**Entradas**: comunes + `periodo` (`mayo` → nov–abr; `noviembre` → may–oct) + `gratiSemestre` (gratificación percibida en el semestre; por defecto se autocalcula) + `mesesCompletos` + `diasAdicionales`.

**Reglas**:
1. Requisito: jornada mínima de 4 horas diarias en promedio (si no, advertencia y 0).
2. `RCcts = RC + gratiSemestre / 6`. (La bonificación extraordinaria **no** integra la base.)
3. `cts = (RCcts / 12 × meses) + (RCcts / 360 × dias)` × factor régimen (pequeña empresa: 50%).
4. Fecha límite de depósito: 15 de mayo / 15 de noviembre.
5. Mostrar nota informativa sobre la disponibilidad/retiro de CTS según la norma vigente (contenido editorial, no cálculo; actualizar desde el pipeline).

**Casos dorados** (`casos-dorados.json`):
| Caso | Entradas | Total esperado |
|---|---|---|
| C1 | Mayo 2026, general, sueldo 3000, grati semestre 3000, 6 meses | 1750.00 |
| C2 | Mayo 2026, general, sueldo 3000, grati 3000, 4 meses 10 días | 1263.89 |
| C3 | Mayo 2026, pequeña empresa, sueldo 3000, grati 1500, 6 meses | 812.50 ((3000+250)/12×6×0.5) |
| C4 | Micro | 0.00 + advertencia |

## 5. Vacaciones (y vacaciones truncas)
**Base legal**: DL 713 y DS 012-92-TR.
- Récord: 30 días por año completo de servicios (MYPE: 15).
- Vacaciones **no gozadas** al cese: además de la remuneración vacacional, corresponde indemnización por no goce si venció el plazo (fase 2, solo informativa en MVP).
- **Truncas**: `RC / 12 × meses + RC / 360 × dias` del récord incompleto (MYPE: × 0.5).

**Caso dorado V1**: RC 3000, 7 meses 15 días, general → 1875.00.

## 6. Liquidación de beneficios sociales (al cese)
Agrega en una sola pantalla:
1. CTS trunca (desde el último periodo depositado hasta el cese).
2. Gratificación trunca + bonificación extraordinaria.
3. Vacaciones truncas (+ vacaciones pendientes si el usuario indica días no gozados).
4. Indemnización por despido arbitrario (solo si `motivoCese = despido_arbitrario`).
5. Remuneración de los días laborados del último mes (opcional, entrada manual).

**Indemnización por despido arbitrario** (DS 003-97-TR, arts. 38 y 76):
- Contrato indeterminado: 1.5 RC por año completo; fracciones de año por dozavos y treintavos. Tope: 12 RC.
- Contrato a plazo fijo: 1.5 RC por cada mes dejado de laborar hasta el vencimiento. Tope: 12 RC.
- Pequeña empresa: 20 remuneraciones diarias por año (tope 120). Micro: 10 por año (tope 90).
- **Caso dorado L1**: RC 3000, indeterminado, 2 años 3 meses → 10125.00.

`motivoCese`: `renuncia` | `despido_arbitrario` | `fin_contrato` | `mutuo_disenso`. Solo despido arbitrario genera indemnización.

Pago: plazo de 48 horas desde el cese (mostrar como dato informativo; verificar norma).

## 7. Utilidades
**Base legal**: DL 892 y DS 009-98-TR.
- Solo empresas con **más de 20 trabajadores** que generan renta de tercera categoría.
- % de la renta neta según actividad (params): pesquera 10%, telecomunicaciones 10%, industrial 10%, minera 8%, comercio mayor/menor y restaurantes 8%, otras 5%.
- Distribución: 50% en proporción a los días laborados; 50% en proporción a las remuneraciones percibidas.
- Tope individual: 18 remuneraciones mensuales (el exceso va al FONDOEMPLEO / gobierno regional; solo informativo).

**Dos modos**:
1. **Exacto**: el usuario ingresa renta neta, total de días laborados por todos los trabajadores, total de remuneraciones pagadas, sus días y sus remuneraciones (dato del comunicado de la empresa).
2. **Estimado**: con número de trabajadores y renta neta aproximada (la UI deja claro que es una estimación).

**Caso dorado U1**: renta neta 1,000,000; industrial (10%); días totales 7,300; días trabajador 365; remuneraciones totales 720,000; remuneraciones trabajador 36,000 → 5000.00 (2500 + 2500).

## 8. Sueldo neto (AFP/ONP + renta de 5ta)
### 8.1 Pensiones
- ONP: 13% de la remuneración (params).
- AFP: aporte obligatorio 10% + prima de seguro (con tope de remuneración asegurable) + comisión (sobre flujo o mixta, según AFP y tipo de afiliado). **Comisiones y prima se actualizan mensualmente desde la SBS** (pipeline). La UI permite elegir AFP.
- Las gratificaciones de julio y diciembre no están afectas a aportes pensionarios (Ley 30334). La bonificación extraordinaria tampoco.

### 8.2 Renta de quinta categoría (cálculo anual + retención mensual)
- Renta bruta anual proyectada = remuneraciones del año + gratificaciones + bonificaciones extraordinarias + otros ingresos de 5ta.
- Deducción: 7 UIT. Deducción adicional hasta 3 UIT por gastos sustentados (alquiler, honorarios, etc.), **opcional** en la UI (fase 2).
- Escala progresiva acumulativa (params): hasta 5 UIT 8%; 5–20 UIT 14%; 20–35 UIT 17%; 35–45 UIT 20%; más de 45 UIT 30%.
- **Caso dorado R1** (2026, UIT 5,500): sueldo 5000 × 12 + 2 gratis de 5000 + bonificaciones 900 = 70,900; − 38,500 = 32,400 → 27,500 × 8% + 4,900 × 14% = **2886.00** anual.
- Retención mensual (fase 2): procedimiento del art. 40 del Reglamento de la LIR (divisores 12, 9, 8, 5, 4 y regularización en diciembre).

## 9. Horas extras
**Base legal**: DS 007-2002-TR.
- Valor hora = RC / 30 / 8 (jornada estándar; configurable si la jornada es distinta).
- Primeras 2 horas diarias: +25%. A partir de la tercera: +35%.
- Entrada: horas extra por día (o lista de días). Salida: total del periodo.

## 10. Páginas de caso (SEO programático)
Para cada calculadora se generan páginas de casos concretos con **resultado precalculado** por el motor en build:
- Ej.: "Gratificación de julio 2027 con sueldo de S/ 1,500", "CTS mayo con 3 meses trabajados", "Liquidación por renuncia con 1 año".
- Cada página incluye: resultado, desglose completo (`steps`), comparación con 2–3 casos vecinos, preguntas frecuentes específicas, la calculadora embebida con esos valores precargados.
- Matriz de casos definida en `config/countries/pe/calculators.yaml` (campo `casos`). Solo se generan combinaciones listadas ahí.

## 11. Páginas editoriales
- Guía de cada beneficio (qué es, quién tiene derecho, cuándo se paga, qué hacer si no te pagan → SUNAFIL).
- Calendario de pagos del año.
- Página "Parámetros vigentes" (RMV, UIT, tasas AFP, con fecha y fuente), actualizada automáticamente.
- Noticias normativas solo cuando afectan un cálculo (ej. nueva RMV), creadas a partir de alertas del pipeline y aprobadas por Telegram.

## 12. Requisitos no funcionales
- Todo el cálculo ocurre en el navegador (no hay backend).
- Accesible (WCAG AA en contraste y formularios con labels).
- URLs en español, sin acentos, en minúsculas: `/gratificacion/`, `/cts/`, `/liquidacion/`, `/gratificacion/julio-2027-sueldo-1500/`.
- Cada calculadora debe poder compartirse con sus valores en la URL (`?sueldo=1500&meses=6`) para enlazar desde redes.
- Avisos visibles: "Cálculo referencial, no constituye asesoría legal" + enlace a SUNAFIL/MTPE.
