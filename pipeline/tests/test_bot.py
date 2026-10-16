import asyncio
import json
from datetime import date
from types import SimpleNamespace

import httpx
import pytest
import respx

from pipeline import notificar
from pipeline.bot import acciones, tarjetas
from pipeline.bot.app import SoloAdmin
from pipeline.config import cargar_site
from pipeline.store import Store


@pytest.fixture
def store(tmp_path):
    return Store.del_site("pe", data_dir=tmp_path)


@pytest.fixture
def site(monkeypatch):
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "TOKEN")
    monkeypatch.setenv("TELEGRAM_ADMIN_CHAT_ID", "42")
    return cargar_site("pe")


def test_confirmar_e_ignorar_son_idempotentes(store):
    pid = store.proponer_parametro("pe", "rmv", "1300.00", "2027-01-01", "DS 001-2027-TR", "https://x")
    assert "confirmada" in acciones.confirmar_propuesta(store, pid)
    assert "S/ 5,600.00" in acciones.confirmar_propuesta(store, store.proponer_parametro("pe", "uit", "5600.00", "2027-01-01", "DS"))
    assert acciones.confirmar_propuesta(store, pid) == f"La propuesta #{pid} ya estaba confirmada."
    assert acciones.ignorar_propuesta(store, pid) == f"La propuesta #{pid} ya estaba confirmada."
    assert store.propuesta(pid).status == "confirmada"
    assert acciones.ignorar_propuesta(store, 999) == "No existe la propuesta #999."
    assert store.eventos("propuesta_confirmada")[0]["clave"] == "uit"


@pytest.mark.parametrize(
    ("texto", "unit", "esperado"),
    [
        ("1300", "PEN", ("1300.00", None)),
        ("S/ 1,300.5 01/01/2027", "PEN", ("1300.50", "2027-01-01")),
        ("1.37%", "ratio", ("0.0137", None)),
        ("0.0137", "ratio", ("0.0137", None)),
        ("2027-03-01", "PEN", (None, "2027-03-01")),
        ("1/3/2027", None, (None, "2027-03-01")),
    ],
)
def test_parsear_correccion(texto, unit, esperado):
    assert acciones.parsear_correccion(texto, unit) == esperado


@pytest.mark.parametrize(("texto", "mensaje"), [("", "Envía el valor"), ("hola", "No entiendo"), ("31/02/2027", "no existe"), ("-5", "mayor que cero"), ("0", "mayor que cero")])
def test_parsear_correccion_rechaza(texto, mensaje):
    with pytest.raises(ValueError, match=mensaje):
        acciones.parsear_correccion(texto, "PEN")


def test_corregir_deja_la_propuesta_pendiente(store):
    pid = store.proponer_parametro("pe", "rmv", "1300.00", "2027-01-01", "DS")
    acciones.corregir_propuesta(store, pid, "1,310 01/02/2027")
    p = store.propuesta(pid)
    assert (p.value, p.date_from, p.status) == ("1310.00", "2027-02-01", "pendiente")
    acciones.ignorar_propuesta(store, pid)
    with pytest.raises(ValueError, match="ya no está pendiente"):
        acciones.corregir_propuesta(store, pid, "1320")


def test_tarjetas_de_propuesta(store):
    p = store.propuesta(store.proponer_parametro("pe", "afp_prima_seguro", "0.0140", "2027-01-01", "SBS <tabla>", "https://sbs?a=1&b=2"))
    texto = tarjetas.texto_propuesta(p)
    assert "<b>1.4%</b>" in texto and "01/01/2027" in texto and "SBS &lt;tabla&gt;" in texto and "a=1&amp;b=2" in texto
    assert [b["callback_data"] for b in tarjetas.botones_propuesta(p)["inline_keyboard"][0]] == [f"p:c:{p.id}", f"p:e:{p.id}", f"p:i:{p.id}"]
    # Las tablas no se corrigen por chat.
    t = store.propuesta(store.proponer_parametro("pe", "afp_comisiones", {"integra": {"flujo": "0.0155"}}, "2027-01-01", "SBS"))
    assert [b["text"] for b in tarjetas.botones_propuesta(t)["inline_keyboard"][0]] == ["✅ Confirmar", "❌ Ignorar"]
    assert "integra: flujo 0.0155" in tarjetas.texto_propuesta(t)


