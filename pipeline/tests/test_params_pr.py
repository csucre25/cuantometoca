import base64
import json
from datetime import date

import httpx
import pytest
import respx

from pipeline import params_pr, publicacion
from pipeline.config import cargar_site, params_path
from pipeline.store import Store

TEXTO = params_path("pe").read_text(encoding="utf-8")
API = "https://api.github.com/repos/dueno/repo"


def test_agrega_vigencia_y_cierra_la_anterior():
    nuevo = params_pr.agregar_vigencia(TEXTO, "rmv", "1300.00", "2027-01-01", "DS 001-2027-TR", "nota")
    hist = json.loads(nuevo)["params"]["rmv"]["history"]
    assert hist[1]["to"] == "2026-12-31"
    assert hist[2] == {"value": "1300.00", "from": "2027-01-01", "to": None, "source": "DS 001-2027-TR", "nota": "nota", "verified": True}
    # Solo cambia el bloque de rmv: el resto del archivo queda idéntico.
    antes, despues = TEXTO.splitlines(), nuevo.splitlines()
    assert len(despues) == len(antes) + 1
    distintas = [l for l in despues if l not in antes]
    assert len(distintas) == 2 and '"to": "2026-12-31"' in distintas[0] and '"1300.00"' in distintas[1]


def test_parametro_en_una_linea_pasa_a_varias():
    nuevo = params_pr.agregar_vigencia(TEXTO, "onp_tasa", "0.14", "2027-01-01", "Ley X", "n")
    hist = json.loads(nuevo)["params"]["onp_tasa"]["history"]
    assert [(e["value"], e["to"]) for e in hist] == [("0.13", "2026-12-31"), ("0.14", None)]
    assert '      "history": [\n        { "value": "0.13"' in nuevo


def test_tabla_de_comisiones_afp():
    tabla = {"habitat": {"flujo": "0.0147", "mixta_flujo": "0", "mixta_saldo_anual": "0.0125"}, "integra": {"flujo": "0.0150", "mixta_flujo": "0", "mixta_saldo_anual": "0.0078"}}
    nuevo = params_pr.agregar_vigencia(TEXTO, "afp_comisiones", tabla, "2026-12-01", "SBS", "n")
    hist = json.loads(nuevo)["params"]["afp_comisiones"]["history"]
    assert hist[0]["to"] == "2026-11-30" and hist[1]["value"] == tabla


@pytest.mark.parametrize(
    ("clave", "valor", "desde", "mensaje"),
    [
        ("rmv", "1300.00", "2026-10-01", "debe empezar después"),
        ("rmv", "1300.00", "2026-09-01", "debe empezar después"),
        ("rmv", "1230.00", "2027-01-01", "ya vale eso"),
        ("no_existe", "1", "2027-01-01", "No existe"),
    ],
)
def test_rechaza_cambios_invalidos(clave, valor, desde, mensaje):
    with pytest.raises(params_pr.AplicarError, match=mensaje):
        params_pr.agregar_vigencia(TEXTO, clave, valor, desde, "S", "n")


@pytest.fixture
def entorno(monkeypatch, tmp_path):
    monkeypatch.setenv("GITHUB_REPO", "dueno/repo")
    monkeypatch.setenv("GITHUB_TOKEN", "t")
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "TOKEN")
    monkeypatch.setenv("TELEGRAM_ADMIN_CHAT_ID", "42")
    monkeypatch.delenv("AUTO_MERGE_PARAMS", raising=False)
    monkeypatch.delenv("REPO_AUTO_PULL", raising=False)
    store = Store.del_site("pe", data_dir=tmp_path)
    pid = store.proponer_parametro("pe", "rmv", "1300.00", "2027-01-01", "DS 001-2027-TR", "https://norma")
    store.actualizar_propuesta(pid, "confirmada")
    return store, pid, cargar_site("pe")


def _mock_github(n_pr: int = 7, sha: str = "c0ffee"):
    respx.get(f"{API}/git/ref/heads/main").mock(return_value=httpx.Response(200, json={"object": {"sha": "abc"}}))
    respx.get(f"{API}/contents/config/countries/pe/params.json").mock(
        return_value=httpx.Response(200, json={"content": base64.b64encode(TEXTO.encode()).decode(), "sha": "filesha"})
    )
    ramas = respx.post(f"{API}/git/refs").mock(return_value=httpx.Response(201, json={}))
    put = respx.put(f"{API}/contents/config/countries/pe/params.json").mock(return_value=httpx.Response(200, json={"commit": {"sha": sha}}))
    pr = respx.post(f"{API}/pulls").mock(return_value=httpx.Response(201, json={"number": n_pr, "html_url": f"https://github.com/pr/{n_pr}"}))
    return ramas, put, pr


@respx.mock
def test_abrir_pr(entorno):
    store, pid, _ = entorno
    ramas, put, pr = _mock_github()
    res = params_pr.abrir_pr(store, store.propuesta(pid), hoy=date(2026, 12, 20))
    assert res == {"numero": 7, "url": "https://github.com/pr/7", "rama": f"params/rmv-2027-01-01-p{pid}", "sha": "c0ffee"}
    assert json.loads(ramas.calls.last.request.content) == {"ref": f"refs/heads/params/rmv-2027-01-01-p{pid}", "sha": "abc"}
    cuerpo = json.loads(put.calls.last.request.content)
    escrito = json.loads(base64.b64decode(cuerpo["content"]))
    assert escrito["params"]["rmv"]["history"][-1]["nota"] == f"Confirmado por Telegram el 2026-12-20 (propuesta #{pid}); https://norma"
    assert cuerpo["sha"] == "filesha" and cuerpo["branch"] == res["rama"]
    assert json.loads(pr.calls.last.request.content)["base"] == "main"
    assert store.pr(pid).estado == "ci"
    # Solo propuestas confirmadas.
    store.actualizar_propuesta(pid, "pendiente")
    with pytest.raises(params_pr.AplicarError, match="no está confirmada"):
        params_pr.abrir_pr(store, store.propuesta(pid), hoy=date(2026, 12, 20))


