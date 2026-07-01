/**
 * epasts_sazina.js
 *
 * Atsevišķs modulis prombūtnes "Cits" saskaņošanai ar e-pastiem.
 * Šis fails neiejaucas esošajās lapās/funkcijās.
 *
 * Stabilitāte: prombūtnes vēstures labošana/dzēšana un DB kolonnas — index.html;
 * šajā failā turpmāk labojam tikai e-pasta loģiku šim modulim.
 *
  * E-pasta sūtīšana produkcijā: `api/pdd-resend.js` (Resend, bez Edge Functions).
  * `onRequestCreated` šeit ir references modulis; sinhronizē ar šī API loģiku.
  */

  const APPROVAL_LINK = "https://irinakupcova.github.io/PDD_aplikacija/prombutnes-vesture";
  /** Obligātais saskaņotājs — Cits (ar vadītāja saskaņojumu). */
  const MANAGER_NOTIFY_EMAIL = "katrina.jurgensone@vid.gov.lv";
  const MANAGER_NOTIFY_COPY_EMAIL = "irina.kupcova@vid.gov.lv";
  const DEFAULT_FROM_VID = "PDD <prombutnes@vid.gov.lv>";

  function norm(v) {
    return String(v ?? "").trim().toLowerCase();
  }

  function normLoose(v) {
    return String(v ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function startsWithCits(veids) {
    return normLoose(veids).startsWith("cits");
  }
  function isAdminRole(role) {
    const r = normLoose(role);
    return r === "admin";
  }

function pickUserRole(user) {
  return user?.role ?? user?.Role ?? user?.ROLE ?? user?.lomas ?? user?.Lomas ?? user?.LOMAS ?? "";
}

function pickRequestStatus(req) {
  return req?.statuss ?? req?.Statuss ?? req?.status ?? "";
}

function pickRequestVeids(req) {
  return req?.veids ?? req?.Veids ?? req?.type ?? "";
}

function pickRequestUserId(req) {
  return req?.user_id ?? req?.["Vārds uzvārds"] ?? req?.userId ?? null;
}

function pickUserEmail(user) {
  if (!user || typeof user !== "object") return "";
  return String(user.email ?? user["i-mail"] ?? user["e-mail"] ?? user["e-pasts"] ?? "").trim();
}

async function getUserById(supabase, userId) {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

async function getFirstAdmin(supabase) {
  const { data, error } = await supabase
    .from("users")
    .select("*");
  if (error) throw new Error(error.message);
  const rows = Array.isArray(data) ? data : [];
  return rows.find((u) => isAdminRole(pickUserRole(u))) ?? null;
}

async function sendResendEmail(resend, { from, to, subject, text }) {
  const { error } = await resend.emails.send({
    from,
    to: Array.isArray(to) ? to : [to],
    subject,
    text,
  });
  if (error) throw new Error(error.message || "Neizdevās nosūtīt e-pastu.");
}

function uniqEmails(list) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(list) ? list : [list]) {
    const em = String(raw ?? "").trim().toLowerCase();
    if (!em || !em.includes("@") || seen.has(em)) continue;
    seen.add(em);
    out.push(em);
  }
  return out;
}

async function sendResendEmailStrict(resend, { from, to, subject, text }) {
  const recipients = uniqEmails(to);
  if (!recipients.length) throw new Error("Nav neviena derīga saņēmēja e-pasta.");
  const failed = [];
  for (const rcpt of recipients) {
    try {
      await sendResendEmail(resend, { from, to: rcpt, subject, text });
    } catch (e) {
      failed.push(`${rcpt}: ${String(e?.message || e)}`);
    }
  }
  if (failed.length) {
    throw new Error(`Neizdevās nosūtīt visiem saņēmējiem: ${failed.join("; ")}`);
  }
  return recipients;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function hrefAttr(u) {
  return String(u ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const DEFAULT_FROM = "PDD <prombutnes@vid.gov.lv>";

function resendErrText(error) {
  return String(error?.message || error || "").trim();
}

async function sendResendHtmlWithFallback(resend, { from, to, subject, html, text, cc }) {
  const toList = Array.isArray(to) ? to : [to];
  const base = { from: from || DEFAULT_FROM, to: toList, subject, html };
  if (text) base.text = text;
  const ccList = uniqEmails(Array.isArray(cc) ? cc : cc ? [cc] : []).filter(
    (em) => !toList.some((t) => norm(t) === norm(em)),
  );
  if (ccList.length) base.cc = ccList;

  const trySend = async (body) => {
    const { error, data } = await resend.emails.send(body);
    if (!error) return { ok: true, data };
    return { ok: false, error };
  };

  let out = await trySend(base);
  if (!out.ok && base.cc) {
    const errLo = resendErrText(out.error).toLowerCase();
    if (errLo.includes("domain") || errLo.includes("verified") || errLo.includes("only send")) {
      const retryBody = { ...base };
      delete retryBody.cc;
      const retry = await trySend(retryBody);
      if (retry.ok) return retry;
      out = retry;
    }
  }

  if (!out.ok) throw new Error(out.error?.message || "Neizdevās nosūtīt e-pastu.");
  return out;
}

async function sendResendHtml(resend, { from, to, subject, html }) {
  await sendResendHtmlWithFallback(resend, { from, to, subject, html });
}

/** Izsauc `api/pdd-resend.js` — tās pašas adreses kā `onRequestCreated`. */
async function sendCitsPendingNotificationFromApi(resend, fromEmail, { start, end, link = "", applicantEmail = "" }) {
  const safeStart = escapeHtml(start);
  const safeEnd = escapeHtml(end);
  const url = String(link || "").trim() || APPROVAL_LINK;
  const linkBlock = `<p><a href="${hrefAttr(url)}">Atvērt PDD — Prombūtnes vēsture</a></p>`;

  const htmlManager = `
    <p>Ir reģistrēts jauns <strong>Cits</strong> prombūtnes pieteikums (gaida apstiprinājumu).</p>
    <p>Periods: <strong>${safeStart}</strong> — <strong>${safeEnd}</strong></p>
    ${linkBlock}
  `;

  const managerSubject = "PDD: Cits — jauns pieteikums (gaida apstiprinājumu)";
  if (!MANAGER_NOTIFY_EMAIL.includes("@")) throw new Error("Nav saskaņotāja e-pasta.");

  const sent = [];
  await sendResendHtmlWithFallback(resend, {
    from: fromEmail,
    to: MANAGER_NOTIFY_EMAIL,
    cc: [MANAGER_NOTIFY_COPY_EMAIL],
    subject: managerSubject,
    html: htmlManager,
  });
  sent.push(MANAGER_NOTIFY_EMAIL);

  const appEm = String(applicantEmail || "").trim();
  const inNotifyList =
    norm(appEm) === norm(MANAGER_NOTIFY_EMAIL) || norm(appEm) === norm(MANAGER_NOTIFY_COPY_EMAIL);
  if (appEm.includes("@") && !inNotifyList) {
    const appUrl = String(link || "").trim() || APPROVAL_LINK;
    const htmlApp = `
      <p>Jūsu <strong>Cits</strong> pieteikums ir reģistrēts un nodots saskaņošanai.</p>
      <p>Periods: <strong>${safeStart}</strong> — <strong>${safeEnd}</strong></p>
      <p><a href="${hrefAttr(appUrl)}">Saite / atvērt sistēmā</a></p>
    `;
    await sendResendHtml(resend, {
      from: fromEmail,
      to: appEm,
      subject: "PDD: Jūsu Cits pieteikums nodots saskaņošanai",
      html: htmlApp,
    });
    sent.push(appEm);
  }
  return sent;
}

async function onRequestCreated({
  supabase,
  resend,
  requestId,
  veids,
  fromEmail = DEFAULT_FROM_VID,
}) {
  const { data: currentReq, error: curErr } = await supabase
    .from("prombutnes_dati")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  if (curErr) throw new Error(curErr.message);
  if (!currentReq) throw new Error("Pieteikums nav atrasts.");

  const currentStatus = norm(pickRequestStatus(currentReq));
  const effectiveVeids = String(veids ?? pickRequestVeids(currentReq) ?? "").trim();

  // statuss='pending' tikai tad, ja vēl nav uzstādīts pending.
  let req = currentReq;
  if (currentStatus !== "pending") {
    const { data: updatedReq, error: upErr } = await supabase
      .from("prombutnes_dati")
      .update({ statuss: "pending" })
      .eq("id", requestId)
      .select("*")
      .maybeSingle();
    if (upErr) throw new Error(upErr.message);
    if (!updatedReq) throw new Error("Pieteikums nav atrasts.");
    req = updatedReq;
  }

  if (!startsWithCits(effectiveVeids)) return { ok: true, notified: false };

  const userId = pickRequestUserId(req);
  const user = await getUserById(supabase, userId);
  const applicantEmail = pickUserEmail(user);
  
  await sendCitsPendingNotificationFromApi(resend, fromEmail, {
    start: req.sakums,
    end: req.beigas,
    link: APPROVAL_LINK,
    applicantEmail,
  });

  const warning = !applicantEmail
    ? "Pieteicēja e-pasts nav atrasts — kopija pārbaudei netika nosūtīta."
    : undefined;

  return {
    ok: true,
    notified: true,
    request: req,
    ...(warning ? { warning } : {}),
  };
}

async function approveRequest({
  supabase,
  resend,
  requestId,
  currentUserId,
  fromEmail = DEFAULT_FROM_VID,
}) {
  const actor = await getUserById(supabase, currentUserId);
  if (!actor || !isAdminRole(pickUserRole(actor))) throw new Error("Tikai admin drīkst apstiprināt.");

  const { data: req, error: updErr } = await supabase
    .from("prombutnes_dati")
    .update({
      statuss: "approved",
      approved_by: currentUserId,
    })
    .eq("id", requestId)
    .eq("statuss", "pending")
    .select("*")
    .maybeSingle();
  if (updErr) throw new Error(updErr.message);
  if (!req) throw new Error("Pieteikums nav atrasts.");

  const applicant = await getUserById(supabase, pickRequestUserId(req));
  const applicantMail = pickUserEmail(applicant);
  if (applicantMail) {
    await sendResendEmail(resend, {
      from: fromEmail,
      to: applicantMail,
      subject: "Jūsu pieteikums ir apstiprināts",
      text: "Jūsu prombūtnes pieteikums ir apstiprināts.",
    });
  }

  return { ok: true, request: req };
}

async function rejectRequest({
  supabase,
  resend,
  requestId,
  currentUserId,
  reason,
  fromEmail = DEFAULT_FROM_VID,
}) {
  const r = String(reason ?? "").trim();
  if (!r) throw new Error("Noraidīšanas iemesls ir obligāts.");

  const actor = await getUserById(supabase, currentUserId);
  if (!actor || !isAdminRole(pickUserRole(actor))) throw new Error("Tikai admin drīkst noraidīt.");

  const { data: req, error: updErr } = await supabase
    .from("prombutnes_dati")
    .update({
      statuss: "rejected",
      approved_by: currentUserId,
      komentars: r,
    })
    .eq("id", requestId)
    .eq("statuss", "pending")
    .select("*")
    .maybeSingle();
  if (updErr) throw new Error(updErr.message);
  if (!req) throw new Error("Pieteikums nav pending vai nav atrasts.");

  const applicant = await getUserById(supabase, pickRequestUserId(req));
  const applicantMail = pickUserEmail(applicant);
  if (applicantMail) {
    await sendResendEmail(resend, {
      from: fromEmail,
      to: applicantMail,
      subject: "Jūsu pieteikums ir noraidīts",
      text: `Jūsu prombūtnes pieteikums ir noraidīts.\n\nIemesls: ${r}`,
    });
  }

  return { ok: true, request: req };
}

function canShowActions({ currentUserRole, requestStatus }) {
  return isAdminRole(currentUserRole) && norm(requestStatus) === "pending";
}

function getHistoryActionConfig({ currentUserRole, requestStatus }) {
  const canShow = canShowActions({ currentUserRole, requestStatus });
  return {
    showApprove: canShow,
    showReject: canShow,
    approveButton: { label: "Apstiprināt", variant: "success", disabled: !canShow },
    rejectButton: { label: "Noraidīt", variant: "danger", disabled: !canShow },
  };
}

function getRejectModalConfig() {
  return {
    title: "Noraidīt pieteikumu",
    reasonField: {
      type: "textarea",
      required: true,
      placeholder: "Ievadiet noraidīšanas iemeslu",
    },
    submitLabel: "Apstiprināt noraidīšanu",
    cancelLabel: "Atcelt",
  };
}

module.exports = {
  APPROVAL_LINK,
  startsWithCits,
  onRequestCreated,
  sendCitsPendingNotificationFromApi,
  sendResendHtmlWithFallback,
  approveRequest,
  rejectRequest,
  canShowActions,
  getHistoryActionConfig,
  getRejectModalConfig,
};

