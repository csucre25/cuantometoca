"""CLI del pipeline (Typer). Uso: uv run python -m pipeline.cli --help"""

import typer

from pipeline.config import ConfigError, cargar_site, cargar_sites
from pipeline.paths import config_dir, repo_dir
from pipeline.store import Store

app = typer.Typer(no_args_is_help=True, help="Pipeline de calculadoras laborales")


@app.callback()
def main() -> None:
    """Pipeline de calculadoras laborales."""


@app.command()
def rutas() -> None:
    """Muestra las rutas de repo y config que usará el pipeline."""
    typer.echo(f"REPO_DIR={repo_dir()}")
    typer.echo(f"CONFIG_DIR={config_dir()}")


@app.command()
def sitios(habilitados: bool = typer.Option(False, help="Solo los sites con enabled: true")) -> None:
    """Lista los sites configurados."""
    for s in cargar_sites(solo_habilitados=habilitados):
        estado = "habilitado" if s.enabled else "deshabilitado"
        typer.echo(f"{s.site_id}\t{s.country}\t{s.domain}\t{estado}")


@app.command()
def estado(site: str = typer.Option(..., help="site_id, ej. pe")) -> None:
    """Pendientes de aprobación y últimos eventos del site."""
    try:
        cargar_site(site)
    except ConfigError as e:
        raise typer.BadParameter(str(e)) from e
    store = Store.del_site(site)
    pendientes = store.propuestas("pendiente")
    borradores = store.borradores("pendiente")
    typer.echo(f"Propuestas de parámetros pendientes: {len(pendientes)}")
    for p in pendientes:
        typer.echo(f"  #{p.id} {p.param_key} = {p.value} desde {p.date_from} ({p.source})")
    typer.echo(f"Borradores pendientes: {len(borradores)}")
    for b in borradores:
        typer.echo(f"  #{b.id} [{b.kind}] {b.title}")


@app.command("params-check")
def params_check(
    country: str = typer.Option(..., help="País, ej. pe"),
    dia: str = typer.Option("", help="Fecha YYYY-MM-DD (por defecto, hoy en la zona horaria del site)"),
    notify: bool = typer.Option(False, help="Enviar los avisos por Telegram a los sites del país"),
) -> None:
    """Revisa El Peruano (hoy y ayer) y las comisiones de AFP; avisa lo que podría cambiar un parámetro."""
    from datetime import date, datetime
    from zoneinfo import ZoneInfo

    from pipeline import tareas

    sites = [s for s in cargar_sites(solo_habilitados=True) if s.country == country]
    if not sites:
        raise typer.BadParameter(f"No hay sites habilitados para el país '{country}'")
    fecha = date.fromisoformat(dia) if dia else datetime.now(ZoneInfo(sites[0].timezone)).date()
    for site in sites:
        tareas.revisar_site(site, fecha, notify=notify, eco=typer.echo)


@app.command()
def bot(site: str = typer.Option(..., help="site_id, ej. pe")) -> None:
    """Bot de Telegram del site (polling). Solo responde al chat administrador."""
    from pipeline.bot import app as bot_app

    try:
        s = cargar_site(site)
        s.telegram_token, s.telegram_admin_chat_id  # falla aquí si faltan los secretos
    except ConfigError as e:
        raise typer.BadParameter(str(e)) from e
    bot_app.ejecutar(s)


@app.command()
def worker(intervalo: int = typer.Option(60, help="Segundos entre comprobaciones")) -> None:
    """Revisión diaria de los sites habilitados a la hora de watchers.yaml (para docker-compose)."""
    from pipeline import worker as w

    w.ejecutar(intervalo)


@app.command()
def extraer(
    url: str = typer.Option(..., help="URL de la norma en busquedas.elperuano.pe"),
    country: str = typer.Option("pe"),
    publicacion: str = typer.Option(..., help="Fecha de publicación YYYY-MM-DD"),
    params: str = typer.Option("", help="Claves posibles separadas por coma (vacío = todas)"),
) -> None:
    """Prueba la extracción con LLM sobre una norma, sin crear propuestas."""
    from pipeline.extraccion import extraer_cambios
    from pipeline.watchers import elperuano

    aceptados, descartes = extraer_cambios(country, elperuano.texto_norma(url), publicacion, [p for p in params.split(",") if p])
    for c in aceptados:
        typer.echo(f"ACEPTADO {c.clave} = {c.valor} desde {c.vigente_desde} | cita: {c.cita[:160]}")
    for d in descartes:
        typer.echo(f"DESCARTADO {d}")
    if not aceptados and not descartes:
        typer.echo("Sin cambios extraídos.")


if __name__ == "__main__":
    app()
