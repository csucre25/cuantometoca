"""Estado local del pipeline en SQLite: pipeline/data/<site>.db (no versionado).

Tablas (docs/02 §7):
- seen_items: elementos ya vistos por los watchers (idempotencia por hash de contenido).
- param_proposals: cambios de parámetros detectados, pendientes de aprobación por Telegram.
- drafts: borradores de texto generados con LLM, pendientes de aprobación.
- events: registro de lo ocurrido (avisos enviados, aprobaciones, deploys).
- ajustes: estado compartido entre el bot y el worker (pausa, última revisión diaria).
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
from contextlib import closing
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel

from pipeline.paths import repo_dir

EstadoPropuesta = Literal["pendiente", "confirmada", "ignorada", "aplicada"]
EstadoBorrador = Literal["pendiente", "aprobado", "descartado", "publicado"]

ESQUEMA = """
CREATE TABLE IF NOT EXISTS seen_items (
  source TEXT NOT NULL,
  item_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  title TEXT,
  url TEXT,
  first_seen TEXT NOT NULL,
  PRIMARY KEY (source, item_id)
);
CREATE TABLE IF NOT EXISTS param_proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  country TEXT NOT NULL,
  param_key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  date_from TEXT NOT NULL,
  source TEXT NOT NULL,
  url TEXT,
  status TEXT NOT NULL DEFAULT 'pendiente',
  created TEXT NOT NULL,
  updated TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendiente',
  created TEXT NOT NULL,
  updated TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS extraction_queue (
  norma_id TEXT PRIMARY KEY,
  titulo TEXT NOT NULL,
  url TEXT NOT NULL,
  fecha TEXT NOT NULL,
  params_json TEXT NOT NULL,
  intentos INTEGER NOT NULL DEFAULT 0,
  ultimo_error TEXT,
  created TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ajustes (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  updated TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created TEXT NOT NULL
);
"""


def _ahora() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def hash_contenido(texto: str) -> str:
    return hashlib.sha256(texto.encode("utf-8")).hexdigest()


class Propuesta(BaseModel):
    id: int
    country: str
    param_key: str
    value: Any
    date_from: str
    source: str
    url: str | None
    status: EstadoPropuesta


class Borrador(BaseModel):
    id: int
    kind: str
    title: str
    body: str
    status: EstadoBorrador


class Store:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with closing(self._conectar()) as con:
            # WAL: el bot y el worker usan la misma base desde procesos distintos.
            con.execute("PRAGMA journal_mode=WAL")
            con.executescript(ESQUEMA)

    @classmethod
    def del_site(cls, site_id: str, data_dir: Path | None = None) -> Store:
        return cls((data_dir or repo_dir() / "pipeline" / "data") / f"{site_id}.db")

    def _conectar(self) -> sqlite3.Connection:
        con = sqlite3.connect(self.path)
        con.row_factory = sqlite3.Row
        return con

    def _ejecutar(self, sql: str, params: tuple = ()) -> sqlite3.Cursor:
        with closing(self._conectar()) as con, con:
            return con.execute(sql, params)

    def _consultar(self, sql: str, params: tuple = ()) -> list[sqlite3.Row]:
        with closing(self._conectar()) as con:
            return con.execute(sql, params).fetchall()

    # --- seen_items ---------------------------------------------------------------------------

    def es_nuevo(self, source: str, item_id: str, contenido: str, *, title: str = "", url: str = "") -> bool:
        """Registra el elemento y devuelve True si no se había visto o si su contenido cambió."""
        h = hash_contenido(contenido)
        fila = self._consultar("SELECT content_hash FROM seen_items WHERE source=? AND item_id=?", (source, item_id))
        if fila and fila[0]["content_hash"] == h:
            return False
        self._ejecutar(
            "INSERT INTO seen_items (source, item_id, content_hash, title, url, first_seen) VALUES (?,?,?,?,?,?) "
            "ON CONFLICT(source, item_id) DO UPDATE SET content_hash=excluded.content_hash, title=excluded.title, url=excluded.url",
            (source, item_id, h, title, url, _ahora()),
        )
        return True

    def visto(self, source: str, item_id: str) -> bool:
        return bool(self._consultar("SELECT 1 FROM seen_items WHERE source=? AND item_id=?", (source, item_id)))

    # --- param_proposals ----------------------------------------------------------------------

    def proponer_parametro(self, country: str, param_key: str, value: Any, date_from: str, source: str, url: str | None = None) -> int:
        """Crea una propuesta pendiente. Si ya existe una igual pendiente o confirmada, devuelve su id."""
        value_json = json.dumps(value, ensure_ascii=False, sort_keys=True)
        existente = self._consultar(
            "SELECT id FROM param_proposals WHERE country=? AND param_key=? AND value_json=? AND date_from=? AND status IN ('pendiente','confirmada')",
            (country, param_key, value_json, date_from),
        )
        if existente:
            return existente[0]["id"]
        cur = self._ejecutar(
            "INSERT INTO param_proposals (country, param_key, value_json, date_from, source, url, status, created, updated) "
            "VALUES (?,?,?,?,?,?, 'pendiente', ?, ?)",
            (country, param_key, value_json, date_from, source, url, _ahora(), _ahora()),
        )
        return int(cur.lastrowid)  # type: ignore[arg-type]

    def propuesta(self, propuesta_id: int) -> Propuesta | None:
        filas = self._consultar("SELECT * FROM param_proposals WHERE id=?", (propuesta_id,))
        return self._a_propuesta(filas[0]) if filas else None

    def propuestas(self, status: EstadoPropuesta | None = None) -> list[Propuesta]:
        if status:
            filas = self._consultar("SELECT * FROM param_proposals WHERE status=? ORDER BY id", (status,))
        else:
            filas = self._consultar("SELECT * FROM param_proposals ORDER BY id")
        return [self._a_propuesta(f) for f in filas]

    def actualizar_propuesta(self, propuesta_id: int, status: EstadoPropuesta, *, value: Any = None, date_from: str | None = None) -> None:
        sets, params = ["status=?", "updated=?"], [status, _ahora()]
        if value is not None:
            sets.append("value_json=?")
            params.append(json.dumps(value, ensure_ascii=False, sort_keys=True))
        if date_from is not None:
            sets.append("date_from=?")
            params.append(date_from)
        self._ejecutar(f"UPDATE param_proposals SET {', '.join(sets)} WHERE id=?", (*params, propuesta_id))

    @staticmethod
    def _a_propuesta(f: sqlite3.Row) -> Propuesta:
        return Propuesta(
            id=f["id"], country=f["country"], param_key=f["param_key"], value=json.loads(f["value_json"]),
            date_from=f["date_from"], source=f["source"], url=f["url"], status=f["status"],
        )

    # --- drafts -------------------------------------------------------------------------------

    def crear_borrador(self, kind: str, title: str, body: str) -> int:
        cur = self._ejecutar(
            "INSERT INTO drafts (kind, title, body, status, created, updated) VALUES (?,?,?, 'pendiente', ?, ?)",
            (kind, title, body, _ahora(), _ahora()),
        )
        return int(cur.lastrowid)  # type: ignore[arg-type]

    def borradores(self, status: EstadoBorrador | None = None) -> list[Borrador]:
        sql, params = ("SELECT * FROM drafts WHERE status=? ORDER BY id", (status,)) if status else ("SELECT * FROM drafts ORDER BY id", ())
        return [Borrador(id=f["id"], kind=f["kind"], title=f["title"], body=f["body"], status=f["status"]) for f in self._consultar(sql, params)]

    def borrador(self, borrador_id: int) -> Borrador | None:
        filas = self._consultar("SELECT * FROM drafts WHERE id=?", (borrador_id,))
        return Borrador(id=filas[0]["id"], kind=filas[0]["kind"], title=filas[0]["title"], body=filas[0]["body"], status=filas[0]["status"]) if filas else None

    def actualizar_borrador(self, borrador_id: int, status: EstadoBorrador, *, body: str | None = None) -> None:
        if body is None:
            self._ejecutar("UPDATE drafts SET status=?, updated=? WHERE id=?", (status, _ahora(), borrador_id))
        else:
            self._ejecutar("UPDATE drafts SET status=?, body=?, updated=? WHERE id=?", (status, body, _ahora(), borrador_id))

    # --- extraction_queue ---------------------------------------------------------------------
    # Normas cuya extracción con LLM falló: se reintentan en cada corrida (docs/02 §7).

    def encolar_extraccion(self, norma_id: str, titulo: str, url: str, fecha: str, params: list[str], error: str) -> None:
        self._ejecutar(
            "INSERT INTO extraction_queue (norma_id, titulo, url, fecha, params_json, intentos, ultimo_error, created) VALUES (?,?,?,?,?,1,?,?) "
            "ON CONFLICT(norma_id) DO UPDATE SET intentos=intentos+1, ultimo_error=excluded.ultimo_error",
            (norma_id, titulo, url, fecha, json.dumps(params), error, _ahora()),
        )

    def extracciones_pendientes(self) -> list[dict[str, Any]]:
        return [
            {"norma_id": f["norma_id"], "titulo": f["titulo"], "url": f["url"], "fecha": f["fecha"], "params": json.loads(f["params_json"]), "intentos": f["intentos"]}
            for f in self._consultar("SELECT * FROM extraction_queue ORDER BY created")
        ]

    def quitar_extraccion(self, norma_id: str) -> None:
        self._ejecutar("DELETE FROM extraction_queue WHERE norma_id=?", (norma_id,))

    # --- ajustes ------------------------------------------------------------------------------

    def ajuste(self, clave: str, defecto: str | None = None) -> str | None:
        filas = self._consultar("SELECT valor FROM ajustes WHERE clave=?", (clave,))
        return filas[0]["valor"] if filas else defecto

    def fijar_ajuste(self, clave: str, valor: str) -> None:
        self._ejecutar(
            "INSERT INTO ajustes (clave, valor, updated) VALUES (?,?,?) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor, updated=excluded.updated",
            (clave, valor, _ahora()),
        )

    # --- events -------------------------------------------------------------------------------

    def registrar(self, tipo: str, **payload: Any) -> None:
        self._ejecutar("INSERT INTO events (type, payload_json, created) VALUES (?,?,?)", (tipo, json.dumps(payload, ensure_ascii=False), _ahora()))

    def eventos(self, tipo: str | None = None, limite: int = 50) -> list[dict[str, Any]]:
        sql = "SELECT * FROM events" + (" WHERE type=?" if tipo else "") + " ORDER BY id DESC LIMIT ?"
        filas = self._consultar(sql, (tipo, limite) if tipo else (limite,))
        return [{"type": f["type"], "created": f["created"], **json.loads(f["payload_json"])} for f in filas]
