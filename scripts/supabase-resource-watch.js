/**
 * Supabase resursu / pieejamības pārbaude (CI + lokāli).
 * Ja DB neatbild laikā vai atgriež resursu kļūdu — sūta e-pastu (Resend) un
 * izveido/atjaunina GitHub Issue ar label `supabase-resource-alert`.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY | VITE_SUPABASE_ANON_KEY,
 *      RESEND_API_KEY, RESEND_FROM (opcionāli),
 *      PDD_RESOURCE_ALERT_TO, PDD_RESOURCE_ALERT_CC (opcionāli),
 *      GITHUB_TOKEN, GITHUB_REPOSITORY (Actions).
 */
"use strict";

const TIMEOUT_MS = Number(process.env.PDD_RESOURCE_PROBE_TIMEOUT_MS || 12000);
const ALERT_TO = String(process.env.PDD_RESOURCE_ALERT_TO || "irina.kupcova@vid.gov.lv").trim();
const ALERT_CC = String(process.env.PDD_RESOURCE_ALERT_CC || "katrina.jurgensone@vid.gov.lv")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const ISSUE_LABEL = "supabase-resource-alert";

function baseUrl() {
  return String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
}

function apiKey() {
  return String(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      ""
  ).trim();
}

function looksLikeResourceProblem(status, body, errMsg) {
  const blob = `${status || ""} ${body || ""} ${errMsg || ""}`.toLowerCase();
  return (
    /timeout|timed out|abort|over.?capacit|resource|exhaust|usage.?limit|529|546|503|502|520|57014|statement timeout|circuit.?breaker|remaining connection slots|too many connections|database.*unavailable|project.*paused/i.test(
      blob
    ) || status === 0
  );
}

async function probeRest() {
  const url = baseUrl();
  const key = apiKey();
  if (!url || !key) {
    return { ok: false, reason: "Trūkst SUPABASE_URL vai atslēgas", kind: "config" };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(`${url}/rest/v1/users?select=id&limit=1`, {
      method: "GET",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
      signal: ctrl.signal,
    });
    const text = await res.text();
    const ms = Date.now() - started;
    if (!res.ok) {
      const reason = `HTTP ${res.status}: ${text.slice(0, 240)} (${ms}ms)`;
      return {
        ok: false,
        reason,
        kind: looksLikeResourceProblem(res.status, text, "") ? "resource" : "http",
        status: res.status,
        ms,
      };
    }
    if (ms > TIMEOUT_MS * 0.85) {
      return {
        ok: false,
        reason: `Lēna atbilde ${ms}ms (slieksnis ${TIMEOUT_MS}ms) — iespējams resursu pārslodze`,
        kind: "resource",
        status: res.status,
        ms,
      };
    }
    return { ok: true, reason: `OK ${ms}ms`, kind: "ok", status: res.status, ms };
  } catch (e) {
    const msg = e?.name === "AbortError" ? `Timeout pēc ${TIMEOUT_MS}ms` : String(e?.message || e);
    return {
      ok: false,
      reason: msg,
      kind: looksLikeResourceProblem(0, "", msg) ? "resource" : "network",
      status: 0,
      ms: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function sendResendAlert(probe) {
  const resendKey = String(process.env.RESEND_API_KEY || "").trim();
  const from = String(process.env.RESEND_FROM || "PDD brīdinājumi <onboarding@resend.dev>").trim();
  if (!resendKey) {
    console.warn("[resource-watch] RESEND_API_KEY nav — e-pasts izlaists");
    return { ok: false, skipped: true };
  }
  if (!ALERT_TO.includes("@")) {
    console.warn("[resource-watch] Nav derīga PDD_RESOURCE_ALERT_TO");
    return { ok: false, skipped: true };
  }
  const subject = "[PDD] Supabase resursu brīdinājums — projekts var būt pārslogots";
  const text = [
    "Automātiskā pārbaude konstatēja, ka Supabase projekts neatbild normāli.",
    "",
    `Iemesls: ${probe.reason}`,
    `Veids: ${probe.kind}`,
    `URL: ${baseUrl()}`,
    `Laiks: ${new Date().toISOString()}`,
    "",
    "Ieteikums:",
    "1) Supabase Dashboard → Project Settings → Restart project",
    "2) SQL Editor → palaid supabase/PIEMEROT_TIRIT_VECO_VESTURI.sql (ja vajag vietu/IO)",
    "3) Pārbaudi Usage: CPU / Disk IO / WAL",
    "",
    "Šis e-pasts nāk no GitHub Action «Supabase resource watch».",
  ].join("\n");

  const payload = {
    from,
    to: [ALERT_TO],
    subject,
    text,
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
    console.warn("[resource-watch] Resend kļūda", res.status, body.slice(0, 300));
    return { ok: false, status: res.status };
  }
  console.log("[resource-watch] E-pasts nosūtīts uz", ALERT_TO);
  return { ok: true };
}

async function upsertGithubIssue(probe) {
  const token = String(process.env.GITHUB_TOKEN || "").trim();
  const repo = String(process.env.GITHUB_REPOSITORY || "").trim();
  if (!token || !repo.includes("/")) {
    console.warn("[resource-watch] GITHUB_TOKEN/REPO nav — Issue izlaists");
    return { ok: false, skipped: true };
  }
  const [owner, name] = repo.split("/");
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "pdd-supabase-resource-watch",
  };

  const listUrl = `https://api.github.com/repos/${owner}/${name}/issues?state=open&labels=${encodeURIComponent(ISSUE_LABEL)}&per_page=5`;
  const listRes = await fetch(listUrl, { headers });
  const listJson = listRes.ok ? await listRes.json() : [];
  const existing = Array.isArray(listJson) ? listJson[0] : null;
  const body = [
    "## Automātisks Supabase resursu brīdinājums",
    "",
    `- **Iemesls:** ${probe.reason}`,
    `- **Veids:** \`${probe.kind}\``,
    `- **Projekts:** \`${baseUrl()}\``,
    `- **Laiks (UTC):** ${new Date().toISOString()}`,
    "",
    "### Ko darīt",
    "1. Supabase → **Restart project**",
    "2. Ja vajag — SQL `supabase/PIEMEROT_TIRIT_VECO_VESTURI.sql`",
    "3. Usage → CPU / Disk IO",
    "",
    "_Issue atjauno GitHub Action «Supabase resource watch». Aizver, kad situācija nomierinājusies._",
  ].join("\n");

  if (existing?.number) {
    const cRes = await fetch(`https://api.github.com/repos/${owner}/${name}/issues/${existing.number}/comments`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ body: `Atkārtota pārbaude: **${probe.reason}** (${new Date().toISOString()})` }),
    });
    console.log("[resource-watch] Issue komentārs", existing.number, cRes.status);
    return { ok: cRes.ok, number: existing.number, updated: true };
  }

  // Label var vēl neeksistēt — GitHub to izveido, ja ir tiesības; citādi Issue bez label.
  const createRes = await fetch(`https://api.github.com/repos/${owner}/${name}/issues`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "[PDD] Supabase resursi / limiti — nepieciešama reakcija",
      body,
      labels: [ISSUE_LABEL],
    }),
  });
  if (!createRes.ok) {
    const retry = await fetch(`https://api.github.com/repos/${owner}/${name}/issues`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "[PDD] Supabase resursi / limiti — nepieciešama reakcija",
        body,
      }),
    });
    const j = await retry.json().catch(() => ({}));
    console.log("[resource-watch] Issue create", retry.status, j.number || "");
    return { ok: retry.ok, number: j.number };
  }
  const j = await createRes.json().catch(() => ({}));
  console.log("[resource-watch] Issue izveidots", j.number);
  return { ok: true, number: j.number };
}

