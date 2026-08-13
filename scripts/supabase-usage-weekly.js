/**
 * Nedēļas Supabase Usage/Egress trenda pārbaude (GitHub Actions).
 *
 * Management API nav tieša Egress GB lauka — izmanto API pieprasījumu skaitu
 * (REST + Realtime + Auth + Storage) kā Egress riska indikatoru.
 * Rezultātu ieraksta tabulā pdd_usage_weekly_notice — admin redz baneri lapā.
 *
 * Env: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF,
 *      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (lapas paziņojumam),
 *      PDD_USAGE_SNAPSHOT_PATH, PDD_USAGE_SNAPSHOT_OUT (opcionāli).
 */
"use strict";

const fs = require("fs");
const path = require("path");

const API_BASE = "https://api.supabase.com";
const FREE_EGRESS_GB = 5;
const SPIKE_PCT = Number(process.env.PDD_USAGE_SPIKE_PCT || 45);

function projectRef() {
  const direct = String(process.env.SUPABASE_PROJECT_REF || "").trim();
  if (direct) return direct;
  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
  const m = url.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i);
  return m ? m[1] : "";
}

function accessToken() {
  return String(process.env.SUPABASE_ACCESS_TOKEN || "").trim();
}

function supabaseRestBase() {
  return String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
}

function serviceRoleKey() {
  return String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
}

function snapshotInPath() {
  return String(
    process.env.PDD_USAGE_SNAPSHOT_PATH ||
      path.join(process.cwd(), ".usage-cache", "previous.json")
  );
}

function snapshotOutPath() {
  return String(
    process.env.PDD_USAGE_SNAPSHOT_OUT ||
      path.join(process.cwd(), ".usage-cache", "previous.json")
  );
}

function sumRows(rows) {
  const totals = {
    auth: 0,
    realtime: 0,
    rest: 0,
    storage: 0,
    combined: 0,
    days: 0,
  };
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const auth = Number(row.total_auth_requests) || 0;
    const realtime = Number(row.total_realtime_requests) || 0;
    const rest = Number(row.total_rest_requests) || 0;
    const storage = Number(row.total_storage_requests) || 0;
    totals.auth += auth;
    totals.realtime += realtime;
    totals.rest += rest;
    totals.storage += storage;
    totals.combined += auth + realtime + rest + storage;
    totals.days += 1;
  }
  return totals;
}

function pctChange(current, previous) {
  if (!previous || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

function fmtPct(n) {
  if (n == null || Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function fmtNum(n) {
  return Math.round(Number(n) || 0).toLocaleString("lv-LV");
}

async function fetchUsageApiCounts(ref, token) {
  const url = `${API_BASE}/v1/projects/${encodeURIComponent(ref)}/analytics/endpoints/usage.api-counts?interval=7day`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  const text = await res.text();
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  if (!res.ok) {
    throw new Error(`Management API ${res.status}: ${text.slice(0, 280)}`);
  }
  if (json.error) {
    throw new Error(`Management API error: ${JSON.stringify(json.error).slice(0, 280)}`);
  }
  const rows = Array.isArray(json.result) ? json.result : [];
  return rows.filter(Boolean);
}

function loadPreviousSnapshot() {
  const p = snapshotInPath();
  try {
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function saveSnapshot(snapshot) {
  const p = snapshotOutPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

async function publishPageNotice(report, ref, capturedAt) {
  const base = supabaseRestBase();
  const key = serviceRoleKey();
  if (!base || !key) {
    console.warn("[usage-weekly] Nav SUPABASE_URL/SERVICE_ROLE — lapas paziņojums izlaists");
    return { ok: false, skipped: true };
  }

  const noticeId = `${ref}-${capturedAt}`;
  const dashboardUrl = "https://supabase.com/dashboard/org/_/usage";
  const summary = [
    `REST ${fmtNum(report.totals.rest)} (${fmtPct(report.changes.rest)}),`,
    `Realtime ${fmtNum(report.totals.realtime)} (${fmtPct(report.changes.realtime)}),`,
    `kopā ${fmtNum(report.totals.combined)} (${fmtPct(report.changes.combined)}).`,
    report.alert
      ? `Trends >${SPIKE_PCT}% — pārbaudi Egress Dashboard.`
      : "Trends normālā diapazonā.",
  ].join(" ");

  const payload = {
    id: 1,
    notice_id: noticeId,
    captured_at: capturedAt,
    alert: report.alert,
    summary,
    details: {
      totals: report.totals,
      changes: report.changes,
      freeEgressGb: FREE_EGRESS_GB,
      dashboardUrl,
      projectRef: ref,
    },
    updated_at: capturedAt,
  };

  const res = await fetch(`${base}/rest/v1/pdd_usage_weekly_notice`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  if (!res.ok) {
    console.warn("[usage-weekly] DB paziņojums neizdevās", res.status, body.slice(0, 320));
    return { ok: false, status: res.status };
  }
  console.log("[usage-weekly] Lapas paziņojums saglabāts", noticeId);
  return { ok: true };
}

function buildReport({ ref, rows, totals, previous }) {
  const prevTotals = previous?.totals || null;
  const changes = {
    combined: pctChange(totals.combined, prevTotals?.combined),
    rest: pctChange(totals.rest, prevTotals?.rest),
    realtime: pctChange(totals.realtime, prevTotals?.realtime),
  };

  const alert =
    (changes.combined != null && changes.combined >= SPIKE_PCT) ||
    (changes.rest != null && changes.rest >= SPIKE_PCT) ||
    (changes.realtime != null && changes.realtime >= SPIKE_PCT);

  return {
    alert,
    changes,
    totals,
    daily: rows.map((r) => ({
      timestamp: r.timestamp,
      rest: Number(r.total_rest_requests) || 0,
      realtime: Number(r.total_realtime_requests) || 0,
      auth: Number(r.total_auth_requests) || 0,
      storage: Number(r.total_storage_requests) || 0,
    })),
    ref,
  };
}

async function main() {
  const ref = projectRef();
  const token = accessToken();
  if (!ref || !token) {
    console.error("[usage-weekly] Trūkst SUPABASE_PROJECT_REF vai SUPABASE_ACCESS_TOKEN");
    process.exit(2);
  }

  const rows = await fetchUsageApiCounts(ref, token);
  const totals = sumRows(rows);
  const previous = loadPreviousSnapshot();
  const report = buildReport({ ref, rows, totals, previous });
  const capturedAt = new Date().toISOString();

  const snapshot = {
    capturedAt,
    projectRef: ref,
    interval: "7day",
    totals,
    daily: report.daily,
  };
  saveSnapshot(snapshot);

  console.log("[usage-weekly]", JSON.stringify({ totals, changes: report.changes, alert: report.alert }));

  await publishPageNotice(report, ref, capturedAt);

  process.exit(report.alert ? 1 : 0);
}

main().catch((e) => {
  console.error("[usage-weekly]", e);
  process.exit(2);
});
