"""CLI del pipeline. Los comandos reales (params-check, bot, worker) llegan en la Fase 4."""
import typer

from pipeline.paths import config_dir, repo_dir

app = typer.Typer(no_args_is_help=True, help="Pipeline de calculadoras laborales")


@app.callback()
def main() -> None:
    """Pipeline de calculadoras laborales."""


@app.command()
def rutas() -> None:
    """Muestra las rutas de repo y config que usará el pipeline."""
    typer.echo(f"REPO_DIR={repo_dir()}")
    typer.echo(f"CONFIG_DIR={config_dir()}")


if __name__ == "__main__":
    app()
