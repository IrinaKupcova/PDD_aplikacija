/**
 * IaD ieteikumu atbildīgo / līdzatbildīgo informēšana (mēneša atgādinājumi).
 * Strādā pārlūkā (scheduler) un kā Node skripts: node Informeshana.js
 *
 * Env (Node): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Opcija: PDD_APP_BASE_URL — saite uz aplikāciju (deep link pamats)
 * Opcija: PDD_EMAIL_DELIVERY=outlook|resend (noklusējums outlook — bez Resend domēna)
 * Resend (tikai ja PDD_EMAIL_DELIVERY=resend): RESEND_API_KEY, RESEND_FROM
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.PDD_INFORMESHANA = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const LS_SENT_KEY = "pdd_iad_reminder_sent_v1";
  const LS_RECIPIENTS_SNAPSHOT_KEY = "pdd_iad_recipients_snapshot_v1";
  const LS_INFORMESHANA_AUDIT_KEY = "pdd_iad_informeshana_audit_v1";
  const INFORMESHANA_AUDIT_MAX = 3000;
  const COL_INFORMESHANA_AUDIT = "Informesanas_auditu_vesture";
  const COL_INFORMESHANA_SANEMTAJI = "Informesanas_sanemtaji";
  const COL_INFORMESHANA_ATGADINAJUMI = "Informesanas_atgadinajumi";
  const IAD_TABLE_CANDIDATES = ["IAD", "iad", "Iad"];
  let resolvedIadTableCache = null;
  const DEFAULT_APP_BASE = "https://irinakupcova.github.io/PDD_aplikacija/";
  const FILE_SUPABASE_URL = "https://fdnkvecgqetmwilwolgt.supabase.co";
  const FILE_SUPABASE_ANON_KEY = "sb_publishable_wPrwQc6F0QVlnAubnhamJw_RuxtvtGo";
  const FILE_PDD_EMAIL_FN_URL = "https://fdnkvecgqetmwilwolgt.supabase.co/functions/v1/sendEmail";
  const FILE_PDD_IAD_EMAIL_FN_URL = "https://fdnkvecgqetmwilwolgt.supabase.co/functions/v1/sendIadEmail";
  /** CC uzraudzībai (tikai @vid.gov.lv). */
  const CONTROL_CC_EMAILS = ["irina.kupcova@vid.gov.lv"];
  const DEFAULT_RESEND_FROM = "PDD <prombutnes@vid.gov.lv>";
  const LS_EMAIL_DELIVERY_KEY = "pdd_email_delivery";
  const EMAIL_DELIVERY_OUTLOOK = "outlook";
  const EMAIL_DELIVERY_RESEND = "resend";

  function getEmailDeliveryMode() {
    if (typeof process !== "undefined" && process.env?.PDD_EMAIL_DELIVERY) {
      const v = String(process.env.PDD_EMAIL_DELIVERY).trim().toLowerCase();
      return v === EMAIL_DELIVERY_RESEND ? EMAIL_DELIVERY_RESEND : EMAIL_DELIVERY_OUTLOOK;
    }
    if (typeof localStorage !== "undefined") {
      const v = String(localStorage.getItem(LS_EMAIL_DELIVERY_KEY) || "").trim().toLowerCase();
      if (v === EMAIL_DELIVERY_RESEND) return EMAIL_DELIVERY_RESEND;
    }
    return EMAIL_DELIVERY_RESEND;
  }

  function usesOutlookComposeDelivery() {
    return getEmailDeliveryMode() === EMAIL_DELIVERY_OUTLOOK;
  }

  function toStr(v, max) {
    const s = String(v ?? "").trim();
    return max && s.length > max ? s.slice(0, max) : s;
  }

  function normEmail(v) {
    return String(v ?? "").trim().toLowerCase();
  }

  function isValidEmail(v) {
    const s = String(v ?? "").trim();
    return s.includes("@") && s.includes(".");
  }

  function uniqEmails(list) {
    const out = [];
    const seen = new Set();
    for (const raw of Array.isArray(list) ? list : [list]) {
      const em = normEmail(raw);
      if (!em || !isValidEmail(em) || seen.has(em)) continue;
      seen.add(em);
      out.push(em);
    }
    return out;
  }

  function statusLabel(v) {
    const s = String(v ?? "").trim().toLowerCase();
    if (!s) return "Aktīvs";
    if (["pabeigts", "realizēts", "realizets", "done", "completed"].includes(s)) return "Pabeigts";
    if (["atcelts", "cancelled", "canceled"].includes(s)) return "Atcelts";
    return String(v ?? "").trim();
  }

  function isInactiveStatus(v) {
    const s = statusLabel(v).toLowerCase();
    return s === "pabeigts" || s === "atcelts";
  }

  function parseNameList(v) {
    return String(v ?? "")
      .split(/[,\n;]+/)
      .map((x) => x.trim())
      .filter(Boolean);
  }

  function normalizeLookupText(v) {
    return String(v ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function teamUserDisplayName(u) {
    if (!u || typeof u !== "object") return "";
    return toStr(u["Vārds uzvārds"] ?? u.full_name ?? u.name ?? "");
  }

  function pickUserEmail(u) {
    if (!u || typeof u !== "object") return "";
    return toStr(u.email ?? u["i-mail"] ?? u["e-mail"] ?? u["e-pasts"] ?? "");
  }

  function resolvePersonName(value, users) {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    const list = Array.isArray(users) ? users : [];
    if (/^[0-9a-f-]{36}$/i.test(raw)) {
      const hit = list.find((u) => String(u?.id ?? u?.user_id ?? "").trim() === raw);
      if (hit) return teamUserDisplayName(hit) || raw;
    }
    const byName = list.find((u) => normalizeLookupText(teamUserDisplayName(u)) === normalizeLookupText(raw));
    if (byName) return teamUserDisplayName(byName);
    return raw;
  }

  function resolveEmailsForNames(names, teamUsers) {
    const list = Array.isArray(teamUsers) ? teamUsers : [];
    const emails = [];
    for (const nm of Array.isArray(names) ? names : []) {
      const name = String(nm ?? "").trim();
      if (!name) continue;
      const byId = list.find((u) => String(u?.id ?? "").trim() === name);
      const byName = list.find((u) => normalizeLookupText(teamUserDisplayName(u)) === normalizeLookupText(name));
      const hit = byId || byName;
      const em = pickUserEmail(hit);
      if (em) emails.push(em);
    }
    return uniqEmails(emails);
  }

  function collectRowRecipientEmails(row, teamUsers) {
    const names = collectRowRecipientPersons(row, teamUsers);
    return resolveEmailsForNames(names, teamUsers);
  }

  function collectRowRecipientPersons(row, teamUsers) {
    const atb = parseNameList(row?.Atbildigais).map((n) => resolvePersonName(n, teamUsers));
    const lidz = parseNameList(row?.Lidzatbildigais).map((n) => resolvePersonName(n, teamUsers));
    return [...new Set([...atb, ...lidz].filter(Boolean))];
  }

  function personNameKey(name) {
    return normalizeLookupText(String(name ?? ""));
  }

  function normalizeSnapshotPersons(list, teamUsers) {
    return [
      ...new Set(
        (Array.isArray(list) ? list : [])
          .map((item) => {
            const s = String(item ?? "").trim();
            if (!s) return "";
            if (s.includes("@")) {
              const hit = (Array.isArray(teamUsers) ? teamUsers : []).find(
                (u) => normEmail(pickUserEmail(u)) === normEmail(s)
              );
              return hit ? teamUserDisplayName(hit) : "";
            }
            return resolvePersonName(s, teamUsers) || s;
          })
          .filter(Boolean)
      ),
    ];
  }

  function mergeSavedRowIntoList(rows, savedRow) {
    if (!savedRow) return Array.isArray(rows) ? rows : [];
    const list = Array.isArray(rows) ? [...rows] : [];
    const key = rowStableId(savedRow);
    const idx = list.findIndex((r) => rowStableId(r) === key);
    if (idx >= 0) list[idx] = { ...list[idx], ...savedRow };
    else list.unshift(savedRow);
    return list;
  }

  function rowStableId(row) {
    const id = String(row?.id ?? "").trim();
    if (id) return `id:${id}`;
    const num = toStr(row?.IAD_numurs);
    const title = toStr(row?.IAD_nosaukums);
    return `k:${num}|${title}`;
  }

  function monthStamp(d) {
    const dt = d instanceof Date ? d : new Date();
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }

  function isFirstCalendarDay(d) {
    const dt = d instanceof Date ? d : new Date();
    return dt.getDate() === 1;
  }

  function getAppBaseUrl() {
    const fromGlobal = String(root.__PDD_APP_BASE_URL__ ?? root.PDD_APP_BASE_URL ?? "").trim();
    if (fromGlobal) return fromGlobal.replace(/\/+$/, "") + "/";
    if (typeof process !== "undefined" && process.env?.PDD_APP_BASE_URL) {
      return String(process.env.PDD_APP_BASE_URL).trim().replace(/\/+$/, "") + "/";
    }
    if (typeof window !== "undefined" && window.location?.origin) {
      try {
        const p = String(window.location.pathname || "/");
        const basePath = p.endsWith("/") ? p : p.replace(/\/[^/]*$/, "/");
        return `${window.location.origin}${basePath}`;
      } catch {
        /* ignore */
      }
    }
    return DEFAULT_APP_BASE;
  }

  function buildIadDeepLink(row) {
    const base = getAppBaseUrl().replace(/\/?$/, "");
    const params = new URLSearchParams();
    params.set("iadFocus", "1");
    const id = String(row?.id ?? "").trim();
    const numurs = toStr(row?.IAD_numurs);
    const nosaukums = toStr(row?.IAD_nosaukums);
    const tema = toStr(row?.IAD_ieteikuma_tema);
    if (id) params.set("iadId", id);
    if (numurs) params.set("iadNumurs", numurs);
    if (nosaukums) params.set("iadNosaukums", nosaukums);
    if (tema) params.set("iadTema", tema);
    params.set("iadList", isInactiveStatus(row?.IAD_statuss) ? "done" : "current");
    const key = String(row?.id ?? numurs ?? nosaukums ?? "").trim();
    if (key) params.set("iadKey", `iad:${key}`);
    return `${base}?${params.toString()}`;
  }

  function buildReminderText(row) {
    const numurs = toStr(row?.IAD_numurs) || "—";
    const nosaukums = toStr(row?.IAD_nosaukums) || "—";
    const tema = toStr(row?.IAD_ieteikuma_tema) || "—";
    return (
      `Atgādinājums par IaD Nr. ${numurs}, nosaukums ${nosaukums} ieteikuma ${tema} ieviešanu un izpildes termiņa ievērošanu. ` +
      "Jums tiek atsūtīts šis atgādinājums, jo esat piesaistīts ieteikuma izpildei kā atbildīgais/ līdzatbildīgais."
    );
  }

  function buildReminderSubject(row) {
    const numurs = toStr(row?.IAD_numurs) || "—";
    return `PDD: IaD atgādinājums Nr. ${numurs}`;
  }

  function buildWelcomeText(row) {
    const numurs = toStr(row?.IAD_numurs) || "—";
    const nosaukums = toStr(row?.IAD_nosaukums) || "—";
    const tema = toStr(row?.IAD_ieteikuma_tema) || "—";
    return (
      `Informācijai — Jūs tikāt pievienots vai norīkots kā atbildīgais/līdzatbildīgais par IaD Nr. ${numurs}, nosaukums ${nosaukums} ieteikuma ${tema} ieviešanu. ` +
      'Katru mēnesī (1. datumā, līdz brīdim, kad ieteikuma statuss tiks nomainīts uz "Pabeigts" vai "Atcelts") saņemsiet atgādinājumu par ieteikuma ieviešanu.'
    );
  }

  function buildWelcomeSubject(row) {
    const numurs = toStr(row?.IAD_numurs) || "—";
    return `PDD: Pievienots kā atbildīgais/līdzatbildīgais — IaD Nr. ${numurs}`;
  }

  function buildWelcomeHtml(row, url) {
    const text = buildWelcomeText(row);
    return `<!doctype html><html><body style="font-family:Segoe UI,Arial,sans-serif;line-height:1.45;color:#0f172a">
<p>${escapeHtml(text)}</p>
<p><a href="${escapeHtml(url)}" target="_blank" rel="noopener">Atvērt IaD ieteikumu aplikācijā</a></p>
</body></html>`;
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function buildReminderHtml(row, url) {
    const text = buildReminderText(row);
    return `<!doctype html><html><body style="font-family:Segoe UI,Arial,sans-serif;line-height:1.45;color:#0f172a">
<p>${escapeHtml(text)}</p>
<p><a href="${escapeHtml(url)}" target="_blank" rel="noopener">Atvērt IaD ieteikumu aplikācijā</a></p>
<p style="font-size:12px;color:#64748b">Saite atver konkrēto ierakstu tabulā ar izcelšanu.</p>
</body></html>`;
  }

  function parseControlCcCsv(raw) {
    return uniqEmails(
      String(raw ?? "")
        .split(/[,;]+/)
        .map((x) => x.trim())
        .filter(Boolean),
    );
  }

  function getControlCcEmails() {
    const fromEnv =
      typeof process !== "undefined" ? String(process.env.PDD_IAD_REMINDER_CONTROL_EMAIL || "").trim() : "";
    const fromGlobal = String(root.__PDD_IAD_REMINDER_CONTROL_EMAIL__ ?? "").trim();
    const raw = fromGlobal || fromEnv;
    if (raw) return parseControlCcCsv(raw);
    return [...CONTROL_CC_EMAILS];
  }

  function getControlMonitorEmail() {
    return getControlCcEmails()[0] || CONTROL_CC_EMAILS[0];
  }

  function getControlCcFor(to) {
    return getControlCcEmails().filter((em) => normEmail(em) !== normEmail(to));
  }

  function isControlMonitorRecipient(email) {
    const em = normEmail(email);
    return getControlCcEmails().some((c) => normEmail(c) === em);
  }

  function getRowDbId(row) {
    if (!row || typeof row !== "object") return "";
    const idAliases = ["id", "ID", "Id", "iad_id", "IAD_id", "IAD_ID", "IAD.id"];
    for (const k of idAliases) {
      const v = String(row[k] ?? "").trim();
      if (v) return v;
    }
    for (const k of Object.keys(row)) {
      if (/^iad[\s._-]*id$/i.test(String(k).replace(/\s/g, ""))) {
        const v = String(row[k] ?? "").trim();
        if (v) return v;
      }
    }
    return "";
  }

  function pickJsonField(row, aliases, fallback) {
    if (!row || typeof row !== "object") return fallback;
    for (const k of aliases) {
      if (Object.prototype.hasOwnProperty.call(row, k)) return row[k];
    }
    const norm = (v) =>
      String(v ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
    for (const key of Object.keys(row)) {
      if (aliases.some((a) => norm(a) === norm(key))) return row[key];
    }
    return fallback;
  }

  function parseJsonArray(raw) {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string" && raw.trim()) {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  function parseJsonObject(raw) {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
    if (typeof raw === "string" && raw.trim()) {
      try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
      } catch {
        return {};
      }
    }
    return {};
  }

  function readAuditFromIadRow(row) {
    return parseJsonArray(
      pickJsonField(row, [COL_INFORMESHANA_AUDIT, "informesanas_auditu_vesture"], [])
    );
  }

  function readSanemtajiFromIadRow(row) {
    return parseJsonArray(
      pickJsonField(row, [COL_INFORMESHANA_SANEMTAJI, "informesanas_sanemtaji"], [])
    );
  }

  function readAtgadinajumiFromIadRow(row) {
    return parseJsonObject(
      pickJsonField(row, [COL_INFORMESHANA_ATGADINAJUMI, "informesanas_atgadinajumi"], {})
    );
  }

  function applyInformeshanaFieldsToRow(row, fields) {
    if (!row || !fields || typeof fields !== "object") return row;
    if (fields[COL_INFORMESHANA_AUDIT] != null) row[COL_INFORMESHANA_AUDIT] = fields[COL_INFORMESHANA_AUDIT];
    if (fields[COL_INFORMESHANA_SANEMTAJI] != null) row[COL_INFORMESHANA_SANEMTAJI] = fields[COL_INFORMESHANA_SANEMTAJI];
    if (fields[COL_INFORMESHANA_ATGADINAJUMI] != null) {
      row[COL_INFORMESHANA_ATGADINAJUMI] = fields[COL_INFORMESHANA_ATGADINAJUMI];
    }
    return row;
  }

  async function resolveIadTableName(sb) {
    if (!sb) return null;
    if (resolvedIadTableCache) return resolvedIadTableCache;
    for (const t of IAD_TABLE_CANDIDATES) {
      try {
        const { error } = await sb.from(t).select("*").limit(1);
        if (!error) {
          resolvedIadTableCache = t;
          return t;
        }
      } catch {
        /* try next */
      }
    }
    return null;
  }

  async function fetchIadInformeshanaFields(sb, row) {
    const rowId = getRowDbId(row);
    if (!sb || !rowId) return null;
    const table = await resolveIadTableName(sb);
    if (!table) return null;
    const cols = `${COL_INFORMESHANA_AUDIT},${COL_INFORMESHANA_SANEMTAJI},${COL_INFORMESHANA_ATGADINAJUMI}`;
    const idCols = ["id", "IAD.id", "iad_id", "IAD_id", "IAD_ID"];
    for (const idCol of idCols) {
      try {
        const q =
          idCol === "IAD.id"
            ? await sb.from(table).select(cols).filter('"IAD.id"', "eq", rowId).maybeSingle()
            : await sb.from(table).select(cols).eq(idCol, rowId).maybeSingle();
        if (!q.error && q.data) return q.data;
      } catch {
        /* try next id column */
      }
    }
    return null;
  }

  async function patchIadInformesanasDirect(sb, row, patch) {
    const rowId = getRowDbId(row);
    if (!sb || !rowId) return { ok: false, reason: "missing_sb_or_row_id" };
    const table = await resolveIadTableName(sb);
    if (!table) return { ok: false, reason: "iad_table_not_found" };

    let current = row;
    try {
      const fresh = await fetchIadInformeshanaFields(sb, row);
      if (fresh) current = { ...row, ...fresh };
    } catch {
      /* ignore */
    }

    const payload = {};
    if (patch?.appendAudit) {
      payload[COL_INFORMESHANA_AUDIT] = [...readAuditFromIadRow(current), patch.appendAudit];
    }
    if (patch?.sanemtaji != null) payload[COL_INFORMESHANA_SANEMTAJI] = patch.sanemtaji;
    if (patch?.atgadinajumi != null) payload[COL_INFORMESHANA_ATGADINAJUMI] = patch.atgadinajumi;
    if (!Object.keys(payload).length) return { ok: false, reason: "empty_patch" };

    const selectCols = `${COL_INFORMESHANA_AUDIT},${COL_INFORMESHANA_SANEMTAJI},${COL_INFORMESHANA_ATGADINAJUMI}`;
    const idCols = ["id", "IAD.id", "iad_id", "IAD_id", "IAD_ID", "ID"];
    for (const idCol of idCols) {
      try {
        const req =
          idCol === "IAD.id"
            ? sb.from(table).update(payload).filter('"IAD.id"', "eq", rowId).select(selectCols).maybeSingle()
            : sb.from(table).update(payload).eq(idCol, rowId).select(selectCols).maybeSingle();
        const { data, error } = await req;
        if (!error && data) {
          applyInformeshanaFieldsToRow(row, data);
          return { ok: true, data, via: "direct_update" };
        }
      } catch {
        /* try next id column */
      }
    }
    return { ok: false, reason: "direct_update_failed" };
  }

  async function patchIadInformesanas(sb, row, patch) {
    const rowId = getRowDbId(row);
    if (!sb || !rowId) return { ok: false, reason: "missing_sb_or_row_id" };
    try {
      const { data, error } = await sb.rpc("pdd_iad_patch_informesanas", {
        p_row_id: rowId,
        p_append_audit: patch?.appendAudit ?? null,
        p_sanemtaji: patch?.sanemtaji ?? null,
        p_atgadinajumi: patch?.atgadinajumi ?? null,
      });
      if (!error && data?.ok) {
        applyInformeshanaFieldsToRow(row, data);
        return { ok: true, data, via: "rpc" };
      }
      if (error && typeof console !== "undefined" && console.warn) {
        console.warn("[PDD_INFORMESHANA] RPC patch", error.message || error);
      }
    } catch (e) {
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[PDD_INFORMESHANA] RPC patch exception", e);
      }
    }
    const direct = await patchIadInformesanasDirect(sb, row, patch);
    if (!direct.ok && typeof console !== "undefined" && console.warn) {
      console.warn("[PDD_INFORMESHANA] DB patch neizdevās", { rowId, reason: direct.reason });
    }
    return direct;
  }

  function makeInformeshanaAuditEntry({
    row,
    to,
    subject,
    text,
    kind,
    via,
    deliveryNote,
    actualTo,
    status,
    cc,
    reminderStamp,
  }) {
    const viaLabel = via || null;
    const resolvedStatus =
      status ||
      (viaLabel === "outlook_compose" || viaLabel === "supabase_queue" ? "prepared" : "sent");
    return {
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `audit_${Date.now()}_${Math.random()}`,
      pdd_kind: "iad_informeshana",
      sentAt: new Date().toISOString(),
      kind: kind || "inform",
      rowKey: rowStableId(row),
      rowId: String(row?.id ?? "").trim() || null,
      iadNumurs: toStr(row?.IAD_numurs),
      iadNosaukums: toStr(row?.IAD_nosaukums),
      to: String(to ?? "").trim(),
      actualTo: String(actualTo ?? "").trim() || null,
      deliveryNote: toStr(deliveryNote, 500) || null,
      subject: toStr(subject),
      text: toStr(text),
      via: viaLabel,
      status: resolvedStatus,
      cc: Array.isArray(cc) && cc.length ? uniqEmails(cc) : undefined,
      reminderStamp: reminderStamp || undefined,
    };
  }

  function readLocalInformeshanaAudit() {
    if (typeof localStorage === "undefined") return [];
    try {
      const raw = localStorage.getItem(LS_INFORMESHANA_AUDIT_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function appendLocalInformeshanaAudit(entry) {
    if (typeof localStorage === "undefined" || !entry) return;
    try {
      const list = readLocalInformeshanaAudit();
      list.unshift(entry);
      localStorage.setItem(LS_INFORMESHANA_AUDIT_KEY, JSON.stringify(list.slice(0, INFORMESHANA_AUDIT_MAX)));
    } catch {
      /* ignore */
    }
  }

  async function recordInformeshanaSend({
    row,
    to,
    subject,
    text,
    kind,
    via,
    deliveryNote,
    actualTo,
    status,
    cc,
    reminderStamp,
    supabase,
  }) {
    if (!isValidEmail(to)) return null;
    const entry = makeInformeshanaAuditEntry({
      row,
      to,
      subject,
      text,
      kind,
      via,
      deliveryNote,
      actualTo,
      status,
      cc,
      reminderStamp,
    });
    appendLocalInformeshanaAudit(entry);
    const sb = supabase || getSupabaseClientForBrowser();
    if (sb && row) {
      const patchResult = await patchIadInformesanas(sb, row, { appendAudit: entry });
      if (!patchResult?.ok && typeof console !== "undefined" && console.warn) {
        console.warn("[PDD_INFORMESHANA] auditācija nav saglabāta DB", patchResult);
      }
    }
    return entry;
  }

  function parseInformeshanaAuditDetails(raw) {
    if (!raw) return null;
    if (typeof raw === "object") return raw.pdd_kind === "iad_informeshana" ? raw : null;
    try {
      const parsed = JSON.parse(String(raw));
      return parsed?.pdd_kind === "iad_informeshana" ? parsed : null;
    } catch {
      return null;
    }
  }

  function normalizeInformeshanaAuditEntry(raw) {
    if (!raw || typeof raw !== "object") return null;
    const details = parseInformeshanaAuditDetails(raw.details);
    const merged = details ? { ...details, ...raw } : raw;
    const sentAt = merged.sentAt || merged.ts || merged.laiks || merged.created_at || null;
    const to = String(merged.to ?? "").trim();
    if (!sentAt || !to) return null;
    return {
      id: merged.id || `${sentAt}_${to}`,
      sentAt: String(sentAt),
      kind: merged.kind || "inform",
      rowKey: merged.rowKey || "",
      rowId: merged.rowId || null,
      iadNumurs: merged.iadNumurs || "",
      iadNosaukums: merged.iadNosaukums || "",
      to,
      subject: merged.subject || "",
      text: merged.text || "",
      via: merged.via || null,
      status: merged.status || "sent",
      cc: merged.cc,
      reminderStamp: merged.reminderStamp,
    };
  }

  function rowMatchesInformeshanaAudit(row, entry) {
    if (!row || !entry) return false;
    const rowId = String(row?.id ?? "").trim();
    if (rowId && entry.rowId && rowId === String(entry.rowId)) return true;
    if (rowStableId(row) === entry.rowKey) return true;
    const num = toStr(row?.IAD_numurs);
    const title = toStr(row?.IAD_nosaukums);
    if (num && entry.iadNumurs && num === entry.iadNumurs) {
      if (!title || !entry.iadNosaukums || title === entry.iadNosaukums) return true;
    }
    return false;
  }

  async function fetchInformeshanaAuditForRow(row, opts = {}) {
    const sb = opts.supabase || getSupabaseClientForBrowser();
    let sourceRow = row;
    if (sb && row) {
      try {
        const fresh = await fetchIadInformeshanaFields(sb, row);
        if (fresh) sourceRow = applyInformeshanaFieldsToRow({ ...row }, fresh);
      } catch {
        /* ignore */
      }
    }
    const fromIad = readAuditFromIadRow(sourceRow)
      .map(normalizeInformeshanaAuditEntry)
      .filter(Boolean)
      .filter((e) => rowMatchesInformeshanaAudit(row, e));
    const local = readLocalInformeshanaAudit()
      .map(normalizeInformeshanaAuditEntry)
      .filter(Boolean)
      .filter((e) => rowMatchesInformeshanaAudit(row, e));

    if (sb && row && local.length) {
      const dbIds = new Set(fromIad.map((e) => e.id));
      for (const entry of local) {
        if (dbIds.has(entry.id)) continue;
        const raw = readLocalInformeshanaAudit().find((x) => x?.id === entry.id);
        if (raw) {
          await patchIadInformesanas(sb, row, { appendAudit: raw });
          fromIad.push(entry);
          dbIds.add(entry.id);
        }
      }
    }

    const byId = new Map();
    for (const entry of [...fromIad, ...local]) byId.set(entry.id, entry);
    return Array.from(byId.values()).sort((a, b) => String(b.sentAt).localeCompare(String(a.sentAt)));
  }

  function informeshanaKindLabel(kind) {
    if (kind === "welcome") return "Pievienošanas informācija";
    if (kind === "reminder") return "Mēneša atgādinājums";
    return "Informēšana";
  }

  function readSentLog() {
    if (typeof localStorage === "undefined") return {};
    try {
      const raw = localStorage.getItem(LS_SENT_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeSentLog(log) {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(LS_SENT_KEY, JSON.stringify(log ?? {}));
    } catch {
      /* ignore */
    }
  }

  function wasReminderSent(row, rowKey, stamp) {
    const dbLog = readAtgadinajumiFromIadRow(row);
    const dbEntry = dbLog?.[stamp];
    if (dbEntry?.pending) return false;
    if (dbEntry) return true;
    const log = readSentLog();
    const localEntry = log?.[stamp]?.[rowKey];
    if (localEntry?.pending) return false;
    return Boolean(localEntry);
  }

  function hasReminderPending(row, stamp) {
    return Boolean(readAtgadinajumiFromIadRow(row)?.[stamp]?.pending);
  }

  async function markReminderPending(sb, row, rowKey, stamp, emails) {
    const payload = {
      pending: true,
      queuedAt: new Date().toISOString(),
      emails: Array.isArray(emails) ? emails : [],
    };
    const log = readSentLog();
    if (!log[stamp]) log[stamp] = {};
    log[stamp][rowKey] = payload;
    writeSentLog(log);
    if (sb && row) {
      const dbLog = { ...readAtgadinajumiFromIadRow(row), [stamp]: payload };
      try {
        await patchIadInformesanas(sb, row, { atgadinajumi: dbLog });
      } catch {
        /* ignore */
      }
    }
  }

  async function markReminderSent(sb, row, rowKey, stamp, emails) {
    const payload = {
      at: new Date().toISOString(),
      emails: Array.isArray(emails) ? emails : [],
    };
    const log = readSentLog();
    if (!log[stamp]) log[stamp] = {};
    log[stamp][rowKey] = payload;
    writeSentLog(log);
    if (sb && row) {
      const dbLog = { ...readAtgadinajumiFromIadRow(row), [stamp]: payload };
      try {
        await patchIadInformesanas(sb, row, { atgadinajumi: dbLog });
      } catch {
        /* ignore */
      }
    }
  }

  function readLocalRecipientsSnapshot() {
    if (typeof localStorage === "undefined") return {};
    try {
      const raw = localStorage.getItem(LS_RECIPIENTS_SNAPSHOT_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeLocalRecipientsSnapshot(snapshot) {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(LS_RECIPIENTS_SNAPSHOT_KEY, JSON.stringify(snapshot ?? {}));
    } catch {
      /* ignore */
    }
  }

  function readRecipientsSnapshot(rows, teamUsers) {
    const snap = { ...readLocalRecipientsSnapshot() };
    for (const row of Array.isArray(rows) ? rows : []) {
      const rowKey = rowStableId(row);
      const dbList = readSanemtajiFromIadRow(row);
      if (Array.isArray(dbList) && dbList.length) {
        snap[rowKey] = normalizeSnapshotPersons(dbList, teamUsers);
      }
    }
    for (const key of Object.keys(snap)) {
      snap[key] = normalizeSnapshotPersons(snap[key], teamUsers);
    }
    return snap;
  }

  function isInformeshanaBootstrap(rows, prevSnapshot, teamUsers) {
    const hasSnapshot = Object.values(prevSnapshot || {}).some(
      (list) => normalizeSnapshotPersons(list, teamUsers).length > 0
    );
    if (hasSnapshot) return false;
    const active = filterActiveIadRows(rows);
    if (!active.length) return true;
    return active.every((row) => !normalizeSnapshotPersons(readSanemtajiFromIadRow(row), teamUsers).length);
  }

  function finalizeSnapshotAfterWelcome(prevSnapshot, rows, teamUsers, newAssignments, results) {
    const snap = { ...(prevSnapshot && typeof prevSnapshot === "object" ? prevSnapshot : {}) };
    const seenKeys = new Set();
    for (const row of rows || []) {
      const rowKey = rowStableId(row);
      if (!rowKey) continue;
      seenKeys.add(rowKey);
      if (isInactiveStatus(row)) continue;
      const currentPersons = collectRowRecipientPersons(row, teamUsers);
      const rowNew = newAssignments.filter((x) => x.rowKey === rowKey);
      if (!rowNew.length) {
        snap[rowKey] = currentPersons;
        continue;
      }
      const allSucceeded = rowNew.every((item) => {
        if (!item.email) return false;
        return results.some(
          (r) =>
            r.rowKey === item.rowKey &&
            normEmail(r.email) === normEmail(item.email) &&
            r.ok &&
            !r.manual
        );
      });
      if (allSucceeded) snap[rowKey] = currentPersons;
    }
    for (const key of Object.keys(snap)) {
      if (!seenKeys.has(key)) delete snap[key];
    }
    return snap;
  }

  async function persistRecipientsSnapshot(sb, rows, snapshot) {
    writeLocalRecipientsSnapshot(snapshot);
    if (!sb) return;
    for (const row of filterActiveIadRows(rows)) {
      const rowKey = rowStableId(row);
      const emails = snapshot?.[rowKey];
      if (!Array.isArray(emails)) continue;
      try {
        await patchIadInformesanas(sb, row, { sanemtaji: emails });
      } catch {
        /* ignore */
      }
    }
  }

  function buildRecipientsSnapshot(rows, teamUsers, prevSnapshot = {}) {
    const snap = { ...(prevSnapshot && typeof prevSnapshot === "object" ? prevSnapshot : {}) };
    const seenKeys = new Set();
    for (const row of rows || []) {
      const rowKey = rowStableId(row);
      if (!rowKey) continue;
      seenKeys.add(rowKey);
      if (isInactiveStatus(row)) continue;
      snap[rowKey] = collectRowRecipientPersons(row, teamUsers);
    }
    for (const key of Object.keys(snap)) {
      if (!seenKeys.has(key)) delete snap[key];
    }
    return snap;
  }

  function detectNewAssignments(rows, teamUsers, prevSnapshot) {
    const newAssignments = [];
    for (const row of filterActiveIadRows(rows)) {
      const rowKey = rowStableId(row);
      const currentPersons = collectRowRecipientPersons(row, teamUsers);
      const prev = normalizeSnapshotPersons(prevSnapshot?.[rowKey], teamUsers);
      const prevSet = new Set(prev.map((name) => personNameKey(name)));
      for (const name of currentPersons) {
        if (prevSet.has(personNameKey(name))) continue;
        const emails = resolveEmailsForNames([name], teamUsers);
        if (emails.length) {
          for (const em of emails) {
            newAssignments.push({ row, email: em, name, rowKey });
          }
        } else {
          newAssignments.push({ row, email: null, name, rowKey, reason: "no_email_for_name" });
        }
      }
    }
    return { newAssignments };
  }

  function applyIadFocusFromUrl() {
    if (typeof window === "undefined") return false;
    try {
      const p = new URLSearchParams(window.location.search || "");
      if (p.get("iadFocus") !== "1") return false;
      const listKey = String(p.get("iadList") ?? "").trim().toLowerCase();
      root.__PDD_IAD_OPEN_TARGET__ = {
        submodule: "iad",
        listKey: listKey === "done" || listKey === "current" ? listKey : "",
        rowId: p.get("iadId") || null,
        rowNumurs: p.get("iadNumurs") || "",
        rowNosaukums: p.get("iadNosaukums") || "",
        rowTema: p.get("iadTema") || "",
        title: p.get("iadNosaukums") || "",
        subtitle: p.get("iadNumurs") || "",
        topic: p.get("iadTema") || "",
        key: p.get("iadKey") || "",
      };
      try {
        window.dispatchEvent(new CustomEvent("pdd:iad-focus-from-url"));
      } catch {
        /* ignore */
      }
      return true;
    } catch {
      return false;
    }
  }

  async function loadTeamUsers(sb) {
    const seen = new Map();
    const add = (u) => {
      if (!u || typeof u !== "object") return;
      const id = String(u?.id ?? u?.user_id ?? "").trim();
      const name = personNameKey(teamUserDisplayName(u));
      const em = normEmail(pickUserEmail(u));
      const key = id || name || em;
      if (!key) return;
      if (!seen.has(key)) seen.set(key, u);
    };
    try {
      for (const u of root.KOMANDA?.loadTeamUsers?.() ?? []) add(u);
    } catch {
      /* ignore */
    }
    if (sb) {
      try {
        const pu = await sb.from("users").select("*").order("Vārds uzvārds", { ascending: true });
        if (!pu.error) for (const u of pu.data ?? []) add(u);
      } catch {
        /* ignore */
      }
    }
    return [...seen.values()];
  }

  async function loadIadRows(sb) {
    if (root.IAD?.fetchIadRowsFromSupabase && sb) {
      try {
        return await root.IAD.fetchIadRowsFromSupabase(sb);
      } catch {
        /* fall through */
      }
    }
    if (root.IAD?.loadLocalRows) {
      try {
        return root.IAD.loadLocalRows();
      } catch {
        /* ignore */
      }
    }
    return [];
  }

  function filterActiveIadRows(rows) {
    return (Array.isArray(rows) ? rows : []).filter((r) => !isInactiveStatus(r?.IAD_statuss));
  }

  function getSupabaseClientForBrowser() {
    if (root.__PDD_SUPABASE__) return root.__PDD_SUPABASE__;
    return null;
  }

  async function getSupabaseClientForNode() {
    if (typeof process === "undefined") return null;
    const url = String(process.env.SUPABASE_URL || FILE_SUPABASE_URL).trim();
    const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "").trim();
    if (!url || !key) return null;
    try {
      const { createClient } = require("@supabase/supabase-js");
      return createClient(url, key);
    } catch {
      return null;
    }
  }

  function sanitizeHttpHeaderValue(s) {
    const t = String(s ?? "")
      .replace(/^\uFEFF/, "")
      .replace(/[\u200B-\u200D\uFEFF]/g, "");
    let out = "";
    for (let i = 0; i < t.length; i++) {
      const c = t.charCodeAt(i);
      if (c > 255 || c === 127 || (c < 32 && c !== 9)) continue;
      out += t[i];
    }
    return out.trim();
  }

  function getSendEmailFnUrl() {
    const fromGlobal = String(root.__PDD_EMAIL_FN_URL__ ?? "").trim();
    if (fromGlobal) return fromGlobal.replace(/\/+$/, "");
    const ls =
      typeof localStorage !== "undefined" ? String(localStorage.getItem("pdd_send_pdd_email_fn_url") || "").trim() : "";
    if (ls) return ls.replace(/\/+$/, "");
    return String(FILE_PDD_EMAIL_FN_URL).replace(/\/+$/, "");
  }

  function getIadEmailFnUrls() {
    const urls = [];
    const fromGlobal = String(root.__PDD_IAD_EMAIL_FN_URL__ ?? "").trim();
    if (fromGlobal) urls.push(fromGlobal.replace(/\/+$/, ""));
    if (typeof localStorage !== "undefined") {
      const ls = String(localStorage.getItem("pdd_iad_email_fn_url") || "").trim();
      if (ls) urls.push(ls.replace(/\/+$/, ""));
    }
    urls.push(String(FILE_PDD_IAD_EMAIL_FN_URL).replace(/\/+$/, ""));
    urls.push(getSendEmailFnUrl());
    return [...new Set(urls.filter(Boolean))];
  }

  function getAnonApiKey() {
    try {
      const sb = root.__PDD_SUPABASE__;
      const fromClient = String(sb?.supabaseKey ?? "").trim();
      if (fromClient) return sanitizeHttpHeaderValue(fromClient);
    } catch {
      /* ignore */
    }
    const fileKey = sanitizeHttpHeaderValue(FILE_SUPABASE_ANON_KEY);
    if (typeof localStorage !== "undefined") {
      const ls = sanitizeHttpHeaderValue(localStorage.getItem("pdd_supabase_anon_key") || "");
      if (ls.startsWith("eyJ") && ls.length >= 80) return ls;
      if (/^sb_/i.test(ls) && ls.length >= 30) return ls;
    }
    return fileKey;
  }

  async function getAccessTokenForInformeshana() {
    const sb = getSupabaseClientForBrowser();
    if (!sb?.auth?.getSession) return "";
    try {
      const { data } = await sb.auth.getSession();
      const t = sanitizeHttpHeaderValue(data?.session?.access_token || "");
      if (t.startsWith("eyJ")) return t;
    } catch {
      /* ignore */
    }
    return "";
  }

  /** Pārlūkā: Edge ar anon atslēgu. Node: RESEND_API_KEY. */
  function hasServerEmailChannel() {
    if (typeof window !== "undefined" && typeof document !== "undefined") {
      return Boolean(getAnonApiKey() && getIadEmailFnUrls().length > 0);
    }
    if (typeof process !== "undefined" && process.env) {
      return Boolean(String(process.env.RESEND_API_KEY || "").trim());
    }
    return Boolean(getAnonApiKey() && getIadEmailFnUrls().length > 0);
  }

  function buildOutlookComposeUrl({ to, cc, subject, body }) {
    const params = new URLSearchParams();
    const toList = uniqEmails(Array.isArray(to) ? to : to ? [to] : []).join(";");
    if (toList) params.set("to", toList);
    const ccList = uniqEmails(Array.isArray(cc) ? cc : cc ? [cc] : []).join(";");
    if (ccList) params.set("cc", ccList);
    const subj = String(subject ?? "").trim();
    if (subj) params.set("subject", subj);
    const bodyText = String(body ?? "");
    if (bodyText) params.set("body", bodyText);
    return `https://outlook.office.com/mail/deeplink/compose?${params.toString()}`;
  }

  function buildMailtoUrl({ to, cc, subject, body }) {
    const toList = uniqEmails(Array.isArray(to) ? to : to ? [to] : []);
    const ccList = uniqEmails(Array.isArray(cc) ? cc : cc ? [cc] : []);
    const addr = toList.join(",");
    const q = [];
    if (ccList.length) q.push(`cc=${encodeURIComponent(ccList.join(","))}`);
    const subj = String(subject ?? "").trim();
    if (subj) q.push(`subject=${encodeURIComponent(subj)}`);
    const bodyText = String(body ?? "");
    if (bodyText) q.push(`body=${encodeURIComponent(bodyText)}`);
    const qs = q.length ? `?${q.join("&")}` : "";
    return `mailto:${encodeURIComponent(addr)}${qs}`;
  }

  function openComposeInOutlook(opts) {
    const url = buildOutlookComposeUrl(opts);
    try {
      window.open(url, "_blank", "noopener,noreferrer");
      return true;
    } catch {
      try {
        window.location.href = buildMailtoUrl(opts);
        return true;
      } catch {
        return false;
      }
    }
  }

  function ensureEmailDraftStyles() {
    if (typeof document === "undefined" || document.getElementById("pdd-email-draft-styles")) return;
    const el = document.createElement("style");
    el.id = "pdd-email-draft-styles";
    el.textContent = `
      .pdd-email-draft-overlay {
        position: fixed; inset: 0; z-index: 2147483000;
        background: rgba(15, 23, 42, 0.55);
        display: flex; align-items: center; justify-content: center;
        padding: 1rem;
        pointer-events: auto;
      }
      .pdd-email-draft-card {
        position: relative; z-index: 2147483001;
        width: min(560px, 100%); max-height: 90vh; overflow: auto;
        background: var(--card, #fff); color: var(--text, #0f172a);
        border-radius: 12px; border: 1px solid var(--border, #e2e8f0);
        box-shadow: 0 20px 50px rgba(0,0,0,0.2); padding: 1rem 1.1rem;
        pointer-events: auto;
      }
      .pdd-email-draft-card h3 { margin: 0 0 0.5rem; font-size: 1.05rem; }
      .pdd-email-draft-hint {
        margin: 0 0 0.85rem; font-size: 0.88rem; color: var(--muted, #64748b); line-height: 1.45;
      }
      .pdd-email-draft-field { margin-bottom: 0.65rem; }
      .pdd-email-draft-field label {
        display: block; font-size: 0.78rem; font-weight: 600;
        color: var(--muted, #64748b); margin-bottom: 0.2rem;
      }
      .pdd-email-draft-field .val {
        font-size: 0.9rem; word-break: break-word;
      }
      .pdd-email-draft-textarea {
        width: 100%; min-height: 140px; resize: vertical;
        font-family: inherit; font-size: 0.88rem; line-height: 1.45;
        border: 1px solid var(--border, #e2e8f0); border-radius: 8px;
        padding: 0.5rem 0.6rem; box-sizing: border-box;
      }
      .pdd-email-draft-actions {
        display: flex; flex-wrap: wrap; gap: 0.45rem; margin-top: 0.85rem;
      }
      .pdd-email-draft-actions button {
        font: inherit; cursor: pointer; border-radius: 8px;
        padding: 0.45rem 0.75rem; border: 1px solid var(--border, #e2e8f0);
        background: var(--bg, #f8fafc);
      }
      .pdd-email-draft-actions button.primary {
        background: #1d4ed8; color: #fff; border-color: #1d4ed8;
      }
      .pdd-pending-compose-banner {
        position: fixed; left: 50%; bottom: 1rem; transform: translateX(-50%);
        z-index: 2147482000; width: min(640px, calc(100% - 1.5rem));
        background: #1e3a8a; color: #fff; border-radius: 12px;
        box-shadow: 0 12px 40px rgba(0,0,0,0.25); padding: 0.85rem 1rem;
        display: flex; flex-wrap: wrap; gap: 0.65rem; align-items: center;
      }
      .pdd-pending-compose-banner p {
        margin: 0; flex: 1 1 220px; font-size: 0.9rem; line-height: 1.4;
      }
      .pdd-pending-compose-banner .actions {
        display: flex; flex-wrap: wrap; gap: 0.45rem;
      }
      .pdd-pending-compose-banner button {
        font: inherit; cursor: pointer; border-radius: 8px;
        padding: 0.45rem 0.75rem; border: 1px solid rgba(255,255,255,0.35);
        background: rgba(255,255,255,0.12); color: #fff;
      }
      .pdd-pending-compose-banner button.primary {
        background: #fff; color: #1e3a8a; border-color: #fff;
      }
    `;
    document.head.appendChild(el);
  }

  async function copyTextToClipboard(text) {
    const s = String(text ?? "");
    try {
      await navigator.clipboard.writeText(s);
      return true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = s;
        ta.style.cssText = "position:fixed;left:-9999px;top:0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        return ok;
      } catch {
        return false;
      }
    }
  }

  function closeEmailDraftPanel() {
    if (typeof document === "undefined") return;
    document.getElementById("pdd-email-draft-overlay")?.remove();
  }

  function openEmailDraftPanel({ to, cc, subject, text, title, url, deliveryMode, onClose }) {
    if (typeof document === "undefined") return false;
    const addr = String(to ?? "").trim();
    if (!addr.includes("@")) return false;
    ensureEmailDraftStyles();

    const ccList = uniqEmails(Array.isArray(cc) ? cc : cc ? [cc] : []);
    const subj = String(subject ?? "").trim() || "PDD informēšana";
    const urlLine = String(url ?? "").trim();
    const body =
      String(text ?? "").trim() +
      (urlLine ? `\n\nAtvērt aplikācijā: ${urlLine}` : "");
    const outlookFirst = deliveryMode === EMAIL_DELIVERY_OUTLOOK || usesOutlookComposeDelivery();
    const composeOpts = { to: addr, cc: ccList, subject: subj, body };
    const fullForCopy = [
      `Kam: ${addr}`,
      ccList.length ? `Kopija: ${ccList.join(", ")}` : "",
      `Temats: ${subj}`,
      "",
      body,
    ]
      .filter((line, i, arr) => line || (i > 0 && arr[i - 1]))
      .join("\n");

    document.getElementById("pdd-email-draft-overlay")?.remove();

    const overlay = document.createElement("div");
    overlay.id = "pdd-email-draft-overlay";
    overlay.className = "pdd-email-draft-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");

    const card = document.createElement("div");
    card.className = "pdd-email-draft-card";
    card.addEventListener("click", (ev) => ev.stopPropagation());

    const h = document.createElement("h3");
    h.textContent = String(title ?? "").trim() || "E-pasta vēstule";
    card.appendChild(h);

    const hint = document.createElement("p");
    hint.className = "pdd-email-draft-hint";
    hint.textContent = outlookFirst
      ? "PDD sagatavoja vēstuli. Nospied „Atvērt Outlook”, pārbaudi adresātus un nosūti no sava VID konta."
      : "Automātiskā sūtīšana šoreiz neizdevās. Teksts ir sagatavots — nokopē un ielīmē savā e-pastā (Outlook, Copilot u.c.), tad nosūti.";
    card.appendChild(hint);

    function addField(label, value) {
      const wrap = document.createElement("div");
      wrap.className = "pdd-email-draft-field";
      const lb = document.createElement("label");
      lb.textContent = label;
      const val = document.createElement("div");
      val.className = "val";
      val.textContent = value;
      wrap.appendChild(lb);
      wrap.appendChild(val);
      card.appendChild(wrap);
    }

    addField("Kam", addr);
    if (ccList.length) addField("Kopija", ccList.join(", "));
    addField("Temats", subj);

    const taWrap = document.createElement("div");
    taWrap.className = "pdd-email-draft-field";
    const taLb = document.createElement("label");
    taLb.textContent = "Teksts";
    const ta = document.createElement("textarea");
    ta.className = "pdd-email-draft-textarea";
    ta.readOnly = true;
    ta.value = body;
    taWrap.appendChild(taLb);
    taWrap.appendChild(ta);
    card.appendChild(taWrap);

    const actions = document.createElement("div");
    actions.className = "pdd-email-draft-actions";

    const finishClose = () => {
      closeEmailDraftPanel();
      if (typeof onClose === "function") {
        try {
          onClose();
        } catch {
          /* ignore */
        }
      }
    };

    if (outlookFirst) {
      const outlookBtn = document.createElement("button");
      outlookBtn.type = "button";
      outlookBtn.className = "primary";
      outlookBtn.textContent = "Atvērt Outlook";
      outlookBtn.addEventListener("click", () => {
        openComposeInOutlook(composeOpts);
      });
      actions.appendChild(outlookBtn);

      const mailtoBtn = document.createElement("button");
      mailtoBtn.type = "button";
      mailtoBtn.textContent = "E-pasta programma";
      mailtoBtn.addEventListener("click", () => {
        try {
          window.location.href = buildMailtoUrl(composeOpts);
        } catch {
          /* ignore */
        }
      });
      actions.appendChild(mailtoBtn);
    }

    const copyAllBtn = document.createElement("button");
    copyAllBtn.type = "button";
    if (!outlookFirst) copyAllBtn.className = "primary";
    copyAllBtn.textContent = "Kopēt visu";
    copyAllBtn.addEventListener("click", async () => {
      const ok = await copyTextToClipboard(fullForCopy);
      copyAllBtn.textContent = ok ? "Nokopēts!" : "Neizdevās kopēt";
      setTimeout(() => {
        copyAllBtn.textContent = "Kopēt visu";
      }, 1800);
    });

    const copyBodyBtn = document.createElement("button");
    copyBodyBtn.type = "button";
    copyBodyBtn.textContent = "Kopēt tekstu";
    copyBodyBtn.addEventListener("click", async () => {
      const ok = await copyTextToClipboard(body);
      copyBodyBtn.textContent = ok ? "Nokopēts!" : "Neizdevās";
      setTimeout(() => {
        copyBodyBtn.textContent = "Kopēt tekstu";
      }, 1800);
    });

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "Aizvērt";
    closeBtn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      finishClose();
    });

    actions.appendChild(copyAllBtn);
    actions.appendChild(copyBodyBtn);
    actions.appendChild(closeBtn);
    card.appendChild(actions);

    overlay.appendChild(card);
    overlay.addEventListener("click", (ev) => {
      if (ev.target === overlay) finishClose();
    });
    const onEscape = (ev) => {
      if (ev.key === "Escape") {
        finishClose();
        document.removeEventListener("keydown", onEscape);
      }
    };
    document.addEventListener("keydown", onEscape);
    document.body.appendChild(overlay);
    return true;
  }

  function openIadMailtoFallback(opts) {
    return openEmailDraftPanel({
      ...opts,
      title: "IaD informēšana — nosūti e-pastu",
      deliveryMode: EMAIL_DELIVERY_OUTLOOK,
    });
  }

  function openEmailDraftQueue(items) {
    const list = (Array.isArray(items) ? items : []).filter((x) => x && String(x.to || "").includes("@"));
    if (!list.length) return false;
    let index = 0;
    const showNext = () => {
      if (index >= list.length) return;
      const item = list[index++];
      const remaining = list.length - index;
      openEmailDraftPanel({
        ...item,
        deliveryMode: EMAIL_DELIVERY_OUTLOOK,
        title:
          String(item.title || "IaD informēšana") +
          (remaining > 0 ? ` (${index}/${list.length})` : ""),
        onClose: remaining > 0 ? showNext : undefined,
      });
    };
    showNext();
    return true;
  }

  async function queuePendingComposeEmail({
    sb,
    row,
    to,
    subject,
    text,
    messageText,
    url,
    cc,
    kind,
    reminderStamp,
  }) {
    const email = String(to ?? "").trim();
    if (!isValidEmail(email)) return { ok: false, reason: "invalid_email" };
    const ccList = uniqEmails([...(Array.isArray(cc) ? cc : []), ...getControlCcFor(email)]);
    const entry = makeInformeshanaAuditEntry({
      row,
      to: email,
      subject,
      text: messageText || text,
      kind: kind || "inform",
      via: "supabase_queue",
      deliveryNote: "Gaida nosūtīšanu — atver PDD un nospied „Atvērt Outlook”.",
      status: "pending_compose",
      cc: ccList,
      reminderStamp,
    });
    appendLocalInformeshanaAudit(entry);
    if (sb && row) {
      await patchIadInformesanas(sb, row, { appendAudit: entry });
    }
    return { ok: true, via: "supabase_queue", pending: true, entry };
  }

  async function dispatchIadInformOutlookCompose({
    to,
    subject,
    text,
    html,
    url,
    row,
    cc,
    kind,
    messageText,
    supabase,
    autoOpen = true,
    reminderStamp,
  }) {
    const email = String(to ?? "").trim();
    if (!isValidEmail(email)) return { ok: false, reason: "invalid_email" };
    const ccList = uniqEmails([...(Array.isArray(cc) ? cc : []), ...getControlCcFor(email)]);
    const inBrowser = typeof window !== "undefined" && typeof document !== "undefined";

    if (inBrowser && autoOpen) {
      await recordInformeshanaSend({
        row,
        to: email,
        subject,
        text: messageText || text,
        kind,
        via: "outlook_compose",
        deliveryNote: "Sagatavots Outlook — pārbaudi un nosūti no sava VID konta.",
        status: "prepared",
        cc: ccList,
        reminderStamp,
        supabase,
      });
      return { ok: true, via: "outlook_compose", prepared: true };
    }

    const queued = await queuePendingComposeEmail({
      sb: supabase,
      row,
      to: email,
      subject,
      text,
      messageText,
      url,
      cc: ccList,
      kind,
      reminderStamp,
    });
    return { ok: true, via: "supabase_queue", prepared: true, pending: true, ...queued };
  }

  function collectPendingComposeFromRows(rows) {
    const items = [];
    for (const row of Array.isArray(rows) ? rows : []) {
      for (const raw of readAuditFromIadRow(row)) {
        if (String(raw?.status || "").trim() !== "pending_compose") continue;
        const entry = normalizeInformeshanaAuditEntry(raw);
        if (!entry) continue;
        items.push({ row, entry });
      }
    }
    return items;
  }

  function closePendingComposeBanner() {
    if (typeof document === "undefined") return;
    document.getElementById("pdd-pending-compose-banner")?.remove();
  }

  function showPendingComposeBanner(items, opts = {}) {
    if (typeof document === "undefined") return false;
    const list = (Array.isArray(items) ? items : []).filter((x) => x?.entry?.to);
    if (!list.length) {
      closePendingComposeBanner();
      return false;
    }
    ensureEmailDraftStyles();
    closePendingComposeBanner();

    const banner = document.createElement("div");
    banner.id = "pdd-pending-compose-banner";
    banner.className = "pdd-pending-compose-banner";
    banner.setAttribute("role", "status");

    const p = document.createElement("p");
    p.textContent = `PDD: ${list.length} informēšanas vēstule(s) gaida nosūtīšanu caur Outlook.`;
    banner.appendChild(p);

    const actions = document.createElement("div");
    actions.className = "actions";

    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "primary";
    openBtn.textContent = "Atvērt nākamo";
    openBtn.addEventListener("click", () => {
      const first = list[0];
      const entry = first.entry;
      const ccList = Array.isArray(entry.cc) ? entry.cc : [];
      const urlMatch = String(entry.text || "").match(/Atvērt aplikācijā:\s*(\S+)/);
      openEmailDraftPanel({
        to: entry.to,
        cc: ccList,
        subject: entry.subject,
        text: entry.text,
        title: informeshanaKindLabel(entry.kind),
        url: urlMatch ? urlMatch[1] : "",
        deliveryMode: EMAIL_DELIVERY_OUTLOOK,
        onClose: () => {
          if (typeof opts.onResolved === "function") {
            void opts.onResolved(first);
          }
        },
      });
    });
    actions.appendChild(openBtn);

    const dismissBtn = document.createElement("button");
    dismissBtn.type = "button";
    dismissBtn.textContent = "Vēlāk";
    dismissBtn.addEventListener("click", () => closePendingComposeBanner());
    actions.appendChild(dismissBtn);

    banner.appendChild(actions);
    document.body.appendChild(banner);
    return true;
  }

  async function refreshPendingComposeBanner(sb) {
    if (typeof window === "undefined" || !sb) return;
    const onResolved = async ({ row, entry }) => {
      const stamp = entry?.reminderStamp;
      if (stamp && row) {
        await markReminderSent(sb, row, rowStableId(row), stamp, [entry.to]);
      }
      await refreshPendingComposeBanner(sb);
    };
    try {
      const rows = await loadIadRows(sb);
      const pending = collectPendingComposeFromRows(rows);
      if (!pending.length) {
        closePendingComposeBanner();
        return;
      }
      showPendingComposeBanner(pending, { onResolved });
    } catch (e) {
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[PDD_INFORMESHANA] pending compose banner", e);
      }
    }
  }

  async function sendEmailViaPddResendApi({ to, subject, text, html, url, cc }) {
    const callApi = root.__PDD_CALL_PDD_RESEND_API__;
    if (typeof callApi !== "function") return { ok: false, reason: "no_pdd_resend_api" };
    try {
      const r = await callApi({
        action: "iad_informesana",
        to,
        subject,
        text,
        html,
        url,
        cc: Array.isArray(cc) ? cc : [],
      });
      if (r?.ok) return { ok: true, via: "pdd-resend-api", body: r.body };
      if (r?.skipped) return { ok: false, reason: r.reason || "pdd_resend_skipped", ...r };
      const errMsg = String(r?.body?.error || r?.error?.message || r?.error || "").trim();
      return { ok: false, reason: errMsg || "pdd_resend_failed", status: r?.status, body: r?.body, ...r };
    } catch (e) {
      return { ok: false, reason: "pdd_resend_exception", error: String(e?.message || e) };
    }
  }

  async function sendEmailViaResendHttp({ to, subject, text, html, cc }) {
    const apiKey =
      (typeof process !== "undefined" ? String(process.env.RESEND_API_KEY || "").trim() : "") ||
      String(root.__PDD_INFORMESHANA_RESEND_API_KEY__ ?? "").trim();
    const from =
      (typeof process !== "undefined" ? String(process.env.RESEND_FROM || "").trim() : "") ||
      String(root.__PDD_INFORMESHANA_RESEND_FROM__ ?? "").trim() ||
      DEFAULT_RESEND_FROM;
    if (!apiKey) return { ok: false, reason: "missing_resend_api_key" };

    const ccList = uniqEmails(Array.isArray(cc) ? cc : cc ? [cc] : []).filter((em) => normEmail(em) !== normEmail(to));
    const emailBody = {
      from,
      to: [to],
      subject,
      text,
      html,
    };
    if (ccList.length) emailBody.cc = ccList;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailBody),
    });
    const raw = await res.text();
    let body = null;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      body = { raw };
    }
    if (!res.ok) return { ok: false, reason: "resend_http_error", status: res.status, body };
    return { ok: true, via: "resend_http", body };
  }

  async function sendEmailViaSupabaseInvoke({ to, subject, text, html, url, cc, supabase }) {
    const sb = supabase || getSupabaseClientForBrowser();
    if (!sb?.functions?.invoke) return { ok: false, reason: "no_supabase_invoke" };

    const ccList = uniqEmails(Array.isArray(cc) ? cc : cc ? [cc] : []).filter((em) => normEmail(em) !== normEmail(to));
    const iadPayload = {
      to,
      subject,
      text,
      html,
      url,
      ...(ccList.length ? { cc: ccList } : {}),
    };
    const legacyPayload = {
      type: "iad_atgadinajums",
      ...iadPayload,
      name: text,
      veids: "IaD atgādinājums",
    };

    for (const [fnName, body] of [
      ["sendIadEmail", iadPayload],
      ["sendEmail", legacyPayload],
    ]) {
      try {
        const { data, error } = await sb.functions.invoke(fnName, { body });
        if (!error && data && (data.ok || data.success) && !data.skipped) {
          return { ok: true, via: `invoke_${fnName}`, body: data };
        }
      } catch {
        /* mēģina nākamo */
      }
    }
    return { ok: false, reason: "invoke_failed" };
  }

  async function sendEmailViaEdgeFunction({ to, subject, text, html, url, cc }) {
    const apiKey = sanitizeHttpHeaderValue(getAnonApiKey());
    if (!apiKey) return { ok: false, reason: "missing_fn_or_key" };

    const ccList = uniqEmails(Array.isArray(cc) ? cc : cc ? [cc] : []).filter((em) => normEmail(em) !== normEmail(to));
    const iadPayload = {
      to,
      subject,
      text,
      html,
      url,
      ...(ccList.length ? { cc: ccList } : {}),
    };
    const legacyPayload = {
      type: "iad_atgadinajums",
      to,
      subject,
      text,
      html,
      url,
      name: text,
      veids: "IaD atgādinājums",
      ...(ccList.length ? { cc: ccList } : {}),
    };

    const accessToken = await getAccessTokenForInformeshana();
    const bearerVariants = [apiKey];
    if (accessToken && accessToken !== apiKey) bearerVariants.push(accessToken);

    let lastFail = { ok: false, reason: "edge_skipped" };
    for (const fnUrl of getIadEmailFnUrls()) {
      const dedicated = /\/sendIadEmail$/i.test(fnUrl);
      const payload = dedicated ? iadPayload : legacyPayload;
      for (const bearer of bearerVariants) {
        try {
          const res = await fetch(fnUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: apiKey,
              Authorization: `Bearer ${bearer}`,
            },
            body: JSON.stringify(payload),
          });
          const raw = await res.text();
          let body = null;
          try {
            body = raw ? JSON.parse(raw) : null;
          } catch {
            body = { raw };
          }
          if (res.ok && body && (body.ok || body.success) && !body.skipped) {
            return { ok: true, via: dedicated ? "edge_sendIadEmail" : "edge_sendEmail", body, fnUrl };
          }
          if (body?.skipped && body?.reason === "not_cits" && typeof console !== "undefined" && console.warn) {
            console.warn(
              "[PDD_INFORMESHANA] sendEmail serverī nav IaD atbalsta (not_cits). Atjaunini sendEmail kodu vai izmanto Vercel pdd-resend (kā prombūtnēm).",
              fnUrl,
            );
          }
          if (
            String(body?.details?.message || body?.error || "").toLowerCase().includes("api key is invalid") &&
            typeof console !== "undefined" &&
            console.warn
          ) {
            console.warn(
              "[PDD_INFORMESHANA] Supabase Edge RESEND_API_KEY ir nederīga — atjaunini Supabase Edge Secrets.",
              fnUrl,
              body,
            );
          }
          lastFail = {
            ok: false,
            reason: body?.reason || body?.error || "edge_skipped",
            status: res.status,
            body,
            fnUrl,
          };
        } catch (e) {
          lastFail = { ok: false, reason: "edge_fetch_error", error: String(e?.message || e), fnUrl };
        }
      }
    }
    return lastFail;
  }

  function formatIadEmailFailure(viaEdge, viaPddApi, viaResend) {
    const parts = [];
    const edgeMsg = String(viaEdge?.body?.details?.message || viaEdge?.body?.error || viaEdge?.reason || "").trim();
    if (edgeMsg) parts.push(`Edge: ${edgeMsg}`);
    const pddMsg = String(viaPddApi?.body?.error || viaPddApi?.reason || "").trim();
    if (pddMsg && !/^(no_resend_api_url|pdd_resend_skipped|no_pdd_resend_api)$/i.test(pddMsg)) {
      parts.push(`API: ${pddMsg}`);
    }
    const resendMsg = String(viaResend?.body?.message || viaResend?.reason || "").trim();
    if (resendMsg && resendMsg !== "resend_http_skipped_browser") parts.push(`Resend: ${resendMsg}`);
    return parts.join(" · ") || "Nezināma kļūda";
  }

  function buildInformeshanaAlertMessage(detail, fails) {
    const d = String(detail || "");
    const dl = d.toLowerCase();
    const firstReason = String(fails?.[0]?.reason || "").toLowerCase();
    if (firstReason === "no_email_for_name" || dl.includes("no_email_for_name")) {
      return (
        "Komandas sarakstā nav atrasts šīs personas e-pasts.\n\n" +
        "Papildini e-pastu tabulā users (kolonna email / i-mail / e-mail) un mēģini vēlreiz."
      );
    }
    if (/api key is invalid/i.test(dl)) {
      return (
        "RESEND_API_KEY Supabase Edge ir nederīga.\n\n" +
        "1) Resend.com → API Keys → jauna atslēga\n" +
        "2) Supabase → Edge Functions → Secrets → RESEND_API_KEY\n" +
        "3) Actions → „Supabase Edge — sendEmail + Resend” → Run workflow"
      );
    }
    if (/only send testing emails/i.test(dl)) {
      return (
        "Resend: domēns vid.gov.lv vēl nav verificēts.\n" +
        "Verificē: resend.com/domains → iestati RESEND_FROM = PDD <prombutnes@vid.gov.lv> Supabase Secrets."
      );
    }
    if (/domain is not verified|not verified/i.test(dl)) {
      return (
        "Resend: domēns vid.gov.lv vēl nav verificēts.\n" +
        "Verificē resend.com/domains un RESEND_FROM = PDD <prombutnes@vid.gov.lv>."
      );
    }
    if (/edge_fetch_error|failed to fetch|all_channels_failed/i.test(dl)) {
      return (
        "Neizdevās sasniegt Supabase Edge funkciju no pārlūka.\n" +
        "Pārbaudi, vai sendIadEmail ir deployota, un mēģini Ctrl+F5."
      );
    }
    return "Automātiskā sūtīšana neizdevās. Skaties F12 → Console.";
  }

  async function dispatchIadInformEmail({ to, subject, text, html, url, row, cc, kind, messageText, supabase }) {
    const email = String(to ?? "").trim();
    if (!isValidEmail(email)) return { ok: false, reason: "invalid_email" };
    const ccList = uniqEmails([...(Array.isArray(cc) ? cc : []), ...getControlCcFor(email)]);

    if (usesOutlookComposeDelivery()) {
      return dispatchIadInformOutlookCompose({
        to: email,
        subject,
        text,
        html,
        url,
        row,
        cc: ccList,
        kind,
        messageText,
        supabase,
        autoOpen: typeof window !== "undefined" && typeof document !== "undefined",
      });
    }

    async function recordOk(viaResult, viaLabel) {
      await recordInformeshanaSend({
        row,
        to: email,
        subject,
        text: messageText || text,
        kind,
        via: viaLabel || viaResult.via || "unknown",
        supabase,
      });
      return viaResult;
    }

    const customPayload = {
      to: email,
      subject,
      text,
      html,
      url,
      row,
      cc: ccList,
      kind: kind || "inform",
    };
    const inBrowser = typeof window !== "undefined" && typeof document !== "undefined";

    const viaPddApiEarly = await sendEmailViaPddResendApi({
      to: email,
      subject,
      text,
      html,
      url,
      cc: ccList,
    });
    if (viaPddApiEarly.ok) return recordOk(viaPddApiEarly, viaPddApiEarly.via || "pdd-resend-api");

    let viaCustom = null;
    if (inBrowser && typeof root.PDD_INFORMESHANA_SEND_EMAIL__ === "function") {
      try {
        const custom = await root.PDD_INFORMESHANA_SEND_EMAIL__(customPayload);
        viaCustom = custom;
        if (custom?.ok) return recordOk(custom, custom.via || "custom");
      } catch (e) {
        viaCustom = { ok: false, reason: "custom_hook_exception", error: String(e?.message || e) };
        console.warn("[PDD_INFORMESHANA] custom hook error", e);
      }
    }

    const viaEdge = await sendEmailViaEdgeFunction({ to: email, subject, text, html, url, cc: ccList });
    if (viaEdge.ok) return recordOk(viaEdge, viaEdge.via || "edge_sendEmail");

    const sbClient = supabase || getSupabaseClientForBrowser();
    const viaInvoke = await sendEmailViaSupabaseInvoke({
      to: email,
      subject,
      text,
      html,
      url,
      cc: ccList,
      supabase: sbClient,
    });
    if (viaInvoke.ok) return recordOk(viaInvoke, viaInvoke.via || "invoke");

    if (!inBrowser && typeof root.PDD_INFORMESHANA_SEND_EMAIL__ === "function") {
      try {
        const custom = await root.PDD_INFORMESHANA_SEND_EMAIL__(customPayload);
        if (custom?.ok) return recordOk(custom, custom.via || "custom");
      } catch (e) {
        console.warn("[PDD_INFORMESHANA] custom hook error", e);
      }
    }

    const viaPddApi = await sendEmailViaPddResendApi({
      to: email,
      subject,
      text,
      html,
      url,
      cc: ccList,
    });
    if (viaPddApi.ok) return recordOk(viaPddApi, viaPddApi.via || "pdd-resend-api");

    const viaResend = inBrowser
      ? { ok: false, reason: "resend_http_skipped_browser" }
      : await sendEmailViaResendHttp({ to: email, subject, text, html, cc: ccList });
    if (viaResend.ok) return recordOk(viaResend, viaResend.via || "resend_http");

    const failReason = formatIadEmailFailure(viaCustom || viaEdge, viaPddApi, viaResend);
    if (typeof console !== "undefined" && console.error) {
      console.error("[PDD_INFORMESHANA] automātiskā sūtīšana neizdevās:", failReason, {
        to: email,
        edge: viaEdge,
        pddApi: viaPddApi,
        resend: viaResend,
      });
    }

    return {
      ok: false,
      reason: failReason,
      edge: viaCustom?.body ? viaCustom : viaEdge,
      pddApi: viaPddApi,
      resend: viaResend,
      custom: viaCustom,
    };
  }

  async function sendIadReminderEmail({ to, row, url, supabase }) {
    const email = String(to ?? "").trim();
    if (!isValidEmail(email)) return { ok: false, reason: "invalid_email" };
    const subject = buildReminderSubject(row);
    const messageText = buildReminderText(row);
    const text = `${messageText}\n\nAtvērt aplikācijā: ${url}`;
    const html = buildReminderHtml(row, url);
    return dispatchIadInformEmail({
      to: email,
      subject,
      text,
      html,
      url,
      row,
      kind: "reminder",
      messageText,
      supabase,
    });
  }

  function assignmentPersonsSignature(row, teamUsers) {
    return collectRowRecipientPersons(row, teamUsers)
      .map((name) => personNameKey(name))
      .sort()
      .join("|");
  }

  function collectRolePersons(row, teamUsers, role) {
    const raw = role === "lidz" ? row?.Lidzatbildigais : row?.Atbildigais;
    return parseNameList(raw)
      .map((n) => resolvePersonName(n, teamUsers))
      .filter(Boolean);
  }

  function assignmentRoleSignature(row, teamUsers) {
    const atb = collectRolePersons(row, teamUsers, "atbild");
    const lidz = collectRolePersons(row, teamUsers, "lidz");
    const part = (list) => list.map((n) => personNameKey(n)).join("\u241f");
    return `${part(atb)}::${part(lidz)}`;
  }

  function collectNewAssignmentPersons(previousRow, savedRow, teamUsers) {
    const prevAtb = collectRolePersons(previousRow || {}, teamUsers, "atbild");
    const prevLidz = collectRolePersons(previousRow || {}, teamUsers, "lidz");
    const nextAtb = collectRolePersons(savedRow, teamUsers, "atbild");
    const nextLidz = collectRolePersons(savedRow, teamUsers, "lidz");
    const prevAtbSet = new Set(prevAtb.map((n) => personNameKey(n)));
    const prevLidzSet = new Set(prevLidz.map((n) => personNameKey(n)));
    const out = [];
    const seen = new Set();
    const push = (name) => {
      const k = personNameKey(name);
      if (!k || seen.has(k)) return;
      seen.add(k);
      out.push(name);
    };
    for (const name of nextAtb) {
      if (!prevAtbSet.has(personNameKey(name))) push(name);
    }
    for (const name of nextLidz) {
      if (!prevLidzSet.has(personNameKey(name))) push(name);
    }
    return out;
  }

  function assignmentFieldsChanged(previousRow, savedRow, teamUsers) {
    if (!savedRow) return false;
    if (!previousRow) {
      return collectRowRecipientPersons(savedRow, teamUsers).length > 0;
    }
    return assignmentRoleSignature(previousRow, teamUsers) !== assignmentRoleSignature(savedRow, teamUsers);
  }

  function buildWelcomeAssignmentsForPersons(row, persons, teamUsers) {
    const rowKey = rowStableId(row);
    const items = [];
    for (const name of Array.isArray(persons) ? persons : []) {
      const emails = resolveEmailsForNames([name], teamUsers);
      if (emails.length) {
        for (const em of emails) items.push({ row, email: em, name, rowKey });
      } else {
        items.push({ row, email: null, name, rowKey, reason: "no_email_for_name" });
      }
    }
    return items;
  }

  async function sendWelcomeAssignmentBatch(items, sb) {
    const results = [];
    const inBrowser = typeof window !== "undefined" && typeof document !== "undefined";
    const outlookMode = usesOutlookComposeDelivery();
    const draftQueue = [];

    for (const item of items) {
      if (!item.email) {
        results.push({
          rowKey: item.rowKey,
          name: item.name,
          ok: false,
          reason: item.reason || "no_email_for_name",
        });
        continue;
      }
      const url = buildIadDeepLink(item.row);
      const subject = buildWelcomeSubject(item.row);
      const messageText = buildWelcomeText(item.row);
      const text = `${messageText}\n\nAtvērt aplikācijā: ${url}`;
      const html = buildWelcomeHtml(item.row, url);

      if (outlookMode && inBrowser && items.length > 1) {
        const r = await dispatchIadInformOutlookCompose({
          to: item.email,
          subject,
          text,
          html,
          url,
          row: item.row,
          kind: "welcome",
          messageText,
          supabase: sb,
          autoOpen: false,
        });
        draftQueue.push({
          to: item.email,
          cc: getControlCcFor(item.email),
          subject,
          text: messageText,
          title: "IaD pievienošana — nosūti e-pastu",
          url,
        });
        results.push({ rowKey: item.rowKey, email: item.email, name: item.name, ...r });
        continue;
      }

      const r = await sendIadWelcomeEmail({ to: item.email, row: item.row, url, supabase: sb });
      results.push({
        rowKey: item.rowKey,
        email: item.email,
        name: item.name,
        ...r,
      });
    }

    return results;
  }

  async function syncInformeshanaRowMeta(sb, row, teamUsers) {
    if (!sb || !row) return;
    const persons = collectRowRecipientPersons(row, teamUsers);
    if (!persons.length) return;
    await patchIadInformesanas(sb, row, { sanemtaji: persons });
  }

  async function runWelcomeOnRowSave(opts) {
    const sb =
      opts?.supabase ||
      (typeof process !== "undefined" ? await getSupabaseClientForNode() : getSupabaseClientForBrowser());
    const teamUsers = await loadTeamUsers(sb);
    const savedRow = opts?.savedRow;
    const previousRow = opts?.previousRow || null;

    if (!savedRow || isInactiveStatus(savedRow?.IAD_statuss)) {
      return { ok: true, skipped: true, reason: "inactive_or_missing_row", count: 0, results: [] };
    }

    await syncInformeshanaRowMeta(sb, savedRow, teamUsers);

    if (!assignmentFieldsChanged(previousRow, savedRow, teamUsers)) {
      return { ok: true, skipped: true, reason: "assignment_unchanged", count: 0, results: [] };
    }

    const newPersons = collectNewAssignmentPersons(previousRow, savedRow, teamUsers);
    if (!newPersons.length) {
      return { ok: true, skipped: true, reason: "no_new_assignment_persons", count: 0, results: [] };
    }

    const newAssignments = buildWelcomeAssignmentsForPersons(savedRow, newPersons, teamUsers);
    if (typeof console !== "undefined" && console.info) {
      console.info("[PDD_INFORMESHANA] mainīts atbildīgais/līdzatbildīgais — automātiska pievienošanas vēstule", {
        rowKey: rowStableId(savedRow),
        persons: newPersons,
      });
    }

    const results = await sendWelcomeAssignmentBatch(newAssignments, sb);
    const rows = mergeSavedRowIntoList(await loadIadRows(sb), savedRow);
    const prevSnapshot = readRecipientsSnapshot(rows, teamUsers);
    const nextSnapshot = finalizeSnapshotAfterWelcome(
      prevSnapshot,
      rows,
      teamUsers,
      newAssignments,
      results
    );
    await persistRecipientsSnapshot(sb, rows, nextSnapshot);

    const sent = results.filter((r) => r.ok).length;
    const fails = results.filter((r) => !r.ok);
    if (fails.length && typeof console !== "undefined" && console.warn) {
      console.warn("[PDD_INFORMESHANA] daļa vēstuļu netika nosūtīta", fails);
    }

    return { ok: true, count: newAssignments.length, sent, results, via: "row_save" };
  }

  async function sendIadWelcomeEmail({ to, row, url, supabase }) {
    const email = String(to ?? "").trim();
    if (!isValidEmail(email)) return { ok: false, reason: "invalid_email" };
    const subject = buildWelcomeSubject(row);
    const messageText = buildWelcomeText(row);
    const text = `${messageText}\n\nAtvērt aplikācijā: ${url}`;
    const html = buildWelcomeHtml(row, url);
    return dispatchIadInformEmail({
      to: email,
      subject,
      text,
      html,
      url,
      row,
      kind: "welcome",
      messageText,
      supabase,
    });
  }

  async function runAssignmentWelcomeEmails(opts) {
    if (opts?.afterSave && opts?.savedRow) {
      return runWelcomeOnRowSave(opts);
    }

    const sb =
      opts?.supabase ||
      (typeof process !== "undefined" ? await getSupabaseClientForNode() : getSupabaseClientForBrowser());

    const teamUsers = await loadTeamUsers(sb);
    let rows = await loadIadRows(sb);
    if (opts?.savedRow) rows = mergeSavedRowIntoList(rows, opts.savedRow);

    const prevSnapshot = readRecipientsSnapshot(rows, teamUsers);

    if (!opts?.forceWelcome && isInformeshanaBootstrap(rows, prevSnapshot, teamUsers)) {
      const nextSnapshot = buildRecipientsSnapshot(rows, teamUsers, prevSnapshot);
      await persistRecipientsSnapshot(sb, rows, nextSnapshot);
      return { ok: true, skipped: true, reason: "bootstrap_snapshot", count: 0, results: [] };
    }

    const { newAssignments } = detectNewAssignments(rows, teamUsers, prevSnapshot);
    const results = await sendWelcomeAssignmentBatch(newAssignments, sb);

    const nextSnapshot = finalizeSnapshotAfterWelcome(
      prevSnapshot,
      rows,
      teamUsers,
      newAssignments,
      results
    );
    await persistRecipientsSnapshot(sb, rows, nextSnapshot);
    return { ok: true, count: newAssignments.length, sent: results.filter((r) => r.ok).length, results };
  }

  async function runMonthlyIadReminders(opts) {
    const force = Boolean(opts?.force);
    const now = opts?.now instanceof Date ? opts.now : new Date();
    const stamp = monthStamp(now);
    if (!force && !isFirstCalendarDay(now)) {
      return { ok: true, skipped: true, reason: "not_first_day", stamp };
    }
    if (typeof window !== "undefined" && !getSupabaseClientForBrowser()) {
      return { ok: true, skipped: true, reason: "no_supabase_for_reminders", stamp };
    }

    const sb =
      opts?.supabase ||
      (typeof process !== "undefined" ? await getSupabaseClientForNode() : getSupabaseClientForBrowser());

    const [rows, teamUsers] = await Promise.all([loadIadRows(sb), loadTeamUsers(sb)]);
    const active = filterActiveIadRows(rows);
    const results = [];
    const outlookMode = usesOutlookComposeDelivery();

    for (const row of active) {
      const rowKey = rowStableId(row);
      if (!force && wasReminderSent(row, rowKey, stamp)) {
        results.push({ rowKey, skipped: true, reason: "already_sent" });
        continue;
      }
      if (!force && hasReminderPending(row, stamp)) {
        results.push({ rowKey, skipped: true, reason: "pending_compose" });
        continue;
      }
      const recipients = collectRowRecipientEmails(row, teamUsers);
      if (!recipients.length) {
        results.push({ rowKey, skipped: true, reason: "no_recipient_email" });
        continue;
      }
      const url = buildIadDeepLink(row);

      if (outlookMode) {
        const queuedTo = [];
        const failures = [];
        for (const em of recipients) {
          const subject = buildReminderSubject(row);
          const messageText = buildReminderText(row);
          const text = `${messageText}\n\nAtvērt aplikācijā: ${url}`;
          const html = buildReminderHtml(row, url);
          const r = await dispatchIadInformOutlookCompose({
            to: em,
            subject,
            text,
            html,
            url,
            row,
            kind: "reminder",
            messageText,
            supabase: sb,
            autoOpen: false,
            reminderStamp: stamp,
          });
          if (r.ok) queuedTo.push(em);
          else failures.push({ email: em, ...r });
        }
        if (queuedTo.length) {
          await markReminderPending(sb, row, rowKey, stamp, queuedTo);
          results.push({ rowKey, ok: true, queued: true, queuedTo, failures, via: "outlook_queue" });
        } else {
          results.push({ rowKey, ok: false, failures });
        }
        continue;
      }

      const sentTo = [];
      const failures = [];
      for (const em of recipients) {
        const r = await sendIadReminderEmail({ to: em, row, url, supabase: sb });
        if (r.ok) sentTo.push(em);
        else failures.push({ email: em, ...r });
      }
      if (sentTo.length) {
        await markReminderSent(sb, row, rowKey, stamp, sentTo);
        results.push({ rowKey, ok: true, sentTo, failures });
      } else {
        results.push({ rowKey, ok: false, failures });
      }
    }

    return { ok: true, stamp, count: active.length, results };
  }

  async function runInformeshanaTick(opts) {
    const welcome = await runAssignmentWelcomeEmails(opts);
    const monthly = await runMonthlyIadReminders(opts);
    return { welcome, monthly };
  }

  function logInformeshanaTickResult(out, label) {
    if (!out || typeof out !== "object") return;
    const welcomeFails = (out.welcome?.results || []).filter((r) => r && !r.ok && !r.skipped);
    const monthlyFails = (out.monthly?.results || []).filter((r) => r && r.ok === false);
    if (welcomeFails.length || monthlyFails.length) {
      console.warn("[PDD_INFORMESHANA]", label || "tick", { welcomeFails, monthlyFails, out });
    }
  }

  function initBrowserScheduler() {
    applyIadFocusFromUrl();
    const tick = (label) => {
      void runInformeshanaTick()
        .then((out) => {
          logInformeshanaTickResult(out, label);
        })
        .catch((e) => {
          console.warn("[PDD_INFORMESHANA]", e);
        });
    };
    if (typeof document !== "undefined") {
      const start = () => {
        tick("init");
        setTimeout(() => tick("retry-3s"), 3000);
        setTimeout(() => tick("retry-15s"), 15000);
      };
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
      } else {
        start();
      }
      try {
        const dayMs = 24 * 60 * 60 * 1000;
        setInterval(() => tick("daily"), dayMs);
      } catch {
        /* ignore */
      }
    }
  }

  if (typeof window !== "undefined" && typeof document !== "undefined") {
    initBrowserScheduler();
  }

  if (typeof process !== "undefined" && require.main === module) {
    const force = process.argv.includes("--force");
    const forceWelcome = process.argv.includes("--force-welcome");
    runInformeshanaTick({ force, forceWelcome })
      .then((out) => {
        console.log(JSON.stringify(out, null, 2));
        process.exit(out?.monthly?.ok === false || out?.welcome?.ok === false ? 1 : 0);
      })
      .catch((e) => {
        console.error(e);
        process.exit(1);
      });
  }

  return {
    runInformeshanaTick,
    runMonthlyIadReminders,
    runAssignmentWelcomeEmails,
    runWelcomeOnRowSave,
    sendIadReminderEmail,
    sendIadWelcomeEmail,
    buildReminderText,
    buildWelcomeText,
    buildWelcomeSubject,
    buildIadDeepLink,
    applyIadFocusFromUrl,
    collectRowRecipientEmails,
    collectNewAssignmentPersons,
    isInactiveStatus,
    initBrowserScheduler,
    fetchInformeshanaAuditForRow,
    informeshanaKindLabel,
    isControlMonitorRecipient,
    openEmailDraftPanel,
    closeEmailDraftPanel,
    openEmailDraftQueue,
    getEmailDeliveryMode,
    usesOutlookComposeDelivery,
    refreshPendingComposeBanner,
    buildInformeshanaAlertMessage,
    hasServerEmailChannel,
    debugEmailChannel: () => ({
      hasChannel: hasServerEmailChannel(),
      anonKey: Boolean(getAnonApiKey()),
      fnUrls: getIadEmailFnUrls(),
      inBrowser: typeof window !== "undefined",
      hasProcess: typeof process !== "undefined",
    }),
  };
});

if (typeof globalThis !== "undefined") {
  globalThis.PDD_OPEN_EMAIL_DRAFT__ = globalThis.PDD_INFORMESHANA?.openEmailDraftPanel;
}
