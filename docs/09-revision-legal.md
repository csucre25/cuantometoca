# 09 — Revisión legal y de responsabilidad

Checklist para evitar problemas legales, de privacidad y de responsabilidad por los cálculos. Se usa en dos momentos:

- **Durante el desarrollo**: al tocar algo de la sección correspondiente (formularios, URL, anuncios, analítica, textos legales, contenido LLM), revisa sus puntos antes del commit.
- **Antes de cada despliegue a producción**: revisión final completa (sección 9). Es un paso obligatorio de `/publicar`. Si un punto bloqueante no se cumple, **no se despliega**.

> Esto es una guía técnica, no asesoría legal. Antes de escalar el tráfico o activar AdSense, valida las secciones 2, 3 y 4 con un abogado de protección de datos o de consumo.

Marco normativo de referencia (Perú):

| Tema | Norma |
|---|---|
| Datos personales | Ley 29733 y su Reglamento (D.S. 016-2024-JUS) |
| Consumidor / publicidad | Ley 29571 (Código de Protección y Defensa del Consumidor), D.Leg. 1044 (competencia desleal) |
| Responsabilidad contractual | Código Civil, art. 1328 (nulidad de la exoneración por dolo o culpa inexcusable) |
| Derecho de autor | D.Leg. 822 (art. 9: las normas legales no tienen protección) |
| Tributario | Ingresos por publicidad declarables ante SUNAT |

Leyenda: 🔴 bloqueante para desplegar · 🟡 corregir antes de activar AdSense · ⚪ recomendable.

---

## 1. Exactitud de los cálculos (responsabilidad principal)

El mayor riesgo del negocio es que alguien tome una decisión (firmar una liquidación, reclamar a su empleador) con un número equivocado. El descargo de responsabilidad ayuda, pero **no exonera** de culpa inexcusable (C.C. art. 1328): la protección real es que el cálculo sea correcto, trazable y fechado.

- [ ] 🔴 `pnpm test` en verde, con todos los casos dorados. Ningún caso dorado se modificó para hacer pasar un test.
- [ ] 🔴 Ningún parámetro usado por una página publicada tiene `verified: false`. Si una calculadora depende de uno (p. ej. comisiones AFP), se despublica o muestra un aviso visible de "valor por confirmar".
- [ ] 🔴 Los parámetros vigentes a la fecha del despliegue están al día (RMV, UIT, tasas SBS, topes). Revisar El Peruano y SBS de las últimas semanas.
- [ ] 🔴 Cada resultado muestra la fecha de cálculo / vigencia de los parámetros usados y la norma que los respalda.
- [ ] 🔴 Cada fórmula cita su base legal en el código y en el desglose (`steps[]`).
- [ ] 🟡 Las limitaciones de cada calculadora están visibles (regímenes no soportados: agrario, construcción civil, convenios colectivos, etc.) en `condiciones`.
- [ ] 🟡 Los valores estimados (utilidades estimadas, retención de 5ta aproximada) se marcan como **estimación** junto al número, no solo en el desglose.
- [ ] ⚪ Reglas ambiguas documentadas en `docs/decisiones.md` con la interpretación elegida.

## 2. Privacidad y datos personales (Ley 29733)

Un sueldo o una fecha de ingreso asociados a un identificador (cookie, IP) son datos personales.

- [ ] 🔴 Los montos y fechas que escribe el usuario **no se envían a terceros**. En particular, no deben quedar en la query string (`?sueldo=…`) mientras se escribe, porque los scripts de anuncios y analítica leen la URL de la página.
  - Solución esperada: escribir el estado en la URL solo al pulsar "Compartir", o usar el fragmento (`#`), que no viaja al servidor ni en el `Referer`.
  - Verificación: con DevTools → Network, escribir un sueldo y confirmar que ninguna petición a terceros lo contiene.
- [ ] 🔴 La política de privacidad describe **exactamente** lo que pasa con los datos (qué se procesa en el navegador, qué recibe Google, qué recibe Cloudflare, qué pasa con los enlaces compartidos). Nada de afirmaciones absolutas que el código no cumpla.
- [ ] 🔴 La política identifica al responsable del tratamiento y un medio de contacto funcional (`legal.owner_name`, `CONTACT_EMAIL_<SITE>`), y explica cómo ejercer los derechos ARCO.
- [ ] 🟡 No se agregan trackers fuera de los definidos en config (CLAUDE.md). Cada tracker nuevo actualiza la política de privacidad.
- [ ] 🟡 El formulario o correo de contacto: si se guardan los mensajes, evaluar si constituye un banco de datos que deba inscribirse ante la Autoridad Nacional de Protección de Datos Personales.
- [ ] ⚪ Los logs del bot de Telegram y del pipeline no guardan datos de usuarios del sitio.

## 3. Cookies y consentimiento

- [ ] 🟡 Aviso de cookies implementado según `consent.mode` del site (`simple_banner` en `pe`), con enlace a la política de privacidad. Debe existir **antes** de activar AdSense o GA4.
- [ ] 🟡 Para visitantes del EEE, Reino Unido y Suiza: CMP certificado por Google activo (mensajería de privacidad de AdSense). Sin él, Google limita o no sirve anuncios a ese tráfico.
- [ ] 🟡 Si se usa GA4: Consent Mode configurado; no se carga antes del consentimiento donde se requiera.
- [ ] ⚪ El aviso no causa CLS (reservar espacio o superponer sin desplazar contenido).

