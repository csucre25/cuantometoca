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


if __name__ == "__main__":
    app()