@respx.mock
def test_ci_verde_avisa_con_boton_y_publicar_fusiona(entorno):
    store, pid, site = entorno
    store.registrar_pr(pid, 7, "params/rmv", "c0ffee", "https://github.com/pr/7")
    runs = respx.get(f"{API}/actions/workflows/ci.yml/runs").mock(
        return_value=httpx.Response(200, json={"workflow_runs": [{"status": "in_progress", "conclusion": None}]})
    )
    tg = respx.post("https://api.telegram.org/botTOKEN/sendMessage").mock(return_value=httpx.Response(200, json={"ok": True}))
    assert publicacion.revisar_prs(site, store) == 0 and not tg.called
    assert publicacion.publicar(store, pid, hoy=date(2026, 12, 20)) == "El PR #7 aún no está listo (estado: ci)."

    runs.mock(return_value=httpx.Response(200, json={"workflow_runs": [{"status": "completed", "conclusion": "success"}] * 2}))
    assert publicacion.revisar_prs(site, store) == 1
    datos = json.loads(tg.calls.last.request.content)
    assert "CI en verde" in datos["text"] and datos["reply_markup"]["inline_keyboard"][0][0]["callback_data"] == f"m:{pid}"
    assert publicacion.revisar_prs(site, store) == 0  # no repite el aviso

    merge = respx.put(f"{API}/pulls/7/merge").mock(return_value=httpx.Response(200, json={"merged": True}))
    respx.delete(f"{API}/git/refs/heads/params/rmv").mock(return_value=httpx.Response(204))
    assert "fusionado en main" in publicacion.publicar(store, pid, hoy=date(2026, 12, 20))
    assert json.loads(merge.calls.last.request.content)["merge_method"] == "squash"
    assert store.pr(pid).estado == "publicado" and store.propuesta(pid).status == "aplicada"
    assert publicacion.publicar(store, pid, hoy=date(2026, 12, 20)) == "El PR #7 ya estaba publicado."
    # Una propuesta aplicada no se vuelve a proponer.
    assert store.proponer_parametro("pe", "rmv", "1300.00", "2027-01-01", "DS 001-2027-TR") == pid


@respx.mock
def test_ci_rojo_y_descartar(entorno):
    store, pid, site = entorno
    store.registrar_pr(pid, 7, "params/rmv", "c0ffee", "https://github.com/pr/7")
    respx.get(f"{API}/actions/workflows/ci.yml/runs").mock(
        return_value=httpx.Response(200, json={"workflow_runs": [{"status": "completed", "conclusion": "success"}, {"status": "completed", "conclusion": "failure"}]})
    )
    tg = respx.post("https://api.telegram.org/botTOKEN/sendMessage").mock(return_value=httpx.Response(200, json={"ok": True}))
    publicacion.revisar_prs(site, store)
    assert "El CI falló" in json.loads(tg.calls.last.request.content)["text"] and store.pr(pid).estado == "falla"
    cerrar = respx.patch(f"{API}/pulls/7").mock(return_value=httpx.Response(200, json={}))
    respx.delete(f"{API}/git/refs/heads/params/rmv").mock(return_value=httpx.Response(204))
    assert "cerrado" in publicacion.descartar(store, pid)
    assert json.loads(cerrar.calls.last.request.content) == {"state": "closed"}
    assert store.propuesta(pid).status == "ignorada"


@respx.mock
def test_auto_merge(entorno, monkeypatch):
    store, pid, site = entorno
    monkeypatch.setenv("AUTO_MERGE_PARAMS", "true")
    store.registrar_pr(pid, 7, "params/rmv", "c0ffee", "https://github.com/pr/7")
    respx.get(f"{API}/actions/workflows/ci.yml/runs").mock(return_value=httpx.Response(200, json={"workflow_runs": [{"status": "completed", "conclusion": "success"}]}))
    respx.post("https://api.telegram.org/botTOKEN/sendMessage").mock(return_value=httpx.Response(200, json={"ok": True}))
    respx.put(f"{API}/pulls/7/merge").mock(return_value=httpx.Response(200, json={"merged": True}))
    respx.delete(f"{API}/git/refs/heads/params/rmv").mock(return_value=httpx.Response(204))
    publicacion.revisar_prs(site, store)
    assert store.pr(pid).estado == "publicado"


@respx.mock
def test_conflicto_rehace_el_pr(entorno):
    store, pid, _ = entorno
    store.registrar_pr(pid, 7, "params/rmv-2027-01-01-p1", "c0ffee", "https://github.com/pr/7")
    store.actualizar_pr(pid, "listo")
    respx.put(f"{API}/pulls/7/merge").mock(return_value=httpx.Response(405, json={"message": "not mergeable"}))
    respx.patch(f"{API}/pulls/7").mock(return_value=httpx.Response(200, json={}))
    respx.delete(f"{API}/git/refs/heads/params/rmv-2027-01-01-p1").mock(return_value=httpx.Response(204))
    ramas, _, _ = _mock_github(n_pr=8, sha="beef")
    texto = publicacion.publicar(store, pid, hoy=date(2026, 12, 20))
    assert "PR #8" in texto and "ya no se podía fusionar" in texto
    assert json.loads(ramas.calls.last.request.content)["ref"].endswith(f"-p{pid}-r2")
    pr = store.pr(pid)
    assert (pr.numero, pr.estado, pr.sha, pr.intentos) == (8, "ci", "beef", 2)
