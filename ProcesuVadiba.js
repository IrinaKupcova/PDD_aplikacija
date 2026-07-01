/**
 * Procesu vadība — uzdevumi, posmi, apakšposmi, Gantt, Lists reģistri.
 * Eksports: globalThis.PDD_PROCESU_VADIBA.createProcesuVadibaModule(html, React)
 */
(function (root) {
  const LS_KEY = "pdd_procesu_vadiba_v2";
  const MODULE_VERSION = 8;
  const GANTT_CHART_LABEL = "Gantt Chart";
  const GANTT_CHART_SUBLABEL = "Laika grafiks";
  const REMOTE_TABLE = "Procesu_vadibas_modulis";
  const REMOTE_TABLE_LEGACY = "Procesu_vadiba";
  const REMOTE_HISTORY_TABLE = "Procesu_vadibas_vesture";
  const REMOTE_ROW_ID = "main";
  const REMOTE_SAVE_MS = 700;
  const REMOTE_POLL_MS = 20000;
  const REMOTE_HISTORY_LIMIT = 40;
  const REMOTE_SYNC_ENABLED = true;
  const WORKPLAN_COL_TYPE = "workplan";
  const EXECUTION_INFO_LABEL = "Informācija par izpildi";
  const PDD_SB_URL = "https://fdnkvecgqetmwilwolgt.supabase.co";
  const PDD_SB_ANON_KEY = "sb_publishable_wPrwQc6F0QVlnAubnhamJw_RuxtvtGo";
  const PDD_SB_LS_URL = "pdd_supabase_url";
  const PDD_SB_LS_KEY = "pdd_supabase_anon_key";

  const STATUS_PRESETS = ["Nav sākts", "Plānots", "Procesā", "Gaida atbildi", "Pabeigts", "Atcelts"];
  const REGISTRY_COLUMN_TYPES = [
    { id: "text", label: "Teksts" },
    { id: "date", label: "Datums" },
    { id: "choice", label: "Izvēlne" },
    { id: "status", label: "Statuss" },
    { id: "person", label: "Persona" },
  ];

  const TABLE_COLUMN_TYPES = [
    { id: "text", label: "Vienas rindas teksts" },
    { id: "multiline", label: "Vairākrindu teksts" },
    { id: "number", label: "Skaitlis" },
    { id: "date", label: "Datums" },
    { id: "choice", label: "Izvēlne" },
    { id: "status", label: "Statuss" },
    { id: "person", label: "Persona" },
    { id: "yesno", label: "Jā/Nē" },
  ];

  function uid() {
    return typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `pv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function askConfirm(message) {
    if (typeof confirm !== "function") return true;
    return confirm(message);
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

  function getSupabaseConfig() {
    const url = String(
      (typeof localStorage !== "undefined" && localStorage.getItem(PDD_SB_LS_URL)) || PDD_SB_URL || "",
    )
      .trim()
      .replace(/\/+$/, "");
    const key = String(
      (typeof localStorage !== "undefined" && localStorage.getItem(PDD_SB_LS_KEY)) || PDD_SB_ANON_KEY || "",
    )
      .trim()
      .replace(/\s+/g, "");
    if (!url || !key || url.includes("YOUR_PROJECT") || key.includes("YOUR_ANON")) return null;
    return { url, key };
  }

  function createSupabaseClient(cfg) {
    if (!cfg) return null;
    const lib = root.supabase;
    if (lib?.createClient) return lib.createClient(cfg.url, cfg.key);
    return null;
  }

  let ensureSupabasePromise = null;

  async function ensureSupabaseClient() {
    if (root.__PDD_SUPABASE__) return root.__PDD_SUPABASE__;
    if (!ensureSupabasePromise) {
      ensureSupabasePromise = (async () => {
        const cfg = getSupabaseConfig();
        const sb = createSupabaseClient(cfg);
        if (!sb) return null;
        root.__PDD_SUPABASE__ = sb;
        if (typeof root.__PDD_ENSURE_DB_SESSION__ !== "function") {
          root.__PDD_ENSURE_DB_SESSION__ = async () => {
            try {
              const { data } = await sb.auth.getSession();
              if (data?.session?.access_token) return true;
              const { error } = await sb.auth.signInAnonymously();
              if (error) console.warn("[Procesu vadība] anon auth", error);
            } catch (e) {
              console.warn("[Procesu vadība] DB sesija", e);
            }
            return true;
          };
        }
        try {
          await root.__PDD_ENSURE_DB_SESSION__();
        } catch {
          /* ignore */
        }
        return sb;
      })().finally(() => {
        ensureSupabasePromise = null;
      });
    }
    return ensureSupabasePromise;
  }

  function actorEmailForSync() {
    return (
      String(
        root.__PDD_SESSION_EMAIL__ ||
          root.__PDD_ACTOR_EMAIL__ ||
          root.sessionStorage?.getItem?.("pdd_local_email") ||
          "",
      ).trim() || null
    );
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

  async function readRemoteRow(sb, table) {
    const { data, error } = await sb
      .from(table)
      .select("state, updated_at, updated_by")
      .eq("id", REMOTE_ROW_ID)
      .maybeSingle();
    if (error) {
      console.warn(`[Procesu vadība] DB lasīšana (${table})`, error);
      return null;
    }
    return data;
  }

  async function fetchRemoteState(sb) {
    if (!REMOTE_SYNC_ENABLED || !sb) return null;
    await ensureDbSession(sb);
    let data = await readRemoteRow(sb, REMOTE_TABLE);
    if (!data?.state || typeof data.state !== "object") {
      const legacy = await readRemoteRow(sb, REMOTE_TABLE_LEGACY);
      if (legacy?.state && typeof legacy.state === "object") data = legacy;
      else return null;
    }
    const hasPhases = Array.isArray(data.state.phases) && data.state.phases.length > 0;
    if (!hasPhases) return null;
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
    const email = actorEmailForSync();
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

  function formatPvDateTime(iso) {
    const d = new Date(iso || "");
    if (Number.isNaN(d.getTime())) return "—";
    try {
      return d.toLocaleString("lv-LV", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return String(iso || "—");
    }
  }

  function historyActionLabel(action) {
    return action === "restore" ? "Atjaunošana" : "Saglabāts";
  }

  async function fetchRemoteHistory(sb, limit = REMOTE_HISTORY_LIMIT) {
    if (!REMOTE_SYNC_ENABLED || !sb) return [];
    await ensureDbSession(sb);
    const { data, error } = await sb
      .from(REMOTE_HISTORY_TABLE)
      .select("id, saved_at, saved_by, action")
      .eq("module_id", REMOTE_ROW_ID)
      .order("saved_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.warn("[Procesu vadība] vēstures lasīšana", error);
      return [];
    }
    return Array.isArray(data) ? data : [];
  }

  async function restoreRemoteHistory(sb, historyId) {
    if (!REMOTE_SYNC_ENABLED || !sb || !historyId) return { ok: false, reason: "no_data" };
    await ensureDbSession(sb);
    const { error } = await sb.rpc("pdd_procesu_vadiba_atjaunot", { p_history_id: historyId });
    if (error) {
      console.warn("[Procesu vadība] atjaunošana", error);
      return { ok: false, error };
    }
    const state = await fetchRemoteState(sb);
    if (!state) return { ok: false, reason: "no_state" };
    return { ok: true, state };
  }

  function defaultRegistryColumns() {
    return [
      { id: uid(), name: "Pārvalde", type: "text", width: 160 },
      { id: uid(), name: "Daļa / struktūrvienība", type: "text", width: 180 },
      { id: uid(), name: "Kontaktpersona", type: "person", width: 150 },
      { id: uid(), name: "Darba virziens", type: "text", width: 200 },
      { id: uid(), name: "Statuss", type: "status", width: 120, options: [...STATUS_PRESETS] },
      { id: uid(), name: "Termiņš", type: "date", width: 120 },
      { id: uid(), name: "Piezīmes", type: "text", width: 320 },
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
      overviewBlocks: [],
      workPlanSections: [],
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
          workPlanTaskId: null,
          blocks: [],
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
          title: "Sagatavošana un vajadzību apkopošana",
          description: "Identificēt pārvaldes, kontaktpersonas un sākotnējās prasības.",
          start: t0,
          end: addDays(t0, 30),
          progress: 25,
          status: "Procesā",
          workPlanTaskId: null,
          blocks: [],
          tools: [],
          registries: {},
        },
        {
          id: sub2,
          parentId: phaseId,
          order: 1,
          title: "Koncepta izstrāde un saskaņošana",
          description: "Koncepta dokumenta izstrāde un saskaņošana ar pārvaldēm.",
          start: addDays(t0, 31),
          end: addDays(t0, 90),
          progress: 5,
          status: "Plānots",
          workPlanTaskId: null,
          blocks: [],
          tools: [],
          registries: {},
        },
      ],
    };
  }

  function migrateState(s) {
    if (!s || !Array.isArray(s.phases) || s.phases.length === 0) {
      return defaultState();
    }
    for (const p of s.phases) {
      p.tools = Array.isArray(p.tools) ? p.tools : [];
      p.registries = p.registries && typeof p.registries === "object" ? p.registries : {};
      p.blocks = Array.isArray(p.blocks) ? p.blocks : [];
      if (p.workPlanTaskId === undefined) p.workPlanTaskId = null;
    }
    s.overviewBlocks = Array.isArray(s.overviewBlocks) ? s.overviewBlocks : [];
    s.workPlanSections = tidyWorkPlanSections(s.workPlanSections);
    s.phases = migratePhasesTableBlocks(s.phases);
    if (s.screen !== "overview" && s.screen !== "phase" && s.screen !== "workplan" && s.screen !== "history") {
      s.screen = "overview";
    }
    if (s.screen === "phase" && s.activePhaseId && !s.phases.some((p) => p.id === s.activePhaseId)) {
      s.screen = "overview";
      s.activePhaseId = null;
      s.activeToolId = null;
    }
    s.version = MODULE_VERSION;
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
    return flattenPhasesWithNumbers(phases).map(({ depth, num, kind, ...p }) => ({ ...p, depth, num, kind }));
  }

  function flattenPhasesWithNumbers(phases) {
    const list = Array.isArray(phases) ? phases : [];
    const roots = list.filter((p) => !p.parentId).sort((a, b) => a.order - b.order);
    const out = [];
    let taskNum = 0;
    const withProgress = (p, depth, kind, num) => {
      const meta = phaseProgressMeta(list, p.id);
      return { ...p, depth, kind, num, progress: meta.progress, progressManual: meta.progressManual };
    };
    for (const root of roots) {
      taskNum += 1;
      out.push(withProgress(root, 0, "Uzdevums", String(taskNum)));
      const posmi = list.filter((p) => p.parentId === root.id).sort((a, b) => a.order - b.order);
      posmi.forEach((posm, pi) => {
        out.push(withProgress(posm, 1, "Posms", `${taskNum}.${pi + 1}`));
        const subs = list.filter((p) => p.parentId === posm.id).sort((a, b) => a.order - b.order);
        subs.forEach((sub, si) => {
          out.push(withProgress(sub, 2, "Apakšposms", `${taskNum}.${pi + 1}.${si + 1}`));
        });
      });
    }
    return out;
  }

  function parsePhaseNumberParts(numStr) {
    return String(numStr || "")
      .trim()
      .split(".")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n >= 1);
  }

  function phaseNumberHint(depth) {
    if (depth === 0) return "1, 2, 3…";
    if (depth === 1) return "1.1, 1.2, 2.1…";
    return "1.1.1, 1.2.3…";
  }

  function validatePhaseNumber(numStr, depth, phases) {
    const parts = parsePhaseNumberParts(numStr);
    if (!parts.length) return { ok: false, reason: "Norādi numuru." };
    if (parts.length !== depth + 1) {
      return { ok: false, reason: `Formāts: ${phaseNumberHint(depth)}` };
    }
    const roots = phases.filter((p) => !p.parentId).sort((a, b) => a.order - b.order);
    if (depth >= 1) {
      if (parts[0] < 1 || parts[0] > roots.length) {
        return { ok: false, reason: `Nav uzdevuma Nr. ${parts[0]}.` };
      }
      const root = roots[parts[0] - 1];
      const posmi = phases.filter((p) => p.parentId === root.id);
      if (depth === 1) {
        if (parts[1] < 1 || parts[1] > Math.max(posmi.length, 1)) {
          return { ok: false, reason: `Posma numurs 1–${Math.max(posmi.length, 1)} šim uzdevumam.` };
        }
      } else {
        const posm = posmi.sort((a, b) => a.order - b.order)[parts[1] - 1];
        if (!posm) return { ok: false, reason: `Nav posma Nr. ${parts[0]}.${parts[1]}.` };
        const subs = phases.filter((p) => p.parentId === posm.id);
        if (parts[2] < 1 || parts[2] > Math.max(subs.length, 1)) {
          return { ok: false, reason: `Apakšposma numurs 1–${Math.max(subs.length, 1)}.` };
        }
      }
    } else if (parts[0] < 1 || parts[0] > Math.max(roots.length, 1)) {
      return { ok: false, reason: `Uzdevuma numurs 1–${Math.max(roots.length, 1)}.` };
    }
    return { ok: true, parts };
  }

  function normalizeSiblingOrders(phases, parentId, excludeId) {
    const pid = parentId ?? null;
    const sibs = phases
      .filter((p) => (p.parentId ?? null) === pid && p.id !== excludeId)
      .sort((a, b) => a.order - b.order);
    const orderMap = new Map(sibs.map((s, i) => [s.id, i]));
    return phases.map((p) => (orderMap.has(p.id) ? { ...p, order: orderMap.get(p.id) } : p));
  }

  function insertAtSiblingIndex(phases, parentId, movedId, insertIndex) {
    const pid = parentId ?? null;
    const sibs = phases.filter((p) => (p.parentId ?? null) === pid).sort((a, b) => a.order - b.order);
    const moving = sibs.find((s) => s.id === movedId);
    if (!moving) return phases;
    const rest = sibs.filter((s) => s.id !== movedId);
    const idx = Math.min(Math.max(0, insertIndex), rest.length);
    rest.splice(idx, 0, moving);
    const orderMap = new Map(rest.map((s, i) => [s.id, i]));
    return phases.map((p) => (orderMap.has(p.id) ? { ...p, order: orderMap.get(p.id) } : p));
  }

  function repositionPhaseByNumber(phaseId, numStr, phases) {
    const flat = flattenPhasesWithNumbers(phases);
    const meta = flat.find((p) => p.id === phaseId);
    if (!meta) return phases;
    const check = validatePhaseNumber(numStr, meta.depth, phases);
    if (!check.ok) return phases;

    const depth = meta.depth;
    const parts = check.parts;
    const roots = phases.filter((p) => !p.parentId).sort((a, b) => a.order - b.order);
    let targetParentId = null;
    let insertIndex = 0;

    if (depth === 0) {
      insertIndex = parts[0] - 1;
    } else if (depth === 1) {
      targetParentId = roots[parts[0] - 1].id;
      insertIndex = parts[1] - 1;
    } else {
      const posm = phases
        .filter((p) => p.parentId === roots[parts[0] - 1].id)
        .sort((a, b) => a.order - b.order)[parts[1] - 1];
      targetParentId = posm.id;
      insertIndex = parts[2] - 1;
    }

    const phase = phases.find((p) => p.id === phaseId);
    if (!phase) return phases;
    const oldParent = phase.parentId ?? null;
    const newParent = depth === 0 ? null : targetParentId;

    let next = phases.map((p) => (p.id === phaseId ? { ...p, parentId: newParent } : p));
    if (oldParent !== newParent) {
      next = normalizeSiblingOrders(next, oldParent, phaseId);
    }
    next = insertAtSiblingIndex(next, newParent, phaseId, insertIndex);
    return next;
  }

  function ganttChartPlainSuffix() {
    return ` (${GANTT_CHART_SUBLABEL})`;
  }

  function ganttChartInText(text) {
    const s = String(text ?? "");
    if (!s.includes(GANTT_CHART_LABEL)) return s;
    return s.replaceAll(GANTT_CHART_LABEL, `${GANTT_CHART_LABEL}${ganttChartPlainSuffix()}`);
  }

  function ensureWorkPlanSections(sections) {
    if (!Array.isArray(sections)) return [];
    return sections.map((sec) => ({
      id: sec?.id || uid(),
      title: sec?.title === undefined || sec?.title === null ? "Jauna apakšsadaļa" : String(sec.title),
      tasks: Array.isArray(sec?.tasks)
        ? sec.tasks.map((t) => ({
            id: t?.id || uid(),
            title: t?.title === undefined || t?.title === null ? "Jauns uzdevums" : String(t.title),
          }))
        : [],
    }));
  }

  function tidyWorkPlanSections(sections) {
    return ensureWorkPlanSections(sections).map((sec) => ({
      ...sec,
      title: String(sec.title).trim() || "Jauna apakšsadaļa",
      tasks: sec.tasks.map((t) => ({
        ...t,
        title: String(t.title).trim() || "Jauns uzdevums",
      })),
    }));
  }

  function normalizeWorkPlanSections(sections) {
    return ensureWorkPlanSections(sections);
  }

  function workPlanTaskLabel(sections, taskId) {
    if (!taskId) return "";
    for (const sec of ensureWorkPlanSections(sections)) {
      const t = sec.tasks.find((x) => x.id === taskId);
      if (t) {
        const secTitle = String(sec.title).trim() || sec.title;
        const taskTitle = String(t.title).trim() || t.title;
        return `${secTitle}: ${taskTitle}`;
      }
    }
    return "";
  }

  function collectWorkPlanTaskIds(sections) {
    const ids = [];
    for (const sec of ensureWorkPlanSections(sections)) {
      for (const t of sec.tasks || []) ids.push(t.id);
    }
    return ids;
  }

  function isWorkPlanColumn(col) {
    return col?.type === WORKPLAN_COL_TYPE;
  }

  function tableColumnTypeLabel(type) {
    if (isWorkPlanColumn({ type })) return "Darba plāna uzdevums";
    return TABLE_COLUMN_TYPES.find((t) => t.id === type)?.label || REGISTRY_COLUMN_TYPES.find((t) => t.id === type)?.label || "Teksts";
  }

  function defaultOptionsForColumnType(type) {
    if (type === "status") return [...STATUS_PRESETS];
    return [];
  }

  function parseColumnOptions(str) {
    return String(str || "")
      .split(/[;|]/)
      .filter((s) => s.length > 0);
  }

  function columnOptionsForCell(col) {
    const opts = col?.options;
    if (!Array.isArray(opts)) return col?.type === "status" ? [...STATUS_PRESETS] : [];
    return opts.filter((o) => String(o).length > 0);
  }

  function tableColumnDisplayName(name, type) {
    if (name !== undefined && name !== null && String(name).length > 0) return String(name);
    return tableColumnTypeLabel(type);
  }

  function statusToneKey(value) {
    const v = String(value ?? "").trim().toLowerCase();
    if (!v || v === "—") return "none";
    if (/pabeigts|pabeigta|done|completed/i.test(v)) return "done";
    if (/atcelts|cancel/i.test(v)) return "cancelled";
    if (/procesā|process|notiek/i.test(v)) return "active";
    if (/gaida|atbildi/i.test(v)) return "wait";
    if (/plānots|plan/i.test(v)) return "planned";
    if (/nav sākts|nesākts|not started/i.test(v)) return "todo";
    return "default";
  }

  function statusRowClass(value) {
    return `pv-row-tone-${statusToneKey(value)}`;
  }

  function statusCellClass(col, value) {
    if (col?.type !== "status" && !/^statuss$/i.test(String(col?.name || "").trim())) return "";
    const tone = statusToneKey(value);
    return tone === "none" ? "pv-status-cell pv-cell-tone-none" : `pv-status-cell pv-cell-tone-${tone}`;
  }

  function tableCellClasses(col, value) {
    return [tableColumnClass(col), statusCellClass(col, value)].filter(Boolean).join(" ");
  }

  function statusPillClass(value) {
    const map = {
      done: "done",
      active: "work",
      wait: "wait",
      planned: "planned",
      todo: "notstarted",
      cancelled: "cancelled",
      none: "muted",
      default: "wait",
    };
    return map[statusToneKey(value)] || "wait";
  }

  function findStatusColumn(columns) {
    const list = columns || [];
    return (
      list.find((c) => c.type === "status") ||
      list.find((c) => /^statuss$/i.test(String(c.name || "").trim())) ||
      null
    );
  }

  function tableRowStatusClass(row, columns) {
    const statusCol = findStatusColumn(columns);
    if (!statusCol) return "pv-row-tone-none";
    return statusRowClass(row?.cells?.[statusCol.id] ?? "");
  }

  function isNotesColumn(col) {
    return /^piezīmes$/i.test(String(col?.name || "").trim());
  }

  function tableColumnStyle(col) {
    const w = Number(col?.width) || 140;
    const notes = isNotesColumn(col);
    const minW = notes ? Math.max(w, 320) : w > 140 ? w : 0;
    if (!minW) return null;
    return { minWidth: `${minW}px`, width: notes ? `${minW}px` : undefined };
  }

  function tableColumnClass(col) {
    return isNotesColumn(col) ? "pv-col-notes" : "";
  }

  function changeColumnType(col, newType) {
    const prev = migrateTableColumn(col) || col;
    const t = newType || "text";
    return migrateTableColumn({
      id: prev.id,
      name: prev.name,
      type: t,
      width: prev.width,
      options:
        t === "status" || t === "choice"
          ? prev.type === t && Array.isArray(prev.options)
            ? prev.options
            : defaultOptionsForColumnType(t)
          : undefined,
    });
  }

  function migrateTableColumn(col) {
    if (!col || !col.id) return null;
    if (isWorkPlanColumn(col)) return null;
    const type = col.type || "text";
    const out = {
      id: col.id,
      name: tableColumnDisplayName(col.name, type),
      type,
      width: Number(col.width) || 140,
    };
    if (type === "status" || type === "choice") {
      out.options = Array.isArray(col.options)
        ? col.options.map((o) => String(o))
        : defaultOptionsForColumnType(type);
    }
    if (isNotesColumn(out)) out.width = Math.max(Number(out.width) || 0, 320);
    return out;
  }

  function reorderTableColumns(columns, colId, delta) {
    const cols = [...(columns || [])];
    const idx = cols.findIndex((c) => c.id === colId);
    if (idx < 0) return columns;
    const target = idx + delta;
    if (target < 0 || target >= cols.length) return columns;
    const [item] = cols.splice(idx, 1);
    cols.splice(target, 0, item);
    return cols;
  }

  function reorderTableRows(rows, rowId, delta) {
    const list = [...(rows || [])];
    const idx = list.findIndex((r) => r.id === rowId);
    if (idx < 0) return rows;
    const target = idx + delta;
    if (target < 0 || target >= list.length) return rows;
    const [item] = list.splice(idx, 1);
    list.splice(target, 0, item);
    return list;
  }

  function createTableColumn(type) {
    const t = type || "text";
    const label = tableColumnTypeLabel(t);
    return migrateTableColumn({
      id: uid(),
      name: label,
      type: t,
      options: t === "choice" ? [] : defaultOptionsForColumnType(t),
    });
  }

  function formatTableCellDisplay(val, col, workPlanSections, teamUsers) {
    const raw = val ?? "";
    if (isWorkPlanColumn(col)) return workPlanCellLabel(workPlanSections, raw) || "—";
    const type = col?.type || "text";
    if (type === "status") return { kind: "status", value: raw };
    if (type === "yesno") {
      if (raw === true || raw === "true" || raw === "1" || /^jā$/i.test(String(raw))) return "Jā";
      if (raw === false || raw === "false" || raw === "0" || /^nē$/i.test(String(raw))) return "Nē";
      return "—";
    }
    if (type === "person") {
      const s = String(raw).trim();
      if (!s) return "—";
      const u = (teamUsers || []).find((x) => personEmail(x) === s || personLabel(x) === s);
      return u ? personLabel(u) : s;
    }
    if (type === "date") {
      const d = String(raw).slice(0, 10);
      return d || "—";
    }
    if (type === "multiline") {
      const text = String(raw);
      return text ? { kind: "multiline", value: text } : "—";
    }
    return String(raw) || "—";
  }

  function normalizeTableBlock(block) {
    if (!block || block.type !== "table") return block;
    const cols = Array.isArray(block.columns) ? block.columns.map((c) => migrateTableColumn(c)).filter(Boolean) : [];
    const nextCols = cols.length ? cols : [createTableColumn("text")];
    return { ...block, columns: nextCols };
  }

  function ensureTableWorkPlanColumn(block) {
    return normalizeTableBlock(block);
  }

  function migratePhasesTableBlocks(phases) {
    return (Array.isArray(phases) ? phases : []).map((p) => ({
      ...p,
      blocks: (p.blocks || []).map((b) => (b.type === "table" ? normalizeTableBlock(b) : b)),
    }));
  }

  function executionBucket(item, asOf) {
    const asOfD = String(asOf || todayIso()).slice(0, 10);
    const status = String(item?.status || "").trim();
    const progress = Number(item?.progress ?? 0);
    const start = String(item?.start || "").slice(0, 10);

    if (/pabeigts/i.test(status) || progress >= 100) return "Izdarīts";
    if (/atcelts/i.test(status)) return "Atcelts";
    if (/procesā|gaida atbildi/i.test(status)) return "Notiek";
    if (progress > 0 && progress < 100) return "Notiek";
    if (start && start <= asOfD && progress > 0) return "Notiek";
    if (/nav sākts/i.test(status)) return "Nav uzsākts";
    if (start && start > asOfD) return "Plānots";
    if (/plānots/i.test(status) || progress === 0) return "Plānots";
    return "Plānots";
  }

  function tableRowExecutionBucket(row, columns) {
    const statusCol = (columns || []).find(
      (c) => c.type === "status" || /status/i.test(String(c.name || "")),
    );
    const raw = statusCol ? String(row.cells?.[statusCol.id] ?? "").trim() : "";
    if (/pabeigts/i.test(raw)) return "Izdarīts";
    if (/procesā|notiek|darb/i.test(raw)) return "Notiek";
    if (/nav sākts/i.test(raw)) return "Nav uzsākts";
    if (/plānots/i.test(raw)) return "Plānots";
    const hasOther = (columns || []).some((c) => String(row.cells?.[c.id] ?? "").trim());
    return hasOther ? "Notiek" : "Plānots";
  }

  function executionInfoForExport(phase) {
    const parts = [];
    const phaseInfo = String(phase?.executionInfo || "").trim();
    if (phaseInfo) parts.push(phaseInfo);
    for (const b of phase?.blocks || []) {
      const blockInfo = String(b?.executionInfo || "").trim();
      if (!blockInfo) continue;
      const label = b.title || contentBlockTypeLabel(b.type);
      parts.push(`${label}: ${blockInfo}`);
    }
    return parts.join("\n");
  }

  function collectSectionReportRows(phases, sections, sectionId, asOf) {
    const section = ensureWorkPlanSections(sections).find((s) => s.id === sectionId);
    if (!section) return [];
    const taskIds = new Set((section.tasks || []).map((t) => t.id));
    const rows = [];
    for (const p of flattenPhasesWithNumbers(phases)) {
      if (p.workPlanTaskId && taskIds.has(p.workPlanTaskId)) {
        rows.push({
          source: "Uzdevums / posms",
          workPlanTask: workPlanTaskLabel(sections, p.workPlanTaskId),
          num: p.num,
          kind: p.kind,
          title: p.title,
          bucket: executionBucket(p, asOf),
          status: p.status || "",
          start: p.start || "",
          end: p.end || "",
          progress: p.progress ?? 0,
          description: p.description || "",
          executionInfo: executionInfoForExport(p),
          tableBlock: "",
          extra: "",
        });
      }
    }
    return rows;
  }

  function exportWorkPlanSectionExcel(phases, sections, sectionId, asOf) {
    const section = ensureWorkPlanSections(sections).find((s) => s.id === sectionId);
    const reportRows = collectSectionReportRows(phases, sections, sectionId, asOf);
    const counts = { Izdarīts: 0, Notiek: 0, Plānots: 0, "Nav uzsākts": 0, Atcelts: 0 };
    for (const r of reportRows) {
      counts[r.bucket] = (counts[r.bucket] || 0) + 1;
    }
    const plannedTotal = (counts.Plānots || 0) + (counts["Nav uzsākts"] || 0);
    const lines = [
      ["Darba plāna apakšsadaļa", section?.title || ""].map(escapeCsv).join(";"),
      ["Atskaites datums (griezums)", asOf || todayIso()].map(escapeCsv).join(";"),
      "",
      ["Kopsavilkums", "Skaits"].map(escapeCsv).join(";"),
      ["Izdarīts", counts.Izdarīts || 0].map(escapeCsv).join(";"),
      ["Notiek", counts.Notiek || 0].map(escapeCsv).join(";"),
      ["Plānots / nav uzsākts", plannedTotal].map(escapeCsv).join(";"),
      ["Atcelts", counts.Atcelts || 0].map(escapeCsv).join(";"),
      "",
      [
        "Avots",
        "Darba plāna uzdevums",
        "Nr",
        "Līmenis",
        "Nosaukums / elements",
        "Izpildes grupa",
        "Statuss",
        "Sākums",
        "Beigas",
        "Progress %",
        "Apraksts",
        EXECUTION_INFO_LABEL,
        "Tabula",
        "Papildu dati",
      ]
        .map(escapeCsv)
        .join(";"),
    ];
    for (const r of reportRows) {
      lines.push(
        [
          r.source,
          r.workPlanTask,
          r.num,
          r.kind,
          r.title,
          r.bucket,
          r.status,
          r.start,
          r.end,
          r.progress,
          r.description,
          r.executionInfo,
          r.tableBlock,
          r.extra,
        ]
          .map(escapeCsv)
          .join(";"),
      );
    }
    const csv = `\uFEFF${lines.join("\n")}`;
    downloadTextFile(
      `darba-plans-${exportSlug(section?.title)}-${asOf || todayIso()}.csv`,
      csv,
      "text/csv;charset=utf-8",
    );
  }

  function clearWorkPlanTaskFromPhases(phases, taskIds) {
    const doomed = new Set(Array.isArray(taskIds) ? taskIds : [taskIds]);
    if (!doomed.size) return phases;
    return phases.map((p) => (doomed.has(p.workPlanTaskId) ? { ...p, workPlanTaskId: null } : p));
  }

  function phaseKindMeta(phase, phases) {
    if (!phase?.parentId) {
      return { kind: "Uzdevums", level: 0, childLabel: "Posms", addChildLabel: "+ Pievienot posmu" };
    }
    const parent = phases.find((p) => p.id === phase.parentId);
    if (parent && !parent.parentId) {
      return { kind: "Posms", level: 1, childLabel: "Apakšposms", addChildLabel: "+ Pievienot apakšposmu" };
    }
    return { kind: "Apakšposms", level: 2, childLabel: null, addChildLabel: null };
  }

  function navKindLabel(kind) {
    const k = String(kind || "");
    if (k === "Uzdevums") return "UZDEVUMS";
    if (k === "Posms") return "posms";
    if (k === "Apakšposms") return "apakšposms";
    return k;
  }

  function navKindTagClass(kind) {
    const k = String(kind || "");
    if (k === "Uzdevums") return "pv-kind-tag pv-kind-nav-uzdevums";
    if (k === "Posms" || k === "Apakšposms") return "pv-kind-tag pv-kind-nav-posms";
    return "pv-kind-tag";
  }

  function isUnderAncestor(phases, itemId, ancestorId) {
    let cur = itemId;
    while (cur) {
      if (cur === ancestorId) return true;
      const p = phases.find((x) => x.id === cur);
      if (!p) return false;
      cur = p.parentId;
    }
    return false;
  }

  function phaseVisualState(phase, phases) {
    const status = String(phase?.status || "").trim();
    const progress = phases ? resolvePhaseProgress(phase, phases) : clampProgress(phase?.progress);
    const done = /pabeigts/i.test(status) || progress >= 100;
    const cancelled = /atcelts/i.test(status);
    const notStarted = /nav sākts/i.test(status);
    const muted = cancelled;
    const start = String(phase?.start || "").slice(0, 10);
    const end = String(phase?.end || "").slice(0, 10);
    const today = todayIso();
    const futureExecution = Boolean(start && start > today && !done && !cancelled);
    const overdue = !done && !muted && end && end < today && progress < 100;
    const inProgress =
      !done &&
      !muted &&
      !overdue &&
      (/procesā|gaida atbildi/i.test(status) || (progress > 0 && progress < 100));
    return { muted, overdue, inProgress, done, cancelled, notStarted, futureExecution };
  }

  function ganttBarClass(phase, phases) {
    const v = phaseVisualState(phase, phases);
    const progress = phases ? resolvePhaseProgress(phase, phases) : clampProgress(phase?.progress);
    if (v.done || progress >= 100) return "done";
    if (v.cancelled) return "muted";
    if (v.overdue) return "overdue";
    if (v.inProgress) return "active";
    if (v.futureExecution) return "scheduled";
    return "planned";
  }

  function phaseRowClass(phase, phases) {
    const v = phaseVisualState(phase, phases);
    if (v.muted) return "pv-muted-row";
    if (v.futureExecution) return "pv-scheduled-row";
    if (v.overdue) return "pv-overdue-row";
    return "";
  }

  function escapeCsv(val) {
    const s = String(val ?? "").replace(/"/g, '""');
    return /[",;\n\r]/.test(s) ? `"${s}"` : s;
  }

  function downloadTextFile(filename, content, mime) {
    if (typeof document === "undefined") return;
    const blob = new Blob([content], { type: mime });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function buildPhaseExportLines(phases, workPlanSections) {
    const lines = [
      [
        "Nr",
        "Līmenis",
        "Nosaukums",
        "Apraksts",
        "Sākums",
        "Beigas",
        "Progress %",
        "Statuss",
        "Darba plāna uzdevums",
        EXECUTION_INFO_LABEL,
      ].join(";"),
    ];
    for (const p of flattenPhasesWithNumbers(phases)) {
      const wpLabel =
        p.kind === "Uzdevums" || p.kind === "Posms"
          ? workPlanTaskLabel(workPlanSections, p.workPlanTaskId)
          : "";
      lines.push(
        [
          p.num,
          p.kind || "Posms",
          p.title,
          p.description,
          p.start,
          p.end,
          p.progress ?? 0,
          p.status,
          wpLabel,
          executionInfoForExport(p),
        ]
          .map(escapeCsv)
          .join(";"),
      );
      for (const tool of p.tools || []) {
        const reg = p.registries?.[tool.id];
        if (!reg?.rows?.length) continue;
        for (const row of reg.rows) {
          const cells = (reg.columns || []).map((c) => row.cells?.[c.id] ?? "");
          lines.push(
            [p.num, `Reģistrs: ${tool.title}`, ...cells].map(escapeCsv).join(";"),
          );
        }
      }
    }
    return lines.join("\n");
  }

  function exportProcesuVadibaExcel(phases, workPlanSections) {
    const csv = `\uFEFF${buildPhaseExportLines(phases, workPlanSections)}`;
    downloadTextFile(`procesu-vadiba-${todayIso()}.csv`, csv, "text/csv;charset=utf-8");
  }

  function exportProcesuVadibaPdf(phases) {
    if (typeof window === "undefined") return;
    const numbered = flattenPhasesWithNumbers(phases);
    const rows = numbered
      .map((p) => {
        const tone = ganttBarClass(p);
        return `<tr class="${tone}"><td>${p.num}</td><td>${p.kind || ""}</td><td>${String(p.title || "").replace(/</g, "&lt;")}</td><td>${String(p.description || "").replace(/</g, "&lt;")}</td><td>${p.start || "—"}</td><td>${p.end || "—"}</td><td>${p.progress ?? 0}%</td><td>${p.status || "—"}</td></tr>`;
      })
      .join("");
    const html = `<!DOCTYPE html><html lang="lv"><head><meta charset="UTF-8"/><title>Procesu vadība</title>
<style>
body{font-family:Segoe UI,system-ui,sans-serif;padding:1.5rem;color:#01171d}
h1{margin:0 0 .25rem;font-size:1.2rem}p{color:#1f4d47;font-size:.85rem}
table{width:100%;border-collapse:collapse;margin-top:1rem;font-size:.82rem}
th,td{border:1px solid #c5ebe3;padding:.35rem .45rem;text-align:left}
th{background:#e8f8f3}
tr.muted td{color:#9ca3af;background:#f9fafb}
tr.notstarted td{background:#fef2f2;color:#991b1b}
tr.scheduled td{background:#f9fafb;color:#9ca3af}
tr.overdue td{background:#fef2f2;color:#991b1b}
tr.active td{background:#fffbeb;color:#78350f}
tr.done td{background:#ecfdf5;color:#065f46}
tr.planned td{background:#f0fdf9}
@media print{body{padding:.5rem}}
</style></head><body>
<h1>Procesu vadība — eksports</h1>
<p>Datums: ${todayIso()}</p>
<table><thead><tr><th>Nr</th><th>Līmenis</th><th>Nosaukums</th><th>Apraksts</th><th>Sākums</th><th>Beigas</th><th>%</th><th>Statuss</th></tr></thead>
<tbody>${rows}</tbody></table></body></html>`;
    const win = window.open("", "_blank");
    if (!win) {
      alert("Atļauj uznirstošos logus, lai eksportētu PDF.");
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => {
      try {
        win.print();
      } catch {
        /* ignore */
      }
    }, 350);
  }

  function buildPhaseTree(phases) {
    const numbered = flattenPhasesWithNumbers(phases);
    const nodes = new Map(numbered.map((p) => [p.id, { ...p, children: [] }]));
    const roots = [];
    for (const p of numbered) {
      const node = nodes.get(p.id);
      if (!p.parentId) roots.push(node);
      else nodes.get(p.parentId)?.children.push(node);
    }
    return roots;
  }

  function phaseTreeHasOverdue(node) {
    if (!node) return false;
    if (phaseVisualState(node).overdue) return true;
    return (node.children || []).some((c) => phaseTreeHasOverdue(c));
  }

  function overdueExpandedTaskIds(phaseTree) {
    const ids = new Set();
    for (const root of phaseTree || []) {
      if (phaseTreeHasOverdue(root)) ids.add(root.id);
    }
    return ids;
  }

  function escapeXml(val) {
    return String(val ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function ganttBarColors(tone) {
    const colors = {
      active: { bar: "#fbbf24", track: "#fffbeb" },
      done: { bar: "#34d399", track: "#ecfdf5" },
      notstarted: { bar: "#f87171", track: "#fef2f2" },
      scheduled: { bar: "#e5e7eb", track: "#f9fafb" },
      overdue: { bar: "#f87171", track: "#fef2f2" },
      muted: { bar: "#d1d5db", track: "#f3f4f6" },
      planned: { bar: "#7ab8ad", track: "#e8f8f3" },
    };
    return colors[tone] || colors.planned;
  }

  function buildGanttSvg(items, title) {
    const list = Array.isArray(items) ? items : [];
    const range = ganttRange(list);
    const months = ganttMonthLabels(range);
    const W = 1120;
    const labelW = 250;
    const pctW = 52;
    const trackW = W - labelW - pctW - 24;
    const rowH = 34;
    const headerH = 48;
    const topPad = 34;
    const H = topPad + headerH + Math.max(1, list.length) * rowH + 20;
    const trackX = labelW + 8;
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
    svg += `<rect width="100%" height="100%" fill="#ffffff"/>`;
    svg += `<text x="16" y="22" font-family="Segoe UI,system-ui,sans-serif" font-size="15" font-weight="600" fill="#01171d">${escapeXml(title || `${GANTT_CHART_LABEL}${ganttChartPlainSuffix()}`)}</text>`;
    svg += `<text x="16" y="36" font-family="Segoe UI,system-ui,sans-serif" font-size="10" fill="#1f4d47">${escapeXml(range.min)} — ${escapeXml(range.max)} · ${escapeXml(todayIso())}</text>`;

    for (const m of months) {
      const x = trackX + (m.leftNum / 100) * trackW;
      svg += `<line x1="${x}" y1="${topPad}" x2="${x}" y2="${H - 8}" stroke="#b8e0d6" stroke-width="1"/>`;
      svg += `<text x="${x + 4}" y="${topPad + headerH - 18}" font-family="Segoe UI,system-ui,sans-serif" font-size="11" fill="#0f4d47">${escapeXml(m.month)}</text>`;
      svg += `<text x="${x + 4}" y="${topPad + headerH - 6}" font-family="Segoe UI,system-ui,sans-serif" font-size="8" fill="#6b7280">${escapeXml(m.year)}</text>`;
    }

    svg += `<line x1="${trackX}" y1="${topPad + headerH}" x2="${W - 16}" y2="${topPad + headerH}" stroke="#c5ebe3" stroke-width="1"/>`;

    if (!list.length) {
      svg += `<text x="16" y="${topPad + headerH + 28}" font-family="Segoe UI,system-ui,sans-serif" font-size="12" fill="#6b7280">Nav elementu</text>`;
    }

    list.forEach((p, i) => {
      const y = topPad + headerH + i * rowH;
      const metrics = ganttBarMetrics(p, range);
      const tone = ganttBarClass(p);
      const colors = ganttBarColors(tone);
      const vis = phaseVisualState(p);
      const labelMuted = vis.muted || vis.futureExecution;
      const barX = trackX + (parseFloat(metrics.leftPct) / 100) * trackW;
      const barW = Math.max(5, (parseFloat(metrics.widthPct) / 100) * trackW);
      const fillW = Math.max(0, barW * (metrics.progress / 100));
      const label = `${p.num || ""} ${p.title || ""}`.trim();
      const barOpacity = vis.futureExecution ? ' opacity="0.55"' : "";
      svg += `<text x="12" y="${y + 21}" font-family="Segoe UI,system-ui,sans-serif" font-size="11" fill="${labelMuted ? "#9ca3af" : "#01171d"}">${escapeXml(label)}</text>`;
      svg += `<rect x="${trackX}" y="${y + 8}" width="${trackW}" height="18" fill="${colors.track}" rx="4"/>`;
      svg += `<rect x="${barX}" y="${y + 9}" width="${barW}" height="16" fill="${colors.bar}" rx="3"${barOpacity}/>`;
      if (fillW > 0) {
        svg += `<rect x="${barX}" y="${y + 9}" width="${fillW}" height="16" fill="rgba(1,23,29,0.18)" rx="3"/>`;
      }
      svg += `<text x="${trackX + trackW + 10}" y="${y + 21}" font-family="Segoe UI,system-ui,sans-serif" font-size="10" fill="#1f4d47">${metrics.progress}%</text>`;
    });

    svg += `</svg>`;
    return svg;
  }

  function downloadBlobFile(filename, blob) {
    if (typeof document === "undefined") return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportGanttImage(items, title) {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const svg = buildGanttSvg(items, title);
    const slug = String(title || "gantt")
      .slice(0, 24)
      .replace(/[^\w\u0100-\u017f]+/gi, "-")
      .replace(/^-|-$/g, "");
    const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.width || 1120;
        canvas.height = img.height || 400;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          canvas.toBlob((pngBlob) => {
            URL.revokeObjectURL(url);
            if (pngBlob) {
              downloadBlobFile(`gantt-${slug || "attels"}-${todayIso()}.png`, pngBlob);
            } else {
              downloadBlobFile(`gantt-${slug || "attels"}-${todayIso()}.svg`, svgBlob);
            }
          }, "image/png");
          return;
        }
      } catch {
        /* fallback below */
      }
      URL.revokeObjectURL(url);
      downloadBlobFile(`gantt-${slug || "attels"}-${todayIso()}.svg`, svgBlob);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      downloadBlobFile(`gantt-${slug || "attels"}-${todayIso()}.svg`, svgBlob);
    };
    img.src = url;
  }

  function ganttBarMetrics(phase, range) {
    const spanMs = Math.max(86400000, new Date(range.max).getTime() - new Date(range.min).getTime() + 86400000);
    const s = new Date(phase.start || range.min).getTime();
    const e = new Date(phase.end || phase.start || range.min).getTime();
    const left = ((s - new Date(range.min).getTime()) / spanMs) * 100;
    const width = Math.max(2, ((e - s + 86400000) / spanMs) * 100);
    return { leftPct: left.toFixed(1), widthPct: width.toFixed(1), progress: Number(phase.progress) || 0 };
  }

  function buildGanttExportCsv(items, title) {
    const list = Array.isArray(items) ? items : [];
    const range = ganttRange(list);
    const months = ganttMonthLabels(range).map((m) => m.label).join(", ");
    const lines = [
      [`${GANTT_CHART_LABEL}${ganttChartPlainSuffix()} eksports`, title || ""].map(escapeCsv).join(";"),
      ["Periods", `${range.min} — ${range.max}`, "Mēneši", months].map(escapeCsv).join(";"),
      "",
      [
        "Nr",
        "Līmenis",
        "Nosaukums",
        "Apraksts",
        "Sākums",
        "Beigas",
        "Progress %",
        "Statuss",
        `${GANTT_CHART_LABEL}${ganttChartPlainSuffix()} sākums %`,
        `${GANTT_CHART_LABEL}${ganttChartPlainSuffix()} platums %`,
      ].join(";"),
    ];
    for (const p of list) {
      const m = ganttBarMetrics(p, range);
      lines.push(
        [p.num, p.kind || "", p.title, p.description, p.start, p.end, p.progress ?? 0, p.status, m.leftPct, m.widthPct]
          .map(escapeCsv)
          .join(";"),
      );
    }
    return lines.join("\n");
  }

  function exportGanttExcel(items, title) {
    const slug = String(title || "gantt")
      .slice(0, 24)
      .replace(/[^\w\u0100-\u017f]+/gi, "-")
      .replace(/^-|-$/g, "");
    const csv = `\uFEFF${buildGanttExportCsv(items, title)}`;
    downloadTextFile(`gantt-${slug || "eksports"}-${todayIso()}.csv`, csv, "text/csv;charset=utf-8");
  }

  function exportGanttPdf(items, title) {
    if (typeof window === "undefined") return;
    const svg = buildGanttSvg(items, title);
    const safeTitle = String(title || `${GANTT_CHART_LABEL}${ganttChartPlainSuffix()}`).replace(/</g, "&lt;");
    const html = `<!DOCTYPE html><html lang="lv"><head><meta charset="UTF-8"/><title>${safeTitle}</title>
<style>
@page { size: landscape; margin: 10mm; }
body{font-family:Segoe UI,system-ui,sans-serif;margin:0;padding:12px;color:#01171d;background:#fff}
h1{font-size:1rem;margin:0 0 8px}
.wrap{overflow:visible}
svg{max-width:100%;height:auto;display:block}
@media print{body{padding:0}h1{display:none}}
</style></head><body>
<h1>${safeTitle}</h1>
<div class="wrap">${svg}</div>
<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},300)})</script>
</body></html>`;
    const win = window.open("", "_blank");
    if (!win) {
      alert(`Atļauj uznirstošos logus ${GANTT_CHART_LABEL}${ganttChartPlainSuffix()} PDF eksportam.`);
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
  }

  function exportSlug(text) {
    return (
      String(text || "eksports")
        .slice(0, 28)
        .replace(/[^\w\u0100-\u017f]+/gi, "-")
        .replace(/^-|-$/g, "") || "eksports"
    );
  }

  function buildContentBlockExportCsv(block) {
    const title = block?.title || contentBlockTypeLabel(block?.type);
    const lines = [[`Bloks: ${title}`, contentBlockTypeLabel(block?.type)].map(escapeCsv).join(";")];
    const execInfo = String(block?.executionInfo || "").trim();
    if (execInfo) {
      lines.push([EXECUTION_INFO_LABEL, execInfo].map(escapeCsv).join(";"));
    }
    if (block.type === "table") {
      const cols = block.columns || [];
      if (cols.length) lines.push(cols.map((c) => c.name).map(escapeCsv).join(";"));
      for (const row of block.rows || []) {
        lines.push(cols.map((c) => row.cells?.[c.id] ?? "").map(escapeCsv).join(";"));
      }
    } else if (block.type === "list") {
      lines.push(["Nr", "Punkts"].map(escapeCsv).join(";"));
      (block.items || []).forEach((item, idx) => {
        lines.push([block.ordered ? idx + 1 : "•", item.text || ""].map(escapeCsv).join(";"));
      });
    } else if (block.type === "richtext") {
      lines.push(["Teksts"].map(escapeCsv).join(";"));
      lines.push([htmlToPlainPreview(block.html, 20000)].map(escapeCsv).join(";"));
    } else if (block.type === "image") {
      lines.push(["Tips", "Nosaukums", "MIME"].map(escapeCsv).join(";"));
      lines.push(["Attēls", block.name || "", block.mime || ""].map(escapeCsv).join(";"));
    } else if (block.type === "attachment") {
      lines.push(["Tips", "Nosaukums", "Izmērs"].map(escapeCsv).join(";"));
      lines.push(["Pielikums", block.name || "", formatFileSize(block.size)].map(escapeCsv).join(";"));
    }
    return lines.join("\n");
  }

  function buildContentBlockPdfBody(block) {
    const execInfo = String(block?.executionInfo || "").trim();
    const execSection = execInfo
      ? `<div class="exec-info"><strong>${escapeXml(EXECUTION_INFO_LABEL)}</strong><p>${escapeXml(execInfo).replace(/\n/g, "<br/>")}</p></div>`
      : "";
    let body = "";
    if (block.type === "richtext") {
      body = `<div class="rich">${block.html || "<p></p>"}</div>`;
    } else if (block.type === "table") {
      const cols = block.columns || [];
      const head = cols.map((c) => `<th>${escapeXml(c.name || "")}</th>`).join("");
      const rows = (block.rows || [])
        .map(
          (row) =>
            `<tr>${cols.map((c) => `<td>${escapeXml(row.cells?.[c.id] ?? "")}</td>`).join("")}</tr>`,
        )
        .join("");
      body = `<table><thead><tr>${head}</tr></thead><tbody>${rows || "<tr><td colspan=\"99\">—</td></tr>"}</tbody></table>`;
    } else if (block.type === "list") {
      const tag = block.ordered ? "ol" : "ul";
      const items = (block.items || [])
        .map((item) => `<li>${escapeXml(item.text || "")}</li>`)
        .join("");
      body = `<${tag}>${items || "<li>—</li>"}</${tag}>`;
    } else if (block.type === "image") {
      body = block.dataUrl
        ? `<p><img src="${block.dataUrl}" alt="${escapeXml(block.name || "attēls")}" style="max-width:100%;height:auto;border-radius:8px"/></p>`
        : `<p>Nav attēla.</p>`;
    } else if (block.type === "attachment") {
      body = block.name
        ? `<p>📎 <strong>${escapeXml(block.name)}</strong> (${escapeXml(formatFileSize(block.size))})</p>`
        : `<p>Nav pielikuma.</p>`;
    } else {
      body = `<p>—</p>`;
    }
    return `${execSection}${body}`;
  }

  function exportContentBlockExcel(block) {
    const slug = exportSlug(block?.title || block?.type);
    const csv = `\uFEFF${buildContentBlockExportCsv(block)}`;
    downloadTextFile(`bloks-${slug}-${todayIso()}.csv`, csv, "text/csv;charset=utf-8");
  }

  function exportContentBlockPdf(block, parentTitle) {
    if (typeof window === "undefined") return;
    const title = block?.title || contentBlockTypeLabel(block?.type);
    const safeTitle = escapeXml(title);
    const safeParent = parentTitle ? escapeXml(parentTitle) : "";
    const body = buildContentBlockPdfBody(block);
    const html = `<!DOCTYPE html><html lang="lv"><head><meta charset="UTF-8"/><title>${safeTitle}</title>
<style>
body{font-family:Segoe UI,system-ui,sans-serif;padding:1rem;color:#01171d}
h1{font-size:1.05rem;margin:0 0 .2rem}h2{font-size:.82rem;color:#1f4d47;font-weight:500;margin:0 0 .75rem}
.meta{font-size:.75rem;color:#6b7280;margin-bottom:1rem}
table{width:100%;border-collapse:collapse;font-size:.82rem;margin-top:.35rem}
th,td{border:1px solid #c5ebe3;padding:.35rem .45rem;text-align:left}
th{background:#e8f8f3}
ul,ol{margin:.35rem 0;padding-left:1.25rem}
.rich p{margin:.35rem 0}
@media print{body{padding:.5rem}}
</style></head><body>
<h1>${safeTitle}</h1>
${safeParent ? `<h2>${safeParent}</h2>` : ""}
<p class="meta">${escapeXml(contentBlockTypeLabel(block?.type))} · ${todayIso()}</p>
${body}
<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},300)})</script>
</body></html>`;
    const win = window.open("", "_blank");
    if (!win) {
      alert("Atļauj uznirstošos logus PDF eksportam.");
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
  }

  function ganttRange(phases) {
    const list = Array.isArray(phases) ? phases : [];
    const dates = list.flatMap((p) => [p.start, p.end]).filter(Boolean);
    if (!dates.length) return { min: todayIso(), max: addDays(todayIso(), 30) };
    dates.sort();
    return { min: dates[0], max: dates[dates.length - 1] };
  }

  function ganttMonthLabels(range) {
    const minT = new Date(range.min).getTime();
    const maxT = new Date(range.max).getTime();
    const spanMs = Math.max(86400000, maxT - minT + 86400000);
    const out = [];
    const d = new Date(range.min);
    d.setDate(1);
    while (d.getTime() <= maxT + 86400000 * 31) {
      const leftNum = ((d.getTime() - minT) / spanMs) * 100;
      if (leftNum <= 100) {
        const month = d.toLocaleDateString("lv-LV", { month: "long" });
        const year = String(d.getFullYear());
        out.push({
          left: `${Math.max(0, Math.min(100, leftNum))}%`,
          leftNum: Math.max(0, Math.min(100, leftNum)),
          month,
          year,
          label: `${month} ${year}`,
        });
      }
      d.setMonth(d.getMonth() + 1);
    }
    return out;
  }

  function phaseDraftFrom(phase, displayNum) {
    return {
      title: phase?.title || "",
      description: phase?.description || "",
      executionInfo: phase?.executionInfo || "",
      start: phase?.start || "",
      end: phase?.end || "",
      progress: Number(phase?.progress ?? 0),
      status: phase?.status || "Plānots",
      workPlanTaskId: phase?.workPlanTaskId || "",
      num: displayNum || "",
      blocks: JSON.parse(JSON.stringify(phase?.blocks || [])),
    };
  }

  function contentBlockTypeLabel(type) {
    return CONTENT_BLOCK_TYPES.find((t) => t.id === type)?.label || String(type || "Saturs");
  }

  function htmlToPlainPreview(html, max = 140) {
    const text = String(html || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) return "";
    return text.length > max ? `${text.slice(0, max)}…` : text;
  }

  function isNewContentBlock(block) {
    if (!block) return true;
    if (block.type === "richtext") return !htmlToPlainPreview(block.html, 1);
    if (block.type === "image") return !block.dataUrl;
    if (block.type === "attachment") return !block.name;
    if (block.type === "table") {
      const hasCell = (block.rows || []).some((r) =>
        Object.values(r.cells || {}).some((v) => String(v ?? "").trim()),
      );
      return !hasCell;
    }
    if (block.type === "list") {
      return !(block.items || []).some((i) => String(i.text || "").trim());
    }
    return false;
  }

  function blockDraftFrom(block) {
    return JSON.parse(JSON.stringify(block || {}));
  }

  const CONTENT_BLOCK_TYPES = [
    { id: "richtext", label: "Teksts (formatēts)" },
    { id: "image", label: "Attēls" },
    { id: "attachment", label: "Pielikums" },
    { id: "table", label: "Tabula" },
    { id: "list", label: "Saraksts / uzskaitījums" },
  ];

  function createContentBlock(type) {
    const id = uid();
    const executionInfo = "";
    if (type === "richtext") return { id, type, title: "Teksts", html: "<p></p>", executionInfo };
    if (type === "image") return { id, type, title: "Attēls", dataUrl: "", name: "", executionInfo };
    if (type === "attachment") return { id, type, title: "Pielikums", dataUrl: "", name: "", mime: "", size: 0, executionInfo };
    if (type === "table") {
      const c1 = createTableColumn("text");
      c1.name = "Apraksts / saturs";
      return {
        id,
        type,
        title: "Tabula",
        columns: [c1],
        rows: [{ id: uid(), cells: {} }],
        executionInfo,
      };
    }
    if (type === "list") {
      return { id, type, title: "Saraksts", ordered: false, items: [{ id: uid(), text: "" }], executionInfo };
    }
    return null;
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ""));
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  function formatFileSize(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  function phaseChildren(phases, parentId) {
    return (Array.isArray(phases) ? phases : [])
      .filter((p) => p.parentId === parentId)
      .sort((a, b) => a.order - b.order);
  }

  function clampProgress(value) {
    return Math.max(0, Math.min(100, Number(value) || 0));
  }

  function phaseHasChildPhases(phases, phaseId) {
    return phaseChildren(phases, phaseId).length > 0;
  }

  function effectivePhaseProgress(phases, phaseId) {
    const children = phaseChildren(phases, phaseId);
    if (!children.length) {
      const p = (Array.isArray(phases) ? phases : []).find((x) => x.id === phaseId);
      return clampProgress(p?.progress);
    }
    const total = children.reduce((sum, c) => sum + effectivePhaseProgress(phases, c.id), 0);
    return Math.round(total / children.length);
  }

  function resolvePhaseProgress(phase, phases) {
    if (!phase) return 0;
    if (Array.isArray(phases) && phaseHasChildPhases(phases, phase.id)) {
      return effectivePhaseProgress(phases, phase.id);
    }
    return clampProgress(phase.progress);
  }

  function phaseProgressMeta(phases, phaseId) {
    const hasChildren = phaseHasChildPhases(phases, phaseId);
    const p = (Array.isArray(phases) ? phases : []).find((x) => x.id === phaseId);
    return {
      progress: hasChildren ? effectivePhaseProgress(phases, phaseId) : clampProgress(p?.progress),
      progressManual: !hasChildren,
    };
  }

  function syncComputedProgressInPhases(phases) {
    const list = Array.isArray(phases) ? phases : [];
    return list.map((p) => {
      if (!phaseHasChildPhases(list, p.id)) return p;
      return { ...p, progress: effectivePhaseProgress(list, p.id) };
    });
  }

  function progressFromChildrenHint(kind) {
    if (kind === "Uzdevums") return "Aprēķināts no posmu vērtībām.";
    if (kind === "Posms") return "Aprēķināts no apakšposmu vērtībām.";
    return "Aprēķināts no apakšelementu vērtībām.";
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
      workPlanTaskId: null,
      blocks: [],
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
    const flat = flattenPhasesWithNumbers(phases);
    return flat.filter((p) => isUnderAncestor(phases, p.id, phase.id));
  }

  function workPlanCellLabel(sections, taskId) {
    if (!taskId) return "";
    return workPlanTaskLabel(sections, taskId);
  }

  function ensureStyles() {
    if (typeof document === "undefined" || document.getElementById("pdd-pv-styles-v9")) return;
    const el = document.createElement("style");
    el.id = "pdd-pv-styles-v9";
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
        grid-template-columns: minmax(400px, 460px) minmax(0, 1fr);
        grid-template-rows: 1fr;
        align-items: stretch;
        min-height: calc(100vh - 80px);
        width: 100%;
        max-width: none;
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
      .pv-sidebar-tasks { display: flex; flex-direction: column; flex: 1; min-height: 0; gap: 0.35rem; }
      .pv-sidebar-tasks .pv-phase-list { flex: 1; }
      .pv-sidebar-tasks .pv-add-btn { flex: 0 0 auto; }
      .pv-phase-list { flex: 1; overflow: auto; display: flex; flex-direction: column; gap: 0.35rem; }
      .pv-sidebar-accordion { display: flex; flex-direction: column; gap: 0.15rem; }
      .pv-sidebar-accordion-head { display: flex; align-items: stretch; gap: 0.15rem; }
      .pv-sidebar-accordion-head .pv-phase-item { flex: 1; min-width: 0; }
      .pv-sidebar-accordion-head .pv-accordion-btn {
        flex: 0 0 1.45rem; align-self: stretch; margin: 3px 0;
        background: rgba(255,255,255,0.3); border-radius: 6px;
      }
      .pv-sidebar-accordion-head .pv-accordion-spacer { margin: 3px 0; }
      .pv-sidebar-accordion-body {
        display: flex; flex-direction: column; gap: 0.12rem;
        margin: 0 0 0.15rem 0.7rem; padding-left: 0.45rem;
        border-left: 2px solid rgba(255,255,255,0.5);
      }
      .pv-sidebar-child.depth-1 { font-size: 0.82rem; }
      .pv-sidebar-child.depth-2 { padding-left: 0.75rem; font-size: 0.78rem; }
      .pv-phase-item-line { display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem; }
      .pv-overdue-badge {
        display: inline-block; font-size: 0.58rem; font-weight: 700;
        letter-spacing: 0.02em; color: #fff; background: #dc2626;
        border-radius: 4px; padding: 0.07rem 0.38rem; line-height: 1.25;
        box-shadow: 0 1px 2px rgba(185, 28, 28, 0.35);
      }
      .pv-phase-item {
        display: flex; align-items: flex-start; gap: 0.35rem;
        width: 100%; border: 0; background: transparent; text-align: left;
        padding: 0.4rem 0.45rem; border-radius: 8px; cursor: pointer; font: inherit; color: #01171d;
      }
      .pv-sidebar-accordion-head .pv-phase-item,
      .pv-phase-item.pv-sidebar-uzdevums {
        font-size: 0.95rem;
        padding: 0.48rem 0.5rem;
      }
      .pv-sidebar-accordion-head .pv-phase-item strong,
      .pv-phase-item.pv-sidebar-uzdevums strong {
        font-size: 0.98rem;
        font-weight: 700;
        line-height: 1.3;
      }
      .pv-sidebar-accordion-head .pv-phase-num,
      .pv-phase-item.pv-sidebar-uzdevums .pv-phase-num {
        font-size: 0.92rem;
        font-weight: 800;
      }
      .pv-phase-item:hover { background: rgba(255,255,255,0.45); }
      .pv-phase-item.active { background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
      .pv-phase-item.sub { padding-left: 1.1rem; font-size: 0.82rem; }
      .pv-phase-item.sub-deep { padding-left: 1.65rem; font-size: 0.8rem; }
      .pv-desc-block { margin-top: 0.65rem; padding-top: 0.65rem; border-top: 1px dashed #c5ebe3; }
      .pv-desc-block label { display: block; font-size: 0.82rem; font-weight: 600; color: #1f4d47; }
      .pv-desc-block textarea { margin-top: 0.25rem; width: 100%; min-height: 3rem; resize: vertical; }
      .pv-gantt-export { display: flex; gap: 0.5rem; margin: 0.35rem 0 0.65rem; flex-wrap: wrap; }
      .pv-phase-item .meta { font-size: 0.72rem; color: #0f3d38; opacity: 0.85; margin-top: 0.15rem; }
      .pv-add-btn {
        width: 100%; border: 1px dashed #047857; background: rgba(255,255,255,0.4);
        color: #01171d; border-radius: 10px; padding: 0.5rem; font: inherit; cursor: pointer;
      }
      .pv-main { padding: 0.85rem 1rem 1.75rem; overflow: auto; min-width: 0; width: 100%; }
      .pv-main.pv-main-overview { padding: 0.65rem 0.85rem 1rem; display: flex; flex-direction: column; min-height: 0; }
      .pv-card { max-width: none; }
      .pv-content-block-card { max-width: none; }
      .pv-screen-overview { flex: 1; display: flex; flex-direction: column; min-height: 0; }
      .pv-screen-overview .pv-card { flex: 1; display: flex; flex-direction: column; margin-bottom: 0; min-height: 0; }
      .pv-screen-overview .pv-gantt-global { flex: 1; min-height: 320px; }
      .pv-gantt-legend { display: flex; flex-wrap: wrap; gap: 0.85rem 1.1rem; margin: 0 0 0.65rem; align-items: center; }
      .pv-legend-item {
        display: inline-flex; align-items: center; gap: 0.35rem;
        font-size: 0.74rem; color: #1f4d47;
      }
      .pv-legend-swatch {
        flex: 0 0 auto; width: 1.35rem; height: 0.72rem; border-radius: 4px;
        border: 1px solid rgba(1, 23, 29, 0.08);
      }
      .pv-legend-swatch.active { background: linear-gradient(90deg, #f59e0b, #fbbf24); }
      .pv-legend-swatch.done { background: linear-gradient(90deg, #059669, #34d399); }
      .pv-legend-swatch.scheduled { background: linear-gradient(90deg, #e5e7eb, #f3f4f6); opacity: 0.85; }
      .pv-legend-swatch.overdue { background: linear-gradient(90deg, #dc2626, #f87171); }
      .pv-legend-swatch.muted { background: linear-gradient(90deg, #d1d5db, #e5e7eb); }
      .pv-legend-swatch.planned { background: linear-gradient(90deg, #7ab8ad, #9fd4cb); }
      .pv-gantt-label-task { font-weight: 700; color: #01171d; }
      .pv-gantt-label-phase { font-weight: 600; color: #01171d; }
      .pv-gantt-row.sub .pv-gantt-label-phase { font-weight: 500; }
      .pv-muted-row .pv-gantt-label,
      .pv-muted-row .pv-gantt-label-task,
      .pv-muted-row .pv-gantt-label-phase { color: #9ca3af !important; font-weight: 500; }
      .pv-gantt-label .pv-link {
        color: inherit; font: inherit; font-weight: inherit; text-align: left; padding: 0;
      }
      .pv-gantt-label-task .pv-link { font-weight: 700; color: #01171d; }
      .pv-gantt-label-phase .pv-link { font-weight: 600; color: #01171d; }
      .pv-gantt-row.sub .pv-gantt-label-phase .pv-link { font-weight: 500; }
      .pv-muted-row .pv-gantt-label .pv-link { color: #9ca3af !important; font-weight: 500; }
      .pv-scheduled-row { opacity: 0.58; }
      .pv-scheduled-row .pv-gantt-label,
      .pv-scheduled-row .pv-gantt-label-task,
      .pv-scheduled-row .pv-gantt-label-phase,
      .pv-scheduled-row .pv-phase-num,
      .pv-scheduled-row .pv-kind-tag { color: #9ca3af !important; font-weight: 500; }
      .pv-scheduled-row .pv-gantt-label .pv-link { color: #9ca3af !important; font-weight: 500; }
      .pv-scheduled-row .pv-gantt-track { background: #f3f4f6; }
      .pv-overdue-row .pv-gantt-label,
      .pv-overdue-row .pv-gantt-label-task,
      .pv-overdue-row .pv-gantt-label-phase { color: #01171d; }
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
        display: grid; grid-template-columns: 260px minmax(720px, 1fr) 70px;
        gap: 0.5rem; font-size: 0.74rem; color: var(--pv-muted); padding-bottom: 0.35rem;
        border-bottom: 1px solid #c5ebe3;
      }
      .pv-gantt-row {
        display: grid; grid-template-columns: 260px minmax(720px, 1fr) 70px;
        gap: 0.5rem; align-items: center; padding: 0.45rem 0;
        border-bottom: 1px solid #e0f2ee; font-size: 0.82rem;
      }
      .pv-gantt-months {
        position: relative; height: 34px; margin-bottom: 0.25rem;
        border-bottom: 1px dashed #c5ebe3; background: #f8fffd;
      }
      .pv-gantt-month-tick {
        position: absolute; top: 0; bottom: 0;
        border-left: 1px solid #b8e0d6; padding-left: 0.3rem;
        display: flex; flex-direction: column; justify-content: flex-end;
        padding-bottom: 2px; line-height: 1.05;
      }
      .pv-gantt-month-name {
        font-size: 0.68rem; color: #0f4d47; white-space: nowrap; text-transform: lowercase;
      }
      .pv-gantt-month-year { font-size: 0.55rem; color: #6b7280; }
      .pv-gantt-grid-lines {
        position: absolute; inset: 0; pointer-events: none; z-index: 0;
      }
      .pv-gantt-grid-line {
        position: absolute; top: 0; bottom: 0;
        border-left: 1px solid rgba(184, 224, 214, 0.9);
      }
      .pv-gantt-track-wrap { min-width: 0; }
      .pv-gantt-row.sub .pv-gantt-label { padding-left: 1rem; font-size: 0.78rem; }
      .pv-gantt-pct {
        display: inline-flex; align-items: center; gap: 0.12rem; justify-content: flex-end;
      }
      .pv-gantt-pct input {
        width: 48px; padding: 0.2rem; border: 1px solid #c5ebe3; border-radius: 6px;
        font: inherit; font-size: 0.82rem; text-align: right;
      }
      .pv-gantt-pct-suffix { font-size: 0.82rem; color: #1f4d47; font-weight: 600; }
      .pv-gantt-pct-readonly {
        min-width: 1.6rem; text-align: right; font-size: 0.82rem; font-weight: 700; color: #047857;
      }
      .pv-gantt-pct.is-computed .pv-gantt-pct-readonly { color: #1f4d47; }
      .pv-gantt-track {
        position: relative; height: 26px; background: #e8f8f3; border-radius: 6px; overflow: hidden;
      }
      .pv-gantt-bar {
        position: absolute; top: 3px; bottom: 3px; border-radius: 5px; z-index: 1;
        background: linear-gradient(90deg, #6b9e94, #8fbdb4); min-width: 6px;
      }
      .pv-gantt-bar.active { background: linear-gradient(90deg, #f59e0b, #fbbf24); }
      .pv-gantt-bar.done { background: linear-gradient(90deg, #059669, #34d399); }
      .pv-gantt-bar.scheduled { background: linear-gradient(90deg, #e5e7eb, #f3f4f6); opacity: 0.72; }
      .pv-gantt-bar.overdue { background: linear-gradient(90deg, #dc2626, #f87171); }
      .pv-gantt-bar.muted { background: linear-gradient(90deg, #d1d5db, #e5e7eb); }
      .pv-gantt-bar.planned { background: linear-gradient(90deg, #7ab8ad, #9fd4cb); }
      .pv-gantt-bar .fill {
        position: absolute; left: 0; top: 0; bottom: 0;
        background: rgba(1, 23, 29, 0.2); border-radius: 5px 0 0 5px;
      }
      .pv-table-wrap { overflow: auto; border: 1px solid #c5ebe3; border-radius: 10px; width: 100%; }
      .pv-table { width: 100%; border-collapse: collapse; font-size: 0.84rem; min-width: 520px; table-layout: auto; }
      .pv-table.pv-table-quick { min-width: 0; }
      .pv-table-quick td, .pv-table-quick th { vertical-align: top; }
      .pv-table-quick .pv-table input,
      .pv-table-quick .pv-table select,
      .pv-table-quick .pv-table textarea {
        padding: 0.38rem 0.48rem;
        font-size: 0.86rem;
        min-height: 2rem;
      }
      .pv-table-options-panel {
        display: flex; flex-direction: column; gap: 0.45rem;
        margin: 0 0 0.65rem; padding: 0.55rem 0.65rem;
        background: #f0fdf9; border: 1px solid #c5ebe3; border-radius: 10px;
      }
      .pv-table-options-panel .pv-choice-options { margin-top: 0; padding-top: 0; border-top: 0; }
      .pv-table-options-head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
      .pv-table-options-head .meta { margin: 0; font-size: 0.76rem; color: #0f766e; }
      .pv-table-quick-hint {
        font-size: 0.74rem;
        color: #0f766e;
        margin: 0 0 0.5rem;
      }
      .pv-table th, .pv-table td { border-bottom: 1px solid #e0f2ee; padding: 0.42rem 0.5rem; text-align: left; }
      .pv-table th { background: #e8f8f3; color: #065f46; font-weight: 600; vertical-align: top; }
      .pv-table textarea {
        width: 100%; box-sizing: border-box; border: 1px solid #c5ebe3;
        border-radius: 6px; padding: 0.25rem 0.35rem; font: inherit; background: #fff;
        min-height: 2.5rem; resize: vertical;
      }
      .pv-table th.pv-col-notes, .pv-table td.pv-col-notes,
      .pv-content-block-view-table th.pv-col-notes, .pv-content-block-view-table td.pv-col-notes {
        min-width: 280px; width: 22%;
      }
      .pv-col-header { display: flex; flex-direction: column; gap: 0.28rem; min-width: 130px; }
      .pv-col-header-type { width: 100%; margin-top: 0.12rem; }
      .pv-col-header-row { display: flex; gap: 0.2rem; align-items: center; }
      .pv-col-header input, .pv-col-header select { font-size: 0.78rem; }
      .pv-col-move-btn {
        flex: 0 0 auto; border: 1px solid #c5ebe3; background: #fff; color: #065f46;
        border-radius: 5px; padding: 0.1rem 0.35rem; font-size: 0.72rem; cursor: pointer; line-height: 1.2;
      }
      .pv-col-move-btn:disabled { opacity: 0.35; cursor: not-allowed; }
      .pv-col-move-btn:not(:disabled):hover { background: #f0fdf9; border-color: #0d9488; }
      .pv-row-actions { display: flex; gap: 0.2rem; align-items: center; white-space: nowrap; }
      .pv-col-type-label { font-size: 0.68rem; color: #0f766e; font-weight: 500; }
      .pv-choice-options { margin-top: 0.35rem; padding-top: 0.35rem; border-top: 1px dashed #c5ebe3; }
      .pv-choice-opt-row { display: flex; gap: 0.25rem; align-items: center; margin-bottom: 0.25rem; }
      .pv-choice-opt-row input { flex: 1; min-width: 0; }
      .pv-cell-multiline { white-space: pre-wrap; font-size: 0.82rem; }
      .pv-status-cell { font-weight: 600; }
      .pv-status-cell.pv-cell-tone-done { background: #34d399 !important; color: #064e3b; }
      .pv-status-cell.pv-cell-tone-active { background: #2dd4bf !important; color: #134e4a; }
      .pv-status-cell.pv-cell-tone-wait { background: #fbbf24 !important; color: #78350f; }
      .pv-status-cell.pv-cell-tone-planned { background: #60a5fa !important; color: #1e3a8a; }
      .pv-status-cell.pv-cell-tone-todo { background: #f87171 !important; color: #7f1d1d; }
      .pv-status-cell.pv-cell-tone-cancelled { background: #9ca3af !important; color: #1f2937; }
      .pv-status-cell.pv-cell-tone-default { background: #a7f3d0 !important; color: #065f46; }
      .pv-status-cell select { background: transparent !important; border: 0 !important; font-weight: 600; color: inherit; box-shadow: none; }
      .pv-status-cell select:focus { outline: 2px solid rgba(1, 23, 29, 0.25); outline-offset: -1px; }
      .pv-table tr:hover td:not(.pv-status-cell) { background: #f0fdf9; }
      .pv-content-block-view-table tr:hover td:not(.pv-status-cell) { background: #f0fdf9; }
      .pv-table tr:hover td.pv-status-cell,
      .pv-content-block-view-table tr:hover td.pv-status-cell { filter: brightness(0.97); }
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
      .pv-status-pill.done { background: #34d399; color: #064e3b; }
      .pv-status-pill.work { background: #2dd4bf; color: #134e4a; }
      .pv-status-pill.wait { background: #fbbf24; color: #78350f; }
      .pv-status-pill.planned { background: #60a5fa; color: #1e3a8a; }
      .pv-status-pill.cancelled { background: #9ca3af; color: #1f2937; }
      .pv-status-pill.notstarted { background: #f87171; color: #7f1d1d; }
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
      .pv-edit-section { margin-top: 0.85rem; padding-top: 0.85rem; border-top: 1px dashed #c5ebe3; }
      .pv-edit-section h4 { margin: 0 0 0.55rem; font-size: 0.88rem; color: #065f46; font-weight: 600; }
      .pv-edit-lower-zone {
        background: #f8fffd; border: 1px solid #d7efe8; border-radius: 10px;
        padding: 0.85rem; margin-top: 1rem;
      }
      .pv-edit-footer {
        display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 1rem; padding-top: 0.85rem;
        border-top: 1px solid #e0f2ee; align-items: center;
      }
      .pv-edit-footer .pv-btn.primary { margin-right: auto; }
      .pv-content-zone { margin-top: 0; }
      .pv-content-zone h3 { margin-bottom: 0.35rem; }
      .pv-content-blocks-list { display: flex; flex-direction: column; gap: 0.65rem; }
      .pv-below-gantt-blocks { display: flex; flex-direction: column; gap: 0.75rem; margin-top: 0.75rem; }
      .pv-content-block-card { margin-bottom: 0; }
      .pv-content-block-card .pv-content-block { border: 0; margin: 0; padding: 0; background: transparent; }
      .pv-add-elements { margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px dashed #c5ebe3; }
      .pv-content-preview-type {
        font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em;
        color: #047857; background: #e8f8f3; border-radius: 4px; padding: 0.08rem 0.35rem; flex: 0 0 auto;
      }
      .pv-desc-readonly {
        margin-top: 0.65rem; padding-top: 0.65rem; border-top: 1px dashed #c5ebe3;
        font-size: 0.84rem; color: #1f4d47; line-height: 1.45; white-space: pre-wrap;
      }
      .pv-gantt-subtitle { margin: 0 0 0.5rem; font-size: 0.8rem; color: var(--pv-muted); }
      .pv-muted-row, .pv-phase-item.pv-muted-row, .pv-phase-row.pv-muted-row { opacity: 0.52; color: #6b7280; }
      .pv-muted-row .pv-gantt-label, .pv-muted-row strong { color: #9ca3af; font-weight: 500; }
      .pv-overdue-row strong { color: #9f4f4f; }
      .pv-phase-num {
        display: inline-block; min-width: 1.8rem; font-size: 0.76rem; font-weight: 700;
        color: #047857; margin-right: 0.35rem;
      }
      .pv-muted-row .pv-phase-num { color: #9ca3af; }
      .pv-kind-tag {
        display: inline-block; font-size: 0.65rem; font-weight: 600; text-transform: none;
        letter-spacing: 0.02em; color: #1f4d47; background: #e8f8f3; border-radius: 4px;
        padding: 0.05rem 0.35rem; margin-right: 0.35rem; vertical-align: middle;
      }
      .pv-kind-tag.pv-kind-nav-uzdevums {
        text-transform: uppercase;
        font-weight: 700;
        letter-spacing: 0.04em;
      }
      .pv-kind-tag.pv-kind-nav-posms {
        text-transform: lowercase;
        font-weight: 600;
        letter-spacing: 0;
      }
      .pv-phase-row.sub-deep { padding-left: 0.75rem; }
      .pv-accordion-wrap { display: flex; flex-direction: column; }
      .pv-accordion-row { display: flex; align-items: stretch; gap: 0.2rem; }
      .pv-accordion-btn {
        width: 1.6rem; flex: 0 0 1.6rem; border: 0; background: transparent;
        color: #047857; cursor: pointer; font-size: 0.72rem; border-radius: 6px;
      }
      .pv-accordion-btn:hover { background: #e8f8f3; }
      .pv-accordion-spacer { width: 1.6rem; flex: 0 0 1.6rem; }
      .pv-accordion-children { margin-left: 0.35rem; border-left: 1px dashed #d7efe8; }
      .pv-accordion-children .pv-phase-row { padding-left: 0.35rem; }
      .pv-export-bar { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 0.75rem; }
      .pv-card-compact { padding: 0.75rem 1rem; }
      .pv-phase-summary-row {
        display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.65rem;
      }
      .pv-phase-summary-row .meta { font-size: 0.78rem; color: var(--pv-muted); margin-top: 0.2rem; }
      .pv-status-pill.muted { background: #f3f4f6; color: #9ca3af; }
      .pv-status-pill.overdue { background: #fce8e8; color: #9f4f4f; }
      .pv-content-block {
        border: 1px solid #c5ebe3; border-radius: 10px; padding: 0.75rem;
        margin-bottom: 0.65rem; background: #fcfffe;
      }
      .pv-content-block-head {
        display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center;
        justify-content: space-between; margin-bottom: 0.55rem;
      }
      .pv-content-block-head input[type="text"] {
        flex: 1 1 180px; border: 1px solid #c5ebe3; border-radius: 8px;
        padding: 0.35rem 0.5rem; font: inherit;
      }
      .pv-content-block-actions {
        display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 0.55rem;
        padding-bottom: 0.45rem; border-bottom: 1px dashed #e0f2ee;
      }
      .pv-content-block-footer {
        display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center;
        margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid #e0f2ee;
      }
      .pv-content-block-footer .pv-btn.primary { margin-right: 0.15rem; }
      .pv-execution-info {
        display: block; margin-top: 0.65rem; font-size: 0.82rem; color: #01171d;
      }
      .pv-execution-info textarea {
        display: block; width: 100%; margin-top: 0.3rem; min-height: 4.5rem;
        border: 1px solid #c5ebe3; border-radius: 8px; padding: 0.45rem 0.55rem;
        font: inherit; resize: vertical; background: #fcfffe;
      }
      .pv-execution-info-readonly {
        padding: 0.55rem 0.65rem; border: 1px solid #e0f2ee; border-radius: 8px;
        background: #f8fffd; white-space: pre-wrap; line-height: 1.45;
      }
      .pv-execution-info-readonly strong {
        display: block; font-size: 0.76rem; color: #065f46; margin-bottom: 0.25rem;
      }
      .pv-content-block-title { font-size: 0.92rem; font-weight: 600; color: #01171d; flex: 1 1 auto; }
      .pv-rt-body.pv-rt-readonly {
        min-height: 3rem; padding: 0.65rem 0.75rem; border: 1px solid #e0f2ee;
        border-radius: 8px; background: #fcfffe; font-size: 0.88rem; line-height: 1.45;
      }
      .pv-content-block-view-table { width: 100%; border-collapse: collapse; font-size: 0.84rem; }
      .pv-content-block-view-table th, .pv-content-block-view-table td {
        border: 1px solid #e0f2ee; padding: 0.35rem 0.45rem; text-align: left;
      }
      .pv-content-block-view-table th { background: #f0fdf9; color: #065f46; }
      .pv-rt-toolbar {
        display: flex; flex-wrap: wrap; gap: 0.25rem; margin-bottom: 0.45rem;
        padding: 0.35rem; background: #f0fdf9; border-radius: 8px; border: 1px solid #c5ebe3;
      }
      .pv-rt-toolbar button, .pv-rt-toolbar select, .pv-rt-toolbar input[type="color"] {
        border: 1px solid #c5ebe3; background: #fff; border-radius: 6px;
        padding: 0.2rem 0.45rem; font: inherit; font-size: 0.78rem; cursor: pointer; min-height: 28px;
      }
      .pv-rt-toolbar button:hover { border-color: #0d9488; }
      .pv-rt-body {
        min-height: 120px; padding: 0.65rem 0.75rem; border: 1px solid #c5ebe3;
        border-radius: 8px; background: #fff; line-height: 1.5; font-size: 0.9rem;
      }
      .pv-rt-body:focus { outline: 2px solid #75ccbd; outline-offset: 1px; }
      .pv-img-preview { max-width: 100%; max-height: 360px; border-radius: 8px; border: 1px solid #c5ebe3; }
      .pv-attach-row {
        display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center;
        padding: 0.5rem; background: #f0fdf9; border-radius: 8px;
      }
      .pv-list-editor { display: flex; flex-direction: column; gap: 0.35rem; }
      .pv-list-editor-row { display: flex; gap: 0.35rem; align-items: center; }
      .pv-list-editor-row input { flex: 1; padding: 0.4rem 0.5rem; border: 1px solid #c5ebe3; border-radius: 8px; font: inherit; }
      .pv-gantt-sublabel { font-size: 0.72em; font-weight: 400; color: var(--pv-muted); }
      .pv-wp-screen h1 { margin: 0 0 0.35rem; font-size: 1.15rem; color: #065f46; }
      .pv-wp-screen .pv-card > h1 { margin-top: 0; }
      .pv-wp-view-section { margin-bottom: 0.85rem; padding-bottom: 0.65rem; border-bottom: 1px dashed #e0f2ee; }
      .pv-wp-view-section:last-child { border-bottom: 0; margin-bottom: 0; padding-bottom: 0; }
      .pv-wp-view-title { font-weight: 600; font-size: 0.9rem; color: #01171d; margin: 0 0 0.35rem; }
      .pv-wp-view-tasks { margin: 0; padding-left: 1.15rem; font-size: 0.84rem; color: #1f4d47; line-height: 1.45; }
      .pv-wp-view-tasks li { margin: 0.15rem 0; }
      .pv-wp-footer-actions { display: flex; flex-wrap: wrap; gap: 0.45rem; align-items: center; }
      .pv-wp-footer-actions .pv-btn.primary { margin-right: auto; }
      .pv-wp-screen .pv-wp-intro { margin: 0 0 1rem; font-size: 0.84rem; color: var(--pv-muted); line-height: 1.45; }
      .pv-wp-sections { display: flex; flex-direction: column; gap: 0.55rem; }
      .pv-wp-accordion {
        border: 1px solid #c5ebe3; border-radius: 10px; background: #fcfffe; overflow: hidden;
      }
      .pv-wp-accordion-head {
        display: flex; align-items: center; gap: 0.35rem;
        padding: 0.45rem 0.55rem; background: #f0fdf9;
      }
      .pv-wp-accordion-head .pv-accordion-btn {
        flex: 0 0 1.45rem; background: #fff; border: 1px solid #c5ebe3;
      }
      .pv-wp-accordion-title {
        flex: 1; min-width: 0; font-weight: 600; font-size: 0.9rem; color: #01171d;
      }
      .pv-wp-accordion-head input {
        flex: 1; min-width: 0; padding: 0.4rem 0.5rem; border-radius: 8px;
        border: 1px solid #c5ebe3; font: inherit; font-weight: 600;
      }
      .pv-wp-accordion-meta { font-size: 0.72rem; color: var(--pv-muted); flex: 0 0 auto; }
      .pv-wp-accordion-body { padding: 0.65rem 0.75rem 0.75rem; border-top: 1px dashed #e0f2ee; }
      .pv-wp-section-head {
        display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center;
        justify-content: space-between; margin-bottom: 0.65rem;
      }
      .pv-wp-section-head input {
        flex: 1 1 220px; padding: 0.45rem 0.55rem; border-radius: 8px;
        border: 1px solid #c5ebe3; font: inherit; font-weight: 600;
      }
      .pv-wp-task-list { display: flex; flex-direction: column; gap: 0.4rem; }
      .pv-wp-task-row {
        display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center;
        padding: 0.35rem 0.45rem; background: #f8fffd; border: 1px solid #e0f2ee; border-radius: 8px;
      }
      .pv-wp-task-row input {
        flex: 1 1 200px; padding: 0.4rem 0.5rem; border: 1px solid #c5ebe3; border-radius: 8px; font: inherit;
      }
      .pv-wp-empty-tasks { font-size: 0.8rem; color: var(--pv-muted); padding: 0.35rem 0.15rem; }
      .pv-wp-report-bar {
        display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: flex-end;
        margin-top: 0.75rem; padding-top: 0.65rem; border-top: 1px dashed #e0f2ee;
      }
      .pv-wp-report-date {
        display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.76rem; color: var(--pv-muted);
      }
      .pv-wp-report-date input {
        padding: 0.4rem 0.5rem; border: 1px solid #c5ebe3; border-radius: 8px; font: inherit;
      }
      .pv-wp-col-label { font-size: 0.78rem; font-weight: 600; color: #065f46; }
      .pv-wp-cell-select { width: 100%; padding: 0.35rem 0.4rem; border: 1px solid #c5ebe3; border-radius: 6px; font: inherit; font-size: 0.8rem; }
      .pv-history-screen h1 { margin: 0 0 0.35rem; font-size: 1.15rem; color: #065f46; }
      .pv-history-intro { margin: 0 0 1rem; font-size: 0.84rem; color: var(--pv-muted); line-height: 1.45; }
      .pv-history-list { display: flex; flex-direction: column; gap: 0.45rem; }
      .pv-history-row {
        display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; justify-content: space-between;
        padding: 0.55rem 0.65rem; border: 1px solid #e0f2ee; border-radius: 10px; background: #f8fffd;
      }
      .pv-history-meta { font-size: 0.82rem; color: #1f4d47; }
      .pv-history-meta strong { color: #01171d; }
      .pv-history-kind {
        display: inline-block; font-size: 0.65rem; font-weight: 700; text-transform: uppercase;
        letter-spacing: 0.02em; color: #047857; background: #e8f8f3; border-radius: 4px;
        padding: 0.06rem 0.35rem; margin-right: 0.35rem;
      }
      .pv-sync-note {
        margin: 0.5rem 0 0; font-size: 0.72rem; color: #0f3d38; line-height: 1.4; opacity: 0.92;
      }
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
        let retryTimer = null;

        async function hydrateFromRemote(tryNum = 0) {
          const sb = await ensureSupabaseClient();
          if (cancelled) return;
          if (!sb) {
            if (tryNum < 40) {
              retryTimer = setTimeout(() => hydrateFromRemote(tryNum + 1), 1000);
              return;
            }
            setSyncStatus("local");
            remoteReadyRef.current = true;
            return;
          }
          try {
            const local = loadState();
            let remote = await fetchRemoteState(sb);
            let booted = false;
            if (!remote) {
              const boot = await saveRemoteState(sb, local);
              if (boot?.ok) {
                remote = local;
                booted = true;
              } else {
                console.warn(
                  "[Procesu vadība] Neizdevās saglabāt Supabase — pārbaudi, vai tabula Procesu_vadibas_modulis eksistē.",
                  boot?.error,
                );
                if (!cancelled) setSyncStatus("error");
                remoteReadyRef.current = true;
                return;
              }
            }
            if (cancelled || hydratedRef.current) return;
            hydratedRef.current = true;
            const merged = booted ? local : pickNewerState(remote, local);
            setState(merged);
            saveState(merged);
            if (!cancelled) setSyncStatus("synced");
          } catch (e) {
            console.warn("[Procesu vadība] sākotnējā sinhronizācija", e);
            if (!cancelled) setSyncStatus("error");
          } finally {
            if (!cancelled) remoteReadyRef.current = true;
          }
        }

        void hydrateFromRemote();
        return () => {
          cancelled = true;
          if (retryTimer) clearTimeout(retryTimer);
        };
      }, []);

      useEffect(() => {
        saveState(state);
        if (!remoteReadyRef.current) return undefined;
        if (!REMOTE_SYNC_ENABLED) {
          setSyncStatus("local");
          return undefined;
        }
        setSyncStatus("saving");
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
          void (async () => {
            const sb = await ensureSupabaseClient();
            if (!sb) {
              setSyncStatus("local");
              return;
            }
            const out = await saveRemoteState(sb, stateRef.current);
            if (!out?.ok) setSyncStatus("error");
            else setSyncStatus("synced");
          })();
        }, REMOTE_SAVE_MS);
        return () => clearTimeout(saveTimerRef.current);
      }, [state]);

      useEffect(() => {
        if (!REMOTE_SYNC_ENABLED) return undefined;
        const poll = setInterval(() => {
          void (async () => {
            if (!remoteReadyRef.current || saveTimerRef.current) return;
            const sb = await ensureSupabaseClient();
            if (!sb) return;
            try {
              const remote = await fetchRemoteState(sb);
              if (!remote) return;
              const local = stateRef.current;
              if (stateTimestamp(remote) > stateTimestamp(local) + 1000) {
                setState(remote);
                saveState(remote);
                setSyncStatus("synced");
              }
            } catch (e) {
              console.warn("[Procesu vadība] fona sinhronizācija", e);
            }
          })();
        }, REMOTE_POLL_MS);
        return () => clearInterval(poll);
      }, [setState]);

      return [state, setState, syncStatus];
    }

    function StatusPill({ value }) {
      const v = String(value ?? "").trim() || "—";
      return html`<span class="pv-status-pill ${statusPillClass(v)}">${v}</span>`;
    }

    function PhaseLink({ phase, onGo, className }) {
      if (!phase) return null;
      return html`
        <button type="button" class=${`pv-link ${className || ""}`} onClick=${() => onGo(phase.id)}>
          ${phase.title}
        </button>
      `;
    }

    function RichTextEditor({ value, onChange }) {
      const editorRef = useRef(null);
      useEffect(() => {
        if (!editorRef.current) return;
        if (document.activeElement === editorRef.current) return;
        const next = value || "<p></p>";
        if (editorRef.current.innerHTML !== next) {
          editorRef.current.innerHTML = next;
        }
      }, [value]);
      function exec(cmd, val) {
        editorRef.current?.focus();
        try {
          document.execCommand(cmd, false, val);
        } catch {
          /* ignore */
        }
        onChange(editorRef.current?.innerHTML || "");
      }
      function sync() {
        onChange(editorRef.current?.innerHTML || "");
      }
      return html`
        <div class="pv-rt-wrap">
          <div class="pv-rt-toolbar">
            <button type="button" title="Treknraksts" onClick=${() => exec("bold")}><strong>B</strong></button>
            <button type="button" title="Kursīvs" onClick=${() => exec("italic")}><em>I</em></button>
            <button type="button" title="Pasvītrots" onClick=${() => exec("underline")}><u>U</u></button>
            <button type="button" title="Izcelt" onClick=${() => exec("hiliteColor", "#fff3b0")}>🖍</button>
            <input type="color" title="Teksta krāsa" onChange=${(e) => exec("foreColor", e.target.value)} />
            <input type="color" title="Fona krāsa" onChange=${(e) => exec("hiliteColor", e.target.value)} />
            <select onChange=${(e) => e.target.value && exec("fontSize", e.target.value)}>
              <option value="">Izmērs</option>
              <option value="2">Mazs</option>
              <option value="3">Parasts</option>
              <option value="4">Liels</option>
              <option value="5">Ļoti liels</option>
            </select>
            <button type="button" onClick=${() => exec("insertUnorderedList")}>• Saraksts</button>
            <button type="button" onClick=${() => exec("insertOrderedList")}>1. Saraksts</button>
            <button type="button" onClick=${() => exec("removeFormat")}>✕ Formāts</button>
            <button type="button" onClick=${() => exec("insertText", " → ")}>→</button>
            <button type="button" onClick=${() => exec("insertText", " • ")}>•</button>
            <button type="button" onClick=${() => exec("insertText", " ✓ ")}>✓</button>
          </div>
          <div class="pv-rt-body" contenteditable="true" ref=${editorRef} onInput=${sync}></div>
        </div>
      `;
    }

    function WorkPlanSelect({ sections, value, onChange, compact }) {
      const wpSections = normalizeWorkPlanSections(sections);
      return html`
        <select
          class=${compact ? "pv-wp-cell-select" : ""}
          value=${value || ""}
          onChange=${(e) => onChange(e.target.value || null)}
        >
          <option value="">— Nav izvēlēts —</option>
          ${wpSections.map(
            (sec) => html`
              <optgroup key=${sec.id} label=${sec.title}>
                ${sec.tasks.map((t) => html`<option key=${t.id} value=${t.id}>${t.title}</option>`)}
              </optgroup>
            `,
          )}
        </select>
      `;
    }

    function ChoiceOptionsEditor({ options, onChange, label }) {
      const list = Array.isArray(options) ? options : [];

      function patchAt(i, val) {
        onChange(list.map((o, idx) => (idx === i ? val : o)));
      }

      function addOption() {
        onChange([...list, ""]);
      }

      function removeAt(i) {
        const label = String(list[i] || "").trim();
        if (!askConfirm(label ? `Dzēst opciju „${label}"?` : "Dzēst šo opciju?")) return;
        onChange(list.filter((_, idx) => idx !== i));
      }

      return html`
        <div class="pv-choice-options">
          <div class="meta" style=${{ marginBottom: "0.25rem" }}>${label || "Izvēles opcijas"}</div>
          ${list.length
            ? list.map(
                (opt, i) => html`
                  <div class="pv-choice-opt-row" key=${`opt-${i}`}>
                    <input
                      type="text"
                      value=${opt}
                      placeholder="Opcijas nosaukums…"
                      onInput=${(e) => patchAt(i, e.target.value)}
                    />
                    <button type="button" class="pv-col-move-btn" title="Dzēst opciju" onClick=${() => removeAt(i)}>✕</button>
                  </div>
                `,
              )
            : html`<p class="meta" style=${{ margin: "0 0 0.35rem" }}>Vēl nav opciju.</p>`}
          <button type="button" class="pv-btn" style=${{ marginTop: "0.2rem", fontSize: "0.76rem" }} onClick=${addOption}>
            + Pievienot opciju
          </button>
        </div>
      `;
    }

    function TableCellDisplay({ col, value, workPlanSections }) {
      const team = useMemo(() => getTeamUsers(), []);
      const display = formatTableCellDisplay(value, col, workPlanSections, team);
      if (display && typeof display === "object" && display.kind === "status") {
        return ce(StatusPill, { value: display.value });
      }
      if (display && typeof display === "object" && display.kind === "multiline") {
        return html`<span class="pv-cell-multiline">${display.value}</span>`;
      }
      return html`<span>${display}</span>`;
    }

    function TableCellEditor({ col, value, workPlanSections, onChange }) {
      const team = useMemo(() => getTeamUsers(), []);
      const val = value ?? "";

      if (isWorkPlanColumn(col)) {
        return html`<span>—</span>`;
      }

      const type = col?.type || "text";
      if (type === "status" || type === "choice") {
        const opts = columnOptionsForCell(col);
        return html`
          <select value=${String(val)} onChange=${(e) => onChange(e.target.value)}>
            <option value="">—</option>
            ${opts.map((o) => html`<option key=${o} value=${o}>${o}</option>`)}
          </select>
        `;
      }
      if (type === "person") {
        return html`
          <select value=${String(val)} onChange=${(e) => onChange(e.target.value)}>
            <option value="">—</option>
            ${team.map((u) => {
              const em = personEmail(u);
              const lb = personLabel(u);
              return html`<option key=${em || lb} value=${em || lb}>${lb}</option>`;
            })}
          </select>
        `;
      }
      if (type === "date") {
        return html`
          <input type="date" value=${String(val).slice(0, 10)} onChange=${(e) => onChange(e.target.value)} />
        `;
      }
      if (type === "number") {
        return html`
          <input type="number" value=${val === "" ? "" : val} onChange=${(e) => onChange(e.target.value)} />
        `;
      }
      if (type === "yesno") {
        const yes = val === true || val === "true" || val === "1" || /^jā$/i.test(String(val));
        const no = val === false || val === "false" || val === "0" || /^nē$/i.test(String(val));
        const sel = yes ? "yes" : no ? "no" : "";
        return html`
          <select
            value=${sel}
            onChange=${(e) => {
              const v = e.target.value;
              onChange(v === "yes" ? "Jā" : v === "no" ? "Nē" : "");
            }}
          >
            <option value="">—</option>
            <option value="yes">Jā</option>
            <option value="no">Nē</option>
          </select>
        `;
      }
      if (type === "multiline") {
        return html`
          <textarea onInput=${(e) => onChange(e.target.value)} rows=${2}>${String(val)}</textarea>
        `;
      }
      return html`
        <input type="text" value=${String(val)} onInput=${(e) => onChange(e.target.value)} />
      `;
    }

    function TableColumnHeader({ col, columns, onPatchColumns, onTypeChange, columnTypes = TABLE_COLUMN_TYPES }) {
      const idx = columns.findIndex((c) => c.id === col.id);

      function patchCol(patch) {
        onPatchColumns(
          columns.map((x) => {
            if (x.id !== col.id) return x;
            if (patch.type !== undefined && patch.type !== (x.type || "text")) {
              const next = changeColumnType(x, patch.type);
              onTypeChange?.(patch.type, x.id);
              return next;
            }
            if (patch.name !== undefined) {
              return { ...migrateTableColumn({ ...x, ...patch }), name: patch.name };
            }
            if (patch.options !== undefined) {
              return { ...migrateTableColumn({ ...x, ...patch }), options: patch.options };
            }
            return migrateTableColumn({ ...x, ...patch });
          }),
        );
      }

      function move(delta) {
        onPatchColumns(reorderTableColumns(columns, col.id, delta));
      }

      function removeCol() {
        if (!askConfirm(`Dzēst kolonnu „${col.name}"?`)) return;
        onPatchColumns(columns.filter((x) => x.id !== col.id));
      }

      return html`
        <div class="pv-col-header">
          <div class="pv-col-header-row">
            <button type="button" class="pv-col-move-btn" title="Pārvietot pa kreisi" disabled=${idx <= 0} onClick=${() => move(-1)}>←</button>
            <input
              style=${{ flex: 1 }}
              value=${col.name || ""}
              onInput=${(e) => patchCol({ name: e.target.value })}
              placeholder="Kolonnas nosaukums"
            />
            <button type="button" class="pv-col-move-btn" title="Pārvietot pa labi" disabled=${idx >= columns.length - 1} onClick=${() => move(1)}>→</button>
            <button type="button" class="pv-col-move-btn" title="Dzēst kolonnu" onClick=${removeCol}>✕</button>
          </div>
          <select
            class="pv-col-header-type"
            value=${col.type || "text"}
            title="Kolonnas formāts"
            onChange=${(e) => patchCol({ type: e.target.value })}
          >
            ${columnTypes.map((t) => html`<option key=${t.id} value=${t.id}>${t.label}</option>`)}
          </select>
        </div>
      `;
    }

    function ContentBlockViewBody({ block, workPlanSections }) {
      if (block.type === "richtext") {
        const htmlContent = block.html || "<p class=\"pv-empty\">—</p>";
        return html`<div class="pv-rt-body pv-rt-readonly" dangerouslySetInnerHTML=${{ __html: htmlContent }}></div>`;
      }
      if (block.type === "image") {
        return block.dataUrl
          ? html`<img class="pv-img-preview" src=${block.dataUrl} alt=${block.name || "attēls"} />`
          : html`<p class="pv-empty" style=${{ padding: "0.5rem" }}>Nav attēla</p>`;
      }
      if (block.type === "attachment") {
        return block.name
          ? html`<a class="pv-link" href=${block.dataUrl} download=${block.name}>📎 ${block.name} (${formatFileSize(block.size)})</a>`
          : html`<p class="pv-empty" style=${{ padding: "0.5rem" }}>Nav pielikuma</p>`;
      }
      if (block.type === "table") {
        const table = normalizeTableBlock(block);
        const cols = table.columns || [];
        const rows = table.rows || [];
        return html`
          <div class="pv-table-wrap">
            <table class="pv-content-block-view-table">
              <thead>
                <tr>
                  ${cols.map(
                    (c) => html`
                      <th key=${c.id} class=${tableColumnClass(c)} style=${tableColumnStyle(c)}>${c.name || "—"}</th>
                    `,
                  )}
                </tr>
              </thead>
              <tbody>
                ${rows.length
                  ? rows.map(
                      (row) => html`
                        <tr key=${row.id}>
                          ${cols.map((c) => html`
                            <td key=${c.id} class=${tableCellClasses(c, row.cells?.[c.id])} style=${tableColumnStyle(c)}>
                              ${ce(TableCellDisplay, { col: c, value: row.cells?.[c.id], workPlanSections })}
                            </td>
                          `)}
                        </tr>
                      `,
                    )
                  : html`<tr><td colspan=${Math.max(1, cols.length)}>—</td></tr>`}
              </tbody>
            </table>
          </div>
        `;
      }
      if (block.type === "list") {
        const items = (block.items || []).filter((i) => String(i.text || "").trim());
        if (!items.length) return html`<p class="pv-empty" style=${{ padding: "0.5rem" }}>Tukšs saraksts</p>`;
        const inner = items.map((item) => html`<li key=${item.id}>${item.text}</li>`);
        return block.ordered
          ? html`<ol class="pv-content-block-view-list" style=${{ margin: "0.25rem 0", paddingLeft: "1.25rem" }}>${inner}</ol>`
          : html`<ul class="pv-content-block-view-list" style=${{ margin: "0.25rem 0", paddingLeft: "1.25rem" }}>${inner}</ul>`;
      }
      return html`<p class="pv-empty">—</p>`;
    }

    function ExecutionInfoField({ value, editable, onChange, onBlur }) {
      const text = String(value || "");
      if (!editable && !text.trim()) return null;
      if (editable) {
        return html`
          <label class="pv-execution-info">
            ${EXECUTION_INFO_LABEL}
            <textarea
              value=${text}
              onInput=${(e) => onChange(e.target.value)}
              onBlur=${onBlur}
              rows=${3}
              placeholder="Brīvā formā par izpildi…"
            ></textarea>
          </label>
        `;
      }
      return html`
        <div class="pv-execution-info pv-execution-info-readonly">
          <strong>${EXECUTION_INFO_LABEL}</strong>
          <div>${text}</div>
        </div>
      `;
    }

    function ContentBlockEditor({ block, onSave, onRemove, parentTitle, workPlanSections }) {
      const isTableQuick = block.type === "table";
      const [editing, setEditing] = useState(() => isNewContentBlock(block) && !isTableQuick);
      const [draft, setDraft] = useState(() => blockDraftFrom(block));
      const [optionsEditColId, setOptionsEditColId] = useState("");
      const [tableStructureEdit, setTableStructureEdit] = useState(false);
      const tableSaveTimerRef = useRef(null);

      useEffect(() => {
        if (!isTableQuick && !editing) setDraft(blockDraftFrom(block));
      }, [block, editing, isTableQuick]);

      useEffect(() => {
        setDraft(blockDraftFrom(block));
        setOptionsEditColId("");
        setTableStructureEdit(false);
      }, [block.id]);

      useEffect(
        () => () => {
          if (tableSaveTimerRef.current) clearTimeout(tableSaveTimerRef.current);
        },
        [],
      );

      const viewBlock = block;
      const editBlock = draft;
      const activeBlock = isTableQuick || editing ? editBlock : viewBlock;

      function queueTableSave(next) {
        clearTimeout(tableSaveTimerRef.current);
        tableSaveTimerRef.current = setTimeout(() => {
          onSave(normalizeTableBlock(next));
        }, 350);
      }

      function patch(p) {
        setDraft((d) => {
          const next = { ...d, ...p };
          if (isTableQuick) queueTableSave(next);
          return next;
        });
      }

      function flushTableSave() {
        if (!isTableQuick) return;
        clearTimeout(tableSaveTimerRef.current);
        onSave(normalizeTableBlock(draft));
      }

      async function onPickFile(kind, e) {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 4 * 1024 * 1024) {
          alert("Fails lielāks par 4 MB — izvēlies mazāku vai saīsini.");
          e.target.value = "";
          return;
        }
        try {
          const dataUrl = await readFileAsDataUrl(file);
          patch({
            dataUrl,
            name: file.name,
            mime: file.type || "application/octet-stream",
            size: file.size,
          });
        } catch {
          alert("Neizdevās nolasīt failu.");
        }
        e.target.value = "";
      }

      function handleSave() {
        onSave(draft);
        setEditing(false);
      }

      function handleCancel() {
        setDraft(blockDraftFrom(block));
        setEditing(false);
      }

      function renderEditBody(b) {
        return html`
          ${b.type === "richtext"
            ? ce(RichTextEditor, { value: b.html || "", onChange: (html) => patch({ html }) })
            : null}
          ${b.type === "image"
            ? html`
                <div>
                  <input type="file" accept="image/*" onChange=${(e) => onPickFile("image", e)} />
                  ${b.dataUrl
                    ? html`<img class="pv-img-preview" src=${b.dataUrl} alt=${b.name || "attēls"} />`
                    : html`<p class="pv-empty" style=${{ padding: "0.5rem" }}>Pievieno attēlu (PNG, JPG…)</p>`}
                </div>
              `
            : null}
          ${b.type === "attachment"
            ? html`
                <div class="pv-attach-row">
                  <input type="file" onChange=${(e) => onPickFile("attachment", e)} />
                  ${b.name
                    ? html`<a class="pv-link" href=${b.dataUrl} download=${b.name}>📎 ${b.name} (${formatFileSize(b.size)})</a>`
                    : html`<span class="pv-empty" style=${{ padding: 0 }}>Pievieno pielikumu</span>`}
                </div>
              `
            : null}
          ${b.type === "table"
            ? (() => {
                const tableCols = normalizeTableBlock(b).columns;
                const optCols = tableCols.filter((c) => c.type === "choice" || c.type === "status");
                const optionsCol =
                  optionsEditColId && optCols.find((c) => c.id === optionsEditColId)
                    ? optCols.find((c) => c.id === optionsEditColId)
                    : null;

                return html`
                <p class="pv-table-quick-hint">
                  ${tableStructureEdit
                    ? "Tabulas struktūras labošana — kolonnas, formāti un izvēlnes."
                    : "Tabula — aizpildi šūnas; izmaiņas saglabājas automātiski."}
                </p>
                <div class="pv-toolbar">
                  <button type="button" class="pv-btn" onClick=${() => patch({ rows: [...(b.rows || []), { id: uid(), cells: {} }] })}>+ Rinda</button>
                  ${tableStructureEdit
                    ? html`
                        <select
                          class="pv-btn"
                          onChange=${(e) => {
                            const t = e.target.value;
                            if (!t) return;
                            const newCol = createTableColumn(t);
                            patch({ columns: [...tableCols, newCol] });
                            if (t === "choice" || t === "status") setOptionsEditColId(newCol.id);
                            e.target.value = "";
                          }}
                        >
                          <option value="">+ Kolonna…</option>
                          ${TABLE_COLUMN_TYPES.map((t) => html`<option key=${t.id} value=${t.id}>${t.label}</option>`)}
                        </select>
                        ${optCols.length
                          ? html`
                              <select
                                class="pv-btn"
                                value=${optionsEditColId}
                                onChange=${(e) => setOptionsEditColId(e.target.value)}
                                title="Atver izvēlnes iestatīšanu tikai izvēlētajai kolonnai"
                              >
                                <option value="">Izvēlnes kolonnai…</option>
                                ${optCols.map(
                                  (c) => html`
                                    <option key=${c.id} value=${c.id}>
                                      ${c.name || "Kolonna"} (${c.type === "status" ? "statuss" : "izvēle"})
                                    </option>
                                  `,
                                )}
                              </select>
                            `
                          : null}
                        <button
                          type="button"
                          class="pv-btn primary"
                          onClick=${() => {
                            setTableStructureEdit(false);
                            setOptionsEditColId("");
                          }}
                        >
                          Gatavs
                        </button>
                      `
                    : html`
                        <button type="button" class="pv-btn" onClick=${() => setTableStructureEdit(true)}>Labot tabulu</button>
                      `}
                </div>
                ${tableStructureEdit && optionsCol
                  ? html`
                      <div class="pv-table-options-panel">
                        <div class="pv-table-options-head">
                          <span class="meta">Iestati opcijas kolonnai „${optionsCol.name || "Kolonna"}”</span>
                          <button type="button" class="pv-btn" onClick=${() => setOptionsEditColId("")}>Aizvērt</button>
                        </div>
                        ${ce(ChoiceOptionsEditor, {
                          options: optionsCol.options || [],
                          label: optionsCol.type === "status" ? "Statusu opcijas" : "Izvēles opcijas",
                          onChange: (options) =>
                            patch({
                              columns: tableCols.map((x) => (x.id === optionsCol.id ? { ...x, options } : x)),
                            }),
                        })}
                      </div>
                    `
                  : null}
                <div class="pv-table-wrap">
                  <table class="pv-table pv-table-quick">
                    <thead>
                      <tr>
                        ${tableCols.map(
                          (c) => html`<th key=${c.id} class=${tableColumnClass(c)} style=${tableColumnStyle(c)}>
                            ${tableStructureEdit
                              ? ce(TableColumnHeader, {
                                  col: c,
                                  columns: tableCols,
                                  onPatchColumns: (columns) => {
                                    if (optionsEditColId && !columns.some((x) => x.id === optionsEditColId)) {
                                      setOptionsEditColId("");
                                    }
                                    patch({ columns });
                                  },
                                  onTypeChange: (newType, colId) => {
                                    if (newType === "choice" || newType === "status") setOptionsEditColId(colId);
                                  },
                                })
                              : (c.name || "—")}
                          </th>`,
                        )}
                        ${tableStructureEdit ? html`<th style=${{ width: "4.5rem" }}></th>` : null}
                      </tr>
                    </thead>
                    <tbody>
                      ${(b.rows || []).map(
                        (row, rowIdx) => html`
                          <tr key=${row.id}>
                            ${tableCols.map(
                              (c) => html`
                                <td class=${tableCellClasses(c, row.cells?.[c.id])} style=${tableColumnStyle(c)}>
                                  ${ce(TableCellEditor, {
                                    col: c,
                                    value: row.cells?.[c.id],
                                    workPlanSections,
                                    onChange: (val) =>
                                      patch({
                                        rows: b.rows.map((r) =>
                                          r.id === row.id
                                            ? { ...r, cells: { ...r.cells, [c.id]: val } }
                                            : r,
                                        ),
                                      }),
                                  })}
                                </td>
                              `,
                            )}
                            ${tableStructureEdit
                              ? html`
                                  <td>
                                    <div class="pv-row-actions">
                                      <button
                                        type="button"
                                        class="pv-col-move-btn"
                                        title="Pārvietot augšup"
                                        disabled=${rowIdx <= 0}
                                        onClick=${() => patch({ rows: reorderTableRows(b.rows, row.id, -1) })}
                                      >
                                        ↑
                                      </button>
                                      <button
                                        type="button"
                                        class="pv-col-move-btn"
                                        title="Pārvietot lejup"
                                        disabled=${rowIdx >= (b.rows || []).length - 1}
                                        onClick=${() => patch({ rows: reorderTableRows(b.rows, row.id, 1) })}
                                      >
                                        ↓
                                      </button>
                                      <button
                                        type="button"
                                        class="pv-col-move-btn"
                                        title="Dzēst rindu"
                                        style=${{ color: "#dc2626" }}
                                        onClick=${() => {
                                          if (!askConfirm("Dzēst šo tabulas rindu?")) return;
                                          patch({ rows: b.rows.filter((r) => r.id !== row.id) });
                                        }}
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  </td>
                                `
                              : null}
                          </tr>
                        `,
                      )}
                    </tbody>
                  </table>
                </div>
              `;
              })()
            : null}
          ${b.type === "list"
            ? html`
                <div class="pv-toolbar">
                  <button type="button" class="pv-btn" onClick=${() => patch({ ordered: !b.ordered })}>
                    ${b.ordered ? "Numurēts saraksts" : "Aizzīmējumu saraksts"}
                  </button>
                  <button type="button" class="pv-btn" onClick=${() => patch({ items: [...(b.items || []), { id: uid(), text: "" }] })}>+ Punkts</button>
                </div>
                <div class="pv-list-editor">
                  ${(b.items || []).map(
                    (item, idx) => html`
                      <div class="pv-list-editor-row" key=${item.id}>
                        <span>${b.ordered ? `${idx + 1}.` : "•"}</span>
                        <input
                          value=${item.text}
                          onInput=${(e) =>
                            patch({ items: b.items.map((x) => (x.id === item.id ? { ...x, text: e.target.value } : x)) })}
                        />
                        <button
                          type="button"
                          class="pv-link"
                          style=${{ color: "#dc2626" }}
                          onClick=${() => {
                            if (!askConfirm("Dzēst šo punktu?")) return;
                            patch({ items: b.items.filter((x) => x.id !== item.id) });
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    `,
                  )}
                </div>
              `
            : null}
        `;
      }

      const exportBlock = isTableQuick || editing ? draft : block;

      return html`
        <div class=${`pv-content-block ${isTableQuick ? "is-table-quick" : editing ? "is-editing" : "is-view"}`}>
          <div class="pv-content-block-head">
            <span class="pv-content-preview-type">${contentBlockTypeLabel(block.type)}</span>
            ${isTableQuick || editing
              ? html`
                  <input
                    type="text"
                    value=${activeBlock.title || ""}
                    onInput=${(e) => patch({ title: e.target.value })}
                    onBlur=${isTableQuick ? flushTableSave : undefined}
                    placeholder="Bloka nosaukums…"
                  />
                `
              : html`<span class="pv-content-block-title">${viewBlock.title || contentBlockTypeLabel(viewBlock.type)}</span>`}
          </div>

          ${isTableQuick || editing ? renderEditBody(editBlock) : ce(ContentBlockViewBody, { block: viewBlock, workPlanSections })}

          ${ce(ExecutionInfoField, {
            value: (isTableQuick || editing ? editBlock : viewBlock).executionInfo || "",
            editable: isTableQuick || editing,
            onChange: (v) => patch({ executionInfo: v }),
            onBlur: isTableQuick ? flushTableSave : undefined,
          })}

          <div class="pv-content-block-footer">
            ${isTableQuick
              ? html`<span class="meta">Automātiski saglabāts</span>`
              : editing
                ? html`
                    <button type="button" class="pv-btn primary" onClick=${handleSave}>Saglabāt</button>
                    <button type="button" class="pv-btn" onClick=${handleCancel}>Atcelt</button>
                  `
                : html`<button type="button" class="pv-btn" onClick=${() => setEditing(true)}>Apskatīt/Labot</button>`}
            <button type="button" class="pv-btn" onClick=${() => exportContentBlockExcel(exportBlock)}>⬇ Excel</button>
            <button type="button" class="pv-btn" onClick=${() => exportContentBlockPdf(exportBlock, parentTitle)}>⬇ PDF</button>
            <button type="button" class="pv-btn danger" onClick=${onRemove}>Dzēst bloku</button>
          </div>
        </div>
      `;
    }

    function ContentAddToolbar({ onAdd, childAction }) {
      return html`
        <div class="pv-add-elements">
          <div class="pv-toolbar">
            ${childAction
              ? html`
                  <button type="button" class="pv-btn" onClick=${childAction.onClick}>${childAction.label}</button>
                `
              : null}
            ${CONTENT_BLOCK_TYPES.map(
              (t) => html`
                <button type="button" class="pv-btn" key=${t.id} onClick=${() => onAdd(t.id)}>+ ${t.label}</button>
              `,
            )}
          </div>
        </div>
      `;
    }

    function ContentBlocksBelow({ blocks, parentTitle, onChange, workPlanSections }) {
      const list = Array.isArray(blocks) ? blocks : [];

      function updateBlock(id, next) {
        onChange(list.map((b) => (b.id === id ? next : b)));
      }

      function removeBlock(id) {
        const b = list.find((x) => x.id === id);
        const label = b?.title || contentBlockTypeLabel(b?.type) || "bloku";
        if (!askConfirm(`Dzēst bloku „${label}"?`)) return;
        onChange(list.filter((x) => x.id !== id));
      }

      if (!list.length) return null;

      return html`
        <div class="pv-below-gantt-blocks">
          ${list.map((b) => html`
            <div class="pv-card pv-content-block-card" key=${b.id}>
              ${ce(ContentBlockEditor, {
                block: b,
                parentTitle,
                workPlanSections,
                onSave: (next) => updateBlock(b.id, next.type === "table" ? normalizeTableBlock(next) : next),
                onRemove: () => removeBlock(b.id),
              })}
            </div>
          `)}
        </div>
      `;
    }

    function RegistryList({ phase, tool, readOnly, onPatchPhase }) {
      const registry = phase.registries?.[tool.id] || { columns: defaultRegistryColumns(), rows: [] };
      const team = useMemo(() => getTeamUsers(), []);
      const [structureEdit, setStructureEdit] = useState(false);
      const [optionsEditColId, setOptionsEditColId] = useState("");
      const optCols = registry.columns.filter((c) => c.type === "choice" || c.type === "status");
      const optionsCol =
        optionsEditColId && optCols.find((c) => c.id === optionsEditColId)
          ? optCols.find((c) => c.id === optionsEditColId)
          : null;

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
        if (!askConfirm("Dzēst šo ierakstu?")) return;
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
        if (type === "choice" || type === "status") setOptionsEditColId(col.id);
        return col;
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
                  ${structureEdit
                    ? html`
                        <select
                          class="pv-btn"
                          onChange=${(e) => {
                            const t = e.target.value;
                            if (!t) return;
                            addColumn(t);
                            e.target.value = "";
                          }}
                        >
                          <option value="">+ Kolonna…</option>
                          ${REGISTRY_COLUMN_TYPES.map((c) => html`<option value=${c.id}>${c.label}</option>`)}
                        </select>
                        ${optCols.length
                          ? html`
                              <select
                                class="pv-btn"
                                value=${optionsEditColId}
                                onChange=${(e) => setOptionsEditColId(e.target.value)}
                              >
                                <option value="">Izvēlnes kolonnai…</option>
                                ${optCols.map(
                                  (c) => html`
                                    <option key=${c.id} value=${c.id}>
                                      ${c.name || "Kolonna"} (${c.type === "status" ? "statuss" : "izvēle"})
                                    </option>
                                  `,
                                )}
                              </select>
                            `
                          : null}
                        <button
                          type="button"
                          class="pv-btn primary"
                          onClick=${() => {
                            setStructureEdit(false);
                            setOptionsEditColId("");
                          }}
                        >
                          Gatavs
                        </button>
                      `
                    : html`<button type="button" class="pv-btn" onClick=${() => setStructureEdit(true)}>Labot tabulu</button>`}
                </div>
                ${structureEdit && optionsCol
                  ? html`
                      <div class="pv-table-options-panel">
                        <div class="pv-table-options-head">
                          <span class="meta">Iestati opcijas kolonnai „${optionsCol.name || "Kolonna"}”</span>
                          <button type="button" class="pv-btn" onClick=${() => setOptionsEditColId("")}>Aizvērt</button>
                        </div>
                        ${ce(ChoiceOptionsEditor, {
                          options: optionsCol.options || [],
                          label: optionsCol.type === "status" ? "Statusu opcijas" : "Izvēles opcijas",
                          onChange: (options) =>
                            patchRegistry({
                              ...registry,
                              columns: registry.columns.map((x) => (x.id === optionsCol.id ? { ...x, options } : x)),
                            }),
                        })}
                      </div>
                    `
                  : null}
              `
            : null}
          <div class="pv-table-wrap">
            <table class="pv-table">
              <thead>
                <tr>
                  ${registry.columns.map(
                    (c) => html`
                      <th class=${tableColumnClass(c)} style=${tableColumnStyle(c)}>
                        ${readOnly || !structureEdit
                          ? c.name
                          : ce(TableColumnHeader, {
                              col: c,
                              columns: registry.columns,
                              columnTypes: REGISTRY_COLUMN_TYPES,
                              onPatchColumns: (columns) => {
                                if (optionsEditColId && !columns.some((x) => x.id === optionsEditColId)) {
                                  setOptionsEditColId("");
                                }
                                patchRegistry({ ...registry, columns });
                              },
                              onTypeChange: (newType, colId) => {
                                if (newType === "choice" || newType === "status") setOptionsEditColId(colId);
                              },
                            })}
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
                          ${registry.columns.map(
                            (c) => html`<td key=${c.id} class=${tableCellClasses(c, row.cells?.[c.id])} style=${tableColumnStyle(c)}>${renderCell(row, c)}</td>`,
                          )}
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

    function GanttSublabel() {
      return html`<span class="pv-gantt-sublabel"> (${GANTT_CHART_SUBLABEL})</span>`;
    }

    function GanttTitle({ title }) {
      const t = title || GANTT_CHART_LABEL;
      const idx = t.indexOf(GANTT_CHART_LABEL);
      if (idx === -1) return html`<h3>${t}</h3>`;
      const before = t.slice(0, idx);
      const after = t.slice(idx + GANTT_CHART_LABEL.length);
      return html`<h3>${before}${GANTT_CHART_LABEL}${ce(GanttSublabel)}${after}</h3>`;
    }

    function GanttButtonLabel({ before = "⬇ ", after = "" }) {
      return html`${before}${GANTT_CHART_LABEL}${ce(GanttSublabel)}${after}`;
    }

    function GanttColorLegend() {
      const items = [
        { cls: "active", label: "Procesā / izpildē" },
        { cls: "done", label: "Pabeigts" },
        { cls: "scheduled", label: "Vēl nav izpildes laiks" },
        { cls: "overdue", label: "Kavē" },
        { cls: "muted", label: "Atcelts" },
        { cls: "planned", label: "Plānots" },
      ];
      return html`
        <div class="pv-gantt-legend" aria-label="Krāsu nozīmes">
          ${items.map(
            (item) => html`
              <span class="pv-legend-item" key=${item.cls}>
                <span class=${`pv-legend-swatch ${item.cls}`}></span>
                <span>${item.label}</span>
              </span>
            `,
          )}
        </div>
      `;
    }

    function GanttChart({ items, onGoPhase, onPatchPhase, title, subtitle, legendSwatches, fillHeight, hideKindTag }) {
      const list = Array.isArray(items) ? items : [];
      const range = ganttRange(list);
      const months = ganttMonthLabels(range);
      const spanMs = Math.max(86400000, new Date(range.max).getTime() - new Date(range.min).getTime() + 86400000);
      const exportTitle = ganttChartInText(title || GANTT_CHART_LABEL);

      function barStyle(phase) {
        const s = new Date(phase.start || range.min).getTime();
        const e = new Date(phase.end || phase.start || range.min).getTime();
        const left = ((s - new Date(range.min).getTime()) / spanMs) * 100;
        const width = Math.max(2, ((e - s + 86400000) / spanMs) * 100);
        const pr = Math.max(0, Math.min(100, Number(phase.progress) || 0));
        return { left: `${left}%`, width: `${width}%`, pr };
      }

      function labelClass(p) {
        const v = phaseVisualState(p);
        if (v.muted || v.futureExecution) return "pv-gantt-label-muted";
        if (p.kind === "Uzdevums") return "pv-gantt-label-task";
        if (p.kind === "Posms") return "pv-gantt-label-phase";
        return "";
      }

      return html`
        <div class=${`pv-card ${fillHeight ? "pv-card-fill" : ""}`}>
          ${ce(GanttTitle, { title })}
          ${legendSwatches ? ce(GanttColorLegend) : subtitle ? html`<p class="pv-gantt-subtitle">${subtitle}</p>` : null}
          <div class="pv-gantt-export">
            <button type="button" class="pv-btn" onClick=${() => exportGanttExcel(list, exportTitle)}>
              ${ce(GanttButtonLabel, { after: " Excel" })}
            </button>
            <button type="button" class="pv-btn" onClick=${() => exportGanttImage(list, exportTitle)}>
              ${ce(GanttButtonLabel, { after: " attēls (PNG)" })}
            </button>
            <button type="button" class="pv-btn" onClick=${() => exportGanttPdf(list, exportTitle)}>
              ${ce(GanttButtonLabel, { after: " PDF" })}
            </button>
          </div>
          <div class="pv-gantt-global">
            <div class="pv-gantt-head">
              <span>Elements</span>
              <div class="pv-gantt-track-wrap">
                <div class="pv-gantt-months">
                  ${months.map(
                    (m, i) => html`
                      <div class="pv-gantt-month-tick" key=${i} style=${{ left: m.left }}>
                        <span class="pv-gantt-month-name">${m.month}</span>
                        <span class="pv-gantt-month-year">${m.year}</span>
                      </div>
                    `,
                  )}
                </div>
              </div>
              <span>%</span>
            </div>
            ${list.length
              ? list.map((p) => {
                  const st = barStyle(p);
                  const tone = ganttBarClass(p);
                  const rowCls = `${p.depth ? "sub" : ""} ${p.depth > 1 ? "sub-deep" : ""} ${phaseRowClass(p)}`.trim();
                  const lblCls = labelClass(p);
                  return html`
                    <div class="pv-gantt-row ${rowCls}" key=${p.id}>
                      <div class=${`pv-gantt-label ${lblCls}`}>
                        <span class="pv-phase-num">${p.num || ""}</span>
                        ${hideKindTag ? null : html`<span class=${navKindTagClass(p.kind)}>${navKindLabel(p.kind)}</span>`}
                        ${onGoPhase ? ce(PhaseLink, { phase: p, onGo: onGoPhase }) : html`<span>${p.title}</span>`}
                      </div>
                      <div class="pv-gantt-track-wrap">
                        <div class="pv-gantt-track">
                          <div class="pv-gantt-grid-lines">
                            ${months.map(
                              (m, i) => html`
                                <div class="pv-gantt-grid-line" key=${`g-${i}`} style=${{ left: m.left }}></div>
                              `,
                            )}
                          </div>
                          <div class="pv-gantt-bar ${tone}" style=${{ left: st.left, width: st.width }}>
                            <div class="fill" style=${{ width: `${st.pr}%` }}></div>
                          </div>
                        </div>
                      </div>
                      <div class=${`pv-gantt-pct ${p.progressManual === false ? "is-computed" : ""}`} title=${p.progressManual === false ? progressFromChildrenHint(p.kind) : ""}>
                        ${p.progressManual === false
                          ? html`<span class="pv-gantt-pct-readonly">${p.progress ?? 0}</span>`
                          : html`
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value=${p.progress ?? 0}
                                onChange=${(e) => onPatchPhase(p.id, { progress: Number(e.target.value) })}
                              />
                            `}
                        <span class="pv-gantt-pct-suffix">%</span>
                      </div>
                    </div>
                  `;
                })
              : html`<p class="pv-empty">Nav elementu šim ${GANTT_CHART_LABEL}${ganttChartPlainSuffix()} skatam.</p>`}
          </div>
        </div>
      `;
    }

    function GlobalGantt({ phases, onGoPhase, onPatchPhase }) {
      const items = flattenPhasesWithNumbers(phases).filter((p) => p.kind !== "Apakšposms");
      return ce(GanttChart, {
        items,
        onGoPhase,
        onPatchPhase,
        title: `Kopējais ${GANTT_CHART_LABEL} — visi uzdevumi un posmi`,
        legendSwatches: true,
        fillHeight: true,
        hideKindTag: true,
      });
    }

    function PhaseGantt({ phase, phases, onGoPhase, onPatchPhase }) {
      const raw = phaseGanttItems(phase, phases);
      const numMap = new Map(flattenPhasesWithNumbers(phases).map((p) => [p.id, p.num]));
      const items = raw.map((p) => ({ ...p, num: numMap.get(p.id) || "" }));
      return ce(GanttChart, {
        items,
        onGoPhase,
        onPatchPhase,
        title: `${GANTT_CHART_LABEL} — ${phase.title}`,
      });
    }

    function PhaseEditForm({
      phase,
      phases,
      kindMeta,
      open,
      onToggle,
      onSave,
      onAddBlock,
      onDelete,
      onAddChild,
      workPlanSections,
    }) {
      const kind = kindMeta?.kind || "Posms";
      const showWorkPlan = kind === "Uzdevums" || kind === "Posms";
      const wpSections = normalizeWorkPlanSections(workPlanSections);
      const depth = kindMeta?.level ?? (kind === "Uzdevums" ? 0 : kind === "Posms" ? 1 : 2);
      const displayNum = useMemo(
        () => flattenPhasesWithNumbers(phases || []).find((p) => p.id === phase?.id)?.num || "",
        [phases, phase?.id],
      );
      const editTitle =
        kind === "Uzdevums" ? "Uzdevuma labošana" : kind === "Posms" ? "Posma labošana" : "Apakšposma labošana";
      const deleteLabel =
        kind === "Uzdevums"
          ? "Dzēst uzdevumu un visus posmus"
          : kind === "Posms"
            ? "Dzēst posmu"
            : "Dzēst apakšposmu";
      const v = phaseVisualState(phase, phases);
      const hasChildPhases = phaseHasChildPhases(phases, phase.id);
      const computedProgress = resolvePhaseProgress(phase, phases);
      const [draft, setDraft] = useState(() => phaseDraftFrom(phase, displayNum));

      useEffect(() => {
        setDraft(phaseDraftFrom(phase, displayNum));
      }, [phase?.id, open, displayNum]);

      function patchDraft(patch) {
        setDraft((d) => ({ ...d, ...patch }));
      }

      function handleSave() {
        const { title, description, executionInfo, start, end, progress, status, workPlanTaskId, num } = draft;
        const patch = { title, description, executionInfo, start, end, status };
        if (!hasChildPhases) patch.progress = progress;
        if (showWorkPlan) patch.workPlanTaskId = workPlanTaskId || null;
        const numTrim = String(num || "").trim();
        if (numTrim && numTrim !== displayNum) {
          const check = validatePhaseNumber(numTrim, depth, phases || []);
          if (!check.ok) {
            alert(check.reason || "Nederīgs numurs.");
            return;
          }
          patch.num = numTrim;
          patch.numChanged = true;
        }
        onSave(patch);
        onToggle(false);
      }

      function handleCancel() {
        setDraft(phaseDraftFrom(phase, displayNum));
        onToggle(false);
      }

      const isUzdevums = kind === "Uzdevums";
      const wpLabel = showWorkPlan ? workPlanTaskLabel(wpSections, phase.workPlanTaskId) : "";

      const addToolbar = ce(ContentAddToolbar, {
        onAdd: onAddBlock,
        childAction:
          isUzdevums && onAddChild
            ? {
                label: kindMeta.addChildLabel || "+ Pievienot posmu",
                onClick: () =>
                  onAddChild({ title: "Jauns posms", parentId: phase.id, parentPhase: phase }),
              }
            : null,
      });

      if (!open) {
        return html`
          <div class="pv-card pv-card-compact">
            <div class="pv-phase-summary-row">
              <div>
                <div class="meta" style=${{ marginBottom: "0.15rem" }}>
                  <span class=${navKindTagClass(kind)}>${navKindLabel(kind)}</span>
                  ${displayNum ? html`<span class="pv-phase-num">${displayNum}</span>` : null}
                </div>
                <strong>${phase.title}</strong>
                <div class="meta">
                  ${phase.start || "—"} — ${phase.end || "—"} · ${computedProgress}% · ${phase.status || "—"}
                  ${hasChildPhases ? html`<span title=${progressFromChildrenHint(kind)}> (aprēķ.)</span>` : null}
                  ${v.overdue ? " · Kavē" : ""}
                </div>
                ${wpLabel
                  ? html`<div class="meta" style=${{ marginTop: "0.2rem" }}>Darba plāna uzdevums: ${wpLabel}</div>`
                  : null}
              </div>
              <button type="button" class="pv-btn" onClick=${() => onToggle(true)}>Apskatīt/Labot</button>
            </div>
            ${phase.description
              ? html`<div class="pv-desc-readonly"><strong style=${{ fontSize: "0.76rem", color: "#065f46" }}>Apraksts</strong><div style=${{ marginTop: "0.25rem" }}>${phase.description}</div></div>`
              : null}
            ${phase.executionInfo
              ? html`<div class="pv-desc-readonly"><strong style=${{ fontSize: "0.76rem", color: "#065f46" }}>${EXECUTION_INFO_LABEL}</strong><div style=${{ marginTop: "0.25rem", whiteSpace: "pre-wrap" }}>${phase.executionInfo}</div></div>`
              : null}
            ${addToolbar}
          </div>
        `;
      }

      return html`
        <div class="pv-card">
          <div class="pv-phase-summary-row" style=${{ marginBottom: "0.75rem" }}>
            <h3 style=${{ margin: 0 }}>${editTitle}</h3>
            <button type="button" class="pv-btn ghost" onClick=${handleCancel}>Aizvērt</button>
          </div>

          <div class="pv-edit-section" style=${{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>
            <h4>Pamatinformācija</h4>
            <div class="pv-edit-grid">
              <label>
                Numurs
                <input
                  type="text"
                  value=${draft.num ?? displayNum}
                  onInput=${(e) => patchDraft({ num: e.target.value })}
                  placeholder=${phaseNumberHint(depth)}
                />
                <span class="meta" style=${{ marginTop: "0.2rem" }}>
                  Mainot numuru, elements pārkārtojas sarakstā (piem., 1.2 → 1.1).
                </span>
              </label>
              <label>
                Nosaukums
                <input type="text" value=${draft.title} onInput=${(e) => patchDraft({ title: e.target.value })} />
              </label>
              <label>
                Statuss
                <select value=${draft.status} onChange=${(e) => patchDraft({ status: e.target.value })}>
                  ${STATUS_PRESETS.map((s) => html`<option value=${s}>${s}</option>`)}
                </select>
              </label>
              <label>
                Sākums
                <input
                  type="date"
                  value=${String(draft.start || "").slice(0, 10)}
                  onChange=${(e) => patchDraft({ start: e.target.value })}
                />
              </label>
              <label>
                Beigas
                <input
                  type="date"
                  value=${String(draft.end || "").slice(0, 10)}
                  onChange=${(e) => patchDraft({ end: e.target.value })}
                />
              </label>
              <label>
                Progress (%)
                ${hasChildPhases
                  ? html`
                      <input type="number" value=${computedProgress} disabled />
                      <span class="meta" style=${{ marginTop: "0.2rem", display: "block" }}>
                        ${progressFromChildrenHint(kind)}
                      </span>
                    `
                  : html`
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value=${draft.progress ?? 0}
                        onChange=${(e) => patchDraft({ progress: Number(e.target.value) })}
                      />
                    `}
              </label>
              <label style=${{ gridColumn: "1 / -1" }}>
                Apraksts
                <textarea
                  value=${draft.description || ""}
                  onInput=${(e) => patchDraft({ description: e.target.value })}
                  rows=${3}
                  placeholder="Īss apraksts…"
                ></textarea>
              </label>
              <label style=${{ gridColumn: "1 / -1" }}>
                ${EXECUTION_INFO_LABEL}
                <textarea
                  value=${draft.executionInfo || ""}
                  onInput=${(e) => patchDraft({ executionInfo: e.target.value })}
                  rows=${3}
                  placeholder="Brīvā formā par izpildi…"
                ></textarea>
              </label>
              ${showWorkPlan
                ? html`
                    <label style=${{ gridColumn: "1 / -1" }}>
                      Darba plāna uzdevums
                      <select
                        value=${draft.workPlanTaskId || ""}
                        onChange=${(e) => patchDraft({ workPlanTaskId: e.target.value || null })}
                      >
                        <option value="">— Nav izvēlēts —</option>
                        ${wpSections.map(
                          (sec) => html`
                            <optgroup key=${sec.id} label=${sec.title}>
                              ${sec.tasks.map(
                                (t) => html`<option key=${t.id} value=${t.id}>${t.title}</option>`,
                              )}
                            </optgroup>
                          `,
                        )}
                      </select>
                      ${!wpSections.length
                        ? html`<span class="meta" style=${{ marginTop: "0.25rem", display: "block" }}>
                            Vispirms pievieno uzdevumus sadaļā „Darba plāna uzdevumi”.
                          </span>`
                        : null}
                    </label>
                  `
                : null}
            </div>
          </div>

          ${addToolbar}

          <div class="pv-edit-footer">
            <button type="button" class="pv-btn primary" onClick=${handleSave}>Saglabāt</button>
            <button type="button" class="pv-btn" onClick=${handleCancel}>Atcelt</button>
            <button type="button" class="pv-btn danger" onClick=${onDelete}>${deleteLabel}</button>
          </div>
        </div>
      `;
    }

    function ExportBar({ phases, workPlanSections }) {
      return html`
        <div class="pv-export-bar">
          <button type="button" class="pv-btn" onClick=${() => exportProcesuVadibaExcel(phases, workPlanSections)}>
            ⬇ Excel (CSV)
          </button>
          <button type="button" class="pv-btn" onClick=${() => exportProcesuVadibaPdf(phases)}>⬇ PDF</button>
        </div>
      `;
    }

    function HistoryScreen({ onGoOverview, onRestore }) {
      const [rows, setRows] = useState([]);
      const [loading, setLoading] = useState(true);
      const [restoringId, setRestoringId] = useState(null);

      const loadHistory = useCallback(async () => {
        setLoading(true);
        const sb = root.__PDD_SUPABASE__ ?? null;
        const list = await fetchRemoteHistory(sb);
        setRows(list);
        setLoading(false);
      }, []);

      useEffect(() => {
        void loadHistory();
      }, [loadHistory]);

      async function handleRestore(row) {
        const when = formatPvDateTime(row.saved_at);
        const who = row.saved_by || "nezināms lietotājs";
        if (typeof confirm !== "function" || !confirm(`Atjaunot moduļa stāvokli no ${when} (${who})?`)) return;
        setRestoringId(row.id);
        const out = await onRestore(row.id);
        setRestoringId(null);
        if (!out?.ok) {
          alert("Neizdevās atjaunot. Pārbaudi, vai Supabase vēstures tabula ir izveidota.");
          return;
        }
        await loadHistory();
        alert("Stāvoklis atjaunots. Visi komandas dalībnieki redzēs šo versiju pēc sinhronizācijas.");
      }

      return html`
        <div class="pv-history-screen">
          <div class="pv-card">
            <h1>Vēsture un atjaunošana</h1>
            <p class="pv-history-intro">
              Katra saglabāšana Supabase tiek arhivēta. Šeit var atjaunot iepriekšējo stāvokli — visi uzdevumi,
              posmi, tabulas, teksti un darba plāna uzdevumi atjaunojas kopā.
            </p>
            ${loading
              ? html`<p class="pv-empty">Ielādē vēsturi…</p>`
              : rows.length
                ? html`
                    <div class="pv-history-list">
                      ${rows.map(
                        (row) => html`
                          <div class="pv-history-row" key=${row.id}>
                            <div class="pv-history-meta">
                              <span class="pv-history-kind">${historyActionLabel(row.action)}</span>
                              <strong>${formatPvDateTime(row.saved_at)}</strong>
                              <div style=${{ marginTop: "0.2rem", fontSize: "0.76rem" }}>
                                ${row.saved_by ? `Lietotājs: ${row.saved_by}` : "Lietotājs: —"}
                              </div>
                            </div>
                            <button
                              type="button"
                              class="pv-btn"
                              disabled=${restoringId === row.id}
                              onClick=${() => handleRestore(row)}
                            >
                              ${restoringId === row.id ? "Atjauno…" : "Atjaunot šo versiju"}
                            </button>
                          </div>
                        `,
                      )}
                    </div>
                  `
                : html`<p class="pv-empty">Vēsture vēl nav pieejama. Tā parādīsies pēc pirmajām izmaiņām Supabase.</p>`}
            <div class="pv-edit-footer">
              <button type="button" class="pv-btn" onClick=${onGoOverview}>Atpakaļ</button>
              <button type="button" class="pv-btn" onClick=${loadHistory}>Atjaunot sarakstu</button>
            </div>
          </div>
        </div>
      `;
    }

    function WorkPlanScreen({ sections, phases, onSectionsChange }) {
      const saved = useMemo(() => normalizeWorkPlanSections(sections), [sections]);
      const [editing, setEditing] = useState(false);
      const [draft, setDraft] = useState(saved);
      const [expandedSections, setExpandedSections] = useState(() => new Set());
      const [reportDate, setReportDate] = useState(() => todayIso());

      useEffect(() => {
        if (!editing) setDraft(saved);
      }, [saved, editing]);

      function toggleSection(sectionId) {
        setExpandedSections((prev) => {
          const next = new Set(prev);
          if (next.has(sectionId)) next.delete(sectionId);
          else next.add(sectionId);
          return next;
        });
      }

      function patchDraft(updater) {
        setDraft((prev) => (typeof updater === "function" ? updater(prev) : updater));
      }

      function startEdit() {
        setDraft(saved);
        setEditing(true);
      }

      function cancelEdit() {
        setDraft(saved);
        setEditing(false);
      }

      function saveEdit() {
        const tidied = tidyWorkPlanSections(draft);
        const oldIds = new Set(collectWorkPlanTaskIds(saved));
        const newIds = new Set(collectWorkPlanTaskIds(tidied));
        const clearedTaskIds = [...oldIds].filter((id) => !newIds.has(id));
        onSectionsChange(tidied, clearedTaskIds);
        setEditing(false);
      }

      const list = editing ? draft : saved;

      function addSection() {
        const sectionId = uid();
        patchDraft((prev) => [...prev, { id: sectionId, title: "Jauna apakšsadaļa", tasks: [] }]);
        setExpandedSections((prev) => new Set([...prev, sectionId]));
      }

      function updateSection(sectionId, patch) {
        patchDraft((prev) => prev.map((s) => (s.id === sectionId ? { ...s, ...patch } : s)));
      }

      function deleteSection(sectionId) {
        const sec = list.find((s) => s.id === sectionId);
        if (!sec) return;
        if (!askConfirm(`Dzēst apakšsadaļu „${sec.title}" un visus tās uzdevumus?`)) return;
        patchDraft((prev) => prev.filter((s) => s.id !== sectionId));
        setExpandedSections((prev) => {
          const next = new Set(prev);
          next.delete(sectionId);
          return next;
        });
      }

      function addTask(sectionId) {
        patchDraft((prev) =>
          prev.map((s) =>
            s.id === sectionId
              ? { ...s, tasks: [...(s.tasks || []), { id: uid(), title: "Jauns uzdevums" }] }
              : s,
          ),
        );
        setExpandedSections((prev) => new Set([...prev, sectionId]));
      }

      function updateTask(sectionId, taskId, title) {
        patchDraft((prev) =>
          prev.map((s) =>
            s.id === sectionId
              ? { ...s, tasks: (s.tasks || []).map((t) => (t.id === taskId ? { ...t, title } : t)) }
              : s,
          ),
        );
      }

      function deleteTask(sectionId, taskId) {
        const sec = list.find((s) => s.id === sectionId);
        const task = sec?.tasks?.find((t) => t.id === taskId);
        if (!task) return;
        if (!askConfirm(`Dzēst darba plāna uzdevumu „${task.title}"?`)) return;
        patchDraft((prev) =>
          prev.map((s) =>
            s.id === sectionId ? { ...s, tasks: (s.tasks || []).filter((t) => t.id !== taskId) } : s,
          ),
        );
      }

      function renderReportBar(sec) {
        return html`
          <div class="pv-wp-report-bar">
            <label class="pv-wp-report-date">
              Atskaites datums (griezums)
              <input type="date" value=${reportDate} onChange=${(e) => setReportDate(e.target.value)} />
            </label>
            <button
              type="button"
              class="pv-btn"
              onClick=${() => exportWorkPlanSectionExcel(phases, saved, sec.id, reportDate)}
            >
              ⬇ Excel apkopojums
            </button>
          </div>
        `;
      }

      function renderSectionBody(sec) {
        if (editing) {
          return html`
            ${sec.tasks?.length
              ? html`
                  <div class="pv-wp-task-list">
                    ${sec.tasks.map(
                      (t) => html`
                        <div class="pv-wp-task-row" key=${t.id}>
                          <input
                            type="text"
                            value=${t.title}
                            onInput=${(e) => updateTask(sec.id, t.id, e.target.value)}
                            aria-label="Darba plāna uzdevuma nosaukums"
                          />
                          <button type="button" class="pv-btn danger" onClick=${() => deleteTask(sec.id, t.id)}>
                            Dzēst
                          </button>
                        </div>
                      `,
                    )}
                  </div>
                `
              : html`<p class="pv-wp-empty-tasks">Šajā apakšsadaļā vēl nav uzdevumu.</p>`}
            <div class="pv-toolbar" style=${{ marginTop: "0.5rem" }}>
              <button type="button" class="pv-btn" onClick=${() => addTask(sec.id)}>+ Pievienot uzdevumu</button>
              <button type="button" class="pv-btn danger" onClick=${() => deleteSection(sec.id)}>Dzēst apakšsadaļu</button>
            </div>
            ${renderReportBar(sec)}
          `;
        }
        return html`
          ${sec.tasks?.length
            ? html`<ul class="pv-wp-view-tasks">
                ${sec.tasks.map((t) => html`<li key=${t.id}>${t.title}</li>`)}
              </ul>`
            : html`<p class="pv-wp-empty-tasks">Nav uzdevumu.</p>`}
          ${renderReportBar(sec)}
        `;
      }

      function renderSection(sec) {
        const isOpen = expandedSections.has(sec.id);
        const taskCount = sec.tasks?.length || 0;
        return html`
          <div class="pv-wp-accordion" key=${sec.id}>
            <div class="pv-wp-accordion-head">
              <button
                type="button"
                class="pv-accordion-btn"
                aria-expanded=${isOpen}
                title=${isOpen ? "Sakļaut" : "Atvērt"}
                onClick=${() => toggleSection(sec.id)}
              >
                ${isOpen ? "▼" : "▶"}
              </button>
              ${editing
                ? html`
                    <input
                      type="text"
                      value=${sec.title}
                      onInput=${(e) => updateSection(sec.id, { title: e.target.value })}
                      aria-label="Apakšsadaļas nosaukums"
                    />
                  `
                : html`<span class="pv-wp-accordion-title">${sec.title}</span>`}
              <span class="pv-wp-accordion-meta">${taskCount} uzdev.</span>
            </div>
            ${isOpen ? html`<div class="pv-wp-accordion-body">${renderSectionBody(sec)}</div>` : null}
          </div>
        `;
      }

      return html`
        <div class="pv-wp-screen">
          <div class="pv-card">
            <h1>Darba plāna uzdevumi</h1>
            <p class="pv-wp-intro">
              Apakšsadaļas un uzdevumi, ko var piesaistīt uzdevumiem, posmiem un tabulām. Katrai apakšsadaļai —
              Excel atskaite uz izvēlēto datumu (izdarīts / notiek / plānots).
            </p>

            ${list.length
              ? html`<div class="pv-wp-sections">${list.map((sec) => renderSection(sec))}</div>`
              : html`<p class="pv-empty">Vēl nav apakšsadaļu.</p>`}

            <div class="pv-edit-footer">
              <div class="pv-wp-footer-actions">
                ${editing
                  ? html`
                      <button type="button" class="pv-btn primary" onClick=${saveEdit}>Saglabāt</button>
                      <button type="button" class="pv-btn" onClick=${cancelEdit}>Atcelt</button>
                      <button type="button" class="pv-btn" onClick=${addSection}>+ Pievienot apakšsadaļu</button>
                    `
                  : html`<button type="button" class="pv-btn" onClick=${startEdit}>Labot</button>`}
              </div>
            </div>
          </div>
        </div>
      `;
    }

    function OverdueBadge() {
      return html`<span class="pv-overdue-badge">Kavēts</span>`;
    }

    function SidebarPhaseItem({ node, depth, activePhaseId, onGoPhase }) {
      const overdue = phaseVisualState(node).overdue;
      const depthCls = depth === 2 ? "depth-2" : depth === 1 ? "depth-1" : "";
      return html`
        <button
          type="button"
          key=${node.id}
          class=${`pv-phase-item pv-sidebar-child ${depthCls} ${activePhaseId === node.id ? "active" : ""} ${phaseRowClass(node)}`}
          onClick=${() => onGoPhase(node.id)}
        >
          <div>
            <div class="pv-phase-item-line">
              <strong>
                <span class="pv-phase-num">${node.num}</span>
                <span class=${navKindTagClass(node.kind)}>${navKindLabel(node.kind)}</span>
                ${node.title}
              </strong>
              ${overdue ? ce(OverdueBadge) : null}
            </div>
            <div class="meta">${node.progress ?? 0}% · ${node.status || "—"}</div>
          </div>
        </button>
      `;
    }

    function SidebarPhaseAccordion({ tree, activePhaseId, expanded, onToggleExpand, onGoPhase }) {
      function renderDescendants(nodes, depth) {
        return (nodes || []).map((node) => html`
          <div key=${node.id}>
            ${ce(SidebarPhaseItem, { node, depth, activePhaseId, onGoPhase })}
            ${node.children?.length ? renderDescendants(node.children, depth + 1) : null}
          </div>
        `);
      }

      if (!tree?.length) {
        return html`<p class="pv-empty" style=${{ padding: "0.5rem 0", fontSize: "0.8rem" }}>Nav uzdevumu.</p>`;
      }

      return html`
        <div class="pv-sidebar-accordion">
          ${tree.map((uzdevums) => {
            const hasChildren = uzdevums.children?.length > 0;
            const isOpen = expanded.has(uzdevums.id);
            const overdue = phaseVisualState(uzdevums).overdue;
            return html`
              <div key=${uzdevums.id}>
                <div class="pv-sidebar-accordion-head">
                  ${hasChildren
                    ? html`
                        <button
                          type="button"
                          class="pv-accordion-btn"
                          aria-expanded=${isOpen}
                          title=${isOpen ? "Sakļaut posmus" : "Atvērt posmus"}
                          onClick=${() => onToggleExpand(uzdevums.id)}
                        >
                          ${isOpen ? "▼" : "▶"}
                        </button>
                      `
                    : html`<span class="pv-accordion-spacer"></span>`}
                  <button
                    type="button"
                    class=${`pv-phase-item pv-sidebar-uzdevums ${activePhaseId === uzdevums.id ? "active" : ""} ${phaseRowClass(uzdevums)}`}
                    onClick=${() => onGoPhase(uzdevums.id)}
                  >
                    <div>
                      <div class="pv-phase-item-line">
                        <strong>
                          <span class="pv-phase-num">${uzdevums.num}</span>
                          <span class=${navKindTagClass(uzdevums.kind)}>${navKindLabel(uzdevums.kind)}</span>
                          ${uzdevums.title}
                        </strong>
                        ${overdue ? ce(OverdueBadge) : null}
                      </div>
                      <div class="meta">${uzdevums.progress ?? 0}% · ${uzdevums.status || "—"}</div>
                    </div>
                  </button>
                </div>
                ${hasChildren && isOpen
                  ? html`<div class="pv-sidebar-accordion-body">${renderDescendants(uzdevums.children, 1)}</div>`
                  : null}
              </div>
            `;
          })}
        </div>
      `;
    }

    function PhaseAccordionList({ nodes, expanded, onToggleExpand, onGoPhase, onDelete, onEdit }) {
      if (!nodes?.length) {
        return html`<p class="pv-empty" style=${{ padding: "0.5rem" }}>Saraksts ir tukšs.</p>`;
      }

      return html`
        <div class="pv-accordion-wrap">
          ${nodes.map((node) => {
            const hasChildren = node.children?.length > 0;
            const isOpen = expanded.has(node.id);
            return html`
              <div key=${node.id}>
                <div class="pv-accordion-row">
                  ${hasChildren
                    ? html`
                        <button
                          type="button"
                          class="pv-accordion-btn"
                          aria-expanded=${isOpen}
                          title=${isOpen ? "Sakļaut" : "Atvērt"}
                          onClick=${() => onToggleExpand(node.id)}
                        >
                          ${isOpen ? "▼" : "▶"}
                        </button>
                      `
                    : html`<span class="pv-accordion-spacer"></span>`}
                  <div class="pv-phase-row ${phaseRowClass(node)} ${node.depth > 1 ? "sub-deep" : ""}" style=${{ flex: 1 }}>
                    <button type="button" class="pv-phase-row-main" onClick=${() => onGoPhase(node.id)}>
                      <strong>
                        <span class="pv-phase-num">${node.num}</span>
                        <span class=${navKindTagClass(node.kind)}>${navKindLabel(node.kind)}</span>
                        ${node.title}
                      </strong>
                      <div class="meta">
                        ${node.start || "—"} — ${node.end || "—"} · ${node.progress ?? 0}% · ${node.status || "—"}
                      </div>
                      ${node.description
                        ? html`<div class="meta" style=${{ marginTop: "0.2rem" }}>${node.description}</div>`
                        : null}
                    </button>
                    <div class="pv-phase-row-actions">
                      <button type="button" class="pv-btn ghost" onClick=${() => onEdit(node.id)}>Apskatīt/Labot</button>
                      <button
                        type="button"
                        class="pv-btn danger"
                        onClick=${() => {
                          const msg =
                            node.kind === "Uzdevums"
                              ? `Dzēst uzdevumu „${node.title}" un visus posmus/apakšposmus?`
                              : node.kind === "Posms"
                                ? `Dzēst posmu „${node.title}" un visus apakšposmus?`
                                : `Dzēst apakšposmu „${node.title}"?`;
                          if (!askConfirm(msg)) return;
                          onDelete(node);
                        }}
                      >
                        Dzēst
                      </button>
                    </div>
                  </div>
                </div>
                ${hasChildren && isOpen
                  ? html`
                      <div class="pv-accordion-children">
                        ${ce(PhaseAccordionList, {
                          nodes: node.children,
                          expanded,
                          onToggleExpand,
                          onGoPhase,
                          onDelete,
                          onEdit,
                        })}
                      </div>
                    `
                  : null}
              </div>
            `;
          })}
        </div>
      `;
    }

    function OverviewScreen({ phases, onGoPhase, patchPhase }) {
      return html`
        <div class="pv-screen-overview">
          ${ce(GlobalGantt, { phases, onGoPhase, onPatchPhase: patchPhase })}
        </div>
      `;
    }

    function PhaseSpace({
      phase,
      phases,
      workPlanSections,
      onGoOverview,
      onGoPhase,
      patchPhase,
      onRepositionPhase,
      deletePhase,
      addPhase,
      editOpen,
      onEditOpenChange,
    }) {
      if (!phase) return html`<div class="pv-empty">Elements nav atrasts</div>`;

      const kindMeta = phaseKindMeta(phase, phases);
      const ancestors = (() => {
        const chain = [];
        let cur = phase.parentId ? phases.find((p) => p.id === phase.parentId) : null;
        while (cur) {
          chain.unshift(cur);
          cur = cur.parentId ? phases.find((p) => p.id === cur.parentId) : null;
        }
        return chain;
      })();
      const phaseNum = flattenPhasesWithNumbers(phases).find((p) => p.id === phase.id)?.num || "";

      function confirmDelete() {
        const msg =
          kindMeta.kind === "Uzdevums"
            ? `Dzēst uzdevumu „${phase.title}" un visus posmus/apakšposmus?`
            : kindMeta.kind === "Posms"
              ? `Dzēst posmu „${phase.title}" un visus apakšposmus?`
              : `Dzēst apakšposmu „${phase.title}"?`;
        if (!askConfirm(msg)) return;
        deletePhase(phase.id);
      }

      function addContentBlock(type) {
        const b = createContentBlock(type);
        if (!b) return;
        patchPhase(phase.id, { blocks: [...(phase.blocks || []), b] });
      }

      return html`
        <div>
          <nav class="pv-breadcrumb" aria-label="Navigācija">
            <button type="button" class="pv-link" onClick=${onGoOverview}>Procesu vadība</button>
            <span>›</span>
            ${ancestors.map(
              (a) => html`
                <span key=${a.id}>
                  ${ce(PhaseLink, { phase: a, onGo: onGoPhase })}
                  <span>›</span>
                </span>
              `,
            )}
            <span><strong>${phaseNum ? `${phaseNum}. ` : ""}${phase.title}</strong></span>
          </nav>

          ${ce(ExportBar, { phases, workPlanSections })}

          ${ce(PhaseEditForm, {
            phase,
            phases,
            kindMeta,
            open: editOpen,
            onToggle: onEditOpenChange,
            onSave: (meta) => {
              const { num, numChanged, ...rest } = meta;
              if (numChanged && num) {
                onRepositionPhase(phase.id, num, rest);
              } else {
                patchPhase(phase.id, rest);
              }
            },
            onAddBlock: addContentBlock,
            onDelete: confirmDelete,
            onAddChild: (opts) => addPhase({ ...opts, open: true }),
            workPlanSections,
          })}

          ${ce(PhaseGantt, { phase, phases, onGoPhase, onPatchPhase: patchPhase })}

          ${ce(ContentBlocksBelow, {
            blocks: phase.blocks || [],
            parentTitle: phase.title,
            workPlanSections,
            onChange: (blocks) => patchPhase(phase.id, { blocks }),
          })}
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
          ? "Sinhronizēts ar Supabase (kopīgs visai komandai)"
          : syncStatus === "saving"
            ? "Saglabā Supabase…"
            : syncStatus === "error"
              ? "DB kļūda — dati lokāli"
              : "Tikai lokāli";

      const phases = state.phases || [];
      const workPlanSections = state.workPlanSections || [];
      const activePhase = useMemo(
        () => phases.find((p) => p.id === state.activePhaseId) || null,
        [phases, state.activePhaseId],
      );

      const goPhase = useCallback(
        (phaseId, toolId, openEdit = false) => {
          setState((p) => {
            const ph = p.phases.find((x) => x.id === phaseId);
            const defaultTool = toolId ?? ph?.tools?.[0]?.id ?? null;
            return {
              ...p,
              screen: "phase",
              activePhaseId: phaseId,
              activeToolId: defaultTool,
              phaseEditOpen: Boolean(openEdit),
            };
          });
        },
        [setState],
      );

      const goOverview = useCallback(() => {
        setState((p) => ({
          ...p,
          screen: "overview",
          activePhaseId: null,
          activeToolId: null,
          phaseEditOpen: false,
        }));
      }, [setState]);

      const goWorkPlan = useCallback(() => {
        setState((p) => ({
          ...p,
          screen: "workplan",
          activePhaseId: null,
          activeToolId: null,
          phaseEditOpen: false,
        }));
      }, [setState]);

      const goHistory = useCallback(() => {
        setState((p) => ({
          ...p,
          screen: "history",
          activePhaseId: null,
          activeToolId: null,
          phaseEditOpen: false,
        }));
      }, [setState]);

      const restoreHistory = useCallback(
        async (historyId) => {
          const sb = root.__PDD_SUPABASE__ ?? null;
          const out = await restoreRemoteHistory(sb, historyId);
          if (out.ok && out.state) {
            setState(out.state);
            saveState(out.state);
          }
          return out;
        },
        [setState],
      );

      const setWorkPlanSections = useCallback(
        (sections, clearedTaskIds) => {
          setState((prev) => ({
            ...prev,
            workPlanSections: sections,
            phases: clearedTaskIds?.length
              ? clearWorkPlanTaskFromPhases(prev.phases, clearedTaskIds)
              : prev.phases,
          }));
        },
        [setState],
      );

      const patchPhase = useCallback(
        (phaseId, patch) => {
          setState((prev) => {
            if ("progress" in patch && phaseHasChildPhases(prev.phases, phaseId)) {
              return prev;
            }
            let phases = prev.phases.map((p) => (p.id === phaseId ? { ...p, ...patch } : p));
            if ("progress" in patch) {
              phases = syncComputedProgressInPhases(phases);
            }
            return { ...prev, phases };
          });
        },
        [setState],
      );

      const repositionPhase = useCallback(
        (phaseId, numStr, metaPatch) => {
          setState((prev) => {
            let phases = repositionPhaseByNumber(phaseId, numStr, prev.phases);
            phases = phases.map((p) => (p.id === phaseId ? { ...p, ...metaPatch } : p));
            phases = syncComputedProgressInPhases(phases);
            return { ...prev, phases };
          });
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
            phases: syncComputedProgressInPhases([...prev.phases, phase]),
            screen: open ? "phase" : prev.screen,
            activePhaseId: open ? phase.id : prev.activePhaseId,
            activeToolId: open ? phase.tools[0]?.id ?? null : prev.activeToolId,
            phaseEditOpen: false,
          }));
          return phase.id;
        },
        [phases, setState],
      );

      const deletePhase = useCallback(
        (phaseId) => {
          setState((prev) => {
            const doomed = collectDescendantIds(prev.phases, phaseId);
            const nextPhases = syncComputedProgressInPhases(deletePhaseFromList(prev.phases, phaseId));
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

      const addNewUzdevums = useCallback(() => {
        addPhase({ title: "Jauns uzdevums", parentId: null, open: true });
      }, [addPhase]);

      const phaseTree = useMemo(() => buildPhaseTree(phases), [phases]);
      const [sidebarExpanded, setSidebarExpanded] = useState(() => new Set());

      useEffect(() => {
        const overdueIds = overdueExpandedTaskIds(phaseTree);
        if (!overdueIds.size) return;
        setSidebarExpanded((prev) => {
          const next = new Set(prev);
          let changed = false;
          for (const id of overdueIds) {
            if (!next.has(id)) {
              next.add(id);
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      }, [phaseTree]);

      useEffect(() => {
        if (!state.activePhaseId) return;
        let cur = phases.find((p) => p.id === state.activePhaseId);
        if (!cur) return;
        while (cur.parentId) {
          cur = phases.find((p) => p.id === cur.parentId);
          if (!cur) return;
        }
        setSidebarExpanded((prev) => {
          if (prev.has(cur.id)) return prev;
          const next = new Set(prev);
          next.add(cur.id);
          return next;
        });
      }, [state.activePhaseId, phases]);

      const toggleSidebarExpand = useCallback((taskId) => {
        setSidebarExpanded((prev) => {
          const next = new Set(prev);
          if (next.has(taskId)) next.delete(taskId);
          else next.add(taskId);
          return next;
        });
      }, []);

      return html`
        <div class="pv-root">
          <div class="pv-shell">
            <aside class="pv-sidebar">
              <div class="pv-brand">
                <h2>Procesu vadība</h2>
                <p style=${{ margin: "0.35rem 0 0", fontSize: "0.72rem", opacity: 0.9 }}>${syncLabel}</p>
                <p class="pv-sync-note">Visi uzdevumi, teksti, tabulas un darba plāns — kopīgi Komandas lietotājiem.</p>
              </div>
              <button
                type="button"
                class=${`pv-nav-btn ${state.screen === "overview" ? "active" : ""}`}
                onClick=${goOverview}
              >
                📊 Pārskats un ${GANTT_CHART_LABEL}${ce(GanttSublabel)}
              </button>
              <div class="pv-sidebar-tasks">
                <div class="pv-phase-list">
                  ${ce(SidebarPhaseAccordion, {
                    tree: phaseTree,
                    activePhaseId: state.activePhaseId,
                    expanded: sidebarExpanded,
                    onToggleExpand: toggleSidebarExpand,
                    onGoPhase: goPhase,
                  })}
                </div>
                <button type="button" class="pv-add-btn" onClick=${addNewUzdevums}>+ Jauns uzdevums</button>
              </div>
              <button
                type="button"
                class=${`pv-nav-btn ${state.screen === "workplan" ? "active" : ""}`}
                onClick=${goWorkPlan}
              >
                📋 Darba plāna uzdevumi
              </button>
              <button
                type="button"
                class=${`pv-nav-btn ${state.screen === "history" ? "active" : ""}`}
                onClick=${goHistory}
              >
                📜 Vēsture un atjaunošana
              </button>
            </aside>
            <main class=${`pv-main ${state.screen === "overview" ? "pv-main-overview" : ""}`}>
              ${state.screen === "overview"
                ? ce(OverviewScreen, {
                    phases,
                    onGoPhase: goPhase,
                    patchPhase,
                  })
                : state.screen === "workplan"
                  ? ce(WorkPlanScreen, {
                      sections: workPlanSections,
                      phases,
                      onSectionsChange: setWorkPlanSections,
                    })
                  : state.screen === "history"
                    ? ce(HistoryScreen, {
                        onGoOverview: goOverview,
                        onRestore: restoreHistory,
                      })
                    : ce(PhaseSpace, {
                      phase: activePhase,
                      phases,
                      workPlanSections,
                      onGoOverview: goOverview,
                      onGoPhase: goPhase,
                      patchPhase,
                      onRepositionPhase: repositionPhase,
                      deletePhase,
                      addPhase,
                      editOpen: Boolean(state.phaseEditOpen),
                      onEditOpenChange: (open) => setState((p) => ({ ...p, phaseEditOpen: open })),
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
    ensureSupabaseClient,
    getSupabaseConfig,
    saveState,
    fetchRemoteState,
    saveRemoteState,
    fetchRemoteHistory,
    restoreRemoteHistory,
    exportProcesuVadibaExcel,
    exportProcesuVadibaPdf,
    exportGanttExcel,
    exportGanttPdf,
    exportGanttImage,
    exportWorkPlanSectionExcel,
    collectSectionReportRows,
    exportContentBlockExcel,
    exportContentBlockPdf,
    repositionPhaseByNumber,
    validatePhaseNumber,
    flattenPhasesWithNumbers,
    phaseVisualState,
    resetState() {
      if (typeof localStorage !== "undefined") localStorage.removeItem(LS_KEY);
      return defaultState();
    },
    READY: true,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
