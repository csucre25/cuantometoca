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
    """Revisa El Peruano y las comisiones de AFP; avisa lo que podría cambiar un parámetro."""
    from datetime import date, datetime
    from zoneinfo import ZoneInfo

    from pipeline import notificar
    from pipeline.watchers import afp, elperuano

    sites = [s for s in cargar_sites(solo_habilitados=True) if s.country == country]
    if not sites:
        raise typer.BadParameter(f"No hay sites habilitados para el país '{country}'")
    fecha = date.fromisoformat(dia) if dia else datetime.now(ZoneInfo(sites[0].timezone)).date()

    for site in sites:
        store = Store.del_site(site.site_id)
        alertas = elperuano.revisar(country, fecha, store)
        store.registrar("params_check", fuente="elperuano", dia=fecha.isoformat(), alertas=len(alertas))
        typer.echo(f"[{site.site_id}] El Peruano {fecha.isoformat()}: {len(alertas)} norma(s) nueva(s) relevante(s)")
        for a in alertas:
            typer.echo(f"  - {a.norma.titulo}: {a.norma.sumilla[:100]} [{', '.join(a.reglas)}]")
            if notify:
                notificar.enviar(site, elperuano.mensaje(a))
                store.registrar("aviso_enviado", fuente="elperuano", norma=a.norma.id)

        cambios = afp.revisar(country, fecha, store)
        store.registrar("params_check", fuente="afp", dia=fecha.isoformat(), cambios=len(cambios))
        typer.echo(f"[{site.site_id}] AFP (comisiones, prima, tope): {len(cambios)} cambio(s)")
        for c in cambios:
            typer.echo(f"  - #{c.propuesta_id} {c.param_key}: {c.anterior} -> {c.nuevo} desde {c.desde}")
            if notify:
                notificar.enviar(site, afp.mensaje(c))
                store.registrar("aviso_enviado", fuente="afp", propuesta=c.propuesta_id)


if __name__ == "__main__":
    app()
