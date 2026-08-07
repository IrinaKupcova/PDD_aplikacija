#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Avārijas tīrīšana caur REST, kad Supabase Dashboard timeouto.
Dzēš TIKAI: pdd_ideju_chat(+reactions) un veco Auditacijas_vesture.
NEAIZTIEK Pakalpojumu/Procesu/prombūtņu/aktualitāšu datus.

Lietošana:
  set SUPABASE_SERVICE_ROLE_KEY=...   (ieteicams — Dashboard → Settings → API → service_role)
  py arhiva/avarijas_tirisana_rest.py

Bez service_role mēģina publishable atslēgu (var neizdoties, ja RLS/limiti).
"""
from __future__ import annotations

import json
import os
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date

BASE = os.environ.get("SUPABASE_URL", "https://fdnkvecgqetmwilwolgt.supabase.co").rstrip("/")
KEY = (
    os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    or os.environ.get("SUPABASE_ANON_KEY")
    or "sb_publishable_wPrwQc6F0QVlnAubnhamJw_RuxtvtGo"
)
TIMEOUT = 90


def cutoff_iso() -> str:
    d = date.today().replace(day=1)
    m = d.month - 1 or 12
    y = d.year if d.month > 1 else d.year - 1
    return f"{y:04d}-{m:02d}-01T00:00:00.000Z"


def call(method: str, table: str, params: dict) -> tuple[int, str]:
    q = urllib.parse.urlencode(params, doseq=True)
    url = f"{BASE}/rest/v1/{urllib.parse.quote(table)}?{q}"
    headers = {
        "apikey": KEY,
        "Authorization": f"Bearer {KEY}",
        "Prefer": "return=minimal",
        "Content-Type": "application/json",
    }
    req = urllib.request.Request(url, data=b"", headers=headers, method=method)
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT, context=ctx) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        return e.code, body
    except Exception as e:
        return 0, str(e)


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    using_service = bool(os.environ.get("SUPABASE_SERVICE_ROLE_KEY"))
    print(f"BASE={BASE}")
    print(f"key=service_role" if using_service else "key=publishable/anon (var neizdoties)")
    print(f"audit cutoff < {cutoff_iso()}")

    ok = True
    for table in ("pdd_ideju_chat_reactions", "pdd_ideju_chat"):
        print(f"DELETE {table} ...")
        code, body = call("DELETE", table, {"created_at": "gte.1970-01-01"})
        print(f"  -> {code} {body[:200]}")
        if code not in (200, 204) and code != 0:
            ok = False
        if code == 0:
            ok = False

    cut = cutoff_iso()
    for table in ("Auditacijas_vesture", "Auditacijas_vēsture"):
        for col in ("ts", "created_at", "Laiks"):
            print(f"DELETE {table} where {col} < cutoff ...")
            code, body = call("DELETE", table, {col: f"lt.{cut}"})
            print(f"  -> {code} {body[:200]}")

    if not ok:
        print("\nREST neizdevās (DB joprojām pārslogota).")
        print("1) GitHub → Actions → «Emergency DB purge» → Run workflow")
        print("   (vajag secrets: SUPABASE_SERVICE_ROLE_KEY + URL)")
        print("2) Vai īslaicīgi Upgrade uz Pro, tad SQL Editor → PIEMEROT_TIKAI_CHAT_TRUNCATE.sql")
        return 2

    print("\nGatavs (vai daļēji). Pagaidi 1–2 min, tad Restart project + Ctrl+F5.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
