/**
 * epasts_sazina.js
 *
 * Atsevišķs modulis prombūtnes "Cits" saskaņošanai ar e-pastiem.
 * Šis fails neiejaucas esošajās lapās/funkcijās.
 */

const APPROVAL_LINK = "https://irinakupcova.github.io/PDD_aplikacija/prombutnes-vesture";

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

async function onRequestCreated({
  supabase,
  resend,
  requestId,
  veids,
  fromEmail = "PDD <onboarding@resend.dev>",
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

  const admin = await getFirstAdmin(supabase);
  if (!admin?.email) return { ok: true, notified: false, warning: "Admin e-pasts nav atrasts." };

  await sendResendEmail(resend, {
    from: fromEmail,
    to: admin.email,
    subject: "Ir iesniegts jauns prombūtnes pieteikums (Cits)",
    text:
      "Ir iesniegts jauns prombūtnes pieteikums (Cits).\n\n" +
      `Atvērt sistēmā: ${APPROVAL_LINK}`,
  });

  return { ok: true, notified: true, request: req };
}

async function approveRequest({
  supabase,
  resend,
  requestId,
  currentUserId,
  fromEmail = "PDD <onboarding@resend.dev>",
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
  if (applicant?.email) {
    await sendResendEmail(resend, {
      from: fromEmail,
      to: applicant.email,
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
  fromEmail = "PDD <onboarding@resend.dev>",
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
  if (applicant?.email) {
    await sendResendEmail(resend, {
      from: fromEmail,
      to: applicant.email,
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
  approveRequest,
  rejectRequest,
  canShowActions,
  getHistoryActionConfig,
  getRejectModalConfig,
};

