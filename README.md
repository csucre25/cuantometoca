# Calculadoras laborales (multipaís · inicio Perú)

Sitios estáticos de calculadoras de beneficios laborales (gratificación, CTS, liquidación, utilidades, sueldo neto, renta de 5ta, horas extras) monetizados con AdSense. Un *site* por país, cada uno con su dominio, cuenta de Cloudflare, AdSense y bot de Telegram, todo por configuración.

> Este paquete contiene **especificación + esqueleto**. La implementación la construye Claude Code siguiendo `CLAUDE.md` y `docs/04-roadmap.md`.

## Empezar con Claude Code
```bash
git init && git add . && git commit -m "chore: especificación inicial"
claude          # abre Claude Code en esta carpeta
```
Primer mensaje sugerido:
> Lee CLAUDE.md y docs/. Empieza por la Fase 0 del roadmap. Antes de escribir código, dime si encuentras ambigüedades en la especificación.

## Configurar un site (ej. Perú)
1. Elegir dominio (`docs/06-dominios-y-marca.md`) y ponerlo en `config/sites/pe.yaml → domain`.
2. En la cuenta de Cloudflare del site: crear el proyecto de Pages con el nombre de `cloudflare.pages_project` (tipo *Direct Upload*) y conectar el dominio personalizado.
3. Crear un token de API con permiso *Account → Cloudflare Pages → Edit*.
4. Crear el bot con @BotFather y obtener tu `chat_id`.
5. En GitHub → Settings → Secrets, crear: `CF_ACCOUNT_ID_PE`, `CF_API_TOKEN_PE`, `TELEGRAM_BOT_TOKEN_PE`, `TELEGRAM_ADMIN_CHAT_ID_PE`, `CONTACT_EMAIL_PE`, `LLM_API_KEY` y, tras la aprobación de AdSense, `ADSENSE_CLIENT_PE`. En Variables: `LLM_BASE_URL`, `LLM_MODEL`.
6. Copiar `.env.example` a `.env` para uso local.

Cambiar de cuenta de Cloudflare = cambiar los secretos `*_PE` (y el nombre del proyecto si difiere). El código no cambia.

## Agregar un país
`/nuevo-pais cl` en Claude Code y seguir `docs/03-flujo-de-trabajo.md §6`.

## Servicios locales
```bash
docker compose up -d bot-pe     # bot de Telegram del site Perú
docker compose pause worker     # modo juego
```

## Documentación
Ver el mapa en `CLAUDE.md`.
