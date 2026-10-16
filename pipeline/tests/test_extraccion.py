import json
from pathlib import Path

import httpx
import pytest
import respx

from pipeline.extraccion import extraer_cambios
from pipeline.llm import client as llm
from pipeline.watchers import elperuano

TEXTO = elperuano.extraer_texto((Path(__file__).parent / "fixtures" / "elperuano" / "ds-015-2026-tr.html").read_text(encoding="utf-8"))
URL = "https://llm.prueba/v1/chat/completions"
CITA = "la Remuneración Mínima Vital pasa a ascender a S/ 1,230.00 (Un Mil Doscientos Treinta y 00/100 Soles), a partir del 1 de octubre de 2026"


@pytest.fixture(autouse=True)
def proveedor(monkeypatch):
    monkeypatch.setenv("LLM_BASE_URL", "https://llm.prueba/v1")
    monkeypatch.setenv("LLM_API_KEY", "clave")
    monkeypatch.setenv("LLM_MODEL", "modelo-prueba")
    monkeypatch.setenv("LLM_MAX_RPM", "100000")
    monkeypatch.delenv("LLM_FALLBACK_BASE_URL", raising=False)
    monkeypatch.delenv("LLM_FALLBACK_MODEL", raising=False)


def respuesta(contenido: dict | str) -> httpx.Response:
    texto = contenido if isinstance(contenido, str) else json.dumps(contenido, ensure_ascii=False)
    return httpx.Response(200, json={"choices": [{"message": {"content": texto}}]})


def test_el_texto_real_contiene_el_valor():
    assert "1,230.00" in TEXTO and "1 de octubre de 2026" in TEXTO


@respx.mock
def test_extrae_la_rmv_del_ds_015_2026_tr():
    respx.post(URL).mock(return_value=respuesta(
        "```json\n" + json.dumps({"cambios": [{"clave": "rmv", "valor": "1230.00", "vigente_desde": "2026-10-01", "cita": CITA}],
                                  "notas": "Segundo tramo a S/ 1,300 en 2027 sin fecha"}, ensure_ascii=False) + "\n```"))
    aceptados, descartes = extraer_cambios("pe", TEXTO, "2026-09-28", ["rmv"])
    assert [(c.clave, c.valor, c.vigente_desde.isoformat()) for c in aceptados] == [("rmv", "1230.00", "2026-10-01")]
    assert descartes == []
    pedido = json.loads(respx.calls.last.request.content)
    assert pedido["model"] == "modelo-prueba" and pedido["temperature"] == 0.0
    assert "rmv" in pedido["messages"][1]["content"]


@respx.mock
def test_descarta_citas_inventadas_y_valores_que_no_estan_en_la_cita():
    respx.post(URL).mock(return_value=respuesta({"cambios": [
        {"clave": "rmv", "valor": "1300.00", "vigente_desde": "2027-01-01", "cita": "la RMV será de S/ 1,300.00 desde enero de 2027"},
        {"clave": "rmv", "valor": "1250.00", "vigente_desde": "2026-10-01", "cita": CITA},
        {"clave": "uit", "valor": "5500", "vigente_desde": "2026-10-01", "cita": CITA},
    ]}))
    aceptados, descartes = extraer_cambios("pe", TEXTO, "2026-09-28", ["rmv"])
    assert aceptados == []
    assert descartes == [
        "rmv: la cita no aparece en la norma",
        "rmv: el valor 1250.00 no aparece en la cita",
        "uit: clave no permitida",
    ]


@respx.mock
def test_reintenta_una_vez_si_el_json_no_valida():
    ruta = respx.post(URL).mock(side_effect=[
        respuesta("No encontré cambios, lo siento"),
        respuesta({"cambios": [], "notas": "sin cambios"}),
    ])
    aceptados, _ = extraer_cambios("pe", TEXTO, "2026-09-28", ["rmv"])
    assert aceptados == [] and ruta.call_count == 2


@respx.mock
def test_usa_el_proveedor_de_respaldo(monkeypatch):
    monkeypatch.setenv("LLM_FALLBACK_BASE_URL", "http://localhost:11434/v1")
    monkeypatch.setenv("LLM_FALLBACK_MODEL", "qwen2.5:7b-instruct")
    respx.post(URL).mock(return_value=httpx.Response(401, json={"error": "clave inválida"}))
    respx.post("http://localhost:11434/v1/chat/completions").mock(return_value=respuesta({"cambios": []}))
    texto, proveedor = llm.completar([{"role": "user", "content": "hola"}])
    assert proveedor.model == "qwen2.5:7b-instruct"


def test_sin_proveedor_configurado(monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "")
    with pytest.raises(llm.LLMError, match="LLM_API_KEY"):
        llm.completar([{"role": "user", "content": "hola"}])
