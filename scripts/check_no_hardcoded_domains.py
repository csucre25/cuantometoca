#!/usr/bin/env python3
"""Falla si algún dominio configurado en config/sites/*.yaml aparece en el código fuente.

Regla de CLAUDE.md: ningún dominio real en apps/ ni packages/.
"""
import pathlib
import sys

import yaml

ROOT = pathlib.Path(__file__).resolve().parent.parent
SCAN_DIRS = ["apps", "packages"]
SKIP_PARTS = {"node_modules", "dist", ".astro"}
EXTENSIONS = {".ts", ".tsx", ".js", ".mjs", ".astro", ".md", ".mdx", ".json", ".css", ".html"}


def configured_domains() -> list[str]:
    domains = []
    for path in (ROOT / "config" / "sites").glob("*.yaml"):
        if path.name.startswith("_"):
            continue
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        if data.get("domain"):
            domains.append(data["domain"].lower())
    return domains


def main() -> int:
    domains = configured_domains()
    hits = []
    for d in SCAN_DIRS:
        base = ROOT / d
        if not base.exists():
            continue
        for f in base.rglob("*"):
            if not f.is_file() or f.suffix not in EXTENSIONS or SKIP_PARTS & set(f.parts):
                continue
            text = f.read_text(encoding="utf-8", errors="ignore").lower()
            for dom in domains:
                if dom in text:
                    hits.append(f"{f.relative_to(ROOT)} contiene '{dom}'")
    if hits:
        print("Dominios hardcodeados encontrados:\n" + "\n".join(hits))
        return 1
    print("OK: sin dominios hardcodeados")
    return 0


if __name__ == "__main__":
    sys.exit(main())
