from datetime import UTC, datetime

import httpx
import pytest
import respx

from pipeline import github, worker
from pipeline.config import cargar_site
from pipeline.store import Store

# 07:15 en Lima = 12:15 UTC
ANTES = datetime(2026, 10, 16, 12, 0, tzinfo=UTC)
DESPUES = datetime(2026, 10, 16, 12, 20, tzinfo=UTC)


@pytest.fixture
def store(tmp_path):
    return Store.del_site("pe", data_dir=tmp_path)


@pytest.fixture
def site(monkeypatch):
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "TOKEN")
    monkeypatch.setenv("TELEGRAM_ADMIN_CHAT_ID", "42")
    return cargar_site("pe")


def test_revisa_una_vez_al_dia_desde_la_hora_configurada(site, store):
    dias = []
    revisar = lambda s, d: dias.append(d)  # noqa: E731
    assert worker.tick(site, store, ANTES, revisar) is None
    assert worker.tick(site, store, DESPUES, revisar) == "ok"
    assert worker.tick(site, store, DESPUES.replace(hour=20), revisar) is None
    assert [d.isoformat() for d in dias] == ["2026-10-16"]
    # 00:30 del 17 en Lima ya es otro día, pero aún no es la hora.
    assert worker.tick(site, store, datetime(2026, 10, 17, 5, 30, tzinfo=UTC), revisar) is None


def test_respeta_la_pausa(site, store):
    store.fijar_ajuste("pausa", "1")
    assert worker.tick(site, store, DESPUES, lambda s, d: None) == "pausado"
    store.fijar_ajuste("pausa", "0")
    assert worker.tick(site, store, DESPUES, lambda s, d: None) == "ok"


@respx.mock
def test_reintenta_y_avisa_al_tercer_fallo(site, store):
    tg = respx.post("https://api.telegram.org/botTOKEN/sendMessage").mock(return_value=httpx.Response(200, json={"ok": True}))

    def falla(s, d):
        raise httpx.ConnectError("sin red")

    assert worker.tick(site, store, DESPUES, falla) == "error"
    assert worker.tick(site, store, DESPUES.replace(minute=40), falla) is None  # espera 30 min
    assert worker.tick(site, store, DESPUES.replace(minute=51), falla) == "error"
    assert not tg.called
    assert worker.tick(site, store, DESPUES.replace(hour=13, minute=22), falla) == "error"
    assert tg.call_count == 1 and "falló 3 veces" in tg.calls.last.request.content.decode()
    assert worker.tick(site, store, DESPUES.replace(hour=20), falla) is None  # hasta mañana


def test_repo_desde_git_config():
    cfg = '[core]\n\tbare = false\n[remote "origin"]\n\turl = https://github.com/csucre25/cuantometoca.git\n\tfetch = +refs/heads/*\n'
    assert github.repo_desde_git_config(cfg) == "csucre25/cuantometoca"
    assert github.repo_desde_git_config('[remote "origin"]\n\turl = git@github.com:dueno/repo\n') == "dueno/repo"
    assert github.repo_desde_git_config('[remote "origin"]\n\turl = https://gitlab.com/a/b.git\n') is None


@respx.mock
def test_ultimo_deploy_y_disparo(monkeypatch):
    monkeypatch.setenv("GITHUB_REPO", "dueno/repo")
    monkeypatch.delenv("GITHUB_TOKEN", raising=False)
    base = "https://api.github.com/repos/dueno/repo/actions/workflows/deploy.yml"
    respx.get(f"{base}/runs").mock(return_value=httpx.Response(200, json={"workflow_runs": [
        {"status": "completed", "conclusion": "success", "created_at": "2026-10-16T17:40:00Z", "head_sha": "39352e7f40f3", "html_url": "https://github.com/r/1"}
    ]}))
    assert github.ultimo_deploy() == {"estado": "completed", "conclusion": "success", "fecha": "2026-10-16T17:40:00Z", "commit": "39352e7", "url": "https://github.com/r/1"}

    with pytest.raises(github.GitHubError, match="GITHUB_TOKEN"):
        github.disparar_deploy("pe")
    monkeypatch.setenv("GITHUB_TOKEN", "t")
    ruta = respx.post(f"{base}/dispatches").mock(return_value=httpx.Response(204))
    github.disparar_deploy("pe")
    req = ruta.calls.last.request
    assert req.headers["Authorization"] == "Bearer t" and b'"site":"pe"' in req.content.replace(b" ", b"")
    respx.post(f"{base}/dispatches").mock(return_value=httpx.Response(403, text="Resource not accessible"))
    with pytest.raises(github.GitHubError, match="403"):
        github.disparar_deploy("pe")
