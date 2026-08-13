/**
 * Nedēļas Supabase Usage/Egress trenda pārbaude (GitHub Actions).
 *
 * Management API nav tieša Egress GB lauka — izmanto API pieprasījumu skaitu
 * (REST + Realtime + Auth + Storage) kā Egress riska indikatoru un atgādina
 * manuāli pārbaudīt Dashboard → Organization → Usage → Egress.
 *
 * Env: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF,
 *      RESEND_API_KEY, RESEND_FROM (opcionāli),
 *      PDD_RESOURCE_ALERT_TO, PDD_RESOURCE_ALERT_CC (opcionāli),
 *      GITHUB_TOKEN, GITHUB_REPOSITORY (Actions),
 *      PDD_USAGE_SNAPSHOT_PATH (ceļš uz iepriekšējo snapshot, opcionāli),
 *      PDD_USAGE_SNAPSHOT_OUT (kur saglabāt jauno snapshot).
 */
"use strict";

const fs = require("fs");
const path = require("path");

const API_BASE = "https://api.supabase.com";
const FREE_EGRESS_GB = 5;
const SPIKE_PCT = Number(process.env.PDD_USAGE_SPIKE_PCT || 45);
const ALERT_TO = String(process.env.PDD_RESOURCE_ALERT_TO || "irina.kupcova@vid.gov.lv").trim();
const ALERT_CC = String(process.env.PDD_RESOURCE_ALERT_CC || "katrina.jurgensone@vid.gov.lv")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const ISSUE_LABEL = "supabase-usage-weekly";

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

async function sendResendEmail(report) {
  const resendKey = String(process.env.RESEND_API_KEY || "").trim();
  const from = String(process.env.RESEND_FROM || "PDD brīdinājumi <onboarding@resend.dev>").trim();
  if (!resendKey || !ALERT_TO.includes("@")) {
    console.warn("[usage-weekly] Resend izlaists (nav atslēgas vai adresāta)");
    return { ok: false, skipped: true };
  }

  const subject = report.alert
    ? "[PDD] Supabase Usage — Egress risks (nedēļas trends ↑)"
    : "[PDD] Supabase Usage — nedēļas Egress/API trends (OK)";

  const payload = {
    from,
    to: [ALERT_TO],
    subject,
    text: report.text,
  };
  if (ALERT_CC.length) payload.cc = ALERT_CC;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  if (!res.ok) {
    console.warn("[usage-weekly] Resend kļūda", res.status, body.slice(0, 300));
    return { ok: false, status: res.status };
  }
  console.log("[usage-weekly] E-pasts nosūtīts uz", ALERT_TO);
  return { ok: true };
}

