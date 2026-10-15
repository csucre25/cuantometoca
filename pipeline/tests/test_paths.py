from pathlib import Path

from pipeline.paths import config_dir, repo_dir


def test_por_defecto_apunta_a_la_raiz_del_repo(monkeypatch):
    monkeypatch.delenv("REPO_DIR", raising=False)
    monkeypatch.delenv("CONFIG_DIR", raising=False)
    assert (repo_dir() / "CLAUDE.md").is_file()
    assert (config_dir() / "sites" / "pe.yaml").is_file()


def test_respeta_variables_de_entorno(monkeypatch, tmp_path: Path):
    monkeypatch.setenv("REPO_DIR", str(tmp_path / "repo"))
    monkeypatch.delenv("CONFIG_DIR", raising=False)
    assert config_dir() == tmp_path / "repo" / "config"

    monkeypatch.setenv("CONFIG_DIR", str(tmp_path / "cfg"))
    assert config_dir() == tmp_path / "cfg"
