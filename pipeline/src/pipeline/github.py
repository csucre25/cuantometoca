"""Consultas a GitHub Actions: último deploy y disparo manual del workflow `deploy.yml`.

También los PR de parámetros confirmados (params_pr.py). El repositorio sale de GITHUB_REPO
(owner/nombre) o del remoto `origin` del repo local. Para leer el último deploy basta el acceso
público; lo demás requiere GITHUB_TOKEN (fine-grained, solo este repo, Read and write en Actions,
Contents y Pull requests).
"""

from __future__ import annotations

import base64
import os
import re
from typing import Any

import httpx

from pipeline.config import cargar_env
from pipeline.paths import repo_dir

API = "https://api.github.com"
WORKFLOW = "deploy.yml"


class GitHubError(RuntimeError):
    pass


def repo_desde_git_config(texto: str) -> str | None:
    """'git@github.com:dueño/repo.git' o 'https://github.com/dueño/repo' → 'dueño/repo'."""
    m = re.search(r'\[remote "origin"\][^\[]*?url\s*=\s*\S*github\.com[:/]([^/\s]+/[^/\s]+?)(?:\.git)?\s*$', texto, re.M)
    return m.group(1) if m else None


def repo() -> str:
    cargar_env()
    if valor := os.environ.get("GITHUB_REPO"):
        return valor
    config = repo_dir() / ".git" / "config"
    if config.exists() and (r := repo_desde_git_config(config.read_text(encoding="utf-8"))):
        return r
    raise GitHubError("No se pudo determinar el repositorio: define GITHUB_REPO=dueño/repo")


def _cabeceras(token: str | None) -> dict[str, str]:
    h = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


def ultimo_deploy(*, client: httpx.Client | None = None) -> dict[str, Any] | None:
    """{estado, conclusion, fecha (ISO UTC), commit, url} del último deploy, o None si no hay."""
    cargar_env()
    cerrar = client is None
    client = client or httpx.Client(timeout=15)
    try:
        r = client.get(f"{API}/repos/{repo()}/actions/workflows/{WORKFLOW}/runs", params={"per_page": 1}, headers=_cabeceras(os.environ.get("GITHUB_TOKEN")))
        r.raise_for_status()
        runs = r.json().get("workflow_runs", [])
    finally:
        if cerrar:
            client.close()
    if not runs:
        return None
    run = runs[0]
    return {"estado": run["status"], "conclusion": run["conclusion"], "fecha": run["created_at"], "commit": run["head_sha"][:7], "url": run["html_url"]}


def _api(metodo: str, ruta: str, *, client: httpx.Client | None = None, **kw: Any) -> httpx.Response:
    """Llamada autenticada a la API (requiere GITHUB_TOKEN)."""
    cargar_env()
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        raise GitHubError("Falta GITHUB_TOKEN en el .env (permisos Actions, Contents y Pull requests: Read and write)")
    cerrar = client is None
    client = client or httpx.Client(timeout=20)
    try:
        return client.request(metodo, f"{API}/repos/{repo()}{ruta}", headers=_cabeceras(token), **kw)
    finally:
        if cerrar:
            client.close()


def _ok(r: httpx.Response, *esperados: int) -> httpx.Response:
    if r.status_code not in esperados:
        raise GitHubError(f"GitHub respondió {r.status_code}: {r.text[:200]}")
    return r


def leer_archivo(ruta: str, rama: str) -> tuple[str, str, str]:
    """(contenido, sha del archivo, sha del último commit de la rama)."""
    sha_rama = _ok(_api("GET", f"/git/ref/heads/{rama}"), 200).json()["object"]["sha"]
    datos = _ok(_api("GET", f"/contents/{ruta}", params={"ref": sha_rama}), 200).json()
    return base64.b64decode(datos["content"]).decode("utf-8"), datos["sha"], sha_rama


def crear_rama(rama: str, sha: str) -> None:
    _ok(_api("POST", "/git/refs", json={"ref": f"refs/heads/{rama}", "sha": sha}), 201)


def escribir_archivo(ruta: str, contenido: str, sha_archivo: str, rama: str, mensaje: str) -> str:
    """Commit del archivo en la rama. Devuelve el sha del commit."""
    datos = {"message": mensaje, "content": base64.b64encode(contenido.encode("utf-8")).decode("ascii"), "sha": sha_archivo, "branch": rama}
    return _ok(_api("PUT", f"/contents/{ruta}", json=datos), 200, 201).json()["commit"]["sha"]


def crear_pr(titulo: str, rama: str, cuerpo: str, base: str = "main") -> tuple[int, str]:
    pr = _ok(_api("POST", "/pulls", json={"title": titulo, "head": rama, "base": base, "body": cuerpo}), 201).json()
    return pr["number"], pr["html_url"]


def estado_ci(sha: str) -> str | None:
    """'ok', 'falla' o None (aún corriendo o sin empezar) para las corridas de ci.yml de un commit."""
    runs = _ok(_api("GET", "/actions/workflows/ci.yml/runs", params={"head_sha": sha}), 200).json().get("workflow_runs", [])
    if not runs or any(r["status"] != "completed" for r in runs):
        return None
    return "ok" if all(r["conclusion"] == "success" for r in runs) else "falla"


def merge_pr(numero: int, titulo: str) -> bool:
    """Squash merge. False si el PR ya no se puede fusionar (conflicto o rama desactualizada)."""
    r = _api("PUT", f"/pulls/{numero}/merge", json={"merge_method": "squash", "commit_title": f"{titulo} (#{numero})"})
    if r.status_code in (405, 409):
        return False
    _ok(r, 200)
    return True


def cerrar_pr(numero: int, rama: str) -> None:
    _ok(_api("PATCH", f"/pulls/{numero}", json={"state": "closed"}), 200)
    borrar_rama(rama)


def borrar_rama(rama: str) -> None:
    _ok(_api("DELETE", f"/git/refs/heads/{rama}"), 204, 422)  # 422: ya no existe


def disparar_deploy(site_id: str, *, client: httpx.Client | None = None) -> None:
    cargar_env()
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        raise GitHubError("Falta GITHUB_TOKEN en el .env (permiso Actions: Read and write)")
    cerrar = client is None
    client = client or httpx.Client(timeout=15)
    try:
        r = client.post(
            f"{API}/repos/{repo()}/actions/workflows/{WORKFLOW}/dispatches",
            json={"ref": "main", "inputs": {"site": site_id}},
            headers=_cabeceras(token),
        )
    finally:
        if cerrar:
            client.close()
    if r.status_code != 204:
        raise GitHubError(f"GitHub respondió {r.status_code}: {r.text[:200]}")
