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

    from pipeline import notificar, revision
    from pipeline.watchers import afp, elperuano

    sites = [s for s in cargar_sites(solo_habilitados=True) if s.country == country]
    if not sites:
        raise typer.BadParameter(f"No hay sites habilitados para el país '{country}'")
    fecha = date.fromisoformat(dia) if dia else datetime.now(ZoneInfo(sites[0].timezone)).date()

    for site in sites:
        store = Store.del_site(site.site_id)

        # Extracciones que fallaron en corridas anteriores.
        for titulo, detalle in revision.reintentar_pendientes(country, store):
            typer.echo(f"[{site.site_id}] Reintento de extracción: {titulo}\n    {detalle}")
            if notify:
                notificar.enviar(site, f"🔁 <b>Extracción completada</b>: {titulo}\n{detalle}")

        alertas = elperuano.revisar(country, fecha, store)
        store.registrar("params_check", fuente="elperuano", dia=fecha.isoformat(), alertas=len(alertas))
        typer.echo(f"[{site.site_id}] El Peruano {fecha.isoformat()}: {len(alertas)} norma(s) nueva(s) relevante(s)")
        for a in alertas:
            typer.echo(f"  - {a.norma.titulo}: {a.norma.sumilla[:100]} [{', '.join(a.reglas)}]")
            _, detalle = revision.proponer_desde_norma(
                country, store, norma_id=a.norma.id, titulo=a.norma.titulo, url=a.norma.url, fecha=a.norma.fecha, params=a.params
            )
            typer.echo(f"    {detalle}")
            if notify:
                notificar.enviar(site, elperuano.mensaje(a) + "\n\n" + detalle)
                store.registrar("aviso_enviado", fuente="elperuano", norma=a.norma.id)

        cambios = afp.revisar(country, fecha, store)
        store.registrar("params_check", fuente="afp", dia=fecha.isoformat(), cambios=len(cambios))
        typer.echo(f"[{site.site_id}] AFP (comisiones, prima, tope): {len(cambios)} cambio(s)")
        for c in cambios:
            typer.echo(f"  - #{c.propuesta_id} {c.param_key}: {c.anterior} -> {c.nuevo} desde {c.desde}")
            if notify:
                notificar.enviar(site, afp.mensaje(c))
                store.registrar("aviso_enviado", fuente="afp", propuesta=c.propuesta_id)


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
