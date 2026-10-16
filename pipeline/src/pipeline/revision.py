"""De una norma relevante a propuestas de parámetros (extracción con LLM + cola de reintentos).

Si la extracción falla en el proveedor principal, la norma queda en extraction_queue y se reintenta
en cada corrida de params-check; mientras tanto el aviso indica que se revise a mano (docs/02 §7).
"""

from __future__ import annotations

from collections.abc import Callable

import httpx

from pipeline.extraccion import extraer_cambios
from pipeline.llm.client import LLMError, proveedores
from pipeline.store import Store
from pipeline.watchers import elperuano

ObtenerTexto = Callable[[str], str]


def proponer_desde_norma(
    country: str, store: Store, *, norma_id: str, titulo: str, url: str, fecha: str, params: list[str], obtener_texto: ObtenerTexto = elperuano.texto_norma
) -> tuple[bool, str]:
    """(terminó, detalle para el aviso). Si falla, encola la norma para reintentar."""
    if not proveedores("extraccion"):
        return True, "Extracción automática no disponible (sin LLM configurado): revisar la norma a mano."
    try:
        aceptados, descartes = extraer_cambios(country, obtener_texto(url), fecha, params)
    except (LLMError, ValueError, httpx.HTTPError) as e:
        store.encolar_extraccion(norma_id, titulo, url, fecha, params, str(e)[:300])
        return False, "No se pudo extraer el valor con el modelo principal; se reintentará en la próxima revisión. Mientras tanto, revisa la norma a mano."
    store.quitar_extraccion(norma_id)
    lineas = []
    for c in aceptados:
        pid = store.proponer_parametro(country, c.clave, c.valor, c.vigente_desde.isoformat(), titulo, url)
        lineas.append(f"Valor detectado (LLM): {c.clave} = {c.valor} desde {c.vigente_desde.isoformat()} → propuesta #{pid}")
    if descartes:
        lineas.append("Descartado por no estar respaldado en el texto: " + "; ".join(descartes))
    return True, "\n".join(lineas) or "La norma no fija un valor nuevo concreto para los parámetros vigilados."


def reintentar_pendientes(country: str, store: Store, *, obtener_texto: ObtenerTexto = elperuano.texto_norma) -> list[tuple[str, str]]:
    """Reintenta las extracciones encoladas. Devuelve (título, detalle) de las que ya terminaron."""
    terminadas = []
    for p in store.extracciones_pendientes():
        ok, detalle = proponer_desde_norma(
            country, store, norma_id=p["norma_id"], titulo=p["titulo"], url=p["url"], fecha=p["fecha"], params=p["params"], obtener_texto=obtener_texto
        )
        if ok:
            terminadas.append((p["titulo"], detalle))
    return terminadas
