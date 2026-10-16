"""Lógica de los comandos y botones del bot, sin dependencias de Telegram (se prueba sin red).

Ningún botón aplica un valor legal: confirmar solo marca la propuesta como lista para aplicarse a
params.json; el cambio llega al sitio por commit, con los casos dorados en CI (docs/03 §1).
"""

from __future__ import annotations

import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from html import escape
from typing import Any
from zoneinfo import ZoneInfo

import yaml

from pipeline import parametros
from pipeline.config import Site
from pipeline.paths import config_dir
from pipeline.store import Store

AYUDA = """<b>Comandos</b>
/estado — último deploy, parámetros clave y pendientes
/pendientes — propuestas y borradores por aprobar
/parametros — valores vigentes con su fuente
/temporada — qué preparar ahora y lo próximo
/deploy — publicar el sitio de nuevo
/pausa · /reanudar — detener o reanudar la revisión diaria
/cancelar — cancelar una corrección en curso"""

NOMBRE_ESTADO = {"pendiente": "pendiente", "confirmada": "confirmada", "ignorada": "ignorada", "aplicada": "aplicada"}
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]


def _fmt_fecha(iso: str) -> str:
    y, m, d = iso[:10].split("-")
    return f"{d}/{m}/{y}"


# --- Propuestas de parámetros -------------------------------------------------------------------


def confirmar_propuesta(store: Store, pid: int) -> str:
    p = store.propuesta(pid)
    if p is None:
        return f"No existe la propuesta #{pid}."
    if p.status != "pendiente":
        return f"La propuesta #{pid} ya estaba {NOMBRE_ESTADO[p.status]}."
    store.actualizar_propuesta(pid, "confirmada")
    store.registrar("propuesta_confirmada", propuesta=pid, clave=p.param_key)
    valor = parametros.formatear(p.value, parametros.unidad(p.country, p.param_key)) if not isinstance(p.value, dict) else "tabla"
    return f"✅ Propuesta #{pid} confirmada: <code>{escape(p.param_key)}</code> = {escape(valor)} desde {_fmt_fecha(p.date_from)}. Queda lista para aplicarse a params.json."


def ignorar_propuesta(store: Store, pid: int) -> str:
    p = store.propuesta(pid)
    if p is None:
        return f"No existe la propuesta #{pid}."
    if p.status != "pendiente":
        return f"La propuesta #{pid} ya estaba {NOMBRE_ESTADO[p.status]}."
    store.actualizar_propuesta(pid, "ignorada")
    store.registrar("propuesta_ignorada", propuesta=pid, clave=p.param_key)
    return f"❌ Propuesta #{pid} ignorada."


_FECHA_ISO = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_FECHA_PE = re.compile(r"^(\d{1,2})/(\d{1,2})/(\d{4})$")


def parsear_correccion(texto: str, unit: str | None) -> tuple[str | None, str | None]:
    """'1300' · '1,300.00 01/01/2027' · '1.37%' · '2027-01-01' → (valor, fecha ISO); None = sin cambio."""
    valor = fecha = None
    for token in texto.replace("S/", " ").split():
        if _FECHA_ISO.match(token) or _FECHA_PE.match(token):
            if m := _FECHA_PE.match(token):
                token = f"{m[3]}-{int(m[2]):02d}-{int(m[1]):02d}"
            try:
                fecha = date.fromisoformat(token).isoformat()
            except ValueError:
                raise ValueError(f"La fecha {token} no existe.") from None
            continue
        pct = token.endswith("%")
        try:
            d = Decimal(token.rstrip("%").replace(",", ""))
        except InvalidOperation:
            raise ValueError(f"No entiendo «{token}»: envía un número y/o una fecha.") from None
        if d <= 0:
            raise ValueError("El valor debe ser mayor que cero.")
        if pct:
            d = d / 100
        if unit == "PEN":
            d = d.quantize(Decimal("0.01"))
        valor = str(d)
    if valor is None and fecha is None:
        raise ValueError("Envía el valor, la fecha o ambos. Ej.: 1300.00 01/01/2027")
    return valor, fecha


def corregir_propuesta(store: Store, pid: int, texto: str) -> str:
    """Cambia valor y/o fecha; la propuesta sigue pendiente para confirmarla con los botones."""
    p = store.propuesta(pid)
    if p is None or p.status != "pendiente":
        raise ValueError(f"La propuesta #{pid} ya no está pendiente.")
    valor, fecha = parsear_correccion(texto, parametros.unidad(p.country, p.param_key))
    store.actualizar_propuesta(pid, "pendiente", value=valor, date_from=fecha)
    store.registrar("propuesta_corregida", propuesta=pid, valor=valor, desde=fecha)
    return f"✏️ Propuesta #{pid} corregida. Revísala y confírmala:"


# --- Borradores -----------------------------------------------------------------------------------


def aprobar_borrador(store: Store, bid: int) -> str:
    b = store.borrador(bid)
    if b is None:
        return f"No existe el borrador #{bid}."
    if b.status != "pendiente":
        return f"El borrador #{bid} ya estaba {b.status}."
    store.actualizar_borrador(bid, "aprobado")
    store.registrar("borrador_aprobado", borrador=bid)
    return f"✅ Borrador #{bid} aprobado: queda listo para publicarse."


def descartar_borrador(store: Store, bid: int) -> str:
    b = store.borrador(bid)
    if b is None:
        return f"No existe el borrador #{bid}."
    if b.status != "pendiente":
        return f"El borrador #{bid} ya estaba {b.status}."
    store.actualizar_borrador(bid, "descartado")
    store.registrar("borrador_descartado", borrador=bid)
    return f"❌ Borrador #{bid} descartado."


