"""Revisión diaria de un site: El Peruano, AFP y extracciones pendientes (docs/03 §1).

La usan `params-check` (CLI) y el worker. Revisa también el día anterior en El Peruano para no perder
ediciones extraordinarias publicadas después de la revisión; las normas ya vistas no se repiten.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import date, timedelta

from pipeline import notificar, revision
from pipeline.config import Site
from pipeline.store import Store
from pipeline.watchers import afp, elperuano

Eco = Callable[[str], None]


def revisar_site(site: Site, fecha: date, *, notify: bool, eco: Eco = print) -> int:
    """Corre la revisión y, con `notify`, avisa por Telegram. Devuelve la cantidad de avisos."""
    store = Store.del_site(site.site_id)
    country = site.country
    tag = f"[{site.site_id}]"
    avisos = 0

    # Extracciones que fallaron en corridas anteriores.
    for titulo, detalle in revision.reintentar_pendientes(country, store):
        eco(f"{tag} Reintento de extracción: {titulo}\n    {detalle}")
        avisos += 1
        if notify:
            notificar.enviar(site, f"🔁 <b>Extracción completada</b>: {titulo}\n{detalle}")

    for dia in (fecha - timedelta(days=1), fecha):
        alertas = elperuano.revisar(country, dia, store)
        store.registrar("params_check", fuente="elperuano", dia=dia.isoformat(), alertas=len(alertas))
        eco(f"{tag} El Peruano {dia.isoformat()}: {len(alertas)} norma(s) nueva(s) relevante(s)")
        for a in alertas:
            eco(f"  - {a.norma.titulo}: {a.norma.sumilla[:100]} [{', '.join(a.reglas)}]")
            _, detalle = revision.proponer_desde_norma(
                country, store, norma_id=a.norma.id, titulo=a.norma.titulo, url=a.norma.url, fecha=a.norma.fecha, params=a.params
            )
            eco(f"    {detalle}")
            avisos += 1
            if notify:
                notificar.enviar(site, elperuano.mensaje(a) + "\n\n" + detalle)
                store.registrar("aviso_enviado", fuente="elperuano", norma=a.norma.id)

    cambios = afp.revisar(country, fecha, store)
    store.registrar("params_check", fuente="afp", dia=fecha.isoformat(), cambios=len(cambios))
    eco(f"{tag} AFP (comisiones, prima, tope): {len(cambios)} cambio(s)")
    for c in cambios:
        eco(f"  - #{c.propuesta_id} {c.param_key}: {c.anterior} -> {c.nuevo} desde {c.desde}")
        avisos += 1
        if notify:
            from pipeline.bot.tarjetas import botones_propuesta

            p = store.propuesta(c.propuesta_id)
            notificar.enviar(site, afp.mensaje(c), botones=botones_propuesta(p) if p and p.status == "pendiente" else None)
            store.es_nuevo("tarjeta", f"p{c.propuesta_id}", "enviada")
            store.registrar("aviso_enviado", fuente="afp", propuesta=c.propuesta_id)

    # Propuestas nuevas de El Peruano (o reintentos): una tarjeta con botones por cada una.
    if notify:
        notificar.tarjetas_pendientes(site, store)
    return avisos
