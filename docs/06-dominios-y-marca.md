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

## Identidad
- Tono: cercano, claro, sin tecnicismos ("te toca", "te deben pagar").
- Colores y logo: configurables en `brand` del site.
- Tagline sugerido: "Calcula en segundos cuánto te toca, con la ley en la mano."