## 4. Descargos y transparencia (consumidor)

- [ ] 🔴 Aviso en cada calculadora: "Cálculo referencial basado en la normativa vigente a la fecha indicada. No constituye asesoría legal. Ante dudas, consulta a SUNAFIL o al MTPE."
- [ ] 🔴 "Sitio independiente": el pie deja claro que no se pertenece a SUNAFIL, MTPE ni SUNAT. Sin logos, colores ni nombres que imiten entidades del Estado (tampoco en el dominio, OG images ni redes).
- [ ] 🔴 Términos de uso publicados, con cálculos referenciales, limitación de responsabilidad y uso del contenido. La limitación de responsabilidad no pretende exonerar de todo (sería nula frente a dolo o culpa inexcusable).
- [ ] 🟡 Títulos, descripciones y textos de redes sin promesas engañosas ("¡Cobra S/ 3,000!"); los montos de ejemplo vienen del motor con un caso concreto (D.Leg. 1044, políticas de AdSense).
- [ ] 🟡 Fecha de "última actualización" correcta en las páginas legales cuando cambian.

## 5. Contenido generado con LLM

- [ ] 🔴 Ningún texto LLM se publicó sin aprobación en el bot de Telegram (regla 6 de CLAUDE.md).
- [ ] 🔴 Los números dentro de los textos vienen del motor (shortcodes), nunca del LLM.
- [ ] 🟡 Las guías no afirman reglas legales que no estén en `docs/01` o en la norma citada; ante duda, se omite.
- [ ] 🟡 Sin texto copiado de otros sitios o estudios contables (revisar frases sospechosamente pulidas con una búsqueda exacta).

## 6. Publicidad (AdSense)

- [ ] 🔴 Ningún anuncio encima del formulario ni junto al botón "Calcular" (clics accidentales).
- [ ] 🟡 `ads.txt` con el ID correcto, servido desde config.
- [ ] 🟡 Los anuncios se distinguen claramente del contenido (etiqueta "Publicidad").
- [ ] 🟡 Afiliados o contenido patrocinado (fase posterior): marcados como publicidad.

## 7. Marca, dominio y propiedad intelectual

- [ ] 🟡 Búsqueda en INDECOPI de que el nombre de marca y el dominio no chocan con marcas registradas en la clase de servicios correspondiente.
- [ ] ⚪ Evaluar registrar la marca propia antes de invertir en redes.
- [ ] ⚪ Imágenes, íconos y fuentes con licencia que permite uso comercial.

## 8. Secretos y cuentas

- [ ] 🔴 `.env` sigue en `.gitignore`; `git ls-files` no lista ningún archivo con secretos.
- [ ] 🔴 `grep` del dominio real, IDs de AdSense, tokens o IDs de cuenta en `apps/` y `packages/` devuelve vacío (regla 2).
- [ ] 🟡 Tokens de Cloudflare con el mínimo permiso (solo Pages del proyecto).
- [ ] ⚪ Tributario: RUC activo y régimen adecuado para declarar los ingresos de AdSense; formulario fiscal de Google completado (consultar con un contador).

## 9. Revisión final antes del despliegue a producción

Se ejecuta con `/publicar <site>` y su resultado se deja en el PR de `develop` → `main`:

1. Recorrer las secciones 1–8. Todos los 🔴 cumplidos.
2. Si AdSense o GA4 se activan en este despliegue, todos los 🟡 de las secciones 2, 3, 4 y 6 cumplidos.
3. Listar los ⚪ pendientes y los 🟡 diferidos con su motivo.
4. Prueba manual en el build (`apps/web/dist` servido localmente):
   - Escribir un sueldo y comprobar en Network que no sale en peticiones a terceros.
   - Abrir un enlace compartido y comprobar que reproduce el cálculo.
   - Confirmar que el aviso referencial, el pie de "sitio independiente", privacidad y términos se ven en móvil.
5. Registrar en el PR: fecha, parámetros clave vigentes (RMV, UIT) y "Revisión legal: OK" o la lista de pendientes aceptados por el usuario.

## Estado conocido (actualizar al corregir)

| Punto | Estado al 16/10/2026 |
|---|---|
| 2 — Montos en la query string mientras se escribe (`Calculadora.tsx`) | ✅ La URL no cambia al calcular; "Compartir" pone los datos tras `#` y un script en `<head>` los quita de la barra antes de cualquier otro script (también `?sueldo=` antiguos; se conservan `utm_*`). e2e verifica que ninguna petición a terceros los lleve |
| 2 — Texto de privacidad "no se envían" | ✅ Reescrito: describe navegador, enlace compartido (#), Cloudflare (alojamiento y Web Analytics), publicidad según config y derechos ARCO (Ley 29733) |
| 3 — Aviso de cookies (`consent.mode: simple_banner`) | ❌ Configurado pero no implementado |
| 3 — CMP para EEE/Reino Unido | ❌ Pendiente (antes de AdSense) |
| 1 — Parámetros AFP con `verified: false` | ⚠️ Confirmar en sbs.gob.pe (D8) |
| 4 — Aviso referencial, sitio independiente, términos | ✅ |
| 8 — `.env` ignorado por git | ✅ |
| 7 — Búsqueda de marca en INDECOPI | ❓ Sin verificar |
