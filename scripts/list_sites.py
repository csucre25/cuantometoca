#!/usr/bin/env python3
"""Lista los sites habilitados de config/sites/*.yaml.

Uso:
  python3 scripts/list_sites.py                 -> matrix=<json> (para $GITHUB_OUTPUT)
  python3 scripts/list_sites.py --only pe       -> solo ese site (si está habilitado)
  python3 scripts/list_sites.py --plain         -> ids separados por espacio
Requiere PyYAML (preinstalado en los runners de GitHub).
"""
import argparse
import json
import pathlib
import sys

import yaml

ROOT = pathlib.Path(__file__).resolve().parent.parent


def load_sites():
    sites = []
    for path in sorted((ROOT / "config" / "sites").glob("*.yaml")):
        if path.name.startswith("_"):
            continue
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        if not data.get("enabled"):
            continue
        sites.append({
            "site": data["site_id"],
            "site_upper": data["site_id"].upper(),
            "pages_project": data["cloudflare"]["pages_project"],
        })
    return sites


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", default="")
    parser.add_argument("--plain", action="store_true")
    args = parser.parse_args()

    sites = load_sites()
    if args.only:
        sites = [s for s in sites if s["site"] == args.only]

    if args.plain:
        print(" ".join(s["site"] for s in sites))
    else:
        print("matrix=" + json.dumps({"include": sites}, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
