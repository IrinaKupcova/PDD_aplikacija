/**
 * Vercel Serverless (vai līdzīgs Node hosts): Resend e-pasti bez Supabase Edge Functions.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, RESEND_FROM
 *
 * POST JSON + Header: Authorization: Bearer <Supabase access_token>
 * Body: { action, app_base_url, ... }
 */

const { createClient } = require("@supabase/supabase-js");
const { Resend } = require("resend");
const { sendCitsPendingNotificationFromApi } = require("../epasts_sazina.js");

function normLoose(v) {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isCitsTypeName(name) {
  return normLoose(name).startsWith("cits");
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function pickUserEmailRow(u) {
  if (!u || typeof u !== "object") return "";
  return String(u.email ?? u["i-mail"] ?? u["e-mail"] ?? u["e-pasts"] ?? "").trim();
}

function pickOwnerId(row) {
  const v = row["Vārds uzvārds"] ?? row.user_id ?? row["Vards uzvards"];
  return v != null ? String(v).trim() : "";
}

function pickTypeId(row) {
  const v = row.type ?? row.type_id;
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function rowStatusNormalized(row) {
  const s = String(row.Statuss ?? row.status ?? row.statuss ?? "")
    .trim()
    .toLowerCase();
  if (s === "approved" || s === "apstiprināts" || s === "apstiprinats" || s === "saskaņots" || s === "saskanots") {
    return "approved";
  }
  if (s === "rejected" || s === "noraidīts" || s === "noraidits" || s === "cancelled") return "rejected";
  if (s === "pending" || s === "gaida") return "pending";
  return s;
}

function pickRejectReason(row) {
  return String(
    row.Atteikuma_iemesls ?? row.atteikuma_iemesls ?? row.komentars ?? row.Komentārs ?? ""
  ).trim();
}

async function fetchVeidsName(admin, typeId) {
  if (typeId == null) return "";
  const { data: v } = await admin
    .from("prombutnes_veidi")
    .select("name, type")
    .eq("id", typeId)
    .maybeSingle();
  if (!v) return "";
  return String(v.name ?? v.type ?? "").trim();
}

async function getFirstAdminOrManagerEmail(admin) {
  const { data: rows } = await admin.from("users").select("email, role, \"i-mail\", \"e-pasts\"");
  const list = Array.isArray(rows) ? rows : [];
  const normRole = (r) => String(r ?? "").trim().toLowerCase();
  const adminRow = list.find((u) => normRole(u.role) === "admin");
  const mgrRow = list.find((u) => normRole(u.role) === "manager");
  return pickUserEmailRow(adminRow || mgrRow);
}

async function callerCanApprove(admin, authUid) {
  const { data: u } = await admin.from("users").select("role").eq("id", authUid).maybeSingle();
  const role = String(u?.role ?? "").trim().toLowerCase();
  if (role === "manager" || role === "admin") return true;
  const { data: d } = await admin
    .from("pdd_deputy_state")
    .select("deputy_user_id, deputy_valid_from, deputy_valid_to")
    .eq("id", 1)
    .maybeSingle();
  if (!d?.deputy_user_id || d.deputy_user_id !== authUid) return false;
  const t = todayIsoDate();
  if (d.deputy_valid_from && t < String(d.deputy_valid_from)) return false;
  if (d.deputy_valid_to && t > String(d.deputy_valid_to)) return false;
  return true;
}

async function canCreateNotify(admin, jwtId, ownerId, jwtEmail) {
  if (!jwtId || !ownerId) return false;
  if (jwtId === ownerId) return true;
  const jwtEm = normLoose(String(jwtEmail || "").trim());
  if (jwtEm) {
    const { data: ownerRow } = await admin
      .from("users")
      .select("email, \"i-mail\", \"e-mail\", \"e-pasts\"")
      .eq("id", ownerId)
      .maybeSingle();
    const ownerEm = normLoose(pickUserEmailRow(ownerRow));
    if (ownerEm && jwtEm === ownerEm) return true;
  }
  const { data: u } = await admin.from("users").select("role").eq("id", jwtId).maybeSingle();
  const role = String(u?.role ?? "").trim().toLowerCase();
  return role === "manager" || role === "admin";
}

async function sendAdminApplicant(resend, from, adminEmail, applicantEmail, packAdmin, packApplicant) {
  const na = String(adminEmail || "").trim();
  const nb = String(applicantEmail || "").trim();
  const sent = [];
  if (na.includes("@") && nb.includes("@") && na.toLowerCase() === nb.toLowerCase()) {
    const { error } = await resend.emails.send({
      from,
      to: [na],
      subject: `${packApplicant.subject} · ${packAdmin.subject}`,
      html: `<div>${packApplicant.html}</div><hr/><div>${packAdmin.html}</div>`,
    });
    if (error) throw new Error(error.message || String(error));
    sent.push(na);
    return sent;
  }
  if (na.includes("@")) {
    const { error } = await resend.emails.send({
      from,
      to: [na],
      subject: packAdmin.subject,
      html: packAdmin.html,
    });
    if (error) throw new Error(error.message || String(error));
    sent.push(na);
  }
  if (nb.includes("@")) {
    const { error } = await resend.emails.send({
      from,
      to: [nb],
      subject: packApplicant.subject,
      html: packApplicant.html,
    });
    if (error) throw new Error(error.message || String(error));
    sent.push(nb);
  }
  return sent;
}

function normalizePhone(v) {
  return String(v ?? "").trim().replace(/\s+/g, "");
}

async function sendSmsIfConfigured({ toPhone, message }) {
  const to = normalizePhone(toPhone);
  if (!to) return { ok: false, skipped: true, reason: "missing_to_phone" };
  const sid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const token = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  const from = normalizePhone(process.env.TWILIO_FROM_NUMBER);
  if (!sid || !token || !from) {
    return { ok: false, skipped: true, reason: "twilio_not_configured" };
  }
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`;
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const body = new URLSearchParams({
    To: to,
    From: from,
    Body: String(message || "").slice(0, 1500),
  });
  const r = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  const txt = await r.text();
  let parsed = null;
  try {
    parsed = txt ? JSON.parse(txt) : null;
  } catch {
    parsed = txt;
  }
  if (!r.ok) {
    return { ok: false, skipped: false, reason: "twilio_error", details: parsed };
  }
  return { ok: true, sid: parsed?.sid || null };
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || "PDD <onboarding@resend.dev>";

  if (!supabaseUrl || !serviceKey) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }));
  }
  if (!resendKey) {
    res.statusCode = 503;
    return res.end(JSON.stringify({ error: "Missing RESEND_API_KEY" }));
  }

  const auth = String(req.headers.authorization || "");
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const jwt = m ? m[1].trim() : "";
  if (!jwt) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ error: "Nav Authorization: Bearer token" }));
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: userData, error: authErr } = await admin.auth.getUser(jwt);
  if (authErr || !userData?.user?.id) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ error: "Nederīgs sesijas tokens" }));
  }
  const jwtId = userData.user.id;
  const jwtEmail = String(userData.user.email || "").trim();

  let body = {};
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  } catch {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: "Nederīgs JSON" }));
  }

  const appBase = String(body.app_base_url || "").replace(/\/$/, "");
  const action = String(body.action || "");

  const resend = new Resend(resendKey);

  try {
    if (action === "cits_absence_created") {
      const absenceId = String(body.absence_id || "").trim();
      if (!absenceId) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: "Trūkst absence_id" }));
      }
      const { data: row, error: rErr } = await admin.from("prombutnes_dati").select("*").eq("id", absenceId).maybeSingle();
      if (rErr || !row) {
        res.statusCode = 404;
        return res.end(JSON.stringify({ error: "Ieraksts nav atrasts" }));
      }
      const ownerId = pickOwnerId(row);
      const okCreate = await canCreateNotify(admin, jwtId, ownerId, jwtEmail);
      if (!okCreate) {
        res.statusCode = 403;
        return res.end(JSON.stringify({ error: "Pieeja liegta" }));
      }
      const typeId = pickTypeId(row);
      const veidsName = await fetchVeidsName(admin, typeId);
      if (!isCitsTypeName(veidsName)) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: "Nav Cits veids" }));
      }
      const { data: applicantRow } = await admin.from("users").select("*").eq("id", ownerId).maybeSingle();
      const applicantEmail = pickUserEmailRow(applicantRow);
      const start = row.Sakuma_datums ?? row.sakuma_datums ?? row.start_date ?? "";
      const end = row.Beigu_datums ?? row.beigu_datums ?? row.end_date ?? "";
      const link = appBase ? `${appBase}?citsRow=${encodeURIComponent(absenceId)}` : "";
      const sent = await sendCitsPendingNotificationFromApi(resend, from, {
        start,
        end,
        link,
        applicantEmail,
      });
      const smsTo =
        String(body.notify_phone || "").trim() ||
        String(process.env.PDD_SMS_TEST_TO || "").trim();
      const sms = await sendSmsIfConfigured({
        toPhone: smsTo,
        message:
          `PDD: jauns "Cits" pieteikums (${start} - ${end}). ` +
          (link ? `Apstiprināšana: ${link}` : "Ieej PDD aplikācijā."),
      });
      res.statusCode = 200;
      return res.end(JSON.stringify({ ok: true, sent, sms }));
    }

    if (action === "cits_absence_decided") {
      const absenceId = String(body.absence_id || "").trim();
      const decision = String(body.decision || "").toLowerCase();
      if (!absenceId || (decision !== "approved" && decision !== "rejected")) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: "Trūkst absence_id vai decision" }));
      }
      if (!(await callerCanApprove(admin, jwtId))) {
        res.statusCode = 403;
        return res.end(JSON.stringify({ error: "Tikai vadītājs / admins / aizvietotājs" }));
      }
      const { data: row, error: rErr } = await admin.from("prombutnes_dati").select("*").eq("id", absenceId).maybeSingle();
      if (rErr || !row) {
        res.statusCode = 404;
        return res.end(JSON.stringify({ error: "Ieraksts nav atrasts" }));
      }
      const typeId = pickTypeId(row);
      const veidsName = await fetchVeidsName(admin, typeId);
      if (!isCitsTypeName(veidsName)) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: "Nav Cits veids" }));
      }
      const st = rowStatusNormalized(row);
      if (st !== decision) {
        res.statusCode = 409;
        return res.end(JSON.stringify({ error: "Statuss neatbilst — pārlādē un mēģini vēlreiz" }));
      }
      const ownerId = pickOwnerId(row);
      const adminEmail = await getFirstAdminOrManagerEmail(admin);
      const { data: applicantRow } = await admin.from("users").select("*").eq("id", ownerId).maybeSingle();
      const applicantEmail = pickUserEmailRow(applicantRow);
      const reason = decision === "rejected" ? String(body.reject_reason || pickRejectReason(row) || "") : "";
      const start = row.Sakuma_datums ?? row.sakuma_datums ?? row.start_date ?? "";
      const end = row.Beigu_datums ?? row.beigu_datums ?? row.end_date ?? "";

      const subApp =
        decision === "approved"
          ? "PDD: Cits pieteikums apstiprināts"
          : "PDD: Cits pieteikums noraidīts";
      const htmlApp =
        decision === "approved"
          ? `<p>Jūsu <strong>Cits</strong> pieteikums ir <strong>apstiprināts</strong>.</p><p>Periods: <strong>${start}</strong> — <strong>${end}</strong></p>`
          : `<p>Jūsu <strong>Cits</strong> pieteikums ir <strong>noraidīts</strong>.</p><p>Periods: <strong>${start}</strong> — <strong>${end}</strong></p>${reason ? `<p>Iemesls: ${reason.replace(/</g, "&lt;")}</p>` : ""}`;

      const subAdm =
        decision === "approved"
          ? "PDD: Cits apstiprināts (kopija)"
          : "PDD: Cits noraidīts (kopija)";
      const htmlAdm =
        decision === "approved"
          ? `<p><strong>Cits</strong> pieteikums apstiprināts.</p><p>Periods: <strong>${start}</strong> — <strong>${end}</strong></p>`
          : `<p><strong>Cits</strong> pieteikums noraidīts.</p><p>Periods: <strong>${start}</strong> — <strong>${end}</strong></p>${reason ? `<p>Iemesls: ${reason.replace(/</g, "&lt;")}</p>` : ""}`;

      const sent = await sendAdminApplicant(
        resend,
        from,
        adminEmail,
        applicantEmail,
        { subject: subAdm, html: htmlAdm },
        { subject: subApp, html: htmlApp }
      );
      res.statusCode = 200;
      return res.end(JSON.stringify({ ok: true, sent }));
    }

    if (action === "cits_token_approved_emails") {
      const token = String(body.token || "").trim();
      if (!token) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: "Trūkst token" }));
      }
      if (!(await callerCanApprove(admin, jwtId))) {
        res.statusCode = 403;
        return res.end(JSON.stringify({ error: "Tikai vadītājs / admins / aizvietotājs" }));
      }
      const { data: citsRow, error: cErr } = await admin
        .from("pdd_cits_requests")
        .select("*")
        .eq("approval_token", token)
        .maybeSingle();
      if (cErr || !citsRow) {
        res.statusCode = 404;
        return res.end(JSON.stringify({ error: "Pieprasījums nav atrasts" }));
      }
      if (citsRow.status !== "approved") {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: "Pieprasījums nav apstiprināts" }));
      }
      const managerEmail = String(citsRow.notify_email || "").trim();
      const { data: applicantRow } = await admin.from("users").select("*").eq("id", citsRow.user_id).maybeSingle();
      const applicantEmail = pickUserEmailRow(applicantRow);
      const start = citsRow.start_date ?? "";
      const end = citsRow.end_date ?? "";
      const htmlApp = `<p>Jūsu <strong>Cits</strong> pieprasījums ir <strong>apstiprināts</strong>.</p><p>Periods: <strong>${start}</strong> — <strong>${end}</strong></p>`;
      const htmlMgr = `<p><strong>Cits</strong> pieprasījums apstiprināts (paziņojums pieteicējam nosūtīts).</p><p>Periods: <strong>${start}</strong> — <strong>${end}</strong></p>`;
      const sent = await sendAdminApplicant(
        resend,
        from,
        managerEmail,
        applicantEmail,
        { subject: "PDD: Cits apstiprināts (kopija vadītājam)", html: htmlMgr },
        { subject: "PDD: Jūsu Cits pieprasījums apstiprināts", html: htmlApp }
      );
      res.statusCode = 200;
      return res.end(JSON.stringify({ ok: true, sent }));
    }

    res.statusCode = 400;
    return res.end(JSON.stringify({ error: "Nezināma action" }));
  } catch (e) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: String(e?.message || e) }));
  }
};
