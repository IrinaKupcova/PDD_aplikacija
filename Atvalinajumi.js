/**
 * Ieplānotie atvaļinājumi — Atvaļinājumu grafiks (Prombūtnes apakšsadaļa).
 * Tabula sinhronizēta ar public."Atvalinajumi" (vai atvalinajumi).
 */
(function () {
  "use strict";

  const LS_ATV_KEY = "pdd_atvalinajumi_v1";
  const TABLE_CANDIDATES = ["Atvalinajumi", "atvalinajumi", "Atvaļinājumi", "ATVALINAJUMI"];

  const UI = {
    sakuma: "Atvaļinājuma sākuma datums",
    beigu: "Atvaļinājuma beigu datums",
    vards: "Vārds, uzvārds",
    veids: "Atvaļinājuma veids",
    papildu: "Papildinformācija",
    darbibas: "Darbības",
  };

  const VEIDS_OPTIONS = [
    { value: "Ikgadējais", label: "Ikgadējais" },
    { value: "Papildatvaļinājums", label: "Papildatvaļinājums" },
  ];

  /** Atšķirīga krāsa Prombūtnes kalendārī (ne prombūtnes veidu palete). */
  const CALENDAR_CHIP_COLOR = "#7c3aed";

  const FIELD_ALIAS = {
    sakuma: [
      "Atvaļinājuma sākuma datums",
      "Atvalinajuma sakuma datums",
      "atvalinajuma_sakuma_datums",
      "Sakuma_datums",
      "sakuma_datums",
      "start_date",
    ],
    beigu: [
      "Atvaļinājuma beigu datums",
      "Atvalinajuma beigu datums",
      "atvalinajuma_beigu_datums",
      "Beigu_datums",
      "beigu_datums",
      "end_date",
    ],
    vards: ["Vārds uzvārds", "Vards uzvards", "vards_uzvards", "user_id", "darbinieks"],
    veids: [
      "Atvaļinājuma veids (ikgadējais vai papildatvaļinājums)",
      "Atvalinajuma veids (ikgadejais vai papildatvalinajums)",
      "Atvaļinājuma veids",
      "Atvalinajuma veids",
      "atvalinajuma_veids",
      "veids",
    ],
    papildu: ["Papildinformācija", "Papildinformacija", "papildinformacija", "Papildu_info", "papildu_info"],
    kalendara: [
      "Atspoguļot kalendārī",
      "Atspogulot_kalendari",
      "atspogulot_kalendari",
      "show_on_calendar",
      "kalendara",
    ],
  };

  const WRITE_DEFAULT = {
    sakuma: "Atvaļinājuma sākuma datums",
    beigu: "Atvaļinājuma beigu datums",
    vards: "Vārds uzvārds",
    veids: "Atvaļinājuma veids",
    papildu: "Papildinformācija",
    kalendara: "Atspoguļot kalendārī",
  };

  const LS_CALENDAR_IDS = "pdd_atvalinajumi_calendar_ids_v1";
  const LS_ATV_FORM_PRESET = "pdd_atv_form_preset_v1";
  const LS_ATV_HIGHLIGHT = "pdd_atv_highlight_id_v1";
  const LS_ATV_PROMB_LINK = "pdd_atv_promb_link_v1";
  const LS_PROMB_FROM_ATV = "pdd_promb_from_atv_ids_v1";

  let cachedAtvalinajumsTypeId = null;

  let runtimeCols = { ...WRITE_DEFAULT };
  let runtimeIdCol = "id";
  let resolvedTable = null;
  let runtimeColsProbed = false;
  /** true → kolonna „Vārds uzvārds” glabā users.id (UUID); false → teksts no users. */
  let vardsColumnStoresUuid = true;

  const COL_USER_NAME = "Vārds uzvārds";

  function loadCalendarIdSet() {
    try {
      const raw = localStorage.getItem(LS_CALENDAR_IDS);
      const arr = raw ? JSON.parse(raw) : [];
      return new Set((Array.isArray(arr) ? arr : []).map((x) => String(x ?? "").trim()).filter(Boolean));
    } catch {
      return new Set();
    }
  }

  function setAtvFormPreset(preset) {
    try {
      const p = preset && typeof preset === "object" ? preset : {};
      localStorage.setItem(
        LS_ATV_FORM_PRESET,
        JSON.stringify({
          sakuma: toDateInputValue(p.sakuma),
          beigu: toDateInputValue(p.beigu),
          userRef: String(p.userRef ?? "").trim(),
          papildu: toStr(p.papildu, 2000),
          veids: normalizeVeids(p.veids) || "Ikgadējais",
        })
      );
    } catch {
      /* ignore */
    }
  }

  function consumeAtvFormPreset() {
    try {
      const raw = localStorage.getItem(LS_ATV_FORM_PRESET);
      if (!raw) return null;
      localStorage.removeItem(LS_ATV_FORM_PRESET);
      const p = JSON.parse(raw);
      if (!p || typeof p !== "object") return null;
      return {
        sakuma: toDateInputValue(p.sakuma),
        beigu: toDateInputValue(p.beigu),
        userRef: String(p.userRef ?? "").trim(),
        papildu: toStr(p.papildu, 2000),
        veids: normalizeVeids(p.veids) || "Ikgadējais",
      };
    } catch {
      return null;
    }
  }

  function saveCalendarIdSet(set) {
    try {
      localStorage.setItem(LS_CALENDAR_IDS, JSON.stringify(Array.from(set instanceof Set ? set : [])));
    } catch {
      /* ignore */
    }
  }

  function loadAtvPrombLinkMap() {
    try {
      const raw = localStorage.getItem(LS_ATV_PROMB_LINK);
      const obj = raw ? JSON.parse(raw) : {};
      return obj && typeof obj === "object" ? obj : {};
    } catch {
      return {};
    }
  }

  function saveAtvPrombLinkMap(map) {
    try {
      localStorage.setItem(LS_ATV_PROMB_LINK, JSON.stringify(map && typeof map === "object" ? map : {}));
    } catch {
      /* ignore */
    }
  }

  function getAtvPrombLink(atvId) {
    const id = String(atvId ?? "").trim();
    if (!id) return null;
    const hit = loadAtvPrombLinkMap()[id];
    const prombId = String(hit?.prombId ?? hit ?? "").trim();
    return prombId ? { prombId, managed: hit?.managed !== false } : null;
  }

  function setAtvPrombLink(atvId, prombId) {
    const id = String(atvId ?? "").trim();
    const pid = String(prombId ?? "").trim();
    if (!id || !pid) return;
    const map = loadAtvPrombLinkMap();
    map[id] = { prombId: pid, managed: true };
    saveAtvPrombLinkMap(map);
  }

  function removeAtvPrombLink(atvId) {
    const id = String(atvId ?? "").trim();
    if (!id) return;
    const map = loadAtvPrombLinkMap();
    if (!Object.prototype.hasOwnProperty.call(map, id)) return;
    delete map[id];
    saveAtvPrombLinkMap(map);
  }

  function findAtvIdByPrombId(prombId) {
    const pid = String(prombId ?? "").trim();
    if (!pid) return "";
    const map = loadAtvPrombLinkMap();
    for (const [atvId, link] of Object.entries(map)) {
      const promb = String(link?.prombId ?? link ?? "").trim();
      if (promb === pid) return String(atvId).trim();
    }
    return "";
  }

  function resolveAtvalinajumsIdFromCalendarAbsence(absence) {
    const a = absence && typeof absence === "object" ? absence : {};
    const direct = String(a.atvalinajums_id ?? a.atvalinajumsId ?? "").trim();
    if (direct) return direct;
    const id = String(a.id ?? "").trim();
    if (id.startsWith("atv-cal-")) return id.slice("atv-cal-".length);
    return findAtvIdByPrombId(id);
  }

  function requestHighlightAtvalinajumsRow(atvId) {
    const id = String(atvId ?? "").trim();
    if (!id) return;
    try {
      localStorage.setItem(LS_ATV_HIGHLIGHT, id);
    } catch {
      /* ignore */
    }
    try {
      window.dispatchEvent(new CustomEvent("pdd:atvalinajumi-highlight-row", { detail: { atvId: id } }));
    } catch {
      /* ignore */
    }
  }

  function consumeAtvHighlightId() {
    try {
      const id = String(localStorage.getItem(LS_ATV_HIGHLIGHT) ?? "").trim();
      if (id) localStorage.removeItem(LS_ATV_HIGHLIGHT);
      return id;
    } catch {
      return "";
    }
  }

  function loadPrombFromAtvSet() {
    try {
      const raw = localStorage.getItem(LS_PROMB_FROM_ATV);
      const arr = raw ? JSON.parse(raw) : [];
      return new Set((Array.isArray(arr) ? arr : []).map((x) => String(x ?? "").trim()).filter(Boolean));
    } catch {
      return new Set();
    }
  }

  function savePrombFromAtvSet(set) {
    try {
      localStorage.setItem(LS_PROMB_FROM_ATV, JSON.stringify(Array.from(set instanceof Set ? set : [])));
    } catch {
      /* ignore */
    }
  }

  function markPrombFromAtv(prombId) {
    const pid = String(prombId ?? "").trim();
    if (!pid) return;
    const s = loadPrombFromAtvSet();
    s.add(pid);
    savePrombFromAtvSet(s);
  }

  function unmarkPrombFromAtv(prombId) {
    const pid = String(prombId ?? "").trim();
    if (!pid) return;
    const s = loadPrombFromAtvSet();
    s.delete(pid);
    savePrombFromAtvSet(s);
  }

  function isPrombutneFromAtvalinajumsGrafiks(prombId) {
    const pid = String(prombId ?? "").trim();
    if (!pid) return false;
    return loadPrombFromAtvSet().has(pid);
  }

  function buildPrombutneCommentFromAtv(row) {
    const veids = normalizeVeids(row?.veids) || "Atvaļinājums";
    const pap = toStr(row?.papildu, 2000);
    const prefix = `[Atvaļinājumu grafiks: ${veids}]`;
    return pap ? `${prefix} ${pap}` : prefix;
  }

  async function resolveAtvalinajumsTypeId(sb) {
    if (cachedAtvalinajumsTypeId != null) return cachedAtvalinajumsTypeId;
    if (!sb || isLocalMode()) {
      cachedAtvalinajumsTypeId = 1;
      return cachedAtvalinajumsTypeId;
    }
    try {
      const { data } = await sb.from("prombutnes_veidi").select("*");
      const rows = Array.isArray(data) ? data : [];
      const hit = rows.find((t) => {
        const name = String(t?.name ?? t?.Nosaukums ?? t?.nosaukums ?? "").trim();
        return normLoose(name).includes("atvalin");
      });
      cachedAtvalinajumsTypeId = hit != null && Number.isFinite(Number(hit.id)) ? Number(hit.id) : 1;
    } catch {
      cachedAtvalinajumsTypeId = 1;
    }
    return cachedAtvalinajumsTypeId;
  }

  function buildPrombutnePayloadVariants(row, users, typeId) {
    const usersList = Array.isArray(users) ? users : [];
    const userRef = resolveUserRefForDb(row?.userRef || row?.userRefRaw, usersList);
    const uid = String(row?.userId ?? "").trim();
    const dbUser = isUuidLike(userRef) ? userRef : isUuidLike(uid) ? uid : userRef;
    const start = toDateInputValue(row?.sakuma);
    const end = toDateInputValue(row?.beigu);
    const comment = buildPrombutneCommentFromAtv(row);
    const tid = Number(typeId);
    return [
      {
        "Vārds uzvārds": dbUser,
        type: tid,
        Sakuma_datums: start,
        Beigu_datums: end,
        Komentars: comment,
        Statuss: "approved",
      },
      {
        "Vārds uzvārds": dbUser,
        type: tid,
        Sakuma_datums: start,
        Beigu_datums: end,
        Komentārs: comment,
        Statuss: "approved",
      },
      {
        user_id: dbUser,
        type_id: tid,
        start_date: start,
        end_date: end,
        comment,
        status: "approved",
      },
    ];
  }

  async function updatePrombutneFromAtv(sb, prombId, row, users, typeId) {
    const variants = buildPrombutnePayloadVariants(row, users, typeId).map((p) => {
      const copy = { ...p };
      delete copy["Vārds uzvārds"];
      delete copy.user_id;
      delete copy.type;
      delete copy.type_id;
      return copy;
    });
    let lastErr = null;
    for (const payload of variants) {
      if (!Object.keys(payload).length) continue;
      let p = { ...payload };
      for (let i = 0; i < 8; i += 1) {
        const { error } = await sb.from("prombutnes_dati").update(p).eq("id", prombId);
        if (!error) return;
        lastErr = error;
        const missing = missingColumnFromError(error);
        if (!missing) break;
        const key = Object.keys(p).find((k) => normalizeKey(k) === normalizeKey(missing));
        if (!key) break;
        delete p[key];
        if (!Object.keys(p).length) break;
      }
    }
    if (lastErr) console.warn("[Atvalinajumi] Prombūtnes atjaunināšana:", lastErr?.message || lastErr);
  }

  async function insertPrombutneFromAtv(sb, row, users) {
    const typeId = await resolveAtvalinajumsTypeId(sb);
    const variants = buildPrombutnePayloadVariants(row, users, typeId);
    let lastErr = null;
    for (const payload of variants) {
      const r = await insertWithPruning(sb, "prombutnes_dati", payload);
      const pid = String(r?.data?.id ?? "").trim();
      if (pid) return pid;
      if (r?.error) lastErr = r.error;
    }
    throw new Error(lastErr?.message || "Neizdevās pievienot ierakstu prombūtnes vēsturē.");
  }

  async function removePrombutneForAtv(sb, atvId) {
    const link = getAtvPrombLink(atvId);
    if (!link?.prombId) return;
    if (sb && !isLocalMode()) {
      const { error } = await sb.from("prombutnes_dati").delete().eq("id", link.prombId);
      if (error) console.warn("[Atvalinajumi] Prombūtnes dzēšana:", error?.message || error);
    }
    unmarkPrombFromAtv(link.prombId);
    removeAtvPrombLink(atvId);
  }

  async function syncAtvalinajumsToPrombutnesDati(sb, row, users, show) {
    const atvId = String(row?.id ?? "").trim();
    if (!atvId) return;
    if (!sb || isLocalMode()) return;

    if (!show) {
      await removePrombutneForAtv(sb, atvId);
      return;
    }

    const typeId = await resolveAtvalinajumsTypeId(sb);
    const link = getAtvPrombLink(atvId);
    if (link?.prombId) {
      await updatePrombutneFromAtv(sb, link.prombId, row, users, typeId);
      markPrombFromAtv(link.prombId);
      return;
    }

    const prombId = await insertPrombutneFromAtv(sb, row, users);
    setAtvPrombLink(atvId, prombId);
    markPrombFromAtv(prombId);
  }

  function parseCalendarFlag(raw) {
    const r = raw && typeof raw === "object" ? raw : {};
    const id = String(pickByAliases(r, ["id", "ID"], r?.id ?? "") ?? "").trim();
    // Vietējā izvēle vienmēr pārspēj DB (kolonna var būt false vai vēl nav migrācijas).
    if (id && loadCalendarIdSet().has(id)) return true;

    const v = pickByAliases(r, FIELD_ALIAS.kalendara, undefined);
    if (v === undefined || v === null || v === "") return false;
    if (v === true || v === 1 || v === "1" || String(v).toLowerCase() === "true") return true;
    if (v === false || v === 0 || v === "0" || String(v).toLowerCase() === "false") return false;
    return false;
  }

  function isLocalMode() {
    try {
      return String(globalThis.PDD_LOCAL_MODE ?? "") === "1" || localStorage.getItem("pdd_local_mode") === "1";
    } catch {
      return false;
    }
  }

  function toStr(v, max) {
    const s = String(v ?? "").trim();
    return typeof max === "number" ? s.slice(0, max) : s;
  }

  function isUuidLike(v) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v ?? "").trim());
  }

  function normalizeKey(v) {
    return String(v ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function pickByAliases(row, aliases, fallback = "") {
    const src = row && typeof row === "object" ? row : {};
    for (const k of aliases) {
      if (Object.prototype.hasOwnProperty.call(src, k)) return src[k];
    }
    const map = new Map(Object.keys(src).map((k) => [normalizeKey(k), k]));
    for (const a of aliases) {
      const hit = map.get(normalizeKey(a));
      if (hit != null) return src[hit];
    }
    return fallback;
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
    if (!s) return "—";
    const [y, m, d] = s.split("-");
    return `${d}.${m}.${y}`;
  }

  function veidsDisplayLabel(v) {
    const norm = normalizeVeids(v);
    if (!norm) return "—";
    const hit = VEIDS_OPTIONS.find((o) => o.value === norm);
    return hit?.label || norm;
  }

  function compareRowsBySakumaAsc(a, b) {
    const as = toDateInputValue(a?.sakuma) || "";
    const bs = toDateInputValue(b?.sakuma) || "";
    if (as !== bs) return as.localeCompare(bs);
    return String(a?.id ?? "").localeCompare(String(b?.id ?? ""));
  }

  function resolveRowUserGroup(row, userMap) {
    const resolved = resolveUserRefForUi(row?.userRef || row?.userRefRaw, userMap);
    const key =
      String(resolved.userId ?? "").trim() ||
      String(resolved.selectValue ?? "").trim() ||
      String(row?.userId ?? "").trim() ||
      normLoose(resolved.displayName || row?.userDisplayName || "");
    const name =
      String(resolved.displayName || row?.userDisplayName || "").trim() ||
      String(resolved.selectValue ?? "").trim() ||
      key ||
      "Nezināms darbinieks";
    return { key: key || name, name };
  }

  function buildAtvUserGroups(rows, userMap) {
    const map = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      const { key, name } = resolveRowUserGroup(row, userMap);
      if (!map.has(key)) map.set(key, { key, name, rows: [] });
      map.get(key).rows.push(row);
    }
    const groups = Array.from(map.values());
    for (const g of groups) g.rows.sort(compareRowsBySakumaAsc);
    groups.sort((a, b) => a.name.localeCompare(b.name, "lv"));
    return groups;
  }

  function normalizeVeids(v) {
    const s = String(v ?? "").trim();
    if (!s) return "";
    const n = normalizeKey(s);
    if (n.includes("ikgad")) return "Ikgadējais";
    if (n.includes("pamat")) return "Pamatatvaļinājums";
    return s;
  }

  function normLoose(v) {
    return String(v ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  /** Vārds uzvārds kā public.users — prioritāte kolonnai „Vārds uzvārds”. */
  function teamUserName(u) {
    if (!u || typeof u !== "object") return "";
    const name = String(
      u[COL_USER_NAME] ??
        u?.["Vards uzvards"] ??
        u?.full_name ??
        u?.fullName ??
        u?.name ??
        u?.["Vārds un uzvārds"] ??
        u?.["Vārds, uzvārds"] ??
        ""
    ).trim();
    if (name && !isUuidLike(name)) return name;
    const em = userEmail(u);
    if (em) {
      const part = em.split("@")[0].trim();
      if (part) return part;
    }
    return "";
  }

  function normalizeTeamUser(u) {
    const name = teamUserName(u);
    const id = String(u?.id ?? "").trim();
    return {
      ...(u && typeof u === "object" ? u : {}),
      id,
      [COL_USER_NAME]: name,
      full_name: name || u?.full_name || null,
    };
  }

  function buildUserMap(users) {
    const byId = new Map();
    const byName = new Map();
    for (const raw of Array.isArray(users) ? users : []) {
      const u = normalizeTeamUser(raw);
      const id = String(u.id ?? "").trim();
      const name = teamUserName(u);
      if (id) byId.set(id, u);
      if (name) byName.set(normLoose(name), u);
    }
    return { byId, byName };
  }

  function findUserByRef(ref, userMap) {
    const r = String(ref ?? "").trim();
    if (!r || !userMap) return null;
    if (isUuidLike(r)) return userMap.byId.get(r) ?? null;
    const byName = userMap.byName.get(normLoose(r));
    if (byName) return byName;
    for (const u of userMap.byId.values()) {
      if (normLoose(teamUserName(u)) === normLoose(r)) return u;
    }
    return null;
  }

  function resolveUserRefForUi(refRaw, userMap) {
    const ref = String(refRaw ?? "").trim();
    if (!ref) return { selectValue: "", displayName: "" };
    const user = findUserByRef(ref, userMap);
    if (user) {
      const name = teamUserName(user);
      const id = String(user.id ?? "").trim();
      return {
        selectValue: vardsColumnStoresUuid && id ? id : name || ref,
        displayName: name || ref,
        userId: id,
      };
    }
    if (isUuidLike(ref)) return { selectValue: ref, displayName: ref, userId: ref };
    return { selectValue: ref, displayName: ref, userId: "" };
  }

  function resolveUserRefForDb(userRef, users) {
    const ref = String(userRef ?? "").trim();
    if (!ref) return null;
    const userMap = buildUserMap(users);
    const user = findUserByRef(ref, userMap);
    const dbName = user ? teamUserName(user) : "";
    const userId = user ? String(user.id ?? "").trim() : "";

    if (vardsColumnStoresUuid) {
      if (userId && isUuidLike(userId)) return userId;
      if (isUuidLike(ref)) return ref;
      if (dbName) return dbName;
      return ref;
    }
    if (dbName) return dbName;
    if (userId && isUuidLike(userId)) return userId;
    return ref;
  }

  function detectVardsColumnStoresUuid(sampleRefs) {
    const refs = (Array.isArray(sampleRefs) ? sampleRefs : []).map((x) => String(x ?? "").trim()).filter(Boolean);
    if (!refs.length) return true;
    const uuidCount = refs.filter(isUuidLike).length;
    return uuidCount >= Math.ceil(refs.length / 2);
  }

  function userEmail(u) {
    if (!u) return "";
    for (const k of ["e-pasts", "email", "i-mail", "e-mail"]) {
      const s = String(u[k] ?? "").trim();
      if (s.includes("@")) return s;
    }
    return "";
  }

  function normalizeRow(raw, userMap) {
    const r = raw && typeof raw === "object" ? raw : {};
    const id = pickByAliases(r, ["id", "ID"], r?.id ?? "");
    const refRaw = String(pickByAliases(r, FIELD_ALIAS.vards, "")).trim();
    const resolved = resolveUserRefForUi(refRaw, userMap);
    return {
      id: id != null && String(id).trim() !== "" ? id : null,
      sakuma: toDateInputValue(pickByAliases(r, FIELD_ALIAS.sakuma, "")),
      beigu: toDateInputValue(pickByAliases(r, FIELD_ALIAS.beigu, "")),
      userRef: resolved.selectValue,
      userRefRaw: refRaw,
      userDisplayName: resolved.displayName,
      userId: resolved.userId || (isUuidLike(refRaw) ? refRaw : ""),
      veids: normalizeVeids(pickByAliases(r, FIELD_ALIAS.veids, "")),
      papildu: toStr(pickByAliases(r, FIELD_ALIAS.papildu, ""), 2000),
      showOnCalendar: parseCalendarFlag(r),
      created_at: String(r.created_at ?? "").trim(),
      _raw: r,
    };
  }

  function normalizeAppRole(role) {
    const r = String(role ?? "")
      .trim()
      .toLowerCase();
    return r === "admin" ? "admin" : "user";
  }

  function isAdminAppRole(role) {
    return normalizeAppRole(role) === "admin";
  }

  function resolveRowOwnerUserId(row, userMap) {
    const r = row && typeof row === "object" ? row : {};
    const map = userMap?.byId ? userMap : buildUserMap(userMap);
    const rowUid = String(r.userId ?? "").trim();
    if (rowUid && isUuidLike(rowUid)) return rowUid;

    const rowRefRaw = String(
      r.userRefRaw ?? (r._raw ? pickByAliases(r._raw, FIELD_ALIAS.vards, "") : "")
    ).trim();
    const rowRef = String(r.userRef ?? "").trim();
    if (isUuidLike(rowRefRaw)) return rowRefRaw;
    if (isUuidLike(rowRef)) return rowRef;

    const resolved = resolveUserRefForUi(rowRefRaw || rowRef, map);
    const resolvedUid = String(resolved.userId ?? "").trim();
    if (resolvedUid && isUuidLike(resolvedUid)) return resolvedUid;
    if (isUuidLike(resolved.selectValue)) return String(resolved.selectValue).trim();

    const nameKey = normLoose(resolved.displayName || rowRefRaw || rowRef);
    if (!nameKey) return "";
    for (const u of map.byId.values()) {
      if (normLoose(teamUserName(u)) === nameKey) {
        const id = String(u.id ?? "").trim();
        if (id && isUuidLike(id)) return id;
      }
    }
    return "";
  }

  function resolveCurrentUserId(ctx, userMap) {
    const uid = String(ctx?.userId ?? "").trim();
    if (uid && isUuidLike(uid)) return uid;
    const em = normLoose(ctx?.sessionEmail);
    if (!em) return "";
    const map = userMap?.byId ? userMap : buildUserMap(userMap);
    for (const u of map.byId.values()) {
      if (normLoose(userEmail(u)) === em) {
        const id = String(u.id ?? "").trim();
        if (id && isUuidLike(id)) return id;
      }
    }
    return "";
  }

  function isRowOwnedByUser(row, ctx, userMap) {
    if (!row || !ctx) return false;
    const mine = resolveCurrentUserId(ctx, userMap);
    if (!mine) return false;
    const owner = resolveRowOwnerUserId(row, userMap);
    return owner !== "" && owner === mine;
  }

  function isDraftOwnedByUser(draft, ctx, userMap) {
    const d = draft && typeof draft === "object" ? draft : {};
    return isRowOwnedByUser(
      {
        userRef: d.userRef,
        userRefRaw: d.userRef,
        userDisplayName: "",
        userId: "",
      },
      ctx,
      userMap
    );
  }

  /** Labot, dzēst un kalendārs — tikai ieraksta īpašnieks (ne administrators citu vietā). */
  function canManageAtvRow(row, ctx, userMap) {
    return isRowOwnedByUser(row, ctx, userMap);
  }

  function findVeidsColumnKey(keys) {
    const list = Array.isArray(keys) ? keys : [];
    for (const a of FIELD_ALIAS.veids) {
      const hit = list.find((k) => normalizeKey(k) === normalizeKey(a));
      if (hit) return hit;
    }
    const fuzzy = list.find((k) => {
      const nk = normalizeKey(k);
      return nk.includes("veids") && (nk.includes("atvalin") || nk.includes("ikgad") || nk.includes("pamat"));
    });
    return fuzzy || runtimeCols.veids || WRITE_DEFAULT.veids;
  }

  function veidsDbColumn() {
    const col = String(runtimeCols.veids || "").trim();
    if (!col || normalizeKey(col) === "type") return findVeidsColumnKey([]);
    return col;
  }

  function detectRuntimeColsFromRow(row) {
    if (!row || typeof row !== "object") return;
    const keys = Object.keys(row);
    const find = (aliases, fallback) => {
      for (const a of aliases) {
        const hit = keys.find((k) => normalizeKey(k) === normalizeKey(a));
        if (hit) return hit;
      }
      return fallback;
    };
    const veidsHit = findVeidsColumnKey(keys);
    runtimeCols = {
      sakuma: find(FIELD_ALIAS.sakuma, runtimeCols.sakuma),
      beigu: find(FIELD_ALIAS.beigu, runtimeCols.beigu),
      vards: find(FIELD_ALIAS.vards, runtimeCols.vards),
      veids: normalizeKey(veidsHit) === "type" ? WRITE_DEFAULT.veids : veidsHit,
      papildu: find(FIELD_ALIAS.papildu, runtimeCols.papildu),
      kalendara: find(FIELD_ALIAS.kalendara, runtimeCols.kalendara),
    };
    const idHit = keys.find((k) => normalizeKey(k) === "id");
    if (idHit) runtimeIdCol = idHit;
  }

  function missingColumnFromError(err) {
    const msg = String(err?.message ?? "");
    const m1 = msg.match(/Could not find the '([^']+)' column/i);
    if (m1?.[1]) return String(m1[1]);
    const m2 = msg.match(/column ["']([^"']+)["']\s+of relation/i);
    if (m2?.[1]) return String(m2[1]).trim();
    const m3 = msg.match(/column ["']?([^"'\s]+)["']? does not exist/i);
    if (m3?.[1]) return String(m3[1]);
    return "";
  }

  function isCorePayloadColumn(colName) {
    const nk = normalizeKey(colName);
    for (const key of ["sakuma", "beigu", "vards", "veids"]) {
      if (nk === normalizeKey(runtimeCols[key]) || nk === normalizeKey(WRITE_DEFAULT[key])) return true;
    }
    return false;
  }

  function quotePgColumn(name) {
    const n = String(name ?? "").trim();
    if (!n) return n;
    if (n.includes(" ") || /[^a-zA-Z0-9_]/.test(n)) return `"${n.replace(/"/g, '""')}"`;
    return n;
  }

  async function probeColumn(sb, table, aliases) {
    for (const col of aliases) {
      const name = String(col ?? "").trim();
      if (!name) continue;
      const { error } = await sb.from(table).select(quotePgColumn(name)).limit(1);
      if (!error) return name;
    }
    return "";
  }

  async function ensureRuntimeColsByProbe(sb, table) {
    if (!sb || !table || runtimeColsProbed) return;
    const next = { ...runtimeCols };
    for (const [key, aliases] of Object.entries(FIELD_ALIAS)) {
      const found = await probeColumn(sb, table, [...aliases, WRITE_DEFAULT[key]]);
      if (found) next[key] = found;
    }
    const idFound = await probeColumn(sb, table, ["id", "ID"]);
    if (idFound) runtimeIdCol = idFound;
    const kalFound = await probeColumn(sb, table, [...FIELD_ALIAS.kalendara, WRITE_DEFAULT.kalendara]);
    if (kalFound) next.kalendara = kalFound;
    runtimeCols = next;
    runtimeColsProbed = true;
  }

  async function resolveTableName(sb) {
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
    throw new Error(`Atvaļinājumu tabula nav atrasta. ${lastErr?.message || ""}`.trim());
  }

  function payloadFromDraft(d, users) {
    const p = {};
    const sak = toDateInputValue(d?.sakuma);
    const beig = toDateInputValue(d?.beigu);
    if (sak) p[runtimeCols.sakuma] = sak;
    if (beig) p[runtimeCols.beigu] = beig;
    const refRaw = String(d?.userRef ?? "").trim();
    if (refRaw) {
      const ref = resolveUserRefForDb(d.userRef, users);
      if (ref) p[runtimeCols.vards] = ref;
    } else {
      p[runtimeCols.vards] = null;
    }
    const veids = normalizeVeids(d?.veids);
    p[veidsDbColumn()] = veids || null;
    const pap = toStr(d?.papildu, 2000);
    p[runtimeCols.papildu] = pap || null;
    return p;
  }

  function loadLocalRows(userMap) {
    try {
      const raw = localStorage.getItem(LS_ATV_KEY);
      const rows = raw ? JSON.parse(raw) : [];
      return Array.isArray(rows) ? rows.map((r) => normalizeRow(r, userMap)) : [];
    } catch {
      return [];
    }
  }

  function saveLocalRows(rows) {
    try {
      localStorage.setItem(LS_ATV_KEY, JSON.stringify(Array.isArray(rows) ? rows : []));
    } catch {
      /* ignore */
    }
  }

  function localId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `atv-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  }

  async function insertWithPruning(sb, table, payload, tries = 10) {
    let p = { ...payload };
    let lastErr = null;
    for (let i = 0; i < tries; i += 1) {
      const { data, error } = await sb.from(table).insert(p).select("*").limit(1).single();
      if (!error) return { data };
      lastErr = error;
      const missing = missingColumnFromError(error);
      if (!missing) break;
      const key = Object.keys(p).find((k) => normalizeKey(k) === normalizeKey(missing));
      if (!key) break;
      delete p[key];
      if (Object.keys(p).length === 0) break;
    }
    return { error: lastErr };
  }

  async function updateWithPruning(sb, table, id, payload, tries = 10) {
    let p = { ...payload };
    let lastErr = null;
    for (let i = 0; i < tries; i += 1) {
      const { data, error } = await sb.from(table).update(p).eq(runtimeIdCol, id).select("*").limit(1).maybeSingle();
      if (!error && data) return { data };
      lastErr = error;
      const missing = missingColumnFromError(error);
      if (!missing) break;
      const key = Object.keys(p).find((k) => normalizeKey(k) === normalizeKey(missing));
      if (!key) break;
      if (isCorePayloadColumn(key)) {
        return {
          error: new Error(
            `Datubāzē nav kolonnas „${key}”. Pārbaudi tabulas „Atvalinajumi” kolonnu atvaļinājuma veidam. (${lastErr?.message || ""})`.trim()
          ),
        };
      }
      delete p[key];
      if (Object.keys(p).length === 0) break;
    }
    return { error: lastErr || new Error("Neizdevās atjaunināt ierakstu.") };
  }

  async function fetchAtvalinajumsById(sb, table, id) {
    const { data, error } = await sb.from(table).select("*").eq(runtimeIdCol, id).limit(1).maybeSingle();
    if (error) throw error;
    return data;
  }

  async function fetchRows(sb, teamUsers) {
    const userMap = buildUserMap(teamUsers);
    if (!sb || isLocalMode()) {
      return { rows: loadLocalRows(userMap), vardsColumnIsUuid: false };
    }
    const table = await resolveTableName(sb);
    await ensureRuntimeColsByProbe(sb, table);
    const { data, error } = await sb.from(table).select("*");
    if (error) throw error;
    const list = Array.isArray(data) ? data : [];
    if (list.length) detectRuntimeColsFromRow(list[0]);
    const refs = list.map((r) => pickByAliases(r, FIELD_ALIAS.vards, ""));
    vardsColumnStoresUuid = detectVardsColumnStoresUuid(refs);
    const rows = list
      .map((r) => normalizeRow(r, userMap))
      .sort((a, b) => {
        const as = String(a.sakuma || "");
        const bs = String(b.sakuma || "");
        if (as !== bs) return as.localeCompare(bs);
        return String(a.id || "").localeCompare(String(b.id || ""));
      });
    return { rows, vardsColumnIsUuid: vardsColumnStoresUuid };
  }

  async function saveRow(sb, draft, teamUsers) {
    if (!draft?.sakuma || !draft?.beigu) throw new Error("Norādi sākuma un beigu datumu.");

    const users = Array.isArray(teamUsers) ? teamUsers : [];
    const userMap = buildUserMap(users);
    const dbRef = resolveUserRefForDb(draft.userRef, users);

    if (!sb || isLocalMode()) {
      const rows = loadLocalRows(userMap);
      const norm = normalizeRow(
        {
          id: draft.id || localId(),
          [WRITE_DEFAULT.sakuma]: draft.sakuma,
          [WRITE_DEFAULT.beigu]: draft.beigu,
          [WRITE_DEFAULT.vards]: dbRef,
          [WRITE_DEFAULT.veids]: draft.veids,
          [WRITE_DEFAULT.papildu]: draft.papildu,
        },
        userMap
      );
      const idx = rows.findIndex((r) => String(r.id) === String(norm.id));
      if (idx >= 0) rows[idx] = norm;
      else rows.push(norm);
      saveLocalRows(rows);
      return norm;
    }

    const table = await resolveTableName(sb);
    await ensureRuntimeColsByProbe(sb, table);
    if (draft?._raw) detectRuntimeColsFromRow(draft._raw);
    let payload = payloadFromDraft(draft, users);
    if (draft.id) {
      let r = await updateWithPruning(sb, table, draft.id, payload);
      if (r.error && /invalid input syntax for type uuid/i.test(String(r.error?.message ?? ""))) {
        vardsColumnStoresUuid = false;
        payload = payloadFromDraft(draft, users);
        r = await updateWithPruning(sb, table, draft.id, payload);
      }
      if (r.error && /foreign key constraint/i.test(String(r.error?.message ?? ""))) {
        vardsColumnStoresUuid = true;
        payload = payloadFromDraft(draft, users);
        r = await updateWithPruning(sb, table, draft.id, payload);
      }
      if (r.error) throw r.error;
      const rawRow = r.data || (await fetchAtvalinajumsById(sb, table, draft.id));
      if (!rawRow) throw new Error("Ieraksts netika atrasts pēc saglabāšanas.");
      detectRuntimeColsFromRow(rawRow);
      let updated = normalizeRow(rawRow, userMap);
      const wantVeids = normalizeVeids(draft?.veids);
      if (wantVeids && normalizeVeids(updated.veids) !== wantVeids) {
        const veidsCol = veidsDbColumn();
        const fix = await sb
          .from(table)
          .update({ [veidsCol]: wantVeids })
          .eq(runtimeIdCol, draft.id)
          .select("*")
          .limit(1)
          .maybeSingle();
        if (fix.error) {
          throw new Error(
            `Neizdevās saglabāt atvaļinājuma veidu (${veidsCol}): ${fix.error.message || fix.error}`
          );
        }
        const fixedRow = fix.data || (await fetchAtvalinajumsById(sb, table, draft.id));
        if (fixedRow) {
          detectRuntimeColsFromRow(fixedRow);
          updated = normalizeRow(fixedRow, userMap);
        }
        if (normalizeVeids(updated.veids) !== wantVeids) {
          throw new Error(
            "Atvaļinājuma veids netika saglabāts datubāzē. Pārbaudi, vai kolonna „Atvaļinājuma veids” eksistē (migrācija 20260515130000_atvalinajumi_table.sql)."
          );
        }
      }
      if (parseCalendarFlag(updated) || loadCalendarIdSet().has(String(updated.id ?? ""))) {
        try {
          await syncAtvalinajumsToPrombutnesDati(sb, updated, users, true);
        } catch (e) {
          console.warn("[Atvalinajumi] Prombūtnes vēstures sinhronizācija pēc saglabāšanas:", e?.message || e);
        }
      }
      return updated;
    }
    let r = await insertWithPruning(sb, table, payload);
    if (r.error && /invalid input syntax for type uuid/i.test(String(r.error?.message ?? ""))) {
      vardsColumnStoresUuid = false;
      payload = payloadFromDraft(draft, users);
      r = await insertWithPruning(sb, table, payload);
    }
    if (r.error && /foreign key constraint/i.test(String(r.error?.message ?? ""))) {
      vardsColumnStoresUuid = true;
      payload = payloadFromDraft(draft, users);
      r = await insertWithPruning(sb, table, payload);
    }
    if (r.error) throw r.error;
    detectRuntimeColsFromRow(r.data || {});
    const saved = normalizeRow(r.data, userMap);
    if (parseCalendarFlag(saved) || loadCalendarIdSet().has(String(saved.id ?? ""))) {
      try {
        await syncAtvalinajumsToPrombutnesDati(sb, saved, users, true);
      } catch (e) {
        console.warn("[Atvalinajumi] Prombūtnes vēstures sinhronizācija pēc saglabāšanas:", e?.message || e);
      }
    }
    return saved;
  }

  async function deleteRow(sb, id) {
    if (!id) return;
    await removePrombutneForAtv(sb, id);
    const calSet = loadCalendarIdSet();
    calSet.delete(String(id));
    saveCalendarIdSet(calSet);
    if (!sb || isLocalMode()) {
      saveLocalRows(loadLocalRows().filter((r) => String(r.id) !== String(id)));
      return;
    }
    const table = await resolveTableName(sb);
    const { error } = await sb.from(table).delete().eq(runtimeIdCol, id);
    if (error) throw error;
  }

  async function fetchTeamUsers(sb) {
    if (!sb || isLocalMode()) {
      try {
        const raw = localStorage.getItem("pdd_team_users_v1");
        const parsed = raw ? JSON.parse(raw) : [];
        return (Array.isArray(parsed) ? parsed : []).map(normalizeTeamUser);
      } catch {
        return [];
      }
    }
    const orderCol = COL_USER_NAME;
    const pu = await sb.from("users").select("*").order(orderCol, { ascending: true });
    if (!pu.error && Array.isArray(pu.data) && pu.data.length) {
      return pu.data.map(normalizeTeamUser);
    }
    const pp = await sb.from("profiles").select("*");
    if (!pp.error && Array.isArray(pp.data)) {
      return pp.data.map(normalizeTeamUser).sort((a, b) => teamUserName(a).localeCompare(teamUserName(b), "lv"));
    }
    return [];
  }

  function emptyDraft(defaultUserRef = "") {
    return {
      id: null,
      sakuma: "",
      beigu: "",
      userRef: String(defaultUserRef ?? "").trim(),
      veids: "",
      papildu: "",
    };
  }

  function ensureStyles() {
    if (typeof document === "undefined") return;
    if (document.getElementById("pdd-atv-style-v1")) return;
    const s = document.createElement("style");
    s.id = "pdd-atv-style-v1";
    s.textContent = `
      .atv-wrap { display: grid; gap: 1rem; }
      .atv-head {
        border: 1px solid #a7f3d0;
        background: linear-gradient(180deg, #ecfdf5, #d1fae5);
        border-radius: 12px;
        padding: 0.85rem 1rem;
      }
      .atv-head h2 { margin: 0; font-size: 1.05rem; color: #065f46; }
      .atv-head p { margin: 0.35rem 0 0; font-size: 0.88rem; color: #064e3b; line-height: 1.45; }
      .atv-toolbar { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; justify-content: space-between; }
      .atv-table-wrap {
        overflow: auto;
        border: 1px solid var(--border, #cbd5e1);
        border-radius: 10px;
        background: #fff;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
      }
      .atv-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.86rem;
        min-width: 920px;
      }
      .atv-table th,
      .atv-table td {
        border-bottom: 1px solid #e2e8f0;
        padding: 0.5rem 0.55rem;
        text-align: left;
        vertical-align: middle;
        font-size: 0.9rem;
        color: #0f172a;
      }
      .atv-table th {
        background: #ecfdf5;
        color: #064e3b;
        font-weight: 600;
        position: sticky;
        top: 0;
        z-index: 1;
      }
      .atv-table tbody tr:nth-child(even) { background: #f8fafc; }
      .atv-table tbody tr:hover { background: #f0fdf4; }
      .atv-table tbody tr.atv-row-highlight {
        outline: 2px solid #7c3aed;
        outline-offset: -2px;
        background: rgba(124, 58, 237, 0.16) !important;
      }
      .atv-table tbody tr.atv-row-highlight:hover {
        background: rgba(124, 58, 237, 0.22) !important;
      }
      .atv-view-value {
        display: block;
        color: #0f172a;
        font-size: 0.9rem;
        font-weight: 500;
        line-height: 1.4;
      }
      .atv-view-value--multi {
        white-space: pre-wrap;
        word-break: break-word;
      }
      .atv-view-empty {
        color: #475569;
        font-weight: 400;
      }
      .atv-user-group td {
        background: linear-gradient(90deg, #ecfdf5, #f0fdf4);
        color: #064e3b;
        font-weight: 600;
        font-size: 0.95rem;
        padding: 0.65rem 0.55rem;
        border-top: 2px solid #6ee7b7;
        border-bottom: 1px solid #a7f3d0;
      }
      .atv-user-group-count {
        margin-left: 0.45rem;
        font-weight: 500;
        font-size: 0.82rem;
        color: #047857;
      }
      .atv-toolbar-filters {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem 1rem;
        align-items: center;
      }
      .atv-toolbar-filters label {
        font-size: 0.8rem;
        font-weight: 600;
        color: #064e3b;
      }
      .atv-add-panel {
        margin-top: 1rem;
        padding: 0.85rem 1rem;
        border-radius: 10px;
        border: 1px solid #a7f3d0;
        background: #f0fdf4;
      }
      .atv-add-panel h3 {
        margin: 0 0 0.65rem;
        font-size: 0.95rem;
        color: #065f46;
      }
      .atv-add-grid {
        display: grid;
        gap: 0.65rem;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      }
      .atv-add-grid .field label {
        font-size: 0.78rem;
        font-weight: 600;
        color: #064e3b;
      }
      .atv-add-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-top: 0.35rem;
      }
      .atv-table tbody tr.atv-row-editing {
        background: #fffbeb !important;
        box-shadow: inset 0 0 0 1px rgba(245, 158, 11, 0.45);
      }
      .atv-table tbody tr.atv-row-editing:hover {
        background: #fffbeb !important;
      }
      .atv-table .input,
      .atv-table .select,
      .atv-table .textarea {
        width: 100%;
        min-width: 0;
        font-size: 0.84rem;
      }
      .atv-table .textarea { min-height: 2.4rem; resize: vertical; }
      .atv-actions { display: flex; flex-wrap: wrap; gap: 0.35rem; }
      .atv-empty { padding: 1rem; color: #64748b; font-style: italic; text-align: center; }
      .atv-veids-pill {
        display: inline-block;
        padding: 0.1rem 0.45rem;
        border-radius: 999px;
        font-size: 0.72rem;
        border: 1px solid #6ee7b7;
        background: #ecfdf5;
        color: #047857;
      }
      .atv-veids-pill.pamat {
        border-color: #93c5fd;
        background: #eff6ff;
        color: #1d4ed8;
      }
      .atv-th-stack {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        min-width: 0;
      }
      .atv-th-label-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.35rem;
      }
      .atv-th-label-row span { line-height: 1.25; }
      .atv-col-filter,
      select.atv-col-filter {
        width: 100%;
        font-size: 0.78rem;
        padding: 0.28rem 0.4rem;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        background: #fff;
        max-width: 100%;
      }
      .atv-col-filter:focus,
      select.atv-col-filter:focus {
        outline: none;
        border-color: #059669;
        box-shadow: 0 0 0 2px rgba(5, 150, 105, 0.15);
      }
      .atv-filter-btn {
        flex: 0 0 auto;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0.15rem 0.3rem;
        border: 1px solid transparent;
        border-radius: 6px;
        background: transparent;
        color: #64748b;
        cursor: pointer;
      }
      .atv-filter-btn:hover { background: rgba(5, 150, 105, 0.08); color: #047857; }
      .atv-filter-btn.active {
        border-color: #f97316;
        background: #fff7ed;
        color: #c2410c;
        box-shadow: 0 0 0 1px rgba(249, 115, 22, 0.35);
      }
      .atv-cal-badge {
        display: inline-block;
        font-size: 0.72rem;
        padding: 0.12rem 0.45rem;
        border-radius: 999px;
        border: 1px solid #7c3aed;
        background: #f5f3ff;
        color: #5b21b6;
        margin-right: 0.2rem;
      }
    `;
    document.head.appendChild(s);
  }

  function rowFilterValue(row, key, userMap) {
    const r = row && typeof row === "object" ? row : {};
    if (key === "sakuma") return toDateInputValue(r.sakuma);
    if (key === "beigu") return toDateInputValue(r.beigu);
    if (key === "vards") {
      const resolved = resolveUserRefForUi(r.userRef || r.userRefRaw, userMap);
      return String(resolved.displayName || r.userDisplayName || "").trim();
    }
    if (key === "veids") return String(normalizeVeids(r.veids) || "");
    if (key === "papildu") return toStr(r.papildu, 2000);
    return "";
  }

  function matchesColumnFilter(row, key, filterVal, userMap) {
    const f = String(filterVal ?? "").trim();
    if (!f) return true;
    return rowFilterValue(row, key, userMap) === f;
  }

  function uniqueSorted(values, cmp) {
    const arr = Array.from(
      new Set((Array.isArray(values) ? values : []).map((v) => String(v ?? "").trim()).filter(Boolean))
    );
    arr.sort(cmp || ((a, b) => a.localeCompare(b, "lv")));
    return arr;
  }

  async function probeKalendaraColumn(sb, table) {
    const kalFound = await probeColumn(sb, table, [...FIELD_ALIAS.kalendara, WRITE_DEFAULT.kalendara]);
    if (kalFound) runtimeCols.kalendara = kalFound;
    return kalFound;
  }

  async function setRowShowOnCalendar(sb, row, show, teamUsers) {
    const id = String(row?.id ?? "").trim();
    if (!id) throw new Error("Vispirms saglabā ierakstu ar pogu „Saglabāt”, tad vari atspoguļot kalendārī.");
    const want = Boolean(show);
    const calSet = loadCalendarIdSet();
    if (want) calSet.add(id);
    else calSet.delete(id);
    saveCalendarIdSet(calSet);

    const users = Array.isArray(teamUsers) ? teamUsers : [];

    if (!sb || isLocalMode()) {
      return want;
    }

    const table = await resolveTableName(sb);
    await ensureRuntimeColsByProbe(sb, table);
    const col = (await probeKalendaraColumn(sb, table)) || runtimeCols.kalendara;
    if (col) {
      const r = await updateWithPruning(sb, table, id, { [col]: want });
      if (r.error) {
        console.warn("[Atvalinajumi] Kalendāra karodziņš DB:", r.error?.message || r.error);
      }
    }

    try {
      await syncAtvalinajumsToPrombutnesDati(sb, row, users, want);
    } catch (e) {
      if (want) {
        calSet.delete(id);
        saveCalendarIdSet(calSet);
        if (col) {
          await updateWithPruning(sb, table, id, { [col]: false }).catch(() => {});
        }
      }
      throw e;
    }
    return want;
  }

  function notifyCalendarChanged() {
    try {
      window.dispatchEvent(new CustomEvent("pdd:atvalinajumi-calendar-changed"));
    } catch {
      /* ignore */
    }
  }

  function rowsToCalendarAbsences(rows, userMap) {
    const list = Array.isArray(rows) ? rows : [];
    const map = userMap && userMap.byId ? userMap : buildUserMap(userMap);
    return list
      .filter((r) => r.showOnCalendar && toDateInputValue(r?.sakuma) && toDateInputValue(r?.beigu))
      .map((r) => {
        const resolved = resolveUserRefForUi(r.userRef || r.userRefRaw, map);
        const name = String(resolved.displayName || r.userDisplayName || "").trim() || "Darbinieks";
        const veids = normalizeVeids(r.veids) || "Atvaļinājums";
        const typeLabel = `Atvaļinājums: ${veids}`;
        const createdAt =
          String(r.created_at || "").trim() ||
          (toDateInputValue(r.sakuma) ? `${toDateInputValue(r.sakuma)}T12:00:00.000Z` : "");
        return {
          id: `atv-cal-${String(r.id ?? localId())}`,
          start_date: toDateInputValue(r.sakuma),
          end_date: toDateInputValue(r.beigu),
          created_at: createdAt,
          status: "approved",
          is_atvalinajums: true,
          atvalinajums_id: r.id,
          comment: buildPrombutneCommentFromAtv(r) || null,
          employee: {
            id: resolved.userId || r.userId || "",
            [COL_USER_NAME]: name,
            full_name: name,
          },
          type: {
            name: typeLabel,
            color: CALENDAR_CHIP_COLOR,
          },
        };
      });
  }

  async function appendAtvalinajumiForCalendar(sb, absences, teamUsers) {
    const base = (Array.isArray(absences) ? absences : []).filter(
      (a) => !isCalendarAtvalinajumsEntry(a)
    );
    const baseIds = new Set(base.map((a) => String(a?.id ?? "").trim()).filter(Boolean));
    try {
      let atvRows = [];
      const userMap = buildUserMap(teamUsers);
      if (!sb || isLocalMode()) {
        atvRows = rowsToCalendarAbsences(loadLocalRows(userMap), userMap);
      } else {
        const fetched = await fetchRows(sb, teamUsers);
        atvRows = rowsToCalendarAbsences(fetched?.rows ?? [], userMap);
      }
      const linkMap = loadAtvPrombLinkMap();
      const filteredVirtual = atvRows.filter((v) => {
        const atvId = String(v?.atvalinajums_id ?? "").trim();
        const link = atvId ? linkMap[atvId] : null;
        const prombId = String(link?.prombId ?? link ?? "").trim();
        if (prombId && baseIds.has(prombId)) return false;
        return true;
      });
      return [...base, ...filteredVirtual];
    } catch (e) {
      console.warn("[Atvalinajumi] Kalendāra sinhronizācija:", e);
      return base;
    }
  }

  function isCalendarAtvalinajumsEntry(a) {
    return Boolean(a?.is_atvalinajums || a?.isAtvalinajums);
  }

  function shouldBlockPrombutnesHistoryActions(absence) {
    if (isCalendarAtvalinajumsEntry(absence)) return true;
    if (isPrombutneFromAtvalinajumsGrafiks(absence?.id)) return true;
    return false;
  }

  const GRAFIKS_COMMENT_RE = /^\[Atvaļinājumu grafiks:\s*([^\]]+)\]/i;

  /** Tikai ieraksti, kas reāli radīti/sinhronizēti no Atvaļinājumu grafika (nevis no pieteikuma veidlapas). */
  function isPrombutneHistoryFromAtvGrafiks(absence) {
    const a = absence && typeof absence === "object" ? absence : {};
    if (isCalendarAtvalinajumsEntry(a)) return false;
    const id = String(a.id ?? "").trim();
    if (id && isPrombutneFromAtvalinajumsGrafiks(id)) return true;
    if (id && findAtvIdByPrombId(id)) return true;
    const comment = String(a.comment ?? a.Komentārs ?? a.Komentars ?? "").trim();
    if (GRAFIKS_COMMENT_RE.test(comment)) return true;
    return false;
  }

  function formatPrombutnesHistoryComment(absence) {
    const a = absence && typeof absence === "object" ? absence : {};
    if (!isPrombutneHistoryFromAtvGrafiks(a)) {
      return String(a.comment ?? a.Komentārs ?? a.Komentars ?? "").trim();
    }
    const raw = String(a.comment ?? a.Komentārs ?? a.Komentars ?? "").trim();
    const m = GRAFIKS_COMMENT_RE.exec(raw);
    const veids = String(m?.[1] ?? "").trim();
    const rest = raw.replace(GRAFIKS_COMMENT_RE, "").trim();
    let info = veids ? `No atvaļinājumu grafika (${veids})` : "No atvaļinājumu grafika";
    if (rest) info = `${info} — ${rest}`;
    return info;
  }

  function resolveAtvIdForPrombutnesHistory(absence) {
    const id = String(absence?.id ?? "").trim();
    if (!id) return "";
    return findAtvIdByPrombId(id);
  }

  function openAtvalinajumiGrafiksForPrombutne(absence) {
    const atvId = resolveAtvIdForPrombutnesHistory(absence);
    if (atvId) requestHighlightAtvalinajumsRow(atvId);
    try {
      window.dispatchEvent(new CustomEvent("pdd:prom-sub-change", { detail: { promSub: "atvalinajumi" } }));
    } catch {
      /* ignore */
    }
  }

  function calendarChipStyle(entry) {
    const tc = CALENDAR_CHIP_COLOR;
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(tc);
    const r = m ? parseInt(m[1], 16) : 124;
    const g = m ? parseInt(m[2], 16) : 58;
    const b = m ? parseInt(m[3], 16) : 237;
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const fg = luminance > 0.55 ? "#0f172a" : "#f8fafc";
    return { background: tc, color: fg };
  }

  function buildFilterOptions(rows, userMap, teamUsers) {
    const list = Array.isArray(rows) ? rows : [];
    const sakuma = uniqueSorted(list.map((r) => rowFilterValue(r, "sakuma", userMap)), (a, b) => a.localeCompare(b));
    const beigu = uniqueSorted(list.map((r) => rowFilterValue(r, "beigu", userMap)), (a, b) => a.localeCompare(b));

    const nameSet = new Set();
    for (const u of Array.isArray(teamUsers) ? teamUsers : []) {
      const nm = teamUserName(normalizeTeamUser(u));
      if (nm) nameSet.add(nm);
    }
    for (const r of list) {
      const nm = rowFilterValue(r, "vards", userMap);
      if (nm) nameSet.add(nm);
    }
    const vards = Array.from(nameSet).sort((a, b) => a.localeCompare(b, "lv"));

    const veidsSet = new Set(VEIDS_OPTIONS.map((o) => o.value));
    for (const r of list) {
      const v = rowFilterValue(r, "veids", userMap);
      if (v) veidsSet.add(v);
    }
    const veids = Array.from(veidsSet).sort((a, b) => a.localeCompare(b, "lv"));

    const papildu = uniqueSorted(list.map((r) => rowFilterValue(r, "papildu", userMap)));

    return {
      sakuma: sakuma.map((v) => ({ value: v, label: displayDate(v) })),
      beigu: beigu.map((v) => ({ value: v, label: displayDate(v) })),
      vards: vards.map((v) => ({ value: v, label: v })),
      veids: veids.map((v) => ({ value: v, label: v })),
      papildu: papildu.map((v) => ({
        value: v,
        label: v.length > 48 ? `${v.slice(0, 45)}…` : v,
      })),
    };
  }

  function createAtvalinajumiPanel(html, React) {
    const { useState, useEffect, useCallback, useMemo, useRef } = React;

    return function AtvalinajumiPanel({
      supabase: supabaseProp,
      userId: currentUserId,
      sessionEmail,
      actorDisplayName,
      role: appRole,
      onCalendarChanged,
    }) {
      const sb = supabaseProp ?? globalThis.__PDD_SUPABASE__ ?? null;
      const ownerCtx = useMemo(
        () => ({
          userId: String(currentUserId ?? "").trim(),
          sessionEmail: String(sessionEmail ?? "").trim(),
          displayName: String(actorDisplayName ?? "").trim(),
        }),
        [currentUserId, sessionEmail, actorDisplayName]
      );
      const [rows, setRows] = useState([]);
      const [users, setUsers] = useState([]);
      const [busy, setBusy] = useState(false);
      const [error, setError] = useState(null);
      const [vardsColumnIsUuid, setVardsColumnIsUuid] = useState(true);
      const [draftNew, setDraftNew] = useState(() => emptyDraft(String(currentUserId ?? "").trim()));
      const [edits, setEdits] = useState({});
      const [editingIds, setEditingIds] = useState({});
      const [editUndoStacks, setEditUndoStacks] = useState({});
      const [filters, setFilters] = useState({
        sakuma: "",
        beigu: "",
        vards: "",
        veids: "",
        papildu: "",
      });
      const [highlightRowId, setHighlightRowId] = useState(null);
      const [dataReady, setDataReady] = useState(false);
      const filterInputRefs = useRef({});
      const editsRef = useRef({});

      useEffect(() => {
        editsRef.current = edits;
      }, [edits]);

      const filterActive = useMemo(
        () => ({
          sakuma: String(filters.sakuma ?? "").trim() !== "",
          beigu: String(filters.beigu ?? "").trim() !== "",
          vards: String(filters.vards ?? "").trim() !== "",
          veids: String(filters.veids ?? "").trim() !== "",
          papildu: String(filters.papildu ?? "").trim() !== "",
        }),
        [filters]
      );

      const userOptions = useMemo(() => {
        const list = Array.isArray(users) ? users : [];
        return list
          .map((u) => {
            const nu = normalizeTeamUser(u);
            const id = String(nu.id ?? "").trim();
            const name = teamUserName(nu);
            return {
              id,
              name: name || userEmail(nu) || id,
              selectValue: vardsColumnIsUuid && id ? id : name || id,
            };
          })
          .filter((u) => u.selectValue)
          .sort((a, b) => a.name.localeCompare(b.name, "lv"));
      }, [users, vardsColumnIsUuid]);

      const userMap = useMemo(() => buildUserMap(users), [users]);

      function defaultNewUserRef() {
        const uid = String(currentUserId ?? "").trim();
        if (!uid) return "";
        if (vardsColumnIsUuid) return uid;
        const me = userMap.byId.get(uid);
        return teamUserName(me) || uid;
      }

      const selfUserOptions = useMemo(() => {
        const uid = String(currentUserId ?? "").trim();
        if (!uid) return [];
        const mine = userOptions.filter(
          (u) => String(u.id) === uid || String(u.selectValue) === uid
        );
        if (mine.length) return mine;
        const me = userMap.byId.get(uid);
        const name = teamUserName(me);
        if (name) return [{ id: uid, name, selectValue: name }];
        return [];
      }, [userOptions, userMap, currentUserId]);

      useEffect(() => {
        const ref = defaultNewUserRef();
        if (!ref) return;
        setDraftNew((d) => (String(d?.userRef ?? "").trim() ? d : { ...d, userRef: ref }));
      }, [currentUserId, vardsColumnIsUuid]);

      function rowEditState(row) {
        const id = String(row?.id ?? "");
        const pending = editsRef.current[id] ?? edits[id];
        return pending ? { ...row, ...pending } : row;
      }

      function draftForSave(row) {
        const id = String(row?.id ?? "").trim();
        if (!id) return row;
        const base = (Array.isArray(rows) ? rows : []).find((x) => String(x?.id ?? "") === id) || row;
        const pending = editsRef.current[id] ?? edits[id];
        const merged = pending ? { ...base, ...pending } : { ...base };
        if (base?._raw) merged._raw = base._raw;
        return merged;
      }

      function isRowEditing(rowId) {
        return Boolean(editingIds[String(rowId ?? "")]);
      }

      function startRowEdit(row) {
        const rid = String(row?.id ?? "").trim();
        if (!rid) return;
        if (!canManageAtvRow(rowEditState(row), ownerCtx, userMap)) {
          setError("Šo ierakstu drīkst labot tikai pats darbinieks, kuram tas pieder.");
          return;
        }
        setEditingIds({ [rid]: true });
        setEdits({});
        editsRef.current = {};
        setEditUndoStacks({});
      }

      function cancelRowEdit(row) {
        const rid = String(row?.id ?? "").trim();
        if (!rid) return;
        const next = { ...editsRef.current };
        delete next[rid];
        editsRef.current = next;
        setEdits(next);
        setEditUndoStacks((prev) => {
          const next = { ...prev };
          delete next[rid];
          return next;
        });
        setEditingIds((prev) => {
          const next = { ...prev };
          delete next[rid];
          return next;
        });
      }

      function clearAllRowEditing() {
        setEditingIds({});
        setEditUndoStacks({});
      }

      const filterOptions = useMemo(() => {
        const list = (Array.isArray(rows) ? rows : []).map((r) => rowEditState(r));
        return buildFilterOptions(list, userMap, users);
      }, [rows, edits, userMap, users]);

      const filteredRows = useMemo(() => {
        const list = Array.isArray(rows) ? rows : [];
        const f = filters ?? {};
        return list
          .filter((row) => {
            const state = rowEditState(row);
            if (!matchesColumnFilter(state, "sakuma", f.sakuma, userMap)) return false;
            if (!matchesColumnFilter(state, "beigu", f.beigu, userMap)) return false;
            if (!matchesColumnFilter(state, "vards", f.vards, userMap)) return false;
            if (!matchesColumnFilter(state, "veids", f.veids, userMap)) return false;
            if (!matchesColumnFilter(state, "papildu", f.papildu, userMap)) return false;
            return true;
          })
          .map((row) => rowEditState(row));
      }, [rows, filters, edits, userMap]);

      function setFilter(key, value) {
        setFilters((prev) => ({ ...prev, [key]: value }));
      }

      function clearFilter(key) {
        setFilters((prev) => ({ ...prev, [key]: "" }));
      }

      function onFilterBtnClick(key) {
        if (filterActive[key]) {
          clearFilter(key);
          return;
        }
        const el = filterInputRefs.current?.[key];
        if (el && typeof el.focus === "function") el.focus();
      }

      function renderFilterHeader(label, key) {
        const active = filterActive[key];
        const options = filterOptions[key] ?? [];
        return html`
          <th>
            <div class="atv-th-stack">
              <div class="atv-th-label-row">
                <span>${label}</span>
                <button
                  type="button"
                  class=${`atv-filter-btn${active ? " active" : ""}`}
                  title=${active ? "Notīrīt filtru" : "Filtrēt"}
                  aria-pressed=${active}
                  onClick=${() => onFilterBtnClick(key)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <path d="M22 3H2l8 9v7l4 2v-9l8-9z"></path>
                  </svg>
                </button>
              </div>
              <select
                ref=${(el) => {
                  if (el) filterInputRefs.current[key] = el;
                }}
                class="select atv-col-filter"
                value=${filters[key] ?? ""}
                onChange=${(ev) => setFilter(key, ev.target.value)}
              >
                <option value="">Visi</option>
                ${options.map(
                  (o) => html`
                    <option key=${`${key}-${o.value}`} value=${o.value}>${o.label}</option>
                  `
                )}
              </select>
            </div>
          </th>
        `;
      }

      function applyAtvFormPreset() {
        const preset = consumeAtvFormPreset();
        if (!preset) return;
        setDraftNew((d) => ({
          ...emptyDraft(),
          ...d,
          sakuma: preset.sakuma || d.sakuma,
          beigu: preset.beigu || d.beigu,
          userRef: preset.userRef || d.userRef,
          papildu: preset.papildu || d.papildu,
          veids: preset.veids || d.veids,
        }));
      }

      useEffect(() => {
        applyAtvFormPreset();
        const onPreset = () => applyAtvFormPreset();
        window.addEventListener("pdd:atvalinajumi-apply-preset", onPreset);
        return () => window.removeEventListener("pdd:atvalinajumi-apply-preset", onPreset);
      }, []);

      useEffect(() => {
        const applyHighlight = (atvId) => {
          const id = String(atvId ?? "").trim();
          if (id) setHighlightRowId(id);
        };
        applyHighlight(consumeAtvHighlightId());
        const onHighlight = (ev) => applyHighlight(ev?.detail?.atvId);
        window.addEventListener("pdd:atvalinajumi-highlight-row", onHighlight);
        return () => window.removeEventListener("pdd:atvalinajumi-highlight-row", onHighlight);
      }, []);

      useEffect(() => {
        if (!highlightRowId) return;
        const id = String(highlightRowId);
        const inRows = (rows ?? []).some((r) => String(r?.id ?? "") === id);
        const inFiltered = filteredRows.some((r) => String(r?.id ?? "") === id);
        if (inRows && !inFiltered) {
          setFilters({ sakuma: "", beigu: "", vards: "", veids: "", papildu: "" });
          return;
        }
        if (!inFiltered) return;
        const scrollToRow = () => {
          document.getElementById(`atv-row-${id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
        };
        requestAnimationFrame(() => requestAnimationFrame(scrollToRow));
      }, [highlightRowId, rows, filteredRows]);

      useEffect(() => {
        if (!highlightRowId) return;
        const t = window.setTimeout(() => setHighlightRowId(null), 14000);
        return () => window.clearTimeout(t);
      }, [highlightRowId]);

      const refresh = useCallback(async () => {
        setError(null);
        setBusy(true);
        try {
          const team = await fetchTeamUsers(sb);
          const fetched = await fetchRows(sb, team);
          vardsColumnStoresUuid = Boolean(fetched?.vardsColumnIsUuid);
          setVardsColumnIsUuid(vardsColumnStoresUuid);
          setUsers(team);
          const list = fetched?.rows ?? [];
          setRows(list);
          setDataReady(true);
          setEdits({});
          editsRef.current = {};
          clearAllRowEditing();
        } catch (e) {
          setError(e?.message || String(e));
        } finally {
          setBusy(false);
        }
      }, [sb]);

      useEffect(() => {
        ensureStyles();
        void refresh();
      }, [refresh]);

      function patchEdit(id, patch) {
        const rid = String(id ?? "").trim();
        if (!rid) return;
        const before = editsRef.current[rid] ? { ...editsRef.current[rid] } : {};
        const rowPatch = { ...before, ...patch };
        editsRef.current = { ...editsRef.current, [rid]: rowPatch };
        setEditUndoStacks((stacks) => ({
          ...stacks,
          [rid]: [...(stacks[rid] || []), before],
        }));
        setEdits((prev) => {
          const prevBefore = prev[rid] ? { ...prev[rid] } : {};
          return { ...prev, [rid]: { ...prevBefore, ...patch } };
        });
      }

      function undoLastRowEdit(row) {
        const rid = String(row?.id ?? "").trim();
        if (!rid) return;
        const stack = editUndoStacks[rid] || [];
        if (!stack.length) return;
        const prev = stack[stack.length - 1];
        const newStack = stack.slice(0, -1);
        setEditUndoStacks((st) => ({ ...st, [rid]: newStack }));
        setEdits((e) => {
          const next = { ...e };
          if (prev && Object.keys(prev).length) next[rid] = { ...prev };
          else delete next[rid];
          editsRef.current = next;
          return next;
        });
      }

      async function onSaveExisting(row) {
        const merged = draftForSave(row);
        if (!canManageAtvRow(merged, ownerCtx, userMap)) {
          setError("Šo ierakstu drīkst saglabāt tikai pats darbinieks, kuram tas pieder.");
          return;
        }
        setBusy(true);
        setError(null);
        try {
          await saveRow(sb, merged, users);
          cancelRowEdit(row);
          await refresh();
        } catch (e) {
          setError(e?.message || String(e));
        } finally {
          setBusy(false);
        }
      }

      async function onSaveNew(e) {
        e?.preventDefault?.();
        const toSave = {
          ...draftNew,
          userRef: defaultNewUserRef() || draftNew.userRef,
        };
        if (!isDraftOwnedByUser(toSave, ownerCtx, userMap)) {
          setError("Jaunu ierakstu vari pievienot tikai sev.");
          return;
        }
        setBusy(true);
        setError(null);
        try {
          await saveRow(sb, toSave, users);
          setDraftNew(emptyDraft(defaultNewUserRef()));
          await refresh();
        } catch (err) {
          setError(err?.message || String(err));
        } finally {
          setBusy(false);
        }
      }

      async function onToggleCalendar(row, show) {
        const merged = rowEditState(row);
        if (!canManageAtvRow(merged, ownerCtx, userMap)) {
          setError("Kalendārī vari atspoguļot tikai savus atvaļinājumus.");
          return;
        }
        const id = String(merged?.id ?? row?.id ?? "").trim();
        if (!id) {
          setError("Vispirms saglabā ierakstu ar pogu „Pievienot”, tad vari atspoguļot kalendārī.");
          return;
        }
        setBusy(true);
        setError(null);
        const want = Boolean(show);
        setRows((prev) =>
          prev.map((x) => (String(x?.id ?? "") === id ? { ...x, showOnCalendar: want } : x))
        );
        try {
          await setRowShowOnCalendar(sb, merged, want, users);
          notifyCalendarChanged();
          onCalendarChanged?.();
          await refresh();
        } catch (e) {
          const calSet = loadCalendarIdSet();
          if (want) calSet.delete(id);
          else calSet.add(id);
          saveCalendarIdSet(calSet);
          setRows((prev) =>
            prev.map((x) => (String(x?.id ?? "") === id ? { ...x, showOnCalendar: !want } : x))
          );
          setError(e?.message || String(e));
        } finally {
          setBusy(false);
        }
      }

      async function onDelete(row) {
        if (!row?.id) return;
        if (!canManageAtvRow(rowEditState(row), ownerCtx, userMap)) {
          setError("Šo ierakstu drīkst dzēst tikai pats darbinieks, kuram tas pieder.");
          return;
        }
        if (!confirm("Dzēst šo atvaļinājuma ierakstu?")) return;
        setBusy(true);
        setError(null);
        try {
          await deleteRow(sb, row.id);
          await refresh();
        } catch (e) {
          setError(e?.message || String(e));
        } finally {
          setBusy(false);
        }
      }

      function renderViewValue(text, { multi } = {}) {
        const s = String(text ?? "").trim();
        const empty = !s || s === "—";
        return html`
          <span class=${`atv-view-value${multi ? " atv-view-value--multi" : ""}${empty ? " atv-view-empty" : ""}`}>
            ${empty ? "—" : s}
          </span>
        `;
      }

      function renderDateInput(value, onChange) {
        return html`
          <input
            type="date"
            class="input"
            value=${value || ""}
            onInput=${(ev) => onChange(ev.target.value)}
          />
        `;
      }

      function renderUserSelect(value, onChange, rowHint) {
        const resolved = resolveUserRefForUi(value || rowHint?.userRefRaw || rowHint?.userRef, userMap);
        const selectVal = resolved.selectValue || value || "";
        return html`
          <select class="select" value=${selectVal} onChange=${(ev) => onChange(ev.target.value)}>
            <option value="">— izvēlies —</option>
            ${userOptions.map(
              (u) => html`
                <option key=${u.selectValue} value=${u.selectValue}>${u.name}</option>
              `
            )}
            ${selectVal && !userOptions.some((u) => u.selectValue === selectVal)
              ? html`
                  <option value=${selectVal}>${resolved.displayName || selectVal}</option>
                `
              : null}
          </select>
        `;
      }

      function renderVeidsSelect(value, onChange) {
        return html`
          <select
            class="select"
            value=${normalizeVeids(value) || ""}
            onInput=${(ev) => onChange(ev.target.value)}
            onChange=${(ev) => onChange(ev.target.value)}
          >
            <option value="">— izvēlies —</option>
            ${VEIDS_OPTIONS.map(
              (o) => html`
                <option key=${o.value} value=${o.value}>${o.label}</option>
              `
            )}
          </select>
        `;
      }

      function renderRowCells(r, { isNew }) {
        const state = isNew ? draftNew : rowEditState(r);
        const ownsRow = isNew ? false : canManageAtvRow(r, ownerCtx, userMap);
        const editing = !isNew && ownsRow && isRowEditing(r?.id);
        const readOnly = !isNew && (!ownsRow || !editing);
        const canManage = isNew ? selfUserOptions.length > 0 : ownsRow;
        const lockEmployeeField = !isNew && editing && canManage;
        const setState = isNew
          ? (patch) => setDraftNew((d) => ({ ...d, ...patch }))
          : (patch) => patchEdit(r.id, patch);
        const canUndo = editing && (editUndoStacks[String(r?.id ?? "")] || []).length > 0;
        const userResolved = resolveUserRefForUi(
          state.userRef || r?.userRefRaw || r?.userRef,
          userMap
        );
        const userLabel =
          String(userResolved.displayName || state.userDisplayName || r?.userDisplayName || "").trim() ||
          userResolved.selectValue ||
          "—";

        return html`
          <td>
            ${readOnly
              ? renderViewValue(displayDate(state.sakuma))
              : renderDateInput(state.sakuma, (v) => setState({ sakuma: v }))}
          </td>
          <td>
            ${readOnly
              ? renderViewValue(displayDate(state.beigu))
              : renderDateInput(state.beigu, (v) => setState({ beigu: v }))}
          </td>
          <td>
            ${readOnly || lockEmployeeField
              ? renderViewValue(userLabel)
              : isNew
                ? html`
                    <select
                      class="select"
                      value=${defaultNewUserRef() || state.userRef || ""}
                      onChange=${(ev) => setState({ userRef: ev.target.value })}
                    >
                      ${selfUserOptions.map(
                        (u) => html`
                          <option key=${u.selectValue} value=${u.selectValue}>${u.name}</option>
                        `
                      )}
                    </select>
                  `
                : renderUserSelect(state.userRef, (v) => setState({ userRef: v }), isNew ? null : r)}
          </td>
          <td>
            ${readOnly
              ? renderViewValue(veidsDisplayLabel(state.veids))
              : renderVeidsSelect(state.veids, (v) => setState({ veids: v }))}
          </td>
          <td>
            ${readOnly
              ? renderViewValue(state.papildu, { multi: true })
              : html`
                  <textarea
                    class="textarea"
                    rows="2"
                    placeholder="Brīva piezīme…"
                    value=${state.papildu || ""}
                    onInput=${(ev) => setState({ papildu: ev.target.value })}
                  />
                `}
          </td>
          <td>
            <div class="atv-actions">
              ${isNew
                ? selfUserOptions.length
                  ? html`
                      <button type="button" class="btn btn-primary btn-small" disabled=${busy} onClick=${onSaveNew}>
                        Pievienot
                      </button>
                    `
                  : html`
                      <span class="atv-view-empty" style=${{ fontSize: "0.8rem" }}>Nav piesaistes lietotājam</span>
                    `
                : ownsRow
                  ? html`
                      ${rowEditState(r).showOnCalendar
                        ? html`
                            <span
                              class="atv-cal-badge"
                              title="Šis ieraksts redzams Prombūtnes kalendārī"
                            >
                              Kalendārī
                            </span>
                            <button
                              type="button"
                              class="btn btn-ghost btn-small"
                              disabled=${busy || editing}
                              onClick=${() => onToggleCalendar(r, false)}
                            >
                              Noņemt no kalendāra
                            </button>
                          `
                        : html`
                            <button
                              type="button"
                              class="btn btn-small"
                              style=${{
                                borderColor: "#7c3aed",
                                color: "#5b21b6",
                                background: "#f5f3ff",
                              }}
                              disabled=${busy || editing}
                              onClick=${() => onToggleCalendar(r, true)}
                            >
                              Atspoguļot kalendārī
                            </button>
                          `}
                      ${editing
                        ? html`
                            <button
                              type="button"
                              class="btn btn-primary btn-small"
                              disabled=${busy}
                              onClick=${() => onSaveExisting(r)}
                            >
                              Saglabāt
                            </button>
                            <button
                              type="button"
                              class="btn btn-ghost btn-small"
                              disabled=${busy}
                              onClick=${() => cancelRowEdit(r)}
                            >
                              Atcelt izmaiņas
                            </button>
                            ${canUndo
                              ? html`
                                  <button
                                    type="button"
                                    class="btn btn-ghost btn-small"
                                    disabled=${busy}
                                    onClick=${() => undoLastRowEdit(r)}
                                  >
                                    Atsaukt pēdējo soli
                                  </button>
                                `
                              : null}
                          `
                        : html`
                            <button
                              type="button"
                              class="btn btn-ghost btn-small"
                              disabled=${busy}
                              onClick=${() => startRowEdit(r)}
                            >
                              Labot
                            </button>
                            <button
                              type="button"
                              class="btn btn-danger btn-small"
                              disabled=${busy}
                              onClick=${() => onDelete(r)}
                            >
                              Dzēst
                            </button>
                          `}
                    `
                  : html`
                      <span class="atv-view-empty" style=${{ fontSize: "0.8rem" }} title="Tikai savi ieraksti">
                        —
                      </span>
                    `}
            </div>
          </td>
        `;
      }

      return html`
        <section class="atv-wrap list-panel">
          <div class="atv-head">
            <h2>Atvaļinājumu grafiks</h2>
            <p>
              Ieplānotie atvaļinājumi sinhronizēti ar datubāzi. <strong>Labot</strong>, <strong>dzēst</strong> un
              <strong>Atspoguļot kalendārī</strong> vari tikai savus ierakstus — citu darbinieku ierakstus ne.
            </p>
          </div>
          <div class="atv-toolbar">
            <span style=${{ fontSize: "0.88rem", color: "#1e293b", fontWeight: 500 }}>
              ${!dataReady
                ? "Ielādē datus…"
                : rows.length
                  ? filteredRows.length === rows.length
                    ? `${rows.length} ieraksti`
                    : `Rāda ${filteredRows.length} no ${rows.length}`
                  : "Nav ierakstu"}
              ${isLocalMode() ? " · lokālais režīms" : ""}
            </span>
            <button type="button" class="btn btn-ghost btn-small" disabled=${busy} onClick=${() => void refresh()}>
              Atsvaidzināt
            </button>
          </div>
          ${error
            ? html`
                <div class="banner-warn" role="alert">${error}</div>
              `
            : null}
          <div class="atv-table-wrap">
            <table class="atv-table">
              <thead>
                <tr>
                  ${renderFilterHeader(UI.sakuma, "sakuma")}
                  ${renderFilterHeader(UI.beigu, "beigu")}
                  ${renderFilterHeader(UI.vards, "vards")}
                  ${renderFilterHeader(UI.veids, "veids")}
                  ${renderFilterHeader(UI.papildu, "papildu")}
                  <th>${UI.darbibas}</th>
                </tr>
              </thead>
              <tbody>
                ${!dataReady
                  ? html`
                      <tr>
                        <td colspan="6" class="atv-empty">Ielādē atvaļinājumu datus…</td>
                      </tr>
                    `
                  : rows.length
                    ? filteredRows.length
                      ? filteredRows.map((r) => {
                          const rowHi = highlightRowId && String(highlightRowId) === String(r?.id ?? "");
                          const rowEditing = isRowEditing(r?.id);
                          const rowClass = [rowHi ? "atv-row-highlight" : "", rowEditing ? "atv-row-editing" : ""]
                            .filter(Boolean)
                            .join(" ");
                          return html`
                            <tr
                              key=${String(r.id)}
                              id=${`atv-row-${String(r.id)}`}
                              class=${rowClass || undefined}
                            >
                              ${renderRowCells(r, { isNew: false })}
                            </tr>
                          `;
                        })
                      : html`
                          <tr>
                            <td colspan="6" class="atv-empty">Neviens ieraksts neatbilst filtriem.</td>
                          </tr>
                        `
                    : html`
                        <tr>
                          <td colspan="6" class="atv-empty">Vēl nav ierakstu — pievieno jaunu rindu apakšā.</td>
                        </tr>
                      `}
                <tr style=${{ background: "#f0fdf4" }}>
                  ${renderRowCells(null, { isNew: true })}
                </tr>
              </tbody>
            </table>
          </div>
          
        </section>
      `;
    };
  }

  /** Automātiska navigācijas pogas pievienošana (ja Navigacija.js vēl nav atjaunināta). */
  function tryInstallNavLink() {
    if (typeof document === "undefined") return;
    const run = () => {
      const sub = document.querySelector('.app-nav-sub[aria-label="Prombūtnes apakšsadaļas"]');
      if (!sub || sub.querySelector("[data-pdd-atv-nav]")) return;
      const historyBtn = Array.from(sub.querySelectorAll("button")).find((b) =>
        /prombūtnes vēsture/i.test(String(b.textContent || ""))
      );
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.pddAtvNav = "1";
      btn.className = "app-nav-sublink";
      btn.textContent = "Atvaļinājumu grafiks";
      btn.addEventListener("click", () => {
        try {
          window.dispatchEvent(new CustomEvent("pdd:prom-sub-change", { detail: { promSub: "atvalinajumi" } }));
        } catch {
          /* ignore */
        }
      });
      if (historyBtn?.nextSibling) sub.insertBefore(btn, historyBtn.nextSibling);
      else sub.appendChild(btn);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
    else run();
  }

  globalThis.PDD_ATVALINAJUMI = {
    createAtvalinajumiPanel,
    fetchRows,
    saveRow,
    deleteRow,
    normalizeRow,
    normalizeTeamUser,
    teamUserName,
    buildUserMap,
    rowsToCalendarAbsences,
    appendAtvalinajumiForCalendar,
    setRowShowOnCalendar,
    notifyCalendarChanged,
    isRowOwnedByUser,
    canManageAtvRow,
    isAdminAppRole,
    isCalendarAtvalinajumsEntry,
    isPrombutneFromAtvalinajumsGrafiks,
    isPrombutneHistoryFromAtvGrafiks,
    formatPrombutnesHistoryComment,
    resolveAtvIdForPrombutnesHistory,
    openAtvalinajumiGrafiksForPrombutne,
    shouldBlockPrombutnesHistoryActions,
    setAtvFormPreset,
    consumeAtvFormPreset,
    resolveAtvalinajumsIdFromCalendarAbsence,
    requestHighlightAtvalinajumsRow,
    calendarChipStyle,
    CALENDAR_CHIP_COLOR,
    UI,
    VEIDS_OPTIONS,
    COL_USER_NAME,
  };

  tryInstallNavLink();
})();
