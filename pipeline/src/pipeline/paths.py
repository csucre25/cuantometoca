"""Rutas del repo y de la configuración.

REPO_DIR y CONFIG_DIR se pueden fijar por variable de entorno (Docker monta el repo en
/repo y la config en /app/config). Por defecto se resuelven relativas a la raíz del repo.
"""
import os
from pathlib import Path

# pipeline/src/pipeline/paths.py -> raíz del repo
_DEFAULT_REPO_DIR = Path(__file__).resolve().parents[3]


def repo_dir() -> Path:
    return Path(os.environ.get("REPO_DIR") or _DEFAULT_REPO_DIR)


def config_dir() -> Path:
    env = os.environ.get("CONFIG_DIR")
    return Path(env) if env else repo_dir() / "config"
