"""Worker local (docker-compose): corre la revisión diaria de cada site habilitado.

Corre en la PC del usuario y no en GitHub Actions porque la base SQLite (normas vistas, propuestas)
debe persistir y ser la misma que lee el bot. Hora por país en watchers.yaml → `hora_revision`
(hora del site). Si la PC estuvo apagada, revisa al encender. Respeta /pausa. Si una fuente falla,
reintenta cada 30 minutos; al tercer fallo del día avisa por Telegram y espera al día siguiente.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from pipeline import notificar, publicacion, tareas
from pipeline.config import Site, cargar_sites
from pipeline.store import Store
from pipeline.watchers import config_watchers

log = logging.getLogger("pipeline.worker")

HORA_POR_DEFECTO = "07:15"
REINTENTO = timedelta(minutes=30)
MAX_FALLOS = 3

Revisar = Callable[[Site, date], object]


def _revisar(site: Site, dia: date) -> object:
    return tareas.revisar_site(site, dia, notify=True, eco=log.info)


def tick(site: Site, store: Store, ahora: datetime, revisar: Revisar = _revisar) -> str | None:
    """Un paso del worker para un site. Devuelve lo que hizo ('ok', 'error', 'pausado') o None."""
    if store.ajuste("pausa") == "1":
        return "pausado"
    local = ahora.astimezone(ZoneInfo(site.timezone))
    hoy = local.date().isoformat()
    if store.ajuste("revision_ok") == hoy:
        return None
    if local.strftime("%H:%M") < config_watchers(site.country).get("hora_revision", HORA_POR_DEFECTO):
        return None
    if (proximo := store.ajuste("revision_proximo")) and ahora.isoformat() < proximo:
        return None
    publicacion.sincronizar_repo()  # params.json al día antes de comparar
    try:
        revisar(site, local.date())
    except Exception as e:
        dia_fallos, _, n = (store.ajuste("revision_fallos") or "").partition(":")
        fallos = int(n) + 1 if dia_fallos == hoy else 1
        store.fijar_ajuste("revision_fallos", f"{hoy}:{fallos}")
        store.registrar("revision_error", dia=hoy, intento=fallos, error=str(e)[:300])
        log.exception("Falló la revisión de %s (intento %s)", site.site_id, fallos)
        if fallos >= MAX_FALLOS:
            store.fijar_ajuste("revision_ok", hoy)  # no insistir más hoy
            try:
                notificar.enviar(site, f"⚠️ La revisión diaria falló {fallos} veces hoy ({type(e).__name__}). Se intentará de nuevo mañana.")
            except Exception:
                log.exception("Tampoco se pudo avisar por Telegram")
        else:
            store.fijar_ajuste("revision_proximo", (ahora + REINTENTO).isoformat())
        return "error"
    store.fijar_ajuste("revision_ok", hoy)
    store.registrar("revision_ok", dia=hoy)
    return "ok"


def ejecutar(intervalo: int = 60) -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    log.info("Worker en marcha (revisión cada %s s)", intervalo)
    while True:
        for site in cargar_sites(solo_habilitados=True):
            store = Store.del_site(site.site_id)
            try:
                if (hecho := tick(site, store, datetime.now(UTC))) in ("ok", "error"):
                    log.info("Revisión de %s: %s", site.site_id, hecho)
            except Exception:
                log.exception("Error inesperado en el worker (%s)", site.site_id)
            # Seguimiento del CI de los PR de parámetros (no depende de /pausa).
            try:
                publicacion.revisar_prs(site, store)
            except Exception:
                log.exception("Error revisando los PR de %s", site.site_id)
        time.sleep(intervalo)
