"""Envío de avisos por Telegram (Bot API directa, sin estado: sirve en GitHub Actions y en local).

El bot interactivo con botones de aprobación (aiogram) es aparte: pipeline/bot/.
"""

from __future__ import annotations

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from pipeline.config import Site


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=2, max=20), reraise=True)
def enviar(site: Site, texto: str, *, client: httpx.Client | None = None) -> None:
    """Envía un mensaje HTML al chat administrador del site."""
    url = f"https://api.telegram.org/bot{site.telegram_token}/sendMessage"
    datos = {"chat_id": site.telegram_admin_chat_id, "text": texto, "parse_mode": "HTML", "disable_web_page_preview": True}
    cerrar = client is None
    client = client or httpx.Client(timeout=20)
    try:
        r = client.post(url, json=datos)
        r.raise_for_status()
    finally:
        if cerrar:
            client.close()
