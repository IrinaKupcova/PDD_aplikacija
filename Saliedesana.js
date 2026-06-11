(function () {
  const LS_EVENTS_KEY = "pdd_saliedesana_pasakumi_v2";
  const LS_AKTUALITATES_KEY = "pdd_sodien_aktualitates_v1";
  /** Supabase: public."Saliedesana" — kolonnas kā Table Editor (arī saīsinātie nosaukumi). */
  const REMOTE_TABLE = "Saliedesana";
  const SAL_META_MARKER = "\n\n---PDD-SYNC---\n";
  const SALIEDESANA_FILES_BUCKET = "pdd-saliedesana-files";
  /** No pirmā SELECT * — precīzi PostgREST lauku nosaukumi rakstīšanai. */
  let saliedesanaColumnNames = null;

  /** Kalendāra čipu krāsas pēc `eventType` (svētku dienas — kā līdz šim `is-holiday`). */
  const SAL_CAL_EVENT_PALETTE = {
    saliedesana: { bg: "#ffedd5", border: "#fb923c", fg: "#7c2d12" },
    dzimsanas: { bg: "#fce7f3", border: "#ec4899", fg: "#831843" },
    varda_diena: { bg: "#e0e7ff", border: "#6366f1", fg: "#312e81" },
    cits: { bg: "#ecfccb", border: "#84cc16", fg: "#365314" },
  };

  function salCalPaletteForEvent(ev) {
    if (ev?.category === "holiday") return null;
    const t = String(ev?.eventType || "saliedesana").trim();
    return SAL_CAL_EVENT_PALETTE[t] || SAL_CAL_EVENT_PALETTE.saliedesana;
  }

  function salCalPillClassNames(ev) {
    if (ev?.category === "holiday") return "sal-cal-pill is-holiday";
    const t = String(ev?.eventType || "saliedesana").trim();
    const slug = ["saliedesana", "dzimsanas", "varda_diena", "cits"].includes(t) ? t : "saliedesana";
    return `sal-cal-pill is-event sal-cal-pill--${slug}`;
  }

  /** Dzimšanas dienas kartiņas plāna veidi (multi-select chips). */
  const CELEBRATION_KIND_CHIPS_BD = [
    { id: "cake", icon: "🎂", label: "Kūka birojā" },
    { id: "coffee", icon: "☕", label: "Kafijas pauze" },
    { id: "lunch", icon: "🍕", label: "Kopīgas pusdienas" },
    { id: "afterwork", icon: "🍹", label: "Afterwork" },
    { id: "online", icon: "💻", label: "Online apsveikums" },
    { id: "gifts", icon: "🎁", label: "Dāvanas pasniegšana" },
  ];

  function summarizeCelebrationKinds(keys) {
    const arr = Array.isArray(keys) ? keys : [];
    return arr
      .map((k) => CELEBRATION_KIND_CHIPS_BD.find((c) => c.id === k)?.label)
      .filter(Boolean)
      .join(" · ");
  }

  function salNormalizeAttachmentList(arr) {
    return (Array.isArray(arr) ? arr : [])
      .map((a) => ({
        label: String(a?.label ?? "").trim(),
        url: String(a?.url ?? "").trim(),
        kind: String(a?.kind ?? "").trim() || "link",
        storagePath: String(a?.storagePath ?? a?.storage_path ?? "").trim(),
      }))
      .filter((a) => a.label && a.url);
  }

  function salSanitizeUploadFileName(name) {
    return String(name || "pielikums")
      .replace(/[^\w.\-()]/g, "_")
      .replace(/_+/g, "_")
      .slice(-120);
  }

  async function uploadSaliedesanaFileToStorage(supabase, file, folderKey) {
    if (!supabase || !file) throw new Error("Nav augšupielādes avota.");
    const { data: sess } = await supabase.auth.getSession();
    const uid = String(sess?.session?.user?.id ?? "").trim();
    if (!uid) throw new Error("Pielikumu augšupielādei jāpieslēdzas (sesija).");
    const safe = salSanitizeUploadFileName(file.name);
    const suffix = typeof crypto?.randomUUID === "function" ? crypto.randomUUID() : String(Date.now());
    const fk = String(folderKey || "draft").replace(/[^\w\-]/g, "_").slice(0, 80);
    const objectPath = `${uid}/sal-pasakumi/${fk}/${Date.now()}-${suffix}-${safe}`;
    const { error: upErr } = await supabase.storage.from(SALIEDESANA_FILES_BUCKET).upload(objectPath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "application/octet-stream",
    });
    if (upErr) throw upErr;
    const pub = supabase.storage.from(SALIEDESANA_FILES_BUCKET).getPublicUrl(objectPath);
    const publicUrl = String(pub?.data?.publicUrl ?? "").trim();
    if (!publicUrl) throw new Error("Neizdevās iegūt publisko URL pielikumam.");
    return { publicUrl, storagePath: objectPath };
  }

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
    Pielikumi: ["Pielikumi", "pielikumi"],
    Dati_json: ["Dati_json", "dati_json"],
    Radit_aktualitates: ["Radit_aktualitates", "radit_aktualitates"],
    Aktualitates_id: ["Aktualitates_id", "aktualitates_id"],
  };

  const DB_SQL_SETUP = `
-- public."Saliedesana" (pēc faktiskās shēmas): id, Datums, Sakuma_laiks, Pasakuma_nosau, Pasakuma_veids,
-- Beigu_laiks, "Online pasākums", Norises_vieta, Kategorija, Pasākuma_aprak, Kapac_piedalītie, Ko_sagaidit,
-- Dress_code, Ko_nemt_lidzi, Dalibas_maksa, Brivs_apraksts, Papildu_piezimes, Pielikumi (jsonb)
`;

  function eventHasAttachments(ev) {
    const list = ev?.attachments;
    return Array.isArray(list) && list.length > 0;
  }

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
      .sal-cal-pill.is-event { box-shadow: 0 0 0 1px rgba(234,88,12,.12); }
      .sal-cal-pill--saliedesana { border-color:#fb923c; background:#ffedd5; color:#7c2d12; box-shadow: 0 0 0 1px rgba(234,88,12,.22); }
      .sal-cal-pill--dzimsanas { border-color:#ec4899; background:#fce7f3; color:#831843; box-shadow: 0 0 0 1px rgba(236,72,153,.2); }
      .sal-cal-pill--varda_diena { border-color:#6366f1; background:#e0e7ff; color:#312e81; box-shadow: 0 0 0 1px rgba(99,102,241,.22); }
      .sal-cal-pill--cits { border-color:#84cc16; background:#ecfccb; color:#365314; box-shadow: 0 0 0 1px rgba(101,163,13,.22); }
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
      .sal-poll-panels { display:grid; gap:.55rem; }
      .sal-poll-panel { border:1px solid #fed7aa; border-radius:10px; background:#fff; padding:.5rem .55rem; display:grid; gap:.35rem; }
      .sal-poll-panel-head { display:flex; align-items:center; justify-content:space-between; gap:.5rem; flex-wrap:wrap; }
      .sal-poll-panel-head--urgent { border:2px solid #fecaca; background:#fef2f2; border-radius:8px; padding:.4rem .5rem; }
      .sal-poll-panel-hint { font-size:.72rem; color:#64748b; }
      .sal-poll-panel-toggle { text-align:left; border:1px dashed #fdba74; background:#fff7ed; color:#9a3412; border-radius:8px; padding:.4rem .55rem; font-weight:700; font-size:.82rem; cursor:pointer; }
      .sal-poll-panel-body { display:grid; gap:.45rem; }
      .sal-poll-sent-list { margin:0; padding-left:1rem; display:grid; gap:.35rem; font-size:.78rem; color:#7c2d12; }
      .sal-poll-sent-item { list-style:disc; }
      .sal-poll-sent-title { font-weight:700; }
      .sal-poll-sent-meta { font-size:.72rem; color:#64748b; margin-top:.12rem; }
      .sal-poll-empty { margin:0; font-size:.76rem; color:#9a3412; }
      .sal-poll-fill-card { border-color:#fecaca; background:#fffafa; }
      .sal-poll-results-card { border-color:#e2e8f0; background:#f8fafc; }
      .sal-poll-text-answers { display:grid; gap:.35rem; }
      .sal-poll-text-answer { border:1px solid #e2e8f0; border-radius:8px; padding:.35rem .45rem; background:#fff; font-size:.78rem; }
      .sal-poll-text-author { font-size:.7rem; color:#64748b; margin-bottom:.15rem; }
      .sal-poll-results-bars { display:grid; gap:.35rem; }
      .sal-vote-row { display:grid; gap:.3rem; }
      .sal-vote-option { display:flex; align-items:center; justify-content:space-between; border:1px solid #fed7aa; border-radius:8px; padding:.3rem .45rem; background:#fff; }
      .sal-poll-bars { display:grid; gap:.3rem; }
      .sal-poll-bar-item { display:grid; gap:.15rem; }
      .sal-poll-bar-label { font-size:.74rem; color:#7c2d12; display:flex; justify-content:space-between; }
      .sal-poll-bar-track { height:8px; border-radius:999px; background:#ffedd5; overflow:hidden; }
      .sal-poll-bar-fill { height:100%; border-radius:999px; background:#f97316; }
      .sal-poll-studio-trigger { display:flex; flex-wrap:wrap; align-items:center; gap:.45rem; margin:.15rem 0 .35rem; }
      .sal-poll-chip { display:inline-flex; align-items:center; justify-content:center; min-width:1.35rem; height:1.35rem; padding:0 .32rem; font-size:.72rem; font-weight:700; background:#fb923c; color:#fff; border-radius:999px; }
      .sal-poll-studio { border:2px solid #fdba74; background:#fff; border-radius:12px; padding:.65rem .75rem; display:grid; gap:.55rem; }
      .sal-poll-studio-help { margin:0; font-size:.78rem; color:#64748b; line-height:1.45; }
      .sal-poll-opt-list { display:grid; gap:.4rem; }
      .sal-poll-opt-row { display:grid; grid-template-columns:1.35rem 1fr auto; align-items:center; gap:.4rem; }
      .sal-poll-opt-idx { font-size:.78rem; font-weight:700; color:#9a3412; text-align:right; }
      .sal-poll-quick { display:flex; flex-wrap:wrap; gap:.3rem; align-items:center; padding-top:.25rem; border-top:1px dashed #fed7aa; margin-top:.15rem; }
      .sal-poll-quick-h { font-size:.72rem; color:#64748b; margin-right:.15rem; }
      .sal-poll-sec-title { margin:0; font-size:.82rem; color:#9a3412; font-weight:700; }
      .sal-rsvp-row { display:flex; gap:.35rem; flex-wrap:wrap; }
      .sal-rsvp-stat { font-size:.75rem; color:#9a3412; border:1px solid #fdba74; border-radius:999px; padding:1px 8px; background:#fff; }
      .sal-rsvp-bars { display:grid; gap:.3rem; }
      .sal-rsvp-bar-item { display:grid; gap:.15rem; }
      .sal-rsvp-bar-label { font-size:.74rem; color:#7c2d12; display:flex; justify-content:space-between; }
      .sal-rsvp-bar-track { height:8px; border-radius:999px; background:#ffedd5; overflow:hidden; }
      .sal-rsvp-bar-fill { height:100%; border-radius:999px; }
      .sal-rsvp-summary-grid { display:grid; gap:.45rem; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); }
      .sal-rsvp-summary-col { border:1px solid #fed7aa; border-radius:10px; background:#fff; padding:.45rem; display:grid; gap:.3rem; }
      .sal-rsvp-summary-head { display:flex; justify-content:space-between; align-items:center; font-size:.78rem; font-weight:700; color:#7c2d12; }
      .sal-rsvp-summary-list { margin:0; padding-left:1rem; display:grid; gap:.2rem; font-size:.76rem; color:#7c2d12; }
      .sal-rsvp-summary-empty { font-size:.74rem; color:#9a3412; }
      .sal-cel-wrap { border-radius:14px; background:linear-gradient(145deg,#ffffff 0%,#fafafa 55%,#f8f5ff 100%); border:1px solid #e8e5ef; box-shadow:0 4px 24px rgba(15,23,42,.06),0 1px 3px rgba(15,23,42,.04); padding:.75rem .85rem; display:grid; gap:.65rem; transition:box-shadow .2s ease,border-color .2s ease; }
      .sal-cel-wrap:hover { box-shadow:0 6px 28px rgba(15,23,42,.08),0 2px 6px rgba(15,23,42,.05); }
      .sal-cel-confetti { font-size:.85rem; opacity:.85; letter-spacing:.08em; }
      .sal-cel-head { display:flex; align-items:flex-start; gap:.55rem; padding-bottom:.45rem; border-bottom:1px solid #eceef2; }
      .sal-cel-head-icon { font-size:1.65rem; line-height:1; filter:drop-shadow(0 1px 2px rgba(0,0,0,.08)); }
      .sal-cel-head-text { flex:1; min-width:0; }
      .sal-cel-title { margin:0; font-size:1.05rem; font-weight:700; color:#0f172a; letter-spacing:-.02em; }
      .sal-cel-sub { margin:.15rem 0 0; font-size:.74rem; color:#64748b; line-height:1.35; }
      .sal-cel-sec { display:grid; gap:.4rem; padding:.45rem 0; border-bottom:1px dashed #e8e5ef; }
      .sal-cel-sec:last-of-type { border-bottom:none; }
      .sal-cel-sec-title { margin:0 0 .1rem; font-size:.72rem; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:.06em; }
      .sal-cel-field { display:grid; gap:.2rem; }
      .sal-cel-field label { font-size:.74rem; font-weight:600; color:#334155; }
      .sal-cel-field .input, .sal-cel-field .textarea { min-height:auto; font-size:.85rem; padding:.38rem .5rem; border-radius:8px; border:1px solid #e2e8f0; transition:border-color .15s ease, box-shadow .15s ease; }
      .sal-cel-field .input:focus, .sal-cel-field .textarea:focus { outline:none; border-color:#a78bfa; box-shadow:0 0 0 3px rgba(167,139,250,.2); }
      .sal-cel-row2 { display:grid; gap:.45rem; grid-template-columns:1fr 1fr; }
      @media (max-width:520px) { .sal-cel-row2 { grid-template-columns:1fr; } }
      .sal-cel-check { display:flex; align-items:center; gap:.45rem; font-size:.82rem; color:#334155; cursor:pointer; user-select:none; }
      .sal-cel-check input { width:1rem; height:1rem; accent-color:#8b5cf6; cursor:pointer; }
      .sal-cel-chips { display:flex; flex-wrap:wrap; gap:.35rem; }
      .sal-cel-chip { appearance:none; border:1px solid #e2e8f0; background:#fff; color:#334155; border-radius:999px; padding:.32rem .55rem .32rem .45rem; font-size:.78rem; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:.28rem; transition:transform .12s ease,background .15s ease,border-color .15s ease,box-shadow .15s ease; box-shadow:0 1px 2px rgba(15,23,42,.04); }
      .sal-cel-chip:hover { border-color:#c4b5fd; background:#faf5ff; transform:translateY(-1px); box-shadow:0 2px 8px rgba(99,102,241,.12); }
      .sal-cel-chip.is-on { border-color:#8b5cf6; background:linear-gradient(180deg,#f5f3ff,#ede9fe); color:#4c1d95; box-shadow:0 0 0 1px rgba(139,92,246,.25),0 2px 8px rgba(139,92,246,.15); }
      .sal-cel-chip:focus-visible { outline:2px solid #8b5cf6; outline-offset:2px; }
      .sal-cel-gift { border-radius:10px; background:#fffbeb; border:1px solid #fde68a; padding:.45rem .5rem; animation:sal-cel-in .25s ease; }
      .sal-cel-meet { animation:sal-cel-in .25s ease; }
      @keyframes sal-cel-in { from { opacity:0; transform:translateY(-4px);} to { opacity:1; transform:none;} }
      .sal-cel-rsvp { display:flex; flex-wrap:wrap; gap:.3rem; align-items:center; }
      .sal-cel-rsvp .btn { font-size:.76rem; }
      .sal-cel-foot { display:flex; flex-wrap:wrap; gap:.4rem; align-items:center; padding-top:.35rem; border-top:1px solid #eceef2; }
      .sal-cel-foot .btn-primary { background:linear-gradient(180deg,#7c3aed,#6d28d9); border-color:#5b21b6; }
      .sal-cel-foot .btn-ghost { border-color:#e2e8f0; }
      .sal-modal--cel { border-color:#ddd6fe; background:linear-gradient(180deg,#fff,#fafbff); }
      .sal-cel-sec .sal-rich-editor { border-color:#ddd6fe; border-radius:10px; }
      .sal-cel-sec .sal-toolbar { background:linear-gradient(180deg,#faf5ff,#f5f3ff); border-bottom-color:#e9d5ff; }
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

  function isUuidLike(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? "").trim());
  }

  function preferredActorUserId() {
    const candidates = [
      globalThis.__PDD_ACTOR_USER_ID__,
      sessionStorage.getItem("pdd_local_user_id"),
      localStorage.getItem("pdd_local_user_id"),
      globalThis.__PDD_SESSION_USER_ID__,
    ];
    for (const c of candidates) {
      const id = String(c ?? "").trim();
      if (id && isUuidLike(id)) return id;
    }
    return "";
  }

  async function resolveActorUserIdForAutors(supabase) {
    if (!supabase) return "";
    try {
      const { data: sess } = await supabase.auth.getSession();
      const uid = String(sess?.session?.user?.id ?? "").trim();
      if (isUuidLike(uid)) return uid;
    } catch {
      /* ignore */
    }
    const sid = String(globalThis.__PDD_SESSION_USER_ID__ ?? "").trim();
    return isUuidLike(sid) ? sid : "";
  }

  function actorKey() {
    const id = preferredActorUserId();
    if (id) return id;
    const em = String(globalThis.__PDD_ACTOR_EMAIL__ ?? sessionStorage.getItem("pdd_local_email") ?? "").trim().toLowerCase();
    if (em) return em;
    return "anonymous";
  }

  function emptyPoll() {
    return { question: "", options: [], votes: {} };
  }

  /** Apvieno lokālo un servera aptauzu sarakstu pēc `id`, lai pēc sinhronizācijas nepazustu jaunas kartiņas vai balsis. */
  function mergePollContainers(prevPoll, remotePoll) {
    const p0 = prevPoll && typeof prevPoll === "object" ? prevPoll : emptyPoll();
    const r0 = remotePoll && typeof remotePoll === "object" ? remotePoll : emptyPoll();
    const pItems = Array.isArray(p0.items) ? p0.items : [];
    const rItems = Array.isArray(r0.items) ? r0.items : [];
    if (!pItems.length && !rItems.length) {
      return {
        question: String(r0.question || p0.question || "").trim(),
        options: Array.isArray(r0.options) && r0.options.length ? r0.options : Array.isArray(p0.options) ? p0.options : [],
        votes: { ...(typeof r0.votes === "object" ? r0.votes : {}), ...(typeof p0.votes === "object" ? p0.votes : {}) },
        items: [],
      };
    }
    const keyFor = (it, idx) => {
      const id = String(it?.id ?? "").trim();
      return id || `poll-${idx + 1}`;
    };
    const byId = new Map();
    const order = [];
    rItems.forEach((it, idx) => {
      const kid = keyFor(it, idx);
      if (!byId.has(kid)) order.push(kid);
      byId.set(kid, { ...it, id: String(it?.id ?? "").trim() || kid });
    });
    pItems.forEach((it, idx) => {
      const kid = keyFor(it, idx);
      const clean = { ...it, id: String(it?.id ?? "").trim() || kid };
      if (!byId.has(kid)) {
        order.push(kid);
        byId.set(kid, clean);
        return;
      }
      const ex = byId.get(kid);
      const vR = ex?.votes && typeof ex.votes === "object" ? ex.votes : {};
      const vP = clean?.votes && typeof clean.votes === "object" ? clean.votes : {};
      byId.set(kid, { ...ex, ...clean, votes: { ...vR, ...vP } });
    });
    const items = order.map((kid) => byId.get(kid)).filter(Boolean);
    return {
      question: String(r0.question || p0.question || "").trim(),
      options: Array.isArray(r0.options) && r0.options.length ? r0.options : Array.isArray(p0.options) ? p0.options : [],
      votes: { ...(typeof r0.votes === "object" ? r0.votes : {}), ...(typeof p0.votes === "object" ? p0.votes : {}) },
      items,
    };
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

  function normalizeTimeHHMM(value) {
    const s = String(value ?? "").trim();
    if (!s) return "";
    const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s);
    if (!m) return s;
    return `${String(m[1]).padStart(2, "0")}:${String(m[2]).padStart(2, "0")}`;
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
    let colAttachments = src.Pielikumi !== undefined && src.Pielikumi !== null ? src.Pielikumi : src.pielikumi;
    if (typeof colAttachments === "string") {
      const rawCol = String(colAttachments).trim();
      if (rawCol) {
        try {
          const parsedCol = JSON.parse(rawCol);
          colAttachments = Array.isArray(parsedCol) ? parsedCol : parsedCol && typeof parsedCol === "object" ? [parsedCol] : [];
        } catch {
          colAttachments = [];
        }
      } else {
        colAttachments = [];
      }
    }
    const attachments = Array.isArray(colAttachments)
      ? colAttachments
      : Array.isArray(src.attachments)
        ? src.attachments
        : [];
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
      time: normalizeTimeHHMM(String(
        pickFromRow(
          src,
          SAL_COL_CANDIDATES.Sakuma_laiks.concat(["event_time", "time", "no_cikiem"]),
          ""
        ) || pickByAliases(src, ["event_time", "time"], "")
      ).trim()),
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
        timeTo: normalizeTimeHHMM(String(
          details.timeTo ??
            pickFromRow(
              src,
              SAL_COL_CANDIDATES.Beigu_laiks.concat(["time_to", "beigas_laiks", "lidz"]),
              pickByAliases(src, ["time_to", "beigas_laiks", "lidz"], "")
            )
        ).trim()),
        showInAktualitates: Boolean(details.showInAktualitates ?? parseBool(pickByAliases(src, ["Radit_aktualitates", "radit_aktualitates", "vai_radit_aktualitates", "publicet_aktualitates"], false))),
        aktualitatesId: Number((details.aktualitatesId ?? pickByAliases(src, ["Aktualitates_id", "aktualitates_id"], 0)) || 0) || null,
        organizerKey: String(
          details.organizerKey ?? pickByAliases(src, ["organizerKey", "organizer_key", "Organizer_key"], "")
        ).trim(),
        celebrationJubilar: String(details.celebrationJubilar ?? "").trim(),
        celebrationPlanKinds: Array.isArray(details.celebrationPlanKinds)
          ? details.celebrationPlanKinds.map((x) => String(x ?? "").trim()).filter(Boolean)
          : [],
        celebrationMeetingLink: String(details.celebrationMeetingLink ?? "").trim(),
        celebrationGiftNote: String(details.celebrationGiftNote ?? "").trim(),
        celebrationMessage: String(details.celebrationMessage ?? "").trim(),
        celebrationQuizResponsibleKey: String(details.celebrationQuizResponsibleKey ?? "").trim(),
        celebrationProgramHtml: String(details.celebrationProgramHtml ?? "").trim(),
        celebrationProgramAttachments: salNormalizeAttachmentList(details.celebrationProgramAttachments),
      },
      poll: {
        question: String(poll.question ?? "").trim(),
        options: Array.isArray(poll.options) ? poll.options.map((x) => String(x ?? "").trim()).filter(Boolean) : [],
        votes: poll.votes && typeof poll.votes === "object" ? poll.votes : {},
        items: Array.isArray(poll.items)
          ? poll.items.map((p, idx) => ({
              id: String(p?.id ?? `poll-${idx + 1}`).trim() || `poll-${idx + 1}`,
              type: String(p?.type ?? "choice") === "text" ? "text" : "choice",
              pollTitle: String(p?.pollTitle ?? p?.poll_title ?? "").trim(),
              pollDate: String(p?.pollDate ?? p?.poll_date ?? "").trim(),
              question: String(p?.question ?? "").trim(),
              options: Array.isArray(p?.options) ? p.options.map((x) => String(x ?? "").trim()).filter(Boolean) : [],
              votes: p?.votes && typeof p.votes === "object" ? p.votes : {},
              textAnswer: String(p?.textAnswer ?? p?.text_answer ?? "").trim(),
              audience: String(p?.audience ?? "all") === "selected" ? "selected" : "all",
              targets: Array.isArray(p?.targets) ? p.targets.map((x) => String(x ?? "").trim()).filter(Boolean) : [],
              sentAt: String(p?.sentAt ?? p?.sent_at ?? "").trim(),
              sentBy: String(p?.sentBy ?? p?.sent_by ?? "").trim(),
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
          label: String(a?.label ?? a?.name ?? "").trim(),
          url: String(a?.url ?? a?.dataUrl ?? a?.href ?? "").trim(),
          kind: String(a?.kind ?? a?.type ?? "").trim() || "link",
          storagePath: String(a?.storagePath ?? a?.storage_path ?? "").trim(),
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
    const pielikumiPayload = (Array.isArray(ev.attachments) ? ev.attachments : [])
      .map((a) => ({
        label: String(a?.label ?? "").trim(),
        url: String(a?.url ?? "").trim(),
        kind: String(a?.kind ?? "").trim() || "link",
        storagePath: String(a?.storagePath ?? a?.storage_path ?? "").trim(),
      }))
      .filter((a) => a.label && a.url);
    put(SAL_COL_CANDIDATES.Pielikumi, pielikumiPayload);
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
          attachments: (() => {
            const col = r?.Pielikumi ?? r?.pielikumi;
            if (Array.isArray(col)) return col;
            if (Array.isArray(embedded.attachments)) return embedded.attachments;
            if (Array.isArray(legacyMeta.attachments)) return legacyMeta.attachments;
            return [];
          })(),
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
      // Nebloķē prombūtnes `cal-chip` klikšķus: wrap pēc noklusējuma var pārklāt apakšējos čipus tajā pašā šūnā.
      wrap.style.cssText =
        "display:grid;gap:3px;margin-top:4px;pointer-events:none;width:fit-content;max-width:100%;align-content:start;position:relative;z-index:40;";
      dayEvents.slice(0, 2).forEach((ev) => {
        const badge = document.createElement("button");
        badge.type = "button";
        badge.className = "sal-main-cal-badge";
        const icon = String(ev?.icon || "").trim() || "✨";
        const txt = String(ev?.title || "").trim();
        const eventId = String(ev?.id || "").trim();
        badge.textContent = `${icon} ${txt}${eventHasAttachments(ev) ? " 📎" : ""}`;
        badge.title = txt;
        badge.setAttribute("aria-label", txt ? `Atvērt pasākumu: ${txt}` : "Atvērt pasākumu");
        const pal = salCalPaletteForEvent(ev);
        const isHol = ev?.category === "holiday";
        const bg = isHol ? "#fecaca" : pal ? pal.bg : "#ffedd5";
        const fg = isHol ? "#7f1d1d" : pal ? pal.fg : "#7c2d12";
        const brd = isHol ? "#f87171" : pal ? pal.border : "#fb923c";
        badge.style.cssText =
          `display:inline-flex;max-width:100%;padding:1px 6px;border-radius:999px;background:${bg};color:${fg};border:1px solid ${brd};font-size:10px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;pointer-events:auto;position:relative;z-index:50;line-height:1.2;touch-action:manipulation;`;
        if (eventId) badge.dataset.salEventId = eventId;
        badge.dataset.salEventDate = dKey;
        badge.dataset.salEventTitle = txt;
        badge.setAttribute("data-sal-event-date", dKey);
        badge.setAttribute("data-sal-event-title", txt);
        if (eventId) badge.setAttribute("data-sal-event-id", eventId);
        wrap.appendChild(badge);
      });
      if (dayEvents.length > 2) {
        const more = document.createElement("span");
        more.className = "sal-main-cal-badge";
        more.textContent = `+${dayEvents.length - 2} vēl`;
        more.style.cssText =
          "display:inline-flex;padding:1px 6px;border-radius:999px;background:#fdba74;color:#7c2d12;font-size:10px;font-weight:700;pointer-events:auto;position:relative;z-index:5;";
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
    if (!globalThis.__PDD_SALIEDESANA_BADGE_CLICK_DELEGATE__) {
      globalThis.__PDD_SALIEDESANA_BADGE_CLICK_DELEGATE__ = true;
      // window capture iet PIRMS document capture (index.html), lai index.html stopPropagation neapstādinātu ceļu līdz čipam.
      let lastSalMainCalBadgeOpenAt = 0;
      const handleSalMainCalBadgeUi = (evt) => {
        const t =
          evt.target instanceof Element ? evt.target.closest(".sal-main-cal-badge[data-sal-event-date]") : null;
        if (!t) return;
        if (evt.type === "pointerdown") {
          if (!evt.isPrimary) return;
          if (evt.pointerType === "mouse" && evt.button !== 0) return;
        }
        const eventDate = String(t.getAttribute("data-sal-event-date") || t.dataset.salEventDate || "").trim();
        if (!eventDate) return;
        const now = Date.now();
        if (evt.type === "click" && now - lastSalMainCalBadgeOpenAt < 650) {
          evt.preventDefault();
          evt.stopPropagation();
          return;
        }
        lastSalMainCalBadgeOpenAt = now;
        evt.preventDefault();
        evt.stopPropagation();
        const eventId = String(t.getAttribute("data-sal-event-id") || t.dataset.salEventId || "").trim();
        const eventTitle = String(t.getAttribute("data-sal-event-title") || t.dataset.salEventTitle || "").trim();
        requestOpenSaliedesanaEvent({ eventId, date: eventDate, title: eventTitle });
      };
      window.addEventListener("pointerdown", handleSalMainCalBadgeUi, true);
      window.addEventListener("click", handleSalMainCalBadgeUi, true);
    }
  }

  function requestOpenSaliedesanaEvent(ref) {
    const eventId = String(ref?.eventId || "").trim();
    const eventDate = String(ref?.date || "").trim();
    const eventTitle = String(ref?.title || "").trim();
    globalThis.__PDD_SALIEDESANA_PENDING_OPEN_EVENT_ID__ = eventId;
    globalThis.__PDD_SALIEDESANA_PENDING_OPEN_EVENT_DATE__ = eventDate;
    globalThis.__PDD_SALIEDESANA_PENDING_OPEN_EVENT_TITLE__ = eventTitle;
    try {
      window.dispatchEvent(
        new CustomEvent("pdd:open-saliedesana-event", {
          detail: { eventId, date: eventDate, title: eventTitle },
        })
      );
    } catch {
      // ignore
    }

    const tryOpen = () => {
      try {
        globalThis.__PDD_OPEN_SALIEDESANA_VIEW__?.();
      } catch {
        // ignore
      }
      const openNow = globalThis.__PDD_SALIEDESANA_OPEN_EVENT_CARD__;
      if (typeof openNow === "function") {
        const opened = openNow({ eventId, date: eventDate, title: eventTitle });
        if (opened) return true;
      }
      const navButtons = Array.from(document.querySelectorAll("button"));
      const salBtn = navButtons.find((b) => /Saliedēšanas pasākumi/i.test(String(b.textContent || "")));
      if (salBtn) salBtn.click();
      return false;
    };

    if (tryOpen()) return;
    if (globalThis.__PDD_SALIEDESANA_OPEN_RETRY_T__) {
      clearInterval(globalThis.__PDD_SALIEDESANA_OPEN_RETRY_T__);
      globalThis.__PDD_SALIEDESANA_OPEN_RETRY_T__ = null;
    }
    let attempts = 0;
    globalThis.__PDD_SALIEDESANA_OPEN_RETRY_T__ = setInterval(() => {
      attempts += 1;
      const ok = tryOpen();
      if (ok || attempts >= 18) {
        clearInterval(globalThis.__PDD_SALIEDESANA_OPEN_RETRY_T__);
        globalThis.__PDD_SALIEDESANA_OPEN_RETRY_T__ = null;
      }
    }, 160);
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
      const t = normalizeTimeHHMM(String(ev?.time ?? "").trim());
      const tt = normalizeTimeHHMM(String(ev?.details?.timeTo ?? "").trim());
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
      const candidates = [hinted, "AKTUALITATES", "aktualitates", "Aktualitates", "AKTUALITĀTES"].filter(Boolean);
      for (const table of [...new Set(candidates)]) {
        const q = await supabase.from(table).select("id, Autors").limit(1);
        if (!q.error) {
          globalThis.__PDD_AKTUALITATES_TABLE__ = table;
          return table;
        }
      }
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
      const actorName = String(globalThis.__PDD_ACTOR_DISPLAY_NAME__ ?? "").trim() || null;
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
      const actorUid = await resolveActorUserIdForAutors(supabase);
      const q = await supabase
        .from(table)
        .insert(actorUid ? { ...payload, Autors: actorUid, users: actorName } : { ...payload, users: actorName })
        .select("id")
        .limit(1);
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
      const celProgramEditorRef = useRef(null);
      /** Vienmēr norāda uz jaunāko `openEventCardByRef`, lai globālais tiltiņš ne „pazustu” starp `events` atjauninājumiem. */
      const openEventCardByRefRef = useRef(null);
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
      const [cardTime, setCardTime] = useState("08:00");
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
        {
          id: "poll-1",
          type: "choice",
          pollTitle: "",
          pollDate: "",
          question: "",
          optionsText: "",
          votes: {},
          textAnswer: "",
          audience: "all",
          targets: [],
          sentAt: "",
          sentBy: "",
        },
      ]);
      const [participants, setParticipants] = useState({});
      const [noReasonType, setNoReasonType] = useState("");
      const [noReasonText, setNoReasonText] = useState("");
      const [pollCreationOpen, setPollCreationOpen] = useState(false);
      const [pollResultsOpen, setPollResultsOpen] = useState(false);
      const [draftCardKey, setDraftCardKey] = useState("");
      const [celJubilar, setCelJubilar] = useState("");
      const [celMeetingLink, setCelMeetingLink] = useState("");
      const [celGiftNote, setCelGiftNote] = useState("");
      const [celMessage, setCelMessage] = useState("");
      const [celKinds, setCelKinds] = useState([]);
      const [celQuizResponsibleKey, setCelQuizResponsibleKey] = useState("");
      const [celProgramHtml, setCelProgramHtml] = useState("");
      const [celProgramAttachments, setCelProgramAttachments] = useState([]);
      const [celProgAttLabel, setCelProgAttLabel] = useState("");
      const [celProgAttUrl, setCelProgAttUrl] = useState("");

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
                  poll: mergePollContainers(prev.poll, r.poll),
                  participants: Object.keys(r.participants || {}).length ? r.participants : prev.participants,
                  attachments: Array.isArray(r.attachments) ? r.attachments : prev.attachments,
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
        setCardTime("08:00");
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
        setPolls([
          {
            id: "poll-1",
            type: "choice",
            pollTitle: "",
            pollDate: "",
            question: "",
            optionsText: "",
            votes: {},
            textAnswer: "",
            audience: "all",
            targets: [],
            sentAt: "",
            sentBy: "",
          },
        ]);
        setParticipants({});
        setNoReasonType("");
        setNoReasonText("");
        setPollCreationOpen(false);
        setPollResultsOpen(false);
        setDraftCardKey(`sal-${Date.now()}`);
        setCelJubilar("");
        setCelMeetingLink("");
        setCelGiftNote("");
        setCelMessage("");
        setCelKinds([]);
        setCelQuizResponsibleKey("");
        setCelProgramHtml("");
        setCelProgramAttachments([]);
        setCelProgAttLabel("");
        setCelProgAttUrl("");
        setCardOpen(true);
      }

      function openCardEdit(ev) {
        if (!ev) return;
        setEditingId(ev.id);
        setCardDate(ev.date || "");
        setCardCategory(ev.category || "team");
        setCardEventType(ev.eventType || "saliedesana");
        setCardTitle(ev.title || "");
        setCardTime(normalizeTimeHHMM(ev.time || ""));
        setCardTimeTo(normalizeTimeHHMM(ev.details?.timeTo || ""));
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
              pollTitle: String(p?.pollTitle ?? p?.poll_title ?? "").trim(),
              pollDate: String(p?.pollDate ?? p?.poll_date ?? "").trim(),
              question: String(p?.question ?? ""),
              optionsText: (Array.isArray(p?.options) ? p.options : []).join("\n"),
              votes: p?.votes && typeof p.votes === "object" ? p.votes : {},
              textAnswer: String(
                (p?.textAnswer ?? p?.text_answer ?? "") ||
                  (p?.votes && typeof p.votes === "object" ? p.votes[actorKey()] : "") ||
                  ""
              ),
              audience: String(p?.audience ?? "all") === "selected" ? "selected" : "all",
              targets: Array.isArray(p?.targets) ? p.targets.map((x) => String(x ?? "").trim()).filter(Boolean) : [],
              sentAt: String(p?.sentAt ?? p?.sent_at ?? "").trim(),
              sentBy: String(p?.sentBy ?? p?.sent_by ?? "").trim(),
            }))
          : [{
              id: "poll-1",
              type: String(ev.poll?.type ?? "choice") === "text" ? "text" : "choice",
              pollTitle: "",
              pollDate: "",
              question: String(ev.poll?.question || ""),
              optionsText: (Array.isArray(ev.poll?.options) ? ev.poll.options : []).join("\n"),
              votes: ev.poll?.votes && typeof ev.poll.votes === "object" ? ev.poll.votes : {},
              textAnswer: String((ev.poll?.votes && typeof ev.poll.votes === "object" ? ev.poll.votes[actorKey()] : "") || ""),
              audience: "all",
              targets: [],
              sentAt: "",
              sentBy: "",
            }];
        setPolls(eventPolls);
        setParticipants(ev.participants && typeof ev.participants === "object" ? ev.participants : {});
        const me = actorKey();
        const mine = ev.participants?.[me];
        setNoReasonType(String(mine?.reasonType ?? ""));
        setNoReasonText(String(mine?.reasonText ?? ""));
        setPollCreationOpen(false);
        setPollResultsOpen(false);
        setDraftCardKey("");
        const et = String(ev.eventType || "saliedesana").trim();
        const d = ev.details && typeof ev.details === "object" ? ev.details : {};
        if (et === "dzimsanas" || et === "varda_diena") {
          setCelJubilar(String(d.celebrationJubilar || "").trim());
          setCelMeetingLink(String(d.celebrationMeetingLink || "").trim());
          setCelGiftNote(String(d.celebrationGiftNote || "").trim());
          setCelMessage(String(d.celebrationMessage || "").trim());
          setCelKinds(Array.isArray(d.celebrationPlanKinds) ? d.celebrationPlanKinds.map((x) => String(x ?? "").trim()).filter(Boolean) : []);
          if (et === "dzimsanas") {
            setCelQuizResponsibleKey(String(d.celebrationQuizResponsibleKey || "").trim());
            const progHtml = String(d.celebrationProgramHtml || "").trim();
            setCelProgramHtml(progHtml || String(ev.descriptionHtml || "").trim());
            const pa = Array.isArray(d.celebrationProgramAttachments) ? d.celebrationProgramAttachments : [];
            const attCol = Array.isArray(ev.attachments) ? ev.attachments : [];
            setCelProgramAttachments(salNormalizeAttachmentList(pa.length ? pa : attCol));
          } else {
            setCelQuizResponsibleKey("");
            setCelProgramHtml("");
            setCelProgramAttachments([]);
          }
        } else {
          setCelJubilar("");
          setCelMeetingLink("");
          setCelGiftNote("");
          setCelMessage("");
          setCelKinds([]);
          setCelQuizResponsibleKey("");
          setCelProgramHtml("");
          setCelProgramAttachments([]);
          setCelProgAttLabel("");
          setCelProgAttUrl("");
        }
        setCardOpen(true);
      }

      function openEventCardByRef(ref) {
        const normalizeSalTitleHint = (raw) => {
          let s = String(raw ?? "")
            .replace(/\u00a0/g, " ")
            .trim();
          while (s.length) {
            const next = s
              .replace(/^[\s\uFE0F\u200D]+/u, "")
              .replace(
                /^[\u2B50\u2605\u2728\u2B51\u2730\u1F31F\u1F320\u272F\u26A1\u2B55]|[\uD83C\uDF1F]|[\uD83C\uDF20]/u,
                "",
              );
            if (next === s) break;
            s = next.trim();
          }
          return s.replace(/\s+/g, " ").trim().toLowerCase();
        };
        const titleMatchScore = (hintRaw, titleRaw) => {
          const a = normalizeSalTitleHint(hintRaw);
          const b = normalizeSalTitleHint(titleRaw);
          if (!a || !b) return 0;
          if (a === b) return 3;
          if (a.includes(b) || b.includes(a)) return 2;
          const aw = a.split(" ").filter(Boolean);
          const bw = b.split(" ").filter(Boolean);
          if (aw.length >= 3 && bw.length >= 3) {
            const as = new Set(aw);
            const bs = new Set(bw);
            let inter = 0;
            for (const w of as) if (bs.has(w)) inter += 1;
            const denom = Math.min(as.size, bs.size);
            if (denom && inter / denom >= 0.66) return 1;
          }
          return 0;
        };
        const pickBestEventByDateTitle = (list, dateHint, titleHint) => {
          const dh = String(dateHint || "").trim();
          const th = String(titleHint || "").trim();
          if (!dh || !th) return null;
          const cands = (Array.isArray(list) ? list : []).filter((x) => String(x?.date || "").trim() === dh);
          if (!cands.length) return null;
          let best = null;
          let bestScore = 0;
          for (const x of cands) {
            const titleOnly = String(x?.title || "");
            const chipLike = `${String(x?.icon || "").trim()} ${titleOnly}`.trim();
            const sc = Math.max(titleMatchScore(th, titleOnly), titleMatchScore(th, chipLike));
            if (sc > bestScore) {
              bestScore = sc;
              best = x;
            }
          }
          return bestScore >= 2 ? best : null;
        };

        const id = String(ref?.eventId || "").trim();
        const dateHint = String(ref?.date || "").trim();
        const titleHint = String(ref?.title || "").trim();
        const liveEvents = Array.isArray(events) ? events : [];
        let ev = id ? liveEvents.find((x) => String(x?.id || "").trim() === id) : null;
        if (!ev && dateHint && titleHint) {
          ev = pickBestEventByDateTitle(liveEvents, dateHint, titleHint);
        }
        if (!ev && dateHint) {
          ev = liveEvents
            .filter((x) => String(x?.date || "").trim() === dateHint)
            .sort((a, b) => String(a?.time || "").localeCompare(String(b?.time || "")))[0];
        }
        if (!ev) {
          const local = loadLocalEvents();
          ev = id ? local.find((x) => String(x?.id || "").trim() === id) : null;
          if (!ev && dateHint && titleHint) {
            ev = pickBestEventByDateTitle(local, dateHint, titleHint);
          }
          if (!ev && dateHint) {
            ev = local
              .filter((x) => String(x?.date || "").trim() === dateHint)
              .sort((a, b) => String(a?.time || "").localeCompare(String(b?.time || "")))[0];
          }
        }
        if (!ev && dateHint) {
          const monthDate = new Date(dateHint);
          if (!Number.isNaN(monthDate.getTime())) setCalendarMonth(monthDate);
          return false;
        }
        if (!ev) return false;
        const monthDate = new Date(String(ev.date || ""));
        if (!Number.isNaN(monthDate.getTime())) setCalendarMonth(monthDate);
        openCardEdit(ev);
        const organizerKeyRef = String(ev?.details?.organizerKey || "").trim();
        const actorKRef = String(actorKey() || "").trim();
        const actorEmailRef = String(globalThis.__PDD_ACTOR_EMAIL__ || sessionStorage.getItem("pdd_local_email") || "")
          .trim()
          .toLowerCase();
        const actorIdRef = String(preferredActorUserId() || "").trim();
        const mayOpenPollStudio =
          !organizerKeyRef ||
          organizerKeyRef === actorKRef ||
          (!!actorEmailRef && organizerKeyRef.toLowerCase() === actorEmailRef) ||
          (!!actorIdRef && organizerKeyRef === actorIdRef);
        if (ref && typeof ref === "object" && (String(ref.openPollFill || "") === "true" || ref.openPollFill === true)) {
          setPollCreationOpen(false);
          setTimeout(() => {
            try {
              document.getElementById("sal-poll-fill-anchor")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
            } catch {
              /* ignore */
            }
          }, 120);
        } else if (
          ref &&
          typeof ref === "object" &&
          (String(ref.openPollStudio || "") === "true" || ref.openPollStudio === true) &&
          mayOpenPollStudio
        ) {
          setPollCreationOpen(true);
        }
        return true;
      }

      openEventCardByRefRef.current = openEventCardByRef;

      useEffect(() => {
        const stableOpen = (ref) => {
          try {
            const fn = openEventCardByRefRef.current;
            return typeof fn === "function" ? Boolean(fn(ref)) : false;
          } catch {
            return false;
          }
        };
        globalThis.__PDD_SALIEDESANA_OPEN_EVENT_CARD__ = stableOpen;
        return () => {
          if (globalThis.__PDD_SALIEDESANA_OPEN_EVENT_CARD__ === stableOpen) {
            delete globalThis.__PDD_SALIEDESANA_OPEN_EVENT_CARD__;
          }
        };
      }, []);

      useEffect(() => {
        const pendingId = String(globalThis.__PDD_SALIEDESANA_PENDING_OPEN_EVENT_ID__ || "").trim();
        const pendingDate = String(globalThis.__PDD_SALIEDESANA_PENDING_OPEN_EVENT_DATE__ || "").trim();
        const pendingTitle = String(globalThis.__PDD_SALIEDESANA_PENDING_OPEN_EVENT_TITLE__ || "").trim();
        const pendingOpenPollFill = String(globalThis.__PDD_SALIEDESANA_PENDING_OPEN_EVENT_OPEN_POLL_FILL__ || "").trim();
        const pendingOpenPollStudio = String(globalThis.__PDD_SALIEDESANA_PENDING_OPEN_EVENT_OPEN_POLL_STUDIO__ || "").trim();
        if (!pendingId && !pendingDate && !pendingTitle) return;
        const fn = openEventCardByRefRef.current;
        if (typeof fn !== "function") return;
        const opened = fn({
          eventId: pendingId,
          date: pendingDate,
          title: pendingTitle,
          openPollFill: pendingOpenPollFill === "1" || pendingOpenPollFill === "true",
          openPollStudio: pendingOpenPollStudio === "1" || pendingOpenPollStudio === "true",
        });
        if (opened) {
          globalThis.__PDD_SALIEDESANA_PENDING_OPEN_EVENT_ID__ = "";
          globalThis.__PDD_SALIEDESANA_PENDING_OPEN_EVENT_DATE__ = "";
          globalThis.__PDD_SALIEDESANA_PENDING_OPEN_EVENT_TITLE__ = "";
          globalThis.__PDD_SALIEDESANA_PENDING_OPEN_EVENT_OPEN_POLL_FILL__ = "";
          globalThis.__PDD_SALIEDESANA_PENDING_OPEN_EVENT_OPEN_POLL_STUDIO__ = "";
        }
      }, [events]);

      useEffect(() => {
        const pending = globalThis.__PDD_SALIEDESANA_PENDING_POLL_ACTION__;
        if (!pending || typeof pending !== "object") return;
        const action = String(pending.action || "").trim();
        const eventId = String(pending.eventId || "").trim();
        const pollId = String(pending.pollId || "").trim();
        if (!action || !eventId || !pollId) return;
        if (action !== "decline") return;

        globalThis.__PDD_SALIEDESANA_PENDING_POLL_ACTION__ = null;

        const uid = actorKey();
        const nextEvents = (Array.isArray(events) ? events : []).map((ev) => {
          if (String(ev?.id || "").trim() !== eventId) return ev;
          const poll = ev?.poll && typeof ev.poll === "object" ? ev.poll : { items: [] };
          const items = Array.isArray(poll.items) ? poll.items : [];
          const nextItems = items.map((p) => {
            if (String(p?.id || "").trim() !== pollId) return p;
            const votes = p?.votes && typeof p.votes === "object" ? p.votes : {};
            return { ...p, votes: { ...votes, [uid]: "__DECLINED__" } };
          });
          return { ...ev, poll: { ...poll, items: nextItems } };
        });

        const changedRow = nextEvents.find((x) => String(x?.id || "").trim() === eventId);
        if (!changedRow) return;
        persistEvents(nextEvents, changedRow).catch(() => {});
      }, [events]);

      function attachmentUploadFolder() {
        return String(editingId || "").trim() || String(draftCardKey || "").trim() || "draft";
      }

      function loadTeamUsersForPollTargeting() {
        try {
          const raw = localStorage.getItem("pdd_team_users_v1") || "[]";
          const parsed = JSON.parse(raw);
          if (!Array.isArray(parsed)) return [];
          return parsed
            .map((u) => ({
              id: String(u?.id ?? "").trim(),
              name: String(u?.["Vārds uzvārds"] ?? u?.full_name ?? u?.name ?? "").trim(),
              email: String(u?.email ?? u?.["i-mail"] ?? u?.["e-mail"] ?? "").trim().toLowerCase(),
            }))
            .filter((u) => u.id || u.email)
            .map((u) => ({ ...u, name: u.name || u.email || u.id }))
            .sort((a, b) => String(a.name).localeCompare(String(b.name), "lv"));
        } catch {
          return [];
        }
      }

      function pollTargetKeyForUser(u) {
        const id = String(u?.id ?? "").trim();
        if (id) return id;
        const em = String(u?.email ?? "").trim().toLowerCase();
        return em;
      }

      function togglePollTarget(pollId, userKey) {
        const key = String(userKey || "").trim();
        if (!key) return;
        setPolls((prev) =>
          (Array.isArray(prev) ? prev : []).map((p) => {
            if (String(p?.id) !== String(pollId)) return p;
            const cur = Array.isArray(p.targets) ? p.targets : [];
            const next = cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key];
            return { ...p, audience: "selected", targets: next };
          })
        );
      }

      function setPollAudienceAll(pollId) {
        setPolls((prev) =>
          (Array.isArray(prev) ? prev : []).map((p) => {
            if (String(p?.id) !== String(pollId)) return p;
            return { ...p, audience: "all", targets: [] };
          })
        );
      }

      async function sendPollInvite(pollId, mode) {
        const now = new Date().toISOString();
        const by = String(globalThis.__PDD_ACTOR_DISPLAY_NAME__ || globalThis.__PDD_ACTOR_EMAIL__ || actorKey() || "").trim();
        const nextPolls = (Array.isArray(polls) ? polls : []).map((p) => {
          if (String(p?.id) !== String(pollId)) return p;
          const audience = mode === "selected" ? "selected" : "all";
          const targets = audience === "selected" ? (Array.isArray(p.targets) ? p.targets : []) : [];
          return { ...p, audience, targets, sentAt: now, sentBy: by };
        });
        setPolls(nextPolls);
        if (!editingId) {
          setDbMessage("Uzaicinājums saglabāts kartiņas melnrakstā. Lai tas parādītos citiem, saglabā pasākumu.");
          return;
        }
        const updated = (Array.isArray(events) ? events : []).find((x) => x.id === editingId);
        if (!updated) return;
        const row = normalizeEvent({ ...updated, poll: { items: pollItemsFromList(nextPolls) } });
        const nextEvents = events.map((x) => (x.id === editingId ? row : x));
        void persistEvents(nextEvents, row).catch((e) => {
          setDbMessage(`Aptaujas saglabāšana neizdevās: ${String(e?.message || e)}`);
        });
      }

      function addAttachment(kind = "link") {
        const url = String(attUrl || "").trim();
        if (!url) return;
        let label = String(attLabel || "").trim();
        if (!label) {
          try {
            const withProto = /^https?:\/\//i.test(url) || /^data:image\//i.test(url) ? url : `https://${url}`;
            const u = /^data:image\//i.test(withProto) ? null : new URL(withProto);
            const host = String(u?.hostname || "").replace(/^www\./i, "");
            const pathName = String(u?.pathname || "").replace(/\/+$/, "");
            const tail = pathName.split("/").filter(Boolean).pop() || "";
            label = tail ? decodeURIComponent(tail) : host || "Saite";
          } catch {
            label = kind === "image" ? "Attēls" : "Saite";
          }
        }
        setAttachments((prev) => [...prev, { label, url, kind, storagePath: "" }]);
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
        const fallback = file.name ? file.name.replace(/\.[^.]+$/, "") : "Attēls";
        const pushDataUrl = () => {
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = String(reader.result || "");
            if (!dataUrl) return;
            setAttachments((prev) => [...prev, { label: fallback, url: dataUrl, kind: "image", storagePath: "" }]);
            const safeLabel = escapeHtmlAttr(fallback);
            const safeSrc = escapeHtmlAttr(dataUrl);
            setDescHtml((prev) => `${String(prev || "")}<div class="sal-image-wrap"><img src="${safeSrc}" alt="${safeLabel}" /><span class="sal-image-caption">${safeLabel}</span></div>`);
          };
          reader.readAsDataURL(file);
        };
        if (supabase) {
          uploadSaliedesanaFileToStorage(supabase, file, attachmentUploadFolder())
            .then(({ publicUrl, storagePath }) => {
              setAttachments((prev) => [...prev, { label: fallback, url: publicUrl, kind: "image", storagePath }]);
              const safeLabel = escapeHtmlAttr(fallback);
              const safeSrc = escapeHtmlAttr(publicUrl);
              setDescHtml((prev) => `${String(prev || "")}<div class="sal-image-wrap"><img src="${safeSrc}" alt="${safeLabel}" /><span class="sal-image-caption">${safeLabel}</span></div>`);
            })
            .catch((e) => {
              setDbMessage(`Attēla augšupielāde neizdevās (${String(e?.message || e)}); saglabāts lokāli kā datu URL.`);
              pushDataUrl();
            });
        } else {
          pushDataUrl();
        }
      }

      async function addBinaryFileAttachment(file) {
        if (!file) return;
        const label = String(file.name || "Fails").trim() || "Fails";
        if (!supabase) {
          setDbMessage("Failu augšupielādei vajag Supabase sesiju. Izmanto saiti (URL) lauku.");
          return;
        }
        try {
          const { publicUrl, storagePath } = await uploadSaliedesanaFileToStorage(supabase, file, attachmentUploadFolder());
          setAttachments((prev) => [...prev, { label, url: publicUrl, kind: "file", storagePath }]);
        } catch (e) {
          setDbMessage(`Faila augšupielāde neizdevās: ${String(e?.message || e)}`);
        }
      }

      async function removeAttachmentAt(idx) {
        const list = Array.isArray(attachments) ? attachments : [];
        const item = list[idx];
        const path = item ? String(item.storagePath || "").trim() : "";
        setAttachments((prev) => prev.filter((_, i) => i !== idx));
        if (path && supabase) {
          try {
            await supabase.storage.from(SALIEDESANA_FILES_BUCKET).remove([path]);
          } catch {
            /* ignore */
          }
        }
      }

      function applyCelProgramEditorCommand(cmd, value = null) {
        try {
          const el = celProgramEditorRef.current;
          if (el && typeof el.focus === "function") el.focus();
          if (typeof document !== "undefined" && document.execCommand) {
            document.execCommand(cmd, false, value);
          }
        } catch {
          /* ignore */
        }
      }

      function addCelProgramAttachment(kind = "link") {
        const url = String(celProgAttUrl || "").trim();
        if (!url) return;
        let label = String(celProgAttLabel || "").trim();
        if (!label) {
          try {
            const withProto = /^https?:\/\//i.test(url) || /^data:image\//i.test(url) ? url : `https://${url}`;
            const u = /^data:image\//i.test(withProto) ? null : new URL(withProto);
            const host = String(u?.hostname || "").replace(/^www\./i, "");
            const pathName = String(u?.pathname || "").replace(/\/+$/, "");
            const tail = pathName.split("/").filter(Boolean).pop() || "";
            label = tail ? decodeURIComponent(tail) : host || "Saite";
          } catch {
            label = kind === "image" ? "Attēls" : "Saite";
          }
        }
        setCelProgramAttachments((prev) => [...prev, { label, url, kind, storagePath: "" }]);
        if (kind === "image") {
          const safeUrl = /^https?:\/\//i.test(url) || /^data:image\//i.test(url) ? url : `https://${url}`;
          const safeLabel = escapeHtmlAttr(label || "Attēls");
          const safeSrc = escapeHtmlAttr(safeUrl);
          setCelProgramHtml((prev) => `${String(prev || "")}<div class="sal-image-wrap"><img src="${safeSrc}" alt="${safeLabel}" /><span class="sal-image-caption">${safeLabel}</span></div>`);
        }
        setCelProgAttLabel("");
        setCelProgAttUrl("");
      }

      function addCelProgramImageFromFile(file) {
        if (!file) return;
        const fallback = file.name ? file.name.replace(/\.[^.]+$/, "") : "Attēls";
        const pushDataUrl = () => {
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = String(reader.result || "");
            if (!dataUrl) return;
            setCelProgramAttachments((prev) => [...prev, { label: fallback, url: dataUrl, kind: "image", storagePath: "" }]);
            const safeLabel = escapeHtmlAttr(fallback);
            const safeSrc = escapeHtmlAttr(dataUrl);
            setCelProgramHtml((prev) => `${String(prev || "")}<div class="sal-image-wrap"><img src="${safeSrc}" alt="${safeLabel}" /><span class="sal-image-caption">${safeLabel}</span></div>`);
          };
          reader.readAsDataURL(file);
        };
        if (supabase) {
          uploadSaliedesanaFileToStorage(supabase, file, attachmentUploadFolder())
            .then(({ publicUrl, storagePath }) => {
              setCelProgramAttachments((prev) => [...prev, { label: fallback, url: publicUrl, kind: "image", storagePath }]);
              const safeLabel = escapeHtmlAttr(fallback);
              const safeSrc = escapeHtmlAttr(publicUrl);
              setCelProgramHtml((prev) => `${String(prev || "")}<div class="sal-image-wrap"><img src="${safeSrc}" alt="${safeLabel}" /><span class="sal-image-caption">${safeLabel}</span></div>`);
            })
            .catch((e) => {
              setDbMessage(`Attēla augšupielāde neizdevās (${String(e?.message || e)}); saglabāts lokāli kā datu URL.`);
              pushDataUrl();
            });
        } else {
          pushDataUrl();
        }
      }

      async function addCelProgramBinaryFile(file) {
        if (!file) return;
        const label = String(file.name || "Fails").trim() || "Fails";
        if (!supabase) {
          setDbMessage("Failu augšupielādei vajag Supabase sesiju. Izmanto saiti (URL) lauku.");
          return;
        }
        try {
          const { publicUrl, storagePath } = await uploadSaliedesanaFileToStorage(supabase, file, attachmentUploadFolder());
          setCelProgramAttachments((prev) => [...prev, { label, url: publicUrl, kind: "file", storagePath }]);
        } catch (e) {
          setDbMessage(`Faila augšupielāde neizdevās: ${String(e?.message || e)}`);
        }
      }

      async function removeCelProgramAttachmentAt(idx) {
        const list = Array.isArray(celProgramAttachments) ? celProgramAttachments : [];
        const item = list[idx];
        const path = item ? String(item.storagePath || "").trim() : "";
        setCelProgramAttachments((prev) => prev.filter((_, i) => i !== idx));
        if (path && supabase) {
          try {
            await supabase.storage.from(SALIEDESANA_FILES_BUCKET).remove([path]);
          } catch {
            /* ignore */
          }
        }
      }

      function pollOptionsArray(textValue) {
        return String(textValue || "")
          .split(/\r?\n/)
          .map((x) => x.trim())
          .filter(Boolean);
      }

      /** Saglabājot DB, neizmet aptaujas tikai tāpēc, ka īslaicīgi nav jautājuma/variantu — sargā nosūtīšanu un balsis. */
      function keepPollItemInPayload(p) {
        const title = String(p?.pollTitle ?? "").trim();
        const q = String(p?.question ?? "").trim();
        const opts = Array.isArray(p?.options) ? p.options.map((x) => String(x ?? "").trim()).filter(Boolean) : [];
        const sent = String(p?.sentAt ?? p?.sent_at ?? "").trim();
        const pdate = String(p?.pollDate ?? p?.poll_date ?? "").trim();
        const votes = p?.votes && typeof p.votes === "object" ? p.votes : {};
        const hasVotes = Object.values(votes).some((v) => {
          const s = String(v ?? "").trim();
          return Boolean(s) && s !== "__DECLINED__";
        });
        return Boolean(title || q || opts.length || sent || pdate || hasVotes);
      }

      /** UI kartiņa ar `optionsText` — tās pašas kā DB saglabāšanas kritērijus. */
      function keepPollItemInUiState(p) {
        const title = String(p?.pollTitle ?? "").trim();
        const q = String(p?.question ?? "").trim();
        const opts = pollOptionsArray(p?.optionsText);
        const sent = String(p?.sentAt ?? p?.sent_at ?? "").trim();
        const pdate = String(p?.pollDate ?? p?.poll_date ?? "").trim();
        const votes = p?.votes && typeof p.votes === "object" ? p.votes : {};
        const hasVotes = Object.values(votes).some((v) => {
          const s = String(v ?? "").trim();
          return Boolean(s) && s !== "__DECLINED__";
        });
        return Boolean(title || q || opts.length || sent || pdate || hasVotes);
      }

      function pollItemsFromState() {
        return (Array.isArray(polls) ? polls : [])
          .map((p, idx) => ({
            id: String(p?.id ?? `poll-${idx + 1}`),
            type: String(p?.type ?? "choice") === "text" ? "text" : "choice",
            pollTitle: String(p?.pollTitle ?? "").trim(),
            pollDate: String(p?.pollDate ?? "").trim(),
            question: String(p?.question ?? "").trim(),
            options: pollOptionsArray(p?.optionsText),
            votes: p?.votes && typeof p.votes === "object" ? p.votes : {},
            textAnswer: String(p?.textAnswer ?? "").trim(),
            audience: String(p?.audience ?? "all") === "selected" ? "selected" : "all",
            targets: Array.isArray(p?.targets) ? p.targets.map((x) => String(x ?? "").trim()).filter(Boolean) : [],
            sentAt: String(p?.sentAt ?? p?.sent_at ?? "").trim(),
            sentBy: String(p?.sentBy ?? p?.sent_by ?? "").trim(),
          }))
          .filter(keepPollItemInPayload);
      }

      function pollItemsFromList(list) {
        return (Array.isArray(list) ? list : [])
          .map((p, idx) => ({
            id: String(p?.id ?? `poll-${idx + 1}`),
            type: String(p?.type ?? "choice") === "text" ? "text" : "choice",
            pollTitle: String(p?.pollTitle ?? "").trim(),
            pollDate: String(p?.pollDate ?? "").trim(),
            question: String(p?.question ?? "").trim(),
            options: pollOptionsArray(p?.optionsText),
            votes: p?.votes && typeof p.votes === "object" ? p.votes : {},
            textAnswer: String(p?.textAnswer ?? "").trim(),
            audience: String(p?.audience ?? "all") === "selected" ? "selected" : "all",
            targets: Array.isArray(p?.targets) ? p.targets.map((x) => String(x ?? "").trim()).filter(Boolean) : [],
            sentAt: String(p?.sentAt ?? p?.sent_at ?? "").trim(),
            sentBy: String(p?.sentBy ?? p?.sent_by ?? "").trim(),
          }))
          .filter(keepPollItemInPayload);
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
          deleteLocalAktualitateByEventId(changedRow?.id);
          return;
        }
        try {
          let row = changedRow;
          const remoteId = await upsertRemoteEvent(supabase, row);
          if (remoteId && Number(row?.remoteId || 0) !== remoteId) {
            row = normalizeEvent({ ...row, remote_id: remoteId });
          }

          let nextAktId = Number(row?.details?.aktualitatesId || 0) || null;
          if (nextAktId) {
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

      async function persistCelebrationToStorage(nextEvents, baseRow, publish, prevAktIdToClear) {
        setEvents(nextEvents);
        saveLocalEvents(nextEvents);
        if (!supabase) {
          if (publish) upsertLocalAktualitateFromEvent(baseRow);
          else deleteLocalAktualitateByEventId(baseRow?.id);
          setDbMessage(
            publish
              ? "Publicēts lokāli. Pieslēdzies Supabase, lai sinhronizētu ar serveri."
              : "Saglabāts melnrakstā (lokāli)."
          );
          setCardOpen(false);
          try {
            globalThis.__PDD_REFRESH_SODIEN_AKTUALITATES__?.();
          } catch {
            /* ignore */
          }
          return;
        }
        try {
          let r = baseRow;
          const remoteId = await upsertRemoteEvent(supabase, r);
          if (remoteId && Number(r?.remoteId || 0) !== remoteId) {
            r = normalizeEvent({ ...r, remote_id: remoteId });
          }
          const staleAkt = Number(prevAktIdToClear || r?.details?.aktualitatesId || 0) || null;
          if (publish) {
            const newAkt = await upsertAktualitateFromEvent(supabase, r);
            const aktId = newAkt || staleAkt;
            r = normalizeEvent({
              ...r,
              details: { ...(r.details || {}), showInAktualitates: true, aktualitatesId: aktId || null },
            });
          } else {
            if (staleAkt) {
              try {
                await deleteAktualitateById(supabase, staleAkt);
              } catch {
                /* ignore */
              }
            }
            await deleteAktualitateByMarker(supabase, r?.id);
            deleteLocalAktualitateByEventId(r?.id);
            r = normalizeEvent({
              ...r,
              details: { ...(r.details || {}), showInAktualitates: false, aktualitatesId: null },
            });
          }
          await upsertRemoteEvent(supabase, r);
          const committed = nextEvents.map((x) => (String(x.id) === String(r.id) ? r : x));
          setEvents(committed);
          saveLocalEvents(committed);
          setDbMessage(publish ? "Publicēts komandai un aktualitātēs." : "Saglabāts melnrakstā.");
          setCardOpen(false);
          try {
            globalThis.__PDD_REFRESH_SODIEN_AKTUALITATES__?.();
          } catch {
            /* ignore */
          }
        } catch (e) {
          setDbMessage(`Saglabāšana neizdevās: ${String(e?.message || e)}`);
        }
      }

      async function saveCelebrationCard(publish) {
        const jub = String(celJubilar || "").trim();
        if (!jub) {
          setDbMessage("Norādi jubilāru / vārda dienas svinēto personu.");
          return;
        }
        if (!String(cardDate || "").trim()) {
          setDbMessage("Norādi datumu.");
          return;
        }
        if (!String(cardTime || "").trim()) {
          setDbMessage("Norādi laiku.");
          return;
        }
        const id = editingId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const prev = events.find((x) => x.id === id);
        const eventEt = String(cardEventType || "dzimsanas").trim();
        const label = eventEt === "varda_diena" ? "Vārda diena" : "Dzimšanas diena";
        const title = String(cardTitle || "").trim() || `${jub} — ${label}`;
        const kinds = eventEt === "varda_diena" ? [] : Array.from(new Set((celKinds || []).filter(Boolean)));
        const pal =
          eventEt === "varda_diena" ? SAL_CAL_EVENT_PALETTE.varda_diena : SAL_CAL_EVENT_PALETTE.dzimsanas;
        const link = String(celMeetingLink || "").trim();
        const loc = cardOnline ? (link || "online") : String(cardLocation || "").trim();
        const planSummary = summarizeCelebrationKinds(kinds);
        const organizerKey = (() => {
          const existing = String(prev?.details?.organizerKey || "").trim();
          if (existing) return existing;
          return (
            String(preferredActorUserId() || "").trim() ||
            String(globalThis.__PDD_ACTOR_EMAIL__ || sessionStorage.getItem("pdd_local_email") || "")
              .trim()
              .toLowerCase() ||
            String(actorKey() || "").trim()
          );
        })();
        const teamPick = loadTeamUsersForPollTargeting();
        const responsibleName =
          eventEt === "dzimsanas" && String(celQuizResponsibleKey || "").trim()
            ? String(teamPick.find((u) => pollTargetKeyForUser(u) === String(celQuizResponsibleKey || "").trim())?.name || "").trim()
            : "";
        const progPack =
          eventEt === "dzimsanas"
            ? {
                celebrationQuizResponsibleKey: String(celQuizResponsibleKey || "").trim(),
                celebrationProgramHtml: String(celProgramHtml || "").trim(),
                celebrationProgramAttachments: salNormalizeAttachmentList(celProgramAttachments),
              }
            : {
                celebrationQuizResponsibleKey: "",
                celebrationProgramHtml: "",
                celebrationProgramAttachments: [],
              };
        const progAttSaved = salNormalizeAttachmentList(celProgramAttachments);
        const descForRow = eventEt === "dzimsanas" ? String(celProgramHtml || "").trim() : "";
        const eventWhatLine = [planSummary, responsibleName ? `Programma: ${responsibleName}` : "", String(celMessage || "").trim()]
          .filter(Boolean)
          .join(" · ")
          .slice(0, 480);
        const row = normalizeEvent({
          id,
          remote_id: prev?.remoteId || null,
          event_date: cardDate,
          event_time: String(cardTime || "").trim(),
          category: cardCategory,
          event_type: eventEt,
          title,
          location: loc,
          is_online: Boolean(cardOnline),
          short_category: cardShortCategory || "komanda",
          icon: "🎂",
          color: pal?.border || cardColor || "#ec4899",
          description_html: descForRow,
          note: cardNote,
          details: {
            ...(prev?.details && typeof prev.details === "object" ? prev.details : {}),
            eventWhat: eventWhatLine || planSummary || String(celMessage || "").trim().slice(0, 240),
            whyJoin: detailWhyJoin,
            whatExpect: detailWhatExpect,
            dressCode: detailDressCode,
            bringAlong: detailBringAlong,
            fee: detailFee,
            timeTo: String(cardTimeTo || "").trim(),
            organizerKey,
            celebrationJubilar: jub,
            celebrationPlanKinds: kinds,
            celebrationMeetingLink: link,
            celebrationGiftNote: String(celGiftNote || "").trim(),
            celebrationMessage: String(celMessage || "").trim(),
            ...progPack,
            showInAktualitates: Boolean(publish),
            aktualitatesId: publish ? Number(prev?.details?.aktualitatesId || 0) || null : null,
          },
          poll: { items: [] },
          participants,
          attachments: eventEt === "dzimsanas" ? progAttSaved : [],
          updated_at: new Date().toISOString(),
        });
        const nextEvents = editingId ? events.map((x) => (x.id === id ? row : x)) : [row, ...events];
        const prevAkt = Number(prev?.details?.aktualitatesId || 0) || null;
        await persistCelebrationToStorage(nextEvents, row, publish, prevAkt);
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
            showInAktualitates: false,
            aktualitatesId: Number(events.find((x) => x.id === id)?.details?.aktualitatesId || 0) || null,
            organizerKey: (() => {
              const prev = events.find((x) => x.id === id);
              const existing = String(prev?.details?.organizerKey || "").trim();
              if (existing) return existing;
              return (
                String(preferredActorUserId() || "").trim() ||
                String(globalThis.__PDD_ACTOR_EMAIL__ || sessionStorage.getItem("pdd_local_email") || "")
                  .trim()
                  .toLowerCase() ||
                String(actorKey() || "").trim()
              );
            })(),
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
            items: pollItemsFromList(nextPolls),
          },
        };
        const nextEvents = events.map((x) => (x.id === editingId ? row : x));
        void persistEvents(nextEvents, row).catch((e) => {
          setDbMessage(`Aptaujas saglabāšana neizdevās: ${String(e?.message || e)}`);
        });
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
            items: pollItemsFromList(nextPolls),
          },
        };
        const nextEvents = events.map((x) => (x.id === editingId ? row : x));
        void persistEvents(nextEvents, row).catch((e) => {
          setDbMessage(`Aptaujas saglabāšana neizdevās: ${String(e?.message || e)}`);
        });
      }

      async function cancelPollById(pollId) {
        if (!pollId) return;
        const nextPolls = (Array.isArray(polls) ? polls : []).map((p) => {
          if (String(p?.id) !== String(pollId)) return p;
          return { ...p, question: "", optionsText: "", votes: {}, textAnswer: "", pollTitle: "", pollDate: "" };
        });
        setPolls(nextPolls);
        if (!editingId) return;
        const updated = events.find((x) => x.id === editingId);
        if (!updated) return;
        const row = {
          ...updated,
          poll: {
            items: pollItemsFromList(nextPolls),
          },
        };
        const nextEvents = events.map((x) => (x.id === editingId ? row : x));
        void persistEvents(nextEvents, row).catch((e) => {
          setDbMessage(`Aptaujas saglabāšana neizdevās: ${String(e?.message || e)}`);
        });
      }

      async function deletePollById(pollId) {
        if (!pollId) return;
        const nextPolls = (Array.isArray(polls) ? polls : []).filter((p) => String(p?.id) !== String(pollId));
        const safeNext = nextPolls.length
          ? nextPolls
          : [{ id: `poll-${Date.now()}`, type: "choice", pollTitle: "", pollDate: "", question: "", optionsText: "", votes: {}, textAnswer: "", audience: "all", targets: [], sentAt: "", sentBy: "" }];
        setPolls(safeNext);
        if (!editingId) return;
        const updated = events.find((x) => x.id === editingId);
        if (!updated) return;
        const row = {
          ...updated,
          poll: {
            items: pollItemsFromList(safeNext),
          },
        };
        const nextEvents = events.map((x) => (x.id === editingId ? row : x));
        void persistEvents(nextEvents, row).catch((e) => {
          setDbMessage(`Aptaujas saglabāšana neizdevās: ${String(e?.message || e)}`);
        });
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
            items: pollItemsFromList(nextPolls),
          },
        };
        const nextEvents = events.map((x) => (x.id === editingId ? row : x));
        void persistEvents(nextEvents, row).catch((e) => {
          setDbMessage(`Aptaujas saglabāšana neizdevās: ${String(e?.message || e)}`);
        });
      }

      function choiceLinesForEditor(poll) {
        const parts = String(poll?.optionsText ?? "").split(/\r?\n/);
        if (parts.length === 0) return ["", ""];
        if (parts.length === 1) return [parts[0], ""];
        return parts;
      }

      function setChoiceLineAt(pollId, index, value) {
        setPolls((prev) =>
          prev.map((p) => {
            if (String(p.id) !== String(pollId)) return p;
            const base = choiceLinesForEditor(p);
            const next = base.slice();
            while (next.length <= index) next.push("");
            next[index] = value;
            return { ...p, optionsText: next.join("\n") };
          })
        );
      }

      function addChoiceLineForPoll(pollId) {
        setPolls((prev) =>
          prev.map((p) => {
            if (String(p.id) !== String(pollId)) return p;
            const base = choiceLinesForEditor(p);
            return { ...p, optionsText: [...base, ""].join("\n") };
          })
        );
      }

      function removeChoiceLineForPoll(pollId, index) {
        setPolls((prev) =>
          prev.map((p) => {
            if (String(p.id) !== String(pollId)) return p;
            const base = choiceLinesForEditor(p);
            const cut = base.filter((_, i) => i !== index);
            const safe = cut.length >= 2 ? cut : [cut[0] || "", cut[1] || ""];
            return { ...p, optionsText: safe.join("\n") };
          })
        );
      }

      function applyPollQuickTemplate(pollId, tplKey) {
        const map = {
          yes_no_maybe: ["Jā", "Nē", "Varbūt"],
          agree: ["Piekritu", "Nepiekritu", "Neitrali"],
          scale5: ["1 — ļoti slikti", "2", "3", "4", "5 — izcili"],
          weekdaysLv: ["Pirmdiena", "Otrdiena", "Trešdiena", "Ceturtdiena", "Piektdiena"],
          day_parts: ["Rīts (līdz 12:00)", "Diena (12:00–17:00)", "Vakars (pēc 17:00)"],
        };
        const opts = map[tplKey];
        if (!opts) return;
        setPolls((prev) =>
          prev.map((p) =>
            String(p.id) !== String(pollId) ? p : { ...p, type: "choice", optionsText: opts.join("\n") }
          )
        );
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
      const teamUsers = Array.isArray(globalThis.KOMANDA?.loadTeamUsers?.()) ? globalThis.KOMANDA.loadTeamUsers() : [];
      const prettyPersonName = (rawKey) => {
        const raw = String(rawKey || "").trim();
        if (!raw) return "Nezināms";
        const byId = teamUsers.find((u) => String(u?.id ?? "").trim() === raw);
        if (byId) return String(byId["Vārds uzvārds"] || byId.full_name || byId.email || raw).trim();
        const low = raw.toLowerCase();
        const byEmail = teamUsers.find((u) => {
          const a = String(u?.email ?? "").trim().toLowerCase();
          const b = String(u?.["i-mail"] ?? "").trim().toLowerCase();
          const c = String(u?.["e-mail"] ?? "").trim().toLowerCase();
          return a === low || b === low || c === low;
        });
        if (byEmail) return String(byEmail["Vārds uzvārds"] || byEmail.full_name || byEmail.email || raw).trim();
        if (raw.includes("@")) return raw.split("@")[0];
        return raw;
      };
      const rsvpPeople = Object.entries(participants || {}).reduce(
        (acc, [uid, row]) => {
          const statusRaw = row && typeof row === "object" ? row.status : row;
          const status = String(statusRaw || "maybe").trim().toLowerCase();
          const person = prettyPersonName(uid);
          if (status === "yes") acc.yes.push(person);
          else if (status === "no") acc.no.push(person);
          else acc.maybe.push(person);
          return acc;
        },
        { yes: [], maybe: [], no: [] }
      );
      const editingEventRow = editingId ? events.find((x) => String(x?.id) === String(editingId)) : null;
      const organizerKeyStored = String(editingEventRow?.details?.organizerKey || "").trim();
      const actorK = String(actorKey() || "").trim();
      const actorEmail = String(globalThis.__PDD_ACTOR_EMAIL__ || sessionStorage.getItem("pdd_local_email") || "")
        .trim()
        .toLowerCase();
      const actorId = String(preferredActorUserId() || "").trim();
      const mayDesignPolls =
        !editingId ||
        !organizerKeyStored ||
        organizerKeyStored === actorK ||
        (!!actorEmail && organizerKeyStored.toLowerCase() === actorEmail) ||
        (!!actorId && organizerKeyStored === actorId);

      function viewerPollTargetKeys() {
        const keys = new Set();
        const id = String(preferredActorUserId() || "").trim();
        const em = String(globalThis.__PDD_ACTOR_EMAIL__ || sessionStorage.getItem("pdd_local_email") || "").trim().toLowerCase();
        const ak = String(actorKey() || "").trim();
        if (id) keys.add(id);
        if (em) keys.add(em);
        if (ak) keys.add(ak);
        return keys;
      }
      function pollAppliesToViewer(poll) {
        if (!String(poll?.sentAt || "").trim()) return false;
        const aud = String(poll?.audience || "all") === "selected" ? "selected" : "all";
        if (aud !== "selected") return true;
        const targets = Array.isArray(poll?.targets) ? poll.targets.map((t) => String(t || "").trim()).filter(Boolean) : [];
        if (!targets.length) return false;
        const keys = viewerPollTargetKeys();
        return targets.some((t) => keys.has(t));
      }
      function pollPendingForViewer(poll) {
        if (!pollAppliesToViewer(poll)) return false;
        if (!String(poll?.question || "").trim()) return false;
        const who = actorKey();
        const votes = poll?.votes && typeof poll.votes === "object" ? poll.votes : {};
        const mine = String(votes[who] || "").trim();
        if (mine === "__DECLINED__") return false;
        return !mine;
      }
      function pollRecipientsLabel(poll) {
        if (!String(poll?.sentAt || "").trim()) return "Melnraksts";
        const aud = String(poll?.audience || "all") === "selected" ? "selected" : "all";
        if (aud !== "selected") return "Nosūtīts: visiem komandas dalībniekiem";
        const targets = Array.isArray(poll?.targets) ? poll.targets.map((t) => String(t || "").trim()).filter(Boolean) : [];
        const teamUsersMeta = loadTeamUsersForPollTargeting();
        if (!targets.length) return "Nosūtīts: izvēlētajiem (nav adresātu)";
        const names = targets.map((t) => {
          const u = teamUsersMeta.find((x) => pollTargetKeyForUser(x) === t);
          return u ? u.name : t;
        });
        const head = names.slice(0, 6).join(", ");
        return `Nosūtīts: ${head}${names.length > 6 ? "…" : ""}`;
      }
      function formatPollDateLv(ymd) {
        const s = String(ymd || "").trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
        const d = new Date(`${s}T12:00:00`);
        if (Number.isNaN(d.getTime())) return s;
        return d.toLocaleDateString("lv-LV", { day: "2-digit", month: "2-digit", year: "numeric" });
      }
      function pollDisplayTitle(poll) {
        const t = String(poll?.pollTitle || "").trim();
        if (t) return t;
        const q = String(poll?.question || "").trim();
        return q.slice(0, 120) || "Aptauja";
      }
      const sentPollsForList = (Array.isArray(polls) ? polls : []).filter((p) => String(p?.sentAt || "").trim());
      const pollHistoryForList = (Array.isArray(polls) ? polls : []).filter((p) => keepPollItemInUiState(p));
      const pendingPollCountForCard = (Array.isArray(polls) ? polls : []).reduce((acc, p) => acc + (pollPendingForViewer(p) ? 1 : 0), 0);

      const useFullEventCard = cardEventType === "saliedesana" || cardEventType === "cits";
      const useCelebrationCard = cardEventType === "dzimsanas" || cardEventType === "varda_diena";
      const celHeaderTitle = cardEventType === "varda_diena" ? "Vārda diena" : "Dzimšanas diena";
      const showCelMeetLink = Boolean(cardOnline) || celKinds.includes("online");
      const showCelGiftSec = cardEventType === "dzimsanas" && celKinds.includes("gifts");
      const celSuggestUsers = loadTeamUsersForPollTargeting();
      function toggleCelKind(kid) {
        if (cardEventType !== "dzimsanas") return;
        setCelKinds((prev) => {
          const p = Array.isArray(prev) ? prev : [];
          return p.includes(kid) ? p.filter((x) => x !== kid) : [...p, kid];
        });
      }
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
                      ${dayEvents.map((e) => {
                        const pal = salCalPaletteForEvent(e);
                        const pillStyle =
                          e.category === "holiday" || !pal ? {} : { background: pal.bg, borderColor: pal.border, color: pal.fg };
                        return html`
                        <span
                          key=${e.id}
                          class=${salCalPillClassNames(e)}
                          style=${pillStyle}
                          onClick=${() => openCardEdit(e)}
                          title="Labot ierakstu"
                        >
                          ${(e.icon ? `${e.icon} ` : "") + e.title}
                          ${eventHasAttachments(e) ? html`<span class="pdd-attach-clip" title="Ir pievienots pielikums" aria-label="Ir pievienots pielikums">📎</span>` : null}
                        </span>
                      `;
                      })}
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
                      <strong>
                        ${(e.icon ? `${e.icon} ` : "") + e.title}
                        ${eventHasAttachments(e) ? html`<span class="pdd-attach-clip" title="Ir pievienots pielikums" aria-label="Ir pievienots pielikums">📎</span>` : null}
                      </strong>
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
                  <div
                    class=${`sal-modal${useCelebrationCard ? " sal-modal--cel" : ""}`}
                    onClick=${(e) => e.stopPropagation()}
                  >
                    <h3>${useCelebrationCard ? celHeaderTitle : editingId ? "Pasākuma kartiņa" : "Jauns pasākums"}</h3>
                    <p class="sal-modal-note">
                      ${useCelebrationCard
                        ? html`Komandas iekšējā pieteikuma kartiņa · datums <strong>${cardDate || "—"}</strong>`
                        : html`Datums: <strong>${cardDate || "—"}</strong>. Krāsaini un atraktīvi! 🎈`}
                    </p>
                    <form
                      class="stack"
                      onSubmit=${(e) => {
                        if (useCelebrationCard) {
                          e.preventDefault();
                          return;
                        }
                        saveCard(e);
                      }}
                    >
                      <div class="row" style=${{ gap: ".65rem" }}>
                        <div class="field" style=${{ flex: 1 }}>
                          <label>Pasākuma veids</label>
                          <select
                            class="select"
                            value=${cardEventType}
                            onChange=${(e) => {
                              const v = e.target.value;
                              const prevEt = cardEventType;
                              setCardEventType(v);
                              if (v === "varda_diena") setCelKinds([]);
                              if (v === "varda_diena" || (prevEt === "dzimsanas" && v !== "dzimsanas")) {
                                setCelQuizResponsibleKey("");
                                setCelProgramHtml("");
                                setCelProgramAttachments([]);
                                setCelProgAttLabel("");
                                setCelProgAttUrl("");
                              }
                            }}
                          >
                            <option value="saliedesana">Saliedēšanas pasākums</option>
                            <option value="dzimsanas">Dzimšanas diena</option>
                            <option value="varda_diena">Vārda diena</option>
                            <option value="cits">Cits pasākums</option>
                          </select>
                        </div>
                      </div>

                      ${useFullEventCard
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
                              <p style=${{ margin: "0 0 .35rem", fontSize: ".74rem", color: "#64748b" }}>
                                Saglabāti DB kolonnā <strong>Pielikumi</strong> (kopā ar pasākumu). Faili un attēli — Supabase bucket
                                <code style=${{ fontSize: ".72rem" }}>pdd-saliedesana-files</code> (vajadzīga pieslēgšanās). Ja augšupielāde neizdodas, attēlam var izmantot datu URL.
                              </p>
                              <div class="field" style=${{ marginBottom: ".35rem" }}>
                                <label style=${{ fontSize: ".78rem" }}>Nosaukums (pēc izvēles, saitei / failam)</label>
                                <input class="input" placeholder="Piem., Pieteikuma veidlapa" value=${attLabel} onInput=${(e) => setAttLabel(e.target.value)} />
                              </div>
                              <div class="row" style=${{ gap: ".45rem", flexWrap: "wrap" }}>
                                <input class="input" style=${{ flex: 1 }} placeholder="https://..." value=${attUrl} onInput=${(e) => setAttUrl(e.target.value)} />
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
                                <button type="button" class="btn btn-ghost btn-small" onClick=${() => document.getElementById("sal-file-upload-input")?.click()}>Pievienot failu</button>
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
                                <input
                                  id="sal-file-upload-input"
                                  type="file"
                                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,image/*"
                                  style=${{ display: "none" }}
                                  onChange=${(e) => {
                                    const file = e.target?.files?.[0];
                                    addBinaryFileAttachment(file);
                                    e.target.value = "";
                                  }}
                                />
                              </div>
                              ${attachments.map((a, idx) => html`
                                <div key=${`att-${idx}`} class="sal-att-item">
                                  <button type="button" class="btn btn-ghost btn-small" onClick=${() => openUrlSafe(a.url)}>
                                    ${a.kind === "image" ? "🖼️ " : a.kind === "file" ? "📎 " : "🔗 "}${a.label}
                                  </button>
                                  <button type="button" class="btn btn-danger btn-small" onClick=${() => removeAttachmentAt(idx)}>Dzēst</button>
                                </div>
                              `)}
                            </div>

                            <div class="sal-poll-box">
                              <div class="sal-poll-panels">
                                <div class="sal-poll-panel sal-poll-panel--list">
                                  <div class="sal-poll-panel-head">
                                    <strong>Aptauju saraksts</strong>
                                    <span class="sal-poll-panel-hint"
                                      >${pollHistoryForList.length
                                        ? `${pollHistoryForList.length} saglabātas${sentPollsForList.length ? ` · ${sentPollsForList.length} nosūtītas` : ""}`
                                        : "vēl nav"}</span
                                    >
                                  </div>
                                  ${pollHistoryForList.length
                                    ? html`<ul class="sal-poll-sent-list">
                                        ${pollHistoryForList.map(
                                          (poll) => html`<li class="sal-poll-sent-item" key=${poll.id}>
                                            <div class="sal-poll-sent-title">${pollDisplayTitle(poll)}</div>
                                            <div class="sal-poll-sent-meta">
                                              ${[formatPollDateLv(poll.pollDate), pollRecipientsLabel(poll)].filter(Boolean).join(" · ")}
                                            </div>
                                          </li>`
                                        )}
                                      </ul>`
                                    : html`<p class="sal-poll-empty">Šeit parādīsies saglabātās aptaujas pēc «Saglabāt pasākumu» vai nosūtīšanas.</p>`}
                                </div>

                                ${mayDesignPolls
                                  ? html`<div class="sal-poll-panel sal-poll-panel--design">
                                      <button type="button" class="sal-poll-panel-toggle" onClick=${() => setPollCreationOpen((v) => !v)}>
                                        ${pollCreationOpen ? "▼ Slēpt aptauju veidošanu" : "▶ Aptauju veidošana"}
                                      </button>
                                      ${pollCreationOpen
                                        ? html`<div class="sal-poll-panel-body sal-poll-studio">
                                            <p class="sal-poll-studio-help">
                                              <strong>Organizatoram:</strong> sagatavo jautājumu un variantus, tad spied
                                              <strong>Nosūtīt</strong>. Aizpildīšana un apkopojums ir atsevišķos blokos zemāk.
                                            </p>
                                            ${polls.map((poll, idx) => {
                                              const lines = choiceLinesForEditor(poll);
                                              const teamUsers = loadTeamUsersForPollTargeting();
                                              const targets = Array.isArray(poll.targets) ? poll.targets : [];
                                              const audience = String(poll.audience || "all") === "selected" ? "selected" : "all";
                                              return html`<div key=${poll.id} class="sal-reason-block">
                                                <p class="sal-poll-sec-title">Aptauja ${idx + 1}</p>
                                                <div class="row" style=${{ gap: ".3rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
                                                  <button type="button" class="btn btn-ghost btn-small" onClick=${() => cancelPollById(poll.id)}>Atiestatīt aptauju</button>
                                                  <button type="button" class="btn btn-danger btn-small" onClick=${() => deletePollById(poll.id)}>Dzēst aptauju</button>
                                                </div>
                                                <div class="sal-reason-block" style=${{ borderStyle: "dashed", background: "#fffbeb" }}>
                                                  <strong style=${{ color: "#9a3412", fontSize: ".78rem" }}>Nosūtīt aptauju</strong>
                                                  <p style=${{ margin: "0", fontSize: ".74rem", color: "#7c2d12" }}>
                                                    Uzaicinājums navigācijā parādīsies tikai tiem, kam nosūtīts (vai visiem).
                                                    ${poll.sentAt
                                                      ? html`<br /><span style=${{ color: "#64748b" }}>Nosūtīts: ${String(poll.sentAt).slice(0, 16).replace("T", " ")} (${poll.sentBy || "—"})</span>`
                                                      : null}
                                                  </p>
                                                  <div class="row" style=${{ gap: ".35rem", flexWrap: "wrap" }}>
                                                    <button
                                                      type="button"
                                                      class="btn btn-ghost btn-small"
                                                      onClick=${() => setPollAudienceAll(poll.id)}
                                                      style=${audience === "all" ? { background: "#dcfce7", borderColor: "#4ade80", color: "#14532d" } : {}}
                                                    >
                                                      Visi lietotāji
                                                    </button>
                                                    <details class="sal-reason-block" style=${{ margin: 0, padding: ".35rem .45rem", background: "#fff" }} open=${false}>
                                                      <summary style=${{ cursor: "pointer", fontSize: ".74rem", color: "#0f172a" }}>
                                                        Izvēlēti lietotāji (${targets.length || 0})
                                                      </summary>
                                                      <div style=${{ display: "grid", gap: ".25rem", marginTop: ".35rem", maxHeight: "180px", overflow: "auto" }}>
                                                        ${teamUsers.length
                                                          ? teamUsers.map((u) => {
                                                              const key = pollTargetKeyForUser(u);
                                                              const checked = key && targets.includes(key);
                                                              return html`<label key=${`${poll.id}-t-${key}`} style=${{ display: "flex", alignItems: "center", gap: ".45rem", fontSize: ".78rem" }}>
                                                                <input type="checkbox" checked=${checked} onChange=${() => togglePollTarget(poll.id, key)} />
                                                                <span>${u.name}</span>
                                                              </label>`;
                                                            })
                                                          : html`<span style=${{ fontSize: ".74rem", color: "#64748b" }}>Nav ielādēts komandas saraksts.</span>`}
                                                      </div>
                                                      <div class="row" style=${{ gap: ".35rem", flexWrap: "wrap", marginTop: ".35rem" }}>
                                                        <button
                                                          type="button"
                                                          class="btn btn-ghost btn-small"
                                                          onClick=${() =>
                                                            setPolls((prev) =>
                                                              (Array.isArray(prev) ? prev : []).map((p) =>
                                                                String(p?.id) === String(poll.id) ? { ...p, audience: "selected" } : p
                                                              )
                                                            )}
                                                          style=${audience === "selected" ? { background: "#dbeafe", borderColor: "#60a5fa" } : {}}
                                                        >
                                                          Lietot tikai izvēlētos
                                                        </button>
                                                        <button
                                                          type="button"
                                                          class="btn btn-ghost btn-small"
                                                          onClick=${() =>
                                                            setPolls((prev) =>
                                                              (Array.isArray(prev) ? prev : []).map((p) =>
                                                                String(p?.id) === String(poll.id) ? { ...p, targets: [] } : p
                                                              )
                                                            )}
                                                        >
                                                          Notīrīt izvēli
                                                        </button>
                                                      </div>
                                                    </details>
                                                    <button type="button" class="btn btn-primary btn-small" onClick=${() => sendPollInvite(poll.id, audience)}>
                                                      Nosūtīt
                                                    </button>
                                                  </div>
                                                </div>
                                                <div class="field">
                                                  <label>Aptaujas veids</label>
                                                  <select
                                                    class="select"
                                                    value=${poll.type || "choice"}
                                                    onChange=${(e) => {
                                                      const value = String(e.target.value || "choice") === "text" ? "text" : "choice";
                                                      setPolls((prev) => prev.map((p) => (p.id === poll.id ? { ...p, type: value } : p)));
                                                    }}
                                                  >
                                                    <option value="choice">Vairāki varianti (viena izvēle)</option>
                                                    <option value="text">Brīva teksta atbilde</option>
                                                  </select>
                                                </div>
                                                <div class="field">
                                                  <label>Aptaujas nosaukums</label>
                                                  <input
                                                    class="input"
                                                    placeholder="Piem., Kopīgais brauciens — transporta izvēle"
                                                    value=${poll.pollTitle || ""}
                                                    onInput=${(e) => {
                                                      const value = e.target.value;
                                                      setPolls((prev) => prev.map((p) => (p.id === poll.id ? { ...p, pollTitle: value } : p)));
                                                    }}
                                                  />
                                                </div>
                                                <div class="field">
                                                  <label>Aptaujas datums</label>
                                                  <input
                                                    class="input"
                                                    type="date"
                                                    value=${poll.pollDate || ""}
                                                    onInput=${(e) => {
                                                      const value = e.target.value;
                                                      setPolls((prev) => prev.map((p) => (p.id === poll.id ? { ...p, pollDate: value } : p)));
                                                    }}
                                                  />
                                                </div>
                                                <div class="field">
                                                  <label>Jautājums</label>
                                                  <input
                                                    class="input"
                                                    placeholder="Piem., Kurš datums der vislabāk?"
                                                    value=${poll.question}
                                                    onInput=${(e) => {
                                                      const value = e.target.value;
                                                      setPolls((prev) => prev.map((p) => (p.id === poll.id ? { ...p, question: value } : p)));
                                                    }}
                                                  />
                                                </div>
                                                ${poll.type === "text"
                                                  ? html`<p style=${{ margin: 0, fontSize: ".74rem", color: "#64748b" }}>
                                                      Brīvas atbildes aizpilda dalībnieki blokā «Aizpildi aptauju».
                                                    </p>`
                                                  : html`<div class="field">
                                                      <label>Atbilžu varianti</label>
                                                      <p style=${{ margin: "0 0 .25rem", fontSize: ".72rem", color: "#64748b" }}>
                                                        Katram variantam savs lauks. Vismaz divi derīgi varianti, lai varētu balsot.
                                                      </p>
                                                      <div class="sal-poll-opt-list">
                                                        ${lines.map((line, oi) => html`
                                                          <div key=${`${poll.id}-opt-${oi}`} class="sal-poll-opt-row">
                                                            <span class="sal-poll-opt-idx">${oi + 1}.</span>
                                                            <input
                                                              class="input"
                                                              placeholder=${`Variants ${oi + 1}`}
                                                              value=${line}
                                                              onInput=${(e) => setChoiceLineAt(poll.id, oi, e.target.value)}
                                                            />
                                                            <button
                                                              type="button"
                                                              class="btn btn-ghost btn-small"
                                                              disabled=${lines.length <= 2}
                                                              title="Vismaz divas rindas"
                                                              onClick=${() => removeChoiceLineForPoll(poll.id, oi)}
                                                            >
                                                              ✕
                                                            </button>
                                                          </div>`)}
                                                      </div>
                                                      <button type="button" class="btn btn-ghost btn-small" onClick=${() => addChoiceLineForPoll(poll.id)}>
                                                        + Pievienot variantu
                                                      </button>
                                                      <div class="sal-poll-quick">
                                                        <span class="sal-poll-quick-h">Ātri:</span>
                                                        <button type="button" class="btn btn-ghost btn-small" onClick=${() => applyPollQuickTemplate(poll.id, "yes_no_maybe")}>Jā / Nē / Varbūt</button>
                                                        <button type="button" class="btn btn-ghost btn-small" onClick=${() => applyPollQuickTemplate(poll.id, "agree")}>Piekritu / Nepiekritu / Neitrali</button>
                                                        <button type="button" class="btn btn-ghost btn-small" onClick=${() => applyPollQuickTemplate(poll.id, "scale5")}>1–5</button>
                                                        <button type="button" class="btn btn-ghost btn-small" onClick=${() => applyPollQuickTemplate(poll.id, "weekdaysLv")}>P–Pk</button>
                                                        <button type="button" class="btn btn-ghost btn-small" onClick=${() => applyPollQuickTemplate(poll.id, "day_parts")}>Rīts / Diena / Vakars</button>
                                                      </div>
                                                    </div>`}
                                              </div>`;
                                            })}
                                            <button
                                              type="button"
                                              class="btn btn-ghost btn-small"
                                              onClick=${() =>
                                                setPolls((prev) => [
                                                  ...(Array.isArray(prev) ? prev : []),
                                                  {
                                                    id: `poll-${Date.now()}`,
                                                    type: "choice",
                                                    pollTitle: "",
                                                    pollDate: String(cardDate || "").trim(),
                                                    question: "",
                                                    optionsText: "",
                                                    votes: {},
                                                    textAnswer: "",
                                                    audience: "all",
                                                    targets: [],
                                                    sentAt: "",
                                                    sentBy: "",
                                                  },
                                                ])}
                                            >
                                              + Pievienot jaunu aptauju
                                            </button>
                                          </div>`
                                        : null}
                                    </div>`
                                  : null}

                                <div
                                  class="sal-poll-panel sal-poll-panel--fill"
                                  id="sal-poll-fill-anchor"
                                  style=${{ display: pendingPollCountForCard > 0 ? "grid" : "none" }}
                                >
                                  <div class="sal-poll-panel-head sal-poll-panel-head--urgent">
                                    <strong>Aizpildi aptauju</strong>
                                    <span class="sal-poll-panel-hint">${pendingPollCountForCard ? `${pendingPollCountForCard} gaida` : "—"}</span>
                                  </div>
                                  ${pendingPollCountForCard > 0
                                    ? (Array.isArray(polls) ? polls : [])
                                        .filter((poll) => pollPendingForViewer(poll))
                                        .map((poll, idx) => {
                                          const options = pollOptionsArray(poll.optionsText).filter((x) => String(x).trim());
                                          const myVote = String((poll.votes && typeof poll.votes === "object" ? poll.votes[actorKey()] : "") || "");
                                          return html`<div key=${poll.id} class="sal-reason-block sal-poll-fill-card">
                                            <p class="sal-poll-sec-title">${pollDisplayTitle(poll)}</p>
                                            ${formatPollDateLv(poll.pollDate)
                                              ? html`<div style=${{ fontSize: ".72rem", color: "#64748b", marginBottom: ".25rem" }}>${formatPollDateLv(poll.pollDate)}</div>`
                                              : null}
                                            <div style=${{ fontSize: ".82rem", color: "#0f172a", marginBottom: ".35rem" }}>${poll.question || ""}</div>
                                            ${poll.type === "text"
                                              ? html`<div class="field">
                                                  <label>Tava atbilde</label>
                                                  <textarea
                                                    class="textarea"
                                                    rows="3"
                                                    placeholder="Īss teksts…"
                                                    value=${poll.textAnswer || myVote || ""}
                                                    onInput=${(e) => {
                                                      const value = e.target.value;
                                                      setPolls((prev) => prev.map((p) => (p.id === poll.id ? { ...p, textAnswer: value } : p)));
                                                    }}
                                                  ></textarea>
                                                </div>
                                                <button type="button" class="btn btn-primary btn-small" onClick=${() => savePollTextAnswer(poll.id, poll.textAnswer || myVote || "")}>
                                                  Saglabāt atbildi
                                                </button>`
                                              : html`<div class="field">
                                                  <label>Izvēlies variantu</label>
                                                  <div class="sal-vote-row">
                                                    ${options.map((opt) => {
                                                      const selected = myVote === opt;
                                                      return html`
                                                        <label
                                                          key=${`${poll.id}-fill-${opt}`}
                                                          class="sal-vote-option"
                                                          style=${selected ? { background: "#dbeafe", borderColor: "#60a5fa" } : {}}
                                                        >
                                                          <span style=${{ display: "inline-flex", alignItems: "center", gap: ".45rem" }}>
                                                            <input
                                                              type="radio"
                                                              name=${`sal-poll-fill-${poll.id}`}
                                                              checked=${selected}
                                                              onChange=${() => castPollVote(poll.id, opt)}
                                                            />
                                                            ${opt}
                                                          </span>
                                                        </label>`;
                                                    })}
                                                  </div>
                                                  <button type="button" class="btn btn-ghost btn-small" onClick=${() => clearMyPollAnswer(poll.id)}>
                                                    Notīrīt manu balsi
                                                  </button>
                                                </div>`}
                                          </div>`;
                                        })
                                    : null}
                                </div>

                                <div class="sal-poll-panel sal-poll-panel--results">
                                  <button type="button" class="sal-poll-panel-toggle" onClick=${() => setPollResultsOpen((v) => !v)}>
                                    ${pollResultsOpen ? "▼ Slēpt aptauju rezultātus" : "▶ Aptauju rezultāti"}
                                  </button>
                                  ${pollResultsOpen
                                    ? html`<div class="sal-poll-panel-body">
                                        ${sentPollsForList.length
                                          ? sentPollsForList.map((poll, idx) => {
                                              const options = pollOptionsArray(poll.optionsText).filter((x) => String(x).trim());
                                              const votes = poll.votes && typeof poll.votes === "object" ? poll.votes : {};
                                              const entries = Object.entries(votes).filter(
                                                ([uid, val]) => String(val || "").trim() && String(val) !== "__DECLINED__"
                                              );
                                              const totalVotes = entries.length;
                                              return html`<div key=${poll.id} class="sal-reason-block sal-poll-results-card">
                                                <p class="sal-poll-sec-title">${pollDisplayTitle(poll)}</p>
                                                <div style=${{ fontSize: ".72rem", color: "#64748b", marginBottom: ".35rem" }}>
                                                  ${[formatPollDateLv(poll.pollDate), pollRecipientsLabel(poll)].filter(Boolean).join(" · ")}
                                                </div>
                                                ${poll.type === "text"
                                                  ? html`<div class="sal-poll-text-answers">
                                                      ${entries.length
                                                        ? entries.map(
                                                            ([uid, val]) => html`<div key=${uid} class="sal-poll-text-answer">
                                                              <div class="sal-poll-text-author">${prettyPersonName(uid)}</div>
                                                              <div>${String(val || "—")}</div>
                                                            </div>`
                                                          )
                                                        : html`<p class="sal-poll-empty">Vēl nav atbilžu.</p>`}
                                                    </div>`
                                                  : html`<div class="sal-poll-results-bars">
                                                      ${(() => {
                                                        const counts = {};
                                                        options.forEach((opt) => {
                                                          counts[opt] = 0;
                                                        });
                                                        entries.forEach(([, val]) => {
                                                          if (counts[val] === undefined) counts[val] = 0;
                                                          counts[val] += 1;
                                                        });
                                                        return options.map((opt) => {
                                                          const c = counts[opt] || 0;
                                                          const pct = totalVotes ? Math.round((c / totalVotes) * 100) : 0;
                                                          return html`<div key=${`res-${poll.id}-${opt}`} class="sal-poll-bar-item">
                                                            <div class="sal-poll-bar-label">
                                                              <span>${opt}</span>
                                                              <span>${c} (${pct}%)</span>
                                                            </div>
                                                            <div class="sal-poll-bar-track">
                                                              <div class="sal-poll-bar-fill" style=${{ width: `${pct}%` }}></div>
                                                            </div>
                                                          </div>`;
                                                        });
                                                      })()}
                                                    </div>`}
                                              </div>`;
                                            })
                                          : html`<p class="sal-poll-empty">Nav nosūtītu aptauju, ko rādīt.</p>`}
                                      </div>`
                                    : null}
                                </div>
                              </div>
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
                              <div class="sal-rsvp-summary-grid">
                                <div class="sal-rsvp-summary-col">
                                  <div class="sal-rsvp-summary-head"><span>✅ Piedalīsies</span><strong>${rsvpPeople.yes.length}</strong></div>
                                  ${rsvpPeople.yes.length
                                    ? html`<ul class="sal-rsvp-summary-list">${rsvpPeople.yes.map((name) => html`<li key=${`yes-${name}`}>${name}</li>`)}</ul>`
                                    : html`<div class="sal-rsvp-summary-empty">Pagaidām nav atzīmju.</div>`}
                                </div>
                                <div class="sal-rsvp-summary-col">
                                  <div class="sal-rsvp-summary-head"><span>🟡 Varbūt</span><strong>${rsvpPeople.maybe.length}</strong></div>
                                  ${rsvpPeople.maybe.length
                                    ? html`<ul class="sal-rsvp-summary-list">${rsvpPeople.maybe.map((name) => html`<li key=${`maybe-${name}`}>${name}</li>`)}</ul>`
                                    : html`<div class="sal-rsvp-summary-empty">Pagaidām nav atzīmju.</div>`}
                                </div>
                                <div class="sal-rsvp-summary-col">
                                  <div class="sal-rsvp-summary-head"><span>❌ Nepiedalīsies</span><strong>${rsvpPeople.no.length}</strong></div>
                                  ${rsvpPeople.no.length
                                    ? html`<ul class="sal-rsvp-summary-list">${rsvpPeople.no.map((name) => html`<li key=${`no-${name}`}>${name}</li>`)}</ul>`
                                    : html`<div class="sal-rsvp-summary-empty">Pagaidām nav atzīmju.</div>`}
                                </div>
                              </div>
                            </div>
                          `
                        : useCelebrationCard
                          ? html`
                            <datalist id="sal-cel-jubilar-list">
                              ${celSuggestUsers.map((u) => html`<option value=${u.name} />`)}
                            </datalist>
                            <div class="sal-cel-wrap" role="region" aria-label=${celHeaderTitle}>
                              <div class="sal-cel-confetti" aria-hidden="true">✨ · 🎈 · ✨</div>
                              <div class="sal-cel-head">
                                <div class="sal-cel-head-icon" aria-hidden="true">🎂</div>
                                <div class="sal-cel-head-text">
                                  <h4 class="sal-cel-title">${celHeaderTitle}</h4>
                                  <p class="sal-cel-sub">Paziņo komandai, saplāno formātu un savāc dalības atzīmes.</p>
                                </div>
                              </div>
                              <div class="sal-cel-sec">
                                <p class="sal-cel-sec-title">Pamata informācija</p>
                                <div class="sal-cel-field">
                                  <label for="sal-cel-jubilar">Jubilārs / gaviļnieks</label>
                                  <input
                                    id="sal-cel-jubilar"
                                    class="input"
                                    list="sal-cel-jubilar-list"
                                    autocomplete="off"
                                    value=${celJubilar}
                                    placeholder="Izvēlies no saraksta vai ieraksti vārdu…"
                                    onInput=${(e) => setCelJubilar(e.target.value)}
                                  />
                                </div>
                                <div class="sal-cel-field">
                                  <label for="sal-cel-date">Datums</label>
                                  <input id="sal-cel-date" class="input" type="date" value=${cardDate} onInput=${(e) => setCardDate(e.target.value)} />
                                </div>
                                <div class="sal-cel-row2">
                                  <div class="sal-cel-field">
                                    <label for="sal-cel-time-from">No</label>
                                    <input
                                      id="sal-cel-time-from"
                                      class="input"
                                      type="time"
                                      value=${cardTime}
                                      onInput=${(e) => setCardTime(e.target.value)}
                                    />
                                  </div>
                                  <div class="sal-cel-field">
                                    <label for="sal-cel-time-to">Līdz</label>
                                    <input
                                      id="sal-cel-time-to"
                                      class="input"
                                      type="time"
                                      value=${cardTimeTo}
                                      onInput=${(e) => setCardTimeTo(e.target.value)}
                                    />
                                  </div>
                                </div>
                                <div class="sal-cel-field">
                                  <label for="sal-cel-loc">Vieta</label>
                                  <input
                                    id="sal-cel-loc"
                                    class="input"
                                    value=${cardLocation}
                                    placeholder="Birojs, sapulču telpa…"
                                    disabled=${Boolean(cardOnline)}
                                    onInput=${(e) => setCardLocation(e.target.value)}
                                  />
                                </div>
                                <label class="sal-cel-check">
                                  <input type="checkbox" checked=${cardOnline} onChange=${(e) => setCardOnline(Boolean(e.target.checked))} />
                                  Online apsveikums
                                </label>
                                ${showCelMeetLink
                                  ? html`<div class="sal-cel-field sal-cel-meet">
                                      <label for="sal-cel-meet">Tikšanās saite (Zoom, Meet, Teams…)</label>
                                      <input
                                        id="sal-cel-meet"
                                        class="input"
                                        type="url"
                                        inputmode="url"
                                        placeholder="https://…"
                                        value=${celMeetingLink}
                                        onInput=${(e) => setCelMeetingLink(e.target.value)}
                                      />
                                    </div>`
                                  : null}
                                <div class="sal-cel-field">
                                  <label for="sal-cel-title-opt">Rādāmais nosaukums kalendārā (pēc izvēles)</label>
                                  <input
                                    id="sal-cel-title-opt"
                                    class="input"
                                    value=${cardTitle}
                                    placeholder=${`${celJubilar || "Vārds"} — ${celHeaderTitle}`}
                                    onInput=${(e) => setCardTitle(e.target.value)}
                                  />
                                </div>
                              </div>
                              ${cardEventType === "dzimsanas"
                                ? html`<div class="sal-cel-sec">
                                    <p class="sal-cel-sec-title">Pasākuma tips</p>
                                    <p class="sal-cel-sub" style=${{ marginTop: "-.15rem" }}>Izvēlies vienu vai vairākus variantus.</p>
                                    <div class="sal-cel-chips" role="group" aria-label="Pasākuma formāts">
                                      ${CELEBRATION_KIND_CHIPS_BD.map(
                                        (c) =>
                                          html`<button
                                            type="button"
                                            key=${`cel-kind-${c.id}`}
                                            class=${`sal-cel-chip ${celKinds.includes(c.id) ? "is-on" : ""}`}
                                            aria-pressed=${celKinds.includes(c.id) ? "true" : "false"}
                                            onClick=${() => toggleCelKind(c.id)}
                                          >
                                            <span aria-hidden="true">${c.icon}</span> ${c.label}
                                          </button>`
                                      )}
                                    </div>
                                  </div>
                                  <div class="sal-cel-sec">
                                    <p class="sal-cel-sec-title">Viktorīna, aptauja vai cits apsveikums</p>
                                    <p class="sal-cel-sub" style=${{ marginTop: "-.15rem" }}>
                                      Norādi atbildīgo personu un pievieno materiālus — formāts kā aktualitātēs (teksts, attēli, saites, faili).
                                    </p>
                                    <div class="sal-cel-field">
                                      <label for="sal-cel-quiz-user">Atbildīgais par sagatavošanu</label>
                                      <select
                                        id="sal-cel-quiz-user"
                                        class="select"
                                        value=${celQuizResponsibleKey}
                                        onChange=${(e) => setCelQuizResponsibleKey(e.target.value)}
                                      >
                                        <option value="">— Izvēlies komandas biedru —</option>
                                        ${celSuggestUsers.map(
                                          (u) =>
                                            html`<option value=${pollTargetKeyForUser(u)} key=${`cel-u-${pollTargetKeyForUser(u)}`}>
                                              ${u.name}
                                            </option>`
                                        )}
                                      </select>
                                    </div>
                                    <div class="sal-cel-field">
                                      <label for="sal-cel-prog-html">Materiāli un apraksts</label>
                                      <div class="sal-rich-editor">
                                        <div class="sal-toolbar">
                                          <button type="button" class="btn btn-ghost btn-small" onClick=${() => applyCelProgramEditorCommand("bold")}>B</button>
                                          <button type="button" class="btn btn-ghost btn-small" onClick=${() => applyCelProgramEditorCommand("italic")}><em>I</em></button>
                                          <button type="button" class="btn btn-ghost btn-small" onClick=${() => applyCelProgramEditorCommand("underline")}><u>U</u></button>
                                          <button type="button" class="btn btn-ghost btn-small" onClick=${() => applyCelProgramEditorCommand("insertUnorderedList")}>• Saraksts</button>
                                          <button type="button" class="btn btn-ghost btn-small" onClick=${() => applyCelProgramEditorCommand("insertOrderedList")}>1. Saraksts</button>
                                          <select class="select" onChange=${(e) => applyCelProgramEditorCommand("fontSize", e.target.value)}>
                                            <option value="">Šrifta lielums</option>
                                            <option value="2">Mazs</option>
                                            <option value="3">Normāls</option>
                                            <option value="5">Liels</option>
                                            <option value="6">Ļoti liels</option>
                                          </select>
                                          <input type="color" title="Teksta krāsa" onInput=${(e) => applyCelProgramEditorCommand("foreColor", e.target.value)} />
                                          <input type="color" title="Fona krāsa" onInput=${(e) => applyCelProgramEditorCommand("hiliteColor", e.target.value)} />
                                        </div>
                                        <div
                                          class="sal-editor"
                                          contenteditable="true"
                                          ref=${celProgramEditorRef}
                                          onInput=${(e) => setCelProgramHtml(String(e.currentTarget.innerHTML || ""))}
                                          dangerouslySetInnerHTML=${{ __html: celProgramHtml }}
                                        ></div>
                                      </div>
                                    </div>
                                    <div class="field sal-attachments" style=${{ margin: 0 }}>
                                      <label>Pielikumi</label>
                                      <p style=${{ margin: "0 0 .35rem", fontSize: ".74rem", color: "#64748b" }}>
                                        Saglabāti kopā ar pasākumu (kolonna <strong>Pielikumi</strong> un metadatos). Attēli/faili —
                                        <code style=${{ fontSize: ".72rem" }}>pdd-saliedesana-files</code>.
                                      </p>
                                      <div class="field" style=${{ marginBottom: ".35rem" }}>
                                        <label style=${{ fontSize: ".78rem" }}>Nosaukums (pēc izvēles)</label>
                                        <input
                                          class="input"
                                          placeholder="Piem., Viktorīnas jautājumi"
                                          value=${celProgAttLabel}
                                          onInput=${(e) => setCelProgAttLabel(e.target.value)}
                                        />
                                      </div>
                                      <div class="row" style=${{ gap: ".45rem", flexWrap: "wrap" }}>
                                        <input
                                          class="input"
                                          style=${{ flex: 1 }}
                                          placeholder="https://..."
                                          value=${celProgAttUrl}
                                          onInput=${(e) => setCelProgAttUrl(e.target.value)}
                                        />
                                        <button type="button" class="btn btn-ghost btn-small" onClick=${() => addCelProgramAttachment("link")}>
                                          Pievienot saiti
                                        </button>
                                        <button
                                          type="button"
                                          class="btn btn-ghost btn-small"
                                          onClick=${() => {
                                            if (String(celProgAttUrl || "").trim()) addCelProgramAttachment("image");
                                            else document.getElementById("sal-cel-prog-image-upload")?.click();
                                          }}
                                        >
                                          Pievienot attēlu
                                        </button>
                                        <button
                                          type="button"
                                          class="btn btn-ghost btn-small"
                                          onClick=${() => document.getElementById("sal-cel-prog-file-upload")?.click()}
                                        >
                                          Pievienot failu
                                        </button>
                                        <input
                                          id="sal-cel-prog-image-upload"
                                          type="file"
                                          accept="image/*"
                                          style=${{ display: "none" }}
                                          onChange=${(e) => {
                                            const file = e.target?.files?.[0];
                                            addCelProgramImageFromFile(file);
                                            e.target.value = "";
                                          }}
                                        />
                                        <input
                                          id="sal-cel-prog-file-upload"
                                          type="file"
                                          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,image/*"
                                          style=${{ display: "none" }}
                                          onChange=${(e) => {
                                            const file = e.target?.files?.[0];
                                            void addCelProgramBinaryFile(file);
                                            e.target.value = "";
                                          }}
                                        />
                                      </div>
                                      ${celProgramAttachments.map(
                                        (a, idx) => html`
                                          <div key=${`cel-att-${idx}`} class="sal-att-item">
                                            <button type="button" class="btn btn-ghost btn-small" onClick=${() => openUrlSafe(a.url)}>
                                              ${a.kind === "image" ? "🖼️ " : a.kind === "file" ? "📎 " : "🔗 "}${a.label}
                                            </button>
                                            <button type="button" class="btn btn-danger btn-small" onClick=${() => void removeCelProgramAttachmentAt(idx)}>
                                              Dzēst
                                            </button>
                                          </div>
                                        `
                                      )}
                                    </div>
                                  </div>`
                                : null}
                              ${showCelGiftSec
                                ? html`<div class="sal-cel-sec sal-cel-gift">
                                    <p class="sal-cel-sec-title">Dāvanas</p>
                                    <div class="sal-cel-field">
                                      <label for="sal-cel-gift">Dāvanu / pasniegšanas piezīmes</label>
                                      <textarea
                                        id="sal-cel-gift"
                                        class="textarea"
                                        rows="2"
                                        placeholder="Piem., kopējā dāvana, naudas aploksne…"
                                        value=${celGiftNote}
                                        onInput=${(e) => setCelGiftNote(e.target.value)}
                                      />
                                    </div>
                                  </div>`
                                : null}
                              <div class="sal-cel-sec">
                                <p class="sal-cel-sec-title">Dalība un apsveikumi</p>
                                <div class="sal-cel-field">
                                  <label for="sal-cel-msg">Ziņa komandai / apsveikums</label>
                                  <textarea
                                    id="sal-cel-msg"
                                    class="textarea"
                                    rows="2"
                                    placeholder="Īss sveiciens vai instrukcijas…"
                                    value=${celMessage}
                                    onInput=${(e) => setCelMessage(e.target.value)}
                                  />
                                </div>
                                <div class="sal-cel-rsvp">
                                  <span class="sal-rsvp-stat">Tava atzīme</span>
                                  <button
                                    type="button"
                                    class="btn btn-ghost btn-small"
                                    style=${myRsvp?.status === "yes" ? { background: "#dcfce7", borderColor: "#4ade80", color: "#14532d" } : {}}
                                    onClick=${() => setRsvp("yes")}
                                  >
                                    Piedalīšos
                                  </button>
                                  <button
                                    type="button"
                                    class="btn btn-ghost btn-small"
                                    style=${myRsvp?.status === "maybe" ? { background: "#fef3c7", borderColor: "#fbbf24", color: "#78350f" } : {}}
                                    onClick=${() => setRsvp("maybe")}
                                  >
                                    Varbūt
                                  </button>
                                  <button
                                    type="button"
                                    class="btn btn-ghost btn-small"
                                    style=${myRsvp?.status === "no" ? { background: "#fee2e2", borderColor: "#f87171", color: "#7f1d1d" } : {}}
                                    onClick=${() => setRsvp("no")}
                                  >
                                    Nepiedalīšos
                                  </button>
                                </div>
                                <p class="sal-cel-sub">
                                  Kopā atbildes: ${rsvp.yes + rsvp.maybe + rsvp.no} (jā ${rsvp.yes} · varbūt ${rsvp.maybe} · nē ${rsvp.no})
                                </p>
                              </div>
                              <div class="sal-cel-foot">
                                <button type="button" class="btn btn-primary btn-small" onClick=${() => void saveCelebrationCard(true)}>Publicēt</button>
                                <button type="button" class="btn btn-ghost btn-small" onClick=${() => void saveCelebrationCard(false)}>Saglabāt melnrakstā</button>
                              </div>
                            </div>
                          `
                          : html`<div class="sal-banner">Šim veidam kartiņas saturs būs cits (tiks pievienots nākamajos soļos).</div>`}

                      <div class="row" style=${{ gap: ".45rem", flexWrap: "wrap" }}>
                        ${useFullEventCard
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
    /** Prombūtnes kalendāra tiltam: lokālie pasākumi (tostarp pirms paneļa mount). */
    loadLocalEvents,
    LS_EVENTS_KEY,
  };
})();
