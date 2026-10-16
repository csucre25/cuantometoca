"""Consultas a GitHub Actions: último deploy y disparo manual del workflow `deploy.yml`.

El repositorio sale de GITHUB_REPO (owner/nombre) o del remoto `origin` del repo local. Para leer
basta el acceso público; para disparar un deploy hace falta GITHUB_TOKEN (fine-grained, permiso
Actions: Read and write sobre este repositorio).
"""

from __future__ import annotations

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