# --- Comandos de consulta ---------------------------------------------------------------------------


def _linea_param(country: str, clave: str, dia: date) -> str | None:
    e = parametros.vigente(country, clave, dia)
    if e is None:
        return None
    desc = parametros.cargar(country)[clave].get("description", clave).split(" (")[0].split(".")[0]
    return f"• {escape(desc)}: <b>{escape(parametros.formatear(e['value'], parametros.unidad(country, clave)))}</b>"


def texto_deploy(deploy: dict[str, Any] | None, tz: str) -> str:
    if deploy is None:
        return "🚀 Último deploy: sin datos"
    if deploy["estado"] != "completed":
        icono, estado = "⏳", "en curso"
    elif deploy["conclusion"] == "success":
        icono, estado = "✅", "publicado"
    else:
        icono, estado = "❌", f"falló ({deploy['conclusion']})"
    local = datetime.fromisoformat(deploy["fecha"].replace("Z", "+00:00")).astimezone(ZoneInfo(tz))
    return f'🚀 Último deploy: {icono} {estado} · {local:%d/%m/%Y %H:%M} · <a href="{escape(deploy["url"])}">{deploy["commit"]}</a>'


def texto_estado(site: Site, store: Store, deploy: dict[str, Any] | None, hoy: date, *, error_deploy: str | None = None) -> str:
    lineas = [f"<b>{escape(site.domain)}</b>"]
    lineas.append(f"🚀 Último deploy: no disponible ({escape(error_deploy)})" if error_deploy else texto_deploy(deploy, site.timezone))
    lineas.append("")
    lineas += [linea for clave in ("rmv", "uit") if (linea := _linea_param(site.country, clave, hoy))]
    lineas.append("")
    propuestas, borradores = len(store.propuestas("pendiente")), len(store.borradores("pendiente"))
    confirmadas = len(store.propuestas("confirmada"))
    lineas.append(f"📌 Propuestas pendientes: {propuestas}" + (f" · confirmadas sin aplicar: {confirmadas}" if confirmadas else ""))
    lineas.append(f"📝 Borradores pendientes: {borradores}")
    if cola := store.extracciones_pendientes():
        lineas.append(f"🔁 Extracciones por reintentar: {len(cola)}")
    ultima = store.ajuste("revision_ok")
    pausa = " · ⏸ en pausa" if store.ajuste("pausa") == "1" else ""
    lineas.append(f"🔎 Última revisión diaria: {_fmt_fecha(ultima) if ultima else 'aún no'}{pausa}")
    if propuestas or borradores:
        lineas.append("\nUsa /pendientes para revisarlos.")
    return "\n".join(lineas)


def texto_parametros(site: Site, hoy: date) -> str:
    params = parametros.cargar(site.country)
    lineas = [f"<b>Parámetros vigentes al {hoy:%d/%m/%Y}</b>", ""]
    for clave, p in params.items():
        if not parametros.es_escalar(p.get("unit")):
            continue
        e = parametros.vigente(site.country, clave, hoy)
        if e is None:
            continue
        desc = p.get("description", clave).split(" (")[0].split(".")[0]
        valor = parametros.formatear(e["value"], p.get("unit"))
        lineas.append(f"• {escape(desc)}: <b>{escape(valor)}</b>\n  <i>{escape(e.get('source', ''))}</i>")
    lineas.append(f"\nTablas (AFP, renta de quinta, regímenes…): https://{site.domain}/parametros-vigentes/")
    return "\n".join(lineas)


def _temporadas(country: str) -> list[dict[str, Any]]:
    path = config_dir() / "countries" / country / "temporadas.yaml"
    if not path.exists():
        return []
    return sorted(yaml.safe_load(path.read_text(encoding="utf-8"))["temporadas"], key=lambda t: t["preparar_desde"])


def _fecha_temporada(t: dict[str, Any], anio: int) -> date:
    m, d = t["preparar_desde"].split("-")
    return date(anio, int(m), int(d))


def texto_temporada(country: str, hoy: date) -> str:
    temporadas = _temporadas(country)
    if not temporadas:
        return "No hay temporadas configuradas para este país."
    # En curso: la última cuya preparación ya empezó (puede ser la del año anterior); próxima: la siguiente.
    iniciadas = [t for t in temporadas if _fecha_temporada(t, hoy.year) <= hoy]
    actual = iniciadas[-1] if iniciadas else temporadas[-1]
    i = temporadas.index(actual)
    proxima = temporadas[(i + 1) % len(temporadas)]
    inicio_prox = _fecha_temporada(proxima, hoy.year)
    if inicio_prox <= hoy:
        inicio_prox = _fecha_temporada(proxima, hoy.year + 1)
    faltan = (inicio_prox - hoy).days

    def bloque(t: dict[str, Any]) -> str:
        return "\n".join(f"  ☐ {escape(a)}" for a in t["acciones"])

    m, d = actual["preparar_desde"].split("-")
    return (
        f"🗓 <b>En curso: {escape(actual['nombre'])}</b> (desde el {int(d)} de {MESES[int(m) - 1]})\n{bloque(actual)}\n\n"
        f"⏭ <b>Próxima: {escape(proxima['nombre'])}</b> — empieza en {faltan} {'día' if faltan == 1 else 'días'} ({inicio_prox:%d/%m/%Y})\n{bloque(proxima)}"
    )
