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

function isAdminRole(role) {
  return norm(role) === "admin";
}

async function getUserById(supabase, userId) {
  const { data, error } = await supabase
    .from("users")
    .select("id, email, role")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

async function getFirstAdmin(supabase) {
  const { data, error } = await supabase
    .from("users")
    .select("id, email, role")
    .or("role.eq.admin,role.eq.Admin")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
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
  const { data: req, error: upErr } = await supabase
    .from("prombutnes_dati")
    .update({ statuss: "pending" })
    .eq("id", requestId)
    .select("id, user_id, statuss, veids")
    .maybeSingle();
  if (upErr) throw new Error(upErr.message);
  if (!req) throw new Error("Pieteikums nav atrasts.");

  const effectiveVeids = String(veids ?? req.veids ?? "").trim();
  if (norm(effectiveVeids) !== "cits") return { ok: true, notified: false };

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

  return { ok: true, notified: true };
}

async function approveRequest({
  supabase,
  resend,
  requestId,
  currentUserId,
  fromEmail = "PDD <onboarding@resend.dev>",
}) {
  const actor = await getUserById(supabase, currentUserId);
  if (!actor || !isAdminRole(actor.role)) throw new Error("Tikai admin drīkst apstiprināt.");

  const { data: req, error: updErr } = await supabase
    .from("prombutnes_dati")
    .update({
      statuss: "approved",
      approved_by: currentUserId,
    })
    .eq("id", requestId)
    .eq("statuss", "pending")
    .select("id, user_id, komentars, statuss")
    .maybeSingle();
  if (updErr) throw new Error(updErr.message);
  if (!req) throw new Error("Pieteikums nav pending vai nav atrasts.");

  const applicant = await getUserById(supabase, req.user_id);
  if (applicant?.email) {
    await sendResendEmail(resend, {
      from: fromEmail,
      to: applicant.email,
      subject: "Jūsu pieteikums ir apstiprināts",
      text: "Jūsu prombūtnes pieteikums ir apstiprināts.",
    });
  }

  return { ok: true };
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
  if (!actor || !isAdminRole(actor.role)) throw new Error("Tikai admin drīkst noraidīt.");

  const { data: req, error: updErr } = await supabase
    .from("prombutnes_dati")
    .update({
      statuss: "rejected",
      approved_by: currentUserId,
      komentars: r,
    })
    .eq("id", requestId)
    .eq("statuss", "pending")
    .select("id, user_id, komentars, statuss")
    .maybeSingle();
  if (updErr) throw new Error(updErr.message);
  if (!req) throw new Error("Pieteikums nav pending vai nav atrasts.");

  const applicant = await getUserById(supabase, req.user_id);
  if (applicant?.email) {
    await sendResendEmail(resend, {
      from: fromEmail,
      to: applicant.email,
      subject: "Jūsu pieteikums ir noraidīts",
      text: `Jūsu prombūtnes pieteikums ir noraidīts.\n\nIemesls: ${r}`,
    });
  }

  return { ok: true };
}

function canShowActions({ currentUserRole, requestStatus }) {
  return isAdminRole(currentUserRole) && norm(requestStatus) === "pending";
}

module.exports = {
  APPROVAL_LINK,
  onRequestCreated,
  approveRequest,
  rejectRequest,
  canShowActions,
};

