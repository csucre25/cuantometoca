"""Seguimiento de los PR de parámetros: CI → botón Publicar → merge → deploy (docs/03 §1, pasos 3-4).

El worker revisa el CI de los PR abiertos y avisa con botones. Publicar hace squash merge a main,
lo que dispara deploy.yml (que avisa "🚀 Publicado" por Telegram). Si main cambió y el PR ya no se
puede fusionar, se rehace sobre la versión actual y se espera de nuevo el CI.
Con AUTO_MERGE_PARAMS=true se publica solo apenas el CI pasa (por defecto, no).
"""

from __future__ import annotations

import logging
import os
import subprocess
from datetime import date
from html import escape

from pipeline import github, notificar, params_pr
from pipeline.config import Site, cargar_env
from pipeline.paths import repo_dir
from pipeline.store import PR, Store

log = logging.getLogger("pipeline.publicacion")


def botones_publicar(pid: int) -> dict:
    return {"inline_keyboard": [[{"text": "🚀 Publicar", "callback_data": f"m:{pid}"}, {"text": "❌ Descartar", "callback_data": f"x:{pid}"}]]}


def botones_descartar(pid: int) -> dict:
    return {"inline_keyboard": [[{"text": "❌ Descartar", "callback_data": f"x:{pid}"}]]}


def _titulo(store: Store, pr: PR) -> str:
    p = store.propuesta(pr.propuesta_id)
    return f"{p.param_key} desde {p.date_from}" if p else f"propuesta #{pr.propuesta_id}"


def auto_merge() -> bool:
    cargar_env()
    return os.environ.get("AUTO_MERGE_PARAMS", "false").lower() == "true"


def sincronizar_repo() -> str | None:
    """`git pull --ff-only` de la copia local (solo en Docker, con REPO_AUTO_PULL=1). Devuelve el error o None."""
    if os.environ.get("REPO_AUTO_PULL") != "1":
        return None
    r = subprocess.run(
        ["git", "-c", f"safe.directory={repo_dir()}", "-C", str(repo_dir()), "pull", "--ff-only", "-q"],
        capture_output=True, text=True, timeout=120,
    )
    if r.returncode != 0:
        log.warning("git pull falló: %s", r.stderr.strip())
        return r.stderr.strip()[:200] or "git pull falló"
    return None


def revisar_prs(site: Site, store: Store) -> int:
    """Avisa los PR cuyo CI terminó. Devuelve cuántos cambiaron de estado."""
    cambios = 0
    for pr in store.prs("ci"):
        estado = github.estado_ci(pr.sha)
        if estado is None:
            continue
        cambios += 1
        titulo = escape(_titulo(store, pr))
        enlace = f'<a href="{escape(pr.url)}">PR #{pr.numero}</a>'
        if estado == "falla":
            store.actualizar_pr(pr.propuesta_id, "falla")
            notificar.enviar(site, f"❌ El CI falló en el {enlace} ({titulo}). No se publica; revísalo o descártalo.", botones=botones_descartar(pr.propuesta_id))
            continue
        store.actualizar_pr(pr.propuesta_id, "listo")
        if auto_merge():
            notificar.enviar(site, f"✅ CI en verde en el {enlace} ({titulo}). Publicando (AUTO_MERGE_PARAMS)…")
            notificar.enviar(site, publicar(store, pr.propuesta_id, hoy=date.today()))
        else:
            notificar.enviar(site, f"✅ CI en verde en el {enlace} ({titulo}): casos dorados y validación OK.", botones=botones_publicar(pr.propuesta_id))
    return cambios


def publicar(store: Store, pid: int, *, hoy: date) -> str:
    pr = store.pr(pid)
    if pr is None:
        return f"La propuesta #{pid} no tiene PR."
    if pr.estado == "publicado":
        return f"El PR #{pr.numero} ya estaba publicado."
    if pr.estado != "listo":
        return f"El PR #{pr.numero} aún no está listo (estado: {pr.estado})."
    p = store.propuesta(pid)
    titulo = f"chore(params-{p.country}): {p.param_key} desde {p.date_from}" if p else f"chore(params): propuesta #{pid}"
    if not github.merge_pr(pr.numero, titulo):
        # main cambió (otro parámetro publicado): rehacer el PR sobre la versión actual.
        github.cerrar_pr(pr.numero, pr.rama)
        nuevo = params_pr.abrir_pr(store, p, hoy=hoy, sufijo=f"-r{pr.intentos + 1}")  # type: ignore[arg-type]
        return f"🔁 main cambió y el PR #{pr.numero} ya no se podía fusionar. Abrí el <a href=\"{escape(nuevo['url'])}\">PR #{nuevo['numero']}</a> sobre la versión actual; te aviso cuando pase el CI."
    store.actualizar_pr(pid, "publicado")
    store.actualizar_propuesta(pid, "aplicada")
    store.registrar("pr_publicado", propuesta=pid, pr=pr.numero)
    try:
        github.borrar_rama(pr.rama)
    except github.GitHubError:
        log.warning("No se pudo borrar la rama %s", pr.rama)
    error = sincronizar_repo()
    extra = f"\n⚠️ No pude actualizar la copia local ({escape(error)}): corre <code>git pull</code>." if error else ""
    return f"🚀 PR #{pr.numero} fusionado en main. El deploy tarda unos 3 minutos; te aviso al terminar.{extra}"


def descartar(store: Store, pid: int) -> str:
    pr = store.pr(pid)
    if pr is None:
        return f"La propuesta #{pid} no tiene PR."
    if pr.estado in ("publicado", "cerrado"):
        return f"El PR #{pr.numero} ya estaba {pr.estado}."
    github.cerrar_pr(pr.numero, pr.rama)
    store.actualizar_pr(pid, "cerrado")
    store.actualizar_propuesta(pid, "ignorada")
    store.registrar("pr_cerrado", propuesta=pid, pr=pr.numero)
    return f"❌ PR #{pr.numero} cerrado y propuesta #{pid} descartada."
