"""Watcher de normas legales del diario oficial El Peruano.

Consulta /Normas/Filtro (el mismo formulario del portal) para un día, extrae cada norma y marca las
que coinciden con los términos de config/countries/<pais>/watchers.yaml. Es idempotente: una norma
ya avisada no se vuelve a avisar (seen_items en SQLite).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date

import httpx
from selectolax.lexbor import LexborHTMLParser as HTMLParser
from tenacity import retry, stop_after_attempt, wait_exponential

from pipeline.store import Store
from pipeline.watchers import config_watchers, normalizar

FUENTE = "elperuano"
USER_AGENT = "Mozilla/5.0 (compatible; calculadoras-laborales-watcher/0.1; +https://github.com/csucre25/cuantometoca)"


@dataclass(frozen=True)
class Norma:
    id: str
    titulo: str
    sumilla: str
    sector: str
    fecha: str
    url: str
    pdf: str | None
    extraordinaria: bool


@dataclass
class Alerta:
    norma: Norma
    reglas: list[str]
    params: list[str] = field(default_factory=list)


def parsear(html: str) -> list[Norma]:
    """Extrae las normas del HTML que devuelve /Normas/Filtro."""
    normas = []
    for art in HTMLParser(html).css("article.edicionesoficiales_articulos"):
        enlace = art.css_first("h5 a")
        if enlace is None:
            continue
        url = enlace.attributes.get("href") or ""
        parrafos = [p.text(strip=True) for p in art.css(".ediciones_texto p")]
        fecha = re.search(r"(\d{2})/(\d{2})/(\d{4})", parrafos[0] if parrafos else "")
        pdf = next((a.attributes.get("href") for a in art.css(".ediciones_botones a") if (a.attributes.get("href") or "").endswith("/pdf")), None)
        normas.append(
            Norma(
                id=url.rstrip("/").split("/")[-1] or enlace.text(strip=True),
                titulo=enlace.text(strip=True),
                sumilla=parrafos[1] if len(parrafos) > 1 else "",
                sector=(art.css_first("h4").text(strip=True) if art.css_first("h4") else ""),
                fecha=f"{fecha.group(3)}-{fecha.group(2)}-{fecha.group(1)}" if fecha else "",
                url=url,
                pdf=pdf,
                extraordinaria=art.css_first(".extraordinaria") is not None,
            )
        )
    return normas


def coincidencias(norma: Norma, reglas: list[dict]) -> Alerta | None:
    """Reglas cuyo término aparece (como palabra completa) en el título o la sumilla."""
    texto = normalizar(f"{norma.titulo} {norma.sumilla}")
    ids, params = [], []
    for regla in reglas:
        if any(re.search(rf"\b{re.escape(normalizar(t))}\b", texto) for t in regla["terminos"]):
            ids.append(regla["id"])
            params += [p for p in regla.get("params", []) if p not in params]
    return Alerta(norma, ids, params) if ids else None


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=2, max=30), reraise=True)
def descargar(dia: date, url_filtro: str, client: httpx.Client | None = None) -> str:
    """HTML de las normas de un día (mismo POST que hace el portal)."""
    ddmmaaaa = dia.strftime("%d/%m/%Y")
    params = {"dateparam": dia.strftime("%m/%d/%Y 00:00:00")}
    datos = {"cddesde": ddmmaaaa, "cdhasta": ddmmaaaa, "btnBuscar": ""}
    cerrar = client is None
    client = client or httpx.Client(timeout=30, headers={"User-Agent": USER_AGENT, "X-Requested-With": "XMLHttpRequest"})
    try:
        r = client.post(url_filtro, params=params, data=datos)
        r.raise_for_status()
        return r.text
    finally:
        if cerrar:
            client.close()


def revisar(country: str, dia: date, store: Store, *, html: str | None = None) -> list[Alerta]:
    """Alertas nuevas del día: normas que coinciden con las reglas y aún no se habían avisado."""
    cfg = config_watchers(country).get(FUENTE)
    if not cfg:
        return []
    html = html if html is not None else descargar(dia, cfg["url_filtro"])
    nuevas = []
    for norma in parsear(html):
        alerta = coincidencias(norma, cfg["reglas"])
        if alerta and store.es_nuevo(FUENTE, norma.id, f"{norma.titulo}\n{norma.sumilla}", title=norma.titulo, url=norma.url):
            nuevas.append(alerta)
    return nuevas


def mensaje(alerta: Alerta) -> str:
    """Texto del aviso para Telegram (HTML simple)."""
    n = alerta.norma
    extra = " · Edición extraordinaria" if n.extraordinaria else ""
    return (
        f"📜 <b>Posible cambio normativo</b>\n"
        f"<b>{_esc(n.titulo)}</b> ({_esc(n.sector)}{extra})\n"
        f"{_esc(n.sumilla)}\n\n"
        f"Temas: {', '.join(alerta.reglas)}\n"
        f"Parámetros a revisar: {', '.join(alerta.params) or '—'}\n"
        f'<a href="{n.url}">Ver norma</a>' + (f' · <a href="{n.pdf}">PDF</a>' if n.pdf else "")
    )


def _esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
