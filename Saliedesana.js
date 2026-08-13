(function () {
  const LS_EVENTS_KEY = "pdd_saliedesana_pasakumi_v2";
  const LS_AKTUALITATES_KEY = "pdd_sodien_aktualitates_v1";
  const LS_SAL_INFO_KEY = "pdd_saliedesana_info_v1";
  const LS_IDEJU_CHAT_KEY = "pdd_ideju_chat_v1";
  const LS_IDEJU_CHAT_REACTIONS_KEY = "pdd_ideju_chat_reactions_v1";
  const REMOTE_SAL_INFO_TABLE = "pdd_saliedesana_info";
  const REMOTE_IDEJU_CHAT_TABLE = "pdd_ideju_chat";
  const REMOTE_IDEJU_CHAT_REACTIONS_TABLE = "pdd_ideju_chat_reactions";
  /** Čats atslēgts — atbrīvo vietu Supabase FREE limitā. */
  const IDEJU_CHAT_DISABLED = true;
  const IDEJU_CHAT_EMOJI = ["👍", "❤️", "😂", "🎉", "👀"];
  /** Supabase: public."Saliedesana" — kolonnas kā Table Editor (arī saīsinātie nosaukumi). */
  const REMOTE_TABLE = "Saliedesana";
  const SAL_META_MARKER = "\n\n---PDD-SYNC---\n";
  const SALIEDESANA_FILES_BUCKET = "pdd-saliedesana-files";
  const SAL_INFO_ATTACHMENT_WARNING =
    "Šobrīd aplikācija atrodas uz ārējā servera, tādēļ esi uzmanīgs ar darba informācijas publicēšanu! Spied OK, ja vēlies turpināt pielikuma pievienošanu.";
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
    if (document.getElementById("pdd-saliedesana-style-v5")) return;
    document.getElementById("pdd-saliedesana-style-v4")?.remove();
    document.getElementById("pdd-saliedesana-style-v3")?.remove();
    const s = document.createElement("style");
    s.id = "pdd-saliedesana-style-v5";
    s.textContent = `
      .sal-wrap { display:grid; gap:1rem; }
      .sal-head { border:1px solid #f59e0b; background:linear-gradient(180deg,#fff7ed,#ffedd5); border-radius:14px; padding:.9rem 1rem; }
      .sal-head h2 { margin:0; font-size:1.08rem; color:#9a3412; }
      .sal-head p { margin:.3rem 0 0; font-size:.82rem; color:#b45309; }
      .sal-info-panel {
        border:1px solid #fb923c; border-radius:14px; padding:.85rem .9rem;
        background:linear-gradient(180deg,#fffbeb,#fff7ed); display:grid; gap:.65rem;
      }
      .sal-info-panel h3 { margin:0; font-size:.98rem; color:#9a3412; }
      .sal-info-intro { margin:0; font-size:.8rem; color:#b45309; line-height:1.4; }
      .sal-info-list { display:grid; gap:.45rem; }
      .sal-info-item {
        border:1px solid #fed7aa; border-radius:12px; background:#fff; padding:.55rem .65rem; display:grid; gap:.25rem;
      }
      .sal-info-item strong { color:#7c2d12; font-size:.9rem; }
      .sal-info-item .sal-info-body {
        font-size:.84rem; color:#0f172a; word-break:break-word; overflow-wrap:anywhere; line-height:1.4;
      }
      .sal-info-item .sal-info-body img {
        display:block; max-width:100%; height:auto; border-radius:8px; margin:.35rem 0;
      }
      .sal-info-item .sal-info-body a { color:#9a3412; }
      .sal-info-meta { font-size:.72rem; color:#9a3412; }
      .sal-info-actions { display:flex; gap:.35rem; justify-content:flex-end; flex-wrap:wrap; }
      .sal-info-form { display:grid; gap:.4rem; border:1px dashed #fb923c; border-radius:12px; padding:.55rem; background:rgba(255,255,255,.7); }
      .sal-info-form > input[type="text"] {
        width:100%; box-sizing:border-box; border:1px solid #fdba74; border-radius:8px; padding:.4rem .5rem; font:inherit; font-size:.86rem;
      }
      .sal-info-form-actions { display:flex; gap:.35rem; flex-wrap:wrap; }
      .sal-info-rich { border:1px solid #fdba74; border-radius:10px; background:#fff; overflow:hidden; }
      .sal-info-toolbar { display:flex; flex-wrap:wrap; gap:.3rem; padding:.4rem; border-bottom:1px solid #fed7aa; background:#fff7ed; align-items:center; }
      .sal-info-toolbar .btn, .sal-info-toolbar select, .sal-info-toolbar label { font-size:.72rem; }
      .sal-info-editor {
        min-height:110px; padding:.55rem; outline:none; font-size:.9rem; line-height:1.4;
        box-sizing:border-box; max-width:100%; overflow-wrap:anywhere; word-break:break-word; overflow-x:auto;
      }
      .sal-info-editor:empty:before {
        content:attr(data-placeholder); color:#9a3412; opacity:.55; pointer-events:none;
      }
      .sal-info-selected-img { outline:3px solid #f97316; outline-offset:2px; }
      .sal-info-selected-attachment { outline:2px solid #ea580c; outline-offset:2px; background:#ffedd5; }
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

  /** Kalendāra / pasākumu vēsture: 2 mēneši no šodienas. */
  const HISTORY_RETENTION_MONTHS = 2;
  let salEventsRemotePurgeStarted = false;

  function historyRetentionCutoffDate() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setMonth(d.getMonth() - HISTORY_RETENTION_MONTHS);
    return d;
  }

  function historyRetentionCutoffYmd() {
    return toYmd(historyRetentionCutoffDate());
  }

  function calendarMinMonthDate() {
    const c = historyRetentionCutoffDate();
    return new Date(c.getFullYear(), c.getMonth(), 1);
  }

  function clampCalendarMonth(monthDate) {
    const minM = calendarMinMonthDate();
    const d = monthDate instanceof Date ? monthDate : new Date(monthDate);
    if (Number.isNaN(d.getTime())) return minM;
    const cur = new Date(d.getFullYear(), d.getMonth(), 1);
    return cur < minM ? minM : cur;
  }

  function filterEventsByRetention(events) {
    const cutoff = historyRetentionCutoffYmd();
    return (Array.isArray(events) ? events : []).filter((x) => {
      const date = String(x?.date || "").slice(0, 10);
      return date && date >= cutoff;
    });
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

  function actorDisplayName() {
    try {
      const name = String(
        globalThis.__PDD_ACTOR_DISPLAY_NAME__ ||
          globalThis.__PDD_ACTOR_NAME__ ||
          globalThis.__PDD_SESSION_NAME__ ||
          (typeof sessionStorage !== "undefined" && sessionStorage.getItem("pdd_local_display_name")) ||
          "",
      ).trim();
      if (name) return name;
    } catch {
      /* ignore */
    }
    const em = String(globalThis.__PDD_ACTOR_EMAIL__ ?? sessionStorage.getItem("pdd_local_email") ?? "").trim();
    return em || "Nezināms lietotājs";
  }

  function salUid() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function formatSalInfoWhen(iso) {
    const d = new Date(iso || "");
    if (Number.isNaN(d.getTime())) return "—";
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function loadLocalSalInfo() {
    try {
      const raw = localStorage.getItem(LS_SAL_INFO_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function saveLocalSalInfo(rows) {
    try {
      localStorage.setItem(LS_SAL_INFO_KEY, JSON.stringify(Array.isArray(rows) ? rows : []));
    } catch {
      /* ignore */
    }
    try {
      window.dispatchEvent(new CustomEvent("pdd:saliedesana-news-changed"));
    } catch {
      /* ignore */
    }
  }

  function salInfoHtmlHasMedia(html) {
    const s = String(html || "");
    return /<img\b/i.test(s) || /data-sal-info-attachment/i.test(s) || /pdd-saliedesana-files/i.test(s);
  }

  function salInfoBodyIsMeaningful(html) {
    if (salInfoHtmlHasMedia(html)) return true;
    const plain = String(html || "")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return Boolean(plain);
  }

  function normalizeSalInfoRow(row) {
    if (!row || typeof row !== "object") return null;
    const id = String(row.id || "").trim();
    const body = String(row.body || "").trim();
    if (!id || !salInfoBodyIsMeaningful(body)) return null;
    return {
      id,
      title: String(row.title || "").trim(),
      body,
      actor_key: String(row.actor_key || row.actorKey || "").trim(),
      actor_name: String(row.actor_name || row.actorName || "").trim(),
      created_at: String(row.created_at || row.createdAt || new Date().toISOString()),
      updated_at: String(row.updated_at || row.updatedAt || row.created_at || new Date().toISOString()),
    };
  }

  async function fetchSalInfoRemote(supabase) {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from(REMOTE_SAL_INFO_TABLE)
      .select("id, title, body, actor_key, actor_name, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(80);
    if (error) {
      console.warn("[Saliedēšana.info]", error.message || error);
      return null;
    }
    return (Array.isArray(data) ? data : []).map(normalizeSalInfoRow).filter(Boolean);
  }

  async function upsertSalInfoRemote(supabase, row) {
    if (!supabase || !row) return { ok: false };
    const payload = {
      id: row.id,
      title: row.title || "",
      body: row.body,
      actor_key: row.actor_key || "",
      actor_name: row.actor_name || "",
      created_at: row.created_at,
      updated_at: row.updated_at || new Date().toISOString(),
    };
    const { error } = await supabase.from(REMOTE_SAL_INFO_TABLE).upsert(payload, { onConflict: "id" });
    if (error) {
      console.warn("[Saliedēšana.info.save]", error.message || error);
      return { ok: false, error };
    }
    return { ok: true };
  }

  async function deleteSalInfoRemote(supabase, id) {
    if (!supabase || !id) return { ok: false };
    const { error } = await supabase.from(REMOTE_SAL_INFO_TABLE).delete().eq("id", id);
    if (error) {
      console.warn("[Saliedēšana.info.delete]", error.message || error);
      return { ok: false, error };
    }
    return { ok: true };
  }

  function loadLocalIdejuChat() {
    try {
      const raw = localStorage.getItem(LS_IDEJU_CHAT_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function saveLocalIdejuChat(rows, options = {}) {
    try {
      localStorage.setItem(LS_IDEJU_CHAT_KEY, JSON.stringify(Array.isArray(rows) ? rows : []));
    } catch {
      /* ignore */
    }
    if (options.silent) return;
    try {
      window.dispatchEvent(new CustomEvent("pdd:ideju-chat-changed"));
    } catch {
      /* ignore */
    }
  }

  function normalizeIdejuChatReaction(row) {
    if (!row || typeof row !== "object") return null;
    const message_id = String(row.message_id || row.messageId || "").trim();
    const actor_key = String(row.actor_key || row.actorKey || "").trim();
    const emoji = String(row.emoji || "").trim();
    if (!message_id || !actor_key || !IDEJU_CHAT_EMOJI.includes(emoji)) return null;
    return {
      message_id,
      actor_key,
      actor_name: String(row.actor_name || row.actorName || "").trim(),
      emoji,
      updated_at: String(row.updated_at || row.updatedAt || row.created_at || new Date().toISOString()),
    };
  }

  function loadLocalIdejuChatReactions() {
    try {
      const raw = localStorage.getItem(LS_IDEJU_CHAT_REACTIONS_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return (Array.isArray(arr) ? arr : []).map(normalizeIdejuChatReaction).filter(Boolean);
    } catch {
      return [];
    }
  }

  function saveLocalIdejuChatReactions(rows, options = {}) {
    try {
      localStorage.setItem(LS_IDEJU_CHAT_REACTIONS_KEY, JSON.stringify(Array.isArray(rows) ? rows : []));
    } catch {
      /* ignore */
    }
    if (options.silent) return;
    try {
      window.dispatchEvent(new CustomEvent("pdd:ideju-chat-reactions-changed"));
    } catch {
      /* ignore */
    }
  }

  function mergeIdejuChatReactions(localRows, remoteRows) {
    const map = new Map();
    for (const r of [...(localRows || []), ...(remoteRows || [])]) {
      const n = normalizeIdejuChatReaction(r);
      if (!n) continue;
      const key = `${n.message_id}::${n.actor_key}`;
      const prev = map.get(key);
      if (!prev || String(n.updated_at) >= String(prev.updated_at)) map.set(key, n);
    }
    return [...map.values()];
  }

  function reactionsForMessage(allReactions, messageId) {
    const id = String(messageId || "").trim();
    return (allReactions || []).filter((r) => r.message_id === id);
  }

  function countReactionsByEmoji(msgReactions) {
    const counts = {};
    for (const e of IDEJU_CHAT_EMOJI) counts[e] = 0;
    for (const r of msgReactions || []) {
      if (counts[r.emoji] != null) counts[r.emoji] += 1;
    }
    return counts;
  }

  function myReactionEmoji(msgReactions, me) {
    const mine = (msgReactions || []).find((r) => r.actor_key === me);
    return mine?.emoji || "";
  }

  function renderIdejuChatReactionsHtml(messageId, allReactions) {
    const me = actorKey();
    const msgRx = reactionsForMessage(allReactions, messageId);
    const counts = countReactionsByEmoji(msgRx);
    const mine = myReactionEmoji(msgRx, me);
    const buttons = IDEJU_CHAT_EMOJI.map((emoji) => {
      const n = counts[emoji] || 0;
      const active = mine === emoji ? " is-active" : "";
      const countHtml = n ? `<span class="pdd-ideju-react-count">${n}</span>` : "";
      return `<button type="button" class="pdd-ideju-react-btn${active}" data-ideju-react="${escapeHtmlLite(emoji)}" data-msg-id="${escapeHtmlLite(messageId)}" title="Reakcija ${escapeHtmlLite(emoji)}" aria-pressed="${mine === emoji ? "true" : "false"}">${emoji}${countHtml}</button>`;
    }).join("");
    return `<div class="pdd-ideju-reacts" data-ideju-reacts="${escapeHtmlLite(messageId)}">${buttons}</div>`;
  }

  async function fetchIdejuChatReactionsRemote(supabase, messageIds) {
    if (!supabase) return null;
    const ids = (Array.isArray(messageIds) ? messageIds : []).map((x) => String(x || "").trim()).filter(Boolean);
    let q = supabase
      .from(REMOTE_IDEJU_CHAT_REACTIONS_TABLE)
      .select("message_id, actor_key, actor_name, emoji, updated_at, created_at")
      .order("updated_at", { ascending: true })
      .limit(2000);
    if (ids.length && ids.length <= 200) q = q.in("message_id", ids);
    const { data, error } = await q;
    if (error) {
      console.warn("[Čats.reactions]", error.message || error);
      return null;
    }
    return (Array.isArray(data) ? data : []).map(normalizeIdejuChatReaction).filter(Boolean);
  }

  async function upsertIdejuChatReactionRemote(supabase, row) {
    if (!supabase || !row) return { ok: false };
    const { error } = await supabase.from(REMOTE_IDEJU_CHAT_REACTIONS_TABLE).upsert(
      {
        message_id: row.message_id,
        actor_key: row.actor_key,
        actor_name: row.actor_name || "",
        emoji: row.emoji,
        updated_at: row.updated_at || new Date().toISOString(),
      },
      { onConflict: "message_id,actor_key" },
    );
    if (error) {
      console.warn("[Čats.reactions.upsert]", error.message || error);
      return { ok: false, error };
    }
    return { ok: true };
  }

  async function deleteIdejuChatReactionRemote(supabase, messageId, actorKeyVal) {
    if (!supabase) return { ok: false };
    const { error } = await supabase
      .from(REMOTE_IDEJU_CHAT_REACTIONS_TABLE)
      .delete()
      .eq("message_id", String(messageId || ""))
      .eq("actor_key", String(actorKeyVal || ""));
    if (error) {
      console.warn("[Čats.reactions.delete]", error.message || error);
      return { ok: false, error };
    }
    return { ok: true };
  }

  async function setIdejuChatReaction(messageId, emoji) {
    const id = String(messageId || "").trim();
    const want = String(emoji || "").trim();
    if (!id || !IDEJU_CHAT_EMOJI.includes(want)) return loadLocalIdejuChatReactions();
    const me = actorKey();
    const name = actorDisplayName();
    const now = new Date().toISOString();
    let rows = loadLocalIdejuChatReactions();
    const prev = rows.find((r) => r.message_id === id && r.actor_key === me);
    if (prev && prev.emoji === want) {
      rows = rows.filter((r) => !(r.message_id === id && r.actor_key === me));
      saveLocalIdejuChatReactions(rows);
      const sb = globalThis.__PDD_SUPABASE__ ?? null;
      if (sb) await deleteIdejuChatReactionRemote(sb, id, me);
      return rows;
    }
    const nextRow = {
      message_id: id,
      actor_key: me,
      actor_name: name,
      emoji: want,
      updated_at: now,
    };
    rows = [...rows.filter((r) => !(r.message_id === id && r.actor_key === me)), nextRow];
    saveLocalIdejuChatReactions(rows);
    const sb = globalThis.__PDD_SUPABASE__ ?? null;
    if (sb) await upsertIdejuChatReactionRemote(sb, nextRow);
    return rows;
  }

  const IDEJU_CHAT_SEEN_KEY = "pdd_ideju_chat_seen_v1";

  function idejuChatSeenActorKey() {
    return actorKey();
  }

  function latestIdejuChatStamp(rows) {
    const list = Array.isArray(rows) ? rows : loadLocalIdejuChat();
    let max = "";
    for (const r of list) {
      const s = String(r?.created_at || r?.id || "").trim();
      if (s && s > max) max = s;
    }
    return max;
  }

  function readIdejuChatSeenMap() {
    try {
      const raw = localStorage.getItem(IDEJU_CHAT_SEEN_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  function markIdejuChatSeen(rows) {
    const stamp = latestIdejuChatStamp(rows);
    if (!stamp) return;
    try {
      const map = readIdejuChatSeenMap();
      map[idejuChatSeenActorKey()] = stamp;
      localStorage.setItem(IDEJU_CHAT_SEEN_KEY, JSON.stringify(map));
    } catch {
      /* ignore */
    }
    try {
      window.dispatchEvent(new CustomEvent("pdd:ideju-chat-seen"));
    } catch {
      /* ignore */
    }
  }

  function idejuChatHasUnread(rows) {
    const list = Array.isArray(rows) ? rows : loadLocalIdejuChat();
    const latest = latestIdejuChatStamp(list);
    if (!latest) return false;
    const seen = String(readIdejuChatSeenMap()[idejuChatSeenActorKey()] || "").trim();
    return !seen || latest > seen;
  }

  function idejuChatBodyIsMeaningful(body) {
    const s = String(body || "").trim();
    if (!s) return false;
    if (/<img\b/i.test(s) || /data-ideju-attachment/i.test(s) || /pdd-saliedesana-files/i.test(s)) return true;
    const plain = s
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return Boolean(plain);
  }

  function buildIdejuChatBody(text, pendingHtml) {
    const t = String(text || "").trim();
    const pending = String(pendingHtml || "").trim();
    const textPart = t ? `<p>${escapeHtmlLite(t).replace(/\n/g, "<br>")}</p>` : "";
    return `${textPart}${pending}`.trim();
  }

  function idejuChatPreviewText(body) {
    const s = String(body || "");
    if (/<img\b/i.test(s)) return "🖼️ attēls";
    if (/data-ideju-attachment|pielikums:/i.test(s)) return "📎 pielikums";
    return s
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeIdejuChatRow(row) {
    if (!row || typeof row !== "object") return null;
    const id = String(row.id || "").trim();
    const body = String(row.body || "").trim();
    if (!id || !idejuChatBodyIsMeaningful(body)) return null;
    const source = String(row.source || "other").trim();
    return {
      id,
      body,
      actor_key: String(row.actor_key || row.actorKey || "").trim(),
      actor_name: String(row.actor_name || row.actorName || "").trim(),
      source: ["saliedesana", "aktualitates", "other"].includes(source) ? source : "other",
      created_at: String(row.created_at || row.createdAt || new Date().toISOString()),
    };
  }

  const IDEJU_CHAT_PAGE_SIZE = 40;
  const IDEJU_CHAT_SYNC_LIMIT = 200;

  function persistIdejuChatMerge(extraRows, options = {}) {
    const merged = mergeIdejuChatLists(loadLocalIdejuChat(), extraRows);
    saveLocalIdejuChat(merged, { silent: options.silent !== false });
    return merged;
  }

  async function fetchIdejuChatRemoteRest(options = {}) {
    const cfgUrl =
      String(globalThis.__PDD_SUPABASE__?.supabaseUrl || "").trim() ||
      "https://fdnkvecgqetmwilwolgt.supabase.co";
    const cfgKey =
      String(globalThis.__PDD_SUPABASE__?.supabaseKey || "").trim() ||
      (typeof localStorage !== "undefined" ? localStorage.getItem("pdd_supabase_anon_key") : "") ||
      "";
    // Publishable key no index.html konfigurācijas (ja pieejama caur loadConfig nav šeit).
    const apiKey =
      cfgKey ||
      String(document?.querySelector?.("meta[name='pdd-supabase-anon']")?.content || "").trim();
    // Fallback: izmantojam to pašu atslēgu, kas iebūvēta Pakalpojumu modulī / tipiski FILE_SUPABASE.
    const key =
      apiKey ||
      "sb_publishable_wPrwQc6F0QVlnAubnhamJw_RuxtvtGo";
    const base = String(cfgUrl || "https://fdnkvecgqetmwilwolgt.supabase.co").replace(/\/+$/, "");
    const limit = Math.min(500, Math.max(1, Number(options.limit) || IDEJU_CHAT_PAGE_SIZE));
    const params = new URLSearchParams();
    params.set("select", "id,body,actor_key,actor_name,source,created_at");
    params.set("order", "created_at.desc");
    params.set("limit", String(limit));
    const before = String(options.before || "").trim();
    if (before) params.set("created_at", `lt.${before}`);
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = setTimeout(() => {
      try {
        ctrl?.abort?.();
      } catch {
        /* ignore */
      }
    }, 10000);
    try {
      const resp = await fetch(`${base}/rest/v1/${REMOTE_IDEJU_CHAT_TABLE}?${params}`, {
        method: "GET",
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        signal: ctrl?.signal,
      });
      if (!resp.ok) {
        console.warn("[Čats.rest]", await resp.text());
        return null;
      }
      const data = await resp.json();
      const rows = (Array.isArray(data) ? data : []).map(normalizeIdejuChatRow).filter(Boolean);
      return rows.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    } catch (e) {
      console.warn("[Čats.rest]", e?.message || e);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchIdejuChatRemote(supabase, options = {}) {
    const limit = Math.min(500, Math.max(1, Number(options.limit) || IDEJU_CHAT_PAGE_SIZE));
    if (supabase) {
      try {
        let q = supabase
          .from(REMOTE_IDEJU_CHAT_TABLE)
          .select("id, body, actor_key, actor_name, source, created_at")
          .order("created_at", { ascending: false })
          .limit(limit);
        const before = String(options.before || "").trim();
        if (before) q = q.lt("created_at", before);
        const raced = await Promise.race([
          q,
          new Promise((resolve) =>
            setTimeout(() => resolve({ data: null, error: { message: "Čats noildza" } }), 8000),
          ),
        ]);
        const { data, error } = raced || {};
        if (!error && Array.isArray(data)) {
          const rows = data.map(normalizeIdejuChatRow).filter(Boolean);
          return rows.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
        }
        if (error) console.warn("[Čats]", error.message || error);
      } catch (e) {
        console.warn("[Čats]", e?.message || e);
      }
    }
    return fetchIdejuChatRemoteRest(options);
  }

  async function insertIdejuChatRemote(supabase, row) {
    if (!supabase || !row) return { ok: false };
    const { error } = await supabase.from(REMOTE_IDEJU_CHAT_TABLE).insert({
      id: row.id,
      body: row.body,
      actor_key: row.actor_key,
      actor_name: row.actor_name || "",
      source: row.source || "other",
      created_at: row.created_at,
    });
    if (error) {
      console.warn("[Čats.insert]", error.message || error);
      return { ok: false, error };
    }
    return { ok: true };
  }

  function mergeIdejuChatLists(localRows, remoteRows) {
    const map = new Map();
    for (const r of [...(localRows || []), ...(remoteRows || [])]) {
      const n = normalizeIdejuChatRow(r);
      if (!n) continue;
      const prev = map.get(n.id);
      if (!prev || String(n.created_at) >= String(prev.created_at)) map.set(n.id, n);
    }
    return [...map.values()].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  }

  function ensureIdejuChatModalStyles() {
    if (typeof document === "undefined") return;
    if (document.getElementById("pdd-ideju-chat-style-v9")) return;
    document.getElementById("pdd-ideju-chat-style-v8")?.remove();
    document.getElementById("pdd-ideju-chat-style-v7")?.remove();
    document.getElementById("pdd-ideju-chat-style-v6")?.remove();
    document.getElementById("pdd-ideju-chat-style-v5")?.remove();
    document.getElementById("pdd-ideju-chat-style-v4")?.remove();
    document.getElementById("pdd-ideju-chat-style-v3")?.remove();
    document.getElementById("pdd-ideju-chat-style-v2")?.remove();
    document.getElementById("pdd-ideju-chat-style")?.remove();
    const s = document.createElement("style");
    s.id = "pdd-ideju-chat-style-v9";
    s.textContent = `
      .pdd-ideju-modal-bg { position:fixed; inset:0; z-index:80; background:rgba(15,23,42,.45); display:flex; align-items:center; justify-content:center; padding:1rem; }
      .pdd-ideju-modal { width:min(560px,100%); max-height:90vh; display:flex; flex-direction:column; border-radius:16px; overflow:hidden; box-shadow:0 18px 50px rgba(15,23,42,.28); }
      .pdd-ideju-modal.theme-sal { border:2px solid #fb923c; background:linear-gradient(180deg,#fff,#fff7ed); }
      .pdd-ideju-modal.theme-akt { border:2px solid #0ea5e9; background:linear-gradient(180deg,#fff,#e0f2fe); }
      .pdd-ideju-modal-head { display:flex; align-items:center; justify-content:space-between; gap:.5rem; padding:.75rem .9rem; }
      .pdd-ideju-modal.theme-sal .pdd-ideju-modal-head { background:#ffedd5; color:#9a3412; border-bottom:1px solid #fdba74; }
      .pdd-ideju-modal.theme-akt .pdd-ideju-modal-head { background:#bae6fd; color:#075985; border-bottom:1px solid #7dd3fc; }
      .pdd-ideju-modal-head h3 { margin:0; font-size:1rem; }
      .pdd-ideju-modal-head p { margin:.15rem 0 0; font-size:.74rem; opacity:.9; }
      .pdd-ideju-close { border:0; background:transparent; font-size:1.2rem; cursor:pointer; line-height:1; color:inherit; }
      .pdd-ideju-list {
        flex:1; overflow:auto; padding:.7rem .8rem; display:flex; flex-direction:column; gap:.45rem;
        min-height:240px; max-height:min(62vh,560px); background:rgba(255,255,255,.65);
        overscroll-behavior:contain;
      }
      .pdd-ideju-history-btn {
        align-self:center; border:1px dashed rgba(100,116,139,.45); background:rgba(255,255,255,.9);
        color:#334155; border-radius:999px; padding:.35rem .75rem; font:inherit; font-size:.74rem;
        font-weight:700; cursor:pointer; margin:.15rem 0 .35rem;
      }
      .pdd-ideju-history-btn:hover { border-color:#0ea5e9; color:#0369a1; }
      .pdd-ideju-history-btn:disabled { opacity:.55; cursor:wait; }
      .pdd-ideju-history-end {
        align-self:center; margin:.1rem 0 .35rem; font-size:.7rem; color:#94a3b8;
      }
      .pdd-ideju-msg { border-radius:12px; padding:.45rem .55rem; max-width:92%; }
      .pdd-ideju-modal.theme-sal .pdd-ideju-msg { background:#fff; border:1px solid #fed7aa; }
      .pdd-ideju-modal.theme-akt .pdd-ideju-msg { background:#fff; border:1px solid #bae6fd; }
      .pdd-ideju-msg.mine { align-self:flex-end; }
      .pdd-ideju-modal.theme-sal .pdd-ideju-msg.mine { background:#ffedd5; border-color:#fb923c; }
      .pdd-ideju-modal.theme-akt .pdd-ideju-msg.mine { background:#e0f2fe; border-color:#0ea5e9; }
      .pdd-ideju-msg-meta { font-size:.68rem; color:#64748b; margin-bottom:.15rem; }
      .pdd-ideju-msg-body { font-size:.86rem; white-space:pre-wrap; word-break:break-word; color:#0f172a; line-height:1.35; }
      .pdd-ideju-msg-body p { margin:0 0 .35rem; white-space:pre-wrap; }
      .pdd-ideju-msg-body img {
        display:block; max-width:100%; width:min(100%,320px); height:auto;
        border-radius:8px; margin:.3rem 0;
      }
      .pdd-ideju-msg-body a { color:inherit; text-decoration:underline; word-break:break-all; }
      .pdd-ideju-reacts {
        display:flex; flex-wrap:wrap; gap:.2rem; margin-top:.35rem; align-items:center;
      }
      .pdd-ideju-react-btn {
        border:1px solid rgba(100,116,139,.28); background:rgba(255,255,255,.85);
        border-radius:999px; padding:.12rem .35rem; font-size:.78rem; line-height:1.2;
        cursor:pointer; display:inline-flex; align-items:center; gap:.15rem; color:#334155;
      }
      .pdd-ideju-react-btn:hover { border-color:#0ea5e9; background:#f0f9ff; }
      .pdd-ideju-react-btn.is-active {
        border-color:#0284c7; background:#e0f2fe; box-shadow:0 0 0 1px rgba(14,165,233,.25);
      }
      .pdd-ideju-modal.theme-sal .pdd-ideju-react-btn.is-active {
        border-color:#ea580c; background:#ffedd5; box-shadow:0 0 0 1px rgba(249,115,22,.25);
      }
      .pdd-ideju-react-count { font-size:.68rem; font-weight:700; color:#475569; }
      .pdd-ideju-form-wrap { border-top:1px solid rgba(0,0,0,.08); background:rgba(255,255,255,.8); }
      .pdd-ideju-form { display:flex; gap:.4rem; padding:.65rem .75rem .45rem; }
      .pdd-ideju-form textarea { flex:1; min-height:44px; max-height:90px; resize:vertical; border-radius:10px; padding:.4rem .5rem; font:inherit; font-size:.86rem; }
      .pdd-ideju-modal.theme-sal .pdd-ideju-form textarea { border:1px solid #fdba74; }
      .pdd-ideju-modal.theme-akt .pdd-ideju-form textarea { border:1px solid #7dd3fc; }
      .pdd-ideju-form-tools {
        display:flex; flex-wrap:wrap; gap:.35rem; align-items:center;
        padding:0 .75rem .45rem; font-size:.72rem;
      }
      .pdd-ideju-form-tools label { cursor:pointer; margin:0; }
      .pdd-ideju-pending {
        display:none; flex-direction:column; gap:.4rem; padding:0 .75rem .5rem; font-size:.72rem; color:#64748b;
      }
      .pdd-ideju-pending.has-items { display:flex; }
      .pdd-ideju-pending-top {
        display:flex; align-items:center; justify-content:space-between; gap:.4rem;
      }
      .pdd-ideju-pending-media {
        display:flex; flex-direction:column; gap:.35rem; max-height:180px; overflow:auto;
      }
      .pdd-ideju-pending-media img {
        display:block; max-width:100%; width:min(100%,240px); height:auto;
        border-radius:8px; border:1px solid rgba(100,116,139,.35); background:#fff;
      }
      .pdd-ideju-pending-media p { margin:0; font-size:.74rem; }
      .pdd-ideju-pending-item {
        border:1px dashed rgba(100,116,139,.45); border-radius:8px; padding:.2rem .4rem;
        background:rgba(255,255,255,.85);
      }
      .pdd-ideju-form button[type="submit"] { align-self:flex-end; }
      .pdd-ideju-empty { margin:auto; font-size:.82rem; color:#64748b; text-align:center; padding:1rem; }
      .pdd-ideju-status { font-size:.72rem; padding:0 .8rem .35rem; color:#64748b; }
      .pdd-ideju-preview {
        margin-top:.55rem; border-radius:12px; padding:.5rem .55rem; display:grid; gap:.35rem;
        max-height:148px; overflow:auto; box-sizing:border-box;
      }
      .pdd-ideju-preview.theme-akt {
        border:1px solid rgba(14,116,144,.45); background:rgba(255,255,255,.78);
        max-height:320px;
      }
      .pdd-ideju-preview.theme-sal {
        border:1px solid #fdba74; background:rgba(255,255,255,.88);
      }
      .pdd-ideju-preview-head {
        display:flex; align-items:center; justify-content:space-between; gap:.4rem;
        font-size:.72rem; font-weight:700;
      }
      .pdd-ideju-preview.theme-akt .pdd-ideju-preview-head { color:#075985; }
      .pdd-ideju-preview.theme-sal .pdd-ideju-preview-head { color:#9a3412; }
      .pdd-ideju-preview-item {
        border-radius:8px; padding:.3rem .4rem; font-size:.76rem; line-height:1.3;
      }
      .pdd-ideju-preview.theme-akt .pdd-ideju-preview-item {
        border:1px solid #bae6fd; background:#f0f9ff; color:#0f172a;
      }
      .pdd-ideju-preview.theme-sal .pdd-ideju-preview-item {
        border:1px solid #fed7aa; background:#fff7ed; color:#0f172a;
      }
      .pdd-ideju-preview-meta { font-size:.66rem; color:#64748b; margin-bottom:.08rem; }
      .pdd-ideju-preview-body {
        white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%;
      }
      .pdd-ideju-preview.theme-akt .pdd-ideju-preview-body {
        white-space:normal; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;
      }
      .pdd-ideju-preview-empty { margin:0; font-size:.74rem; color:#64748b; }
      .pdd-ideju-preview-open {
        border:0; background:transparent; cursor:pointer; padding:0; font:inherit;
        font-size:.72rem; font-weight:700; text-align:left; color:inherit; text-decoration:underline;
      }
      .pdd-ideju-float {
        position:fixed; right:1rem; bottom:1rem; z-index:65;
        display:flex; flex-direction:column; align-items:flex-end; gap:.5rem;
        pointer-events:none;
      }
      .pdd-ideju-float > * { pointer-events:auto; }
      .pdd-ideju-float-panel {
        width:min(340px,calc(100vw - 2rem)); max-height:min(420px,58vh);
        display:none; flex-direction:column; border-radius:16px; overflow:hidden;
        box-shadow:0 14px 44px rgba(15,23,42,.24), 0 0 0 1px rgba(14,116,144,.18);
        border:1px solid rgba(14,116,144,.42);
        background:linear-gradient(180deg, rgba(56,189,248,0.18), rgba(14,116,144,0.1));
        animation:pddIdejuFloatIn .18s ease;
        padding:.5rem;
        box-sizing:border-box;
      }
      @keyframes pddIdejuFloatIn {
        from { opacity:0; transform:translateY(8px) scale(.98); }
        to { opacity:1; transform:translateY(0) scale(1); }
      }
      .pdd-ideju-float.is-open .pdd-ideju-float-panel { display:flex; }
      .pdd-ideju-float-cta {
        width:100%; box-sizing:border-box; border:0; cursor:pointer;
        font-weight:800; font-size:.78rem; line-height:1.25; text-align:center;
        padding:.55rem .6rem; border-radius:999px; color:#fff;
        background:linear-gradient(135deg,#0284c7,#0ea5e9 55%,#38bdf8);
        box-shadow:0 6px 16px rgba(14,165,233,.32), 0 0 0 2px rgba(56,189,248,.28);
        margin:0 0 .45rem;
      }
      .pdd-ideju-float-head {
        display:none;
      }
      .pdd-ideju-float-preview-host {
        flex:1; overflow:auto; min-height:0; border-radius:12px;
        background:rgba(255,255,255,.88); border:1px solid rgba(14,116,144,.35);
      }
      .pdd-ideju-float-preview-host .pdd-ideju-preview {
        margin:0; border:0; border-radius:0; max-height:none;
        background:transparent; padding:.45rem .55rem .55rem;
      }
      .pdd-ideju-float-tools {
        display:flex; justify-content:flex-end; gap:.25rem; margin-top:.35rem;
      }
      .pdd-ideju-float-head-btn {
        border:0; background:rgba(255,255,255,.75); cursor:pointer; font:inherit;
        color:#075985; font-size:.85rem; line-height:1; padding:.2rem .4rem; border-radius:8px;
      }
      .pdd-ideju-float-head-btn:hover { background:#fff; }
      .pdd-ideju-float-fab {
        width:52px; height:52px; border-radius:999px; border:0; cursor:pointer;
        font-size:1.35rem; line-height:1;
        background:linear-gradient(135deg,#0284c7,#0ea5e9 55%,#38bdf8);
        color:#fff; box-shadow:0 8px 24px rgba(14,165,233,.38), 0 0 0 2px rgba(56,189,248,.22);
        position:relative; transition:transform .15s ease;
      }
      .pdd-ideju-float-fab:hover { transform:scale(1.05); }
      .pdd-ideju-float-fab:focus-visible { outline:2px solid #0ea5e9; outline-offset:2px; }
      .pdd-ideju-float-badge {
        position:absolute; top:-2px; right:-2px; min-width:18px; height:18px; padding:0 5px;
        border-radius:999px; background:#ef4444; color:#fff; font-size:.62rem; font-weight:800;
        line-height:18px; text-align:center; border:2px solid #fff; box-sizing:border-box;
      }
      .pdd-ideju-float-badge[hidden] { display:none; }
      @media (max-width:720px) {
        .pdd-ideju-float { right:.65rem; bottom:.65rem; }
        .pdd-ideju-float-panel { width:min(320px,calc(100vw - 1.3rem)); max-height:min(360px,52vh); }
        .pdd-ideju-float-fab { width:48px; height:48px; font-size:1.2rem; }
      }
    `;
    document.head.appendChild(s);
  }

  const idejuPreviewTimers = new WeakMap();

  async function loadIdejuChatRowsForPreview() {
    const local = loadLocalIdejuChat();
    const sb = globalThis.__PDD_SUPABASE__ ?? null;
    if (!sb) return local;
    try {
      const remote = await fetchIdejuChatRemote(sb, { limit: IDEJU_CHAT_SYNC_LIMIT });
      if (!remote) return local;
      // Nekad nepārrakstām lokālo vēsturi ar «tukšu» vai īsu lapu — tikai merge.
      return persistIdejuChatMerge(remote, { silent: true });
    } catch (e) {
      console.warn("[Čats.preview]", e?.message || e);
      return local;
    }
  }

  function renderIdejuChatPreviewHtml(rows, theme, previewOpts = {}) {
    const list = Array.isArray(rows) ? rows : [];
    const take = Number(previewOpts.take) > 0 ? Number(previewOpts.take) : theme === "akt" ? 8 : 3;
    const last = list.slice(-take).reverse();
    const showHead = previewOpts.showHead !== false;
    const head = showHead ? `<div class="pdd-ideju-preview-head"><span>Pēdējās čata ziņas</span></div>` : "";
    if (!last.length) {
      return `${head}<p class="pdd-ideju-preview-empty">Vēl nav ziņu — nospied 💡, lai rakstītu.</p>`;
    }
    const items = last
      .map((m) => {
        const who = escapeHtmlLite(m.actor_name || m.actor_key || "Lietotājs");
        const when = escapeHtmlLite(formatSalInfoWhen(m.created_at));
        const body = escapeHtmlLite(idejuChatPreviewText(m.body));
        return `<div class="pdd-ideju-preview-item"><div class="pdd-ideju-preview-meta">${who} · ${when}</div><div class="pdd-ideju-preview-body">${body}</div></div>`;
      })
      .join("");
    return `${head}${items}<button type="button" class="pdd-ideju-preview-open" data-ideju-preview-open>Atvērt visu čatu →</button>`;
  }

  function mountIdejuChatPreview(hostEl, options = {}) {
    if (IDEJU_CHAT_DISABLED) {
      try {
        if (hostEl) hostEl.innerHTML = "";
      } catch {
        /* ignore */
      }
      return () => {};
    }
    if (!hostEl || typeof document === "undefined") return () => {};
    ensureIdejuChatModalStyles();
    const theme = options.theme === "sal" ? "sal" : "akt";
    const source = options.source === "saliedesana" ? "saliedesana" : "aktualitates";
    const previewOpts = {
      take: options.take,
      showHead: options.showHead,
    };
    hostEl.className = `pdd-ideju-preview theme-${theme}`;
    hostEl.setAttribute("aria-label", "Čata priekšskatījums");

    let cancelled = false;
    async function refresh() {
      if (cancelled || !hostEl.isConnected) return;
      const rows = await loadIdejuChatRowsForPreview();
      if (cancelled || !hostEl.isConnected) return;
      hostEl.innerHTML = renderIdejuChatPreviewHtml(rows, theme, previewOpts);
      if (typeof options.onRows === "function") {
        try {
          options.onRows(rows);
        } catch {
          /* ignore */
        }
      }
      const openBtn = hostEl.querySelector("[data-ideju-preview-open]");
      if (openBtn) {
        openBtn.onclick = () => openIdejuChatModal({ source, theme });
      }
      hostEl.onclick = (e) => {
        if (e.target.closest("[data-ideju-preview-open]")) return;
        if (e.target.closest(".pdd-ideju-preview-item") || e.target === hostEl) {
          openIdejuChatModal({ source, theme });
        }
      };
    }

    void refresh();
    const onCh = () => void refresh();
    window.addEventListener("pdd:ideju-chat-changed", onCh);
    window.addEventListener("pdd:ideju-chat-seen", onCh);
    const poll = setInterval(() => void refresh(), 8000);
    idejuPreviewTimers.set(hostEl, { poll, onCh });

    return function unmount() {
      cancelled = true;
      const t = idejuPreviewTimers.get(hostEl);
      if (t) {
        clearInterval(t.poll);
        window.removeEventListener("pdd:ideju-chat-changed", t.onCh);
        window.removeEventListener("pdd:ideju-chat-seen", t.onCh);
        idejuPreviewTimers.delete(hostEl);
      }
    };
  }

  const IDEJU_FLOAT_OPEN_KEY = "pdd_ideju_chat_float_open_v1";
  let idejuFloatPreviewUnmount = null;

  function readIdejuFloatOpenPref() {
    try {
      const v = localStorage.getItem(IDEJU_FLOAT_OPEN_KEY);
      if (v === null) return true;
      return v === "1";
    } catch {
      return true;
    }
  }

  function writeIdejuFloatOpenPref(open) {
    try {
      localStorage.setItem(IDEJU_FLOAT_OPEN_KEY, open ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  function updateIdejuFloatBadge(rootEl, rows, panelOpen) {
    const badge = rootEl?.querySelector?.("[data-ideju-float-badge]");
    if (!badge) return;
    const unread = idejuChatHasUnread(rows);
    const show = unread && !panelOpen;
    badge.hidden = !show;
    badge.textContent = show ? "!" : "";
    badge.setAttribute("aria-label", show ? "Jaunas čata ziņas" : "");
  }

  function setIdejuFloatOpen(rootEl, open, options = {}) {
    if (!rootEl) return;
    rootEl.classList.toggle("is-open", Boolean(open));
    const fab = rootEl.querySelector("[data-ideju-float-fab]");
    if (fab) fab.setAttribute("aria-expanded", open ? "true" : "false");
    if (options.persist !== false) writeIdejuFloatOpenPref(Boolean(open));
    if (options.rows) updateIdejuFloatBadge(rootEl, options.rows, Boolean(open));
  }

  function mountIdejuChatFloatWidget() {
    if (IDEJU_CHAT_DISABLED) {
      ensureIdejuChatFloatWidget();
      return () => {};
    }
    if (typeof document === "undefined") return () => {};
    if (document.getElementById("pdd-ideju-float-root")) return () => {};
    ensureIdejuChatModalStyles();

    const root = document.createElement("div");
    root.id = "pdd-ideju-float-root";
    root.className = "pdd-ideju-float";
    root.setAttribute("aria-label", "Čats");
    root.innerHTML = `
      <div class="pdd-ideju-float-panel" data-ideju-float-panel>
        <button type="button" class="pdd-ideju-float-cta" data-ideju-float-cta>
          💡 Čats — vēlos kaut ko uzrakstīt
        </button>
        <div class="pdd-ideju-float-preview-host" data-ideju-float-preview></div>
        <div class="pdd-ideju-float-tools">
          <button type="button" class="pdd-ideju-float-head-btn" data-ideju-float-collapse title="Sakļaut" aria-label="Sakļaut">Sakļaut −</button>
        </div>
      </div>
      <button type="button" class="pdd-ideju-float-fab" data-ideju-float-fab aria-label="Čats" aria-expanded="false" title="Čats">
        💡
        <span class="pdd-ideju-float-badge" data-ideju-float-badge hidden aria-hidden="true">!</span>
      </button>
    `;
    document.body.appendChild(root);

    const previewHost = root.querySelector("[data-ideju-float-preview]");
    const initialOpen = readIdejuFloatOpenPref();
    setIdejuFloatOpen(root, initialOpen, { persist: false });

    if (typeof idejuFloatPreviewUnmount === "function") {
      try {
        idejuFloatPreviewUnmount();
      } catch {
        /* ignore */
      }
    }
    idejuFloatPreviewUnmount = mountIdejuChatPreview(previewHost, {
      theme: "akt",
      source: "aktualitates",
      take: 5,
      showHead: true,
      onRows: (rows) => {
        updateIdejuFloatBadge(root, rows, root.classList.contains("is-open"));
      },
    });

    const openFull = () => openIdejuChatModal({ source: "aktualitates", theme: "akt" });
    root.querySelector("[data-ideju-float-cta]")?.addEventListener("click", openFull);
    root.querySelector("[data-ideju-float-fab]")?.addEventListener("click", () => {
      const open = !root.classList.contains("is-open");
      setIdejuFloatOpen(root, open);
      if (open) {
        void loadIdejuChatRowsForPreview().then((rows) => updateIdejuFloatBadge(root, rows, true));
      }
    });
    root.querySelector("[data-ideju-float-collapse]")?.addEventListener("click", () => {
      setIdejuFloatOpen(root, false);
      void loadIdejuChatRowsForPreview().then((rows) => updateIdejuFloatBadge(root, rows, false));
    });

    return function unmountFloat() {
      if (typeof idejuFloatPreviewUnmount === "function") {
        try {
          idejuFloatPreviewUnmount();
        } catch {
          /* ignore */
        }
        idejuFloatPreviewUnmount = null;
      }
      root.remove();
    };
  }

  function canMountIdejuChatFloat() {
    return false;
  }

  function clearIdejuChatLocalStorage() {
    try {
      localStorage.removeItem(LS_IDEJU_CHAT_KEY);
      localStorage.removeItem(LS_IDEJU_CHAT_REACTIONS_KEY);
      localStorage.removeItem("pdd_ideju_chat_seen_v1");
      localStorage.removeItem("pdd_ideju_chat_float_open_v1");
    } catch {
      /* ignore */
    }
  }

  let idejuChatRemotePurgeStarted = false;

  async function purgeIdejuChatRemoteOnce() {
    if (!IDEJU_CHAT_DISABLED || idejuChatRemotePurgeStarted) return;
    idejuChatRemotePurgeStarted = true;
    const sb = globalThis.__PDD_SUPABASE__ ?? null;
    if (!sb) return;
    try {
      await Promise.race([
        (async () => {
          try {
            await sb.from(REMOTE_IDEJU_CHAT_REACTIONS_TABLE).delete().gte("created_at", "1970-01-01");
          } catch {
            /* ignore */
          }
          try {
            await sb.from(REMOTE_IDEJU_CHAT_TABLE).delete().gte("created_at", "1970-01-01");
          } catch {
            /* ignore */
          }
        })(),
        new Promise((r) => setTimeout(r, 8000)),
      ]);
    } catch (e) {
      console.warn("[Čats.purge]", e?.message || e);
    }
  }

  function ensureIdejuChatFloatWidget() {
    if (typeof document === "undefined") return;
    try {
      document.getElementById("pdd-ideju-float-root")?.remove();
      document.getElementById("pdd-ideju-chat-modal-root")?.remove();
      clearIdejuChatLocalStorage();
    } catch {
      /* ignore */
    }
    void purgeIdejuChatRemoteOnce();
  }

  if (typeof document !== "undefined") {
    const bootFloat = () => {
      try {
        ensureIdejuChatFloatWidget();
      } catch (e) {
        console.warn("[Čats.float.boot]", e?.message || e);
      }
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", bootFloat, { once: true });
    } else {
      setTimeout(bootFloat, 0);
    }
    window.addEventListener("storage", bootFloat);
    setTimeout(bootFloat, 500);
    setTimeout(bootFloat, 4000);
  }

  let idejuChatPollTimer = null;
  let idejuChatChannel = null;

  function closeIdejuChatModal() {
    if (idejuChatPollTimer) {
      clearInterval(idejuChatPollTimer);
      idejuChatPollTimer = null;
    }
    const sb = globalThis.__PDD_SUPABASE__ ?? null;
    if (sb && idejuChatChannel) {
      try {
        sb.removeChannel(idejuChatChannel);
      } catch {
        /* ignore */
      }
      idejuChatChannel = null;
    }
    document.getElementById("pdd-ideju-chat-modal-root")?.remove();
  }

  function idejuChatNearBottom(listEl, thresholdPx = 90) {
    if (!listEl) return true;
    return listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < thresholdPx;
  }

  function paintIdejuChatMessages(listEl, rows, options = {}) {
    if (!listEl) return;
    const me = actorKey();
    const stickBottom = Boolean(options.stickBottom);
    const preserveScroll = Boolean(options.preserveScroll);
    const hasMoreOlder = Boolean(options.hasMoreOlder);
    const loadingOlder = Boolean(options.loadingOlder);
    const showHistoryEnd = Boolean(options.showHistoryEnd);
    const reactions = Array.isArray(options.reactions) ? options.reactions : loadLocalIdejuChatReactions();
    const prevHeight = listEl.scrollHeight;
    const prevTop = listEl.scrollTop;
    const list = Array.isArray(rows) ? rows : [];

    listEl.innerHTML = "";
    if (!list.length) {
      listEl.innerHTML = `<div class="pdd-ideju-empty">Vēl nav ziņu — esi pirmais!</div>`;
      return;
    }

    if (hasMoreOlder || loadingOlder) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pdd-ideju-history-btn";
      btn.setAttribute("data-ideju-load-older", "1");
      btn.disabled = loadingOlder;
      btn.textContent = loadingOlder ? "Ielādē…" : "Rādīt vecākas ziņas";
      listEl.appendChild(btn);
    } else if (showHistoryEnd && list.length > IDEJU_CHAT_PAGE_SIZE) {
      const end = document.createElement("div");
      end.className = "pdd-ideju-history-end";
      end.textContent = "Sākums — visa ielādētā vēsture";
      listEl.appendChild(end);
    }

    for (const m of list) {
      const mine = m.actor_key && m.actor_key === me;
      const div = document.createElement("div");
      div.className = `pdd-ideju-msg${mine ? " mine" : ""}`;
      div.setAttribute("data-msg-id", String(m.id || ""));
      const who = m.actor_name || m.actor_key || "Lietotājs";
      const when = formatSalInfoWhen(m.created_at);
      const src =
        m.source === "aktualitates" ? " · no Aktualitātēm" : m.source === "saliedesana" ? " · no Saliedēšanas" : "";
      let reactsHtml = "";
      try {
        reactsHtml = renderIdejuChatReactionsHtml(m.id, reactions);
      } catch {
        reactsHtml = "";
      }
      div.innerHTML =
        `<div class="pdd-ideju-msg-meta">${escapeHtmlLite(who)} · ${escapeHtmlLite(when)}${escapeHtmlLite(src)}</div>` +
        `<div class="pdd-ideju-msg-body">${String(m.body || "")}</div>` +
        reactsHtml;
      listEl.appendChild(div);
    }

    if (stickBottom) {
      listEl.scrollTop = listEl.scrollHeight;
    } else if (preserveScroll) {
      listEl.scrollTop = listEl.scrollHeight - prevHeight + prevTop;
    }
  }

  async function refreshIdejuChatModalList(listEl, statusEl, options = {}) {
    if (!listEl) return [];
    const sb = globalThis.__PDD_SUPABASE__ ?? null;
    const local = loadLocalIdejuChat();
    let remote = null;
    if (sb) remote = await fetchIdejuChatRemote(sb, { limit: IDEJU_CHAT_PAGE_SIZE });
    const rows = remote ? mergeIdejuChatLists(local, remote) : local;
    saveLocalIdejuChat(rows, { silent: true });
    const stickBottom = options.stickBottom != null ? Boolean(options.stickBottom) : idejuChatNearBottom(listEl);
    const hasMoreOlder =
      options.hasMoreOlder != null
        ? Boolean(options.hasMoreOlder)
        : Boolean(remote && remote.length >= IDEJU_CHAT_PAGE_SIZE);
    paintIdejuChatMessages(listEl, rows, {
      stickBottom,
      hasMoreOlder,
      showHistoryEnd: !hasMoreOlder,
    });
    if (statusEl) {
      statusEl.textContent = remote
        ? "Sinhronizēts ar Supabase"
        : sb
          ? "Lokāli (tabula vēl nav pieejama — palaid PIEMEROT_SALIEDESANA_INFO_UN_IDEJU_CHAT.sql)"
          : "Tikai lokāli";
    }
    return rows;
  }

  function escapeHtmlLite(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function openIdejuChatModal(options = {}) {
    if (IDEJU_CHAT_DISABLED) {
      ensureIdejuChatFloatWidget();
      return;
    }
    if (typeof document === "undefined") return;
    ensureIdejuChatModalStyles();
    closeIdejuChatModal();
    const source = options.source === "aktualitates" ? "aktualitates" : "saliedesana";
    const theme = options.theme === "akt" || source === "aktualitates" ? "akt" : "sal";
    markIdejuChatSeen();
    const root = document.createElement("div");
    root.id = "pdd-ideju-chat-modal-root";
    root.className = "pdd-ideju-modal-bg";
    root.innerHTML = `
      <div class="pdd-ideju-modal theme-${theme}" role="dialog" aria-modal="true" aria-label="Čats">
        <div class="pdd-ideju-modal-head">
          <div>
            <h3>💡 Čats</h3>
            <p>Kopīgs čats visai komandai — var rakstīt jebko, arī idejas.</p>
          </div>
          <button type="button" class="pdd-ideju-close" aria-label="Aizvērt">×</button>
        </div>
        <div class="pdd-ideju-list" data-ideju-list></div>
        <div class="pdd-ideju-status" data-ideju-status></div>
        <div class="pdd-ideju-form-wrap">
          <form class="pdd-ideju-form" data-ideju-form>
            <textarea data-ideju-input placeholder="Ziņa… (Ctrl+V — ielīmēt screenshot)" maxlength="2000"></textarea>
            <button type="submit" class="btn btn-primary btn-small">Sūtīt</button>
          </form>
          <div class="pdd-ideju-pending" data-ideju-pending></div>
          <div class="pdd-ideju-form-tools">
            <label class="btn btn-ghost btn-small">
              Pievienot bildi
              <input type="file" accept="image/*" data-ideju-img style="display:none" />
            </label>
            <label class="btn btn-ghost btn-small">
              Pievienot pielikumu
              <input type="file" data-ideju-att style="display:none" />
            </label>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(root);
    const listEl = root.querySelector("[data-ideju-list]");
    const statusEl = root.querySelector("[data-ideju-status]");
    const form = root.querySelector("[data-ideju-form]");
    const input = root.querySelector("[data-ideju-input]");
    const pendingEl = root.querySelector("[data-ideju-pending]");
    const imgInput = root.querySelector("[data-ideju-img]");
    const attInput = root.querySelector("[data-ideju-att]");
    let pendingHtml = "";
    // Uzreiz lokālās ziņas — modālis nekad nesāk tukšs, kamēr remote sync vēl nav beidzies.
    let chatRows = loadLocalIdejuChat();
    let chatReactions = loadLocalIdejuChatReactions();
    let hasMoreOlder = chatRows.length > IDEJU_CHAT_PAGE_SIZE;
    let loadingOlder = false;
    let historyFullyLoaded = !hasMoreOlder;
    if (chatRows.length > IDEJU_CHAT_PAGE_SIZE) {
      chatRows = chatRows.slice(-IDEJU_CHAT_PAGE_SIZE);
    }

    function repaintChat(opts = {}) {
      paintIdejuChatMessages(listEl, chatRows, {
        stickBottom: opts.stickBottom,
        preserveScroll: opts.preserveScroll,
        hasMoreOlder: !historyFullyLoaded && hasMoreOlder,
        loadingOlder,
        showHistoryEnd: historyFullyLoaded || (!hasMoreOlder && chatRows.length > 0),
        reactions: chatReactions,
      });
      const olderBtn = listEl?.querySelector("[data-ideju-load-older]");
      if (olderBtn) olderBtn.onclick = () => void loadOlderIdejuChat();
    }
    repaintChat({ stickBottom: true });
    if (statusEl) statusEl.textContent = chatRows.length ? "Lokālā keša…" : "Ielādē…";

    async function syncChatReactions(messageIds) {
      const local = loadLocalIdejuChatReactions();
      const sb = globalThis.__PDD_SUPABASE__ ?? null;
      if (!sb) {
        chatReactions = local;
        return chatReactions;
      }
      const ids = Array.isArray(messageIds)
        ? messageIds
        : chatRows.map((m) => m.id).filter(Boolean);
      const remote = await fetchIdejuChatReactionsRemote(sb, ids);
      if (remote) {
        chatReactions = mergeIdejuChatReactions(local, remote);
        saveLocalIdejuChatReactions(chatReactions, { silent: true });
      } else {
        chatReactions = local;
      }
      return chatReactions;
    }

    async function loadOlderIdejuChat() {
      if (loadingOlder || historyFullyLoaded) return;
      const sb = globalThis.__PDD_SUPABASE__ ?? null;
      const oldest = chatRows[0]?.created_at;
      loadingOlder = true;
      repaintChat({ preserveScroll: true });

      if (sb && oldest) {
        const older = await fetchIdejuChatRemote(sb, { before: oldest, limit: IDEJU_CHAT_PAGE_SIZE });
        if (!older || !older.length) {
          hasMoreOlder = false;
          historyFullyLoaded = true;
        } else {
          if (older.length < IDEJU_CHAT_PAGE_SIZE) {
            hasMoreOlder = false;
            historyFullyLoaded = true;
          } else {
            hasMoreOlder = true;
          }
          chatRows = mergeIdejuChatLists(older, chatRows);
          persistIdejuChatMerge(chatRows, { silent: true });
          await syncChatReactions(chatRows.map((m) => m.id));
        }
      } else {
        // Bez remote filtra — rādām visu lokālo vēsturi (vai visu, kas jau kešā).
        const allLocal = loadLocalIdejuChat();
        chatRows = mergeIdejuChatLists(allLocal, chatRows);
        hasMoreOlder = false;
        historyFullyLoaded = true;
        await syncChatReactions(chatRows.map((m) => m.id));
      }

      loadingOlder = false;
      repaintChat({ preserveScroll: true });
    }

    async function syncChatList(opts = {}) {
      const sb = globalThis.__PDD_SUPABASE__ ?? null;
      const local = loadLocalIdejuChat();
      let remote = null;
      try {
        if (sb) {
          try {
            const ensure = globalThis.__PDD_ENSURE_DB_SESSION__;
            if (typeof ensure === "function") await ensure();
          } catch {
            /* continue with local */
          }
          remote = await fetchIdejuChatRemote(sb, { limit: IDEJU_CHAT_SYNC_LIMIT });
        }
      } catch (e) {
        console.warn("[Čats.sync]", e?.message || e);
        remote = null;
      }
      const nearBottom = opts.forceBottom || idejuChatNearBottom(listEl);
      // Tukšu remote (kļūda/RLS) nepārraksta lokālo vēsturi.
      const all =
        remote && (remote.length > 0 || local.length === 0)
          ? mergeIdejuChatLists(local, remote)
          : local.slice();
      persistIdejuChatMerge(all, { silent: true });

      if (opts.initial) {
        if (all.length > IDEJU_CHAT_PAGE_SIZE) {
          chatRows = all.slice(-IDEJU_CHAT_PAGE_SIZE);
          hasMoreOlder = true;
          historyFullyLoaded = false;
        } else {
          chatRows = all;
          hasMoreOlder = false;
          historyFullyLoaded = true;
        }
      } else if (historyFullyLoaded) {
        chatRows = all;
      } else {
        const oldestKept = chatRows[0]?.created_at;
        if (oldestKept) {
          chatRows = mergeIdejuChatLists(
            chatRows,
            all.filter((m) => String(m.created_at) >= String(oldestKept)),
          );
        } else {
          chatRows = all.slice(-IDEJU_CHAT_PAGE_SIZE);
          hasMoreOlder = all.length > IDEJU_CHAT_PAGE_SIZE;
        }
      }
      // Reakcijas nedrīkst bloķēt ziņu rādīšanu.
      repaintChat({ stickBottom: nearBottom });
      try {
        await syncChatReactions(chatRows.map((m) => m.id));
        repaintChat({ stickBottom: nearBottom, preserveScroll: !nearBottom });
      } catch (e) {
        console.warn("[Čats.reactions.sync]", e?.message || e);
      }
      if (statusEl) {
        statusEl.textContent = remote
          ? "Sinhronizēts ar Supabase"
          : sb
            ? "Lokāli (tabula vēl nav pieejama — palaid PIEMEROT_SALIEDESANA_INFO_UN_IDEJU_CHAT.sql)"
            : "Tikai lokāli";
      }
      return chatRows;
    }

    function paintIdejuPending() {
      if (!pendingEl) return;
      if (!pendingHtml.trim()) {
        pendingEl.classList.remove("has-items");
        pendingEl.innerHTML = "";
        return;
      }
      pendingEl.classList.add("has-items");
      const imgs = (pendingHtml.match(/<img\b[^>]*>/gi) || []).length;
      const atts = (pendingHtml.match(/data-ideju-attachment-row/gi) || []).length;
      const bits = [];
      if (imgs) bits.push(`${imgs} attēl${imgs === 1 ? "s" : "i"}`);
      if (atts) bits.push(`${atts} pielikum${atts === 1 ? "s" : "i"}`);
      pendingEl.innerHTML =
        `<div class="pdd-ideju-pending-top"><span class="pdd-ideju-pending-item">Pievienots: ${bits.join(", ") || "fails"}</span>` +
        `<button type="button" class="btn btn-ghost btn-small" data-ideju-pending-clear>Noņemt</button></div>` +
        `<div class="pdd-ideju-pending-media">${pendingHtml}</div>`;
      pendingEl.querySelector("[data-ideju-pending-clear]")?.addEventListener("click", () => {
        pendingHtml = "";
        paintIdejuPending();
      });
    }

    function readFileAsDataUrl(file) {
      return new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result || ""));
        fr.onerror = () => reject(fr.error || new Error("Neizdevās nolasīt failu"));
        fr.readAsDataURL(file);
      });
    }

    async function appendIdejuChatImage(file) {
      if (!file) return;
      const token = `ideju-img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const safeName = escapeHtmlLite(file.name || "Attēls");
      let previewSrc = "";
      try {
        previewSrc = await readFileAsDataUrl(file);
      } catch (e) {
        console.warn("[ideju-chat.image.read]", e?.message || e);
        alert("Neizdevās nolasīt attēlu no starpliktuves/faila.");
        return;
      }
      if (!previewSrc) return;

      const insertOrReplace = (src) => {
        const safeSrc = escapeHtmlLite(src);
        const tag =
          `<img data-ideju-img="1" data-ideju-tmp="${token}" src="${safeSrc}" alt="${safeName}" ` +
          `style="display:block;max-width:100%;width:min(100%,320px);height:auto;border-radius:8px;margin:0.35rem 0;" />`;
        const re = new RegExp(`<img\\b[^>]*data-ideju-tmp="${token}"[^>]*>`, "i");
        if (re.test(pendingHtml)) pendingHtml = pendingHtml.replace(re, tag);
        else pendingHtml += tag;
        paintIdejuPending();
      };

      // Uzreiz rāda bildi; pēc tam mēģina aizvietot ar Supabase URL.
      insertOrReplace(previewSrc);

      const sb = globalThis.__PDD_SUPABASE__ ?? null;
      if (!sb) return;
      try {
        const { publicUrl } = await uploadSaliedesanaFileToStorage(sb, file, "ideju-chat");
        if (publicUrl) insertOrReplace(publicUrl);
      } catch (e) {
        console.warn("[ideju-chat.image.upload]", e?.message || e);
      }
    }

    async function appendIdejuChatAttachment(file) {
      if (!file) return;
      const sb = globalThis.__PDD_SUPABASE__ ?? null;
      const insertAtt = (url, name) => {
        const safeSrc = escapeHtmlLite(url);
        const safeName = escapeHtmlLite(name || "pielikums");
        pendingHtml +=
          `<p data-ideju-attachment-row="1">Pielikums: <a data-ideju-attachment="1" href="${safeSrc}" target="_blank" rel="noopener noreferrer">${safeName}</a> ` +
          `(<a href="${safeSrc}" download="${safeName}">Lejupielādēt</a>)</p>`;
        paintIdejuPending();
      };
      if (sb) {
        try {
          const { publicUrl } = await uploadSaliedesanaFileToStorage(sb, file, "ideju-chat");
          insertAtt(publicUrl, file.name);
          return;
        } catch (e) {
          alert(
            "Neizdevās augšupielādēt pielikumu: " +
              (e?.message || String(e)) +
              ". Mēģināšu ievietot lokāli šajā ziņā.",
          );
        }
      }
      const fr = new FileReader();
      fr.onload = () => {
        const src = String(fr.result || "");
        if (src) insertAtt(src, file.name);
      };
      fr.readAsDataURL(file);
    }

    imgInput?.addEventListener("change", (e) => {
      const f = e.target?.files?.[0];
      if (f) void appendIdejuChatImage(f);
      e.target.value = "";
    });
    input?.addEventListener("paste", (e) => {
      const cd = e.clipboardData;
      if (!cd) return;
      const fromItems = [...(cd.items || [])].find((item) => item.kind === "file" && item.type.startsWith("image/"));
      if (fromItems) {
        e.preventDefault();
        const file = fromItems.getAsFile();
        if (file) {
          const ext = (file.type.split("/")[1] || "png").replace(/[^a-z0-9]/gi, "") || "png";
          const name = file.name && file.name.trim() ? file.name : `screenshot-${Date.now()}.${ext}`;
          void appendIdejuChatImage(new File([file], name, { type: file.type || "image/png" }));
        }
        return;
      }
      const fromFiles = [...(cd.files || [])].find((f) => f.type.startsWith("image/"));
      if (fromFiles) {
        e.preventDefault();
        void appendIdejuChatImage(fromFiles);
      }
    });
    attInput?.addEventListener("click", (e) => {
      const ok = confirm(SAL_INFO_ATTACHMENT_WARNING);
      if (!ok) {
        e.preventDefault();
        e.stopPropagation();
        if (e.target) e.target.value = "";
      }
    });
    attInput?.addEventListener("change", (e) => {
      const f = e.target?.files?.[0];
      if (f) void appendIdejuChatAttachment(f);
      e.target.value = "";
    });
    root.querySelector(".pdd-ideju-close")?.addEventListener("click", closeIdejuChatModal);
    root.addEventListener("click", (e) => {
      if (e.target === root) closeIdejuChatModal();
    });
    listEl?.addEventListener("click", (e) => {
      const btn = e.target?.closest?.("[data-ideju-react]");
      if (!btn || !listEl.contains(btn)) return;
      e.preventDefault();
      e.stopPropagation();
      const msgId = btn.getAttribute("data-msg-id") || btn.closest("[data-msg-id]")?.getAttribute("data-msg-id");
      const emoji = btn.getAttribute("data-ideju-react");
      if (!msgId || !emoji) return;
      void (async () => {
        chatReactions = await setIdejuChatReaction(msgId, emoji);
        repaintChat({ preserveScroll: true });
      })();
    });
    const onReactionsChanged = () => {
      chatReactions = loadLocalIdejuChatReactions();
      repaintChat({ preserveScroll: true });
    };
    window.addEventListener("pdd:ideju-chat-reactions-changed", onReactionsChanged);
    root.__pddIdejuCleanup = () => {
      window.removeEventListener("pdd:ideju-chat-reactions-changed", onReactionsChanged);
    };
    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const body = buildIdejuChatBody(input?.value, pendingHtml);
      if (!idejuChatBodyIsMeaningful(body)) {
        alert("Ieraksti tekstu vai pievieno bildi/pielikumu.");
        return;
      }
      const row = {
        id: salUid(),
        body,
        actor_key: actorKey(),
        actor_name: actorDisplayName(),
        source,
        created_at: new Date().toISOString(),
      };
      const local = mergeIdejuChatLists(loadLocalIdejuChat(), [row]);
      saveLocalIdejuChat(local);
      chatRows = mergeIdejuChatLists(chatRows, [row]);
      if (input) input.value = "";
      pendingHtml = "";
      paintIdejuPending();
      repaintChat({ stickBottom: true });
      const sb = globalThis.__PDD_SUPABASE__ ?? null;
      if (sb) {
        const out = await insertIdejuChatRemote(sb, row);
        if (!out.ok && statusEl) {
          statusEl.textContent =
            out.error?.message ||
            "Neizdevās saglabāt Supabase — palaid PIEMEROT_SALIEDESANA_INFO_UN_IDEJU_CHAT.sql";
        } else {
          await syncChatList({ forceBottom: true });
        }
      }
    });
    listEl?.addEventListener("scroll", () => {
      if (!hasMoreOlder || loadingOlder || historyFullyLoaded) return;
      if (listEl.scrollTop <= 8) void loadOlderIdejuChat();
    });
    void syncChatList({ initial: true, forceBottom: true }).then(() => {
      markIdejuChatSeen(chatRows.length ? chatRows : loadLocalIdejuChat());
    });
    idejuChatPollTimer = setInterval(() => {
      void syncChatList().then(() => {
        markIdejuChatSeen(chatRows.length ? chatRows : loadLocalIdejuChat());
      });
    }, 6000);
    const sb = globalThis.__PDD_SUPABASE__ ?? null;
    if (sb) {
      try {
        idejuChatChannel = sb
          .channel(`pdd-ideju-chat-${Date.now()}`)
          .on("postgres_changes", { event: "*", schema: "public", table: REMOTE_IDEJU_CHAT_TABLE }, () => {
            void syncChatList();
          })
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: REMOTE_IDEJU_CHAT_REACTIONS_TABLE },
            () => {
              void syncChatReactions(chatRows.map((m) => m.id)).then(() => {
                repaintChat({ preserveScroll: true });
              });
            },
          )
          .subscribe();
      } catch {
        /* ignore */
      }
    }
    setTimeout(() => input?.focus(), 50);
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
    put(SAL_COL_CANDIDATES.Brivs_apraksts, String(ev.descriptionHtml ?? "").trim() || null);
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
    const cutoff = historyRetentionCutoffYmd();
    let q = await supabase
      .from(REMOTE_TABLE)
      .select("*")
      .gte("Datums", cutoff)
      .order("Datums", { ascending: false })
      .limit(300);
    if (q.error) {
      q = await supabase.from(REMOTE_TABLE).select("*").order("id", { ascending: false }).limit(300);
    }
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
      return filterEventsByRetention(parsed.map(normalizeEvent).filter((x) => x.id && x.date && x.title));
    } catch {
      return [];
    }
  }

  function saveLocalEvents(events) {
    const kept = filterEventsByRetention(Array.isArray(events) ? events : []);
    try {
      localStorage.setItem(LS_EVENTS_KEY, JSON.stringify(kept));
    } catch {
      // ignore
    }
    try {
      globalThis.__PDD_SALIEDESANA_REPAINT_MAIN_CALENDAR__?.();
    } catch {
      // ignore
    }
    try {
      window.dispatchEvent(new CustomEvent("pdd:saliedesana-news-changed"));
    } catch {
      /* ignore */
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
      .filter((x) => String(x.date || "").slice(0, 10) >= historyRetentionCutoffYmd())
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

  /** Dzēš Saliedēšanas pasākumus vecākus par 2 mēnešiem (lokāli + remote). */
  async function purgeOldSaliedesanaEventsOnce(supabase) {
    if (salEventsRemotePurgeStarted) return;
    salEventsRemotePurgeStarted = true;
    try {
      const local = loadLocalEvents();
      saveLocalEvents(local);
    } catch {
      /* ignore */
    }
    if (!supabase) return;
    const cutoff = historyRetentionCutoffYmd();
    try {
      await Promise.race([
        (async () => {
          try {
            let r = await supabase.from(REMOTE_TABLE).delete().lt("Datums", cutoff);
            if (r.error) r = await supabase.from(REMOTE_TABLE).delete().lt("datums", cutoff);
            if (r.error) console.warn("[saliedesana.purge]", r.error.message || r.error);
          } catch (e) {
            console.warn("[saliedesana.purge]", e?.message || e);
          }
        })(),
        new Promise((resolve) => setTimeout(resolve, 8000)),
      ]);
    } catch (e) {
      console.warn("[saliedesana.purge]", e?.message || e);
    }
  }

  function paintMainCalendarBadgesFromLocal() {
    return; /* pasākumi rāda Prombūtnes kalendārs */
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
      const openEditor = globalThis.__PDD_OPEN_SAL_EVENT_EDITOR__;
      if (typeof openEditor === "function") {
        return Boolean(openEditor({ eventId, date: eventDate, title: eventTitle }));
      }
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
      /** Sadaļa noņemta — pasākumi tikai Prombūtnes kalendārā. */
      const { useEffect } = React;
      useEffect(() => {
        try {
          globalThis.__PDD_CHANGE_VIEW__?.("prombutnes");
        } catch {
          /* ignore */
        }
      }, []);
      return html`<section class="list-panel"><p style=${{ margin: 0 }}>Saliedēšanas pasākumi pieejami <strong>Prombūtnes → Kalendārs</strong>.</p></section>`;
    };
  }

  installGlobalMainCalendarBadgeSync();

  let salSyncNavLastAt = 0;

  function eventUpdatedMs(ev) {
    const s = String(ev?.updatedAt ?? ev?.updated_at ?? "").trim();
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : 0;
  }

  /** Apvieno lokālos un remote pasākumus — jaunākais updatedAt uzvar (nevis akli remote pārraksta). */
  function mergeSaliedesanaEvents(localRows, remoteRows) {
    const local = filterEventsByRetention(
      (Array.isArray(localRows) ? localRows : []).map(normalizeEvent).filter((x) => x.id && x.date && x.title)
    );
    const remote = filterEventsByRetention(
      (Array.isArray(remoteRows) ? remoteRows : []).filter((x) => x.id && x.date && x.title)
    );
    const localById = new Map(local.map((ev) => [String(ev.id), ev]));
    const localByRemoteId = new Map(
      local.filter((ev) => Number(ev.remoteId || 0) > 0).map((ev) => [Number(ev.remoteId), ev])
    );
    const usedLocalIds = new Set();
    const out = [];

    for (const rem of remote) {
      const rid = Number(rem.remoteId || 0);
      let loc =
        (rid > 0 ? localByRemoteId.get(rid) : null) ||
        localById.get(String(rem.id)) ||
        null;
      if (!loc) {
        for (const lev of local) {
          if (rid > 0 && Number(lev.remoteId) === rid) {
            loc = lev;
            break;
          }
        }
      }
      if (loc) {
        usedLocalIds.add(String(loc.id));
        const pick =
          eventUpdatedMs(loc) >= eventUpdatedMs(rem)
            ? { ...loc, remoteId: rid || loc.remoteId || null }
            : { ...rem, id: loc.id, remoteId: rid || loc.remoteId || null };
        out.push(normalizeEvent(pick));
      } else {
        out.push(normalizeEvent(rem));
      }
    }

    for (const loc of local) {
      if (!usedLocalIds.has(String(loc.id))) out.push(normalizeEvent(loc));
    }

    return filterEventsByRetention(out).sort((a, b) =>
      `${String(b.date)} ${String(b.time || "")}`.localeCompare(`${String(a.date)} ${String(a.time || "")}`)
    );
  }

  async function syncSaliedesanaNewsCacheForNav() {
    const now = Date.now();
    if (now - salSyncNavLastAt < 30000) return;
    salSyncNavLastAt = now;
    const sb = globalThis.__PDD_SUPABASE__ ?? null;
    if (!sb) return;
    let touched = false;
    const remoteEvents = await fetchRemoteEvents(sb);
    if (remoteEvents) {
      try {
        const localEvents = loadLocalEvents();
        const merged = mergeSaliedesanaEvents(localEvents, remoteEvents);
        localStorage.setItem(LS_EVENTS_KEY, JSON.stringify(merged));
        touched = true;
      } catch {
        /* ignore */
      }
      try {
        globalThis.__PDD_SALIEDESANA_REPAINT_MAIN_CALENDAR__?.();
      } catch {
        /* ignore */
      }
    }
    if (touched) {
      try {
        window.dispatchEvent(new CustomEvent("pdd:saliedesana-news-changed"));
      } catch {
        /* ignore */
      }
    }
  }

  async function upsertSimpleEvent({ id, date, title, note, time, timeTo } = {}) {
    const cutoff = historyRetentionCutoffYmd();
    const dateKey = String(date || "").slice(0, 10);
    if (!dateKey || dateKey < cutoff) {
      throw new Error("Vecāki par 2 mēnešiem kalendāra dati nav pieejami.");
    }
    const titleClean = String(title || "").trim();
    if (!titleClean) throw new Error("Norādi pasākuma nosaukumu.");
    const local = loadLocalEvents();
    const nid = String(id || "").trim() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const prev = local.find((x) => String(x.id) === nid) || null;
    const timeFrom = normalizeTimeHHMM(String(time || prev?.time || "08:00").trim() || "08:00");
    const timeEnd = normalizeTimeHHMM(
      String(timeTo ?? prev?.details?.timeTo ?? "").trim()
    );
    const noteClean = String(note !== undefined && note !== null ? note : prev?.note ?? "").trim();
    const row = normalizeEvent({
      id: nid,
      remote_id: prev?.remoteId || null,
      event_date: dateKey,
      event_time: timeFrom,
      category: "team",
      event_type: "saliedesana",
      title: titleClean,
      location: "",
      is_online: false,
      short_category: "cits",
      icon: "📌",
      color: "#fb923c",
      description_html: "",
      note: noteClean,
      details: {
        ...(prev?.details && typeof prev.details === "object" ? prev.details : {}),
        timeTo: timeEnd,
        showInAktualitates: false,
      },
      poll: { items: [] },
      participants: prev?.participants && typeof prev.participants === "object" ? prev.participants : {},
      attachments: [],
      updated_at: new Date().toISOString(),
    });
    const next = prev ? local.map((x) => (String(x.id) === nid ? row : x)) : [row, ...local];
    saveLocalEvents(next);
    const sb = globalThis.__PDD_SUPABASE__ ?? null;
    if (sb) {
      const rid = await upsertRemoteEvent(sb, row);
      if (rid) {
        row.remoteId = rid;
        saveLocalEvents(next.map((x) => (String(x.id) === nid ? { ...x, remoteId: rid } : x)));
      }
    }
    try {
      window.dispatchEvent(new CustomEvent("pdd:saliedesana-news-changed"));
    } catch {
      /* ignore */
    }
    return row;
  }

  async function deleteSimpleEvent(id) {
    const nid = String(id || "").trim();
    if (!nid) return;
    const local = loadLocalEvents();
    const current = local.find((x) => String(x.id) === nid);
    saveLocalEvents(local.filter((x) => String(x.id) !== nid));
    const sb = globalThis.__PDD_SUPABASE__ ?? null;
    if (sb && current?.remoteId) {
      try {
        await deleteRemoteEvent(sb, current.remoteId);
      } catch (e) {
        console.warn("[saliedesana.delete]", e?.message || e);
      }
    }
    try {
      window.dispatchEvent(new CustomEvent("pdd:saliedesana-news-changed"));
    } catch {
      /* ignore */
    }
  }

  window.SALIEDESANA = {
    createSaliedesanaPanel,
    toYmd,
    DB_SQL_SETUP,
    /** Prombūtnes kalendāra tiltam: lokālie pasākumi (tostarp pirms paneļa mount). */
    loadLocalEvents,
    LS_EVENTS_KEY,
    syncNewsCacheForNav: syncSaliedesanaNewsCacheForNav,
    purgeOldSaliedesanaEventsOnce,
    historyRetentionCutoffYmd,
    upsertSimpleEvent,
    deleteSimpleEvent,
  };

  window.PDD_IDEJU_CHAT = {
    open: openIdejuChatModal,
    close: closeIdejuChatModal,
    mountPreview: mountIdejuChatPreview,
    mountFloat: mountIdejuChatFloatWidget,
    ensureFloat: ensureIdejuChatFloatWidget,
  };
})();
