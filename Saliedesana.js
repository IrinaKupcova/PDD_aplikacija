(function () {
  const LS_EVENTS_KEY = "pdd_saliedesana_pasakumi_v2";
  const LS_AKTUALITATES_KEY = "pdd_sodien_aktualitates_v1";
  /** Supabase: public."Saliedesana" — kolonnas kā Table Editor (arī saīsinātie nosaukumi). */
  const REMOTE_TABLE = "Saliedesana";
  const SAL_META_MARKER = "\n\n---PDD-SYNC---\n";
  /** No pirmā SELECT * — precīzi PostgREST lauku nosaukumi rakstīšanai. */
  let saliedesanaColumnNames = null;

  const SAL_COL_CANDIDATES = {
    Datums: ["Datums", "datums"],
    Sakuma_laiks: ["Sakuma_laiks", "sakuma_laiks", "Laiks", "laiks"],
    Pasakuma_nosau: ["Pasakuma_nosau", "Pasakuma_nosaukums", "Pasākuma_nosaukums", "pasakuma_nosaukums"],
    Pasakuma_veids: ["Pasakuma_veids", "pasakuma_veids"],
    Beigu_laiks: ["Beigu_laiks", "beigu_laiks", "Lidz_cikiem", "lidz_cikiem"],
    Online_pasakums: ["Online pasākums", "Online_pasakums", "online_pasakums"],
    Norises_vieta: ["Norises_vieta", "norises_vieta", "Vieta", "vieta"],
    Kategorija: ["Kategorija", "kategorija"],
    Pasakuma_aprak: ["Pasākuma_aprak", "Pasakuma_aprak", "Pasakuma_apraksts", "Pasākuma_apraksts", "pasakuma_apraksts"],
    Kapac_piedalītie: ["Kapac_piedalītie", "Kapac_piedalities", "Kapac_piedalitie", "kapac_piedalities"],
    Ko_sagaidit: ["Ko_sagaidit", "ko_sagaidit"],
    Dress_code: ["Dress_code", "dress_code"],
    Ko_nemt_lidzi: ["Ko_nemt_lidzi", "ko_nemt_lidzi"],
    Dalibas_maksa: ["Dalibas_maksa", "dalibas_maksa"],
    Brivs_apraksts: ["Brivs_apraksts", "brivs_apraksts"],
    Papildu_piezimes: ["Papildu_piezimes", "papildu_piezimes"],
    Dati_json: ["Dati_json", "dati_json"],
    Radit_aktualitates: ["Radit_aktualitates", "radit_aktualitates"],
    Aktualitates_id: ["Aktualitates_id", "aktualitates_id"],
  };

  const DB_SQL_SETUP = `
-- public."Saliedesana" (pēc faktiskās shēmas): id, Datums, Sakuma_laiks, Pasakuma_nosau, Pasakuma_veids,
-- Beigu_laiks, "Online pasākums", Norises_vieta, Kategorija, Pasākuma_aprak, Kapac_piedalītie, Ko_sagaidit,
-- Dress_code, Ko_nemt_lidzi, Dalibas_maksa, Brivs_apraksts, Papildu_piezimes
`;

  function ensureStyles() {
    if (typeof document === "undefined") return;
    if (document.getElementById("pdd-saliedesana-style-v2")) return;
    const s = document.createElement("style");
    s.id = "pdd-saliedesana-style-v2";
    s.textContent = `
      .sal-wrap { display:grid; gap:1rem; }
      .sal-head { border:1px solid #f59e0b; background:linear-gradient(180deg,#fff7ed,#ffedd5); border-radius:14px; padding:.9rem 1rem; }
      .sal-head h2 { margin:0; font-size:1.08rem; color:#9a3412; }
      .sal-head p { margin:.3rem 0 0; font-size:.82rem; color:#b45309; }
      .sal-banner { border:1px dashed #f59e0b; background:#fffbeb; border-radius:10px; padding:.55rem .65rem; font-size:.78rem; color:#92400e; }
      .sal-accordion { border:1px solid #fdba74; border-radius:12px; background:#fff7ed; overflow:hidden; }
      .sal-accordion summary { list-style:none; cursor:pointer; user-select:none; position:relative; padding:.62rem .75rem; font-weight:700; color:#9a3412; }
      .sal-accordion summary::-webkit-details-marker { display:none; }
      .sal-accordion summary::after { content:"▸"; position:absolute; right:.65rem; top:50%; transform:translateY(-50%); color:#f97316; transition:transform .15s ease; }
      .sal-accordion[open] > summary::after { transform:translateY(-50%) rotate(90deg); }
      .sal-accordion-body { border-top:1px solid #fdba74; padding:.7rem; display:grid; gap:.45rem; }
      .sal-subnote { margin:0; font-size:.8rem; color:#9a3412; }
      .sal-cal-wrap { border:1px solid #fed7aa; border-radius:12px; background:#fff; padding:.7rem; display:grid; gap:.55rem; }
      .sal-cal-head { display:flex; align-items:center; justify-content:space-between; gap:.45rem; flex-wrap:wrap; }
      .sal-cal-grid { display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:.35rem; }
      .sal-cal-dow { text-align:center; font-size:.72rem; color:#64748b; font-weight:700; }
      .sal-cal-cell { min-height:98px; border:1px solid #e5e7eb; border-radius:10px; padding:.3rem .34rem; background:#fff; display:flex; flex-direction:column; gap:.22rem; }
      .sal-cal-cell.out { opacity:.45; }
      .sal-cal-cell.today { box-shadow: inset 0 0 0 2px rgba(249,115,22,.35); border-color:#fb923c; }
      .sal-cal-day { display:flex; align-items:center; justify-content:space-between; gap:.3rem; font-size:.78rem; font-weight:700; color:#0f172a; }
      .sal-cal-list { display:grid; gap:.2rem; }
      .sal-cal-pill { border:1px solid #fdba74; background:#ffedd5; color:#7c2d12; border-radius:999px; padding:1px 7px; font-size:.67rem; line-height:1.25; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; cursor:pointer; }
      .sal-cal-pill.is-holiday { border-color:#fca5a5; background:#fef2f2; color:#991b1b; }
      .sal-cal-pill.is-event { box-shadow: 0 0 0 1px rgba(234,88,12,.25); }
      .sal-cal-add { margin-top:auto; text-align:left; border:1px dashed #f97316; background:#fff7ed; color:#9a3412; border-radius:8px; padding:.2rem .35rem; font-size:.7rem; cursor:pointer; }
      .sal-history { border:1px solid #fed7aa; border-radius:12px; background:#fff; padding:.7rem; display:grid; gap:.5rem; }
      .sal-history-list { display:grid; gap:.35rem; }
      .sal-history-item { border:1px solid #ffedd5; border-radius:10px; background:#fff7ed; padding:.45rem .55rem; cursor:pointer; display:grid; gap:.2rem; }
      .sal-history-item:hover { border-color:#fdba74; background:#fff1df; }
      .sal-history-actions { display:flex; justify-content:flex-end; }
      .sal-history-meta { font-size:.74rem; color:#9a3412; }
      .sal-modal-bg { position:fixed; inset:0; background:rgba(0,0,0,.5); z-index:45; display:flex; align-items:center; justify-content:center; padding:1rem; }
      .sal-modal { width:min(900px,100%); max-height:92vh; overflow:auto; border-radius:14px; border:2px solid #fb923c; background:linear-gradient(180deg,#fff,#fff7ed); padding:.9rem; display:grid; gap:.75rem; }
      .sal-modal h3 { margin:0; color:#9a3412; font-size:1.03rem; }
      .sal-modal-note { margin:0; font-size:.8rem; color:#64748b; }
      .sal-rich-editor { border:1px solid #fdba74; border-radius:10px; background:#fff; overflow:hidden; }
      .sal-toolbar { display:flex; flex-wrap:wrap; gap:.3rem; padding:.45rem; border-bottom:1px solid #fed7aa; background:#fff7ed; }
      .sal-toolbar button, .sal-toolbar select, .sal-toolbar input { font-size:.72rem; }
      .sal-editor { min-height:140px; padding:.55rem; outline:none; font-size:.9rem; line-height:1.4; }
      .sal-editor .sal-image-wrap { display:inline-block; max-width:100%; min-width:120px; width:320px; border:1px dashed #fdba74; border-radius:8px; overflow:auto; resize:both; margin:.25rem 0; background:#fff; }
      .sal-editor .sal-image-wrap img { width:100%; height:auto; display:block; }
      .sal-editor .sal-image-caption { display:block; font-size:.72rem; color:#9a3412; padding:.15rem .35rem .25rem; border-top:1px solid #ffedd5; }
      .sal-attachments { display:grid; gap:.35rem; }
      .sal-att-item { border:1px solid #e2e8f0; border-radius:8px; padding:.35rem .45rem; display:flex; justify-content:space-between; gap:.5rem; align-items:center; }
      .sal-poll-box { border:1px solid #fdba74; background:#fff7ed; border-radius:10px; padding:.55rem; display:grid; gap:.45rem; }
      .sal-vote-row { display:grid; gap:.3rem; }
      .sal-vote-option { display:flex; align-items:center; justify-content:space-between; border:1px solid #fed7aa; border-radius:8px; padding:.3rem .45rem; background:#fff; }
      .sal-poll-bars { display:grid; gap:.3rem; }
      .sal-poll-bar-item { display:grid; gap:.15rem; }
      .sal-poll-bar-label { font-size:.74rem; color:#7c2d12; display:flex; justify-content:space-between; }
      .sal-poll-bar-track { height:8px; border-radius:999px; background:#ffedd5; overflow:hidden; }
      .sal-poll-bar-fill { height:100%; border-radius:999px; background:#f97316; }
      .sal-rsvp-row { display:flex; gap:.35rem; flex-wrap:wrap; }
      .sal-rsvp-stat { font-size:.75rem; color:#9a3412; border:1px solid #fdba74; border-radius:999px; padding:1px 8px; background:#fff; }
      .sal-rsvp-bars { display:grid; gap:.3rem; }
      .sal-rsvp-bar-item { display:grid; gap:.15rem; }
      .sal-rsvp-bar-label { font-size:.74rem; color:#7c2d12; display:flex; justify-content:space-between; }
      .sal-rsvp-bar-track { height:8px; border-radius:999px; background:#ffedd5; overflow:hidden; }
      .sal-rsvp-bar-fill { height:100%; border-radius:999px; }
      .sal-reason-block { border:1px solid #fed7aa; border-radius:8px; background:#fff; padding:.45rem; display:grid; gap:.35rem; }
    `;
    document.head.appendChild(s);
  }

  function toYmd(dateLike) {
    const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
    if (Number.isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function monthLabelLv(date) {
    return new Intl.DateTimeFormat("lv-LV", { month: "long", year: "numeric" }).format(date);
  }

  function buildMonthGrid(monthDate) {
    const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const startOffset = (first.getDay() + 6) % 7;
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - startOffset);
    const list = [];
    for (let i = 0; i < 42; i += 1) {
      list.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
    }
    return list;
  }

  function actorKey() {
    const id = String(globalThis.__PDD_SESSION_USER_ID__ ?? "").trim();
    if (id) return id;
    const em = String(globalThis.__PDD_ACTOR_EMAIL__ ?? sessionStorage.getItem("pdd_local_email") ?? "").trim().toLowerCase();
    if (em) return em;
    return "anonymous";
  }

  function emptyPoll() {
    return { question: "", options: [], votes: {} };
  }

  function normalizeKeyName(value) {
    return String(value ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  }

  function pickByAliases(obj, aliases, fallback = "") {
    const src = obj && typeof obj === "object" ? obj : {};
    const wanted = new Set((Array.isArray(aliases) ? aliases : []).map((a) => normalizeKeyName(a)));
    for (const [k, v] of Object.entries(src)) {
      if (wanted.has(normalizeKeyName(k)) && v !== undefined && v !== null && String(v) !== "") return v;
    }
    return fallback;
  }

  function parseBool(value) {
    if (typeof value === "boolean") return value;
    const x = String(value ?? "").trim().toLowerCase();
    return ["true", "1", "yes", "ja", "y", "jā"].includes(x);
  }

  function parseOnlinePasakumsCell(value) {
    const s = String(value ?? "").trim().toLowerCase();
    if (!s) return false;
    if (["jā", "ja", "yes", "true", "1", "online", "ir"].includes(s)) return true;
    if (["nē", "ne", "no", "false", "0", "nav"].includes(s)) return false;
    return parseBool(value);
  }

  function splitPapilduPiezimes(raw) {
    const s = String(raw ?? "");
    const idx = s.indexOf(SAL_META_MARKER);
    if (idx < 0) return { note: s.trim(), meta: null };
    const note = s.slice(0, idx).trim();
    try {
      const meta = JSON.parse(s.slice(idx + SAL_META_MARKER.length));
      return { note, meta: meta && typeof meta === "object" ? meta : null };
    } catch {
      return { note: s.trim(), meta: null };
    }
  }

  function cacheSaliedesanaColumnsFromRows(rows) {
    if (!Array.isArray(rows) || !rows.length) return;
    const set = new Set();
    rows.forEach((r) => {
      if (r && typeof r === "object") Object.keys(r).forEach((k) => set.add(k));
    });
    if (set.size) saliedesanaColumnNames = set;
  }

  function resolveWriteKey(candidates) {
    if (!Array.isArray(candidates) || !candidates.length) return null;
    if (saliedesanaColumnNames && saliedesanaColumnNames.size) {
      for (const c of candidates) {
        if (saliedesanaColumnNames.has(c)) return c;
      }
    }
    return candidates[0];
  }

  function pickFromRow(row, candidates, fallback = "") {
    if (!row || typeof row !== "object") return fallback;
    for (const key of candidates) {
      if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
      const v = row[key];
      if (v !== undefined && v !== null && String(v).trim() !== "") return v;
    }
    const want = new Set(candidates.map((c) => normalizeKeyName(c)));
    for (const [k, v] of Object.entries(row)) {
      if (!want.has(normalizeKeyName(k))) continue;
      if (v !== undefined && v !== null && String(v).trim() !== "") return v;
    }
    return fallback;
  }

  function normalizeEvent(raw) {
    const src = raw && typeof raw === "object" ? raw : {};
    const jsonMeta = pickByAliases(src, ["Dati_json", "dati_json", "data_json", "meta_json"], null);
    const metaObj = jsonMeta && typeof jsonMeta === "object" ? jsonMeta : {};
    const details = src.details && typeof src.details === "object" ? src.details : (metaObj.details && typeof metaObj.details === "object" ? metaObj.details : {});
    const poll = src.poll && typeof src.poll === "object" ? src.poll : emptyPoll();
    const participantsRaw = src.participants && typeof src.participants === "object" ? src.participants : {};
    const attachments = Array.isArray(src.attachments) ? src.attachments : [];
    const explicitLocal = String(src.__sal_local_id ?? "").trim();
    const aliasLocal = String(pickByAliases(src, ["local_id", "localId"], "")).trim();
    let rawId = explicitLocal || aliasLocal;
    if (!rawId) {
      const cand = src.id;
      if (cand !== undefined && cand !== null) {
        const s = String(cand).trim();
        if (!s) {
          /* noop */
        } else if (s.startsWith("remote-") || /[a-zA-Z-]/.test(s)) {
          rawId = s;
        } else {
          const n = Number(s);
          if (!Number.isFinite(n) || n > 1e15) rawId = s;
        }
      }
    }
    const explicitRemote = src.__sal_remote_id != null && src.__sal_remote_id !== "" ? Number(src.__sal_remote_id) : NaN;
    let remoteIdValue = Number.isFinite(explicitRemote) && explicitRemote > 0 ? explicitRemote : 0;
    if (!remoteIdValue) remoteIdValue = Number(pickByAliases(src, ["remote_id", "remoteId"], 0)) || 0;
    return {
      id: String(
        rawId ||
          (remoteIdValue ? `remote-${remoteIdValue}` : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
      ),
      remoteId: remoteIdValue > 0 ? remoteIdValue : null,
      date: String(pickFromRow(src, SAL_COL_CANDIDATES.Datums.concat(["event_date", "date"]), "") || pickByAliases(src, ["event_date", "date"], "")).trim(),
      time: String(
        pickFromRow(
          src,
          SAL_COL_CANDIDATES.Sakuma_laiks.concat(["event_time", "time", "no_cikiem"]),
          ""
        ) || pickByAliases(src, ["event_time", "time"], "")
      ).trim(),
      category: String(pickByAliases(src, ["category"], "team")).trim().toLowerCase() === "holiday" ? "holiday" : "team",
      eventType: String(
        pickFromRow(src, SAL_COL_CANDIDATES.Pasakuma_veids.concat(["event_type", "eventType"]), "") ||
          pickByAliases(src, ["event_type", "eventType"], "saliedesana")
      ).trim() || "saliedesana",
      title: String(
        pickFromRow(src, SAL_COL_CANDIDATES.Pasakuma_nosau.concat(["title", "pasakums", "nosaukums"]), "") ||
          pickByAliases(src, ["title", "pasakums", "nosaukums"], "")
      ).trim(),
      location: String(
        pickFromRow(src, SAL_COL_CANDIDATES.Norises_vieta.concat(["location"]), "") || pickByAliases(src, ["location"], "")
      ).trim(),
      online: parseOnlinePasakumsCell(
        pickFromRow(src, SAL_COL_CANDIDATES.Online_pasakums, pickByAliases(src, ["is_online", "online", "vai_online", "attalinati"], src.is_online ?? src.online))
      ),
      shortCategory: String(
        pickFromRow(src, SAL_COL_CANDIDATES.Kategorija.concat(["short_category", "shortCategory"]), "") ||
          pickByAliases(src, ["short_category", "shortCategory"], "")
      ).trim(),
      icon: String(pickByAliases(src, ["icon"], "")).trim(),
      color: String(pickByAliases(src, ["color", "krasa", "krasa"], "")).trim() || "#fb923c",
      descriptionHtml: String(
        pickFromRow(
          src,
          SAL_COL_CANDIDATES.Brivs_apraksts.concat(["description_html", "descriptionHtml", "apraksts_html", "apraksts"]),
          pickByAliases(src, ["description_html", "descriptionHtml", "apraksts_html", "apraksts"], "")
        )
      ).trim(),
      note: String(
        src.__sal_note_clean ??
          pickByAliases(src, ["note", "Papildu_piezimes", "papildu_piezimes", "piezimes", "piezime"], "")
      ).trim(),
      details: {
        eventWhat: String(
          details.eventWhat ??
            pickFromRow(
              src,
              SAL_COL_CANDIDATES.Pasakuma_aprak,
              pickByAliases(src, ["Pasākuma_aprak", "Pasakuma_aprak", "Pasakuma_apraksts", "Pasākuma_apraksts", "pasakuma_apraksts"], "")
            )
        ).trim(),
        whyJoin: String(
          details.whyJoin ??
            pickFromRow(
              src,
              SAL_COL_CANDIDATES.Kapac_piedalītie.concat(["kapec_piedalities"]),
              pickByAliases(src, ["kapec_piedalities"], "")
            )
        ).trim(),
        whatExpect: String(
          details.whatExpect ?? pickFromRow(src, SAL_COL_CANDIDATES.Ko_sagaidit, pickByAliases(src, ["Ko_sagaidit", "ko_sagaidit"], ""))
        ).trim(),
        dressCode: String(
          details.dressCode ?? pickFromRow(src, SAL_COL_CANDIDATES.Dress_code, pickByAliases(src, ["Dress_code", "dress_code"], ""))
        ).trim(),
        bringAlong: String(
          details.bringAlong ??
            pickFromRow(src, SAL_COL_CANDIDATES.Ko_nemt_lidzi, pickByAliases(src, ["Ko_nemt_lidzi", "ko_nemt_lidzi"], ""))
        ).trim(),
        fee: String(
          details.fee ?? pickFromRow(src, SAL_COL_CANDIDATES.Dalibas_maksa, pickByAliases(src, ["Dalibas_maksa", "dalibas_maksa"], ""))
        ).trim(),
        timeTo: String(
          details.timeTo ??
            pickFromRow(
              src,
              SAL_COL_CANDIDATES.Beigu_laiks.concat(["time_to", "beigas_laiks", "lidz"]),
              pickByAliases(src, ["time_to", "beigas_laiks", "lidz"], "")
            )
        ).trim(),
        showInAktualitates: Boolean(details.showInAktualitates ?? parseBool(pickByAliases(src, ["Radit_aktualitates", "radit_aktualitates", "vai_radit_aktualitates", "publicet_aktualitates"], false))),
        aktualitatesId: Number((details.aktualitatesId ?? pickByAliases(src, ["Aktualitates_id", "aktualitates_id"], 0)) || 0) || null,
      },
      poll: {
        question: String(poll.question ?? "").trim(),
        options: Array.isArray(poll.options) ? poll.options.map((x) => String(x ?? "").trim()).filter(Boolean) : [],
        votes: poll.votes && typeof poll.votes === "object" ? poll.votes : {},
        items: Array.isArray(poll.items)
          ? poll.items.map((p) => ({
              id: String(p?.id ?? ""),
              question: String(p?.question ?? "").trim(),
              options: Array.isArray(p?.options) ? p.options.map((x) => String(x ?? "").trim()).filter(Boolean) : [],
              votes: p?.votes && typeof p.votes === "object" ? p.votes : {},
            }))
          : [],
      },
      participants: Object.fromEntries(
        Object.entries(participantsRaw).map(([k, v]) => {
          if (v && typeof v === "object") {
            return [
              k,
              {
                status: String(v.status ?? "").trim() || "maybe",
                reasonType: String(v.reasonType ?? "").trim(),
                reasonText: String(v.reasonText ?? "").trim(),
              },
            ];
          }
          return [k, { status: String(v ?? "").trim() || "maybe", reasonType: "", reasonText: "" }];
        })
      ),
      attachments: attachments
        .map((a) => ({
          label: String(a?.label ?? "").trim(),
          url: String(a?.url ?? "").trim(),
          kind: String(a?.kind ?? "").trim() || "link",
        }))
        .filter((a) => a.label && a.url),
      createdAt: String(src.created_at ?? src.createdAt ?? ""),
      updatedAt: String(src.updated_at ?? src.updatedAt ?? ""),
    };
  }

  function buildPapilduPiezimes(noteText, metaPack) {
    const note = String(noteText ?? "").trim();
    try {
      const payload = metaPack && typeof metaPack === "object" ? metaPack : {};
      return (note ? note : "") + SAL_META_MARKER + JSON.stringify(payload);
    } catch {
      return note || null;
    }
  }

  function buildSaliedesanaDbPayload(ev) {
    const details = ev?.details && typeof ev.details === "object" ? ev.details : {};
    const metaPack = {
      local_id: ev.id,
      remote_id: ev.remoteId || null,
      event_type: ev.eventType || "saliedesana",
      category: ev.category || "team",
      icon: ev.icon || "",
      color: ev.color || "",
      short_category: ev.shortCategory || "",
      poll: ev.poll || emptyPoll(),
      participants: ev.participants || {},
      attachments: Array.isArray(ev.attachments) ? ev.attachments : [],
      details: {
        ...(details || {}),
        showInAktualitates: Boolean(details.showInAktualitates),
        aktualitatesId: Number(details.aktualitatesId || 0) || null,
      },
    };
    const loc = String(ev.location || "").trim();
    const vieta = ev.online ? (loc && loc.toLowerCase() !== "online" ? loc : "online") : loc || null;
    const out = {};
    const put = (candList, val) => {
      const key = resolveWriteKey(candList);
      if (!key) return;
      out[key] = val;
    };
    put(SAL_COL_CANDIDATES.Datums, ev.date || null);
    put(SAL_COL_CANDIDATES.Sakuma_laiks, ev.time || null);
    put(SAL_COL_CANDIDATES.Pasakuma_nosau, ev.title || "");
    put(SAL_COL_CANDIDATES.Pasakuma_veids, ev.eventType || "saliedesana");
    put(SAL_COL_CANDIDATES.Beigu_laiks, details.timeTo || null);
    put(SAL_COL_CANDIDATES.Online_pasakums, ev.online ? "Jā" : "Nē");
    put(SAL_COL_CANDIDATES.Norises_vieta, vieta);
    put(SAL_COL_CANDIDATES.Kategorija, ev.shortCategory || ev.category || null);
    put(SAL_COL_CANDIDATES.Pasakuma_aprak, details.eventWhat || null);
    put(SAL_COL_CANDIDATES.Kapac_piedalītie, details.whyJoin || null);
    put(SAL_COL_CANDIDATES.Ko_sagaidit, details.whatExpect || null);
    put(SAL_COL_CANDIDATES.Dress_code, details.dressCode || null);
    put(SAL_COL_CANDIDATES.Ko_nemt_lidzi, details.bringAlong || null);
    put(SAL_COL_CANDIDATES.Dalibas_maksa, details.fee || null);
    put(SAL_COL_CANDIDATES.Brivs_apraksts, ev.descriptionHtml || null);
    put(SAL_COL_CANDIDATES.Papildu_piezimes, buildPapilduPiezimes(ev.note, metaPack));
    return out;
  }

  /** Payload tikai public."Saliedesana" kolonnām (bez Dati_json u.c.). */
  function eventToRemoteRow(ev) {
    return buildSaliedesanaDbPayload(ev);
  }

  async function selectRemoteRowsSafe(supabase) {
    const q = await supabase.from(REMOTE_TABLE).select("*");
    if (q.error) throw q.error;
    const data = Array.isArray(q.data) ? q.data : [];
    cacheSaliedesanaColumnsFromRows(data);
    return data;
  }

  function prunePayloadByMissingColumn(payload, error) {
    const msg = String(error?.message || "");
    // Atbalsta arī kolonnas ar atstarpēm/diakritiku, piem.: "Online pasākums"
    const quoted = /column\s+"([^"]+)"\s+does not exist/i.exec(msg);
    const plain = /column\s+([^\s]+)\s+does not exist/i.exec(msg);
    const schemaCache = /could not find the '([^']+)' column/i.exec(msg);
    let missing = String(quoted?.[1] || plain?.[1] || schemaCache?.[1] || "").trim();
    if (missing.includes(".")) missing = missing.split(".").pop() || missing;
    missing = missing.replace(/^"+|"+$/g, "");
    if (!missing) return null;
    const next = { ...payload };
    const removed = Object.keys(next).find((k) => normalizeKeyName(k) === normalizeKeyName(missing));
    if (!removed) return null;
    delete next[removed];
    return next;
  }

  function generateRemoteIntId() {
    const base = Date.now();
    const suffix = Math.floor(Math.random() * 1000);
    return Number(`${base}${String(suffix).padStart(3, "0")}`);
  }

  async function saveRemoteAdaptive(supabase, idNum, payload) {
    let current = { ...payload };
    if (!idNum) delete current.id;
    let lastErr = null;
    for (let i = 0; i < 80; i += 1) {
      if (!Object.keys(current).length) break;
      const q = idNum
        ? await supabase.from(REMOTE_TABLE).update(current).eq("id", idNum).select("id").limit(1)
        : await supabase.from(REMOTE_TABLE).insert(current).select("id").limit(1);
      if (!q.error) return Number(q.data?.[0]?.id || idNum || 0) || null;
      lastErr = q.error;
      if (!idNum && /null value in column "?id"?/i.test(String(q.error?.message || ""))) {
        current = { ...current, id: generateRemoteIntId() };
        continue;
      }
      const trimmed = prunePayloadByMissingColumn(current, q.error);
      if (!trimmed) break;
      current = trimmed;
    }
    // Pēdējais mēģinājums ar minimālo kolonnu komplektu (ja tabulai ir tikai bāzes ailes).
    if (!idNum) {
      const kDat = resolveWriteKey(SAL_COL_CANDIDATES.Datums);
      const kTit = resolveWriteKey(SAL_COL_CANDIDATES.Pasakuma_nosau);
      const fallback = {};
      if (kDat) fallback[kDat] = current[kDat] ?? null;
      if (kTit) fallback[kTit] = String(current[kTit] ?? "").trim() || "";
      if (!Object.keys(fallback).length) {
        fallback.Datums = current.Datums ?? null;
        fallback.Pasakuma_nosau = current.Pasakuma_nosau || current.Pasakuma_nosaukums || "";
      }
      const ins = await supabase.from(REMOTE_TABLE).insert(fallback).select("id").limit(1);
      if (!ins.error) return Number(ins.data?.[0]?.id || 0) || null;
      lastErr = ins.error;
    }
    throw lastErr || new Error("Neizdevās saglabāt Saliedesana ierakstu.");
  }

  function loadLocalEvents() {
    try {
      const parsed = JSON.parse(localStorage.getItem(LS_EVENTS_KEY) || "[]");
      if (!Array.isArray(parsed)) return [];
      return parsed.map(normalizeEvent).filter((x) => x.id && x.date && x.title);
    } catch {
      return [];
    }
  }

  function saveLocalEvents(events) {
    try {
      localStorage.setItem(LS_EVENTS_KEY, JSON.stringify(Array.isArray(events) ? events : []));
    } catch {
      // ignore
    }
    try {
      globalThis.__PDD_SALIEDESANA_REPAINT_MAIN_CALENDAR__?.();
    } catch {
      // ignore
    }
  }

  function loadLocalAktualitatesRows() {
    try {
      const parsed = JSON.parse(localStorage.getItem(LS_AKTUALITATES_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveLocalAktualitatesRows(rows) {
    try {
      localStorage.setItem(LS_AKTUALITATES_KEY, JSON.stringify(Array.isArray(rows) ? rows : []));
    } catch {
      // ignore
    }
    try {
      globalThis.__PDD_REFRESH_SODIEN_AKTUALITATES__?.();
    } catch {
      // ignore
    }
  }

  function upsertLocalAktualitateFromEvent(eventRow) {
    const ev = eventRow && typeof eventRow === "object" ? eventRow : {};
    const eventDate = String(ev?.date || "").trim();
    const today = toYmd(new Date());
    const start = today;
    const end = eventDate && eventDate >= today ? eventDate : today;
    const tFrom = String(ev?.time || "").trim();
    const tTo = String(ev?.details?.timeTo || "").trim();
    const icon = String(ev?.icon || "").trim();
    const title = String(ev?.title || "").trim() || "Pasākums";
    const location = ev?.online ? "online" : String(ev?.location || "").trim();
    const marker = `<!--SALIEDESANA:${String(ev?.id || "").trim()}-->`;
    const html = `${icon ? `${icon} ` : ""}${title}${tFrom ? ` (${tFrom}${tTo ? `-${tTo}` : ""})` : ""}${location ? ` · ${location}` : ""}${marker}`;
    const localId = `sal-${String(ev?.id || "").trim()}`;
    if (!localId || localId === "sal-") return null;
    const rows = loadLocalAktualitatesRows();
    const authorLabel = String(globalThis.__PDD_ACTOR_DISPLAY_NAME__ || globalThis.__PDD_ACTOR_EMAIL__ || "—").trim() || "—";
    const row = {
      id: localId,
      dbRowId: null,
      canMutateRemote: true,
      html,
      start,
      end,
      use_period: start !== end,
      created_at: new Date().toISOString(),
      autors_id: String(globalThis.__PDD_SESSION_USER_ID__ || "").trim() || null,
      authorLabel,
    };
    const idx = rows.findIndex((x) => String(x?.id || "") === localId || String(x?.html || "").includes(`SALIEDESANA:${String(ev?.id || "").trim()}`));
    if (idx >= 0) rows[idx] = { ...rows[idx], ...row };
    else rows.unshift(row);
    saveLocalAktualitatesRows(rows);
    return localId;
  }

  function deleteLocalAktualitateByEventId(eventLocalId) {
    const id = String(eventLocalId || "").trim();
    if (!id) return;
    const rows = loadLocalAktualitatesRows();
    const next = rows.filter(
      (x) =>
        String(x?.id || "") !== `sal-${id}` &&
        !String(x?.html || "").includes(`SALIEDESANA:${id}`)
    );
    saveLocalAktualitatesRows(next);
  }

  async function fetchRemoteEvents(supabase) {
    const rows = await selectRemoteRowsSafe(supabase);
    return rows
      .map((r) => {
        const rawMeta = pickByAliases(r, ["Dati_json", "dati_json", "data_json", "meta_json"], null);
        const legacyMeta = rawMeta && typeof rawMeta === "object" ? rawMeta : {};
        const pap = String(pickByAliases(r, ["Papildu_piezimes", "papildu_piezimes"], "") || "");
        const split = splitPapilduPiezimes(pap);
        const embedded = split.meta && typeof split.meta === "object" ? split.meta : {};
        const papNote = split.meta ? split.note : pap.trim();
        const localIdStr = String(embedded.local_id || legacyMeta.local_id || `remote-${String(r?.id ?? "")}`).trim();
        return normalizeEvent({
          ...legacyMeta,
          ...embedded,
          ...r,
          __sal_note_clean: papNote,
          __sal_local_id: localIdStr,
          __sal_remote_id: r?.id != null ? Number(r.id) : null,
          local_id: localIdStr,
          remote_id: r?.id,
          poll: embedded.poll || legacyMeta.poll,
          participants: embedded.participants || legacyMeta.participants || {},
          attachments: Array.isArray(embedded.attachments)
            ? embedded.attachments
            : Array.isArray(legacyMeta.attachments)
              ? legacyMeta.attachments
              : [],
          date: String(pickFromRow(r, SAL_COL_CANDIDATES.Datums.concat(["event_date", "date"]), "") || "").trim(),
          time: String(pickFromRow(r, SAL_COL_CANDIDATES.Sakuma_laiks.concat(["event_time", "time"]), "") || "").trim(),
          title: String(pickFromRow(r, SAL_COL_CANDIDATES.Pasakuma_nosau.concat(["title", "nosaukums"]), "") || "").trim(),
          details: {
            ...(legacyMeta.details && typeof legacyMeta.details === "object" ? legacyMeta.details : {}),
            ...(embedded.details && typeof embedded.details === "object" ? embedded.details : {}),
            timeTo: String(
              pickByAliases(r, ["Beigu_laiks", "beigu_laiks", "Lidz_cikiem", "lidz_cikiem", "time_to"], "")
            ),
            showInAktualitates: Boolean(
              embedded?.details?.showInAktualitates ??
                legacyMeta?.details?.showInAktualitates ??
                pickByAliases(r, ["Radit_aktualitates", "radit_aktualitates", "vai_radit_aktualitates"], false)
            ),
            aktualitatesId:
              Number(
                embedded?.details?.aktualitatesId ??
                  legacyMeta?.details?.aktualitatesId ??
                  (pickByAliases(r, ["Aktualitates_id", "aktualitates_id"], 0) || 0)
              ) || null,
          },
        });
      })
      .filter((x) => x.id && x.date && x.title)
      .sort((a, b) => `${String(b.date)} ${String(b.time || "")}`.localeCompare(`${String(a.date)} ${String(a.time || "")}`));
  }

  async function upsertRemoteEvent(supabase, eventRow) {
    const row = eventToRemoteRow(eventRow);
    const idNum = Number(eventRow?.remoteId || 0) || null;
    return saveRemoteAdaptive(supabase, idNum, row);
  }

  async function deleteRemoteEvent(supabase, remoteId) {
    const idNum = Number(remoteId || 0) || null;
    if (!idNum) return;
    const r = await supabase.from(REMOTE_TABLE).delete().eq("id", idNum);
    if (r.error) throw r.error;
  }

  function paintMainCalendarBadgesFromLocal() {
    if (typeof document === "undefined") return;
    const events = loadLocalEvents();
    const cells = Array.from(document.querySelectorAll(".cal-wrap .cal-cell"));
    cells.forEach((c) => {
      c.querySelectorAll(".sal-main-cal-badge-wrap, .sal-main-cal-badge").forEach((n) => n.remove());
    });
    if (!events.length) return;
    const byDate = new Map();
    events.forEach((ev) => {
      const key = String(ev?.date || "").trim();
      const title = String(ev?.title || "").trim();
      if (!key || !title) return;
      const list = byDate.get(key) || [];
      list.push(ev);
      byDate.set(key, list);
    });
    if (!byDate.size) return;
    const calRows = Array.from(document.querySelectorAll(".cal-wrap .cal-grid .cal-cell"));
    calRows.forEach((cell) => {
      const dayNum = Number(String(cell.querySelector(".cal-day-num")?.textContent ?? "").trim());
      if (!dayNum) return;
      const head = cell.closest(".cal-wrap")?.querySelector(".cal-head strong");
      const title = String(head?.textContent ?? "").trim().toLowerCase();
      const months = ["janvaris", "februaris", "marts", "aprilis", "maijs", "junijs", "julijs", "augusts", "septembris", "oktobris", "novembris", "decembris"];
      const m = /([^\d]+)\s+(\d{4})/.exec(title);
      if (!m) return;
      const month = months.indexOf(m[1].trim().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
      const year = Number(m[2]);
      if (month < 0 || !Number.isFinite(year)) return;
      const dKey = toYmd(new Date(year, month, dayNum));
      const dayEvents = (byDate.get(dKey) || []).sort((a, b) => String(a?.time || "").localeCompare(String(b?.time || "")));
      if (!dayEvents.length) return;
      const wrap = document.createElement("div");
      wrap.className = "sal-main-cal-badge-wrap";
      wrap.style.cssText = "display:grid;gap:3px;margin-top:4px;";
      dayEvents.slice(0, 2).forEach((ev) => {
        const badge = document.createElement("span");
        badge.className = "sal-main-cal-badge";
        const icon = String(ev?.icon || "").trim() || "✨";
        const txt = String(ev?.title || "").trim();
        badge.textContent = `${icon} ${txt}`;
        badge.title = txt;
        badge.style.cssText =
          "display:inline-flex;max-width:100%;padding:1px 6px;border-radius:999px;background:#f97316;color:#fff;font-size:10px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
        wrap.appendChild(badge);
      });
      if (dayEvents.length > 2) {
        const more = document.createElement("span");
        more.className = "sal-main-cal-badge";
        more.textContent = `+${dayEvents.length - 2} vēl`;
        more.style.cssText =
          "display:inline-flex;padding:1px 6px;border-radius:999px;background:#fdba74;color:#7c2d12;font-size:10px;font-weight:700;";
        wrap.appendChild(more);
      }
      cell.appendChild(wrap);
    });
  }

  function installGlobalMainCalendarBadgeSync() {
    if (typeof document === "undefined") return;
    if (globalThis.__PDD_SALIEDESANA_MAIN_CAL_SYNC__) return;
    globalThis.__PDD_SALIEDESANA_MAIN_CAL_SYNC__ = true;
    globalThis.__PDD_SALIEDESANA_REPAINT_MAIN_CALENDAR__ = paintMainCalendarBadgesFromLocal;
    paintMainCalendarBadgesFromLocal();
    let painting = false;
    let scheduled = false;
    const requestPaint = () => {
      if (painting || scheduled) return;
      scheduled = true;
      const run = () => {
        scheduled = false;
        painting = true;
        try {
          paintMainCalendarBadgesFromLocal();
        } finally {
          painting = false;
        }
      };
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
      else setTimeout(run, 0);
    };
    const observer = new MutationObserver((mutations) => {
      const shouldRepaint = (mutations || []).some((m) => {
        const t = m?.target;
        if (!(t instanceof Element)) return false;
        if (t.closest?.(".sal-main-cal-badge-wrap")) return false;
        if (t.matches?.(".sal-main-cal-badge, .sal-main-cal-badge-wrap")) return false;
        return Boolean(t.closest?.(".cal-wrap") || t.querySelector?.(".cal-wrap"));
      });
      if (shouldRepaint) requestPaint();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function createSaliedesanaPanel(html, React) {
    const { useMemo, useState, useEffect, useRef } = React;
    const DOW_LV = ["Pr", "Ot", "Tr", "Ce", "Pk", "Se", "Sv"];

      function escapeHtmlAttr(value) {
        return String(value ?? "")
          .replace(/&/g, "&amp;")
          .replace(/"/g, "&quot;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
      }

    function formatDateTime(ev) {
      const d = String(ev?.date ?? "").trim();
      const t = String(ev?.time ?? "").trim();
      const tt = String(ev?.details?.timeTo ?? "").trim();
      if (d && t && tt) return `${d} ${t}-${tt}`;
      if (d && t) return `${d} ${t}`;
      return d || "—";
    }

    function applyEditorCommand(cmd, value = null) {
      try {
        if (typeof document !== "undefined" && document.execCommand) {
          document.execCommand(cmd, false, value);
        }
      } catch {
        // ignore
      }
    }

    function openUrlSafe(url) {
      const href = String(url ?? "").trim();
      if (!href) return;
      const safe = /^(https?:\/\/|data:image\/)/i.test(href) ? href : `https://${href}`;
      window.open(safe, "_blank", "noopener,noreferrer");
    }

    async function resolveAktualitatesTableName(supabase) {
      const hinted = String(globalThis.__PDD_AKTUALITATES_TABLE__ || "").trim();
      const candidates = [hinted, "AKTUALITATES", "aktualitates", "Aktualitates"].filter(Boolean);
      for (const table of [...new Set(candidates)]) {
        const q = await supabase.from(table).select("id").limit(1);
        if (!q.error) {
          globalThis.__PDD_AKTUALITATES_TABLE__ = table;
          return table;
        }
      }
      return null;
    }

    async function upsertAktualitateFromEvent(supabase, eventRow) {
      upsertLocalAktualitateFromEvent(eventRow);
      const table = await resolveAktualitatesTableName(supabase);
      if (!table) return null;
      const eventDate = String(eventRow?.date || "").trim();
      const today = toYmd(new Date());
      // "Aktualitātes" panelis rāda ierakstus, kur šodiena ir intervālā [Sakums, Beigas].
      // Tāpēc publicētos pasākumus sākam rādīt no šodienas līdz pasākuma datumam.
      const startDate = today;
      const endDate = eventDate && eventDate >= today ? eventDate : today;
      const tFrom = String(eventRow?.time || "").trim();
      const tTo = String(eventRow?.details?.timeTo || "").trim();
      const icon = String(eventRow?.icon || "").trim();
      const title = String(eventRow?.title || "").trim() || "Pasākums";
      const location = eventRow?.online ? "online" : String(eventRow?.location || "").trim();
      const marker = `<!--SALIEDESANA:${String(eventRow?.id || "").trim()}-->`;
      const text = `${icon ? `${icon} ` : ""}${title}${tFrom ? ` (${tFrom}${tTo ? `-${tTo}` : ""})` : ""}${location ? ` · ${location}` : ""}${marker}`;
      const payload = {
        Kas_sodien_vel_aktuals: text,
        Sakums: startDate,
        Beigas: endDate,
      };
      const existingId = Number(eventRow?.details?.aktualitatesId || 0) || null;
      if (existingId) {
        const q = await supabase.from(table).update(payload).eq("id", existingId).select("id").limit(1);
        if (q.error) throw q.error;
        return Number(q.data?.[0]?.id || existingId) || null;
      }
      const lookup = await supabase
        .from(table)
        .select("id, Kas_sodien_vel_aktuals")
        .lte("Sakums", today)
        .gte("Beigas", today)
        .order("id", { ascending: false })
        .limit(80);
      if (!lookup.error) {
        const rows = Array.isArray(lookup.data) ? lookup.data : [];
        const found = rows.find((x) => String(x?.Kas_sodien_vel_aktuals || "").includes(marker));
        if (found?.id) {
          const q = await supabase.from(table).update(payload).eq("id", Number(found.id)).select("id").limit(1);
          if (q.error) throw q.error;
          return Number(q.data?.[0]?.id || found.id) || null;
        }
      }
      const uid = Number(globalThis.__PDD_SESSION_USER_ID__ || 0) || null;
      const q = await supabase.from(table).insert(uid ? { ...payload, Autors: uid } : payload).select("id").limit(1);
      if (q.error) throw q.error;
      return Number(q.data?.[0]?.id || 0) || null;
    }

    async function deleteAktualitateById(supabase, aktId) {
      const table = await resolveAktualitatesTableName(supabase);
      const idNum = Number(aktId || 0) || null;
      if (!table || !idNum) return;
      const q = await supabase.from(table).delete().eq("id", idNum);
      if (q.error) throw q.error;
    }

    async function deleteAktualitateByMarker(supabase, eventLocalId) {
      deleteLocalAktualitateByEventId(eventLocalId);
      const table = await resolveAktualitatesTableName(supabase);
      const marker = `SALIEDESANA:${String(eventLocalId || "").trim()}`;
      if (!table || !eventLocalId) return;
      const q = await supabase.from(table).select("id, Kas_sodien_vel_aktuals").order("id", { ascending: false }).limit(200);
      if (q.error) throw q.error;
      const rows = Array.isArray(q.data) ? q.data : [];
      const ids = rows
        .filter((x) => String(x?.Kas_sodien_vel_aktuals || "").includes(marker))
        .map((x) => Number(x?.id || 0))
        .filter(Boolean);
      if (!ids.length) return;
      const del = await supabase.from(table).delete().in("id", ids);
      if (del.error) throw del.error;
    }

    return function SaliedesanaPanel() {
      ensureStyles();
      const editorRef = useRef(null);
      const supabase = globalThis.__PDD_SUPABASE__ ?? null;
      const [dbMessage, setDbMessage] = useState("");
      const [events, setEvents] = useState([]);
      const [calendarMonth, setCalendarMonth] = useState(new Date());
      const [openHistory, setOpenHistory] = useState(false);
      const [cardOpen, setCardOpen] = useState(false);
      const [editingId, setEditingId] = useState("");
      const [cardDate, setCardDate] = useState("");
      const [cardCategory, setCardCategory] = useState("team");
      const [cardEventType, setCardEventType] = useState("saliedesana");
      const [cardTitle, setCardTitle] = useState("");
      const [cardTime, setCardTime] = useState("18:00");
      const [cardTimeTo, setCardTimeTo] = useState("");
      const [cardLocation, setCardLocation] = useState("");
      const [cardOnline, setCardOnline] = useState(false);
      const [cardShortCategory, setCardShortCategory] = useState("sports");
      const [cardIcon, setCardIcon] = useState("🎉");
      const [cardColor, setCardColor] = useState("#fb923c");
      const [cardNote, setCardNote] = useState("");
      const [descHtml, setDescHtml] = useState("");
      const [detailEventWhat, setDetailEventWhat] = useState("");
      const [detailWhyJoin, setDetailWhyJoin] = useState("");
      const [detailWhatExpect, setDetailWhatExpect] = useState("");
      const [detailDressCode, setDetailDressCode] = useState("");
      const [detailBringAlong, setDetailBringAlong] = useState("");
      const [detailFee, setDetailFee] = useState("");
      const [attLabel, setAttLabel] = useState("");
      const [attUrl, setAttUrl] = useState("");
      const [attachments, setAttachments] = useState([]);
      const [polls, setPolls] = useState([
        { id: "poll-1", type: "choice", question: "", optionsText: "", votes: {}, textAnswer: "" },
      ]);
      const [participants, setParticipants] = useState({});
      const [noReasonType, setNoReasonType] = useState("");
      const [noReasonText, setNoReasonText] = useState("");
      const [showInAktualitates, setShowInAktualitates] = useState(false);

      const monthGrid = useMemo(() => buildMonthGrid(calendarMonth), [calendarMonth]);

      const sortedEvents = useMemo(
        () =>
          [...events].sort((a, b) => {
            const ak = `${String(a.date || "")} ${String(a.time || "")}`.trim();
            const bk = `${String(b.date || "")} ${String(b.time || "")}`.trim();
            return bk.localeCompare(ak);
          }),
        [events]
      );

      useEffect(() => {
        let cancelled = false;
        (async () => {
          try {
            if (!supabase) {
              if (!cancelled) setEvents(loadLocalEvents());
              return;
            }
            const remote = await fetchRemoteEvents(supabase);
            if (!cancelled) {
              const local = loadLocalEvents();
              const localByRemote = new Map(
                local
                  .filter((x) => Number(x?.remoteId || 0))
                  .map((x) => [Number(x.remoteId), x])
              );
              const mergedRemote = remote.map((r) => {
                const prev = localByRemote.get(Number(r.remoteId || 0));
                if (!prev) return r;
                return normalizeEvent({
                  ...prev,
                  ...r,
                  details: { ...(prev.details || {}), ...(r.details || {}) },
                  poll: r.poll?.items?.length ? r.poll : prev.poll,
                  participants: Object.keys(r.participants || {}).length ? r.participants : prev.participants,
                  attachments: Array.isArray(r.attachments) && r.attachments.length ? r.attachments : prev.attachments,
                });
              });
              // Saglabājam arī lokālos ierakstus, kas vēl nav nonākuši DB.
              const unsyncedLocal = local.filter((x) => !Number(x?.remoteId || 0));
              const merged = [...mergedRemote, ...unsyncedLocal].sort((a, b) => {
                const ak = `${String(a.date || "")} ${String(a.time || "")}`.trim();
                const bk = `${String(b.date || "")} ${String(b.time || "")}`.trim();
                return bk.localeCompare(ak);
              });
              setEvents(merged);
              saveLocalEvents(merged);
              setDbMessage("");
            }
          } catch (e) {
            const local = loadLocalEvents();
            if (!cancelled) {
              setEvents(local);
              const msg = String(e?.message || "");
              if (/relation .* does not exist|table .* does not exist/i.test(msg)) {
                setDbMessage("DB tabula nav izveidota. SQL izveide pieejama SALIEDESANA.DB_SQL_SETUP (tabula Saliedesana).");
              } else {
                setDbMessage("");
              }
            }
          }
        })();
        return () => {
          cancelled = true;
        };
      }, [supabase]);

      useEffect(() => {
        globalThis.__PDD_SALIEDESANA_REPAINT_MAIN_CALENDAR__?.();
      }, [events]);

      function moveMonth(delta) {
        setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
      }

      function openCardCreate(dateKey) {
        setEditingId("");
        setCardDate(dateKey);
        setCardCategory("team");
        setCardEventType("saliedesana");
        setCardTitle("");
        setCardTime("18:00");
        setCardTimeTo("");
        setCardLocation("");
        setCardOnline(false);
        setCardShortCategory("sports");
        setCardIcon("🎉");
        setCardColor("#fb923c");
        setCardNote("");
        setDescHtml("");
        setDetailEventWhat("");
        setDetailWhyJoin("");
        setDetailWhatExpect("");
        setDetailDressCode("");
        setDetailBringAlong("");
        setDetailFee("");
        setAttLabel("");
        setAttUrl("");
        setAttachments([]);
        setPolls([{ id: "poll-1", type: "choice", question: "", optionsText: "", votes: {}, textAnswer: "" }]);
        setParticipants({});
        setNoReasonType("");
        setNoReasonText("");
        setShowInAktualitates(false);
        setCardOpen(true);
      }

      function openCardEdit(ev) {
        if (!ev) return;
        setEditingId(ev.id);
        setCardDate(ev.date || "");
        setCardCategory(ev.category || "team");
        setCardEventType(ev.eventType || "saliedesana");
        setCardTitle(ev.title || "");
        setCardTime(ev.time || "");
        setCardTimeTo(ev.details?.timeTo || "");
        setCardLocation(ev.location || "");
        setCardOnline(Boolean(ev.online));
        setCardShortCategory(ev.shortCategory || "sports");
        setCardIcon(ev.icon || "🎉");
        setCardColor(ev.color || "#fb923c");
        setCardNote(ev.note || "");
        setDescHtml(ev.descriptionHtml || "");
        setDetailEventWhat(ev.details?.eventWhat || "");
        setDetailWhyJoin(ev.details?.whyJoin || "");
        setDetailWhatExpect(ev.details?.whatExpect || "");
        setDetailDressCode(ev.details?.dressCode || "");
        setDetailBringAlong(ev.details?.bringAlong || "");
        setDetailFee(ev.details?.fee || "");
        setAttachments(Array.isArray(ev.attachments) ? ev.attachments : []);
        const eventPolls = Array.isArray(ev.poll?.items) && ev.poll.items.length
          ? ev.poll.items.map((p, idx) => ({
              id: String(p?.id ?? `poll-${idx + 1}`),
              type: String(p?.type ?? "choice") === "text" ? "text" : "choice",
              question: String(p?.question ?? ""),
              optionsText: (Array.isArray(p?.options) ? p.options : []).join("\n"),
              votes: p?.votes && typeof p.votes === "object" ? p.votes : {},
              textAnswer: String((p?.votes && typeof p.votes === "object" ? p.votes[actorKey()] : "") || ""),
            }))
          : [{
              id: "poll-1",
              type: String(ev.poll?.type ?? "choice") === "text" ? "text" : "choice",
              question: String(ev.poll?.question || ""),
              optionsText: (Array.isArray(ev.poll?.options) ? ev.poll.options : []).join("\n"),
              votes: ev.poll?.votes && typeof ev.poll.votes === "object" ? ev.poll.votes : {},
              textAnswer: String((ev.poll?.votes && typeof ev.poll.votes === "object" ? ev.poll.votes[actorKey()] : "") || ""),
            }];
        setPolls(eventPolls);
        setParticipants(ev.participants && typeof ev.participants === "object" ? ev.participants : {});
        const me = actorKey();
        const mine = ev.participants?.[me];
        setNoReasonType(String(mine?.reasonType ?? ""));
        setNoReasonText(String(mine?.reasonText ?? ""));
        setShowInAktualitates(Boolean(ev.details?.showInAktualitates));
        setCardOpen(true);
      }

      function addAttachment(kind = "link") {
        const label = String(attLabel || "").trim();
        const url = String(attUrl || "").trim();
        if (!label || !url) return;
        setAttachments((prev) => [...prev, { label, url, kind }]);
        if (kind === "image") {
          const safeUrl = /^https?:\/\//i.test(url) || /^data:image\//i.test(url) ? url : `https://${url}`;
          const safeLabel = escapeHtmlAttr(label || "Attēls");
          const safeSrc = escapeHtmlAttr(safeUrl);
          setDescHtml((prev) => `${String(prev || "")}<div class="sal-image-wrap"><img src="${safeSrc}" alt="${safeLabel}" /><span class="sal-image-caption">${safeLabel}</span></div>`);
        }
        setAttLabel("");
        setAttUrl("");
      }

      function addImageFromFile(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = String(reader.result || "");
          if (!dataUrl) return;
          const fallback = file.name ? file.name.replace(/\.[^.]+$/, "") : "Attēls";
          setAttachments((prev) => [...prev, { label: fallback, url: dataUrl, kind: "image" }]);
          const safeLabel = escapeHtmlAttr(fallback);
          const safeSrc = escapeHtmlAttr(dataUrl);
          setDescHtml((prev) => `${String(prev || "")}<div class="sal-image-wrap"><img src="${safeSrc}" alt="${safeLabel}" /><span class="sal-image-caption">${safeLabel}</span></div>`);
        };
        reader.readAsDataURL(file);
      }

      function pollOptionsArray(textValue) {
        return String(textValue || "")
          .split(/\r?\n/)
          .map((x) => x.trim())
          .filter(Boolean);
      }

      function pollItemsFromState() {
        return (Array.isArray(polls) ? polls : [])
          .map((p, idx) => ({
            id: String(p?.id ?? `poll-${idx + 1}`),
            type: String(p?.type ?? "choice") === "text" ? "text" : "choice",
            question: String(p?.question ?? "").trim(),
            options: pollOptionsArray(p?.optionsText),
            votes: p?.votes && typeof p.votes === "object" ? p.votes : {},
            textAnswer: String(p?.textAnswer ?? "").trim(),
          }))
          .filter((p) => p.question || p.options.length);
      }

      function rsvpCounts(src) {
        const map = src && typeof src === "object" ? src : {};
        const counts = { yes: 0, maybe: 0, no: 0 };
        Object.values(map).forEach((v) => {
          const status = v && typeof v === "object" ? v.status : v;
          if (status === "yes") counts.yes += 1;
          else if (status === "maybe") counts.maybe += 1;
          else if (status === "no") counts.no += 1;
        });
        return counts;
      }

      async function persistEvents(nextEvents, changedRow) {
        setEvents(nextEvents);
        saveLocalEvents(nextEvents);
        if (!changedRow) return;
        if (!supabase) {
          if (changedRow?.details?.showInAktualitates) upsertLocalAktualitateFromEvent(changedRow);
          else deleteLocalAktualitateByEventId(changedRow?.id);
          return;
        }
        try {
          let row = changedRow;
          const remoteId = await upsertRemoteEvent(supabase, row);
          if (remoteId && Number(row?.remoteId || 0) !== remoteId) {
            row = normalizeEvent({ ...row, remote_id: remoteId });
          }

          let nextAktId = Number(row?.details?.aktualitatesId || 0) || null;
          if (row?.details?.showInAktualitates) {
            nextAktId = await upsertAktualitateFromEvent(supabase, row);
          } else if (nextAktId) {
            deleteLocalAktualitateByEventId(row?.id);
            await deleteAktualitateById(supabase, nextAktId);
            nextAktId = null;
          } else {
            await deleteAktualitateByMarker(supabase, row?.id);
          }

          const withAkt = normalizeEvent({
            ...row,
            details: {
              ...(row.details || {}),
              aktualitatesId: nextAktId,
            },
          });
          const committedEvents = nextEvents.map((x) => (x.id === withAkt.id ? withAkt : x));
          setEvents(committedEvents);
          saveLocalEvents(committedEvents);
          setDbMessage("Pasākums saglabāts.");
        } catch (e) {
          setDbMessage(`DB sinhronizācija neizdevās: ${String(e?.message || e)}`);
        }
      }

      async function saveCard(ev) {
        ev?.preventDefault?.();
        const title = String(cardTitle ?? "").trim();
        if (!title) {
          setDbMessage("Lai saglabātu pasākumu, jānorāda pasākuma nosaukums.");
          return;
        }
        const id = editingId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const row = normalizeEvent({
          id,
          remote_id: events.find((x) => x.id === id)?.remoteId || null,
          event_date: cardDate,
          event_time: String(cardTime || "").trim(),
          category: cardCategory,
          event_type: cardEventType,
          title,
          location: cardOnline ? "online" : String(cardLocation || "").trim(),
          is_online: Boolean(cardOnline),
          short_category: cardShortCategory,
          icon: cardIcon,
          color: cardColor || "#fb923c",
          description_html: descHtml,
          note: cardNote,
          details: {
            eventWhat: detailEventWhat,
            whyJoin: detailWhyJoin,
            whatExpect: detailWhatExpect,
            dressCode: detailDressCode,
            bringAlong: detailBringAlong,
            fee: detailFee,
            timeTo: String(cardTimeTo || "").trim(),
            showInAktualitates: Boolean(showInAktualitates),
            aktualitatesId: Number(events.find((x) => x.id === id)?.details?.aktualitatesId || 0) || null,
          },
          poll: { items: pollItemsFromState() },
          participants,
          attachments,
          updated_at: new Date().toISOString(),
        });
        const nextEvents = editingId
          ? events.map((x) => (x.id === id ? row : x))
          : [row, ...events];
        await persistEvents(nextEvents, row);
        setCardOpen(false);
      }

      async function deleteEventById(eventId, closeCard = false) {
        const targetId = String(eventId || "").trim();
        if (!targetId) return;
        const current = events.find((x) => String(x.id) === targetId);
        if (!current) return;
        const nextEvents = events.filter((x) => String(x.id) !== targetId);
        setEvents(nextEvents);
        saveLocalEvents(nextEvents);
        if (closeCard) setCardOpen(false);
        if (!supabase) return;
        try {
          const aktId = Number(current?.details?.aktualitatesId || 0) || null;
          if (aktId) {
            deleteLocalAktualitateByEventId(current?.id);
            await deleteAktualitateById(supabase, aktId);
          }
          else await deleteAktualitateByMarker(supabase, current?.id);
          if (current.remoteId) await deleteRemoteEvent(supabase, current.remoteId);
          setDbMessage("");
        } catch (e) {
          setDbMessage(`Dzēšana DB neizdevās: ${String(e?.message || e)}`);
        }
      }

      async function deleteEvent() {
        if (!editingId) return;
        await deleteEventById(editingId, true);
      }

      async function castPollVote(pollId, optionText) {
        const opt = String(optionText || "").trim();
        if (!opt || !pollId) return;
        const uid = actorKey();
        let nextPolls = [];
        setPolls((prev) => {
          nextPolls = (Array.isArray(prev) ? prev : []).map((p) => {
            if (String(p?.id) !== String(pollId)) return p;
            const nextVotes = { ...(p?.votes && typeof p.votes === "object" ? p.votes : {}) };
            const already = String(nextVotes[uid] || "").trim();
            nextVotes[uid] = already === opt ? "" : opt;
            return { ...p, votes: nextVotes };
          });
          return nextPolls;
        });
        const updated = events.find((x) => x.id === editingId);
        if (!updated) return;
        const row = {
          ...updated,
          poll: {
            items: nextPolls.map((p, idx) => ({
              id: String(p?.id ?? `poll-${idx + 1}`),
              type: String(p?.type ?? "choice") === "text" ? "text" : "choice",
              question: String(p?.question ?? "").trim(),
              options: pollOptionsArray(p?.optionsText),
              votes: p?.votes && typeof p.votes === "object" ? p.votes : {},
              textAnswer: String(p?.textAnswer ?? "").trim(),
            })),
          },
        };
        const nextEvents = events.map((x) => (x.id === editingId ? row : x));
        await persistEvents(nextEvents, row);
      }

      async function savePollTextAnswer(pollId, answer) {
        if (!pollId) return;
        const uid = actorKey();
        const text = String(answer || "").trim();
        let nextPolls = [];
        setPolls((prev) => {
          nextPolls = (Array.isArray(prev) ? prev : []).map((p) => {
            if (String(p?.id) !== String(pollId)) return p;
            const nextVotes = { ...(p?.votes && typeof p.votes === "object" ? p.votes : {}) };
            nextVotes[uid] = text;
            return { ...p, textAnswer: text, votes: nextVotes };
          });
          return nextPolls;
        });
        if (!editingId) return;
        const updated = events.find((x) => x.id === editingId);
        if (!updated) return;
        const row = {
          ...updated,
          poll: {
            items: nextPolls.map((p, idx) => ({
              id: String(p?.id ?? `poll-${idx + 1}`),
              type: String(p?.type ?? "choice") === "text" ? "text" : "choice",
              question: String(p?.question ?? "").trim(),
              options: pollOptionsArray(p?.optionsText),
              votes: p?.votes && typeof p.votes === "object" ? p.votes : {},
              textAnswer: String(p?.textAnswer ?? "").trim(),
            })),
          },
        };
        const nextEvents = events.map((x) => (x.id === editingId ? row : x));
        await persistEvents(nextEvents, row);
      }

      async function cancelPollById(pollId) {
        if (!pollId) return;
        const nextPolls = (Array.isArray(polls) ? polls : []).map((p) => {
          if (String(p?.id) !== String(pollId)) return p;
          return { ...p, question: "", optionsText: "", votes: {}, textAnswer: "" };
        });
        setPolls(nextPolls);
        if (!editingId) return;
        const updated = events.find((x) => x.id === editingId);
        if (!updated) return;
        const row = {
          ...updated,
          poll: {
            items: nextPolls.map((p, idx) => ({
              id: String(p?.id ?? `poll-${idx + 1}`),
              type: String(p?.type ?? "choice") === "text" ? "text" : "choice",
              question: String(p?.question ?? "").trim(),
              options: pollOptionsArray(p?.optionsText),
              votes: p?.votes && typeof p.votes === "object" ? p.votes : {},
              textAnswer: String(p?.textAnswer ?? "").trim(),
            })),
          },
        };
        const nextEvents = events.map((x) => (x.id === editingId ? row : x));
        await persistEvents(nextEvents, row);
      }

      async function deletePollById(pollId) {
        if (!pollId) return;
        const nextPolls = (Array.isArray(polls) ? polls : []).filter((p) => String(p?.id) !== String(pollId));
        const safeNext = nextPolls.length
          ? nextPolls
          : [{ id: `poll-${Date.now()}`, type: "choice", question: "", optionsText: "", votes: {}, textAnswer: "" }];
        setPolls(safeNext);
        if (!editingId) return;
        const updated = events.find((x) => x.id === editingId);
        if (!updated) return;
        const row = {
          ...updated,
          poll: {
            items: safeNext.map((p, idx) => ({
              id: String(p?.id ?? `poll-${idx + 1}`),
              type: String(p?.type ?? "choice") === "text" ? "text" : "choice",
              question: String(p?.question ?? "").trim(),
              options: pollOptionsArray(p?.optionsText),
              votes: p?.votes && typeof p.votes === "object" ? p.votes : {},
              textAnswer: String(p?.textAnswer ?? "").trim(),
            })),
          },
        };
        const nextEvents = events.map((x) => (x.id === editingId ? row : x));
        await persistEvents(nextEvents, row);
      }

      async function clearMyPollAnswer(pollId) {
        if (!pollId) return;
        const uid = actorKey();
        const nextPolls = (Array.isArray(polls) ? polls : []).map((p) => {
          if (String(p?.id) !== String(pollId)) return p;
          const nextVotes = { ...(p?.votes && typeof p.votes === "object" ? p.votes : {}) };
          delete nextVotes[uid];
          return { ...p, textAnswer: "", votes: nextVotes };
        });
        setPolls(nextPolls);
        if (!editingId) return;
        const updated = events.find((x) => x.id === editingId);
        if (!updated) return;
        const row = {
          ...updated,
          poll: {
            items: nextPolls.map((p, idx) => ({
              id: String(p?.id ?? `poll-${idx + 1}`),
              type: String(p?.type ?? "choice") === "text" ? "text" : "choice",
              question: String(p?.question ?? "").trim(),
              options: pollOptionsArray(p?.optionsText),
              votes: p?.votes && typeof p.votes === "object" ? p.votes : {},
              textAnswer: String(p?.textAnswer ?? "").trim(),
            })),
          },
        };
        const nextEvents = events.map((x) => (x.id === editingId ? row : x));
        await persistEvents(nextEvents, row);
      }

      async function setRsvp(status) {
        const uid = actorKey();
        const next = {
          ...(participants || {}),
          [uid]: {
            status,
            reasonType: status === "no" ? noReasonType : "",
            reasonText: status === "no" ? noReasonText : "",
          },
        };
        setParticipants(next);
        if (!editingId) return;
        const updated = events.find((x) => x.id === editingId);
        if (!updated) return;
        const row = { ...updated, participants: next };
        const nextEvents = events.map((x) => (x.id === editingId ? row : x));
        await persistEvents(nextEvents, row);
      }

      async function updateNoReason(reasonType, reasonText) {
        const uid = actorKey();
        const next = {
          ...(participants || {}),
          [uid]: {
            status: "no",
            reasonType: String(reasonType || ""),
            reasonText: String(reasonText || ""),
          },
        };
        setParticipants(next);
        if (!editingId) return;
        const updated = events.find((x) => x.id === editingId);
        if (!updated) return;
        const row = { ...updated, participants: next };
        const nextEvents = events.map((x) => (x.id === editingId ? row : x));
        await persistEvents(nextEvents, row);
      }

      const rsvp = rsvpCounts(participants);
      const rsvpTotal = Math.max(1, rsvp.yes + rsvp.maybe + rsvp.no);
      const myRsvpRaw = participants?.[actorKey()];
      const myRsvp = myRsvpRaw && typeof myRsvpRaw === "object" ? myRsvpRaw : { status: String(myRsvpRaw || "") };
      const cardCategoryIcon = `${cardShortCategory}|${cardIcon}`;
      function onCategoryIconChange(value) {
        const raw = String(value || "");
        const [cat, ico] = raw.split("|");
        setCardShortCategory(cat || "sports");
        setCardIcon(ico || "🎉");
      }

      return html`
        <section class="sal-wrap">
          <div class="sal-head">
            <h2>Saliedēšanas pasākumi, svētku dienas u.c.</h2>
            <p>Jautri, atraktīvi un pārskatāmi pasākumi vienuviet! ✨</p>
          </div>

          ${dbMessage ? html`<div class="sal-banner">${dbMessage}</div>` : null}

          <div class="sal-cal-wrap">
            <div class="sal-cal-head">
              <button type="button" class="btn btn-ghost btn-small" onClick=${() => moveMonth(-1)}>←</button>
              <strong style=${{ textTransform: "capitalize" }}>${monthLabelLv(calendarMonth)}</strong>
              <button type="button" class="btn btn-ghost btn-small" onClick=${() => moveMonth(1)}>→</button>
            </div>
            <div class="sal-cal-grid">
              ${DOW_LV.map((d) => html`<div key=${`dow-${d}`} class="sal-cal-dow">${d}</div>`)}
              ${monthGrid.map((d) => {
                const dKey = toYmd(d);
                const inMonth = d.getMonth() === calendarMonth.getMonth();
                const isToday = dKey === toYmd(new Date());
                const dayEvents = sortedEvents.filter((e) => e.date === dKey);
                return html`
                  <div key=${`cell-${dKey}`} class=${`sal-cal-cell ${inMonth ? "" : "out"} ${isToday ? "today" : ""}`}>
                    <div class="sal-cal-day"><span>${d.getDate()}</span></div>
                    <div class="sal-cal-list">
                      ${dayEvents.map((e) => html`
                        <span
                          key=${e.id}
                          class=${`sal-cal-pill ${e.category === "holiday" ? "is-holiday" : "is-event"}`}
                          style=${{ background: e.color || undefined, borderColor: e.color || undefined }}
                          onClick=${() => openCardEdit(e)}
                          title="Labot ierakstu"
                        >
                          ${(e.icon ? `${e.icon} ` : "") + e.title}
                        </span>
                      `)}
                    </div>
                    <button type="button" class="sal-cal-add" onClick=${() => openCardCreate(dKey)}>+ Pievienot</button>
                  </div>
                `;
              })}
            </div>
          </div>

          <details class="sal-history" open=${openHistory} onToggle=${(e) => setOpenHistory(Boolean(e.currentTarget.open))}>
            <summary style=${{ cursor: "pointer", fontWeight: 700, color: "#9a3412" }}>Pasākumu vēsture</summary>
            <div class="sal-history-list">
              ${sortedEvents.length
                ? sortedEvents.map((e) => html`
                    <article key=${`hist-${e.id}`} class="sal-history-item" onClick=${() => openCardEdit(e)}>
                      <strong>${(e.icon ? `${e.icon} ` : "") + e.title}</strong>
                      <span class="sal-history-meta">${formatDateTime(e)} · ${e.location || (e.online ? "online" : "—")}</span>
                      <div class="sal-history-actions">
                        <button
                          type="button"
                          class="btn btn-danger btn-small"
                          onClick=${async (evt) => {
                            evt.stopPropagation();
                            await deleteEventById(e.id, false);
                          }}
                        >
                          Dzēst
                        </button>
                      </div>
                    </article>
                  `)
                : html`<p class="sal-subnote">Vēl nav neviena pasākuma ieraksta.</p>`}
            </div>
          </details>

          ${cardOpen
            ? html`
                <div class="sal-modal-bg" onClick=${() => setCardOpen(false)}>
                  <div class="sal-modal" onClick=${(e) => e.stopPropagation()}>
                    <h3>${editingId ? "Pasākuma kartiņa" : "Jauns pasākums"}</h3>
                    <p class="sal-modal-note">Datums: <strong>${cardDate || "—"}</strong>. Krāsaini un atraktīvi! 🎈</p>
                    <form class="stack" onSubmit=${saveCard}>
                      <div class="row" style=${{ gap: ".65rem" }}>
                        <div class="field" style=${{ flex: 1 }}>
                          <label>Pasākuma veids</label>
                          <select class="select" value=${cardEventType} onChange=${(e) => setCardEventType(e.target.value)}>
                            <option value="saliedesana">Saliedēšanas pasākums</option>
                            <option value="dzimsanas">Dzimšanas diena</option>
                            <option value="cits">Cits pasākums</option>
                          </select>
                        </div>
                      </div>

                      ${cardEventType === "saliedesana"
                        ? html`
                            <div class="field">
                              <label>Pasākuma nosaukums</label>
                              <input class="input" required value=${cardTitle} placeholder="Komandas boulings, Vasaras pikniks..." onInput=${(e) => setCardTitle(e.target.value)} />
                            </div>
                            <div class="row" style=${{ gap: ".65rem" }}>
                              <div class="field" style=${{ flex: 1 }}>
                                <label>Datums</label>
                                <input class="input" type="date" required value=${cardDate} onInput=${(e) => setCardDate(e.target.value)} />
                              </div>
                              <div class="field" style=${{ flex: 1 }}>
                                <label>No cikiem</label>
                                <input class="input" type="time" required value=${cardTime} onInput=${(e) => setCardTime(e.target.value)} />
                              </div>
                              <div class="field" style=${{ flex: 1 }}>
                                <label>Līdz cikiem</label>
                                <input class="input" type="time" value=${cardTimeTo} onInput=${(e) => setCardTimeTo(e.target.value)} />
                              </div>
                            </div>
                            <div class="field">
                              <label style=${{ display: "flex", alignItems: "center", gap: ".5rem" }}>
                                <input type="checkbox" checked=${showInAktualitates} onChange=${(e) => setShowInAktualitates(Boolean(e.target.checked))} />
                                Rādīt galvenajā lapā pie Aktualitātēm
                              </label>
                            </div>
                            <div class="field">
                              <label style=${{ display: "flex", alignItems: "center", gap: ".5rem" }}>
                                <input type="checkbox" checked=${cardOnline} onChange=${(e) => setCardOnline(Boolean(e.target.checked))} />
                                Online pasākums
                              </label>
                            </div>
                            ${cardOnline
                              ? null
                              : html`
                                  <div class="field">
                                    <label>Norises vieta</label>
                                    <input class="input" value=${cardLocation} onInput=${(e) => setCardLocation(e.target.value)} />
                                  </div>
                                `}
                            <div class="field">
                              <label>Kategorija + ikona</label>
                              <select class="select" value=${cardCategoryIcon} onChange=${(e) => onCategoryIconChange(e.target.value)}>
                                <option value="sports|🎯">Sports 🎯</option>
                                <option value="izklaide|🎉">Izklaide 🎉</option>
                                <option value="apmacibas|📚">Apmācības 📚</option>
                                <option value="komanda|🤝">Komandas pasākums 🤝</option>
                                <option value="cits|⭐">Cits ⭐</option>
                              </select>
                            </div>
                            <div class="field"><label>Pasākuma apraksts</label><input class="input" value=${detailEventWhat} onInput=${(e) => setDetailEventWhat(e.target.value)} /></div>
                            <div class="field"><label>Kāpēc piedalīties (motivējoši)</label><textarea class="textarea" value=${detailWhyJoin} onInput=${(e) => setDetailWhyJoin(e.target.value)} /></div>
                            <div class="field"><label>Ko sagaidīt</label><textarea class="textarea" value=${detailWhatExpect} onInput=${(e) => setDetailWhatExpect(e.target.value)} /></div>
                            <div class="row" style=${{ gap: ".65rem" }}>
                              <div class="field" style=${{ flex: 1 }}><label>Dress code</label><input class="input" value=${detailDressCode} onInput=${(e) => setDetailDressCode(e.target.value)} /></div>
                              <div class="field" style=${{ flex: 1 }}><label>Ko ņemt līdzi</label><input class="input" value=${detailBringAlong} onInput=${(e) => setDetailBringAlong(e.target.value)} /></div>
                            </div>
                            <div class="field"><label>Dalības maksa</label><input class="input" value=${detailFee} onInput=${(e) => setDetailFee(e.target.value)} /></div>

                            <div class="field">
                              <label>Brīvs apraksts (Word funkcijas)</label>
                              <div class="sal-rich-editor">
                                <div class="sal-toolbar">
                                  <button type="button" class="btn btn-ghost btn-small" onClick=${() => applyEditorCommand("bold")}>B</button>
                                  <button type="button" class="btn btn-ghost btn-small" onClick=${() => applyEditorCommand("italic")}><em>I</em></button>
                                  <button type="button" class="btn btn-ghost btn-small" onClick=${() => applyEditorCommand("underline")}><u>U</u></button>
                                  <button type="button" class="btn btn-ghost btn-small" onClick=${() => applyEditorCommand("insertUnorderedList")}>• Saraksts</button>
                                  <button type="button" class="btn btn-ghost btn-small" onClick=${() => applyEditorCommand("insertOrderedList")}>1. Saraksts</button>
                                  <select class="select" onChange=${(e) => applyEditorCommand("fontSize", e.target.value)}>
                                    <option value="">Šrifta lielums</option>
                                    <option value="2">Mazs</option>
                                    <option value="3">Normāls</option>
                                    <option value="5">Liels</option>
                                    <option value="6">Ļoti liels</option>
                                  </select>
                                  <input type="color" title="Teksta krāsa" onInput=${(e) => applyEditorCommand("foreColor", e.target.value)} />
                                  <input type="color" title="Fona krāsa" onInput=${(e) => applyEditorCommand("hiliteColor", e.target.value)} />
                                </div>
                                <div
                                  class="sal-editor"
                                  contenteditable="true"
                                  ref=${editorRef}
                                  onInput=${(e) => setDescHtml(String(e.currentTarget.innerHTML || ""))}
                                  dangerouslySetInnerHTML=${{ __html: descHtml }}
                                ></div>
                              </div>
                            </div>

                            <div class="field sal-attachments">
                              <label>Pielikumi</label>
                              <div class="row" style=${{ gap: ".45rem", flexWrap: "wrap" }}>
                                <input class="input" style=${{ flex: 1 }} placeholder="Nosaukums" value=${attLabel} onInput=${(e) => setAttLabel(e.target.value)} />
                                <input class="input" style=${{ flex: 2 }} placeholder="https://..." value=${attUrl} onInput=${(e) => setAttUrl(e.target.value)} />
                                <button type="button" class="btn btn-ghost btn-small" onClick=${() => addAttachment("link")}>Pievienot saiti</button>
                                <button
                                  type="button"
                                  class="btn btn-ghost btn-small"
                                  onClick=${() => {
                                    if (String(attUrl || "").trim()) addAttachment("image");
                                    else document.getElementById("sal-image-upload-input")?.click();
                                  }}
                                >
                                  Pievienot attēlu
                                </button>
                                <input
                                  id="sal-image-upload-input"
                                  type="file"
                                  accept="image/*"
                                  style=${{ display: "none" }}
                                  onChange=${(e) => {
                                    const file = e.target?.files?.[0];
                                    addImageFromFile(file);
                                    e.target.value = "";
                                  }}
                                />
                              </div>
                              ${attachments.map((a, idx) => html`
                                <div key=${`att-${idx}`} class="sal-att-item">
                                  <button type="button" class="btn btn-ghost btn-small" onClick=${() => openUrlSafe(a.url)}>
                                    ${a.kind === "image" ? "🖼️ " : "🔗 "}${a.label}
                                  </button>
                                  <button
                                    type="button"
                                    class="btn btn-danger btn-small"
                                    onClick=${() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                                  >Dzēst</button>
                                </div>
                              `)}
                            </div>

                            <div class="sal-poll-box">
                              <strong style=${{ color: "#9a3412", fontSize: ".85rem" }}>Aptaujas</strong>
                              ${polls.map((poll, idx) => {
                                const options = pollOptionsArray(poll.optionsText);
                                const myVote = String((poll.votes && typeof poll.votes === "object" ? poll.votes[actorKey()] : "") || "");
                                const summary = options.map((opt) => ({
                                  option: opt,
                                  count: Object.values(poll.votes || {}).filter((v) => String(v) === opt).length,
                                }));
                                const totalVotes = summary.reduce((acc, x) => acc + Number(x.count || 0), 0);
                                return html`
                                  <div key=${poll.id} class="sal-reason-block">
                                    <div class="row" style=${{ gap: ".35rem", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                                      <strong style=${{ color: "#9a3412", fontSize: ".78rem" }}>Aptauja ${idx + 1}</strong>
                                      <div class="row" style=${{ gap: ".3rem", flexWrap: "wrap" }}>
                                        <button type="button" class="btn btn-ghost btn-small" onClick=${() => clearMyPollAnswer(poll.id)}>Atcelt manu atbildi</button>
                                        <button type="button" class="btn btn-ghost btn-small" onClick=${() => cancelPollById(poll.id)}>Atcelt aptauju</button>
                                        <button type="button" class="btn btn-danger btn-small" onClick=${() => deletePollById(poll.id)}>Dzēst aptauju</button>
                                      </div>
                                    </div>
                                    <select
                                      class="select"
                                      value=${poll.type || "choice"}
                                      onChange=${(e) => {
                                        const value = String(e.target.value || "choice") === "text" ? "text" : "choice";
                                        setPolls((prev) => prev.map((p) => (p.id === poll.id ? { ...p, type: value } : p)));
                                      }}
                                    >
                                      <option value="choice">Atbilžu varianti (ķeksis)</option>
                                      <option value="text">Brīvā teksta atbilde</option>
                                    </select>
                                    <input
                                      class="input"
                                      placeholder="Aptaujas jautājums"
                                      value=${poll.question}
                                      onInput=${(e) => {
                                        const value = e.target.value;
                                        setPolls((prev) => prev.map((p) => (p.id === poll.id ? { ...p, question: value } : p)));
                                      }}
                                    />
                                    ${poll.type === "text"
                                      ? html`
                                          <textarea
                                            class="textarea"
                                            placeholder="Brīva teksta atbilde"
                                            value=${poll.textAnswer || ""}
                                            onInput=${(e) => {
                                              const value = e.target.value;
                                              setPolls((prev) => prev.map((p) => (p.id === poll.id ? { ...p, textAnswer: value } : p)));
                                            }}
                                          ></textarea>
                                          <button type="button" class="btn btn-ghost btn-small" onClick=${() => savePollTextAnswer(poll.id, poll.textAnswer || "")}>
                                            Saglabāt atbildi
                                          </button>
                                          <div class="sal-vote-option">
                                            <span>Saņemtas atbildes</span>
                                            <span>${Object.values(poll.votes || {}).filter((v) => String(v || "").trim()).length}</span>
                                          </div>
                                        `
                                      : html`
                                          <textarea
                                            class="textarea"
                                            placeholder="Varianti (katrs jaunā rindā)"
                                            value=${poll.optionsText}
                                            onInput=${(e) => {
                                              const value = e.target.value;
                                              setPolls((prev) => prev.map((p) => (p.id === poll.id ? { ...p, optionsText: value } : p)));
                                            }}
                                          ></textarea>
                                          ${summary.length
                                            ? html`
                                                <div class="sal-vote-row">
                                                  ${summary.map((v) => {
                                                    const selected = myVote === v.option;
                                                    return html`
                                                      <label
                                                        key=${v.option}
                                                        class="sal-vote-option"
                                                        style=${selected ? { background: "#dbeafe", borderColor: "#60a5fa" } : {}}
                                                      >
                                                        <span style=${{ display: "inline-flex", alignItems: "center", gap: ".45rem" }}>
                                                          <input type="checkbox" checked=${selected} onChange=${() => castPollVote(poll.id, v.option)} />
                                                          ${v.option}
                                                        </span>
                                                        <span>${v.count}</span>
                                                      </label>
                                                    `;
                                                  })}
                                                </div>
                                                <div class="sal-poll-bars">
                                                  ${summary.map((v) => {
                                                    const pct = totalVotes > 0 ? Math.round((Number(v.count || 0) * 100) / totalVotes) : 0;
                                                    return html`
                                                      <div key=${`bar-${poll.id}-${v.option}`} class="sal-poll-bar-item">
                                                        <div class="sal-poll-bar-label">
                                                          <span>${v.option}</span>
                                                          <span>${v.count} (${pct}%)</span>
                                                        </div>
                                                        <div class="sal-poll-bar-track">
                                                          <div class="sal-poll-bar-fill" style=${{ width: `${pct}%` }}></div>
                                                        </div>
                                                      </div>
                                                    `;
                                                  })}
                                                </div>
                                              `
                                            : null}
                                        `}
                                  </div>
                                `;
                              })}
                              <button
                                type="button"
                                class="btn btn-ghost btn-small"
                                onClick=${() =>
                                  setPolls((prev) => [
                                    ...(Array.isArray(prev) ? prev : []),
                                    { id: `poll-${Date.now()}`, type: "choice", question: "", optionsText: "", votes: {}, textAnswer: "" },
                                  ])}
                              >
                                + Pievienot aptauju
                              </button>
                            </div>

                            <div class="sal-poll-box">
                              <strong style=${{ color: "#9a3412", fontSize: ".85rem" }}>Piedalīšanās atzīme</strong>
                              <div class="sal-rsvp-row">
                                <button type="button" class="btn btn-ghost btn-small" style=${myRsvp?.status === "yes" ? { background: "#dcfce7", borderColor: "#4ade80", color: "#14532d" } : {}} onClick=${() => setRsvp("yes")}>Piedalīšos</button>
                                <button type="button" class="btn btn-ghost btn-small" style=${myRsvp?.status === "maybe" ? { background: "#fef3c7", borderColor: "#fbbf24", color: "#78350f" } : {}} onClick=${() => setRsvp("maybe")}>Varbūt</button>
                                <button type="button" class="btn btn-ghost btn-small" style=${myRsvp?.status === "no" ? { background: "#fee2e2", borderColor: "#f87171", color: "#7f1d1d" } : {}} onClick=${() => setRsvp("no")}>Nepiedalīšos</button>
                              </div>
                              ${myRsvp?.status === "no"
                                ? html`
                                    <div class="sal-reason-block">
                                      <strong style=${{ color: "#9a3412", fontSize: ".78rem" }}>Nepiedalīšos - iemesls</strong>
                                      <div class="row" style=${{ gap: ".35rem", flexWrap: "wrap" }}>
                                        <button type="button" class="btn btn-ghost btn-small" style=${noReasonType === "neder_laiks" ? { background: "#fee2e2", borderColor: "#f87171", color: "#7f1d1d" } : {}} onClick=${async () => { setNoReasonType("neder_laiks"); await updateNoReason("neder_laiks", noReasonText); }}>Neder laiks</button>
                                        <button type="button" class="btn btn-ghost btn-small" style=${noReasonType === "neder_pasakums" ? { background: "#fee2e2", borderColor: "#f87171", color: "#7f1d1d" } : {}} onClick=${async () => { setNoReasonType("neder_pasakums"); await updateNoReason("neder_pasakums", noReasonText); }}>Neder pasākums</button>
                                        <button type="button" class="btn btn-ghost btn-small" style=${noReasonType === "cits" ? { background: "#fee2e2", borderColor: "#f87171", color: "#7f1d1d" } : {}} onClick=${async () => { setNoReasonType("cits"); await updateNoReason("cits", noReasonText); }}>Cits</button>
                                      </div>
                                      <textarea
                                        class="textarea"
                                        placeholder="Brīvs teksts iemeslam"
                                        value=${noReasonText}
                                        onInput=${async (e) => {
                                          const txt = e.target.value;
                                          setNoReasonText(txt);
                                          await updateNoReason(noReasonType, txt);
                                        }}
                                      ></textarea>
                                    </div>
                                  `
                                : null}
                              <div class="sal-rsvp-bars">
                                <div class="sal-rsvp-bar-item">
                                  <div class="sal-rsvp-bar-label"><span>Piedalīsies</span><span>${rsvp.yes}</span></div>
                                  <div class="sal-rsvp-bar-track"><div class="sal-rsvp-bar-fill" style=${{ width: `${(rsvp.yes / rsvpTotal) * 100}%`, background: "#16a34a" }}></div></div>
                                </div>
                                <div class="sal-rsvp-bar-item">
                                  <div class="sal-rsvp-bar-label"><span>Varbūt</span><span>${rsvp.maybe}</span></div>
                                  <div class="sal-rsvp-bar-track"><div class="sal-rsvp-bar-fill" style=${{ width: `${(rsvp.maybe / rsvpTotal) * 100}%`, background: "#f59e0b" }}></div></div>
                                </div>
                                <div class="sal-rsvp-bar-item">
                                  <div class="sal-rsvp-bar-label"><span>Nepiedalīsies</span><span>${rsvp.no}</span></div>
                                  <div class="sal-rsvp-bar-track"><div class="sal-rsvp-bar-fill" style=${{ width: `${(rsvp.no / rsvpTotal) * 100}%`, background: "#ef4444" }}></div></div>
                                </div>
                              </div>
                            </div>

                            <div class="field">
                              <label>Papildu piezīmes</label>
                              <textarea class="textarea" value=${cardNote} onInput=${(e) => setCardNote(e.target.value)}></textarea>
                            </div>
                          `
                        : html`<div class="sal-banner">Šim veidam kartiņas saturs būs cits (tiks pievienots nākamajos soļos).</div>`}

                      <div class="row" style=${{ gap: ".45rem", flexWrap: "wrap" }}>
                        ${cardEventType === "saliedesana"
                          ? html`<button type="submit" class="btn btn-primary btn-small">Saglabāt</button>`
                          : null}
                        ${editingId
                          ? html`<button type="button" class="btn btn-danger btn-small" onClick=${deleteEvent}>Dzēst pasākumu</button>`
                          : null}
                        <button type="button" class="btn btn-ghost btn-small" onClick=${() => setCardOpen(false)}>Atcelt</button>
                      </div>
                    </form>
                  </div>
                </div>
              `
            : null}
        </section>
      `;
    };
  }

  installGlobalMainCalendarBadgeSync();

  window.SALIEDESANA = {
    createSaliedesanaPanel,
    toYmd,
    DB_SQL_SETUP,
  };
})();
