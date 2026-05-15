/**
 * Prombūtnes pieteikums — palīgfunkcijas (Cits periods u.tml.).
 *
 * Darbinieku izvēlne un forma ir index.html → AbsenceRequestForm:
 * noklusējumā atlasīts pašreizējais lietotājs, pārējie no public.users, ja vajag cits.
 * Globālie palīgi: window.PDD_CITS_PERIOD_HELPERS un window.PDDPrombutnesVesture (kopīgi ar vesture).
 */

function pad2(n) {
  const x = Number(n);
  return Number.isFinite(x) ? String(x).padStart(2, "0") : "";
}

function normalizeTimeLv(t) {
  if (!t) return "";
  if (typeof t === "string") {
    const s = String(t).trim();
    const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s);
    if (m) return `${pad2(m[1])}:${pad2(m[2])}`;
    return s;
  }
  if (typeof t === "object") {
    const hh = pad2(t.hour ?? t.h ?? t.stundas);
    const mm = pad2(t.minute ?? t.m ?? t.minūtes);
    if (hh && mm) return `${hh}:${mm}`;
  }
  return String(t);
}

function buildCitsPeriodLabelLv({ allDay, fromTime, toTime }) {
  if (allDay === true) return "Visa diena";
  const fromLv = normalizeTimeLv(fromTime);
  const toLv = normalizeTimeLv(toTime);
  if (fromLv && toLv) return `Laikā no ${fromLv} līdz ${toLv}`;
  if (fromLv && !toLv) return `Laikā no ${fromLv}`;
  if (!fromLv && toLv) return `Laikā līdz ${toLv}`;
  return "";
}

function buildCitsCommentWithPeriodLv({ allDay, fromTime, toTime, comment }) {
  const label = buildCitsPeriodLabelLv({ allDay, fromTime, toTime });
  const c = String(comment ?? "").trim();
  if (label && c) return `${label} · ${c}`;
  if (label) return label;
  return c || null;
}

function buildPrombutnePeriodLabelLv({ allDay, fromTime, toTime }) {
  return buildCitsPeriodLabelLv({ allDay, fromTime, toTime });
}

function buildPrombutneCommentWithPeriodLv({ allDay, fromTime, toTime, comment }) {
  return buildCitsCommentWithPeriodLv({ allDay, fromTime, toTime, comment });
}

function sanitizeShortText(v) {
  return String(v ?? "").trim().slice(0, 300);
}

function sanitizeLongText(v) {
  return String(v ?? "").trim().slice(0, 2000);
}

function normalizeExtraFields(input) {
  const src = input && typeof input === "object" ? input : {};
  return {
    Mani_aizvieto: sanitizeShortText(src.Mani_aizvieto ?? src.mani_aizvieto ?? src.replaced_by ?? ""),
    Papildu_info: sanitizeLongText(src.Papildu_info ?? src.papildu_info ?? src.extra_info ?? ""),
  };
}

function mergeExtraFieldsIntoPayload(payload, extras) {
  const base = payload && typeof payload === "object" ? { ...payload } : {};
  const n = normalizeExtraFields(extras);
  return {
    ...base,
    Mani_aizvieto: n.Mani_aizvieto || null,
    Papildu_info: n.Papildu_info || null,
  };
}

function extractExtraFieldsFromRow(row) {
  const src = row && typeof row === "object" ? row : {};
  return normalizeExtraFields({
    Mani_aizvieto: src.Mani_aizvieto ?? src.mani_aizvieto ?? "",
    Papildu_info: src.Papildu_info ?? src.papildu_info ?? "",
  });
}

async function loadExtraFieldsFromSupabase({ supabase, requestId }) {
  if (!supabase) throw new Error("Nav Supabase klienta.");
  if (!requestId) throw new Error("Trūkst requestId.");
  const { data, error } = await supabase
    .from("prombutnes_dati")
    .select("id, Mani_aizvieto, Papildu_info")
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw new Error(error.message || "Neizdevās ielādēt papildu laukus.");
  if (!data) return { Mani_aizvieto: "", Papildu_info: "" };
  return extractExtraFieldsFromRow(data);
}

