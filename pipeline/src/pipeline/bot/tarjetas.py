"""Mensajes con botones de aprobación (docs/03 §1-2).

Funciones puras que devuelven texto HTML y el `reply_markup` de la Bot API como dict: los usa el bot
(aiogram) y también el worker, que envía los avisos con httpx sin tener el bot cargado.
Datos de los botones: "p:<acción>:<id>" para propuestas y "b:<acción>:<id>" para borradores.
"""

from __future__ import annotations

from html import escape
from typing import Any

from pipeline import parametros
from pipeline.store import Borrador, Propuesta

Botones = dict[str, Any]


def _boton(texto: str, datos: str) -> dict[str, str]:
    return {"text": texto, "callback_data": datos}


def _valor(p: Propuesta) -> str:
    unit = parametros.unidad(p.country, p.param_key)
    if isinstance(p.value, dict):
        return "\n" + "\n".join(
            f"  • {escape(k)}: " + (", ".join(f"{escape(c)} {escape(str(x))}" for c, x in v.items()) if isinstance(v, dict) else escape(str(v)))
            for k, v in p.value.items()
        )
    return f"<b>{escape(parametros.formatear(p.value, unit))}</b>"


def texto_propuesta(p: Propuesta) -> str:
    fuente = f'<a href="{escape(p.url)}">{escape(p.source)}</a>' if p.url else escape(p.source)
    y, m, d = p.date_from.split("-")
    return (
        f"📌 <b>Propuesta #{p.id}</b>\n"
        f"Parámetro: <code>{escape(p.param_key)}</code>\n"
        f"Valor: {_valor(p)}\n"
        f"Desde: {d}/{m}/{y}\n"
        f"Fuente: {fuente}"
    )


def botones_propuesta(p: Propuesta) -> Botones:
    fila = [_boton("✅ Confirmar", f"p:c:{p.id}")]
    # Las tablas (comisiones de AFP) no se corrigen por chat: se ignoran y se editan en el repo.
    if not isinstance(p.value, dict):
        fila.append(_boton("✏️ Corregir", f"p:e:{p.id}"))
    fila.append(_boton("❌ Ignorar", f"p:i:{p.id}"))
    return {"inline_keyboard": [fila]}


def texto_borrador(b: Borrador, max_chars: int = 700) -> str:
    cuerpo = b.body if len(b.body) <= max_chars else b.body[:max_chars].rsplit(" ", 1)[0] + "…"
    return f"📝 <b>Borrador #{b.id}</b> · {escape(b.kind)}\n<b>{escape(b.title)}</b>\n\n{escape(cuerpo)}"


def botones_borrador(b: Borrador) -> Botones:
    return {"inline_keyboard": [[_boton("✅ Aprobar", f"b:a:{b.id}"), _boton("❌ Descartar", f"b:d:{b.id}")]]}
