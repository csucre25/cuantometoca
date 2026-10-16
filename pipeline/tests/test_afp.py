from datetime import date
from pathlib import Path

import pytest

from pipeline.store import Store
from pipeline.watchers import afp, elperuano
from pipeline.watchers import config_watchers

HTML = (Path(__file__).parent / "fixtures" / "afp" / "integra-comisiones-2026-10-16.html").read_text(encoding="utf-8")
DIA = date(2026, 10, 16)


@pytest.fixture
def store(tmp_path):
    return Store.del_site("pe", data_dir=tmp_path)


def test_parsea_las_tablas_de_las_cuatro_afp():
    v = afp.parsear(HTML, "integra")
    assert set(v.comisiones) == {"habitat", "integra", "prima", "profuturo"}
    assert v.comisiones["integra"] == {"flujo": "0.0155", "mixta_flujo": "0", "mixta_saldo_anual": "0.0078"}
    assert v.comisiones["prima"]["flujo"] == "0.016"
    assert (v.prima, v.aporte) == ("0.0137", "0.1")
    assert (v.tope, v.tope_desde) == ("12732.70", "2026-10-01")


def test_sin_cambios_respecto_de_params_no_propone_nada(store):
    assert afp.revisar("pe", DIA, store, html=HTML) == []
    assert store.propuestas() == []


def test_comision_cambiada_crea_una_propuesta_pendiente(store):
    html = HTML.replace(">1.55%<", ">1.50%<")
    cambios = afp.revisar("pe", DIA, store, html=html)
    assert [c.param_key for c in cambios] == ["afp_comisiones"]
    c = cambios[0]
    assert c.nuevo["integra"]["flujo"] == "0.015" and c.anterior["integra"]["flujo"] == "0.0155"
    assert c.desde == "2026-10-01"
    p = store.propuesta(c.propuesta_id)
    assert p.status == "pendiente" and p.source.startswith("SBS")
    assert "propuesta #" in afp.mensaje(c)
    # Al día siguiente no vuelve a avisar del mismo cambio.
    assert afp.revisar("pe", date(2026, 10, 17), store, html=html) == []


def test_nuevo_tope_trimestral_toma_la_fecha_de_vigencia(store):
    html = HTML.replace("12,732.70 (vigente octubre, noviembre y diciembre de 2026)", "12,950.00 (vigente enero, febrero y marzo de 2027)")
    cambios = afp.revisar("pe", date(2027, 1, 3), store, html=html)
    tope = next(c for c in cambios if c.param_key == "afp_remuneracion_maxima_asegurable")
    assert (tope.nuevo, tope.desde) == ("12950.00", "2027-01-01")


def test_formato_cambiado_falla_en_vez_de_proponer_basura(store):
    with pytest.raises(ValueError, match="cambiar de formato"):
        afp.revisar("pe", DIA, store, html="<html><body>sin tablas</body></html>")


def test_regla_de_la_sbs_solo_aplica_a_su_sector():
    reglas = config_watchers("pe")["elperuano"]["reglas"]
    n = lambda sector, sumilla: elperuano.Norma("1", "RESOLUCIÓN SBS N° 1", sumilla, sector, "2027-01-01", "u", None, False)  # noqa: E731
    sbs = elperuano.coincidencias(n("SUPERINTENDENCIA DE BANCA, SEGUROS Y ADMINISTRADORAS PRIVADAS DE FONDOS DE PENSIONES", "Modifican la comisión"), reglas)
    assert sbs is not None and "sbs_afp" in sbs.reglas
    assert elperuano.coincidencias(n("PRODUCE", "Conforman comisión multisectorial"), reglas) is None
