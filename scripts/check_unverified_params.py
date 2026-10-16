#!/usr/bin/env python3
"""Lista los parámetros vigentes con "verified": false (checklist de /publicar).

No bloquea el deploy: emite avisos (::warning en GitHub Actions) para revisarlos.
Uso: python3 scripts/check_unverified_params.py --country pe [--fecha YYYY-MM-DD]
"""
import argparse
import datetime
import json
import os
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--country", required=True)
    parser.add_argument("--fecha", default=datetime.date.today().isoformat())
    args = parser.parse_args()

    data = json.loads((ROOT / "config" / "countries" / args.country / "params.json").read_text(encoding="utf-8"))
    pendientes = []
    for clave, definicion in data["params"].items():
        for e in definicion["history"]:
            vigente = e["from"] <= args.fecha and (e["to"] is None or args.fecha <= e["to"])
            if vigente and not e.get("verified", False):
                pendientes.append(f"{clave} = {json.dumps(e['value'], ensure_ascii=False)[:80]} ({e['source']})")

    en_actions = os.environ.get("GITHUB_ACTIONS") == "true"
    for p in pendientes:
        print(f"::warning title=Parámetro sin verificar::{p}" if en_actions else f"[sin verificar] {p}")
    print(f"{len(pendientes)} parámetro(s) vigentes sin verificar en '{args.country}'")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
