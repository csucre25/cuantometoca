import pytest

from pipeline.store import Store


@pytest.fixture
def store(tmp_path):
    return Store.del_site("pe", data_dir=tmp_path)


def test_idempotencia_por_hash(store):
    assert store.es_nuevo("elperuano", "DS-015-2026-TR", "texto v1", title="RMV") is True
    assert store.es_nuevo("elperuano", "DS-015-2026-TR", "texto v1") is False
    # Si el contenido cambia, vuelve a considerarse nuevo.
    assert store.es_nuevo("elperuano", "DS-015-2026-TR", "texto v2") is True
    assert store.es_nuevo("sbs", "DS-015-2026-TR", "texto v2") is True  # otra fuente


def test_propuestas_de_parametros(store):
    pid = store.proponer_parametro("pe", "rmv", "1300.00", "2027-03-01", "DS 00X-2027-TR", "https://ejemplo")
    # Una propuesta idéntica no se duplica.
    assert store.proponer_parametro("pe", "rmv", "1300.00", "2027-03-01", "DS 00X-2027-TR") == pid
    p = store.propuesta(pid)
    assert p is not None and p.value == "1300.00" and p.status == "pendiente"

    store.actualizar_propuesta(pid, "confirmada", value="1310.00", date_from="2027-04-01")
    p = store.propuesta(pid)
    assert (p.value, p.date_from, p.status) == ("1310.00", "2027-04-01", "confirmada")
    assert store.propuestas("pendiente") == []
    assert len(store.propuestas()) == 1


def test_valores_tabla(store):
    pid = store.proponer_parametro("pe", "afp_comisiones", {"integra": {"flujo": "0.0155"}}, "2026-11-01", "SBS")
    assert store.propuesta(pid).value == {"integra": {"flujo": "0.0155"}}


def test_borradores_y_eventos(store):
    bid = store.crear_borrador("guia", "Gratificación de julio", "texto")
    assert [b.id for b in store.borradores("pendiente")] == [bid]
    store.actualizar_borrador(bid, "aprobado", body="texto corregido")
    assert store.borradores("aprobado")[0].body == "texto corregido"

    store.registrar("aviso_enviado", fuente="elperuano", items=2)
    store.registrar("deploy", estado="ok")
    assert store.eventos(limite=1)[0]["type"] == "deploy"
    assert store.eventos("aviso_enviado")[0]["items"] == 2


def test_la_base_persiste_entre_instancias(tmp_path):
    Store.del_site("pe", data_dir=tmp_path).es_nuevo("x", "1", "a")
    assert Store.del_site("pe", data_dir=tmp_path).es_nuevo("x", "1", "a") is False
