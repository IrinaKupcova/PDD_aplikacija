/**
 * Darba uzdevumi → IaD ieteikumi
 * Viss atrodas šajā failā.
 */
(function () {
  const LS_IAD_KEY = "pdd_iad_ieteikumi_v2";
  const LS_IAD_UI_KEY = "pdd_iad_ui_v1";
  const TABLE_IAD_CANDIDATES = ["IAD", "iad", "Iad"];

  const IAD_ALIAS = {
    numurs: ["IAD_numurs", "iad_numurs", "IAD numurs", "numurs", "Nr", "nr"],
    nosaukums: ["IAD_nosaukums", "iad_nosaukums", "IAD nosaukums", "nosaukums"],
    termins: ["IAD_termins", "iad_termins", "IAD_ieteikuma_termins", "Termins", "termins"],
    atbildigais: ["Atbildīgais", "Atbildigais", "atbildīgais", "atbildigais"],
    statuss: ["IAD_statuss", "iad_statuss", "Statuss", "statuss", "IAD statuss"],
    datums: ["IAD_datums", "iad_datums", "IaD datums", "datums"],
    lidzatbildigais: ["Līdzatbildīgais", "Lidzatbildigais", "līdzatbildīgais", "lidzatbildigais"],
    kompetencesUzdevums: ["IAD_PDD_komp_uzdevums", "iad_pdd_komp_uzdevums", "IAD_PDD_kompetences_uzdevums", "IAD PDD komp uzdevums"],
    starptermins: ["Starptermins", "starptermins", "Starptermiņš", "starptermiņš"],
    planotasAktivitates: ["Planotas_aktivitates", "Plānotās_aktivitātes", "Planotās_aktivitātes", "Planotas aktivitates"],
    piezimes: ["Piezimes", "Piezīmes", "piezimes", "piezīmes"],
    pielikumi: ["Pielikumi", "pielikumi", "Pielikumi_json", "pielikumi_json"],
  };

  const WRITE_DEFAULT = {
    numurs: "IAD_numurs",
    nosaukums: "IAD_nosaukums",
    termins: "Termins",
    atbildigais: "Atbildigais",
    statuss: "IAD_statuss",
    datums: "IAD_datums",
    lidzatbildigais: "Lidzatbildigais",
    kompetencesUzdevums: "IAD_PDD_komp_uzdevums",
    starptermins: "Starptermins",
    planotasAktivitates: "Planotas_aktivitates",
    piezimes: "Piezimes",
    pielikumi: "Pielikumi",
  };

  let runtimeCols = { ...WRITE_DEFAULT };
  let runtimeIdCol = "id";
  const ID_COLUMN_CANDIDATES = ["id", "ID", "Id", "iad_id", "IAD_id", "IAD.id"];
  let resolvedIadTable = null;
  let runtimeColsProbed = false;

  function idColumnsToTry() {
    return Array.from(
      new Set([runtimeIdCol, ...ID_COLUMN_CANDIDATES].map((x) => String(x ?? "").trim()).filter(Boolean))
    );
  }

  function normalizeIdColumnName(name) {
    return String(name ?? "").trim().replace(/^"+|"+$/g, "");
  }

  function applyIdFilter(query, col, value) {
    const idCol = normalizeIdColumnName(col);
    if (!idCol) return query;
    if (idCol.includes(".")) return query.filter(`"${idCol}"`, "eq", String(value ?? ""));
    return query.eq(idCol, value);
  }

  function pickByAliases(row, aliases, fallback = "") {
    const src = row && typeof row === "object" ? row : {};
    const normalizeKey = (v) =>
      String(v ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
    for (const k of aliases) {
      if (Object.prototype.hasOwnProperty.call(src, k)) return src[k];
    }
    const srcKeys = Object.keys(src);
    const normalizedMap = new Map(srcKeys.map((k) => [normalizeKey(k), k]));
    for (const a of aliases) {
      const hit = normalizedMap.get(normalizeKey(a));
      if (hit && Object.prototype.hasOwnProperty.call(src, hit)) return src[hit];
    }
    return fallback;
  }

  async function probeExistingColumn(sb, table, aliases) {
    for (const col of aliases) {
      const name = String(col ?? "").trim();
      if (!name || name.includes(".")) continue;
      const { error } = await sb.from(table).select(name).limit(1);
      if (!error) return name;
    }
    return "";
  }

  async function ensureRuntimeColsByProbe(sb, table) {
    if (!sb || !table || runtimeColsProbed) return;
    const next = { ...runtimeCols };
    const probes = [
      ["numurs", [...IAD_ALIAS.numurs, WRITE_DEFAULT.numurs]],
      ["nosaukums", [...IAD_ALIAS.nosaukums, WRITE_DEFAULT.nosaukums]],
      ["termins", [...IAD_ALIAS.termins, WRITE_DEFAULT.termins]],
      ["atbildigais", [...IAD_ALIAS.atbildigais, WRITE_DEFAULT.atbildigais]],
      ["statuss", [...IAD_ALIAS.statuss, WRITE_DEFAULT.statuss]],
      ["datums", [...IAD_ALIAS.datums, WRITE_DEFAULT.datums]],
      ["lidzatbildigais", [...IAD_ALIAS.lidzatbildigais, WRITE_DEFAULT.lidzatbildigais]],
      ["kompetencesUzdevums", [...IAD_ALIAS.kompetencesUzdevums, WRITE_DEFAULT.kompetencesUzdevums]],
      ["starptermins", [...IAD_ALIAS.starptermins, WRITE_DEFAULT.starptermins]],
      ["planotasAktivitates", [...IAD_ALIAS.planotasAktivitates, WRITE_DEFAULT.planotasAktivitates]],
      ["piezimes", [...IAD_ALIAS.piezimes, WRITE_DEFAULT.piezimes]],
      ["pielikumi", [...IAD_ALIAS.pielikumi, WRITE_DEFAULT.pielikumi]],
    ];
    for (const [key, aliases] of probes) {
      const found = await probeExistingColumn(sb, table, aliases);
      if (found) next[key] = found;
    }
    const idFound = await probeExistingColumn(sb, table, ["id", "ID", "Id", "iad_id", "IAD_id"]);
    if (idFound) runtimeIdCol = idFound;
    runtimeCols = next;
    runtimeColsProbed = true;
  }

  function toStr(v, maxLen) {
    const s = String(v ?? "").trim();
    return typeof maxLen === "number" ? s.slice(0, maxLen) : s;
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

  function joinNameList(list) {
    return Array.from(new Set((Array.isArray(list) ? list : []).map((x) => String(x || "").trim()).filter(Boolean))).join(", ");
  }

  function toDateInputValue(v) {
    const s = String(v ?? "").trim();
    if (!s) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return "";
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  function displayDate(v) {
    const s = toDateInputValue(v);
    if (!s) return String(v ?? "").trim() || "—";
    const [y, m, d] = s.split("-");
    return `${d}.${m}.${y}`;
  }

  function normalizeTextBlock(v) {
    return String(v ?? "").replace(/\r\n/g, "\n").trim();
  }

  function parseAttachments(v) {
    if (Array.isArray(v)) return v.filter(Boolean);
    const raw = String(v ?? "").trim();
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            return {
              name: String(item.name ?? "").trim(),
              dataUrl: String(item.dataUrl ?? "").trim(),
              size: Number(item.size ?? 0) || 0,
              type: String(item.type ?? "").trim(),
            };
          })
          .filter((item) => item && item.name && item.dataUrl);
      }
    } catch {
      // ignore non-json legacy values
    }
    return raw
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => ({ name: line, dataUrl: "", size: 0, type: "" }));
  }

  function serializeAttachments(list) {
    return JSON.stringify(
      (Array.isArray(list) ? list : [])
        .map((item) => ({
          name: String(item?.name ?? "").trim(),
          dataUrl: String(item?.dataUrl ?? "").trim(),
          size: Number(item?.size ?? 0) || 0,
          type: String(item?.type ?? "").trim(),
        }))
        .filter((item) => item.name)
    );
  }

  function attachmentLabel(item) {
    const size = Number(item?.size ?? 0);
    if (!size) return String(item?.name ?? "").trim();
    const kb = Math.max(1, Math.round(size / 1024));
    return `${String(item?.name ?? "").trim()} (${kb} KB)`;
  }

  function listTeamOptions() {
    try {
      const rows = globalThis.KOMANDA?.loadTeamUsers?.() ?? [];
      return Array.from(
        new Map(
          rows
            .map((u) => String(u?.["Vārds uzvārds"] ?? u?.full_name ?? "").trim())
            .filter(Boolean)
            .map((name) => [name.toLowerCase(), name])
        ).values()
      ).sort((a, b) => a.localeCompare(b, "lv"));
    } catch {
      return [];
    }
  }

  async function fetchTeamOptionsFromSupabase(sb) {
    if (!sb) return [];
    try {
      const { data, error } = await sb.from("users").select("*");
      if (error) return [];
      const rows = Array.isArray(data) ? data : [];
      return Array.from(
        new Map(
          rows
            .map((u) => String(u?.["Vārds uzvārds"] ?? u?.full_name ?? u?.name ?? "").trim())
            .filter(Boolean)
            .map((name) => [name.toLowerCase(), name])
        ).values()
      ).sort((a, b) => a.localeCompare(b, "lv"));
    } catch {
      return [];
    }
  }

  function prettyDbLabel(key) {
    const k = String(key ?? "");
    const known = {
      IAD_numurs: "IaD numurs",
      iad_numurs: "IaD numurs",
      IAD_nosaukums: "IaD nosaukums",
      iad_nosaukums: "IaD nosaukums",
      IAD_termins: "IaD ieteikuma termiņš",
      IAD_ieteikuma_termins: "IaD ieteikuma termiņš",
      Termins: "IaD ieteikuma termiņš",
      Atbildigais: "Atbildīgais",
      "Atbildīgais": "Atbildīgais",
      IAD_statuss: "IaD statuss",
      Statuss: "IaD statuss",
      IAD_datums: "IaD datums",
      datums: "IaD datums",
      Lidzatbildigais: "Līdzatbildīgais",
      "Līdzatbildīgais": "Līdzatbildīgais",
      IAD_PDD_komp_uzdevums: "IaD PDD kompetences uzdevums",
      IAD_PDD_kompetences_uzdevums: "IaD PDD kompetences uzdevums",
      "IAD PDD komp uzdevums": "IaD PDD kompetences uzdevums",
      Starptermins: "Starptermiņš",
      "Starptermiņš": "Starptermiņš",
      Planotas_aktivitates: "Plānotās aktivitātes",
      "Plānotās_aktivitātes": "Plānotās aktivitātes",
      "Planotas aktivitates": "Plānotās aktivitātes",
      Piezimes: "Piezīmes",
      "Piezīmes": "Piezīmes",
      Pielikumi: "Pielikumi",
      Pielikumi_json: "Pielikumi",
      created_at: "Izveidots",
      id: "ID",
      "IAD.id": "IAD ID",
    };
    if (known[k]) return known[k];
    return k.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  }

  function detectRuntimeColsFromRow(row) {
    const src = row && typeof row === "object" ? row : {};
    const keys = Object.keys(src);
    const normalizeKey = (v) =>
      String(v ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
    function resolve(name, aliases) {
      const found = keys.find((k) =>
        aliases.some((a) => normalizeKey(a) === normalizeKey(k) || String(a).toLowerCase() === String(k).toLowerCase())
      );
      if (found) runtimeCols[name] = found;
    }
    resolve("numurs", IAD_ALIAS.numurs);
    resolve("nosaukums", IAD_ALIAS.nosaukums);
    resolve("termins", IAD_ALIAS.termins);
    resolve("atbildigais", IAD_ALIAS.atbildigais);
    resolve("statuss", IAD_ALIAS.statuss);
    resolve("datums", IAD_ALIAS.datums);
    resolve("lidzatbildigais", IAD_ALIAS.lidzatbildigais);
    resolve("kompetencesUzdevums", IAD_ALIAS.kompetencesUzdevums);
    resolve("starptermins", IAD_ALIAS.starptermins);
    resolve("planotasAktivitates", IAD_ALIAS.planotasAktivitates);
    resolve("piezimes", IAD_ALIAS.piezimes);
    resolve("pielikumi", IAD_ALIAS.pielikumi);
    const idAliases = ["id", "ID", "Id", "iad_id", "IAD_id", "IAD.id"];
    const idFound = keys.find((k) => idAliases.some((a) => String(a).toLowerCase() === String(k).toLowerCase()));
    if (idFound && !String(idFound).includes(".")) runtimeIdCol = idFound;
  }

  function rowIdValue(r) {
    return pickByAliases(r, ["id", "ID", "Id", "iad_id", "IAD_id", "IAD.id"], null);
  }

  function normalizeIadRow(r) {
    return {
      ...r,
      id: rowIdValue(r),
      IAD_numurs: toStr(pickByAliases(r, IAD_ALIAS.numurs), 160),
      IAD_nosaukums: toStr(pickByAliases(r, IAD_ALIAS.nosaukums), 600),
      IAD_termins: toDateInputValue(pickByAliases(r, IAD_ALIAS.termins)),
      Atbildigais: joinNameList(parseNameList(pickByAliases(r, IAD_ALIAS.atbildigais))),
      IAD_statuss: statusLabel(pickByAliases(r, IAD_ALIAS.statuss, "Aktīvs")),
      IAD_datums: toDateInputValue(pickByAliases(r, IAD_ALIAS.datums)),
      Lidzatbildigais: joinNameList(parseNameList(pickByAliases(r, IAD_ALIAS.lidzatbildigais))),
      IAD_PDD_komp_uzdevums: normalizeTextBlock(pickByAliases(r, IAD_ALIAS.kompetencesUzdevums)),
      Starptermins: toDateInputValue(pickByAliases(r, IAD_ALIAS.starptermins)),
      Planotas_aktivitates: normalizeTextBlock(pickByAliases(r, IAD_ALIAS.planotasAktivitates)),
      Piezimes: normalizeTextBlock(pickByAliases(r, IAD_ALIAS.piezimes)),
      Pielikumi: parseAttachments(pickByAliases(r, IAD_ALIAS.pielikumi)),
      created_at: r?.created_at ?? null,
    };
  }

  function emptyDraft() {
    return {
      IAD_numurs: "",
      IAD_nosaukums: "",
      IAD_termins: "",
      Atbildigais: "",
      IAD_statuss: "Aktīvs",
      IAD_datums: "",
      Lidzatbildigais: "",
      IAD_PDD_komp_uzdevums: "",
      Starptermins: "",
      Planotas_aktivitates: "",
      Piezimes: "",
      Pielikumi: [],
    };
  }

  function payloadFromDraft(d, opts = {}) {
    const p = {};
    const includeGeneratedId = Boolean(opts?.includeGeneratedId);
    if (includeGeneratedId) {
      const newId = localId();
      p.id = newId;
      p.IAD_id = newId;
      p.iad_id = newId;
    }
    p[runtimeCols.numurs] = toStr(d?.IAD_numurs, 160) || null;
    p[runtimeCols.nosaukums] = toStr(d?.IAD_nosaukums, 600) || null;
    p[runtimeCols.termins] = toDateInputValue(d?.IAD_termins) || null;
    p[runtimeCols.atbildigais] = joinNameList(parseNameList(d?.Atbildigais)) || null;
    p[runtimeCols.statuss] = statusLabel(d?.IAD_statuss) || "Aktīvs";
    p[runtimeCols.datums] = toDateInputValue(d?.IAD_datums) || null;
    p[runtimeCols.lidzatbildigais] = joinNameList(parseNameList(d?.Lidzatbildigais)) || null;
    p[runtimeCols.kompetencesUzdevums] = normalizeTextBlock(d?.IAD_PDD_komp_uzdevums) || null;
    p[runtimeCols.starptermins] = toDateInputValue(d?.Starptermins) || null;
    p[runtimeCols.planotasAktivitates] = normalizeTextBlock(d?.Planotas_aktivitates) || null;
    p[runtimeCols.piezimes] = normalizeTextBlock(d?.Piezimes) || null;
    p[runtimeCols.pielikumi] = serializeAttachments(d?.Pielikumi);
    return p;
  }

  function loadLocalRows() {
    try {
      const raw = localStorage.getItem(LS_IAD_KEY);
      const rows = raw ? JSON.parse(raw) : [];
      return Array.isArray(rows) ? rows.map(normalizeIadRow) : [];
    } catch {
      return [];
    }
  }

  function loadIadUiState() {
    try {
      const raw = localStorage.getItem(LS_IAD_UI_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return {
        openCurrent: Boolean(parsed?.openCurrent),
        openDone: Boolean(parsed?.openDone),
        pinCurrent: Boolean(parsed?.pinCurrent),
        pinDone: Boolean(parsed?.pinDone),
      };
    } catch {
      return { openCurrent: false, openDone: false, pinCurrent: false, pinDone: false };
    }
  }

  function saveIadUiState(nextState) {
    try {
      localStorage.setItem(
        LS_IAD_UI_KEY,
        JSON.stringify({
          openCurrent: Boolean(nextState?.openCurrent),
          openDone: Boolean(nextState?.openDone),
          pinCurrent: Boolean(nextState?.pinCurrent),
          pinDone: Boolean(nextState?.pinDone),
        })
      );
    } catch {
      // ignore
    }
  }

  function saveLocalRows(rows) {
    try {
      localStorage.setItem(LS_IAD_KEY, JSON.stringify(Array.isArray(rows) ? rows : []));
    } catch {
      // ignore
    }
  }

  function localId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `iad-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  }

  function missingColumnFromError(err) {
    const msg = String(err?.message ?? "");
    const m1 = msg.match(/Could not find the '([^']+)' column/i);
    if (m1?.[1]) return String(m1[1]);
    const m2 = msg.match(/column ["']?([^"'\s]+)["']? does not exist/i);
    if (m2?.[1]) return String(m2[1]);
    const m3 = msg.match(/column ["']?([^"']+)["']?\s+of relation\s+["'][^"']+["']\s+does not exist/i);
    if (m3?.[1]) return String(m3[1]).trim();
    return "";
  }

  async function resolveIadTableName(sb) {
    if (resolvedIadTable) return resolvedIadTable;
    let lastErr = null;
    for (const t of TABLE_IAD_CANDIDATES) {
      const { error } = await sb.from(t).select("*").limit(1);
      if (!error) {
        resolvedIadTable = t;
        return t;
      }
      lastErr = error;
    }
    throw new Error(`IAD tabula nav atrasta. ${lastErr?.message || ""}`.trim());
  }

  async function insertWithPruning(sb, table, payload, tries = 12) {
    let p = { ...payload };
    if (Object.keys(p).length === 0) return { error: new Error("Nav nevienas derīgas kolonnas saglabāšanai.") };
    let lastErr = null;
    for (let i = 0; i < tries; i += 1) {
      const { data, error } = await sb.from(table).insert(p).select("*").limit(1).single();
      if (!error) return { data };
      lastErr = error;
      const missing = missingColumnFromError(error);
      if (!missing) break;
      const key = Object.keys(p).find((k) => String(k).toLowerCase() === missing.toLowerCase());
      if (!key) break;
      delete p[key];
      if (Object.keys(p).length === 0) break;
    }
    return { error: lastErr };
  }

  async function updateWithPruning(sb, table, id, payload, tries = 12) {
    let p = { ...payload };
    if (Object.keys(p).length === 0) return { error: new Error("Nav nevienas derīgas kolonnas atjaunošanai.") };
    let lastErr = null;
    for (let i = 0; i < tries; i += 1) {
      let prunedPayload = false;
      const idCols = idColumnsToTry();
      for (const idCol of idCols) {
        const req = applyIdFilter(sb.from(table).update(p), idCol, id);
        const { data, error } = await req.select("*").limit(1).maybeSingle();
        if (!error && data) {
          runtimeIdCol = normalizeIdColumnName(idCol);
          return { data };
        }
        if (!error && !data) {
          lastErr = new Error("Ieraksts netika atrasts atjaunošanai.");
          continue;
        }
        lastErr = error;
        const missing = missingColumnFromError(error);
        if (!missing) continue;
        const payloadKey = Object.keys(p).find((k) => String(k).toLowerCase() === missing.toLowerCase());
        if (payloadKey) {
          delete p[payloadKey];
          prunedPayload = true;
          break;
        }
      }
      if (!prunedPayload) break;
      if (Object.keys(p).length === 0) break;
    }
    return { error: lastErr };
  }

  async function fetchIadRowsFromSupabase(sb) {
    const table = await resolveIadTableName(sb);
    await ensureRuntimeColsByProbe(sb, table);
    const { data, error } = await sb.from(table).select("*");
    if (error) throw error;
    const list = Array.isArray(data) ? data : [];
    if (list.length) detectRuntimeColsFromRow(list[0]);
    return list
      .map(normalizeIadRow)
      .sort((a, b) => {
        const bn = Number(b?.id);
        const an = Number(a?.id);
        if (Number.isFinite(an) && Number.isFinite(bn)) return bn - an;
        const bt = String(b?.created_at || "");
        const at = String(a?.created_at || "");
        if (bt && at) return bt.localeCompare(at);
        return String(b?.id || "").localeCompare(String(a?.id || ""));
      });
  }

  async function insertIadRowToSupabase(sb, draft) {
    const table = await resolveIadTableName(sb);
    await ensureRuntimeColsByProbe(sb, table);
    const payload = payloadFromDraft(draft, { includeGeneratedId: true });
    const r = await insertWithPruning(sb, table, payload);
    if (r.error) throw r.error;
    detectRuntimeColsFromRow(r.data || {});
    return normalizeIadRow(r.data);
  }

  async function updateIadRowInSupabase(sb, id, draft) {
    const table = await resolveIadTableName(sb);
    await ensureRuntimeColsByProbe(sb, table);
    const payload = payloadFromDraft(draft);
    const r = await updateWithPruning(sb, table, id, payload);
    if (r.error) throw r.error;
    detectRuntimeColsFromRow(r.data || {});
    return normalizeIadRow(r.data);
  }

  async function updateIadRowByNaturalKeyInSupabase(sb, originalRow, draft) {
    const table = await resolveIadTableName(sb);
    await ensureRuntimeColsByProbe(sb, table);
    const payload = payloadFromDraft(draft);
    let query = sb.from(table).update(payload);
    const numurs = toStr(originalRow?.IAD_numurs);
    const nosaukums = toStr(originalRow?.IAD_nosaukums);
    if (numurs) query = query.eq(runtimeCols.numurs, numurs);
    if (nosaukums) query = query.eq(runtimeCols.nosaukums, nosaukums);
    const { data, error } = await query.select("*").limit(1).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Ieraksts netika atrasts labošanai.");
    detectRuntimeColsFromRow(data || {});
    return normalizeIadRow(data);
  }

  async function deleteIadRowFromSupabase(sb, id) {
    const table = await resolveIadTableName(sb);
    await ensureRuntimeColsByProbe(sb, table);
    let lastErr = null;
    for (const idCol of idColumnsToTry()) {
      const req = applyIdFilter(sb.from(table).delete(), idCol, id);
      const { data, error } = await req.select("*").limit(1).maybeSingle();
      if (!error && data) {
        runtimeIdCol = normalizeIdColumnName(idCol);
        return;
      }
      if (!error && !data) {
        lastErr = new Error("Ieraksts dzēšanai netika atrasts.");
        continue;
      }
      lastErr = error;
      const missing = missingColumnFromError(error);
      if (missing) continue;
    }
    throw lastErr || new Error("Neizdevās dzēst IaD ierakstu.");
  }

  function isTodayInTaskRange(row, todayIso) {
    const term = toDateInputValue(row?.IAD_termins);
    const dt = toDateInputValue(row?.IAD_datums);
    if (dt && term) {
      return dt <= todayIso && todayIso <= term;
    }
    if (dt && !term) return dt === todayIso;
    if (!dt && term) return term === todayIso;
    return false;
  }

  function buildTodayTaskItems(rows) {
    const todayIso = toDateInputValue(new Date());
    return (Array.isArray(rows) ? rows : [])
      .filter((r) => !isInactiveStatus(r?.IAD_statuss))
      .filter((r) => isTodayInTaskRange(r, todayIso))
      .map((r) => ({
        key: `iad:${String(r?.id ?? r?.IAD_numurs ?? r?.IAD_nosaukums ?? "")}`,
        module: "IaD ieteikumi",
        title: String(r?.IAD_nosaukums || "IaD ieteikums"),
        subtitle: String(r?.IAD_numurs || "").trim(),
        dueDate: toDateInputValue(r?.IAD_termins) || toDateInputValue(r?.IAD_datums) || "",
        target: {
          submodule: "iad",
          rowId: r?.id ?? null,
          rowNumurs: String(r?.IAD_numurs || "").trim(),
          rowNosaukums: String(r?.IAD_nosaukums || "").trim(),
        },
      }));
  }

  function ensureStyles() {
    if (typeof document === "undefined") return;
    if (document.getElementById("pdd-iad-style-v2")) return;
    const s = document.createElement("style");
    s.id = "pdd-iad-style-v2";
    s.textContent = `
      .iad-wrap { display:grid; gap: 1rem; }
      .iad-head { border:1px solid #bfdbfe; background: linear-gradient(180deg,#eff6ff,#e0f2fe); border-radius: 12px; padding: .8rem .9rem; }
      .iad-head h2 { margin:0; font-size:1.05rem; color:#0c4a6e; }
      .iad-subtabs { margin-top:.7rem; display:flex; gap:.45rem; flex-wrap:wrap; }
      .iad-subtab { border:1px solid #93c5fd; background:#f8fbff; color:#0c4a6e; border-radius:999px; padding:.35rem .65rem; font-size:.8rem; }
      .iad-subtab.active { background:#0ea5e9; border-color:#0284c7; color:#fff; }
      .iad-module-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:.7rem; margin-top:.6rem; }
      .iad-module-card { text-align:left; border:1px solid #93c5fd; background:#f8fbff; color:#0c4a6e; border-radius:12px; padding:.75rem; cursor:pointer; }
      .iad-module-card h3 { margin:0 0 .35rem; font-size:.95rem; color:#075985; }
      .iad-module-card p { margin:0; font-size:.82rem; color:#155e75; }
      .iad-module-card[disabled] { opacity:.6; cursor:not-allowed; }
      .iad-panel { border:1px solid #bae6fd; border-radius:12px; background:#f0f9ff; padding:.8rem; }
      .iad-table-wrap { overflow:auto; border:1px solid #cbd5e1; border-radius:10px; background:#fff; }
      .iad-table { width:100%; border-collapse:collapse; font-size:.84rem; min-width: 860px; }
      .iad-table th, .iad-table td { border-bottom:1px solid #e2e8f0; padding:.45rem .5rem; text-align:left; vertical-align:top; }
      .iad-table th { background:#e0f2fe; color:#0c4a6e; position:sticky; top:0; z-index:1; }
      .iad-row-focus {
        background: #fff7ed;
        box-shadow: inset 0 0 0 1px #fb923c;
      }
      .iad-status { display:inline-block; border-radius:999px; padding:1px 8px; font-size:.75rem; border:1px solid #7dd3fc; background:#ecfeff; color:#0e7490; }
      .iad-status.done { border-color:#86efac; background:#f0fdf4; color:#166534; }
      .iad-empty { color:#64748b; font-style:italic; padding:.55rem .6rem; }
      .iad-modal-bg { position:fixed; inset:0; background:rgba(2,6,23,.58); display:flex; align-items:center; justify-content:center; z-index:100; padding:1rem; }
      .iad-modal { width:min(980px,96vw); max-height:92vh; overflow:auto; border:1px solid #94a3b8; border-radius:12px; background:#fff; padding:.9rem; }
      .iad-card-grid { display:grid; gap:.55rem; margin-top:.55rem; }
      .iad-kv {
        display:grid;
        grid-template-columns:minmax(180px, 240px) minmax(0,1fr);
        gap:.7rem;
        align-items:start;
        padding:.6rem .65rem;
        border:1px solid #dbeafe;
        border-radius:12px;
        background:linear-gradient(180deg,#f8fbff,#f0f9ff);
        font-size:.84rem;
      }
      .iad-kv strong {
        display:flex;
        align-items:center;
        min-height:100%;
        font-size:.76rem;
        color:#475569;
        text-transform:uppercase;
        letter-spacing:.03em;
      }
      .iad-kv-value {
        min-height:2.5rem;
        padding:.55rem .65rem;
        border:1px solid #bfdbfe;
        border-radius:10px;
        background:#fff;
        color:#0f172a;
        white-space:pre-wrap;
        word-break:break-word;
        box-shadow:inset 0 1px 0 rgba(255,255,255,0.6);
      }
      @media (max-width: 720px) {
        .iad-kv { grid-template-columns:1fr; gap:.4rem; }
      }
      .iad-kv-value.editable {
        padding:0;
        border:none;
        background:transparent;
        box-shadow:none;
      }
      .iad-kv-input,
      .iad-kv-textarea,
      .iad-kv-select {
        width:100%;
        border:1px solid #bfdbfe;
        border-radius:10px;
        background:#fff;
        color:#0f172a;
        padding:.6rem .7rem;
        font:inherit;
      }
      .iad-kv-textarea {
        min-height:120px;
        resize:vertical;
        white-space:pre-wrap;
      }
      .iad-attachments {
        display:grid;
        gap:.5rem;
      }
      .iad-attachment-list {
        display:grid;
        gap:.4rem;
      }
      .iad-attachment-item {
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:.5rem;
        border:1px solid #dbeafe;
        border-radius:10px;
        padding:.45rem .55rem;
        background:#fff;
      }
      .iad-attachment-name {
        min-width:0;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }
      .iad-team-select { border:1px solid #cbd5e1; border-radius:10px; background:#f8fafc; padding:.5rem .55rem; display:grid; gap:.35rem; max-height:180px; overflow:auto; }
      .iad-team-option { display:flex; align-items:center; gap:.45rem; font-size:.83rem; color:#0f172a; }
      .iad-team-empty { font-size:.8rem; color:#64748b; font-style:italic; }
      .iad-list-block { border:1px solid #dbeafe; border-radius:12px; background:#f8fbff; padding:.55rem; }
      .iad-list-head { display:flex; align-items:center; justify-content:space-between; gap:.5rem; flex-wrap:wrap; margin-bottom:.45rem; }
      .iad-list-title { margin:0; font-size:.86rem; color:#0f3f68; }
      .iad-list-head-actions { display:flex; align-items:center; gap:.35rem; }
      .iad-list-pin-btn {
        border:1px solid #fecaca;
        background:#fff5f5;
        color:#dc2626;
        border-radius:8px;
        font-size:.78rem;
        padding:.25rem .42rem;
        cursor:pointer;
        line-height:1;
      }
      .iad-list-pin-btn.is-pinned {
        background:#dc2626;
        border-color:#b91c1c;
        color:#fff;
      }
      .iad-list-pin-btn:hover {
        filter:brightness(0.98);
      }
      .iad-pinned-bar {
        position: sticky;
        bottom: 0;
        z-index: 32;
        margin-top: 0.65rem;
        border: 1px solid #bfdbfe;
        background: #f8fbff;
        border-radius: 10px;
        padding: 0.45rem 0.55rem;
        box-shadow: 0 -3px 10px rgba(15, 23, 42, 0.12);
      }
      .iad-pinned-title {
        margin: 0 0 0.35rem;
        color: #475569;
        font-size: 0.78rem;
      }
      .iad-pinned-list {
        display:flex;
        flex-wrap:wrap;
        gap:.4rem;
      }
      .iad-pinned-item {
        display:inline-flex;
        align-items:center;
        border:1px solid #bfdbfe;
        border-radius:999px;
        background:#fff;
        overflow:hidden;
      }
      .iad-pinned-open-btn,
      .iad-pinned-close-btn {
        border:0;
        background:transparent;
        cursor:pointer;
      }
      .iad-pinned-open-btn {
        padding:.24rem .6rem;
        font-size:.79rem;
        color:#0f3f68;
      }
      .iad-pinned-close-btn {
        padding:.24rem .45rem;
        border-left:1px solid #bfdbfe;
        color:#dc2626;
        font-size:.85rem;
      }
      .iad-pinned-item.is-active {
        border-color:#0284c7;
      }
      .iad-pinned-item.is-active .iad-pinned-open-btn {
        color:#0284c7;
      }
    `;
    document.head.appendChild(s);
  }

  function createIadModule(html, React) {
    const { useEffect, useState } = React;

    return function DarbaUzdevumiPanel({ supabase: supabaseProp, focusTask, onFocusHandled, pinnedListKeys, onPinListChange }) {
      ensureStyles();
      const supabase = supabaseProp ?? globalThis.__PDD_SUPABASE__ ?? null;
      const useDb = Boolean(supabase);

      const [submod, setSubmod] = useState("home");
      const [rows, setRows] = useState([]);
      const [busy, setBusy] = useState(false);
      const [err, setErr] = useState("");
      const [openCurrent, setOpenCurrent] = useState(false);
      const [openDone, setOpenDone] = useState(false);
      const [pinCurrent, setPinCurrent] = useState(false);
      const [pinDone, setPinDone] = useState(false);
      const [uiHydrated, setUiHydrated] = useState(false);
      const [focusedRowKey, setFocusedRowKey] = useState("");
      const [cardOpen, setCardOpen] = useState(null);
      const [editMode, setEditMode] = useState(false);
      const [editingId, setEditingId] = useState(null);
      const [editingSourceRow, setEditingSourceRow] = useState(null);
      const [draft, setDraft] = useState(emptyDraft());
      const [teamOptions, setTeamOptions] = useState([]);

      const activeRows = rows.filter((r) => !isInactiveStatus(r.IAD_statuss));
      const inactiveRows = rows.filter((r) => isInactiveStatus(r.IAD_statuss));

      function rowFocusKey(row) {
        const idPart = String(row?.id ?? "").trim();
        if (idPart) return `id:${idPart}`;
        return `k:${String(row?.IAD_numurs ?? "").trim().toLowerCase()}|${String(row?.IAD_nosaukums ?? "").trim().toLowerCase()}`;
      }

      async function refresh() {
        setErr("");
        try {
          const list = useDb ? await fetchIadRowsFromSupabase(supabase) : loadLocalRows();
          setRows(list);
        } catch (e) {
          setErr(String(e?.message || e || "Neizdevās ielādēt IaD ieteikumus."));
        }
      }

      useEffect(() => {
        void refresh();
      }, []); // eslint-disable-line react-hooks/exhaustive-deps

      useEffect(() => {
        const ui = loadIadUiState();
        setOpenCurrent(ui.pinCurrent ? true : ui.openCurrent);
        setOpenDone(ui.pinDone ? true : ui.openDone);
        setPinCurrent(ui.pinCurrent);
        setPinDone(ui.pinDone);
        setUiHydrated(true);
      }, []);

      useEffect(() => {
        if (!uiHydrated) return;
        saveIadUiState({ openCurrent, openDone, pinCurrent, pinDone });
      }, [openCurrent, openDone, pinCurrent, pinDone, uiHydrated]);

      useEffect(() => {
        if (!pinnedListKeys) return;
        const nextCurrent = Boolean(pinnedListKeys?.current);
        const nextDone = Boolean(pinnedListKeys?.done);
        setPinCurrent(nextCurrent);
        setPinDone(nextDone);
        if (nextCurrent) setOpenCurrent(true);
        if (nextDone) setOpenDone(true);
      }, [pinnedListKeys?.current, pinnedListKeys?.done]);

      useEffect(() => {
        let cancelled = false;
        (async () => {
          const fromDb = await fetchTeamOptionsFromSupabase(supabase);
          const merged = Array.from(new Set([...fromDb, ...listTeamOptions()]));
          if (!cancelled) setTeamOptions(merged.sort((a, b) => a.localeCompare(b, "lv")));
        })();
        return () => {
          cancelled = true;
        };
      }, [submod, editMode, supabase]);

      useEffect(() => {
        if (!focusTask || !rows.length) return;
        const targetSub = String(focusTask?.submodule || "").trim().toLowerCase();
        const targetId = String(focusTask?.rowId ?? "").trim();
        const targetListKey = String(focusTask?.listKey ?? "").trim().toLowerCase();
        const targetNumurs = String(focusTask?.rowNumurs ?? focusTask?.subtitle ?? "").trim().toLowerCase();
        const targetNosaukums = String(focusTask?.rowNosaukums ?? focusTask?.title ?? "").trim().toLowerCase();
        if (targetSub && targetSub !== "iad") return;
        if (targetListKey === "current" || targetListKey === "done") {
          setSubmod("iad");
          if (targetListKey === "current") setOpenCurrent(true);
          if (targetListKey === "done") setOpenDone(true);
          setCardOpen(null);
          setEditMode(false);
          if (typeof onFocusHandled === "function") onFocusHandled();
          return;
        }
        const hit =
          rows.find((r) => targetId && String(r?.id ?? "").trim() === targetId) ||
          rows.find(
            (r) =>
              (!targetId || !String(r?.id ?? "").trim()) &&
              targetNumurs &&
              targetNosaukums &&
              String(r?.IAD_numurs ?? "").trim().toLowerCase() === targetNumurs &&
              String(r?.IAD_nosaukums ?? "").trim().toLowerCase() === targetNosaukums
          );
        if (!hit) return;
        setSubmod("iad");
        if (isInactiveStatus(hit?.IAD_statuss)) setOpenDone(true);
        else setOpenCurrent(true);
        setCardOpen(null);
        setEditMode(false);
        setFocusedRowKey(rowFocusKey(hit));
        if (typeof onFocusHandled === "function") onFocusHandled();
      }, [focusTask, rows, onFocusHandled]);

      useEffect(() => {
        if (!focusedRowKey) return;
        const safeId = `iad-row-${focusedRowKey.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
        const el = document.getElementById(safeId);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
        const t = setTimeout(() => setFocusedRowKey(""), 4500);
        return () => clearTimeout(t);
      }, [focusedRowKey]);

      function startCreate() {
        setEditingId(null);
        setEditingSourceRow(null);
        setDraft(emptyDraft());
        setEditMode(true);
        setCardOpen(null);
      }

      function startEdit(row) {
        setEditingId(row?.id ?? null);
        setEditingSourceRow(row ?? null);
        setDraft({
          IAD_numurs: row.IAD_numurs || "",
          IAD_nosaukums: row.IAD_nosaukums || "",
          IAD_termins: toDateInputValue(row.IAD_termins),
          Atbildigais: joinNameList(parseNameList(row.Atbildigais)),
          IAD_statuss: statusLabel(row.IAD_statuss || "Aktīvs"),
          IAD_datums: toDateInputValue(row.IAD_datums),
          Lidzatbildigais: joinNameList(parseNameList(row.Lidzatbildigais)),
          IAD_PDD_komp_uzdevums: row.IAD_PDD_komp_uzdevums || "",
          Starptermins: toDateInputValue(row.Starptermins),
          Planotas_aktivitates: row.Planotas_aktivitates || "",
          Piezimes: row.Piezimes || "",
          Pielikumi: parseAttachments(row.Pielikumi),
        });
        setEditMode(true);
        setCardOpen(row ?? null);
      }

      function openCard(row) {
        setCardOpen(row);
        startEdit(row);
      }

      function closeOverlay() {
        setCardOpen(null);
        setEditMode(false);
        setEditingId(null);
        setEditingSourceRow(null);
      }

      function openIadModule() {
        setSubmod("iad");
      }

      function togglePinCurrent() {
        setPinCurrent((prev) => {
          const next = !prev;
          if (next) setOpenCurrent(true);
          if (typeof onPinListChange === "function") onPinListChange("current", next);
          return next;
        });
      }

      function togglePinDone() {
        setPinDone((prev) => {
          const next = !prev;
          if (next) setOpenDone(true);
          if (typeof onPinListChange === "function") onPinListChange("done", next);
          return next;
        });
      }

      function toggleOpenCurrent() {
        if (pinCurrent) {
          setOpenCurrent(true);
          return;
        }
        setOpenCurrent((prev) => !prev);
      }

      function toggleOpenDone() {
        if (pinDone) {
          setOpenDone(true);
          return;
        }
        setOpenDone((prev) => !prev);
      }

      function openPinnedList(key) {
        if (key === "current") setOpenCurrent(true);
        if (key === "done") setOpenDone(true);
      }

      function unpinList(key) {
        if (key === "current") {
          setPinCurrent(false);
          if (typeof onPinListChange === "function") onPinListChange("current", false);
        }
        if (key === "done") {
          setPinDone(false);
          if (typeof onPinListChange === "function") onPinListChange("done", false);
        }
      }

      function toggleName(fieldKey, personName, checked) {
        setDraft((prev) => {
          const current = parseNameList(prev?.[fieldKey]);
          const next = checked ? [...current, personName] : current.filter((x) => x !== personName);
          return { ...prev, [fieldKey]: joinNameList(next) };
        });
      }

      function readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(new Error(`Neizdevās nolasīt failu: ${file?.name || "pielikums"}`));
          reader.readAsDataURL(file);
        });
      }

      async function onAttachmentPick(ev) {
        const files = Array.from(ev?.target?.files || []);
        if (!files.length) return;
        try {
          const mapped = await Promise.all(
            files.map(async (file) => ({
              name: String(file?.name || "pielikums").trim(),
              dataUrl: await readFileAsDataUrl(file),
              size: Number(file?.size || 0),
              type: String(file?.type || "").trim(),
            }))
          );
          setDraft((prev) => ({
            ...prev,
            Pielikumi: [...(Array.isArray(prev?.Pielikumi) ? prev.Pielikumi : []), ...mapped],
          }));
        } catch (e) {
          setErr(String(e?.message || e || "Neizdevās pievienot pielikumu."));
        } finally {
          if (ev?.target) ev.target.value = "";
        }
      }

      function removeAttachment(index) {
        setDraft((prev) => ({
          ...prev,
          Pielikumi: (Array.isArray(prev?.Pielikumi) ? prev.Pielikumi : []).filter((_, i) => i !== index),
        }));
      }

      function downloadAttachment(item) {
        const href = String(item?.dataUrl ?? "").trim();
        if (!href) return;
        const a = document.createElement("a");
        a.href = href;
        a.download = String(item?.name || "pielikums");
        document.body.appendChild(a);
        a.click();
        a.remove();
      }

      function csvCell(v) {
        return `"${String(v ?? "").replace(/"/g, '""')}"`;
      }

      function exportRowsToExcel(rowsList, exportTag = "visi") {
        const cols = [
          ["IAD_numurs", "IaD numurs"],
          ["IAD_nosaukums", "IaD nosaukums"],
          ["IAD_termins", "IaD ieteikuma termiņš"],
          ["Atbildigais", "Atbildīgais"],
          ["Lidzatbildigais", "Līdzatbildīgais"],
          ["IAD_statuss", "IaD statuss"],
          ["IAD_datums", "IaD datums"],
          ["IAD_PDD_komp_uzdevums", "IaD PDD kompetences uzdevums"],
          ["Starptermins", "Starptermiņš"],
          ["Planotas_aktivitates", "Plānotās aktivitātes"],
          ["Piezimes", "Piezīmes"],
          ["Pielikumi", "Pielikumi"],
        ];
        const header = cols.map(([, label]) => csvCell(label)).join(";");
        const sourceRows = Array.isArray(rowsList) ? rowsList : [];
        const body = sourceRows.map((row) =>
          cols
            .map(([key]) => {
              let value = row?.[key];
              if (key === "IAD_termins" || key === "IAD_datums" || key === "Starptermins") value = toDateInputValue(value);
              if (key === "Pielikumi") value = parseAttachments(value).map((item) => item.name).join(", ");
              if (key === "Atbildigais" || key === "Lidzatbildigais") value = joinNameList(parseNameList(value));
              return csvCell(value);
            })
            .join(";")
        );
        const csv = `\uFEFF${[header, ...body].join("\r\n")}`;
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `iad_ieteikumi_${exportTag}_${toDateInputValue(new Date()) || "eksports"}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }

      function exportToExcel() {
        exportRowsToExcel(rows, "visi");
      }

      function renderPersonCheckboxes(fieldKey, label) {
        const selected = new Set(parseNameList(draft?.[fieldKey]));
        return html`
          <div class="field">
            ${label ? html`<label>${label}</label>` : null}
            <div class="iad-team-select">
              ${teamOptions.length
                ? teamOptions.map(
                    (name) => html`
                      <label key=${`${fieldKey}-${name}`} class="iad-team-option">
                        <input
                          type="checkbox"
                          checked=${selected.has(name)}
                          onChange=${(e) => toggleName(fieldKey, name, Boolean(e.target.checked))}
                        />
                        <span>${name}</span>
                      </label>
                    `
                  )
                : html`<div class="iad-team-empty">Komandas saraksts nav pieejams.</div>`}
            </div>
          </div>
        `;
      }

      function renderCardInput(label, valueKey, opts = {}) {
        const type = opts.type || "text";
        return html`
          <div class="iad-kv">
            <strong>${label}</strong>
            <div class="iad-kv-value editable">
              <input
                type=${type}
                class="iad-kv-input"
                value=${draft?.[valueKey] || ""}
                onChange=${(e) => setDraft((prev) => ({ ...prev, [valueKey]: e.target.value }))}
              />
            </div>
          </div>
        `;
      }

      function renderCardTextarea(label, valueKey, placeholder = "") {
        return html`
          <div class="iad-kv">
            <strong>${label}</strong>
            <div class="iad-kv-value editable">
              <textarea
                class="iad-kv-textarea"
                placeholder=${placeholder}
                value=${draft?.[valueKey] || ""}
                onChange=${(e) => setDraft((prev) => ({ ...prev, [valueKey]: e.target.value }))}
              ></textarea>
            </div>
          </div>
        `;
      }

      function cardEntries(row) {
        if (!row || typeof row !== "object") return [];
        const priority = [
          "id",
          "IAD_numurs",
          "IAD_nosaukums",
          "IAD_termins",
          "Atbildigais",
          "Lidzatbildigais",
          "IAD_statuss",
          "IAD_datums",
          "IAD_PDD_komp_uzdevums",
          "Starptermins",
          "Planotas_aktivitates",
          "Piezimes",
          "Pielikumi",
        ];
        const allKeys = Object.keys(row).filter((k) => !["__proto__"].includes(k));
        const ordered = [...priority.filter((k) => allKeys.includes(k)), ...allKeys.filter((k) => !priority.includes(k))];
        return ordered.map((key) => {
          const raw = row[key];
          let value = raw;
          if (key === "IAD_termins" || key === "IAD_datums" || /termin|datums/i.test(key)) value = displayDate(raw);
          if (key === "Atbildigais" || key === "Lidzatbildigais" || /atbild/i.test(key)) value = joinNameList(parseNameList(raw));
          if (key === "Pielikumi") value = parseAttachments(raw).map((item) => item.name).join(", ");
          return { key, label: prettyDbLabel(key), value: String(value ?? "").trim() || "—" };
        });
      }

      async function onSave(ev) {
        ev?.preventDefault?.();
        setErr("");
        if (!toStr(draft.IAD_nosaukums)) {
          setErr("IaD nosaukums ir obligāts.");
          return;
        }
        setBusy(true);
        try {
          if (useDb) {
            let savedRow = null;
            if (editingId != null) {
              savedRow = await updateIadRowInSupabase(supabase, editingId, draft);
              if (savedRow) {
                setRows((prev) =>
                  (Array.isArray(prev) ? prev : []).map((r) =>
                    String(r?.id ?? "") === String(editingId) ? savedRow : r
                  )
                );
              }
            } else if (editingSourceRow) {
              savedRow = await updateIadRowByNaturalKeyInSupabase(supabase, editingSourceRow, draft);
              if (savedRow) {
                setRows((prev) =>
                  (Array.isArray(prev) ? prev : []).map((r) => {
                    const sameNumurs = String(r?.IAD_numurs ?? "") === String(editingSourceRow?.IAD_numurs ?? "");
                    const sameNosaukums = String(r?.IAD_nosaukums ?? "") === String(editingSourceRow?.IAD_nosaukums ?? "");
                    return sameNumurs && sameNosaukums ? savedRow : r;
                  })
                );
              }
            } else {
              savedRow = await insertIadRowToSupabase(supabase, draft);
              if (savedRow) {
                setRows((prev) => [savedRow, ...(Array.isArray(prev) ? prev : [])]);
              }
            }
            closeOverlay();
            try {
              await refresh();
            } catch (refreshErr) {
              setErr(String(refreshErr?.message || refreshErr || "Neizdevās atjaunot sarakstu pēc saglabāšanas."));
            }
          } else {
            const list = loadLocalRows();
            if (editingId != null) {
              const i = list.findIndex((x) => String(x.id) === String(editingId));
              if (i >= 0) {
                list[i] = normalizeIadRow({ ...list[i], ...payloadFromDraft(draft) });
              }
            } else {
              list.unshift(
                normalizeIadRow({
                  id: localId(),
                  ...payloadFromDraft(draft),
                  created_at: new Date().toISOString(),
                })
              );
            }
            saveLocalRows(list);
            setRows(list);
            closeOverlay();
          }
        } catch (e) {
          setErr(String(e?.message || e || "Neizdevās saglabāt."));
        } finally {
          setBusy(false);
        }
      }

      async function onDelete(row) {
        if (!confirm("Dzēst šo IaD ieteikumu?")) return;
        setErr("");
        setBusy(true);
        try {
          if (useDb) {
            if (row?.id == null) throw new Error("Ierakstam nav id.");
            await deleteIadRowFromSupabase(supabase, row.id);
            await refresh();
          } else {
            const list = loadLocalRows().filter((x) => String(x.id) !== String(row?.id));
            saveLocalRows(list);
            setRows(list);
          }
          if (cardOpen && String(cardOpen?.id) === String(row?.id)) closeOverlay();
        } catch (e) {
          setErr(String(e?.message || e || "Neizdevās dzēst."));
        } finally {
          setBusy(false);
        }
      }

      function renderList(rowsList, emptyText) {
        return html`
          <div class="iad-table-wrap">
            <table class="iad-table">
              <thead>
                <tr>
                  <th>IaD numurs</th>
                  <th>IaD nosaukums</th>
                  <th>IaD ieteikuma termiņš</th>
                  <th>Atbildīgais</th>
                  <th>IaD statuss</th>
                  <th>IaD kartiņa</th>
                </tr>
              </thead>
              <tbody>
                ${rowsList.length
                  ? rowsList.map((r) => {
                      const st = statusLabel(r.IAD_statuss);
                      const done = isInactiveStatus(st);
                      const focusKey = rowFocusKey(r);
                      const rowId = `iad-row-${focusKey.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
                      const isFocused = focusedRowKey && focusedRowKey === focusKey;
                      return html`
                        <tr id=${rowId} key=${String(r?.id ?? `${r.IAD_numurs}-${r.IAD_nosaukums}`)} class=${isFocused ? "iad-row-focus" : ""}>
                          <td>${r.IAD_numurs || "—"}</td>
                          <td>${r.IAD_nosaukums || "—"}</td>
                          <td>${displayDate(r.IAD_termins)}</td>
                          <td>${joinNameList(parseNameList(r.Atbildigais)) || "—"}</td>
                          <td>
                            <span class=${`iad-status ${done ? "done" : ""}`}>${st}</span>
                          </td>
                          <td>
                            <div class="row" style=${{ gap: "0.3rem", flexWrap: "wrap" }}>
                              <button type="button" class="btn btn-ghost btn-small" onClick=${() => openCard(r)}>Atvērt</button>
                              <button type="button" class="btn btn-ghost btn-small" onClick=${() => startEdit(r)}>Labot</button>
                              <button type="button" class="btn btn-danger btn-small" onClick=${() => onDelete(r)}>Dzēst</button>
                            </div>
                          </td>
                        </tr>
                      `;
                    })
                  : html`<tr><td colspan="6" class="iad-empty">${emptyText}</td></tr>`}
              </tbody>
            </table>
          </div>
        `;
      }

      return html`
        <section class="iad-wrap">
          <div class="iad-head">
            <h2>Darba uzdevumi</h2>
            ${submod === "home"
              ? html`
                  <div class="iad-module-grid">
                    <button type="button" class="iad-module-card" onClick=${openIadModule}>
                      <h3>IaD ieteikumi</h3>
                      <p>Aktuālie un neaktuālie ieteikumi ar kartiņām.</p>
                    </button>
                    <button type="button" class="iad-module-card" disabled>
                      <h3>Apakšmodulis 2</h3>
                      <p>Drīzumā.</p>
                    </button>
                    <button type="button" class="iad-module-card" disabled>
                      <h3>Apakšmodulis 3</h3>
                      <p>Drīzumā.</p>
                    </button>
                  </div>
                `
              : html`
                  <div class="iad-subtabs">
                    <button type="button" class=${`iad-subtab ${submod === "iad" ? "active" : ""}`} onClick=${() => setSubmod("iad")}>IaD ieteikumi</button>
                    <button type="button" class="iad-subtab" onClick=${() => setSubmod("home")}>Atpakaļ uz moduļiem</button>
                  </div>
                `}
          </div>

          ${submod === "iad"
            ? html`
                <section class="iad-panel stack" style=${{ gap: "0.75rem" }}>
                  <div class="row" style=${{ justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
                    <h3 style=${{ margin: 0, color: "#075985", fontSize: "0.98rem" }}>IaD ieteikumi</h3>
                    <div class="row" style=${{ gap: "0.45rem", flexWrap: "wrap" }}>
                      <button type="button" class="btn btn-ghost btn-small" disabled=${busy} onClick=${exportToExcel}>Eksportēt uz Excel</button>
                      <button type="button" class="btn btn-primary btn-small" disabled=${busy} onClick=${startCreate}>Pievienot IaD ieteikumu</button>
                    </div>
                  </div>

                  ${err ? html`<div class="banner-warn" role="alert">${err}</div>` : null}

                  <section class="iad-list-block">
                    <div class="iad-list-head">
                      <p class="iad-list-title">Aktuālie IaD ieteikumi (${activeRows.length})</p>
                      <div class="iad-list-head-actions">
                        <button type="button" class=${`iad-list-pin-btn ${pinCurrent ? "is-pinned" : ""}`} onClick=${togglePinCurrent} title=${pinCurrent ? "Noņemt piespraudi" : "Piespraust sarakstu"}>📌</button>
                        <button type="button" class="btn btn-ghost btn-small" onClick=${toggleOpenCurrent}>
                          ${openCurrent ? "Paslēpt" : "Parādīt"}
                        </button>
                      </div>
                    </div>
                    ${openCurrent
                      ? html`
                          <div style=${{ marginTop: "0.55rem" }}>
                            <div class="row" style=${{ justifyContent: "flex-end", marginBottom: "0.45rem" }}>
                              <button
                                type="button"
                                class="btn btn-ghost btn-small"
                                disabled=${busy || !activeRows.length}
                                onClick=${() => exportRowsToExcel(activeRows, "aktualie")}
                              >
                                Eksportēt šo sarakstu uz Excel
                              </button>
                            </div>
                            ${renderList(activeRows, "Nav aktuālu IaD ieteikumu.")}
                          </div>
                        `
                      : null}
                  </section>

                  <section class="iad-list-block">
                    <div class="iad-list-head">
                      <p class="iad-list-title">Neaktuālie IaD ieteikumi (${inactiveRows.length})</p>
                      <div class="iad-list-head-actions">
                        <button type="button" class=${`iad-list-pin-btn ${pinDone ? "is-pinned" : ""}`} onClick=${togglePinDone} title=${pinDone ? "Noņemt piespraudi" : "Piespraust sarakstu"}>📌</button>
                        <button type="button" class="btn btn-ghost btn-small" onClick=${toggleOpenDone}>
                          ${openDone ? "Paslēpt" : "Parādīt"}
                        </button>
                      </div>
                    </div>
                    ${openDone
                      ? html`
                          <div style=${{ marginTop: "0.55rem" }}>
                            <div class="row" style=${{ justifyContent: "flex-end", marginBottom: "0.45rem" }}>
                              <button
                                type="button"
                                class="btn btn-ghost btn-small"
                                disabled=${busy || !inactiveRows.length}
                                onClick=${() => exportRowsToExcel(inactiveRows, "neaktualie")}
                              >
                                Eksportēt šo sarakstu uz Excel
                              </button>
                            </div>
                            ${renderList(inactiveRows, "Nav neaktuālu IaD ieteikumu.")}
                          </div>
                        `
                      : null}
                  </section>
                  ${pinCurrent || pinDone
                    ? html`
                        <section class="iad-pinned-bar" aria-label="Piespraustie IaD saraksti">
                          <p class="iad-pinned-title">Piespraustie saraksti</p>
                          <div class="iad-pinned-list">
                            ${pinCurrent
                              ? html`
                                  <span class=${`iad-pinned-item ${openCurrent ? "is-active" : ""}`}>
                                    <button type="button" class="iad-pinned-open-btn" onClick=${() => openPinnedList("current")}>
                                      Aktuālie
                                    </button>
                                    <button type="button" class="iad-pinned-close-btn" title="Noņemt piespraudi" onClick=${() => unpinList("current")}>
                                      ×
                                    </button>
                                  </span>
                                `
                              : null}
                            ${pinDone
                              ? html`
                                  <span class=${`iad-pinned-item ${openDone ? "is-active" : ""}`}>
                                    <button type="button" class="iad-pinned-open-btn" onClick=${() => openPinnedList("done")}>
                                      Neaktuālie
                                    </button>
                                    <button type="button" class="iad-pinned-close-btn" title="Noņemt piespraudi" onClick=${() => unpinList("done")}>
                                      ×
                                    </button>
                                  </span>
                                `
                              : null}
                          </div>
                        </section>
                      `
                    : null}
                </section>
              `
            : null}

          ${(cardOpen || editMode)
            ? html`
                <div class="iad-modal-bg" onClick=${closeOverlay}>
                  <div class="iad-modal" onClick=${(e) => e.stopPropagation()}>
                    ${editMode
                      ? html`
                          <h3 style=${{ margin: "0 0 0.7rem" }}>
                            ${editingId != null ? "Labot IaD kartiņu" : "Jauna IaD kartiņa"}
                          </h3>
                          <form class="stack" onSubmit=${onSave}>
                            <div class="iad-card-grid">
                              ${renderCardInput("IaD numurs", "IAD_numurs")}
                              <div class="iad-kv">
                                <strong>IaD nosaukums</strong>
                                <div class="iad-kv-value editable">
                                  <input
                                    class="iad-kv-input"
                                    required
                                    value=${draft.IAD_nosaukums}
                                    onChange=${(e) => setDraft((d) => ({ ...d, IAD_nosaukums: e.target.value }))}
                                  />
                                </div>
                              </div>
                              ${renderCardInput("IaD ieteikuma termiņš", "IAD_termins", { type: "date" })}
                              <div class="iad-kv">
                                <strong>IaD statuss</strong>
                                <div class="iad-kv-value editable">
                                  <select class="iad-kv-select" value=${draft.IAD_statuss} onChange=${(e) => setDraft((d) => ({ ...d, IAD_statuss: e.target.value }))}>
                                    <option value="Aktīvs">Aktīvs</option>
                                    <option value="Pabeigts">Pabeigts</option>
                                    <option value="Atcelts">Atcelts</option>
                                  </select>
                                </div>
                              </div>
                              <div class="iad-kv">
                                <strong>Atbildīgais</strong>
                                <div class="iad-kv-value editable">${renderPersonCheckboxes("Atbildigais", "")}</div>
                              </div>
                              ${renderCardInput("IaD datums", "IAD_datums", { type: "date" })}
                              <div class="iad-kv">
                                <strong>Līdzatbildīgais</strong>
                                <div class="iad-kv-value editable">${renderPersonCheckboxes("Lidzatbildigais", "")}</div>
                              </div>
                              ${renderCardTextarea("IaD PDD kompetences uzdevums", "IAD_PDD_komp_uzdevums")}
                              ${renderCardInput("Starptermiņš", "Starptermins", { type: "date" })}
                              ${renderCardTextarea("Plānotās aktivitātes", "Planotas_aktivitates", "Var ievadīt neierobežotu teksta apjomu")}
                              ${renderCardTextarea("Piezīmes", "Piezimes", "Var ievadīt neierobežotu teksta apjomu")}
                              <div class="iad-kv">
                                <strong>Pielikumi</strong>
                                <div class="iad-kv-value editable">
                                  <div class="iad-attachments">
                                    <input type="file" multiple onChange=${onAttachmentPick} />
                                    <div class="iad-attachment-list">
                                      ${(Array.isArray(draft?.Pielikumi) ? draft.Pielikumi : []).length
                                        ? (Array.isArray(draft?.Pielikumi) ? draft.Pielikumi : []).map(
                                            (item, index) => html`
                                              <div key=${`${item?.name || "pielikums"}-${index}`} class="iad-attachment-item">
                                                <span class="iad-attachment-name">${attachmentLabel(item)}</span>
                                                <div class="row" style=${{ gap: "0.35rem", flexWrap: "wrap" }}>
                                                  ${item?.dataUrl
                                                    ? html`<button type="button" class="btn btn-ghost btn-small" onClick=${() => downloadAttachment(item)}>Lejupielādēt</button>`
                                                    : null}
                                                  <button type="button" class="btn btn-danger btn-small" onClick=${() => removeAttachment(index)}>Dzēst</button>
                                                </div>
                                              </div>
                                            `
                                          )
                                        : html`<div class="iad-team-empty">Pielikumi vēl nav pievienoti.</div>`}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div class="row" style=${{ gap: "0.4rem" }}>
                              <button type="submit" class="btn btn-primary btn-small" disabled=${busy}>
                                ${busy ? "Saglabā..." : "Saglabāt"}
                              </button>
                              ${editingId != null
                                ? html`<button type="button" class="btn btn-danger btn-small" disabled=${busy} onClick=${() => onDelete({ id: editingId })}>Dzēst kartiņu</button>`
                                : null}
                              <button type="button" class="btn btn-ghost btn-small" onClick=${closeOverlay}>Atcelt</button>
                            </div>
                          </form>
                        `
                      : html`
                          <h3 style=${{ margin: "0 0 0.45rem" }}>
                            ${cardOpen?.IAD_nosaukums || "IaD kartiņa"}
                          </h3>
                          <div class="iad-card-grid">
                            ${cardEntries(cardOpen).map(
                              (f) => html`
                                <div key=${f.key} class="iad-kv">
                                  <strong>${f.label}</strong>
                                  <div class="iad-kv-value">${f.value}</div>
                                </div>
                              `
                            )}
                          </div>
                          <div class="row" style=${{ gap: "0.4rem", marginTop: "0.75rem" }}>
                            <button type="button" class="btn btn-ghost btn-small" onClick=${() => startEdit(cardOpen)}>Labot</button>
                            <button type="button" class="btn btn-danger btn-small" onClick=${() => onDelete(cardOpen)}>Dzēst</button>
                            <button type="button" class="btn btn-ghost btn-small" onClick=${closeOverlay}>Aizvērt</button>
                          </div>
                        `}
                  </div>
                </div>
              `
            : null}
        </section>
      `;
    };
  }

  globalThis.IAD = {
    createIadModule,
    fetchIadRowsFromSupabase,
    insertIadRowToSupabase,
    updateIadRowInSupabase,
    deleteIadRowFromSupabase,
    normalizeIadRow,
    payloadFromDraft,
    loadLocalRows,
    saveLocalRows,
    buildTodayTaskItems,
  };
})();
