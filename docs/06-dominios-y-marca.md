# 06 — Dominios y marca

El dominio **siempre** se configura en `config/sites/<site>.yaml → domain`. Nada en el código depende de él.

> La disponibilidad de estos dominios **no está verificada**. Revisar en Cloudflare Registrar (precio de costo para .com) o en el registrador correspondiente para ccTLD (.pe vía punto.pe / registradores acreditados).

## Criterios
1. Que repita la pregunta del usuario ("cuánto me toca") o el beneficio ("grati", "CTS", "liquidación").
2. Fácil de dictar en un video de TikTok (sin guiones ni números).
3. Reutilizable en otros países con su ccTLD (misma marca, distinta extensión) cuando el gancho sea válido allá.
4. Corto (≤ 15 caracteres antes de la extensión, idealmente).

## Propuestas — marca multipaís (recomendado)
| Dominio | Gancho | Multipaís |
|---|---|---|
| **cuantometoca.pe** / cuantometoca.com.pe | Es literalmente la pregunta que se busca y se dice en el video | Sí: cuantometoca.cl, cuantometoca.com.co, cuantometoca.mx |
| **cuantomepagan.pe** | Variante con la misma intención | Sí |
| **mibeneficio.pe** | Neutro, sirve para todos los beneficios | Sí |
| **sueldoclaro.com** | Marca paraguas "sueldo y beneficios claros" | Sí (una sola .com con subcarpetas no recomendado: preferir ccTLD por país) |

## Propuestas — gancho Perú (alta conversión en temporada)
| Dominio | Gancho |
|---|---|
| **calculatugrati.pe** | "grati" es como se dice coloquialmente; ideal para julio/diciembre |
| **tugrati.pe** | Corto, dictable |
| **tucts.pe** | Corto; menor volumen fuera de mayo/noviembre |
| **tuliquidacion.pe** | Búsqueda constante todo el año (renuncias y despidos) |
| **beneficiosperu.com** | Genérico y claro |

## Equivalentes por país (fase 7)
| País | Gancho local | Ejemplos |
|---|---|---|
| Chile | finiquito, sueldo líquido | calculatufiniquito.cl, cuantometoca.cl |
| Colombia | prima, cesantías, liquidación | calculatuprima.co, cuantometoca.com.co |
| México | aguinaldo, finiquito, PTU | calculatuaguinaldo.mx, cuantometoca.mx |

## Recomendación
- Marca principal: **cuantometoca** con ccTLD por país (confianza local y SEO por país).
- Si `cuantometoca.pe` no está disponible: `cuantomepagan.pe` o `calculatugrati.pe`.
- Los dominios de gancho estacional (tugrati, tucts) pueden comprarse como redirecciones 301 hacia la sección correspondiente del dominio principal, para usarlos en videos. Configurar como "redirect rules" en Cloudflare, no como sitios duplicados.

## Decisión (2026-10-15): `cuantometoca.pe`
Dominio principal de Perú: **cuantometoca.pe**, comprado en punto.pe el 2026-10-15 (opcional `cuantometoca.com.pe` como defensa). DNS a gestionar en Cloudflare.

### Evidencia (Google Trends, Perú, últimos 5 años)
Los índices solo son comparables dentro de una misma consulta.

| Consulta | Resultado (interés promedio) |
|---|---|
| Forma de preguntar | cuánto me **corresponde** de cts 18 · cuánto me **toca** de cts 9 · me pagan 1 · me deben 0. La brecha se acorta: en el pico de 2026 "toca" ≈ 76 vs "corresponde" ≈ 97. |
| Término paraguas | beneficios sociales 72 · beneficios laborales 25 · liquidación de beneficios sociales 17 · calculadora laboral 5. "beneficios sociales" baja lentamente desde 2025. |
| Intención de cálculo | calcular cts 22 · calcular gratificación 14 · calcular liquidación 11 (estable todo el año) · calcular vacaciones 5 · calcular utilidades 3. |
| Términos sueltos | "cts" domina; "liquidación" segundo; "cuánto me toca" como frase suelta casi no tiene volumen. En aumento: "cuándo depositan la cts", "calculadora cts 2026". |

### Por qué se mantiene
- El dominio casi no influye en el posicionamiento: el tráfico lo traen las páginas y sus títulos. Por eso las palabras clave ganadoras van en el contenido (ver `docs/05` §3), no en el dominio.
- Como marca es el mejor candidato: corto (12 caracteres), fácil de dictar, sin guiones y reutilizable en otros países.
- "Toca" es una frase real y va en aumento.

### Descartados
- `cuantomecorresponde.pe`: gana en búsquedas, pero es largo (19 caracteres) y fácil de escribir mal en video.
- `beneficiossociales.pe`: es el término paraguas dominante, pero es genérico, no funciona como marca y no sirve en otros países (allá no se dice así). Opcional: registrarlo como **redirección 301** a la página principal o a `/liquidacion/`.
- `cuantometoca.com`: ya está registrado por un tercero. No afecta, porque la estrategia usa una extensión por país, pero hay que revisar `.cl`, `.mx` y `.com.co` antes de la fase 7.

### Revisión periódica (manual)
Repetir las consultas en Trends antes de cada temporada (abril, junio, octubre). Para comparar más de 5 términos, incluir un **término ancla** (`calcular cts`) en cada consulta y normalizar: `valor × (ancla_referencia / ancla_en_consulta)`. La automatización por API (oficial en alfa, pytrends archivado, SerpApi/DataForSEO de pago) queda como evaluación a largo plazo.

## Identidad
- Tono: cercano, claro, sin tecnicismos ("te toca", "te deben pagar").
- Colores y logo: configurables en `brand` del site.
- Tagline sugerido: "Calcula en segundos cuánto te toca, con la ley en la mano."
