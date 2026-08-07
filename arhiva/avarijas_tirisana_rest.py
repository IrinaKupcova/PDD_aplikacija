#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Avārijas tīrīšana — īsi timeouti, mazas partijas. Ctrl+C pārtrauc."""
from __future__ import annotations

import json
import os
import ssl
import sys
import time
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
TIMEOUT = int(os.environ.get("PDD_HTTP_TIMEOUT", "20"))


def cutoff_iso() -> str:
    d = date.today().replace(day=1)
    m = d.month - 1 or 12
    y = d.year if d.month > 1 else d.year - 1
    return f"{y:04d}-{m:02d}-01T00:00:00.000Z"


def call(method: str, table: str, params: dict, timeout: int = TIMEOUT) -> tuple[int, str]:
    q = urllib.parse.urlencode(params, doseq=True)
    url = f"{BASE}/rest/v1/{urllib.parse.quote(table)}?{q}"
    headers = {
        "apikey": KEY,
        "Authorization": f"Bearer {KEY}",
        "Prefer": "return=minimal",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    req = urllib.request.Request(url, data=b"" if method == "DELETE" else None, headers=headers, method=method)
    if method == "GET":
        req = urllib.request.Request(url, headers=headers, method="GET")
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")
    except Exception as e:
        return 0, str(e)


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    print(f"BASE={BASE} timeout={TIMEOUT}s")
    print("1) ping select id limit 1 ...")
    code, body = call("GET", "pdd_ideju_chat", {"select": "id", "limit": "1"}, timeout=12)
    print(f"   -> {code} {body[:160]}")
    if code == 0:
        print("DB neatbild. Turpini GitHub Actions Emergency DB purge (automātiski pēc push).")
        return 2

    for round_i in range(1, 31):
        print(f"2) DELETE chat round {round_i}")
        c1, b1 = call("DELETE", "pdd_ideju_chat_reactions", {"created_at": "gte.1970-01-01"})
        c2, b2 = call("DELETE", "pdd_ideju_chat", {"created_at": "gte.1970-01-01"})
        print(f"   reactions={c1} chat={c2}")
        code, body = call("GET", "pdd_ideju_chat", {"select": "id", "limit": "1"}, timeout=12)
        if body.strip() in ("[]", ""):
            print("   chat tukšs")
            break
        time.sleep(1)

    cut = cutoff_iso()
    print(f"3) audit < {cut}")
    for table in ("Auditacijas_vesture", "Auditacijas_vēsture"):
        for col in ("ts", "created_at", "Laiks"):
            c, b = call("DELETE", table, {col: f"lt.{cut}"})
            print(f"   {table}.{col} -> {c} {b[:100]}")

    print("Gatavs / daļēji. Restart project + Ctrl+F5.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
