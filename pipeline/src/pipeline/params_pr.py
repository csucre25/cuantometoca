"""De una propuesta confirmada a un PR que agrega la vigencia en params.json (docs/03 §1, paso 3).

Nunca sobrescribe: cierra la vigencia abierta el día anterior a la nueva y agrega la entrada nueva
al final del `history` (CLAUDE.md, regla 1). La edición es textual para no reformatear el archivo y
se verifica leyendo el resultado como JSON: debe ser idéntico al original salvo el cambio pedido.
El PR se crea con la API de GitHub (no toca la copia local del repo); el CI corre los casos dorados.
"""

from __future__ import annotations

import json
import re
from datetime import date, timedelta
from typing import Any

from pipeline import github
from pipeline.store import Propuesta, Store


class AplicarError(ValueError):
    pass


def ruta_params(country: str) -> str:
    return f"config/countries/{country}/params.json"


def _cierre(texto: str, inicio: int) -> int:
    """Índice del corchete o llave que cierra el que abre en `inicio` (respeta strings)."""
    pila, en_str, escape = 0, False, False
    for i in range(inicio, len(texto)):
        c = texto[i]
        if en_str:
            if escape:
                escape = False
            elif c == "\\":
                escape = True
            elif c == '"':
                en_str = False
        elif c == '"':
            en_str = True
        elif c in "[{":
            pila += 1
        elif c in "]}":
            pila -= 1
            if pila == 0:
                return i
    raise AplicarError("params.json mal formado")


def _entradas(texto: str, ini: int, fin: int) -> list[str]:
    """Textos de los objetos de primer nivel dentro del array texto[ini:fin]."""
    entradas, i = [], ini + 1
    while i < fin:
        if texto[i] == "{":
            j = _cierre(texto, i)
            entradas.append(texto[i : j + 1])
            i = j + 1
        else:
            i += 1
    return entradas


def _fmt(v: Any) -> str:
    if isinstance(v, dict):
        return "{ " + ", ".join(f"{json.dumps(k, ensure_ascii=False)}: {_fmt(x)}" for k, x in v.items()) + " }"
    return json.dumps(v, ensure_ascii=False)


def agregar_vigencia(texto: str, clave: str, valor: Any, desde: str, source: str, nota: str) -> str:
    """Texto de params.json con la nueva vigencia de `clave` desde `desde` (ISO)."""
    original = json.loads(texto)
    param = original["params"].get(clave)
    if param is None:
        raise AplicarError(f"No existe el parámetro {clave}")
    historia = param["history"]
    abiertas = [e for e in historia if e["to"] is None]
    if any(e["from"] >= desde for e in historia):
        ultimo = max(e["from"] for e in historia)
        raise AplicarError(f"La nueva vigencia ({desde}) debe empezar después de la última registrada ({ultimo})")
    if abiertas and json.dumps(abiertas[-1]["value"], sort_keys=True) == json.dumps(valor, sort_keys=True):
        raise AplicarError(f"{clave} ya vale eso desde el {abiertas[-1]['from']}")

    m = re.search(rf'^(\s*)"{re.escape(clave)}": \{{', texto, re.M)
    if not m:
        raise AplicarError(f"No se encontró el bloque de {clave} en params.json")
    h = re.compile(r'^(\s*)"history":\s*\[', re.M).search(texto, m.end())
    if not h:
        raise AplicarError(f"{clave} no tiene history")
    ini = h.end() - 1
    fin = _cierre(texto, ini)
    entradas = _entradas(texto, ini, fin)

    hasta = (date.fromisoformat(desde) - timedelta(days=1)).isoformat()
    if abiertas:
        idx = max(i for i, e in enumerate(entradas) if json.loads(e)["to"] is None)
        entradas[idx], n = re.subn(r'"to":\s*null', f'"to": "{hasta}"', entradas[idx], count=1)
        if n != 1:
            raise AplicarError("No se pudo cerrar la vigencia anterior")
    nueva = {"value": valor, "from": desde, "to": None, "source": source, "nota": nota, "verified": True}
    entradas.append(_fmt(nueva))

    sangria = h.group(1).lstrip("\n") + "  "
    array = "[\n" + ",\n".join(sangria + e.strip() for e in entradas) + "\n" + h.group(1).lstrip("\n") + "]"
    resultado = texto[:ini] + array + texto[fin + 1 :]

    # Verificación semántica: solo cambió lo pedido.
    esperado = json.loads(texto)
    hist = esperado["params"][clave]["history"]
    if abiertas:
        max(hist, key=lambda e: e["from"] if e["to"] is None else "")["to"] = hasta
    hist.append(nueva)
    if json.loads(resultado) != esperado:
        raise AplicarError("La edición de params.json no coincide con el cambio esperado")
    return resultado


def abrir_pr(store: Store, p: Propuesta, *, hoy: date, sufijo: str = "") -> dict[str, Any]:
    """Crea rama + commit + PR para una propuesta confirmada. Devuelve {numero, url, rama, sha}."""
    if p.status != "confirmada":
        raise AplicarError(f"La propuesta #{p.id} no está confirmada")
    ruta = ruta_params(p.country)
    actual, sha_archivo, sha_main = github.leer_archivo(ruta, "main")
    nota = f"Confirmado por Telegram el {hoy.isoformat()} (propuesta #{p.id})" + (f"; {p.url}" if p.url else "")
    nuevo = agregar_vigencia(actual, p.param_key, p.value, p.date_from, p.source, nota)

    rama = f"params/{p.param_key}-{p.date_from}-p{p.id}{sufijo}"
    github.crear_rama(rama, sha_main)
    titulo = f"chore(params-{p.country}): {p.param_key} desde {p.date_from}"
    sha_commit = github.escribir_archivo(ruta, nuevo, sha_archivo, rama, f"{titulo}\n\nFuente: {p.source}\nPropuesta #{p.id} confirmada por Telegram.")
    valor = json.dumps(p.value, ensure_ascii=False) if isinstance(p.value, dict) else p.value
    cuerpo = (
        f"Nueva vigencia de `{p.param_key}` = `{valor}` desde **{p.date_from}**.\n\n"
        f"- Fuente: {p.source}" + (f" ({p.url})" if p.url else "") + "\n"
        f"- Detectada por el pipeline y confirmada por Telegram (propuesta #{p.id}).\n"
        "- La vigencia anterior se cierra el día previo; el historial no se sobrescribe.\n\n"
        "Se publica con el botón **🚀 Publicar** del bot cuando el CI (casos dorados) pase.\n\n"
        "🤖 Generated with [Claude Code](https://claude.com/claude-code)"
    )
    numero, url = github.crear_pr(titulo, rama, cuerpo)
    store.registrar_pr(p.id, numero, rama, sha_commit, url)
    store.registrar("pr_abierto", propuesta=p.id, pr=numero)
    return {"numero": numero, "url": url, "rama": rama, "sha": sha_commit}