async function closeHealthyIssue() {
  const token = String(process.env.GITHUB_TOKEN || "").trim();
  const repo = String(process.env.GITHUB_REPOSITORY || "").trim();
  if (!token || !repo.includes("/")) return;
  const [owner, name] = repo.split("/");
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "pdd-supabase-resource-watch",
  };
  const listUrl = `https://api.github.com/repos/${owner}/${name}/issues?state=open&labels=${encodeURIComponent(ISSUE_LABEL)}&per_page=5`;
  const listRes = await fetch(listUrl, { headers });
  if (!listRes.ok) return;
  const listJson = await listRes.json();
  for (const issue of Array.isArray(listJson) ? listJson : []) {
    await fetch(`https://api.github.com/repos/${owner}/${name}/issues/${issue.number}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        state: "closed",
        state_reason: "completed",
      }),
    });
    await fetch(`https://api.github.com/repos/${owner}/${name}/issues/${issue.number}/comments`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        body: `Automātiski aizvērts: pārbaude ${new Date().toISOString()} atbildēja normāli.`,
      }),
    });
    console.log("[resource-watch] Aizvērts Issue", issue.number);
  }
}

async function main() {
  const probe = await probeRest();
  console.log("[resource-watch]", JSON.stringify(probe));

  if (probe.ok) {
    await closeHealthyIssue();
    process.exit(0);
  }

  // Konfigurācijas kļūdas — neveido resursu alertu
  if (probe.kind === "config") {
    console.error(probe.reason);
    process.exit(2);
  }

  const issue = await upsertGithubIssue(probe);
  // E-pastu sūtam tikai, kad Issue ir jauns (lai nebombardētu ik pēc 30 min).
  if (!issue?.updated) {
    await sendResendAlert(probe);
  } else {
    console.log("[resource-watch] Issue jau atvērts — e-pasts izlaists (tikai komentārs)");
  }
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
