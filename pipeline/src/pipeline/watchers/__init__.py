"""Watchers de fuentes oficiales. Cada uno devuelve alertas; avisar o proponer cambios es aparte."""

import unicodedata
from functools import cache
from pathlib import Path

import yaml

from pipeline.paths import config_dir


def normalizar(texto: str) -> str:
    """Minúsculas y sin tildes, para comparar términos de forma tolerante."""
    sin_tildes = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode("ascii")
    return " ".join(sin_tildes.lower().split())


@cache
def config_watchers(country: str) -> dict:
    path: Path = config_dir() / "countries" / country / "watchers.yaml"
    return yaml.safe_load(path.read_text(encoding="utf-8")) if path.exists() else {}
