import pytest

from pipeline.config import ConfigError, cargar_site, cargar_sites, params_path


def test_carga_el_site_pe_sin_la_plantilla():
    ids = [s.site_id for s in cargar_sites()]
    assert "pe" in ids
    assert "xx" not in ids  # _template.yaml no es un site
    pe = cargar_site("pe")
    assert pe.country == "pe" and pe.telegram.bot_token_env == "TELEGRAM_BOT_TOKEN_PE"
    assert params_path("pe").is_file()


def test_secreto_prioriza_la_variable_generica(monkeypatch):
    pe = cargar_site("pe")
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN_PE", "local")
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)
    assert pe.telegram_token == "local"
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "ci")
    assert pe.telegram_token == "ci"


def test_secreto_faltante(monkeypatch):
    pe = cargar_site("pe")
    for n in ("TELEGRAM_ADMIN_CHAT_ID", "TELEGRAM_ADMIN_CHAT_ID_PE"):
        monkeypatch.setenv(n, "")
    with pytest.raises(ConfigError, match="TELEGRAM_ADMIN_CHAT_ID_PE"):
        _ = pe.telegram_admin_chat_id
    assert pe.secreto("TELEGRAM_ADMIN_CHAT_ID_PE", requerido=False) is None


def test_site_inexistente():
    with pytest.raises(ConfigError, match="No existe"):
        cargar_site("zz")