async function upsertGithubIssue(report) {
  if (!report.alert) return { ok: true, skipped: true };
  const token = String(process.env.GITHUB_TOKEN || "").trim();
  const repo = String(process.env.GITHUB_REPOSITORY || "").trim();
  if (!token || !repo.includes("/")) return { ok: false, skipped: true };

  const [owner, name] = repo.split("/");
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "pdd-supabase-usage-weekly",
  };

  const listUrl = `https://api.github.com/repos/${owner}/${name}/issues?state=open&labels=${encodeURIComponent(ISSUE_LABEL)}&per_page=5`;
  const listRes = await fetch(listUrl, { headers });
  const listJson = listRes.ok ? await listRes.json() : [];
  const existing = Array.isArray(listJson) ? listJson[0] : null;

  const body = [
    "## Nedēļas Supabase Usage / Egress trends",
    "",
    report.markdown,
    "",
    "_Automātiski no GitHub Action «Supabase usage weekly»._",
  ].join("\n");

  if (existing?.number) {
    await fetch(`https://api.github.com/repos/${owner}/${name}/issues/${existing.number}/comments`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ body: `Atjaunināts ${new Date().toISOString()}:\n\n${report.markdown}` }),
    });
    return { ok: true, number: existing.number, updated: true };
  }

  const createRes = await fetch(`https://api.github.com/repos/${owner}/${name}/issues`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "[PDD] Supabase Usage/Egress — nedēļas trends prasa uzmanību",
      body,
      labels: [ISSUE_LABEL],
    }),
  });
  if (!createRes.ok) {
    const retry = await fetch(`https://api.github.com/repos/${owner}/${name}/issues`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "[PDD] Supabase Usage/Egress — nedēļas trends prasa uzmanību",
        body,
      }),
    });
    const j = await retry.json().catch(() => ({}));
    return { ok: retry.ok, number: j.number };
  }
  const j = await createRes.json().catch(() => ({}));
  return { ok: true, number: j.number };
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

  const dashboardUrl = "https://supabase.com/dashboard/org/_/usage";
  const projectUsageHint = `https://supabase.com/dashboard/project/${ref}/settings/billing/usage`;

  const lines = [
    "PDD — nedēļas Supabase Usage/Egress trends",
    "",
    `Projekts: ${ref}`,
    `Periods: pēdējās ${totals.days} dienas (Management API usage.api-counts)`,
    `Laiks (UTC): ${new Date().toISOString()}`,
    "",
    "API pieprasījumi (Egress riska indikators — nav tieši GB):",
    `  REST:      ${fmtNum(totals.rest)}  (${fmtPct(changes.rest)} vs iepriekšējā nedēļa)`,
    `  Realtime:  ${fmtNum(totals.realtime)}  (${fmtPct(changes.realtime)})`,
    `  Auth:      ${fmtNum(totals.auth)}`,
    `  Storage:   ${fmtNum(totals.storage)}`,
    `  KOPĀ:      ${fmtNum(totals.combined)}  (${fmtPct(changes.combined)})`,
    "",
    alert
      ? `⚠ Trends aug >${SPIKE_PCT}% — pārbaudi Egress Dashboard un samazini liekos fetch/Realtime.`
      : "Trends šonedēļ normālā diapazonā (salīdzinājumā ar iepriekšējo snapshot).",
    "",
    "Manuāli (reizi nedēļā):",
    `  1) ${dashboardUrl}`,
    "  2) Organization → Usage → Total Egress (Free limits: 5 GB/mēn.)",
    `  3) Projekts: ${projectUsageHint}`,
    "",
    "Piezīme: Supabase Management API nedod tiešu Egress GB — šis e-pasts ir automātisks trends signāls.",
    "",
    "— GitHub Action «Supabase usage weekly»",
  ];

  const markdown = [
    `- **REST (7d):** ${fmtNum(totals.rest)} (${fmtPct(changes.rest)})`,
    `- **Realtime (7d):** ${fmtNum(totals.realtime)} (${fmtPct(changes.realtime)})`,
    `- **Kopā (7d):** ${fmtNum(totals.combined)} (${fmtPct(changes.combined)})`,
    `- **Free Egress limits:** ${FREE_EGRESS_GB} GB/mēn.`,
    `- **Dashboard:** [Organization Usage](${dashboardUrl})`,
  ].join("\n");

  return {
    alert,
    text: lines.join("\n"),
    markdown,
    changes,
    totals,
    daily: rows.map((r) => ({
      timestamp: r.timestamp,
      rest: Number(r.total_rest_requests) || 0,
      realtime: Number(r.total_realtime_requests) || 0,
      auth: Number(r.total_auth_requests) || 0,
      storage: Number(r.total_storage_requests) || 0,
    })),
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

  const snapshot = {
    capturedAt: new Date().toISOString(),
    projectRef: ref,
    interval: "7day",
    totals,
    daily: report.daily,
  };
  saveSnapshot(snapshot);

  console.log("[usage-weekly]", JSON.stringify({ totals, changes: report.changes, alert: report.alert }));

  await sendResendEmail(report);
  await upsertGithubIssue(report);

  process.exit(report.alert ? 1 : 0);
}

main().catch((e) => {
  console.error("[usage-weekly]", e);
  process.exit(2);
});
