# Calculadoras laborales (multipaís · inicio Perú)

Sitios estáticos de calculadoras de beneficios laborales (gratificación, CTS, liquidación, utilidades, sueldo neto, renta de 5ta, horas extras) monetizados con AdSense. Un *site* por país, cada uno con su dominio, cuenta de Cloudflare, AdSense y bot de Telegram, todo por configuración.

Las reglas del proyecto están en `CLAUDE.md`; el avance, en `docs/04-roadmap.md`.

## Desarrollo local
```bash
pnpm install
cp .env.example .env              # completar las variables del site
pnpm dev                          # http://localhost:4321 (SITE=pe por defecto)
MOSTRAR_BORRADORES=1 pnpm dev     # ver guías en borrador antes de aprobarlas
pnpm test                         # tests unitarios (motor y marcadores)
pnpm --filter @calc/web test:e2e  # e2e con Playwright (requiere un build previo)
```

## Publicar un site (ej. Perú)

El deploy lo hace GitHub Actions (`.github/workflows/deploy.yml`) en cada push a `main`. Flujo de trabajo: se desarrolla en `develop` (CI completo) y se pasa a `main` con un pull request.

### 1. Cloudflare: cuenta, proyecto y token
1. En la cuenta de Cloudflare del site: **Workers & Pages → Create → Pages → Upload assets (Direct Upload)**. Nombre del proyecto: el de `cloudflare.pages_project` en `config/sites/<site>.yaml` (Perú: `calc-laborales-pe`). Basta con crearlo vacío; el primer contenido lo sube el deploy.
2. **My Profile → API Tokens → Create Token → Custom token** con el permiso *Account → Cloudflare Pages → Edit*, limitado a esa cuenta.
3. El **Account ID** aparece en la página de inicio de la cuenta (columna derecha) o en la URL del panel.
4. **Analytics & Logs → Web Analytics → Add a site** con el dominio, y copiar el token del fragmento de JavaScript (el valor de `"token"`).

### 2. GitHub: secretos del site
En **Settings → Secrets and variables → Actions → New repository secret** (sufijo = `site_id` en mayúsculas):

| Secreto | Obligatorio | Valor |
|---|---|---|
| `CF_ACCOUNT_ID_PE` | Sí | Account ID de Cloudflare |
| `CF_API_TOKEN_PE` | Sí | Token del paso 1.2 |
| `CONTACT_EMAIL_PE` | Sí | Correo de contacto de las páginas legales |
| `CF_BEACON_TOKEN_PE` | Sí | Token de Web Analytics del paso 1.4 |
| `TELEGRAM_BOT_TOKEN_PE`, `TELEGRAM_ADMIN_CHAT_ID_PE` | No | Aviso "🚀 Publicado" o "❌ Falló" al terminar cada deploy |
| `ADSENSE_CLIENT_PE` y `ADSENSE_SLOT_*_PE` | Tras aprobar AdSense | `ca-pub-…` y los IDs de bloque |

El build de deploy corre con `STRICT_ENV=1`: si falta una variable obligatoria, falla antes de publicar.

### 3. Dominio propio
1. En Cloudflare: **Add a domain** (ej. `cuantometoca.pe`), plan Free. Cloudflare indica dos *nameservers*.
2. En el registrador del dominio (para `.pe`, el panel donde se compró): reemplazar los nameservers por los de Cloudflare. La propagación puede tardar de minutos a 24 horas.
3. En el proyecto de Pages: **Custom domains → Set up a domain** → `cuantometoca.pe`, y otra vez para `www.cuantometoca.pe`.
4. **Rules → Redirect Rules** (*Wildcard pattern*): Request URL `https://www.cuantometoca.pe/*` → Target URL `https://cuantometoca.pe/${1}`, **301**, con **Preserve query string** activado (los enlaces compartidos llevan el cálculo en la URL). En **SSL/TLS → Edge Certificates**, activar **Always Use HTTPS**.
5. Verificar en Google Search Console la propiedad del dominio y enviar `https://<dominio>/sitemap.xml`.

Las direcciones `*.pages.dev` quedan con `X-Robots-Tag: noindex` (`apps/web/public/_headers`): Google solo indexa el dominio propio.

### 4. Publicar
Abrir un pull request de `develop` a `main` y hacer merge cuando el CI esté en verde. El workflow `deploy` construye cada site habilitado y lo sube a su cuenta de Cloudflare. También se puede lanzar a mano desde **Actions → deploy → Run workflow**.

El deploy muestra como aviso los parámetros legales vigentes con `"verified": false` (`scripts/check_unverified_params.py`); conviene confirmarlos contra la fuente oficial.

### Cambiar de cuenta de Cloudflare o de dominio
- **Otra cuenta:** crear el proyecto de Pages en la nueva cuenta y reemplazar los secretos `CF_ACCOUNT_ID_*` y `CF_API_TOKEN_*`. El código no cambia.
- **Otro dominio:** cambiar `domain` en `config/sites/<site>.yaml`. La URL canónica, el sitemap, `robots.txt`, las imágenes para redes y `ads.txt` se generan desde ahí.

## Agregar un país
`/nuevo-pais cl` en Claude Code y seguir `docs/03-flujo-de-trabajo.md §6`.

## Servicios locales (bot de Telegram y revisión diaria)
Corren con Docker en una PC o servidor siempre encendido (ej. Ubuntu). La base `pipeline/data/<site>.db` vive ahí: es la que comparten el bot y el worker, así que **solo una máquina** debe correr estos servicios (dos bots con el mismo token chocan).

```bash
git clone https://github.com/<dueño>/<repo>.git && cd <repo>
cp .env.example .env && nano .env    # TELEGRAM_*_PE, LLM_*, GITHUB_TOKEN (opcional, para /deploy)
docker compose up -d --build         # bot-pe + worker
docker compose logs -f               # ver que ambos arrancaron
```

- Actualizar tras un cambio en el repo: `git pull && docker compose up -d --build`.
- Detener la revisión diaria sin apagar nada: `/pausa` en el bot (y `/reanudar`).
- Probar la revisión a mano: `docker compose run --rm worker python -m pipeline.cli params-check --country pe`.
- El chat administrador (`TELEGRAM_ADMIN_CHAT_ID_PE`) es el único que el bot atiende.

## Documentación
Ver el mapa en `CLAUDE.md`.
