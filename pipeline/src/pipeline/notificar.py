"""Envío de avisos por Telegram (Bot API directa, sin estado: sirve en el worker y en GitHub Actions).

El bot interactivo (aiogram) es aparte, en pipeline/bot/; recibe las pulsaciones de los botones
que se envían desde aquí.
"""

from __future__ import annotations

from typing import Any

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from pipeline.config import Site
from pipeline.store import Store


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=2, max=20), reraise=True)
def enviar(site: Site, texto: str, *, botones: dict[str, Any] | None = None, client: httpx.Client | None = None) -> None:
    """Envía un mensaje HTML al chat administrador del site, opcionalmente con botones."""
    url = f"https://api.telegram.org/bot{site.telegram_token}/sendMessage"
    datos: dict[str, Any] = {"chat_id": site.telegram_admin_chat_id, "text": texto, "parse_mode": "HTML", "disable_web_page_preview": True}
    if botones:
        datos["reply_markup"] = botones
    cerrar = client is None
    client = client or httpx.Client(timeout=20)
    try:
        r = client.post(url, json=datos)
        r.raise_for_status()
    finally:
        if cerrar:
            client.close()


def tarjetas_pendientes(site: Site, store: Store, *, client: httpx.Client | None = None) -> int:
    """Envía una tarjeta con botones por cada propuesta pendiente que aún no se envió."""
    from pipeline.bot.tarjetas import botones_propuesta, texto_propuesta

    enviadas = 0
    for p in store.propuestas("pendiente"):
        if store.visto("tarjeta", f"p{p.id}"):
            continue
        enviar(site, texto_propuesta(p), botones=botones_propuesta(p), client=client)
        store.es_nuevo("tarjeta", f"p{p.id}", "enviada")
        enviadas += 1
    return enviadas
