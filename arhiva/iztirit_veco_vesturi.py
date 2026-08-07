#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Vieglais lokālais arhīvs (bez milzu base64) + mēģinājums dzēst caur REST.
Galvenā tīrīšana: supabase/PIEMEROT_TIRIT_VECO_VESTURI.sql (SQL Editor).

NEAIZTIEK: Pakalpojumu/Procesu/čatu u.c.
"""
from __future__ import annotations

import json
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

BASE = "https://fdnkvecgqetmwilwolgt.supabase.co"
KEY = "sb_publishable_wPrwQc6F0QVlnAubnhamJw_RuxtvtGo"
CUTOFF = "2026-07-01"
TODAY = date.today().isoformat()
OUT_DIR = Path(__file__).resolve().parent
TIMEOUT = 60


def req(method: str, path: str, *, params=None, body=None, prefer=None):
    q = urllib.parse.urlencode(params or {}, doseq=True)
    url = f"{BASE}/rest/v1/{path}" + (f"?{q}" if q else "")
    headers = {
        "apikey": KEY,
        "Authorization": f"Bearer {KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(r, timeout=TIMEOUT, context=ctx) as resp:
        raw = resp.read().decode("utf-8")
        if not raw:
            return []
        return json.loads(raw)


def save_json(name: str, rows):
    path = OUT_DIR / name
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  saved {path.name} ({len(rows) if isinstance(rows, list) else '?'} rows)")
    return path


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    print(f"Cutoff < {CUTOFF}; inactive Beigas < {TODAY}")
    print("1) Light aktualitates meta (no HTML)...")
    try:
        akt = req(
            "GET",
            "AKTUALITATES",
            params={
                "select": "id,Sakums,Beigas,Autors,created_at",
                "order": "Beigas.asc",
                "limit": "3000",
            },
        )
    except Exception as e:
        print("FAIL read AKTUALITATES:", e)
        print("DB still overloaded. Restart project, then run SQL:")
        print("  supabase/PIEMEROT_TIRIT_VECO_VESTURI.sql")
        raise SystemExit(2)

    if not isinstance(akt, list):
        raise SystemExit(f"bad response: {akt}")

    akt_old = []
    for row in akt:
        end = str(row.get("Beigas") or "")[:10]
        if (end and end < CUTOFF) or (end and end < TODAY):
            akt_old.append(row)

    save_json(f"aktualitates_meta_arhiva_{TODAY}.json", akt_old)
    print(f"   archive candidates: {len(akt_old)} / total listed {len(akt)}")

    print("2) Light prombutnes (Beigu_datums < cutoff)...")
    try:
        promb = req(
            "GET",
            "prombutnes_dati",
            params={
                "select": "id,Sakuma_datums,Beigu_datums,Statuss,user_id,type_id",
                "Beigu_datums": f"lt.{CUTOFF}",
                "order": "Beigu_datums.asc",
                "limit": "5000",
            },
        )
    except Exception as e:
        print("FAIL read prombutnes:", e)
        promb = []
    if isinstance(promb, list):
        save_json(f"prombutnes_meta_arhiva_{TODAY}.json", promb)
        print(f"   old prombutnes: {len(promb)}")

    print()
    print("Lokālais META arhīvs sagatavots.")
    print("Lai REĀLI atbrīvotu DB vietu (dzēšana + bilžu noņemšana), palaid SQL Editorī:")
    print("  supabase/PIEMEROT_TIRIT_VECO_VESTURI.sql")
    print("Pēc tam: Restart project un Ctrl+F5 aplikācijā.")


if __name__ == "__main__":
    main()
