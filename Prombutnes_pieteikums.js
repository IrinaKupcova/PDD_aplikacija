/**
 * Prombūtnes pieteikums — palīgfunkcijas (Cits periods u.tml.).
 *
 * Darbinieku izvēlne un forma ir index.html → AbsenceRequestForm:
 * noklusējumā atlasīts pašreizējais lietotājs, pārējie no public.users, ja vajag cits.
 * Šis fails netiek obligāti ielādēts lapā; globālie palīgi zem window.PDD_CITS_PERIOD_HELPERS.
 */

function pad2(n) {
  const x = Number(n);
  return Number.isFinite(x) ? String(x).padStart(2, "0") : "";
}

function normalizeTimeLv(t) {
  if (!t) return "";
  if (typeof t === "string") {
    const s = String(t).trim();
    const m = /^(\d{1,2}):(\d{2})$/.exec(s);
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

// Universāls alias visiem prombūtnes veidiem (ne tikai "Cits").
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
};