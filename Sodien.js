const SODIEN_STORE_KEY = "pdd_sodien_aktualitates_v1";

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

function addAktualitate() {
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
  const end = usePeriod ? pick(document.getElementById("sodien-end")?.value || start || today) : (start || today);
  if (start && end && end < start) {
    alert("Perioda beigu datums nevar būt mazāks par sākuma datumu.");
    return;
  }
  const list = cleanExpired(loadAktualitates());
  const editId = pick(currentEditIdField()?.value || "");
  const row = {
    id: editId || crypto.randomUUID(),
    html: content,
    start: start || today,
    end: end || start || today,
    use_period: usePeriod,
    created_at: new Date().toISOString(),
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

function deleteAktualitate(id) {
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
  const item = cleanExpired(loadAktualitates()).find((x) => String(x.id) === String(id));
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

function visibleAktualitatesActive() {
  const today = ymd(new Date());
  const cleaned = cleanExpired(loadAktualitates());
  saveAktualitates(cleaned);
  return cleaned.filter((x) => {
    const e = pick(x.end || "");
    return !e || e >= today;
  });
}

function renderTodayInfo({ html, absences }) {
  if (typeof html !== "function") return null;
  const awayRows = todayRows(absences);
  const aktualitates = visibleAktualitatesActive();
  const today = ymd(new Date());
  return html`
    <section
      class="list-panel"
      style=${{
        marginTop: "1rem",
        background: "linear-gradient(180deg, rgba(56,189,248,0.16), rgba(14,116,144,0.1))",
        border: "1px solid rgba(14,116,144,0.55)",
      }}
    >
      <h3 style=${{ margin: "0 0 0.75rem", fontSize: "1rem", color: "#075985" }}>AKTUALITĀTES</h3>

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
      ${aktualitates.length
        ? html`
            <div class="stack" style=${{ gap: "0.5rem", marginBottom: "0.75rem" }}>
              ${aktualitates.map(
                (x) => html`
                  <div key=${x.id} style=${{ border: "1px dashed rgba(2,132,199,0.55)", borderRadius: "10px", padding: "0.55rem 0.65rem", background: "rgba(255,255,255,0.8)" }}>
                    ${x.use_period
                      ? html`
                          <div style=${{ fontSize: "0.8rem", color: "var(--muted)", marginBottom: "0.3rem" }}>
                            Periods: ${formatLvDate(x.start)} — ${formatLvDate(x.end)}
                          </div>
                        `
                      : null}
                    <div style=${{ fontSize: "0.92rem" }} dangerouslySetInnerHTML=${{ __html: String(x.html || "") }}></div>
                    <div class="row" style=${{ marginTop: "0.45rem" }}>
                      <button type="button" class="btn btn-ghost btn-small" onClick=${() => editAktualitate(x.id)}>Labot</button>
                      <button type="button" class="btn btn-danger btn-small" onClick=${() => deleteAktualitate(x.id)}>Dzēst</button>
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
            <button id="sodien-submit-btn" type="button" class="btn btn-primary btn-small" onClick=${addAktualitate}>Pievienot</button>
            <button type="button" class="btn btn-ghost btn-small" onClick=${resetAktualitateForm}>Atcelt</button>
          </div>
        </div>
      </details>
    </section>
  `;
}

window.PDDSodien = {
  renderTodayInfo,
};
