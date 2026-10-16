"""Cliente LLM sobre el endpoint estándar /chat/completions (OpenAI-compatible).

Sin SDK de proveedor (CLAUDE.md: nunca acoplar el código a un proveedor). Se configura con:
  LLM_BASE_URL, LLM_API_KEY, LLM_MODEL, LLM_MAX_RPM            (principal; NVIDIA por defecto)
  LLM_FALLBACK_BASE_URL, LLM_FALLBACK_API_KEY, LLM_FALLBACK_MODEL (respaldo opcional, ej. Ollama)

Uso permitido (docs/02 §7): extraer datos de normas y redactar borradores. Nunca calcular montos.
"""

from __future__ import annotations

import json
import os
import re
import threading
import time
from dataclasses import dataclass
from typing import TypeVar

import httpx
from pydantic import BaseModel, ValidationError
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

from pipeline.config import cargar_env

M = TypeVar("M", bound=BaseModel)


class LLMError(RuntimeError):
    pass


@dataclass(frozen=True)
class Proveedor:
    base_url: str
    api_key: str
    model: str
    max_rpm: int = 30

    @property
    def nombre(self) -> str:
        return f"{self.model} @ {httpx.URL(self.base_url).host}"


def proveedores() -> list[Proveedor]:
    """Principal y, si está configurado, respaldo."""
    cargar_env()
    lista = []
    if os.environ.get("LLM_API_KEY"):
        lista.append(
            Proveedor(
                os.environ.get("LLM_BASE_URL", "https://integrate.api.nvidia.com/v1"),
                os.environ["LLM_API_KEY"],
                os.environ.get("LLM_MODEL", "meta/llama-3.3-70b-instruct"),
                int(os.environ.get("LLM_MAX_RPM", "30")),
            )
        )
    if os.environ.get("LLM_FALLBACK_BASE_URL") and os.environ.get("LLM_FALLBACK_MODEL"):
        lista.append(
            Proveedor(os.environ["LLM_FALLBACK_BASE_URL"], os.environ.get("LLM_FALLBACK_API_KEY", "x"), os.environ["LLM_FALLBACK_MODEL"])
        )
    return lista


def _reintentable(e: BaseException) -> bool:
    if isinstance(e, httpx.HTTPStatusError):
        return e.response.status_code == 429 or e.response.status_code >= 500
    return isinstance(e, (httpx.TransportError,))


_ultimo: dict[str, float] = {}
_candado = threading.Lock()


def _respetar_rpm(p: Proveedor) -> None:
    """Espacia las llamadas para no superar LLM_MAX_RPM (el tier gratuito de NVIDIA limita)."""
    with _candado:
        espera = 60 / max(p.max_rpm, 1) - (time.monotonic() - _ultimo.get(p.base_url, 0))
        if espera > 0:
            time.sleep(espera)
        _ultimo[p.base_url] = time.monotonic()


@retry(retry=retry_if_exception(_reintentable), stop=stop_after_attempt(4), wait=wait_exponential(multiplier=2, max=40), reraise=True)
def _completar(p: Proveedor, mensajes: list[dict], temperatura: float, client: httpx.Client) -> str:
    _respetar_rpm(p)
    r = client.post(
        f"{p.base_url.rstrip('/')}/chat/completions",
        headers={"Authorization": f"Bearer {p.api_key}"},
        json={"model": p.model, "messages": mensajes, "temperature": temperatura, "max_tokens": 1500},
    )
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"] or ""


def completar(mensajes: list[dict], *, temperatura: float = 0.0, client: httpx.Client | None = None) -> tuple[str, Proveedor]:
    """Texto de la respuesta, probando el proveedor principal y luego el de respaldo."""
    lista = proveedores()
    if not lista:
        raise LLMError("No hay proveedor LLM configurado (falta LLM_API_KEY)")
    errores = []
    cerrar = client is None
    client = client or httpx.Client(timeout=90)
    try:
        for p in lista:
            try:
                return _completar(p, mensajes, temperatura, client), p
            except (httpx.HTTPError, KeyError, IndexError) as e:
                errores.append(f"{p.nombre}: {e}")
        raise LLMError("Fallaron todos los proveedores LLM: " + " | ".join(errores))
    finally:
        if cerrar:
            client.close()


def _json_de(texto: str) -> dict:
    """Primer objeto JSON del texto (tolera ```json … ``` y texto alrededor)."""
    m = re.search(r"\{.*\}", texto, re.S)
    if not m:
        raise ValueError("la respuesta no contiene JSON")
    return json.loads(m.group(0))


def extraer(sistema: str, usuario: str, modelo: type[M], *, client: httpx.Client | None = None) -> M:
    """Pide una respuesta JSON y la valida con pydantic; si no valida, reintenta una vez con el error."""
    mensajes = [{"role": "system", "content": sistema}, {"role": "user", "content": usuario}]
    texto, _ = completar(mensajes, client=client)
    try:
        return modelo.model_validate(_json_de(texto))
    except (ValueError, ValidationError) as e:
        mensajes += [
            {"role": "assistant", "content": texto},
            {"role": "user", "content": f"Tu respuesta no es válida: {e}. Responde solo con el JSON corregido."},
        ]
        texto, _ = completar(mensajes, client=client)
        try:
            return modelo.model_validate(_json_de(texto))
        except (ValueError, ValidationError) as e2:
            raise LLMError(f"Respuesta inválida del LLM tras reintentar: {e2}") from e2
