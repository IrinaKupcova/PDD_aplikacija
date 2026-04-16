(function () {
  const TABLE_CANDIDATES = [
    "Aplikacijas_papildinajums",
    "aplikacijas_papildinajums",
    "Aplikacijas_papildinājums",
    "aplikacijas_papildinājums",
  ];
  let resolvedTable = null;

  function pick(v) {
    return String(v ?? "").trim();
  }

  function ymd(v) {
    const s = pick(v);
    if (!s) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 10);
  }

  async function resolveTable(sb) {
    if (resolvedTable) return resolvedTable;
    let lastErr = null;
    for (const t of TABLE_CANDIDATES) {
      const { error } = await sb.from(t).select("*").limit(1);
      if (!error) {
        resolvedTable = t;
        return t;
      }
      lastErr = error;
    }
    throw new Error(`Aplikācijas izmaiņu tabula nav atrasta. ${lastErr?.message || ""}`.trim());
  }

  function rowFromDb(r) {
    return {
      id: pick(r?.id),
      nosaukums: pick(r?.nosaukums),
      apraksts: pick(r?.apraksts),
      datums: ymd(r?.datums),
      created_at: pick(r?.created_at),
    };
  }

  function latestStamp(rows) {
    const list = Array.isArray(rows) ? rows : [];
    const first = list[0] ?? null;
    if (!first) return "";
    return `${pick(first.created_at)}|${pick(first.id)}`;
  }

  async function fetchRows(sb) {
    const t = await resolveTable(sb);
    const { data, error } = await sb.from(t).select("*").order("datums", { ascending: false }).order("created_at", { ascending: false });
    if (error) throw error;
    return (Array.isArray(data) ? data : []).map(rowFromDb);
  }

  async function insertRow(sb, draft) {
    const t = await resolveTable(sb);
    const payload = {
      nosaukums: pick(draft?.nosaukums),
      apraksts: pick(draft?.apraksts),
      datums: ymd(draft?.datums) || ymd(new Date()),
    };
    const { data, error } = await sb.from(t).insert(payload).select("*").limit(1).single();
    if (error) throw error;
    return rowFromDb(data);
  }

  async function updateRow(sb, id, draft) {
    const t = await resolveTable(sb);
    const payload = {
      nosaukums: pick(draft?.nosaukums),
      apraksts: pick(draft?.apraksts),
      datums: ymd(draft?.datums) || ymd(new Date()),
    };
    const { data, error } = await sb.from(t).update(payload).eq("id", id).select("*").limit(1).single();
    if (error) throw error;
    return rowFromDb(data);
  }

  async function deleteRow(sb, id) {
    const t = await resolveTable(sb);
    const { error } = await sb.from(t).delete().eq("id", id);
    if (error) throw error;
  }

  function createChangesView(html, React) {
    const { useEffect, useState } = React;
    return function AppChangesView({ supabase }) {
      const [rows, setRows] = useState([]);
      const [busy, setBusy] = useState(false);
      const [err, setErr] = useState("");
      const [editingId, setEditingId] = useState("");
      const [formOpen, setFormOpen] = useState(false);
      const [draft, setDraft] = useState({ nosaukums: "", apraksts: "", datums: ymd(new Date()) });

      async function refresh() {
        setErr("");
        try {
          if (!supabase) throw new Error("Nav pieslēgta Supabase sesija.");
          setRows(await fetchRows(supabase));
        } catch (e) {
          setErr(String(e?.message || e || "Neizdevās ielādēt izmaiņas."));
        }
      }

      useEffect(() => {
        void refresh();
      }, []); // eslint-disable-line react-hooks/exhaustive-deps

      function resetForm() {
        setEditingId("");
        setFormOpen(false);
        setDraft({ nosaukums: "", apraksts: "", datums: ymd(new Date()) });
      }

      function startEdit(row) {
        setEditingId(String(row?.id || ""));
        setFormOpen(true);
        setDraft({
          nosaukums: pick(row?.nosaukums),
          apraksts: pick(row?.apraksts),
          datums: ymd(row?.datums) || ymd(new Date()),
        });
      }

      async function onSave(ev) {
        ev?.preventDefault?.();
        if (!pick(draft.nosaukums) || !pick(draft.apraksts)) {
          setErr("Aizpildi nosaukumu un aprakstu.");
          return;
        }
        setBusy(true);
        setErr("");
        try {
          if (!supabase) throw new Error("Nav pieslēgta Supabase sesija.");
          if (editingId) {
            await updateRow(supabase, editingId, draft);
            await refresh();
          } else {
            await insertRow(supabase, draft);
            await refresh();
          }
          resetForm();
        } catch (e) {
          setErr(String(e?.message || e || "Neizdevās saglabāt izmaiņu ierakstu."));
        } finally {
          setBusy(false);
        }
      }

      async function onDelete(row) {
        if (!confirm("Dzēst šo izmaiņu ierakstu?")) return;
        setBusy(true);
        setErr("");
        try {
          if (!supabase) throw new Error("Nav pieslēgta Supabase sesija.");
          await deleteRow(supabase, row?.id);
          await refresh();
          if (String(editingId) === String(row?.id)) resetForm();
        } catch (e) {
          setErr(String(e?.message || e || "Neizdevās dzēst izmaiņu ierakstu."));
        } finally {
          setBusy(false);
        }
      }

      return html`
        <section class="list-panel stack" style=${{ gap: "0.85rem" }}>
          <div class="row" style=${{ justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
            <h2 style=${{ margin: 0, fontSize: "1.1rem" }}>Izmaiņas PDD aplikācijā</h2>
            <button
              type="button"
              class="btn btn-primary btn-small"
              onClick=${() => {
                setEditingId("");
                setDraft({ nosaukums: "", apraksts: "", datums: ymd(new Date()) });
                setFormOpen((v) => !v);
              }}
            >
              Pievienot jaunu papildinājumu
            </button>
          </div>
          ${err ? html`<div class="banner-warn" role="alert">${err}</div>` : null}

          <div class="iad-table-wrap">
            <table class="iad-table">
              <thead>
                <tr>
                  <th>Datums</th>
                  <th>Nosaukums</th>
                  <th>Apraksts</th>
                  <th>Darbības</th>
                </tr>
              </thead>
              <tbody>
                ${rows.length
                  ? rows.map(
                      (row) => html`
                        <tr key=${row.id}>
                          <td>${row.datums || "—"}</td>
                          <td>${row.nosaukums || "Bez nosaukuma"}</td>
                          <td style=${{ whiteSpace: "pre-wrap" }}>${row.apraksts || "—"}</td>
                          <td>
                            <div class="row" style=${{ gap: "0.4rem", flexWrap: "wrap" }}>
                              <button type="button" class="btn btn-ghost btn-small" onClick=${() => startEdit(row)}>Labot</button>
                              <button type="button" class="btn btn-danger btn-small" onClick=${() => void onDelete(row)}>Dzēst</button>
                            </div>
                          </td>
                        </tr>
                      `
                    )
                  : html`<tr><td colspan="4" class="iad-empty">Vēl nav pievienotu izmaiņu.</td></tr>`}
              </tbody>
            </table>
          </div>

          ${formOpen || editingId
            ? html`
                <form class="stack" onSubmit=${onSave}>
                  <h3 style=${{ margin: 0, fontSize: "0.98rem" }}>${editingId ? "Labot papildinājumu" : "Jauns papildinājums"}</h3>
                  <div class="field">
                    <label>Nosaukums</label>
                    <input class="input" value=${draft.nosaukums} onChange=${(e) => setDraft((d) => ({ ...d, nosaukums: e.target.value }))} />
                  </div>
                  <div class="field">
                    <label>Apraksts</label>
                    <textarea class="textarea" value=${draft.apraksts} onChange=${(e) => setDraft((d) => ({ ...d, apraksts: e.target.value }))}></textarea>
                  </div>
                  <div class="field">
                    <label>Datums</label>
                    <input type="date" class="input" value=${draft.datums} onChange=${(e) => setDraft((d) => ({ ...d, datums: e.target.value }))} />
                  </div>
                  <div class="row" style=${{ gap: "0.4rem" }}>
                    <button type="submit" class="btn btn-primary btn-small" disabled=${busy}>${busy ? "Saglabā..." : editingId ? "Saglabāt" : "Pievienot"}</button>
                    <button type="button" class="btn btn-ghost btn-small" onClick=${resetForm}>Atcelt</button>
                  </div>
                </form>
              `
            : null}
        </section>
      `;
    };
  }

  globalThis.PDD_IZMAINAS = {
    createChangesView,
    fetchRows,
    latestStamp,
  };
})();