def test_borradores(store):
    bid = store.crear_borrador("guia", "Gratificación <julio>", "palabra " * 200)
    b = store.borrador(bid)
    assert tarjetas.texto_borrador(b).endswith("…") and "&lt;julio&gt;" in tarjetas.texto_borrador(b)
    assert "aprobado" in acciones.aprobar_borrador(store, bid)
    assert acciones.descartar_borrador(store, bid) == f"El borrador #{bid} ya estaba aprobado."
    assert acciones.aprobar_borrador(store, 999) == "No existe el borrador #999."


def test_estado(site, store):
    store.proponer_parametro("pe", "rmv", "1300.00", "2027-01-01", "DS")
    deploy = {"estado": "completed", "conclusion": "success", "fecha": "2026-10-16T17:40:00Z", "commit": "39352e7", "url": "https://github.com/x/runs/1"}
    texto = acciones.texto_estado(site, store, deploy, date(2026, 10, 16))
    assert "✅ publicado · 16/10/2026 12:40" in texto  # hora de Lima
    assert "S/ 1,230.00" in texto and "S/ 5,500.00" in texto
    assert "Propuestas pendientes: 1" in texto and "/pendientes" in texto and "aún no" in texto
    store.fijar_ajuste("pausa", "1")
    store.fijar_ajuste("revision_ok", "2026-10-16")
    texto = acciones.texto_estado(site, store, None, date(2026, 10, 16), error_deploy="ConnectError")
    assert "no disponible (ConnectError)" in texto and "16/10/2026 · ⏸ en pausa" in texto
    assert "⏳ en curso" in acciones.texto_deploy({**deploy, "estado": "in_progress"}, "America/Lima")
    assert "❌ falló (failure)" in acciones.texto_deploy({**deploy, "conclusion": "failure"}, "America/Lima")


def test_parametros(site):
    texto = acciones.texto_parametros(site, date(2026, 10, 16))
    assert "Remuneración Mínima Vital: <b>S/ 1,230.00</b>" in texto
    assert "<b>13%</b>" in texto and "<b>7 UIT</b>" in texto and "<b>28/06/2008</b>" in texto
    assert "afp_comisiones" not in texto and "https://cuantometoca.pe/parametros-vigentes/" in texto
    assert len(texto) < 4096  # límite de un mensaje de Telegram


def test_temporada():
    texto = acciones.texto_temporada("pe", date(2026, 10, 16))
    assert "En curso: CTS de noviembre</b> (desde el 15 de octubre)" in texto
    assert "Próxima: Gratificación de diciembre</b> — empieza en 30 días (15/11/2026)" in texto
    # Antes de la primera del año, sigue en curso la última del año anterior.
    texto = acciones.texto_temporada("pe", date(2027, 1, 10))
    assert "En curso: UIT del nuevo año" in texto and "Próxima: Utilidades</b> — empieza en 36 días (15/02/2027)" in texto
    assert "empieza en 1 día " in acciones.texto_temporada("pe", date(2027, 2, 14))


def test_solo_admin():
    mw = SoloAdmin(42)
    llamadas = []

    async def handler(event, data):
        llamadas.append(event)
        return "ok"

    assert asyncio.run(mw(handler, "u1", {"event_chat": SimpleNamespace(id=42)})) == "ok"
    assert asyncio.run(mw(handler, "u2", {"event_chat": SimpleNamespace(id=7)})) is None
    assert asyncio.run(mw(handler, "u3", {})) is None
    assert llamadas == ["u1"]


@respx.mock
def test_tarjetas_pendientes_se_envian_una_vez(site, store):
    ruta = respx.post("https://api.telegram.org/botTOKEN/sendMessage").mock(return_value=httpx.Response(200, json={"ok": True}))
    pid = store.proponer_parametro("pe", "rmv", "1300.00", "2027-01-01", "DS")
    assert notificar.tarjetas_pendientes(site, store) == 1
    assert notificar.tarjetas_pendientes(site, store) == 0
    datos = json.loads(ruta.calls.last.request.content)
    assert datos["chat_id"] == 42 and datos["reply_markup"]["inline_keyboard"][0][0]["callback_data"] == f"p:c:{pid}"