async function saveExtraFieldsToSupabase({ supabase, requestId, extras }) {
  if (!supabase) throw new Error("Nav Supabase klienta.");
  if (!requestId) throw new Error("Trūkst requestId.");
  const patch = mergeExtraFieldsIntoPayload({}, extras);
  const { data, error } = await supabase
    .from("prombutnes_dati")
    .update(patch)
    .eq("id", requestId)
    .select("id, Mani_aizvieto, Papildu_info")
    .maybeSingle();
  if (error) throw new Error(error.message || "Neizdevās saglabāt papildu laukus.");
  return extractExtraFieldsFromRow(data);
}

function getExtraFieldsDefinition() {
  return [
    {
      key: "Mani_aizvieto",
      label: "Mani aizvieto",
      type: "text",
      placeholder: "Norādi kolēģi, kurš aizvieto",
      maxLength: 300,
    },
    {
      key: "Papildu_info",
      label: "Papildu informācija, piem., Būšu pieejama telefoniski, vai Raksti man Whatsapp u.t.t.",
      type: "textarea",
      placeholder: "Papildu informācija",
      maxLength: 2000,
    },
  ];
}

/** UUID formāts (public.users.id). */
function isUuidLike(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v ?? "").trim());
}

function normLoose(v) {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function pickUserNameFromProfile(u) {
  if (!u || typeof u !== "object") return "";
  for (const k of ["Vārds uzvārds", "Vards uzvards", "full_name", "name", "display_name"]) {
    const s = String(u[k] ?? "").trim();
    if (s && !isUuidLike(s)) return s;
  }
  return "";
}

function pickUserEmailFromProfile(u) {
  if (!u || typeof u !== "object") return "";
  for (const k of ["e-pasts", "email", "i-mail", "e-mail"]) {
    const s = String(u[k] ?? "").trim();
    if (s.includes("@")) return s.toLowerCase();
  }
  return "";
}

/**
 * Kolonna „Vārds uzvārds” DB ir FK uz users.id — vienmēr saglabājam UUID, nevis vārdu.
 */
function dbUserRefForPrombutnesColumn({ userId, userName, columnName }) {
  const c = String(columnName ?? "").toLowerCase().trim();
  const id = String(userId ?? "").trim();
  const name = String(userName ?? "").trim();
  const isUserFkCol =
    c.includes("vārds") || c.includes("vards") || c.includes("darbin") || c.includes("user") || c.includes("uuid");
  if (isUserFkCol && id && isUuidLike(id)) return id;
  if (isUuidLike(id)) return id;
  if (isUuidLike(name)) return name;
  if (isUserFkCol && id) return id;
  if (name) return name;
  return id || name || null;
}

function findUserInMapByRef(pmap, ref) {
  const r = String(ref ?? "").trim();
  if (!r || !(pmap instanceof Map)) return null;
  if (pmap.has(r)) return pmap.get(r);
  if (isUuidLike(r)) return pmap.get(r) ?? null;
  const want = normLoose(r);
  for (const [id, u] of pmap.entries()) {
    if (normLoose(pickUserNameFromProfile(u)) === want) return u;
    if (normLoose(id) === want) return u;
  }
  return null;
}

/**
 * Pēc ielādes no DB — kalendāram un vēsturei vienmēr rāda vārdu, nevis UUID.
 */
function enrichAbsenceRow(r, pmap, ctx) {
  const row = r && typeof r === "object" ? r : {};
  const uidRaw = String(row.user_id ?? row["Vārds uzvārds"] ?? row["Vards uzvards"] ?? "").trim();
  const pmapLocal = pmap instanceof Map ? pmap : new Map();
  let employee = findUserInMapByRef(pmapLocal, uidRaw);
  const ctxName = String(ctx?.actorDisplayName ?? ctx?.fallbackName ?? "").trim();
  const ctxUid = String(ctx?.userId ?? "").trim();
  const ctxEmail = String(ctx?.sessionEmail ?? "").trim().toLowerCase();

  if (!employee && ctxUid && (uidRaw === ctxUid || normLoose(uidRaw) === normLoose(ctxName))) {
    employee = findUserInMapByRef(pmapLocal, ctxUid) ?? {
      id: ctxUid,
      full_name: ctxName,
      "Vārds uzvārds": ctxName,
    };
  }

  let displayName = employee ? pickUserNameFromProfile(employee) : "";
  if (!displayName || isUuidLike(displayName)) {
    const fromCol = String(row["Vārds uzvārds"] ?? row["Vards uzvards"] ?? "").trim();
    if (fromCol && !isUuidLike(fromCol)) displayName = fromCol;
  }
  if ((!displayName || isUuidLike(displayName)) && uidRaw && !isUuidLike(uidRaw)) {
    displayName = uidRaw;
  }
  if ((!displayName || isUuidLike(displayName)) && ctxName && uidRaw === ctxUid) {
    displayName = ctxName;
  }

  const resolvedId =
    (employee && String(employee.id ?? "").trim()) ||
    (isUuidLike(uidRaw) ? uidRaw : isUuidLike(ctxUid) ? ctxUid : uidRaw);

  const employeeOut = displayName
    ? {
        ...(employee && typeof employee === "object" ? employee : {}),
        id: resolvedId,
        full_name: displayName,
        "Vārds uzvārds": displayName,
      }
    : employee;

  return {
    ...row,
    user_id: isUuidLike(resolvedId) ? resolvedId : String(row.user_id ?? uidRaw).trim(),
    employee: employeeOut,
  };
}

function isOwnAbsenceRecord(a, ctx) {
  if (!a || typeof a !== "object") return false;
  const uid = String(ctx?.userId ?? "").trim();
  const rowUid = String(a.user_id ?? "").trim();
  if (uid && rowUid && rowUid === uid) return true;
  if (uid && isUuidLike(rowUid) && rowUid === uid) return true;

  const em = String(ctx?.sessionEmail ?? "").trim().toLowerCase();
  const ls = String(ctx?.localEmail ?? "").trim().toLowerCase();
  const wantEmail = em || ls;
  if (wantEmail && a?.employee) {
    const uem = pickUserEmailFromProfile(a.employee);
    if (uem && uem === wantEmail) return true;
  }

  const mine = String(ctx?.displayName ?? "").trim().toLowerCase();
  if (mine) {
    const empName = pickUserNameFromProfile(a.employee).toLowerCase();
    if (empName && empName === mine) return true;
    if (rowUid && normLoose(rowUid) === normLoose(mine)) return true;
  }

  return false;
}

function canDeleteAbsenceRecord(a, ctx) {
  if (ctx?.isAdmin) return true;
  return isOwnAbsenceRecord(a, ctx);
}

const PDD_PROMBUTNES_USER_HELPERS = {
  isUuidLike,
  dbUserRefForPrombutnesColumn,
  enrichAbsenceRow,
  isOwnAbsenceRecord,
  canDeleteAbsenceRecord,
  pickUserNameFromProfile,
};

window.PDD_CITS_PERIOD_HELPERS = {
  buildCitsPeriodLabelLv,
  buildCitsCommentWithPeriodLv,
  buildPrombutnePeriodLabelLv,
  buildPrombutneCommentWithPeriodLv,
  getExtraFieldsDefinition,
  normalizeExtraFields,
  mergeExtraFieldsIntoPayload,
  extractExtraFieldsFromRow,
  loadExtraFieldsFromSupabase,
  saveExtraFieldsToSupabase,
  ...PDD_PROMBUTNES_USER_HELPERS,
};

if (typeof window !== "undefined" && window.PDDPrombutnesVesture) {
  Object.assign(window.PDDPrombutnesVesture, PDD_PROMBUTNES_USER_HELPERS);
}
