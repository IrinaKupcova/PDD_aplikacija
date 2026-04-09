const SODIEN_STORE_KEY = "pdd_sodien_aktualitates_v1";

/** DB tabula (ASCII), kā Supabase kļūdziņā: „AKTUALITATES”. */
const TABLE_AKTUALITATES = "AKTUALITATES";

const AKTUALITATES_NAME_CANDIDATES = [
  "AKTUALITATES",
  "aktualitates",
  "Aktualitates",
  "AKTUALIT\u0100TES",
];

let resolvedAktualitatesTableName = null;

function normUserId(s) {
  return String(s ?? "").trim().toLowerCase();
}

function extractUserDisplayName(p) {
  if (!p || typeof p !== "object") return "";
  return pick(
    p["Vārds uzvārds"] ||
      p["Vārds Uzvārds"] ||
      p["Vards uzvards"] ||
      p["Vards Uzvards"] ||
      p.vards_uzvards ||
      p.full_name ||
      p.email,
  );
}

/** Vārdi no public.users; UUID salīdzināšana normalizēta; trūkstošiem — atsevišķs vaicājums. */
async function fetchAuthorNameMap(sb, rawRows) {
  const ids = [...new Set((rawRows || []).map((r) => pick(r?.Autors ?? r?.autors)).filter(Boolean))];
  if (ids.length === 0 || !sb) return new Map();
  const m = new Map();
  const { data: profs, error } = await sb.from("users").select("*").in("id", ids);
  if (!error && Array.isArray(profs)) {
    for (const p of profs) {
      const id = pick(p.id);
      const label = extractUserDisplayName(p);
      if (id && label) m.set(normUserId(id), label);
    }
  }
  for (const id of ids) {
    const nk = normUserId(id);
    if (m.has(nk)) continue;
    const { data: one } = await sb.from("users").select("*").eq("id", id).maybeSingle();
    const label = extractUserDisplayName(one);
    if (label) m.set(nk, label);
  }
  return m;
}

/**
 * Atrod tabulas nosaukumu PostgREST kešatmiņā (mēģina vairākus variantus).
 * Rezultāts tiek saglabāts `globalThis.__PDD_AKTUALITATES_TABLE__` (Realtime).
 */
async function resolveAktualitatesTableName(sb) {
  if (resolvedAktualitatesTableName) return resolvedAktualitatesTableName;
  if (!sb) throw new Error("Nav Supabase klienta");
  let lastErr = null;
  for (const t of AKTUALITATES_NAME_CANDIDATES) {
    const { error } = await sb.from(t).select("*").limit(1);
    if (!error) {
      resolvedAktualitatesTableName = t;
      if (typeof globalThis !== "undefined") globalThis.__PDD_AKTUALITATES_TABLE__ = t;
      return t;
    }
    lastErr = error;
  }
  throw new Error(
    "Aktualitāšu tabula nav atrasta. Pārbaudi Table Editor: public → AKTUALITATES (Kas_sodien_vel_aktuals, Sakums, Beigas, Autors). Ja tabula jauna — uzgaidi ~1 min. Kļūda: " +
      (lastErr?.message || "nezināma")
  );
}

/** Ielādē tabulas nosaukumu pirms Realtime abonementa. */
async function primeAktualitatesTable(sb) {
  if (!sb) return;
  await resolveAktualitatesTableName(sb);
}

/** Pēdējās renderTodayInfo opcijas (add/delete izmanto attālināti). */
let sodienUiOpts = {
  useSupabase: false,
  refreshAktualitates: null,
};

function ymd(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isNaN(dt.getTime()) ? "" : dt.toISOString().slice(0, 10);
}

