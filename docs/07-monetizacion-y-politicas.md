# 07 — Monetización y políticas

## 1. Expectativas realistas (no cambiar sin datos)
- Tráfico peruano, solo AdSense: RPM de página ~US$1–2.5 en calculadoras (intención financiera/laboral); tráfico social rinde menos que el orgánico.
- 100k PV/mes ≈ US$100–250. Los ingresos se concentran en julio, diciembre, mayo y noviembre.
- Redes de anuncios premium (Ezoic, Mediavine, Raptive) exigen tráfico mínimo y suelen priorizar tráfico de EE. UU.; evaluar solo cuando haya volumen.

## 2. Requisitos para solicitar AdSense
- Dominio propio (no `*.pages.dev`).
- ≥ 20 páginas útiles (calculadoras + guías), navegación clara.
- Páginas: Política de privacidad (mencionar cookies de Google y publicidad personalizada), Términos, Contacto, Sobre nosotros.
- `ads.txt` en la raíz con `google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0` (el ID sale de config).
- Sin contenido copiado.

## 3. Ubicación de anuncios
| Slot | Ubicación | Prioridad |
|---|---|---|
| `after_result` | Inmediatamente debajo del resultado | Alta |
| `in_breakdown` | Dentro del desglose, tras el paso 2 | Media |
| `in_article` | En guías, después del 2.º párrafo | Media |
| `footer` | Antes del pie | Baja |
Reglas: nunca encima del formulario ni pegado al botón "Calcular" (evitar clics accidentales: violación de políticas). Espacio reservado para que no haya saltos de diseño.

## 4. Políticas de contenido (AdSense y Google Search)
- **Sin titulares engañosos**: no prometer montos que no correspondan ("¡Cobra S/ 3,000 de grati!"). Usar casos reales ("Con sueldo de S/ 1,500 te toca S/ 1,635").
- No hacerse pasar por entidades del Estado (MTPE, SUNAFIL, SUNAT). Nunca usar sus logos. Siempre "sitio independiente".
- Aviso en cada calculadora: "Cálculo referencial basado en la normativa vigente a la fecha indicada. No constituye asesoría legal. Ante dudas, consulta a SUNAFIL o al MTPE."
- Fuentes citadas con enlace a la norma oficial.

## 5. Privacidad y consentimiento
- Para tráfico de Perú no se requiere CMP certificado; aun así, mostrar aviso de cookies simple.
- Si en el futuro un site apunta a la UE/Reino Unido, AdSense exige un CMP certificado por Google (configurable por site: `consent.mode`).
- No se recolectan datos personales: los cálculos ocurren en el navegador.

## 6. Ingresos complementarios (fase posterior, opcional)
- Afiliados de productos financieros relevantes (cuentas CTS, AFP), solo si hay programa formal y se marca como publicidad.
- Plantillas descargables (carta de renuncia, reclamo de beneficios) como imán de tráfico, no como venta inicial.
