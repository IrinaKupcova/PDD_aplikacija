/**
 * Procesu vadība — posmi, apakšposmi, Gantt, posma telpas, Lists reģistri.
 * Eksports: globalThis.PDD_PROCESU_VADIBA.createProcesuVadibaModule(html, React)
 */
(function (root) {
  const LS_KEY = "pdd_procesu_vadiba_v2";
  const MODULE_VERSION = 2;
  const REMOTE_TABLE = "Procesu_vadiba";
  const REMOTE_ROW_ID = "main";
  const REMOTE_SAVE_MS = 700;
  const REMOTE_SYNC_ENABLED = false;

  const STATUS_PRESETS = ["Nav sākts", "Plānots", "Procesā", "Gaida atbildi", "Pabeigts", "Atcelts"];
  const REGISTRY_COLUMN_TYPES = [
    { id: "text", label: "Teksts" },
    { id: "date", label: "Datums" },
    { id: "choice", label: "Izvēlne" },
    { id: "status", label: "Statuss" },
    { id: "person", label: "Persona" },
  ];

  function uid() {
    return typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `pv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function addDays(iso, days) {
    const d = new Date(iso || todayIso());
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function loadState() {
    if (typeof localStorage === "undefined") return defaultState();
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return defaultState();
      return migrateState(JSON.parse(raw));
    } catch {
      return defaultState();
    }
  }

  function saveState(state) {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }));
    } catch (e) {
      console.warn("[Procesu vadība] Neizdevās saglabāt lokāli", e);
    }
  }

  function stateTimestamp(state) {
    const raw = state?.updatedAt || state?.updated_at || "";
    const t = Date.parse(String(raw));
    return Number.isFinite(t) ? t : 0;
  }

  function pickNewerState(a, b) {
    if (!a) return b;
    if (!b) return a;
    return stateTimestamp(a) >= stateTimestamp(b) ? a : b;
  }

  async function ensureDbSession(sb) {
    if (!sb) return false;
    try {
      const fn = root.__PDD_ENSURE_DB_SESSION__;
      if (typeof fn === "function") await fn();
      return true;
    } catch (e) {
      console.warn("[Procesu vadība] DB sesija", e);
      return false;
    }
  }

  async function fetchRemoteState(sb) {
    if (!REMOTE_SYNC_ENABLED || !sb) return null;
    await ensureDbSession(sb);
    const { data, error } = await sb
      .from(REMOTE_TABLE)
      .select("state, updated_at, updated_by")
      .eq("id", REMOTE_ROW_ID)
      .maybeSingle();
    if (error) {
      console.warn("[Procesu vadība] DB lasīšana", error);
      return null;
    }
    if (!data?.state || typeof data.state !== "object") return null;
    return migrateState({
      ...data.state,
      updatedAt: data.updated_at || data.state.updatedAt,
      updatedBy: data.updated_by || data.state.updatedBy,
    });
  }

  async function saveRemoteState(sb, state) {
    if (!REMOTE_SYNC_ENABLED || !sb || !state) return { ok: false, reason: "no_data" };
    await ensureDbSession(sb);
    const updatedAt = new Date().toISOString();
    const email =
      String(
        root.__PDD_SESSION_EMAIL__ ||
          root.sessionStorage?.getItem?.("pdd_local_email") ||
          "",
      ).trim() || null;
    const payload = {
      id: REMOTE_ROW_ID,
      state: { ...state, updatedAt },
      updated_at: updatedAt,
      updated_by: email,
    };
    const { error } = await sb.from(REMOTE_TABLE).upsert(payload, { onConflict: "id" });
    if (error) {
      console.warn("[Procesu vadība] DB saglabāšana", error);
      return { ok: false, error };
    }
    return { ok: true, updatedAt };
  }

  function defaultRegistryColumns() {
    return [
      { id: uid(), name: "Pārvalde", type: "text", width: 160 },
      { id: uid(), name: "Daļa / struktūrvienība", type: "text", width: 180 },
      { id: uid(), name: "Kontaktpersona", type: "person", width: 150 },
      { id: uid(), name: "Darba virziens", type: "text", width: 200 },
      { id: uid(), name: "Statuss", type: "status", width: 120, options: [...STATUS_PRESETS] },
      { id: uid(), name: "Termiņš", type: "date", width: 120 },
      { id: uid(), name: "Piezīmes", type: "text", width: 220 },
    ];
  }

  function defaultState() {
    const phaseId = uid();
    const sub1 = uid();
    const sub2 = uid();
    const registryToolId = uid();
    const t0 = todayIso();
    return {
      version: MODULE_VERSION,
      screen: "overview",
      activePhaseId: null,
      activeToolId: null,
      phases: [
        {
          id: phaseId,
          parentId: null,
          order: 0,
          title: "Procesu reģistra jauna koncepta ieviešana",
          description:
            "Pārvalžu jaunā koncepta izstrāde un ieviešana procesu reģistrā. Apkopojums darbam ar pārvaldēm un daļām.",
          start: t0,
          end: addDays(t0, 120),
          progress: 15,
          status: "Procesā",
          tools: [
            {
              id: registryToolId,
              type: "registry",
              title: "Pārvalžu un daļu apkopojums",
              description: "Darbs ar pārvaldēm un struktūrvienībām (aizstāj Excel sarakstu).",
            },
          ],
          registries: {
            [registryToolId]: {
              columns: defaultRegistryColumns(),
              rows: [
                {
                  id: uid(),
                  cells: {},
                },
              ],
            },
          },
        },
        {
          id: sub1,
          parentId: phaseId,
          order: 0,
          title: "1. posms — sagatavošana un vajadzību apkopošana",
          description: "Identificēt pārvaldes, kontaktpersonas un sākotnējās prasības.",
          start: t0,
          end: addDays(t0, 30),
          progress: 25,
          status: "Procesā",
          tools: [],
          registries: {},
        },
        {
          id: sub2,
          parentId: phaseId,
          order: 1,
          title: "2. posms — koncepta izstrāde un saskaņošana",
          description: "Koncepta dokumenta izstrāde un saskaņošana ar pārvaldēm.",
          start: addDays(t0, 31),
          end: addDays(t0, 90),
          progress: 5,
          status: "Plānots",
          tools: [],
          registries: {},
        },
      ],
    };
  }

  function migrateState(s) {
    if (!s || s.version !== MODULE_VERSION || !Array.isArray(s.phases) || s.phases.length === 0) {
      return defaultState();
    }
    for (const p of s.phases) {
      p.tools = Array.isArray(p.tools) ? p.tools : [];
      p.registries = p.registries && typeof p.registries === "object" ? p.registries : {};
    }
    if (s.screen !== "overview" && s.screen !== "phase") s.screen = "overview";
    if (s.screen === "phase" && s.activePhaseId && !s.phases.some((p) => p.id === s.activePhaseId)) {
      s.screen = "overview";
      s.activePhaseId = null;
      s.activeToolId = null;
    }
    return s;
  }

  function getTeamUsers() {
    try {
      const list = root.KOMANDA?.loadTeamUsers?.();
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  function personLabel(u) {
    if (!u) return "";
    return String(u["Vārds uzvārds"] ?? u.full_name ?? u.email ?? "").trim();
  }

  function personEmail(u) {
    return String(u.email ?? u["i-mail"] ?? u["e-mail"] ?? "").trim();
  }

  function flattenPhases(phases) {
    const list = Array.isArray(phases) ? phases : [];
    const roots = list.filter((p) => !p.parentId).sort((a, b) => a.order - b.order);
    const out = [];
    for (const r of roots) {
      out.push({ ...r, depth: 0 });
      list
        .filter((c) => c.parentId === r.id)
        .sort((a, b) => a.order - b.order)
        .forEach((c) => out.push({ ...c, depth: 1 }));
    }
    return out;
  }

  function ganttRange(phases) {
    const list = Array.isArray(phases) ? phases : [];
    const dates = list.flatMap((p) => [p.start, p.end]).filter(Boolean);
    if (!dates.length) return { min: todayIso(), max: addDays(todayIso(), 30) };
    dates.sort();
    return { min: dates[0], max: dates[dates.length - 1] };
  }

  function phaseChildren(phases, parentId) {
    return (Array.isArray(phases) ? phases : [])
      .filter((p) => p.parentId === parentId)
      .sort((a, b) => a.order - b.order);
  }

  function collectDescendantIds(phases, phaseId) {
    const ids = new Set([phaseId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const p of phases) {
        if (p.parentId && ids.has(p.parentId) && !ids.has(p.id)) {
          ids.add(p.id);
          changed = true;
        }
      }
    }
    return ids;
  }

  function deletePhaseFromList(phases, phaseId) {
    const ids = collectDescendantIds(phases, phaseId);
    return phases.filter((p) => !ids.has(p.id));
  }

  function buildNewPhase({ title, parentId, phases, parentPhase }) {
    const siblings = phaseChildren(phases, parentId || null);
    const id = uid();
    const t0 = parentPhase?.start || todayIso();
    const phase = {
      id,
      parentId: parentId || null,
      order: siblings.length,
      title: String(title || "").trim(),
      description: "",
      start: t0,
      end: addDays(t0, parentId ? 30 : 90),
      progress: 0,
      status: "Plānots",
      tools: parentId
        ? []
        : [
            {
              id: uid(),
              type: "registry",
              title: "Pārvalžu un daļu apkopojums",
              description: "Darbs ar pārvaldēm un struktūrvienībām.",
            },
          ],
      registries: {},
    };
    if (!parentId && phase.tools[0]) {
      phase.registries[phase.tools[0].id] = {
        columns: defaultRegistryColumns(),
        rows: [{ id: uid(), cells: {} }],
      };
    }
    return phase;
  }

  function phaseGanttItems(phase, phases) {
    if (!phase) return [];
    if (phase.parentId) return [{ ...phase, depth: 0 }];
    const kids = phaseChildren(phases, phase.id).map((c) => ({ ...c, depth: 1 }));
    return [{ ...phase, depth: 0 }, ...kids];
  }

  function ensureStyles() {
    if (typeof document === "undefined" || document.getElementById("pdd-pv-styles-v3")) return;
    const el = document.createElement("style");
    el.id = "pdd-pv-styles-v3";
    el.textContent = `
      .pv-root {
        --pv-bg: #e8f8f3;
        --pv-surface: #ffffff;
        --pv-border: #75ccbd;
        --pv-text: #01171d;
        --pv-muted: #1f4d47;
        --pv-accent: #0d9488;
        --pv-accent-2: #047857;
        font-family: "Segoe UI", system-ui, sans-serif;
        color: var(--pv-text);
        min-height: 70vh;
        width: 100%;
        display: block;
      }
      .pv-shell {
        display: grid;
        grid-template-columns: minmax(250px, 290px) minmax(0, 1fr);
        min-height: calc(100vh - 120px);
        border-radius: 14px;
        overflow: hidden;
        border: 1px solid var(--pv-border);
        background: linear-gradient(165deg, #f0fdf9 0%, #e8f8f3 50%, #dff5ee 100%);
        box-shadow: 0 8px 28px rgba(13, 148, 136, 0.12);
      }
      @media (max-width: 900px) { .pv-shell { grid-template-columns: 1fr; } }
      .pv-sidebar {
        background: #75ccbd;
        border-right: 1px solid #63c2a5;
        padding: 1rem 0.85rem;
        display: flex;
        flex-direction: column;
        gap: 0.65rem;
      }
      .pv-brand h2 { margin: 0; font-size: 1.05rem; font-weight: 700; color: #01171d; }
      .pv-brand p { margin: 0.3rem 0 0; font-size: 0.78rem; color: #0f3d38; line-height: 1.4; }
      .pv-nav-btn {
        width: 100%; text-align: left; border: 1px solid transparent;
        background: rgba(255,255,255,0.35); color: #01171d;
        border-radius: 10px; padding: 0.5rem 0.6rem; font: inherit; font-size: 0.86rem; cursor: pointer;
      }
      .pv-nav-btn:hover { background: rgba(255,255,255,0.55); }
      .pv-nav-btn.active { background: #fff; border-color: #4ab3a5; font-weight: 600; }
      .pv-phase-list { flex: 1; overflow: auto; display: flex; flex-direction: column; gap: 0.25rem; }
      .pv-phase-item {
        display: flex; align-items: flex-start; gap: 0.35rem;
        width: 100%; border: 0; background: transparent; text-align: left;
        padding: 0.4rem 0.45rem; border-radius: 8px; cursor: pointer; font: inherit; color: #01171d;
      }
      .pv-phase-item:hover { background: rgba(255,255,255,0.45); }
      .pv-phase-item.active { background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
      .pv-phase-item.sub { padding-left: 1.1rem; font-size: 0.82rem; }
      .pv-phase-item .meta { font-size: 0.72rem; color: #0f3d38; opacity: 0.85; margin-top: 0.15rem; }
      .pv-add-btn {
        width: 100%; border: 1px dashed #047857; background: rgba(255,255,255,0.4);
        color: #01171d; border-radius: 10px; padding: 0.5rem; font: inherit; cursor: pointer;
      }
      .pv-main { padding: 1rem 1.2rem; overflow: auto; min-width: 0; }
      .pv-topbar { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.75rem; margin-bottom: 1rem; }
      .pv-topbar h1 { margin: 0; font-size: 1.25rem; }
      .pv-topbar .sub { margin: 0.2rem 0 0; color: var(--pv-muted); font-size: 0.84rem; }
      .pv-breadcrumb { display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: center; font-size: 0.82rem; margin-bottom: 0.65rem; color: var(--pv-muted); }
      .pv-link {
        border: 0; background: none; padding: 0; font: inherit; color: #047857;
        cursor: pointer; text-decoration: underline; text-underline-offset: 2px;
      }
      .pv-link:hover { color: #065f46; }
      .pv-btn {
        border: 1px solid var(--pv-border); background: #fff; color: var(--pv-text);
        border-radius: 8px; padding: 0.42rem 0.7rem; font: inherit; font-size: 0.82rem; cursor: pointer;
      }
      .pv-btn:hover { border-color: #0d9488; }
      .pv-btn.primary { background: #047857; border-color: #047857; color: #fff; }
      .pv-card {
        background: #fff; border: 1px solid var(--pv-border); border-radius: 12px;
        padding: 1rem; margin-bottom: 1rem;
      }
      .pv-card h3 { margin: 0 0 0.65rem; font-size: 0.95rem; color: #065f46; }
      .pv-gantt-global { overflow-x: auto; }
      .pv-gantt-head {
        display: grid; grid-template-columns: 220px minmax(480px, 1fr) 70px;
        gap: 0.5rem; font-size: 0.74rem; color: var(--pv-muted); padding-bottom: 0.35rem;
        border-bottom: 1px solid #c5ebe3;
      }
      .pv-gantt-row {
        display: grid; grid-template-columns: 220px minmax(480px, 1fr) 70px;
        gap: 0.5rem; align-items: center; padding: 0.45rem 0;
        border-bottom: 1px solid #e0f2ee; font-size: 0.82rem;
      }
      .pv-gantt-row.sub .pv-gantt-label { padding-left: 1rem; font-size: 0.78rem; }
      .pv-gantt-track {
        position: relative; height: 26px; background: #e8f8f3; border-radius: 6px; overflow: hidden;
      }
      .pv-gantt-bar {
        position: absolute; top: 3px; bottom: 3px; border-radius: 5px;
        background: linear-gradient(90deg, #0d9488, #34d399); min-width: 6px;
      }
      .pv-gantt-bar .fill {
        position: absolute; left: 0; top: 0; bottom: 0;
        background: rgba(1, 23, 29, 0.2); border-radius: 5px 0 0 5px;
      }
      .pv-table-wrap { overflow: auto; border: 1px solid #c5ebe3; border-radius: 10px; }
      .pv-table { width: 100%; border-collapse: collapse; font-size: 0.84rem; min-width: 720px; }
      .pv-table th, .pv-table td { border-bottom: 1px solid #e0f2ee; padding: 0.42rem 0.5rem; text-align: left; }
      .pv-table th { background: #e8f8f3; color: #065f46; font-weight: 600; }
      .pv-table tr:hover td { background: #f0fdf9; }
      .pv-table input, .pv-table select {
        width: 100%; box-sizing: border-box; border: 1px solid #c5ebe3;
        border-radius: 6px; padding: 0.25rem 0.35rem; font: inherit; background: #fff;
      }
      .pv-table input:focus, .pv-table select:focus { outline: none; border-color: #0d9488; }
      .pv-toolbar { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 0.65rem; align-items: center; }
      .pv-tools-grid { display: grid; gap: 0.5rem; }
      .pv-tool-card {
        display: flex; justify-content: space-between; align-items: center; gap: 0.5rem;
        padding: 0.65rem 0.75rem; border: 1px solid #c5ebe3; border-radius: 10px; background: #f0fdf9;
      }
      .pv-tool-card h4 { margin: 0; font-size: 0.88rem; }
      .pv-tool-card p { margin: 0.2rem 0 0; font-size: 0.76rem; color: var(--pv-muted); }
      .pv-status-pill {
        display: inline-block; padding: 0.12rem 0.45rem; border-radius: 999px;
        font-size: 0.72rem; font-weight: 600;
      }
      .pv-status-pill.done { background: #d1fae5; color: #047857; }
      .pv-status-pill.work { background: #ccfbf1; color: #0f766e; }
      .pv-status-pill.wait { background: #fef3c7; color: #b45309; }
      .pv-empty { color: var(--pv-muted); text-align: center; padding: 1.5rem; font-size: 0.88rem; }
      .pv-phase-meta-grid {
        display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.5rem; margin-bottom: 1rem;
      }
      .pv-meta-box {
        background: #f0fdf9; border: 1px solid #c5ebe3; border-radius: 10px; padding: 0.55rem 0.65rem;
      }
      .pv-meta-box .lbl { font-size: 0.72rem; color: var(--pv-muted); }
      .pv-meta-box .val { font-size: 0.9rem; font-weight: 600; margin-top: 0.15rem; }
      .pv-inline-form input, .pv-inline-form textarea, .pv-inline-form select {
        flex: 1 1 200px; padding: 0.45rem 0.55rem; border-radius: 8px; border: 1px solid #c5ebe3; font: inherit;
      }
      .pv-inline-form textarea { min-height: 72px; resize: vertical; flex-basis: 100%; }
      .pv-phase-row {
        display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap;
        padding: 0.35rem 0.25rem; border-bottom: 1px solid #e0f2ee;
      }
      .pv-phase-row:last-child { border-bottom: 0; }
      .pv-phase-row-main {
        flex: 1 1 200px; border: 0; background: transparent; text-align: left;
        padding: 0.35rem 0.45rem; border-radius: 8px; cursor: pointer; font: inherit; color: #01171d;
      }
      .pv-phase-row-main:hover { background: #f0fdf9; }
      .pv-phase-row-main .meta { font-size: 0.72rem; color: #0f3d38; opacity: 0.85; margin-top: 0.15rem; }
      .pv-phase-row-actions { display: flex; gap: 0.25rem; flex-wrap: wrap; }
      .pv-btn.danger { background: #fff; border-color: #fca5a5; color: #b91c1c; }
      .pv-btn.danger:hover { background: #fef2f2; border-color: #f87171; }
      .pv-btn.ghost { background: transparent; }
      .pv-edit-grid {
        display: grid; gap: 0.65rem;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      }
      .pv-edit-grid label {
        display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.78rem; color: var(--pv-muted);
      }
      .pv-edit-grid input, .pv-edit-grid textarea, .pv-edit-grid select {
        padding: 0.45rem 0.55rem; border-radius: 8px; border: 1px solid #c5ebe3; font: inherit; color: var(--pv-text);
      }
      .pv-edit-grid textarea { min-height: 88px; resize: vertical; }
      .pv-edit-actions { display: flex; flex-wrap: wrap; gap: 0.45rem; margin-top: 0.75rem; }
      .pv-gantt-subtitle { margin: 0 0 0.5rem; font-size: 0.8rem; color: var(--pv-muted); }
    `;
    document.head.appendChild(el);
  }

  function createProcesuVadibaModule(html, React) {
    ensureStyles();
    const { useState, useEffect, useCallback, useMemo, useRef, createElement: ce } = React;

    function usePersistedState() {
      const [state, setState] = useState(() => loadState());
      const [syncStatus, setSyncStatus] = useState("local");
      const saveTimerRef = useRef(null);
      const remoteReadyRef = useRef(false);
      const stateRef = useRef(state);
      const hydratedRef = useRef(false);

      useEffect(() => {
        stateRef.current = state;
      }, [state]);

      useEffect(() => {
        let cancelled = false;
        const timer = setTimeout(() => {
          void (async () => {
            const sb = root.__PDD_SUPABASE__ ?? null;
            if (!sb) {
              if (!cancelled) {
                setSyncStatus("local");
                remoteReadyRef.current = true;
              }
              return;
            }
            try {
              const remote = await fetchRemoteState(sb);
              if (cancelled || hydratedRef.current) return;
              hydratedRef.current = true;
              const local = loadState();
              const merged = pickNewerState(remote, local);
              setState(merged);
              saveState(merged);
              setSyncStatus(remote ? "synced" : "local");
            } catch (e) {
              console.warn("[Procesu vadība] sākotnējā sinhronizācija", e);
              if (!cancelled) setSyncStatus("error");
            } finally {
              if (!cancelled) remoteReadyRef.current = true;
            }
          })();
        }, 0);
        return () => {
          cancelled = true;
          clearTimeout(timer);
        };
      }, []);

      useEffect(() => {
        saveState(state);
        if (!remoteReadyRef.current) return undefined;
        const sb = root.__PDD_SUPABASE__ ?? null;
        if (!sb) {
          setSyncStatus("local");
          return undefined;
        }
        setSyncStatus("saving");
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
          void (async () => {
            const out = await saveRemoteState(sb, stateRef.current);
            if (!out?.ok) setSyncStatus("error");
            else setSyncStatus("synced");
          })();
        }, REMOTE_SAVE_MS);
        return () => clearTimeout(saveTimerRef.current);
      }, [state]);

      return [state, setState, syncStatus];
    }

    function StatusPill({ value }) {
      const v = String(value ?? "").trim() || "—";
      const cls = /pabeigts/i.test(v) ? "done" : /procesā/i.test(v) ? "work" : "wait";
      return html`<span class="pv-status-pill ${cls}">${v}</span>`;
    }

    function PhaseLink({ phase, onGo, className }) {
      if (!phase) return null;
      return html`
        <button type="button" class=${`pv-link ${className || ""}`} onClick=${() => onGo(phase.id)}>
          ${phase.title}
        </button>
      `;
    }

    function RegistryList({ phase, tool, readOnly, onPatchPhase }) {
      const registry = phase.registries?.[tool.id] || { columns: defaultRegistryColumns(), rows: [] };
      const team = useMemo(() => getTeamUsers(), []);

      function patchRegistry(next) {
        onPatchPhase({
          registries: { ...phase.registries, [tool.id]: next },
        });
      }

      function setCell(rowId, colId, value) {
        patchRegistry({
          ...registry,
          rows: registry.rows.map((r) =>
            r.id === rowId ? { ...r, cells: { ...r.cells, [colId]: value } } : r,
          ),
        });
      }

      function addRow() {
        patchRegistry({ ...registry, rows: [...registry.rows, { id: uid(), cells: {} }] });
      }

      function removeRow(rowId) {
        patchRegistry({ ...registry, rows: registry.rows.filter((r) => r.id !== rowId) });
      }

      function addColumn(type) {
        const col = {
          id: uid(),
          name: REGISTRY_COLUMN_TYPES.find((c) => c.id === type)?.label || "Kolonna",
          type: type || "text",
          width: 140,
          ...(type === "status" || type === "choice" ? { options: [...STATUS_PRESETS] } : {}),
        };
        patchRegistry({ ...registry, columns: [...registry.columns, col] });
      }

      function renderCell(row, col) {
        const val = row.cells?.[col.id] ?? "";
        if (readOnly) {
          if (col.type === "status") return ce(StatusPill, { value: val });
          return html`<span>${String(val || "—")}</span>`;
        }
        if (col.type === "status" || col.type === "choice") {
          const opts = col.options?.length ? col.options : STATUS_PRESETS;
          return html`
            <select value=${String(val)} onChange=${(e) => setCell(row.id, col.id, e.target.value)}>
              <option value="">—</option>
              ${opts.map((o) => html`<option value=${o}>${o}</option>`)}
            </select>
          `;
        }
        if (col.type === "person") {
          return html`
            <select value=${String(val)} onChange=${(e) => setCell(row.id, col.id, e.target.value)}>
              <option value="">—</option>
              ${team.map((u) => {
                const em = personEmail(u);
                const lb = personLabel(u);
                return html`<option value=${em || lb}>${lb}</option>`;
              })}
            </select>
          `;
        }
        if (col.type === "date") {
          return html`
            <input type="date" value=${String(val).slice(0, 10)} onChange=${(e) => setCell(row.id, col.id, e.target.value)} />
          `;
        }
        return html`
          <input type="text" value=${String(val)} onChange=${(e) => setCell(row.id, col.id, e.target.value)} />
        `;
      }

      return html`
        <div class="pv-card">
          <h3>${tool.title}</h3>
          <p style=${{ margin: "0 0 0.75rem", fontSize: "0.84rem", color: "var(--pv-muted)" }}>${tool.description || ""}</p>
          ${!readOnly
            ? html`
                <div class="pv-toolbar">
                  <button type="button" class="pv-btn primary" onClick=${addRow}>+ Jauns ieraksts</button>
                  <select
                    class="pv-btn"
                    onChange=${(e) => {
                      const t = e.target.value;
                      if (t) addColumn(t);
                      e.target.value = "";
                    }}
                  >
                    <option value="">+ Kolonna…</option>
                    ${REGISTRY_COLUMN_TYPES.map((c) => html`<option value=${c.id}>${c.label}</option>`)}
                  </select>
                </div>
              `
            : null}
          <div class="pv-table-wrap">
            <table class="pv-table">
              <thead>
                <tr>
                  ${registry.columns.map(
                    (c) => html`
                      <th>
                        ${readOnly
                          ? c.name
                          : html`
                              <input
                                value=${c.name}
                                onChange=${(e) =>
                                  patchRegistry({
                                    ...registry,
                                    columns: registry.columns.map((x) =>
                                      x.id === c.id ? { ...x, name: e.target.value } : x,
                                    ),
                                  })}
                              />
                            `}
                      </th>
                    `,
                  )}
                  ${!readOnly ? html`<th></th>` : null}
                </tr>
              </thead>
              <tbody>
                ${registry.rows.length
                  ? registry.rows.map(
                      (row) => html`
                        <tr key=${row.id}>
                          ${registry.columns.map((c) => html`<td key=${c.id}>${renderCell(row, c)}</td>`)}
                          ${!readOnly
                            ? html`
                                <td>
                                  <button type="button" class="pv-link" style=${{ color: "#dc2626" }} onClick=${() => removeRow(row.id)}>
                                    Dzēst
                                  </button>
                                </td>
                              `
                            : null}
                        </tr>
                      `,
                    )
                  : html`
                      <tr>
                        <td colspan=${registry.columns.length + 1} class="pv-empty">Nav ierakstu — pievieno rindu</td>
                      </tr>
                    `}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    function GanttChart({ items, onGoPhase, onPatchPhase, title, subtitle }) {
      const list = Array.isArray(items) ? items : [];
      const range = ganttRange(list);
      const spanMs = Math.max(86400000, new Date(range.max).getTime() - new Date(range.min).getTime() + 86400000);

      function barStyle(phase) {
        const s = new Date(phase.start || range.min).getTime();
        const e = new Date(phase.end || phase.start || range.min).getTime();
        const left = ((s - new Date(range.min).getTime()) / spanMs) * 100;
        const width = Math.max(2, ((e - s + 86400000) / spanMs) * 100);
        const pr = Math.max(0, Math.min(100, Number(phase.progress) || 0));
        return { left: `${left}%`, width: `${width}%`, pr };
      }

      return html`
        <div class="pv-card">
          <h3>${title || "Gantt"}</h3>
          ${subtitle ? html`<p class="pv-gantt-subtitle">${subtitle}</p>` : null}
          <div class="pv-gantt-global">
            <div class="pv-gantt-head">
              <span>Posms</span>
              <span>${range.min} — ${range.max}</span>
              <span>%</span>
            </div>
            ${list.length
              ? list.map((p) => {
                  const st = barStyle(p);
                  return html`
                    <div class="pv-gantt-row ${p.depth ? "sub" : ""}" key=${p.id}>
                      <div class="pv-gantt-label">
                        ${onGoPhase ? ce(PhaseLink, { phase: p, onGo: onGoPhase }) : html`<span>${p.title}</span>`}
                      </div>
                      <div class="pv-gantt-track">
                        <div class="pv-gantt-bar" style=${{ left: st.left, width: st.width }}>
                          <div class="fill" style=${{ width: `${st.pr}%` }}></div>
                        </div>
                      </div>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value=${p.progress ?? 0}
                        style=${{ width: "56px", padding: "0.2rem", border: "1px solid #c5ebe3", borderRadius: "6px" }}
                        onChange=${(e) => onPatchPhase(p.id, { progress: Number(e.target.value) })}
                      />
                    </div>
                  `;
                })
              : html`<p class="pv-empty">Nav posmu šim Gantt skatam.</p>`}
          </div>
        </div>
      `;
    }

    function GlobalGantt({ phases, onGoPhase, onPatchPhase }) {
      return ce(GanttChart, {
        items: flattenPhases(phases),
        onGoPhase,
        onPatchPhase,
        title: "Kopējais Gantt — visa Procesu vadība",
        subtitle: "Visi galvenie posmi un apakšposmi vienā laika līnijā.",
      });
    }

    function PhaseGantt({ phase, phases, onGoPhase, onPatchPhase }) {
      const items = phaseGanttItems(phase, phases);
      const isRoot = phase && !phase.parentId;
      return ce(GanttChart, {
        items,
        onGoPhase,
        onPatchPhase,
        title: isRoot ? `Gantt — ${phase.title}` : `Gantt — apakšposms`,
        subtitle: isRoot
          ? "Šī posma un tā apakšposmu termiņi."
          : "Šī apakšposma laika līnija.",
      });
    }

    function PhaseEditForm({ phase, onPatch, onDelete, isSub }) {
      return html`
        <div class="pv-card">
          <h3>${isSub ? "Apakšposma labošana" : "Posma labošana"}</h3>
          <div class="pv-edit-grid">
            <label>
              Nosaukums
              <input
                type="text"
                value=${phase.title || ""}
                onInput=${(e) => onPatch({ title: e.target.value })}
              />
            </label>
            <label>
              Statuss
              <select value=${phase.status || ""} onChange=${(e) => onPatch({ status: e.target.value })}>
                ${STATUS_PRESETS.map((s) => html`<option value=${s}>${s}</option>`)}
              </select>
            </label>
            <label>
              Sākums
              <input
                type="date"
                value=${String(phase.start || "").slice(0, 10)}
                onChange=${(e) => onPatch({ start: e.target.value })}
              />
            </label>
            <label>
              Beigas
              <input
                type="date"
                value=${String(phase.end || "").slice(0, 10)}
                onChange=${(e) => onPatch({ end: e.target.value })}
              />
            </label>
            <label>
              Progress (%)
              <input
                type="number"
                min="0"
                max="100"
                value=${phase.progress ?? 0}
                onChange=${(e) => onPatch({ progress: Number(e.target.value) })}
              />
            </label>
            <label style=${{ gridColumn: "1 / -1" }}>
              Apraksts
              <textarea
                value=${phase.description || ""}
                onInput=${(e) => onPatch({ description: e.target.value })}
              ></textarea>
            </label>
          </div>
          <div class="pv-edit-actions">
            <button type="button" class="pv-btn danger" onClick=${onDelete}>
              Dzēst ${isSub ? "apakšposmu" : "posmu un apakšposmus"}
            </button>
          </div>
        </div>
      `;
    }

    function OverviewScreen({ phases, onGoPhase, patchPhase, addPhase, deletePhase }) {
      const [newTitle, setNewTitle] = useState("");
      const [newParent, setNewParent] = useState("");
      const [newDesc, setNewDesc] = useState("");

      function submitAddPhase() {
        const title = String(newTitle || "").trim();
        if (!title) return;
        const parentId = newParent || null;
        const parentPhase = parentId ? phases.find((p) => p.id === parentId) : null;
        const id = addPhase({ title, parentId, description: newDesc, parentPhase });
        if (id) {
          setNewTitle("");
          setNewParent("");
          setNewDesc("");
        }
      }

      function confirmDelete(phase) {
        const isSub = Boolean(phase.parentId);
        const msg = isSub
          ? `Dzēst apakšposmu „${phase.title}"?`
          : `Dzēst posmu „${phase.title}" un visus tā apakšposmus?`;
        if (typeof confirm === "function" && !confirm(msg)) return;
        deletePhase(phase.id);
      }

      const roots = phases.filter((p) => !p.parentId);

      return html`
        <div>
          <div class="pv-topbar">
            <div>
              <h1>Pārskats</h1>
              <p class="sub">Kopējā bilde, posmu pārvaldība un laika plāns</p>
            </div>
          </div>

          ${ce(GlobalGantt, { phases, onGoPhase, onPatchPhase: patchPhase })}

          <div class="pv-card">
            <h3>Posmu saraksts</h3>
            <div class="pv-phase-list" style=${{ maxHeight: "none" }}>
              ${flattenPhases(phases).map((p) => html`
                <div class="pv-phase-row" key=${p.id}>
                  <button type="button" class="pv-phase-row-main" onClick=${() => onGoPhase(p.id)}>
                    <strong>${p.depth ? "↳ " : ""}${p.title}</strong>
                    <div class="meta">${p.start || "—"} — ${p.end || "—"} · ${p.progress ?? 0}% · ${p.status || "—"}</div>
                  </button>
                  <div class="pv-phase-row-actions">
                    <button type="button" class="pv-btn ghost" onClick=${() => onGoPhase(p.id)}>Labot</button>
                    <button type="button" class="pv-btn danger" onClick=${() => confirmDelete(p)}>Dzēst</button>
                  </div>
                </div>
              `)}
            </div>
          </div>

          <div class="pv-card">
            <h3>Jauns posms vai apakšposms</h3>
            <div class="pv-inline-form">
              <input
                type="text"
                placeholder="Nosaukums…"
                value=${newTitle}
                onInput=${(e) => setNewTitle(e.target.value)}
              />
              <select class="pv-btn" value=${newParent} onChange=${(e) => setNewParent(e.target.value)}>
                <option value="">Galvenais posms</option>
                ${roots.map((r) => html`<option value=${r.id}>Apakšposms: ${r.title}</option>`)}
              </select>
              <textarea
                placeholder="Īss apraksts (neobligāti)…"
                value=${newDesc}
                onInput=${(e) => setNewDesc(e.target.value)}
              ></textarea>
              <button type="button" class="pv-btn primary" onClick=${submitAddPhase}>+ Pievienot</button>
            </div>
          </div>
        </div>
      `;
    }

    function PhaseSpace({
      phase,
      phases,
      activeToolId,
      onGoOverview,
      onGoPhase,
      onSelectTool,
      patchPhase,
      addPhase,
      deletePhase,
    }) {
      if (!phase) return html`<div class="pv-empty">Posms nav atrasts</div>`;

      const [subTitle, setSubTitle] = useState("");
      const parent = phase.parentId ? phases.find((p) => p.id === phase.parentId) : null;
      const children = phaseChildren(phases, phase.id);
      const activeTool =
        phase.tools?.find((t) => t.id === activeToolId) || phase.tools?.[0] || null;
      const isRoot = !phase.parentId;

      function addRegistryTool() {
        const toolId = uid();
        const tool = {
          id: toolId,
          type: "registry",
          title: "Jauns apkopojums (Lists)",
          description: "Pārvalžu / daļu / darbu saraksts.",
        };
        patchPhase(phase.id, {
          tools: [...(phase.tools || []), tool],
          registries: {
            ...phase.registries,
            [toolId]: { columns: defaultRegistryColumns(), rows: [{ id: uid(), cells: {} }] },
          },
        });
        onSelectTool(toolId);
      }

      function submitSubPhase() {
        const title = String(subTitle || "").trim();
        if (!title || !isRoot) return;
        addPhase({ title, parentId: phase.id, parentPhase: phase, open: true });
        setSubTitle("");
      }

      function confirmDelete() {
        const msg = isRoot
          ? `Dzēst posmu „${phase.title}" un visus apakšposmus?`
          : `Dzēst apakšposmu „${phase.title}"?`;
        if (typeof confirm === "function" && !confirm(msg)) return;
        deletePhase(phase.id);
      }

      function confirmDeleteChild(child) {
        const msg = `Dzēst apakšposmu „${child.title}"?`;
        if (typeof confirm === "function" && !confirm(msg)) return;
        deletePhase(child.id);
      }

      return html`
        <div>
          <nav class="pv-breadcrumb" aria-label="Navigācija">
            <button type="button" class="pv-link" onClick=${onGoOverview}>Procesu vadība</button>
            <span>›</span>
            ${parent ? ce(PhaseLink, { phase: parent, onGo: onGoPhase }) : null}
            ${parent ? html`<span>›</span>` : null}
            <span><strong>${phase.title}</strong></span>
          </nav>

          ${ce(PhaseEditForm, {
            phase,
            isSub: !isRoot,
            onPatch: (patch) => patchPhase(phase.id, patch),
            onDelete: confirmDelete,
          })}

          ${ce(PhaseGantt, { phase, phases, onGoPhase, onPatchPhase: patchPhase })}

          ${isRoot
            ? html`
                <div class="pv-card">
                  <h3>Apakšposmi</h3>
                  ${children.length
                    ? children.map(
                        (c) => html`
                          <div class="pv-phase-row" key=${c.id}>
                            <button type="button" class="pv-phase-row-main" onClick=${() => onGoPhase(c.id)}>
                              <strong>${c.title}</strong>
                              <div class="meta">${c.start || "—"} — ${c.end || "—"} · ${c.progress ?? 0}% · ${c.status || "—"}</div>
                            </button>
                            <div class="pv-phase-row-actions">
                              <button type="button" class="pv-btn ghost" onClick=${() => onGoPhase(c.id)}>Labot</button>
                              <button type="button" class="pv-btn danger" onClick=${() => confirmDeleteChild(c)}>Dzēst</button>
                            </div>
                          </div>
                        `,
                      )
                    : html`<p class="pv-empty" style=${{ padding: "0.5rem" }}>Vēl nav apakšposmu.</p>`}
                  <div class="pv-inline-form" style=${{ marginTop: "0.65rem" }}>
                    <input
                      type="text"
                      placeholder="Jauna apakšposma nosaukums…"
                      value=${subTitle}
                      onInput=${(e) => setSubTitle(e.target.value)}
                    />
                    <button type="button" class="pv-btn primary" onClick=${submitSubPhase}>+ Pievienot apakšposmu</button>
                  </div>
                </div>
              `
            : null}

          <div class="pv-card">
            <h3>Posma rīki</h3>
            <div class="pv-tools-grid">
              ${(phase.tools || []).length
                ? phase.tools.map(
                    (t) => html`
                      <div class="pv-tool-card" key=${t.id}>
                        <div>
                          <h4>${t.title}</h4>
                          <p>${t.description || "Lists tipa saraksts"}</p>
                        </div>
                        <button type="button" class="pv-btn" onClick=${() => onSelectTool(t.id)}>Atvērt</button>
                      </div>
                    `,
                  )
                : html`<p class="pv-empty" style=${{ padding: "0.5rem" }}>Šim posmam vēl nav rīku.</p>`}
            </div>
            ${isRoot
              ? html`
                  <button type="button" class="pv-btn primary" style=${{ marginTop: "0.65rem" }} onClick=${addRegistryTool}>
                    + Pievienot apkopojuma sarakstu (Lists)
                  </button>
                `
              : null}
          </div>

          ${activeTool
            ? ce(RegistryList, {
                phase,
                tool: activeTool,
                readOnly: false,
                onPatchPhase: (patch) => patchPhase(phase.id, patch),
              })
            : null}
        </div>
      `;
    }

    return function ProcesuVadibaPanel() {
      const [state, setState, syncStatus] = usePersistedState();

      useEffect(() => {
        console.info("[Procesu vadība] panelis atvērts");
      }, []);

      const syncLabel =
        syncStatus === "synced"
          ? "Sinhronizēts ar Supabase"
          : syncStatus === "saving"
            ? "Saglabā Supabase…"
            : syncStatus === "error"
              ? "DB kļūda — dati lokāli"
              : "Tikai lokāli";

      const phases = state.phases || [];
      const activePhase = useMemo(
        () => phases.find((p) => p.id === state.activePhaseId) || null,
        [phases, state.activePhaseId],
      );

      const goOverview = useCallback(() => {
        setState((p) => ({ ...p, screen: "overview", activePhaseId: null, activeToolId: null }));
      }, [setState]);

      const goPhase = useCallback(
        (phaseId, toolId) => {
          setState((p) => {
            const ph = p.phases.find((x) => x.id === phaseId);
            const defaultTool = toolId ?? ph?.tools?.[0]?.id ?? null;
            return {
              ...p,
              screen: "phase",
              activePhaseId: phaseId,
              activeToolId: defaultTool,
            };
          });
        },
        [setState],
      );

      const patchPhase = useCallback(
        (phaseId, patch) => {
          setState((prev) => ({
            ...prev,
            phases: prev.phases.map((p) => (p.id === phaseId ? { ...p, ...patch } : p)),
          }));
        },
        [setState],
      );

      const addPhase = useCallback(
        ({ title, parentId, description, parentPhase, open = true }) => {
          const trimmed = String(title || "").trim();
          if (!trimmed) return null;
          const phase = buildNewPhase({
            title: trimmed,
            parentId: parentId || null,
            phases,
            parentPhase: parentPhase || null,
          });
          if (description) phase.description = String(description).trim();
          setState((prev) => ({
            ...prev,
            phases: [...prev.phases, phase],
            screen: open ? "phase" : prev.screen,
            activePhaseId: open ? phase.id : prev.activePhaseId,
            activeToolId: open ? phase.tools[0]?.id ?? null : prev.activeToolId,
          }));
          return phase.id;
        },
        [phases, setState],
      );

      const deletePhase = useCallback(
        (phaseId) => {
          setState((prev) => {
            const doomed = collectDescendantIds(prev.phases, phaseId);
            const nextPhases = deletePhaseFromList(prev.phases, phaseId);
            const lostActive = prev.activePhaseId && doomed.has(prev.activePhaseId);
            return {
              ...prev,
              phases: nextPhases,
              screen: lostActive ? "overview" : prev.screen,
              activePhaseId: lostActive ? null : prev.activePhaseId,
              activeToolId: lostActive ? null : prev.activeToolId,
            };
          });
        },
        [setState],
      );

      const flat = flattenPhases(phases);

      return html`
        <div class="pv-root">
          <div class="pv-shell">
            <aside class="pv-sidebar">
              <div class="pv-brand">
                <h2>Procesu vadība</h2>
                <p>Posmi · Gantt · pārvalžu apkopojums</p>
                <p style=${{ margin: "0.35rem 0 0", fontSize: "0.72rem", opacity: 0.9 }}>${syncLabel}</p>
              </div>
              <button
                type="button"
                class=${`pv-nav-btn ${state.screen === "overview" ? "active" : ""}`}
                onClick=${goOverview}
              >
                📊 Pārskats un Gantt
              </button>
              <div class="pv-phase-list">
                ${flat.map(
                  (p) => html`
                    <button
                      type="button"
                      key=${p.id}
                      class=${`pv-phase-item ${p.depth ? "sub" : ""} ${state.activePhaseId === p.id ? "active" : ""}`}
                      onClick=${() => goPhase(p.id)}
                    >
                      <div>
                        <strong>${p.depth ? "↳ " : ""}${p.title}</strong>
                        <div class="meta">${p.progress ?? 0}%</div>
                      </div>
                    </button>
                  `,
                )}
              </div>
              <button type="button" class="pv-add-btn" onClick=${goOverview}>+ Jauns posms</button>
            </aside>
            <main class="pv-main">
              ${state.screen === "overview"
                ? ce(OverviewScreen, {
                    phases,
                    onGoPhase: goPhase,
                    patchPhase,
                    addPhase,
                    deletePhase,
                  })
                : ce(PhaseSpace, {
                    phase: activePhase,
                    phases,
                    activeToolId: state.activeToolId,
                    onGoOverview: goOverview,
                    onGoPhase: goPhase,
                    onSelectTool: (toolId) => setState((p) => ({ ...p, activeToolId: toolId })),
                    patchPhase,
                    addPhase,
                    deletePhase,
                  })}
            </main>
          </div>
        </div>
      `;
    };
  }

  root.PDD_PROCESU_VADIBA = {
    createProcesuVadibaModule,
    loadState,
    saveState,
    fetchRemoteState,
    saveRemoteState,
    resetState() {
      if (typeof localStorage !== "undefined") localStorage.removeItem(LS_KEY);
      return defaultState();
    },
    READY: true,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
