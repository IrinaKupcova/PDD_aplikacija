# -*- coding: utf-8 -*-
"""Viegla REST tīrīšana, kad SQL Editor neiet (īsi timeouti, mazas partijas)."""
from __future__ import annotations

import calendar
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
TIMEOUT = int(os.environ.get("PDD_HTTP_TIMEOUT", "18"))


def cutoff_ymd() -> str:
    d = date.today()
    y, m = d.year, d.month - 2
    while m <= 0:
        m += 12
        y -= 1
    last = calendar.monthrange(y, m)[1]
    return date(y, m, min(d.day, last)).isoformat()


def call(method: str, table: str, params: dict, timeout: int = TIMEOUT) -> tuple[int, str]:
    q = urllib.parse.urlencode(params, doseq=True)
    url = f"{BASE}/rest/v1/{urllib.parse.quote(table, safe='')}?{q}"
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
    cut = cutoff_ymd()
    print(f"BASE={BASE}")
    print(f"cutoff={cut} (2 mēneši)")
    print("1) ping users...")
    code, body = call("GET", "users", {"select": "id", "limit": "1"}, timeout=12)
    print(f"   -> {code} {body[:180]}")
    if code == 0:
        print("DB neatbild. Supabase → Restart project, tad palaid šo vēlreiz.")
        return 2

    steps = [
        ("TRUNCATE-ish chat reactions", "pdd_ideju_chat_reactions", {"created_at": "gte.1970-01-01"}),
        ("TRUNCATE-ish chat", "pdd_ideju_chat", {"created_at": "gte.1970-01-01"}),
        ("TRUNCATE-ish aktualitates_reactions", "aktualitates_reactions", {"created_at": "gte.1970-01-01"}),
        ("old AKTUALITATES", "AKTUALITATES", {"Beigas": f"lt.{cut}"}),
        ("old prombutnes", "prombutnes_dati", {"Beigu_datums": f"lt.{cut}"}),
        ("old Saliedesana", "Saliedesana", {"Datums": f"lt.{cut}"}),
        ("old audit ascii", "Auditacijas_vesture", {"ts": f"lt.{cut}T00:00:00Z"}),
        ("old audit ascii created", "Auditacijas_vesture", {"created_at": f"lt.{cut}T00:00:00Z"}),
    ]
    for label, table, params in steps:
        print(f"2) DELETE {label}")
        for i in range(1, 6):
            c, b = call("DELETE", table, params)
            print(f"   round {i}: {c} {b[:120]}")
            if c in (200, 204) or c == 404:
                break
            if c == 0:
                print("   timeout/network — turpini nākamo")
                break
            time.sleep(1.2)

    print("Gatavs / daļēji. Restart project + Ctrl+F5.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
