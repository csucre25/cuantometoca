"""Configuración de sites (config/sites/*.yaml) y resolución de secretos.

Regla de resolución (docs/02 §7): primero la variable genérica (TELEGRAM_BOT_TOKEN, usada en CI
donde ya se eligió el site), luego el nombre indicado en `*_env` del site (TELEGRAM_BOT_TOKEN_PE,
uso local con varios sites en un mismo .env). Los YAML guardan nombres de variables, nunca valores.
"""

from __future__ import annotations

import os
from functools import cache
from pathlib import Path

import yaml
from dotenv import load_dotenv
from pydantic import BaseModel

from pipeline.paths import config_dir, repo_dir


class Telegram(BaseModel):
    bot_token_env: str
    admin_chat_id_env: str


class Cloudflare(BaseModel):
    pages_project: str
    account_id_env: str
    api_token_env: str


class Site(BaseModel):
    site_id: str
    country: str
    enabled: bool
    locale: str
    domain: str
    timezone: str
    telegram: Telegram
    cloudflare: Cloudflare
    calculators: list[str]

    @property
    def sufijo(self) -> str:
        return f"_{self.site_id.upper()}"

    def secreto(self, nombre_env: str, *, requerido: bool = True) -> str | None:
        """Valor de una variable `*_env` del site (genérica primero, luego la del site)."""
        cargar_env()
        generico = nombre_env.removesuffix(self.sufijo)
        valor = os.environ.get(generico) or os.environ.get(nombre_env)
        if not valor and requerido:
            raise ConfigError(f"Falta la variable {nombre_env} (o {generico}) para el site '{self.site_id}'")
        return valor or None

    @property
    def telegram_token(self) -> str:
        return self.secreto(self.telegram.bot_token_env)  # type: ignore[return-value]

    @property
    def telegram_admin_chat_id(self) -> int:
        return int(self.secreto(self.telegram.admin_chat_id_env))  # type: ignore[arg-type]


class ConfigError(RuntimeError):
    pass


@cache
def cargar_env() -> None:
    """Carga el .env de la raíz para uso local. No sobrescribe variables ya definidas (CI)."""
    load_dotenv(repo_dir() / ".env", override=False)


def _sites_dir() -> Path:
    return config_dir() / "sites"


def cargar_sites(*, solo_habilitados: bool = False) -> list[Site]:
    sites = []
    for path in sorted(_sites_dir().glob("*.yaml")):
        if path.name.startswith("_"):
            continue
        site = Site.model_validate(yaml.safe_load(path.read_text(encoding="utf-8")))
        if site.enabled or not solo_habilitados:
            sites.append(site)
    return sites


def cargar_site(site_id: str) -> Site:
    path = _sites_dir() / f"{site_id}.yaml"
    if not path.exists():
        raise ConfigError(f"No existe config/sites/{site_id}.yaml")
    return Site.model_validate(yaml.safe_load(path.read_text(encoding="utf-8")))


def params_path(country: str) -> Path:
    return config_dir() / "countries" / country / "params.json"