function pick(v) {
  return String(v ?? "").trim();
}

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatLvDate(iso) {
  const s = pick(iso);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return s;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function isTodayAway(a, today) {
  const st = pick(a?.status).toLowerCase();
  if (st && st !== "approved" && st !== "apstiprinats" && st !== "apstiprināts" && st !== "saskanots" && st !== "saskaņots") {
    return false;
  }
  const from = pick(a?.start_date || a?.Sakuma_datums || a?.sakuma_datums);
  const to = pick(a?.end_date || a?.Beigu_datums || a?.beigu_datums);
  if (!from || !to) return false;
  return from <= today && today <= to;
}

function displayName(a) {
  return pick(a?.employee?.["Vārds uzvārds"] || a?.employee?.full_name || a?.user_id) || "—";
}

function typeName(a) {
  return pick(a?.type?.name || a?.type_id) || "—";
}

function timeInterval(a) {
  const from = pick(a?.laiks_no || a?.Laiks_no || a?.laiksNo || "");
  const to = pick(a?.laiks_lidz || a?.Laiks_lidz || a?.laiksLidz || "");
  if (from && to) return `${from}–${to}`;
  if (from) return `no ${from}`;
  if (to) return `līdz ${to}`;
  return "";
}

function todayRows(absences) {
  const today = ymd(new Date());
  const list = Array.isArray(absences) ? absences : [];
  return list.filter((a) => isTodayAway(a, today));
}

function loadAktualitates() {
  try {
    const raw = localStorage.getItem(SODIEN_STORE_KEY);
    const rows = raw ? JSON.parse(raw) : [];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function saveAktualitates(list) {
  try {
    localStorage.setItem(SODIEN_STORE_KEY, JSON.stringify(Array.isArray(list) ? list : []));
  } catch {
    /* ignore quota errors */
  }
}

function cleanExpired(list) {
  const today = ymd(new Date());
  return (Array.isArray(list) ? list : []).filter((x) => {
    const end = pick(x?.end || "");
    return !end || end >= today;
  });
}

function stableSyntheticRowId(html, start, end, autorsOrTag) {
  const s = `${start}|${end}|${autorsOrTag}|${String(html).slice(0, 160)}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return `syn-${Math.abs(h)}`;
}

function authorLabelFromDbRow(r, nameMap) {
  const aid = pick(r?.Autors ?? r?.autors);
  const aidN = normUserId(aid);
  if (nameMap && aidN && nameMap.has(aidN)) return nameMap.get(aidN);
  const sid = normUserId(globalThis.__PDD_SESSION_USER_ID__);
  const selfName = pick(globalThis.__PDD_ACTOR_DISPLAY_NAME__);
  const selfEmail = pick(globalThis.__PDD_ACTOR_EMAIL__);
  if (aidN && sid && aidN === sid) {
    if (selfName) return selfName;
    if (selfEmail) return selfEmail;
  }
  const emb = r?.users;
  if (emb && typeof emb === "object" && !Array.isArray(emb)) {
    const n = pick(emb["Vārds uzvārds"] || emb.full_name || emb.email);
    if (n) return n;
  }
  if (Array.isArray(emb) && emb[0]) {
    const u0 = emb[0];
    const n = pick(u0["Vārds uzvārds"] || u0.full_name || u0.email);
    if (n) return n;
  }
  if (selfName) return selfName;
  if (selfEmail) return selfEmail;
  return "—";
}

function rowFromDb(r, nameMap) {
  if (!r || typeof r !== "object") return null;
  const html = pick(r.Kas_sodien_vel_aktuals ?? r.kas_sodien_vel_aktuals);
  const start = pick(r.Sakums ?? r.sakums);
  const end = pick(r.Beigas ?? r.beigas);
  const created_at = pick(r.created_at);
  const autors_id = pick(r.Autors ?? r.autors);
  if (!html || !start || !end) return null;
  const dbRowId = pick(r.id);
  const use_period = start !== end;
  const authorLabel = authorLabelFromDbRow(r, nameMap);
  const id = dbRowId || stableSyntheticRowId(html, start, end, autors_id || authorLabel);
  return {
    id,
    dbRowId: dbRowId || null,
    canMutateRemote: Boolean(dbRowId),
    html,
    start,
    end,
    use_period,
    created_at,
    autors_id,
    authorLabel,
  };
}

function applyLegacyMatchFilter(q, item) {
  const html = pick(item?.html);
  const start = pick(item?.start);
  const end = pick(item?.end);
  const autors = pick(item?.autors_id);
  let qq = q.eq("Kas_sodien_vel_aktuals", html).eq("Sakums", start).eq("Beigas", end);
  if (autors) qq = qq.eq("Autors", autors);
  return qq;
}

function visibleAktualitatesActive() {
  const today = ymd(new Date());
  const cleaned = cleanExpired(loadAktualitates());
  saveAktualitates(cleaned);
  return cleaned.filter((x) => {
    const e = pick(x.end || "");
    return !e || e >= today;
  });
}

/**
 * Aktuālās aktualitātes pēc perioda (šodien iekļauts [Sakums, Beigas]).
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 */
async function fetchActiveAktualitatesFromSupabase(sb) {
  const t = await resolveAktualitatesTableName(sb);
  const today = ymd(new Date());
  const { data, error } = await sb
    .from(t)
    .select("*")
    .lte("Sakums", today)
    .gte("Beigas", today)
    .order("Sakums", { ascending: false })
    .order("Beigas", { ascending: false });
  if (error) throw error;
  const nameMap = await fetchAuthorNameMap(sb, data ?? []);
  return (data ?? []).map((row) => rowFromDb(row, nameMap)).filter(Boolean);
}

/**
 * Visa vēsture (ieskaitot beigušās).
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 */
async function fetchAllAktualitatesFromSupabase(sb) {
  const t = await resolveAktualitatesTableName(sb);
  const { data, error } = await sb
    .from(t)
    .select("*")
    .order("Sakums", { ascending: false })
    .order("Beigas", { ascending: false })
    .limit(500);
  if (error) throw error;
  const nameMap = await fetchAuthorNameMap(sb, data ?? []);
  return (data ?? []).map((row) => rowFromDb(row, nameMap)).filter(Boolean);
}

function currentEditor() {
  return document.getElementById("sodien-akt-editor");
}

function currentEditIdField() {
  return document.getElementById("sodien-edit-id");
}

function wrapSelectionWithStyle(styleText) {
  const sel = window.getSelection?.();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
  const r = sel.getRangeAt(0);
  const txt = r.toString();
  if (!txt) return;
  const span = document.createElement("span");
  span.setAttribute("style", styleText);
  span.textContent = txt;
  r.deleteContents();
  r.insertNode(span);
  sel.removeAllRanges();
}

function insertAtCursor(htmlText) {
  const sel = window.getSelection?.();
  if (!sel || sel.rangeCount === 0) return;
  const r = sel.getRangeAt(0);
  const frag = r.createContextualFragment(String(htmlText || ""));
  r.deleteContents();
  r.insertNode(frag);
}

function applyCmd(cmd, value) {
  const ed = currentEditor();
  if (!ed) return;
  ed.focus();
  try {
    document.execCommand(cmd, false, value ?? null);
  } catch {
    /* ignore */
  }
}

function onPickImage(ev) {
  const f = ev?.target?.files?.[0];
  if (!f) return;
  const fr = new FileReader();
  fr.onload = () => {
    const src = String(fr.result || "");
    if (!src) return;
    insertAtCursor(`<img src="${escHtml(src)}" alt="${escHtml(f.name)}" style="max-width:100%;border-radius:8px;" />`);
  };
  fr.readAsDataURL(f);
  ev.target.value = "";
}

function onPickAttachment(ev) {
  const f = ev?.target?.files?.[0];
  if (!f) return;
  const fr = new FileReader();
  fr.onload = () => {
    const src = String(fr.result || "");
    if (!src) return;
    insertAtCursor(`<p><a href="${escHtml(src)}" download="${escHtml(f.name)}">Pielikums: ${escHtml(f.name)}</a></p>`);
  };
  fr.readAsDataURL(f);
  ev.target.value = "";
}

async function addAktualitate() {
  const ed = currentEditor();
  if (!ed) return;
  const content = String(ed.innerHTML || "").trim();
  if (!content || content === "<br>") {
    alert("Ievadi aktualitātes tekstu.");
    return;
  }
  const usePeriod = Boolean(document.getElementById("sodien-use-period")?.checked);
  const today = ymd(new Date());
  const start = usePeriod ? pick(document.getElementById("sodien-start")?.value || today) : today;
  const end = usePeriod ? pick(document.getElementById("sodien-end")?.value || start || today) : start || today;
  if (start && end && end < start) {
    alert("Perioda beigu datums nevar būt mazāks par sākuma datumu.");
    return;
  }
  const editId = pick(currentEditIdField()?.value || "");
  const sb = globalThis.__PDD_SUPABASE__;
  const useRemote = Boolean(sodienUiOpts.useSupabase && sb);

  if (useRemote) {
    const payload = {
      Kas_sodien_vel_aktuals: content,
      Sakums: start || today,
      Beigas: end || start || today,
    };
    try {
      const t = await resolveAktualitatesTableName(sb);
      if (editId) {
        if (String(editId).startsWith("syn-")) {
          const cur = (sodienUiOpts.__lastAktList || []).find((x) => String(x?.id) === String(editId));
          if (!cur) {
            alert("Neizdevās atrast labojamo ierakstu.");
            return;
          }
          const q = applyLegacyMatchFilter(sb.from(t).update(payload), cur);
          const { error } = await q;
          if (error) throw error;
        } else {
          const { error } = await sb.from(t).update(payload).eq("id", editId);
          if (error) throw error;
        }
      } else {
        const { data: sess } = await sb.auth.getSession();
        const uid = sess?.session?.user?.id;
        if (!uid) {
          alert("Nav pieslēgta lietotāja sesijas — nevar saglabāt (vajag auth.uid() RLS politikai).");
          return;
        }
        const { error } = await sb.from(t).insert({ ...payload, Autors: uid });
        if (error) throw error;
      }
    } catch (e) {
      alert("Neizdevās saglabāt Supabase: " + (e?.message || String(e)));
      return;
    }
    resetAktualitateForm();
    if (typeof sodienUiOpts.refreshAktualitates === "function") await sodienUiOpts.refreshAktualitates();
    return;
  }

  const list = cleanExpired(loadAktualitates());
  const authorLabel = pick(globalThis.__PDD_ACTOR_DISPLAY_NAME__) || "Lokāli";
  const row = {
    id: editId || crypto.randomUUID(),
    html: content,
    start: start || today,
    end: end || start || today,
    use_period: usePeriod,
    created_at: new Date().toISOString(),
    authorLabel,
  };
  if (editId) {
    const idx = list.findIndex((x) => String(x.id) === editId);
    if (idx >= 0) list[idx] = { ...list[idx], ...row };
    else list.unshift(row);
  } else {
    list.unshift(row);
  }
  saveAktualitates(list);
  window.location.reload();
}

async function deleteAktualitate(id) {
  if (!confirm("Dzēst šo aktualitāti?")) return;
  const sb = globalThis.__PDD_SUPABASE__;
  const useRemote = Boolean(sodienUiOpts.useSupabase && sb);
  if (useRemote) {
    try {
      const t = await resolveAktualitatesTableName(sb);
      if (String(id).startsWith("syn-")) {
        const cur = (sodienUiOpts.__lastAktList || []).find((x) => String(x?.id) === String(id));
        if (!cur) {
          alert("Neizdevās atrast dzēšamo ierakstu.");
          return;
        }
        const q = applyLegacyMatchFilter(sb.from(t).delete(), cur);
        const { error } = await q;
        if (error) throw error;
      } else {
        const { error } = await sb.from(t).delete().eq("id", id);
        if (error) throw error;
      }
    } catch (e) {
      alert("Neizdevās dzēst: " + (e?.message || String(e)));
      return;
    }
    if (typeof sodienUiOpts.refreshAktualitates === "function") await sodienUiOpts.refreshAktualitates();
    return;
  }
  const list = cleanExpired(loadAktualitates()).filter((x) => String(x.id) !== String(id));
  saveAktualitates(list);
  window.location.reload();
}

function setFormMode(isEdit) {
  const btn = document.getElementById("sodien-submit-btn");
  if (btn) btn.textContent = isEdit ? "Saglabāt" : "Pievienot";
}

function resetAktualitateForm() {
  const ed = currentEditor();
  if (ed) ed.innerHTML = "";
  const editField = currentEditIdField();
  if (editField) editField.value = "";
  const today = ymd(new Date());
  const cb = document.getElementById("sodien-use-period");
  const start = document.getElementById("sodien-start");
  const end = document.getElementById("sodien-end");
  if (cb) cb.checked = false;
  if (start) start.value = today;
  if (end) end.value = today;
  setFormMode(false);
}

function editAktualitate(id) {
  const useRemote = Boolean(sodienUiOpts.useSupabase && globalThis.__PDD_SUPABASE__);
  const list = useRemote ? sodienUiOpts.__lastAktList || [] : cleanExpired(loadAktualitates());
  const item = list.find((x) => String(x.id) === String(id));
  if (!item) return;
  const details = document.getElementById("sodien-editor-details");
  if (details) details.open = true;
  const ed = currentEditor();
  if (ed) ed.innerHTML = String(item.html || "");
  const editField = currentEditIdField();
  if (editField) editField.value = String(item.id);
  const cb = document.getElementById("sodien-use-period");
  const start = document.getElementById("sodien-start");
  const end = document.getElementById("sodien-end");
  if (cb) cb.checked = Boolean(item.use_period);
  if (start) start.value = pick(item.start || ymd(new Date()));
  if (end) end.value = pick(item.end || start?.value || ymd(new Date()));
  setFormMode(true);
}

function ensureSodienAktStyleOnce() {
  if (typeof document === "undefined" || document.getElementById("pdd-sodien-akt-style")) return;
  const s = document.createElement("style");
  s.id = "pdd-sodien-akt-style";
  s.textContent = `
    #sodien-aktualitates-panel .sodien-akt-html {
      overflow-wrap: anywhere;
      word-break: break-word;
      max-width: 100%;
    }
    #sodien-aktualitates-panel .sodien-akt-html img,
    #sodien-aktualitates-panel .sodien-akt-html svg,
    #sodien-aktualitates-panel .sodien-akt-html video {
      max-width: 100% !important;
      height: auto !important;
    }
    #sodien-aktualitates-panel .sodien-akt-html table {
      max-width: 100%;
      display: block;
      overflow-x: auto;
    }
    #sodien-aktualitates-panel .sodien-akt-html pre {
      max-width: 100%;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .akt-vesture-html {
      box-sizing: border-box;
      min-width: 0;
      max-width: 100%;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .akt-vesture-html img,
    .akt-vesture-html svg,
    .akt-vesture-html video {
      max-width: 100% !important;
      height: auto !important;
    }
    .akt-vesture-html table {
      max-width: 100%;
      display: block;
      overflow-x: auto;
    }
    .akt-vesture-html pre {
      max-width: 100%;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }
  `;
  document.head.appendChild(s);
}

const sodienAktFlexibleBox = {
  boxSizing: "border-box",
  minWidth: 0,
  maxWidth: "100%",
  width: "100%",
};

const sodienAktHtmlBox = {
  ...sodienAktFlexibleBox,
  fontSize: "0.92rem",
  overflowWrap: "anywhere",
  wordBreak: "break-word",
  overflowX: "auto",
};

function renderTodayInfo({ html, absences, aktualitates, refreshAktualitates, useSupabase, syncError, loadingAktualitates }) {
  if (typeof html !== "function") return null;
  ensureSodienAktStyleOnce();
  sodienUiOpts = {
    useSupabase: Boolean(useSupabase),
    refreshAktualitates: typeof refreshAktualitates === "function" ? refreshAktualitates : null,
    __lastAktList: Array.isArray(aktualitates) ? aktualitates : [],
  };
  const awayRows = todayRows(absences);
  const aktList =
    loadingAktualitates && aktualitates === undefined
      ? null
      : Array.isArray(aktualitates)
        ? aktualitates
        : visibleAktualitatesActive();
  const today = ymd(new Date());
  return html`
    <section
      id="sodien-aktualitates-panel"
      class="list-panel"
      style=${{
        marginTop: "1rem",
        background: "linear-gradient(180deg, rgba(56,189,248,0.16), rgba(14,116,144,0.1))",
        border: "1px solid rgba(14,116,144,0.55)",
        boxSizing: "border-box",
        minWidth: 0,
        maxWidth: "100%",
        width: "100%",
      }}
    >
      <h3 style=${{ margin: "0 0 0.75rem", fontSize: "1rem", color: "#075985" }}>AKTUALITĀTES</h3>

      ${syncError
        ? html`<div class="banner-warn" role="alert" style=${{ marginBottom: "0.75rem", fontSize: "0.88rem" }}>Aktualitāšu sinhronizācija: ${String(syncError)}</div>`
        : null}

      <div style=${{ fontWeight: 700, borderBottom: "1px solid rgba(14,116,144,0.35)", paddingBottom: "0.35rem", marginBottom: "0.55rem" }}>
        Šodien nav darbā
      </div>
      ${awayRows.length
        ? html`
            <div class="stack" style=${{ gap: "0.5rem", marginBottom: "0.9rem" }}>
              ${awayRows.map(
                (a, i) => html`
                  <div
                    key=${`today-away-${a.id ?? i}`}
                    style=${{
                      border: "1px solid rgba(14,116,144,0.4)",
                      borderRadius: "10px",
                      padding: "0.55rem 0.65rem",
                      background: "rgba(255,255,255,0.72)",
                    }}
                  >
                    <div style=${{ fontWeight: 600 }}>
                      ${displayName(a)} <span style=${{ color: "var(--muted)", fontWeight: 400 }}>(${typeName(a)})</span>
                    </div>
                    <div style=${{ fontSize: "0.88rem", color: "var(--muted)", marginTop: "0.2rem" }}>
                      Mani aizvieto: ${pick(a?.Mani_aizvieto) || "—"}
                    </div>
                    <div style=${{ fontSize: "0.88rem", color: "var(--muted)" }}>
                      Papildu informācija: ${pick(a?.Papildu_info) || "—"}
                    </div>
                    ${timeInterval(a)
                      ? html`<div style=${{ fontSize: "0.88rem", color: "var(--muted)" }}>Laiks: ${timeInterval(a)}</div>`
                      : null}
                  </div>
                `
              )}
            </div>
          `
        : html`<p style=${{ margin: "0 0 0.9rem", color: "var(--muted)" }}>Šodien nav neviena prombūtnes ieraksta.</p>`}

      <div style=${{ fontWeight: 700, borderBottom: "1px solid rgba(14,116,144,0.35)", paddingBottom: "0.35rem", marginBottom: "0.55rem" }}>
        Kas šodien vēl aktuāls
      </div>
      ${aktList === null
        ? html`<p style=${{ margin: "0 0 0.75rem", color: "var(--muted)" }}>Ielādē aktualitātes…</p>`
        : aktList.length
          ? html`
              <div class="stack" style=${{ gap: "0.5rem", marginBottom: "0.75rem", ...sodienAktFlexibleBox }}>
                ${aktList.map(
                  (x) => html`
                    <div
                      key=${x.id}
                      style=${{
                        border: "1px dashed rgba(2,132,199,0.55)",
                        borderRadius: "10px",
                        padding: "0.55rem 0.65rem",
                        background: "rgba(255,255,255,0.8)",
                        ...sodienAktFlexibleBox,
                      }}
                    >
                      ${x.use_period
                        ? html`
                            <div style=${{ fontSize: "0.8rem", color: "var(--muted)", marginBottom: "0.3rem", ...sodienAktFlexibleBox }}>
                              Periods: ${formatLvDate(x.start)} — ${formatLvDate(x.end)}
                            </div>
                          `
                        : null}
                      <div style=${{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: "0.3rem", ...sodienAktFlexibleBox }}>
                        Autors: ${pick(x.authorLabel) || "—"}
                      </div>
                      <div
                        class="sodien-akt-html"
                        style=${sodienAktHtmlBox}
                        dangerouslySetInnerHTML=${{ __html: String(x.html || "") }}
                      ></div>
                      <div class="row" style=${{ marginTop: "0.45rem", flexWrap: "wrap", ...sodienAktFlexibleBox }}>
                        <button type="button" class="btn btn-ghost btn-small" onClick=${() => editAktualitate(x.id)}>Labot</button>
                        <button type="button" class="btn btn-danger btn-small" onClick=${() => void deleteAktualitate(x.id)}>Dzēst</button>
                      </div>
                    </div>
                  `
                )}
              </div>
            `
          : html`<p style=${{ margin: "0 0 0.75rem", color: "var(--muted)" }}>Papildu aktualitātes nav pievienotas.</p>`}

      <details id="sodien-editor-details">
        <summary style=${{ cursor: "pointer", fontWeight: 600 }}>Pievienot</summary>
        <div class="stack" style=${{ marginTop: "0.6rem", gap: "0.5rem" }}>
          <input id="sodien-edit-id" type="hidden" value="" />
          <div class="row" style=${{ gap: "0.35rem", flexWrap: "wrap" }}>
            <button type="button" class="btn btn-ghost btn-small" onClick=${() => applyCmd("bold")}>B</button>
            <button type="button" class="btn btn-ghost btn-small" onClick=${() => applyCmd("italic")}>I</button>
            <button type="button" class="btn btn-ghost btn-small" onClick=${() => applyCmd("underline")}>U</button>
            <button type="button" class="btn btn-ghost btn-small" onClick=${() => applyCmd("insertUnorderedList")}>• Saraksts</button>
            <button type="button" class="btn btn-ghost btn-small" onClick=${() => wrapSelectionWithStyle("background:#fef08a;")}>Izcelt</button>
            <label class="btn btn-ghost btn-small" style=${{ cursor: "pointer" }}>
              Teksta krāsa
              <input
                type="color"
                style=${{ width: "24px", height: "20px", marginLeft: "0.35rem", border: "none", background: "transparent" }}
                onInput=${(e) => applyCmd("foreColor", e.target.value)}
              />
            </label>
            <select class="select" style=${{ maxWidth: "120px" }} onChange=${(e) => applyCmd("fontSize", e.target.value)}>
              <option value="">Šrifta lielums</option>
              <option value="2">Mazs</option>
              <option value="3">Parasts</option>
              <option value="4">Vidējs</option>
              <option value="5">Liels</option>
              <option value="6">Ļoti liels</option>
            </select>
          </div>

          <div
            id="sodien-akt-editor"
            contenteditable="true"
            style=${{
              minHeight: "110px",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              background: "rgba(255,255,255,0.9)",
              padding: "0.55rem",
              boxSizing: "border-box",
              minWidth: 0,
              maxWidth: "100%",
              width: "100%",
              overflowWrap: "anywhere",
              wordBreak: "break-word",
              overflowX: "auto",
            }}
            data-placeholder="Aktualitāte — brīvais teksts"
          ></div>

          <div class="row" style=${{ gap: "0.45rem", flexWrap: "wrap" }}>
            <label class="btn btn-ghost btn-small" style=${{ cursor: "pointer" }}>
              Pievienot bildi / screenshot
              <input type="file" accept="image/*" style=${{ display: "none" }} onChange=${onPickImage} />
            </label>
            <label class="btn btn-ghost btn-small" style=${{ cursor: "pointer" }}>
              Pievienot pielikumu
              <input type="file" style=${{ display: "none" }} onChange=${onPickAttachment} />
            </label>
          </div>

          <label style=${{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
            <input id="sodien-use-period" type="checkbox" />
            Atzīmēt periodu
          </label>
          <div class="row" style=${{ gap: "0.75rem" }}>
            <div class="field" style=${{ flex: "1 1 140px" }}>
              <label>Sākums</label>
              <input id="sodien-start" type="date" class="input" value=${today} />
            </div>
            <div class="field" style=${{ flex: "1 1 140px" }}>
              <label>Beigas</label>
              <input id="sodien-end" type="date" class="input" value=${today} />
            </div>
          </div>

          <div class="row">
            <button id="sodien-submit-btn" type="button" class="btn btn-primary btn-small" onClick=${() => void addAktualitate()}>Pievienot</button>
            <button type="button" class="btn btn-ghost btn-small" onClick=${resetAktualitateForm}>Atcelt</button>
          </div>
        </div>
      </details>
    </section>
  `;
}

window.PDDSodien = {
  renderTodayInfo,
  loadAktualitates,
  visibleAktualitatesActive,
  fetchActiveAktualitatesFromSupabase,
  fetchAllAktualitatesFromSupabase,
  primeAktualitatesTable,
  ensureSodienAktStyleOnce,
  TABLE_AKTUALITATES,
};
