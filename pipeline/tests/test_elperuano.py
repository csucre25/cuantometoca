from datetime import date
from pathlib import Path

import httpx
import pytest
import respx

from pipeline.store import Store
from pipeline.watchers import config_watchers, elperuano, normalizar

FIX = Path(__file__).parent / "fixtures" / "elperuano"
REAL = (FIX / "normas-2026-10-15.html").read_text(encoding="utf-8")
SINTETICO = (FIX / "normas-sinteticas.html").read_text(encoding="utf-8")


@pytest.fixture
def store(tmp_path):
    return Store.del_site("pe", data_dir=tmp_path)


def test_parsea_el_html_real_del_portal():
    normas = elperuano.parsear(REAL)
    assert len(normas) == 6
    n = normas[0]
    assert n.titulo.startswith("RESOLUCIÓN MINISTERIAL N° 01263-2026-DE")
    assert n.sector == "DEFENSA" and n.fecha == "2026-10-15" and n.extraordinaria
    assert n.url.endswith("/2565029-1") and n.id == "2565029-1" and n.pdf.endswith("/pdf")
    assert "Ascienden" in n.sumilla


def test_detecta_normas_relevantes_e_ignora_el_resto(store):
    alertas = elperuano.revisar("pe", date(2027, 3, 2), store, html=SINTETICO + REAL)
    assert [a.norma.titulo for a in alertas] == ["DECRETO SUPREMO N° 020-2027-TR", "DECRETO SUPREMO N° 300-2027-EF"]
    assert alertas[0].reglas == ["rmv"] and alertas[0].params == ["rmv"]
    assert alertas[1].reglas == ["uit"]


def test_no_repite_avisos(store):
    assert len(elperuano.revisar("pe", date(2027, 3, 2), store, html=SINTETICO)) == 2
    assert elperuano.revisar("pe", date(2027, 3, 2), store, html=SINTETICO) == []


def test_terminos_por_palabra_completa_y_sin_tildes():
    reglas = config_watchers("pe")["elperuano"]["reglas"]
    base = elperuano.Norma("1", "LEY N° 1", "", "X", "2027-01-01", "u", None, False)
    con = lambda t: elperuano.coincidencias(base.__class__(**{**base.__dict__, "sumilla": t}), reglas)  # noqa: E731
    assert con("Modifican la Compensación por Tiempo de Servicios").reglas == ["cts"]
    assert con("Disposiciones sobre la CTS").reglas == ["cts"]
    assert con("Normas sobre productos agrícolas") is None  # "cts" no debe saltar dentro de otra palabra
    assert normalizar("REMUNERACIÓN  Mínima") == "remuneracion minima"


def test_mensaje_de_aviso(store):
    alerta = elperuano.revisar("pe", date(2027, 3, 2), store, html=SINTETICO)[1]
    texto = elperuano.mensaje(alerta)
    assert "DECRETO SUPREMO N° 300-2027-EF" in texto and "Edición extraordinaria" in texto
    assert 'href="https://busquedas.elperuano.pe/dispositivo/NL/9999902-1"' in texto


@respx.mock
def test_descarga_con_el_mismo_post_del_portal():
    ruta = respx.post("https://diariooficial.elperuano.pe/Normas/Filtro").mock(return_value=httpx.Response(200, text=REAL))
    html = elperuano.descargar(date(2026, 10, 15), "https://diariooficial.elperuano.pe/Normas/Filtro")
    assert html == REAL
    req = ruta.calls.last.request
    assert req.url.params["dateparam"] == "10/15/2026 00:00:00"
    assert b"cddesde=15%2F10%2F2026" in req.content
