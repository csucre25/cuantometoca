"""Lectura de config/countries/<pais>/params.json para el pipeline (valores vigentes y formato)."""

from __future__ import annotations

import json
from datetime import date
from decimal import Decimal
from typing import Any

from pipeline.config import params_path


def cargar(country: str) -> dict[str, Any]:
    return json.loads(params_path(country).read_text(encoding="utf-8"))["params"]


def vigente(country: str, clave: str, dia: date) -> dict[str, Any] | None:
    """Entrada del historial vigente en `dia` ({from, to, value, source, …}) o None."""
    hoy = dia.isoformat()
    for e in cargar(country)[clave]["history"]:
        if e["from"] <= hoy and (e["to"] is None or hoy <= e["to"]):
            return e
    return None


def unidad(country: str, clave: str) -> str | None:
    p = cargar(country).get(clave)
    return p.get("unit") if p else None


def es_escalar(unit: str | None) -> bool:
    return unit not in ("object", "table")


def _sin_ceros(d: Decimal) -> str:
    return format(d.normalize(), "f")


def formatear(valor: Any, unit: str | None) -> str:
    """Valor legible para Telegram: 'S/ 1,230.00', '13%', '7 UIT', '28/06/2008'."""
    if isinstance(valor, (dict, list)):
        return json.dumps(valor, ensure_ascii=False)
    v = str(valor)
    match unit:
        case "PEN":
            return f"S/ {Decimal(v):,.2f}"
        case "ratio":
            return f"{_sin_ceros(Decimal(v) * 100)}%"
        case "uit":
            return f"{v} UIT"
        case "hours":
            return f"{v} h"
        case "days":
            return f"{v} días"
        case "date":
            y, m, d = v.split("-")
            return f"{d}/{m}/{y}"
        case _:
            return v
