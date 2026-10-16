"""Extracción estructurada de cambios de parámetros desde el texto de una norma (con LLM).

Salvaguardas, porque son datos legales:
1. El LLM solo puede usar claves que existen en params.json y que la alerta marcó como posibles.
2. Cada valor debe venir con una cita literal de la norma; si la cita no está en el texto o el número
   no aparece en la cita, el cambio se descarta.
3. Lo extraído solo crea propuestas pendientes: se aplican cuando el usuario las confirma en Telegram.
"""

from __future__ import annotations

import json
import re
from datetime import date
from decimal import Decimal, InvalidOperation

from pydantic import BaseModel, Field

from pipeline.config import params_path
from pipeline.llm import client as llm
from pipeline.watchers import normalizar


class CambioExtraido(BaseModel):
    clave: str = Field(description="Clave de params.json")
    valor: str = Field(description="Nuevo valor como decimal con punto: '1230.00', '0.0137'")
    vigente_desde: date
    cita: str = Field(description="Fragmento literal de la norma que contiene el valor y la fecha")


class Extraccion(BaseModel):
    cambios: list[CambioExtraido] = []
    notas: str = ""


SISTEMA = """Eres un asistente que lee normas legales peruanas y extrae SOLO cambios explícitos de valores legales.
Responde únicamente con un JSON con esta forma:
{"cambios": [{"clave": "...", "valor": "...", "vigente_desde": "YYYY-MM-DD", "cita": "..."}], "notas": "..."}
Reglas:
- Usa solo claves de la lista que se te da. Si la norma no fija un valor nuevo para ninguna, devuelve "cambios": [].
- "valor": número con punto decimal, sin símbolos ni separadores de miles (S/ 1,230.00 → "1230.00"; 1.37% → "0.0137").
- "vigente_desde": fecha desde la que rige el valor según la norma. Si no la indica, usa la fecha de publicación.
- "cita": copia literal y exacta del fragmento de la norma que contiene el valor (sin parafrasear).
- No inventes valores ni fechas. Si algo se anuncia para el futuro sin un valor y fecha concretos, explícalo en "notas"."""


def _claves_validas(country: str) -> dict[str, str]:
    data = json.loads(params_path(country).read_text(encoding="utf-8"))
    return {k: v.get("description", "") for k, v in data["params"].items() if v.get("unit") not in ("object", "table")}


def _numero_en(cita: str, valor: str) -> bool:
    """El valor (o su forma en porcentaje) aparece en la cita: '1230.00' ~ 'S/ 1,230.00'; '0.0137' ~ '1.37%'."""
    nums = {re.sub(r"[,\s]", "", n) for n in re.findall(r"\d[\d,\s]*(?:\.\d+)?", cita)}
    try:
        v = Decimal(valor)
    except InvalidOperation:
        return False
    for n in nums:
        try:
            d = Decimal(n)
        except InvalidOperation:
            continue
        if d == v or d == v * 100:
            return True
    return False


def extraer_cambios(country: str, texto_norma: str, fecha_publicacion: str, posibles: list[str]) -> tuple[list[CambioExtraido], list[str]]:
    """Cambios validados y motivos de descarte. `posibles` = parámetros que la alerta marcó."""
    validas = _claves_validas(country)
    claves = {k: validas[k] for k in posibles if k in validas} or validas
    usuario = (
        f"Fecha de publicación: {fecha_publicacion}\n"
        f"Claves posibles:\n" + "\n".join(f"- {k}: {d}" for k, d in claves.items()) + f"\n\nTexto de la norma:\n{texto_norma[:12000]}"
    )
    resultado = llm.extraer(SISTEMA, usuario, Extraccion)
    texto_norm = normalizar(texto_norma)
    aceptados, descartes = [], []
    for c in resultado.cambios:
        if c.clave not in claves:
            descartes.append(f"{c.clave}: clave no permitida")
        elif normalizar(c.cita) not in texto_norm:
            descartes.append(f"{c.clave}: la cita no aparece en la norma")
        elif not _numero_en(c.cita, c.valor):
            descartes.append(f"{c.clave}: el valor {c.valor} no aparece en la cita")
        else:
            aceptados.append(c)
    return aceptados, descartes
