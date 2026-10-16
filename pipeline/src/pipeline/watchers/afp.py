"""Watcher de comisiones, prima de seguro y tope asegurable del Sistema Privado de Pensiones.

La SBS bloquea el acceso automatizado (Imperva), así que se usa la tabla comparativa de las cuatro
AFP que publica AFP Integra (decisión del usuario, docs/decisiones.md). Las resoluciones de la SBS se
vigilan además en El Peruano. Nada se aplica sin confirmación: si un valor difiere de params.json, se
crea una propuesta pendiente para aprobar por Telegram.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

import httpx
from selectolax.lexbor import LexborHTMLParser
from tenacity import retry, stop_after_attempt, wait_exponential

from pipeline import parametros
from pipeline.store import Store
from pipeline.watchers import config_watchers, normalizar
from pipeline.watchers.elperuano import USER_AGENT

FUENTE = "afp"
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]


@dataclass
class ValoresAfp:
    comisiones: dict[str, dict[str, str]]  # {afp: {flujo, mixta_flujo, mixta_saldo_anual}}
    prima: str
    aporte: str
    tope: str | None
    tope_desde: str | None  # primer día del trimestre de vigencia


@dataclass
class Cambio:
    param_key: str
    anterior: object
    nuevo: object
    desde: str
    propuesta_id: int


def pct(texto: str) -> str:
    """'1.37%' → '0.0137'; '0.00%' → '0'."""
    d = Decimal(texto.strip().rstrip("%").replace(",", ".")) / 100
    return format(d.normalize(), "f") if d else "0"


def parsear(html: str, fila_sin_nombre: str) -> ValoresAfp:
    """Extrae las tablas de comisiones (sobre el sueldo y mixta) y el tope de la prima."""
    tablas = LexborHTMLParser(html).css("table")
    flujo: dict[str, str] = {}
    mixta: dict[str, tuple[str, str]] = {}
    prima = aporte = ""
    for tabla in tablas:
        filas = [[c.text(strip=True) for c in tr.css("th,td")] for tr in tabla.css("tr")]
        if not filas:
            continue
        cab = [normalizar(c) for c in filas[0]]
        if not cab or cab[0] != "afp":
            continue
        es_mixta = any("anual sobre tu fondo" in c for c in cab)
        for fila in filas[1:]:
            afp = normalizar(fila[0]) or fila_sin_nombre
            aporte, prima = pct(fila[1]), pct(fila[2])
            if es_mixta:
                mixta[afp] = (pct(fila[4]), pct(fila[3]))  # (sobre el sueldo, anual sobre el fondo)
            else:
                flujo[afp] = pct(fila[3])
    if not flujo or not mixta:
        raise ValueError("No se encontraron las tablas de comisiones: la página pudo cambiar de formato")
    comisiones = {
        afp: {"flujo": flujo[afp], "mixta_flujo": mixta[afp][0], "mixta_saldo_anual": mixta[afp][1]} for afp in sorted(flujo) if afp in mixta
    }

    texto = normalizar(LexborHTMLParser(html).text(separator=" "))
    tope = tope_desde = None
    m = re.search(r"tope de sueldo de hasta s/ ?([\d,]+\.\d{2}) \(vigente ([a-z]+)[^)]*?de (\d{4})\)", texto)
    if m:
        tope = m.group(1).replace(",", "")
        if m.group(2) in MESES:
            tope_desde = date(int(m.group(3)), MESES.index(m.group(2)) + 1, 1).isoformat()
    return ValoresAfp(comisiones, prima, aporte, tope, tope_desde)


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=2, max=30), reraise=True)
def descargar(url: str) -> str:
    with httpx.Client(timeout=30, headers={"User-Agent": USER_AGENT}, follow_redirects=True) as c:
        r = c.get(url)
        r.raise_for_status()
        return r.text


def _vigente(country: str, clave: str, dia: date) -> object:
    e = parametros.vigente(country, clave, dia)
    return e["value"] if e else None


def _iguales(a: object, b: object) -> bool:
    """Compara valores numéricos como decimales ('0.0160' == '0.016') y tablas campo por campo."""
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(_iguales(a[k], b[k]) for k in a)
    try:
        return Decimal(str(a)) == Decimal(str(b))
    except Exception:
        return a == b


def revisar(country: str, dia: date, store: Store, *, html: str | None = None) -> list[Cambio]:
    """Compara los valores publicados con params.json y crea propuestas para los que cambiaron."""
    cfg = config_watchers(country).get(FUENTE)
    if not cfg:
        return []
    html = html if html is not None else descargar(cfg["url"])
    valores = parsear(html, cfg["fila_sin_nombre"])
    # Cambios de comisiones o prima: rigen desde el mes en curso (se puede corregir al confirmar).
    inicio_mes = dia.replace(day=1).isoformat()
    candidatos = [
        ("afp_comisiones", valores.comisiones, inicio_mes),
        ("afp_prima_seguro", valores.prima, inicio_mes),
        ("afp_aporte_obligatorio", valores.aporte, inicio_mes),
    ]
    if valores.tope:
        candidatos.append(("afp_remuneracion_maxima_asegurable", f"{Decimal(valores.tope):.2f}", valores.tope_desde or inicio_mes))

    cambios = []
    for clave, nuevo, desde in candidatos:
        anterior = _vigente(country, clave, dia)
        if anterior is not None and _iguales(anterior, nuevo):
            continue
        pid = store.proponer_parametro(country, clave, nuevo, desde, cfg["fuente"], cfg["url"])
        if store.es_nuevo(FUENTE, f"{clave}:{desde}", json.dumps(nuevo, sort_keys=True)):
            cambios.append(Cambio(clave, anterior, nuevo, desde, pid))
    return cambios


def mensaje(cambio: Cambio) -> str:
    def fmt(v: object) -> str:
        if isinstance(v, dict):
            return "\n".join(f"  • {afp}: {', '.join(f'{k} {x}' for k, x in d.items())}" for afp, d in v.items())
        return str(v)

    return (
        f"🏦 <b>Cambio detectado en AFP</b> (propuesta #{cambio.propuesta_id})\n"
        f"Parámetro: <code>{cambio.param_key}</code> desde {cambio.desde}\n"
        f"Antes:\n{fmt(cambio.anterior)}\nAhora:\n{fmt(cambio.nuevo)}\n\n"
        f"Nada se aplica sin tu confirmación."
    )
