(function () {
  const LS_TEAM_USERS = "pdd_team_users_v1";
  const LS_TEAM_USERS_SYNC_AT = "pdd_team_users_sync_at_v1";
  /** Cik ilgi uzticam kešu bez jauna `users` SELECT (samazina Egress). */
  const TEAM_USERS_CACHE_TTL_MS = 12 * 60 * 1000;
  const LS_LOCAL_USER_ID = "pdd_local_user_id";
  const LOCAL_USER_ID = "local-user-1";
  const TEAM_SECTION_IMAGE_SRC = "./public/komanda-info.png?v=20260413";
  const AIZVIETO_KEYS = [
    "Aizvieto",
    "aizvieto",
    "Aizvietotājs",
    "Aizvietotajs",
    "aizvietotājs",
    "aizvietotajs",
    "replacement_user",
    "replacement_name",
    "replaced_by",
  ];

  /** Atbilst Supabase `public.users.Kompetence` (text); citi nosaukumi — tikai lasīšanas/sinhronizācijas rezervei. */
  const COL_KOMPETENCE_PAPILDU = "Kompetence";
  const PAPILDU_KOMP_KEYS = [
    "Kompetence",
    "Kompetence_papildu",
    "Kompetence_un_uzdevumi",
    "Kompetences_un_pamata_uzdevumi",
    "Kompetence_un_pamata_uzdevumi",
    "Papildu_info_kompetence",
    "Papildu_info",
    "papildu_info",
    "Kompetences_apraksts",
    "Pamata_uzdevumi",
    "pamata_uzdevumi",
    "competence_notes",
    "main_tasks_note",
  ];

  // Lokāls seed (varēsi labot/dzēst/papildināt UI).
  // Shape atbilst Supabase public.users kolonnām (tā, lai UI šeit un migrācijās nesajūk):
  // id, full_name, email, role, created_at, Amats, Vārds uzvārds, i-mail, Kompetence, …
  const seedUsers = [
    {
      id: "local-user-1",
      role: "admin",
      Amats: "Vadītājs",
      "Vārds uzvārds": "Irina Kupcova",
      email: "irina.kupcova@vid.gov.lv",
      "i-mail": "irina.kupcova@vid.gov.lv",
      full_name: "Irina Kupcova",
      Aizvieto: "",
      created_at: new Date().toISOString(),
    },
    {
      id: "u-2",
      role: "admin",
      Amats: "Pakalpojumu pārvaldības procesu eksperte",
      "Vārds uzvārds": "Vita Kazakēviča",
      email: "vita.kazakcevica@vid.gov.lv",
      "i-mail": "vita.kazakcevica@vid.gov.lv",
      full_name: "Vita Kazakēviča",
      Aizvieto: "",
      created_at: new Date().toISOString(),
    },
    {
      id: "u-3",
      role: "admin",
      Amats: "Vecākais eksperts",
      "Vārds uzvārds": "Elita Jēkabsonē",
      email: "elita.jekabsonne@vid.gov.lv",
      "i-mail": "elita.jekabsonne@vid.gov.lv",
      full_name: "Elita Jēkabsonē",
      Aizvieto: "",
      created_at: new Date().toISOString(),
    },
    {
      id: "u-4",
      role: "admin",
      Amats: "Vecākais eksperts",
      "Vārds uzvārds": "Svetlana Novoselova",
      email: "svetlana.novoselova@vid.gov.lv",
      "i-mail": "svetlana.novoselova@vid.gov.lv",
      full_name: "Svetlana Novoselova",
      Aizvieto: "",
      created_at: new Date().toISOString(),
    },
    {
      id: "u-5",
      role: "admin",
      Amats: "Pakalpojumu pārvaldības procesu eksperte",
      "Vārds uzvārds": "Lilita Gurnaša",
      email: "lilita.gurnasa@vid.gov.lv",
      "i-mail": "lilita.gurnasa@vid.gov.lv",
      full_name: "Lilita Gurnaša",
      Aizvieto: "",
      created_at: new Date().toISOString(),
    },
    {
      id: "u-6",
      role: "admin",
      Amats: "Vecākais eksperts",
      "Vārds uzvārds": "Elita Sēlvanova",
      email: "elita.selvanova@vid.gov.lv",
      "i-mail": "elita.selvanova@vid.gov.lv",
      full_name: "Elita Sēlvanova",
      Aizvieto: "",
      created_at: new Date().toISOString(),
    },
    {
      id: "u-7",
      role: "admin",
      Amats: "Vadītājs",
      "Vārds uzvārds": "Katrīna Jurgensone",
      email: "katrina.jurgensone@vid.gov.lv",
      "i-mail": "katrina.jurgensone@vid.gov.lv",
      full_name: "Katrīna Jurgensone",
      Aizvieto: "",
      created_at: new Date().toISOString(),
    },
    {
      id: "u-8",
      role: "admin",
      Amats: "Vecākais eksperts",
      "Vārds uzvārds": "Elīna Jespersonē",
      email: "elina.jespersonne@vid.gov.lv",
      "i-mail": "elina.jespersonne@vid.gov.lv",
      full_name: "Elīna Jespersonē",
      Aizvieto: "",
      created_at: new Date().toISOString(),
    },
  ];

  function pickAizvieto(src) {
    if (!src || typeof src !== "object") return "";
    for (const k of AIZVIETO_KEYS) {
      const v = src[k];
      if (v == null) continue;
      const s = String(v).trim();
      if (s) return s;
    }
    return "";
  }

  function normalizeAizvieto(v) {
    return String(v ?? "").trim().slice(0, 300);
  }

  function pickPapilduKompetence(src) {
    if (!src || typeof src !== "object") return "";
    for (const k of PAPILDU_KOMP_KEYS) {
      const v = src[k];
      if (v == null) continue;
      const s = String(v).trim();
      if (s) return s;
    }
    return "";
  }

  function normalizePapilduKompetence(v) {
    return String(v ?? "").trim().slice(0, 4000);
  }

  function collectTeamUserEmails(u) {
    const out = [];
    const push = (raw) => {
      const s = String(raw ?? "").trim().toLowerCase();
      if (s && s.includes("@") && !out.includes(s)) out.push(s);
    };
    if (!u || typeof u !== "object") return out;
    push(u.email);
    push(u["i-mail"]);
    push(u["e-mail"]);
    return out;
  }

  function collectActorEmailsSync() {
    const out = [];
    const push = (raw) => {
      const s = String(raw ?? "").trim().toLowerCase();
      if (s && s.includes("@") && !out.includes(s)) out.push(s);
    };
    push(globalThis.__PDD_ACTOR_EMAIL__);
    try {
      push(sessionStorage.getItem("pdd_local_email"));
    } catch {
      /* ignore */
    }
    const actor = getCurrentLocalActor();
    const list = loadTeamUsers();
    const me =
      list.find((u) => String(u?.id ?? "").trim() === String(actor?.id ?? "").trim()) ||
      list.find((u) => {
        const emails = collectTeamUserEmails(u);
        return emails.some((em) => out.includes(em));
      });
    if (me) {
      for (const em of collectTeamUserEmails(me)) push(em);
      push(pickEmailForRpcFromUserRow(me));
    }
    return out;
  }

  function isSelfTeamRow(targetUserId) {
    const tid = String(targetUserId ?? "").trim();
    if (!tid) return false;
    const ids = resolveActorTeamIds();
    if (ids.has(tid)) return true;
    const actorEmails = new Set(collectActorEmailsSync());
    if (!actorEmails.size) return false;
    const target = loadTeamUsers().find((u) => String(u?.id ?? "").trim() === tid);
    if (!target) return false;
    return collectTeamUserEmails(target).some((em) => actorEmails.has(em));
  }

  function resolveActorTeamIds() {
    const ids = new Set();
    const actor = getCurrentLocalActor();
    if (actor?.id) ids.add(String(actor.id).trim());
    const g = String(globalThis.__PDD_ACTOR_USER_ID__ ?? "").trim();
    if (g) ids.add(g);
    const sess = String(globalThis.__PDD_SESSION_USER_ID__ ?? "").trim();
    if (sess) ids.add(sess);
    return ids;
  }

  function isGlobalActorAdmin() {
    const r = String(globalThis.__PDD_ACTOR_ROLE__ ?? "").trim().toLowerCase();
    return r === "admin" || r === "manager" || r === "vaditajs" || r === "vadītājs";
  }

  async function collectActorEmailsForRpc(supabase) {
    const out = [];
    const push = (raw) => {
      const s = String(raw ?? "").trim().toLowerCase();
      if (s && s.includes("@") && !out.includes(s)) out.push(s);
    };
    push(globalThis.__PDD_ACTOR_EMAIL__);
    push(sessionStorage.getItem("pdd_local_email"));
    if (supabase?.auth?.getSession) {
      try {
        const s = await supabase.auth.getSession();
        push(s?.data?.session?.user?.email);
      } catch {
        /* ignore */
      }
    }
    if (supabase?.auth?.getUser) {
      try {
        const u = await supabase.auth.getUser();
        push(u?.data?.user?.email);
      } catch {
        /* ignore */
      }
    }
    const actorId = String(globalThis.__PDD_ACTOR_USER_ID__ ?? "").trim();
    const list = loadTeamUsers();
    const me =
      list.find((u) => String(u?.id ?? "").trim() === actorId) ||
      list.find((u) => {
        const a = String(u?.email ?? "").trim().toLowerCase();
        const b = String(u?.["i-mail"] ?? "").trim().toLowerCase();
        const c = String(u?.["e-mail"] ?? "").trim().toLowerCase();
        return out.some((em) => em === a || em === b || em === c);
      });
    if (me) {
      push(pickEmailForRpcFromUserRow(me));
      push(me.email);
      push(me["i-mail"]);
      push(me["e-mail"]);
    }
    return out;
  }

  async function ensureUserInLocalCache(userId, supabase) {
    const uid = String(userId ?? "").trim();
    if (!uid) return loadTeamUsers();
    let users = loadTeamUsers();
    if (users.some((u) => String(u.id) === uid)) return users;
    if (supabase?.from) {
      try {
        const { data } = await supabase.from("users").select("*").eq("id", uid).maybeSingle();
        if (data) {
          users = [...users, normalizeUser(data)];
          saveTeamUsers(users);
          return users;
        }
      } catch {
        /* ignore */
      }
    }
    return users;
  }

  function applyDbRowToLocalCache(row) {
    if (!row || typeof row !== "object") return;
    const uid = String(row.id ?? "").trim();
    if (!uid) return;
    const users = loadTeamUsers();
    const idx = users.findIndex((u) => String(u.id) === uid);
    const merged = normalizeUser({ ...(idx >= 0 ? users[idx] : {}), ...row, id: uid });
    if (idx >= 0) users[idx] = merged;
    else users.push(merged);
    saveTeamUsers(users);
  }

  /** Administrators var labot jebkuru; parastais lietotājs — tikai savu ierakstu (pēc ID vai e-pasta). */
  function assertMayEditTeamUserRow(targetUserId) {
    const tid = String(targetUserId ?? "").trim();
    if (!tid) return { ok: false, error: new Error("Trūkst userId.") };
    if (isGlobalActorAdmin()) return { ok: true };
    const actor = getCurrentLocalActor();
    if (actor.role === "admin") return { ok: true };
    if (isSelfTeamRow(tid)) return { ok: true };
    return {
      ok: false,
      error: new Error("Tikai administrators vai pats lietotājs var mainīt šo informāciju."),
    };
  }

  function isUuidLike(v) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v ?? ""));
  }

  async function ensureDbSessionForKomanda(supabase) {
    const fn = globalThis.__PDD_ENSURE_DB_SESSION__;
    if (typeof fn === "function") {
      try {
        await fn();
      } catch {
        /* ignore */
      }
    } else if (supabase?.auth?.getSession) {
      try {
        const s = await supabase.auth.getSession();
        if (!s?.data?.session?.access_token && supabase.auth.signInAnonymously) {
          await supabase.auth.signInAnonymously();
        }
      } catch {
        /* ignore */
      }
    }
  }

  async function lookupUserIdByEmailRpc(supabase, email) {
    const em = String(email ?? "").trim().toLowerCase();
    if (!em || !em.includes("@") || !supabase?.rpc) return "";
    try {
      const { data, error } = await supabase.rpc("pdd_lookup_user_by_email", { p_email: em });
      if (error || !Array.isArray(data) || !data.length) return "";
      const r0 = data[0];
      return String(r0?.user_id ?? r0?.id ?? "").trim();
    } catch {
      return "";
    }
  }

  async function resolveTargetUserIdForKompetence(userId, supabase) {
    const uid = String(userId ?? "").trim();
    if (!uid) return uid;
    const row = loadTeamUsers().find((u) => String(u?.id ?? "").trim() === uid);
    const emails = collectTeamUserEmails(row);
    if (supabase) {
      for (const em of emails) {
        const found = await lookupUserIdByEmailRpc(supabase, em);
        if (found) return found;
      }
      if (isSelfTeamRow(uid)) {
        const actorEmails = await collectActorEmailsForRpc(supabase);
        for (const em of actorEmails) {
          const found = await lookupUserIdByEmailRpc(supabase, em);
          if (found) return found;
        }
      }
    }
    return isUuidLike(uid) ? uid : uid;
  }

  function kompetenceRpcActorNotFoundError(err) {
    const msg = String(err?.message ?? err ?? "");
    if (!/nav atrasts public\.users pēc e-pasta/i.test(msg)) return null;
    return new Error(
      "Tavs e-pasts ir public.users tabulā kolonnā \"e-mail\", bet serverī nav atjaunināta kompetences saglabāšanas funkcija. Administrators: palaid supabase/migrations/20260618120000_pdd_self_kompetence_by_email.sql (vai scripts/apply-kompetence-migration.ps1).",
    );
  }

  function notifyTeamUsersChanged() {
    try {
      window.dispatchEvent(new CustomEvent("pdd:komanda-team-users-changed"));
    } catch {
      // ignore
    }
  }

  function isTeamUsersCacheFresh() {
    try {
      const at = Number(localStorage.getItem(LS_TEAM_USERS_SYNC_AT) || 0);
      const users = loadTeamUsers();
      return users.length >= 2 && at > 0 && Date.now() - at < TEAM_USERS_CACHE_TTL_MS;
    } catch {
      return false;
    }
  }

  function loadTeamUsers() {
    const raw = localStorage.getItem(LS_TEAM_USERS);
    const hasDb = Boolean(globalThis.__PDD_SUPABASE__);
    if (!raw) {
      // DB režīmā neizmantojam lokālo seed sarakstu, lai neparādās "izdomāti" vārdi.
      if (hasDb) return [];
      localStorage.setItem(LS_TEAM_USERS, JSON.stringify(seedUsers));
      return [...seedUsers].map(normalizeUser);
    }
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error("bad");
      return parsed.map(normalizeUser);
    } catch {
      if (hasDb) return [];
      localStorage.setItem(LS_TEAM_USERS, JSON.stringify(seedUsers));
      return [...seedUsers].map(normalizeUser);
    }
  }

  function saveTeamUsers(users) {
    localStorage.setItem(LS_TEAM_USERS, JSON.stringify((users ?? []).map(normalizeUser)));
    try {
      localStorage.setItem(LS_TEAM_USERS_SYNC_AT, String(Date.now()));
    } catch {
      /* ignore */
    }
    notifyTeamUsersChanged();
  }

  function upsertTeamUser(user) {
    if (!isGlobalActorAdmin() && getCurrentLocalActor().role !== "admin") {
      alert("Labot drīkst tikai Admin.");
      return null;
    }
    const users = loadTeamUsers();
    const idx = users.findIndex((u) => String(u.id) === String(user.id));
    const safe = normalizeUser(user);
    if (idx >= 0) users[idx] = safe;
    else users.push(safe);
    saveTeamUsers(users);
    return safe;
  }

  function normalizeUser(u) {
    const rawRole = String(u?.role ?? "user").trim().toLowerCase();
    const role = rawRole === "admin" ? "admin" : "user";
    const id = String(u?.id ?? "").trim() || String(u?.user_id ?? "");
    const vard = u?.["Vārds uzvārds"] ?? u?.vardUzv ?? u?.full_name ?? "";
    const amats = u?.["Amats"] ?? u?.amats ?? "";
    const epastsHyphen = u?.["e-mail"] ?? u?.e_mail ?? "";
    const iMail = u?.["i-mail"] ?? u?.imail ?? u?.email ?? u?.["e-pasts"] ?? epastsHyphen ?? "";
    const email = u?.email ?? u?.["e-mail"] ?? iMail ?? "";
    const full = u?.full_name ?? vard;
    const aizvieto = normalizeAizvieto(pickAizvieto(u));
    const kompPap = normalizePapilduKompetence(pickPapilduKompetence(u) || u?.[COL_KOMPETENCE_PAPILDU] || "");
    return {
      id,
      role,
      full_name: String(full ?? ""),
      email: String(email ?? ""),
      created_at: u?.created_at ?? new Date().toISOString(),
      "Vārds uzvārds": String(vard ?? ""),
      "Amats": String(amats ?? ""),
      "i-mail": String(iMail ?? ""),
      "e-mail": String(epastsHyphen ?? "").trim(),
      Aizvieto: aizvieto,
      [COL_KOMPETENCE_PAPILDU]: kompPap,
    };
  }

  function deleteTeamUser(id) {
    if (!isGlobalActorAdmin() && getCurrentLocalActor().role !== "admin") {
      alert("Dzēst drīkst tikai Admin.");
      return;
    }
    const users = loadTeamUsers().filter((u) => String(u.id) !== String(id));
    saveTeamUsers(users);
  }

  function getReplacementOptions(excludeUserId) {
    const ex = String(excludeUserId ?? "").trim();
    return loadTeamUsers()
      .filter((u) => String(u?.id ?? "").trim() && String(u.id) !== ex)
      .map((u) => ({
        id: String(u.id),
        name: String(u["Vārds uzvārds"] ?? u.full_name ?? "").trim(),
      }))
      .filter((x) => x.name);
  }

  function pickEmailForRpcFromUserRow(u) {
    if (!u || typeof u !== "object") return "";
    const a = String(u.email ?? "").trim();
    const b = String(u["i-mail"] ?? "").trim();
    const c = String(u["e-mail"] ?? "").trim();
    return a || b || c || "";
  }

  async function resolveActorEmail(supabase) {
    const fromGlobal = String(globalThis.__PDD_ACTOR_EMAIL__ ?? "").trim();
    if (fromGlobal) return fromGlobal;
    const fromSession = String(sessionStorage.getItem("pdd_local_email") ?? "").trim();
    if (fromSession) return fromSession;

    let authEm = "";
    if (supabase?.auth?.getSession) {
      try {
        const s = await supabase.auth.getSession();
        authEm = String(s?.data?.session?.user?.email ?? "").trim().toLowerCase();
      } catch {
        // ignore
      }
    }
    if (!authEm && supabase?.auth?.getUser) {
      try {
        const u = await supabase.auth.getUser();
        authEm = String(u?.data?.user?.email ?? "").trim().toLowerCase();
      } catch {
        // ignore
      }
    }
    if (authEm) {
      const list = loadTeamUsers();
      const me = list.find((u) => {
        const a = String(u?.email ?? "").trim().toLowerCase();
        const b = String(u?.["i-mail"] ?? "").trim().toLowerCase();
        const c = String(u?.["e-mail"] ?? "").trim().toLowerCase();
        return a === authEm || b === authEm || c === authEm;
      });
      if (me) {
        const forRpc = pickEmailForRpcFromUserRow(me);
        if (forRpc) return forRpc;
      }
      return authEm;
    }

    const actorId = String(sessionStorage.getItem(LS_LOCAL_USER_ID) || "").trim();
    if (actorId) {
      const me = loadTeamUsers().find((u) => String(u?.id ?? "").trim() === actorId);
      const em = pickEmailForRpcFromUserRow(me);
      if (em) return em;
    }
    return "";
  }

  async function saveAizvietoToSupabase(userId, aizvietoValue) {
    const supabase = globalThis.__PDD_SUPABASE__;
    if (!supabase) return { skipped: true, reason: "no_supabase" };
    const uid = String(userId ?? "").trim();
    if (!uid) return { error: new Error("Trūkst userId.") };
    const value = normalizeAizvieto(aizvietoValue) || null;
    const actorEmails = await collectActorEmailsForRpc(supabase);
    let lastError = null;

    async function tryRpc(actorEmail) {
      if (!actorEmail) return null;
      const { data: rpcData, error: rpcError } = await supabase.rpc("pdd_update_user_aizvieto_by_email", {
        p_actor_email: actorEmail,
        p_target_user_id: uid,
        p_aizvieto: value,
      });
      if (!rpcError) return { ok: true, rpc: true, row: rpcData };
      lastError = rpcError;
      const { data: rpcData2, error: rpcError2 } = await supabase.rpc("pdd_update_user_aizvieto_open_by_email", {
        p_actor_email: actorEmail,
        p_target_user_id: uid,
        p_aizvieto: value,
      });
      if (!rpcError2) return { ok: true, rpc: true, row: rpcData2 };
      lastError = rpcError2;
      return null;
    }

    for (const em of actorEmails) {
      const rpcOk = await tryRpc(em);
      if (rpcOk) return rpcOk;
    }

    for (const col of AIZVIETO_KEYS) {
      const payload = { [col]: value };
      const { data, error } = await supabase.from("users").update(payload).eq("id", uid).select("id").limit(1);
      if (!error) {
        if (Array.isArray(data) && data.length > 0) return { ok: true, column: col };
        const { error: eBare } = await supabase.from("users").update(payload).eq("id", uid);
        if (!eBare) return { ok: true, column: col };
        lastError = eBare;
        break;
      }
      const msg = String(error?.message ?? "");
      if (/column .* does not exist/i.test(msg) || /Could not find the .* column/i.test(msg)) {
        lastError = error;
        continue;
      }
      lastError = error;
      break;
    }
    for (const em of actorEmails) {
      const rpcOk = await tryRpc(em);
      if (rpcOk) return rpcOk;
    }
    return { error: lastError ?? new Error("Neizdevās saglabāt Aizvieto (users / RPC).") };
  }

  function kompetenceFromDbRow(row) {
    return normalizePapilduKompetence(pickPapilduKompetence(row) || row?.[COL_KOMPETENCE_PAPILDU] || "");
  }

  async function savePapilduKompetenceToSupabase(userId, textValue, opts = {}) {
    const supabase = globalThis.__PDD_SUPABASE__;
    if (!supabase) return { skipped: true, reason: "no_supabase" };
    const uiUid = String(opts.uiUserId ?? userId ?? "").trim();
    const rawUid = String(userId ?? "").trim();
    if (!rawUid) return { error: new Error("Trūkst userId.") };
    await ensureDbSessionForKomanda(supabase);
    const uid = await resolveTargetUserIdForKompetence(rawUid, supabase);
    const value = normalizePapilduKompetence(textValue) || null;
    const actorEmails = await collectActorEmailsForRpc(supabase);
    const selfRow = isSelfTeamRow(uiUid || rawUid);
    let lastError = null;

    async function trySelfRpc(actorEmail) {
      if (!actorEmail || !selfRow) return null;
      const { data: rpcData, error: rpcError } = await supabase.rpc("pdd_update_self_kompetence_by_email", {
        p_actor_email: actorEmail,
        p_kompetence: value,
      });
      if (!rpcError && rpcData) {
        return { ok: true, rpc: true, row: rpcData, column: "Kompetence", self: true };
      }
      if (rpcError) {
        lastError = kompetenceRpcActorNotFoundError(rpcError) || rpcError;
        const msg = String(rpcError?.message ?? "");
        if (/function .* does not exist|could not find the function/i.test(msg)) {
          lastError = null;
        }
      }
      return null;
    }

    async function tryRpc(actorEmail) {
      if (!actorEmail) return null;
      const { data: rpcData, error: rpcError } = await supabase.rpc("pdd_update_user_kompetence_by_email", {
        p_actor_email: actorEmail,
        p_target_user_id: uid,
        p_kompetence: value,
      });
      if (!rpcError && rpcData) {
        return { ok: true, rpc: true, row: rpcData, column: "Kompetence" };
      }
      lastError = kompetenceRpcActorNotFoundError(rpcError) || rpcError;
      const msg = String(rpcError?.message ?? "");
      if (/function .* does not exist|could not find the function/i.test(msg)) {
        lastError = new Error(
          "Datubāzē nav kompetences saglabāšanas funkcijas — palaid scripts/apply-kompetence-migration.ps1 vai SQL migrāciju 20260618120000_pdd_self_kompetence_by_email.sql.",
        );
        return null;
      }
      const { data: rpcData2, error: rpcError2 } = await supabase.rpc("pdd_update_user_kompetence_open_by_email", {
        p_actor_email: actorEmail,
        p_target_user_id: uid,
        p_kompetence: value,
      });
      if (!rpcError2 && rpcData2) {
        return { ok: true, rpc: true, row: rpcData2, column: "Kompetence" };
      }
      lastError = kompetenceRpcActorNotFoundError(rpcError2 || rpcError) || rpcError2 || rpcError;
      return null;
    }

    if (selfRow) {
      for (const em of actorEmails) {
        const selfHit = await trySelfRpc(em);
        if (selfHit) return selfHit;
      }
    }

    for (const em of actorEmails) {
      const rpcHit = await tryRpc(em);
      if (rpcHit) return rpcHit;
    }

    for (const col of PAPILDU_KOMP_KEYS) {
      const payload = { [col]: value };
      const { data, error } = await supabase.from("users").update(payload).eq("id", uid).select("id").limit(1);
      if (!error) {
        if (Array.isArray(data) && data.length > 0) return { ok: true, column: col };
        const { data: data2, error: eBare } = await supabase.from("users").update(payload).eq("id", uid).select("id").limit(1);
        if (!eBare && Array.isArray(data2) && data2.length > 0) return { ok: true, column: col };
        if (!eBare) {
          lastError = new Error("Kompetence netika saglabāta — nav tiesību tieši rakstīt users tabulā (izmanto RPC).");
        } else {
          lastError = eBare;
        }
        break;
      }
      const msg = String(error?.message ?? "");
      if (/column .* does not exist/i.test(msg) || /Could not find the .* column/i.test(msg)) {
        lastError = error;
        continue;
      }
      lastError = error;
      break;
    }
    for (const em of actorEmails) {
      const rpcHit = await tryRpc(em);
      if (rpcHit) return rpcHit;
    }
    return { error: lastError ?? new Error("Neizdevās saglabāt papildu informāciju par kompetenci (users / RPC).") };
  }

  async function setUserPapilduKompetenceInfo({ userId, text = "", syncDb = true }) {
    const uid = String(userId ?? "").trim();
    if (!uid) return { error: new Error("Trūkst userId.") };

    const perm = assertMayEditTeamUserRow(uid);
    if (!perm.ok) return { error: perm.error };

    const sb = globalThis.__PDD_SUPABASE__;
    await ensureUserInLocalCache(uid, sb);

    const users = loadTeamUsers();
    const i = users.findIndex((u) => String(u.id) === uid);
    if (i < 0) {
      users.push(
        normalizeUser({
          id: uid,
          role: "user",
          "Vārds uzvārds": "",
          full_name: "",
          email: "",
          "i-mail": "",
          Amats: "",
          Aizvieto: "",
          [COL_KOMPETENCE_PAPILDU]: "",
        })
      );
    }
    const targetIndex = i >= 0 ? i : users.findIndex((u) => String(u.id) === uid);
    if (targetIndex < 0) return { error: new Error("Lietotājs nav atrasts.") };

    const nextText = normalizePapilduKompetence(text);
    users[targetIndex] = normalizeUser({ ...users[targetIndex], [COL_KOMPETENCE_PAPILDU]: nextText });
    saveTeamUsers(users);

    if (!syncDb) return { ok: true, user: users[targetIndex], synced: false };
    const db = await savePapilduKompetenceToSupabase(uid, nextText, { uiUserId: uid });
    if (db?.error) {
      const msg = String(db.error?.message ?? db.error ?? "");
      return {
        ok: false,
        user: users[targetIndex],
        synced: false,
        error: new Error(
          msg.includes("nav atjaunināta kompetences") || msg.includes("apply-kompetence-migration")
            ? msg
            : msg.includes("nav atrasts public.users")
              ? "Tavs e-pasts nav sinhronizēts ar komandas tabulu (public.users). Piesakies ar darba e-pastu, kas tur ir reģistrēts."
              : msg.includes("pdd_update_user_kompetence") || msg.includes("pdd_update_self_kompetence")
                ? msg
                : msg || "Neizdevās saglabāt kompetences aprakstu DB."
        ),
      };
    }
    if (db?.row) {
      applyDbRowToLocalCache(db.row);
      const savedId = String(db.row.id ?? "").trim();
      if (savedId && savedId !== uid) {
        const refreshed = loadTeamUsers();
        const uiIdx = refreshed.findIndex((u) => String(u.id) === uid);
        if (uiIdx >= 0) {
          refreshed[uiIdx] = normalizeUser({
            ...refreshed[uiIdx],
            [COL_KOMPETENCE_PAPILDU]: kompetenceFromDbRow(db.row),
          });
          saveTeamUsers(refreshed);
        }
      }
      const savedText = kompetenceFromDbRow(db.row);
      if (savedText !== nextText && nextText && !db?.self) {
        return {
          ok: false,
          user: users[targetIndex],
          synced: false,
          error: new Error(
            "Kompetence netika saglabāta datubāzē. Palaid scripts/apply-kompetence-migration.ps1 (vai SQL migrāciju 20260618120000_pdd_self_kompetence_by_email.sql).",
          ),
        };
      }
    }
    if (db?.skipped) return { ok: true, user: users[targetIndex], synced: false };
    return { ok: true, user: loadTeamUsers().find((u) => String(u.id) === uid) || users[targetIndex], synced: true };
  }

  async function setUserAizvieto({ userId, replacementUserId = "", replacementName = "", syncDb = true }) {
    const uid = String(userId ?? "").trim();
    if (!uid) return { error: new Error("Trūkst userId.") };

    const perm = assertMayEditTeamUserRow(uid);
    if (!perm.ok) return { error: perm.error };

    const sb = globalThis.__PDD_SUPABASE__;
    await ensureUserInLocalCache(uid, sb);

    const users = loadTeamUsers();
    const i = users.findIndex((u) => String(u.id) === uid);
    if (i < 0) {
      users.push(
        normalizeUser({
          id: uid,
          role: "user",
          "Vārds uzvārds": "",
          full_name: "",
          email: "",
          "i-mail": "",
          Amats: "",
          Aizvieto: "",
        })
      );
    }
    const targetIndex = i >= 0 ? i : users.findIndex((u) => String(u.id) === uid);
    if (targetIndex < 0) return { error: new Error("Lietotājs nav atrasts.") };

    let next = "";
    const repId = String(replacementUserId ?? "").trim();
    if (repId) {
      const rep = users.find((u) => String(u.id) === repId);
      next = normalizeAizvieto(rep?.["Vārds uzvārds"] ?? rep?.full_name ?? "");
    }
    if (!next) next = normalizeAizvieto(replacementName);

    users[targetIndex] = normalizeUser({ ...users[targetIndex], Aizvieto: next || "" });
    saveTeamUsers(users);

    if (!syncDb) return { ok: true, user: users[targetIndex], synced: false };
    const db = await saveAizvietoToSupabase(uid, next);
    if (db?.error) {
      const msg = String(db.error?.message ?? db.error ?? "");
      return {
        ok: false,
        user: users[targetIndex],
        synced: false,
        error: new Error(
          msg.includes("nav atrasts public.users")
            ? "Tavs e-pasts nav sinhronizēts ar komandas tabulu (public.users). Piesakies ar darba e-pastu, kas tur ir reģistrēts."
            : msg || "Neizdevās saglabāt Aizvieto."
        ),
      };
    }
    if (db?.row) applyDbRowToLocalCache(db.row);
    return { ok: true, user: loadTeamUsers().find((u) => String(u.id) === uid) || users[targetIndex], synced: true };
  }

  function getCurrentLocalActor() {
    const uid =
      String(globalThis.__PDD_ACTOR_USER_ID__ ?? "").trim() ||
      sessionStorage.getItem(LS_LOCAL_USER_ID) ||
      LOCAL_USER_ID;
    const list = loadTeamUsers();
    const authEm = String(globalThis.__PDD_ACTOR_EMAIL__ ?? sessionStorage.getItem("pdd_local_email") ?? "")
      .trim()
      .toLowerCase();
    let me = (Array.isArray(list) ? list : []).find((u) => String(u.id) === String(uid)) ?? null;
    if (!me && authEm) {
      me =
        list.find((u) => {
          const a = String(u?.email ?? "").trim().toLowerCase();
          const b = String(u?.["i-mail"] ?? "").trim().toLowerCase();
          const c = String(u?.["e-mail"] ?? "").trim().toLowerCase();
          return a === authEm || b === authEm || c === authEm;
        }) ?? null;
    }
    let role = "user";
    if (isGlobalActorAdmin()) role = "admin";
    else if (normalizeUser(me)?.role === "admin") role = "admin";
    return { id: me?.id ? String(me.id) : uid, role };
  }

  function isActorAdmin() {
    if (isGlobalActorAdmin()) return true;
    if (getCurrentLocalActor().role === "admin") return true;
    const actor = getCurrentLocalActor();
    const me = loadTeamUsers().find((u) => String(u?.id ?? "").trim() === String(actor?.id ?? "").trim());
    const r = String(me?.role ?? "").trim().toLowerCase();
    return r === "admin" || r === "manager" || r === "vaditajs" || r === "vadītājs";
  }

  function assertIsAdminForCrud() {
    if (isActorAdmin()) return { ok: true };
    return { ok: false, error: new Error("Tikai administrators var pārvaldīt komandas ierakstus.") };
  }

  function newTeamUserId() {
    try {
      if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
      }
    } catch {
      /* ignore */
    }
    return `u-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function buildTeamUserDbPayload(user) {
    const u = normalizeUser(user);
    const name = String(u["Vārds uzvārds"] ?? u.full_name ?? "").trim();
    const email = String(u.email ?? u["i-mail"] ?? u["e-mail"] ?? "").trim();
    return {
      "Vārds uzvārds": name || null,
      full_name: name || null,
      email: email || null,
      "i-mail": email || null,
      "e-mail": email || null,
      Amats: String(u.Amats ?? "").trim() || null,
      role: u.role === "admin" ? "admin" : "user",
      Aizvieto: normalizeAizvieto(u.Aizvieto) || null,
      [COL_KOMPETENCE_PAPILDU]: normalizePapilduKompetence(u[COL_KOMPETENCE_PAPILDU]) || null,
    };
  }

  async function saveTeamUserToSupabase(user, { isNew = false } = {}) {
    const supabase = globalThis.__PDD_SUPABASE__;
    if (!supabase?.from) return { skipped: true, reason: "no_supabase" };
    const u = normalizeUser(user);
    const uid = String(u.id ?? "").trim();
    if (!uid) return { error: new Error("Trūkst lietotāja id.") };
    await ensureDbSessionForKomanda(supabase);
    const payload = buildTeamUserDbPayload(u);
    let lastError = null;

    if (isNew) {
      const ins = await supabase
        .from("users")
        .insert({ id: uid, ...payload, created_at: u.created_at || new Date().toISOString() })
        .select("*")
        .maybeSingle();
      if (!ins.error && ins.data) return { ok: true, row: ins.data, created: true };
      lastError = ins.error;
      const email = pickEmailForRpcFromUserRow(u);
      if (email) {
        const foundId = await lookupUserIdByEmailRpc(supabase, email);
        if (foundId) {
          return saveTeamUserToSupabase({ ...u, id: foundId }, { isNew: false });
        }
      }
      return { error: lastError ?? new Error("Neizdevās pievienot lietotāju datubāzē.") };
    }

    const upd = await supabase.from("users").update(payload).eq("id", uid).select("*").maybeSingle();
    if (!upd.error && upd.data) return { ok: true, row: upd.data, created: false };
    lastError = upd.error;
    const email = pickEmailForRpcFromUserRow(u);
    if (email) {
      const foundId = await lookupUserIdByEmailRpc(supabase, email);
      if (foundId && foundId !== uid) {
        const upd2 = await supabase.from("users").update(payload).eq("id", foundId).select("*").maybeSingle();
        if (!upd2.error && upd2.data) return { ok: true, row: upd2.data, created: false, remappedId: foundId };
        lastError = upd2.error || lastError;
      }
    }
    return { error: lastError ?? new Error("Neizdevās saglabāt lietotāja datus datubāzē.") };
  }

  async function deleteTeamUserFromSupabase(userId) {
    const supabase = globalThis.__PDD_SUPABASE__;
    if (!supabase?.from) return { skipped: true, reason: "no_supabase" };
    const uid = String(userId ?? "").trim();
    if (!uid) return { error: new Error("Trūkst lietotāja id.") };
    await ensureDbSessionForKomanda(supabase);
    const { error } = await supabase.from("users").delete().eq("id", uid);
    if (error) return { error };
    return { ok: true };
  }

  async function createTeamUser({
    vardUzv = "",
    email = "",
    amats = "",
    role = "user",
    aizvieto = "",
    kompetence = "",
    syncDb = true,
  } = {}) {
    const perm = assertIsAdminForCrud();
    if (!perm.ok) return { error: perm.error };
    const name = String(vardUzv ?? "").trim();
    const em = String(email ?? "").trim();
    if (!name) return { error: new Error("Ievadi vārdu un uzvārdu.") };
    if (!em || !em.includes("@")) return { error: new Error("Ievadi derīgu e-pastu.") };

    const id = newTeamUserId();
    const user = normalizeUser({
      id,
      role: String(role ?? "user").toLowerCase() === "admin" ? "admin" : "user",
      "Vārds uzvārds": name,
      full_name: name,
      email: em,
      "i-mail": em,
      "e-mail": em,
      Amats: String(amats ?? "").trim(),
      Aizvieto: normalizeAizvieto(aizvieto),
      [COL_KOMPETENCE_PAPILDU]: normalizePapilduKompetence(kompetence),
      created_at: new Date().toISOString(),
    });

    const users = loadTeamUsers();
    if (users.some((u) => collectTeamUserEmails(u).includes(em.toLowerCase()))) {
      return { error: new Error("Lietotājs ar šo e-pastu jau ir sarakstā.") };
    }
    users.push(user);
    saveTeamUsers(users);

    if (!syncDb) return { ok: true, user, synced: false };
    const db = await saveTeamUserToSupabase(user, { isNew: true });
    if (db?.row) applyDbRowToLocalCache(db.row);
    if (db?.error) {
      return {
        ok: true,
        user: loadTeamUsers().find((u) => String(u.id) === id) || user,
        synced: false,
        error: new Error(String(db.error?.message ?? db.error ?? "Neizdevās sinhronizēt ar datubāzi.")),
      };
    }
    if (db?.skipped) return { ok: true, user, synced: false };
    return { ok: true, user: loadTeamUsers().find((u) => String(u.id) === id) || user, synced: true };
  }

  async function updateTeamUserProfile({ userId, patch = {}, syncDb = true } = {}) {
    const uid = String(userId ?? "").trim();
    if (!uid) return { error: new Error("Trūkst userId.") };
    const perm = assertIsAdminForCrud();
    if (!perm.ok) return { error: perm.error };

    const users = loadTeamUsers();
    const idx = users.findIndex((u) => String(u.id) === uid);
    if (idx < 0) return { error: new Error("Lietotājs nav atrasts.") };

    const p = patch && typeof patch === "object" ? patch : {};
    const nextName = p["Vārds uzvārds"] ?? p.vardUzv ?? p.full_name;
    const nextEmail = p.email ?? p["i-mail"] ?? p["e-mail"];
    const nextAmats = p.Amats ?? p.amats;
    const nextRole = p.role;
    const nextAizvieto = p.Aizvieto ?? p.aizvieto;
    const nextKomp = p[COL_KOMPETENCE_PAPILDU] ?? p.kompetence;

    const merged = normalizeUser({
      ...users[idx],
      ...(nextName !== undefined ? { "Vārds uzvārds": nextName, full_name: nextName } : {}),
      ...(nextEmail !== undefined
        ? { email: nextEmail, "i-mail": nextEmail, "e-mail": nextEmail }
        : {}),
      ...(nextAmats !== undefined ? { Amats: nextAmats } : {}),
      ...(nextRole !== undefined ? { role: nextRole } : {}),
      ...(nextAizvieto !== undefined ? { Aizvieto: nextAizvieto } : {}),
      ...(nextKomp !== undefined ? { [COL_KOMPETENCE_PAPILDU]: nextKomp } : {}),
      id: uid,
    });

    users[idx] = merged;
    saveTeamUsers(users);

    if (!syncDb) return { ok: true, user: merged, synced: false };
    const db = await saveTeamUserToSupabase(merged, { isNew: false });
    if (db?.row) {
      applyDbRowToLocalCache(db.row);
      if (db.remappedId && db.remappedId !== uid) {
        const refreshed = loadTeamUsers().filter((u) => String(u.id) !== uid);
        saveTeamUsers(refreshed);
        applyDbRowToLocalCache(db.row);
      }
    }
    if (db?.error) {
      return {
        ok: true,
        user: merged,
        synced: false,
        error: new Error(String(db.error?.message ?? db.error ?? "Neizdevās sinhronizēt ar datubāzi.")),
      };
    }
    if (db?.skipped) return { ok: true, user: merged, synced: false };
    const saved = loadTeamUsers().find((u) => String(u.id) === String(db?.row?.id ?? uid)) || merged;
    return { ok: true, user: saved, synced: true };
  }

  async function deleteTeamUserWithDb(userId, { syncDb = true } = {}) {
    const uid = String(userId ?? "").trim();
    if (!uid) return { error: new Error("Trūkst userId.") };
    const perm = assertIsAdminForCrud();
    if (!perm.ok) return { error: perm.error };
    if (isSelfTeamRow(uid)) return { error: new Error("Nevar dzēst savu ierakstu.") };

    deleteTeamUser(uid);
    if (!syncDb) return { ok: true, synced: false };
    const db = await deleteTeamUserFromSupabase(uid);
    if (db?.error) {
      return {
        ok: true,
        synced: false,
        error: new Error(String(db.error?.message ?? db.error ?? "Neizdevās dzēst no datubāzes.")),
      };
    }
    if (db?.skipped) return { ok: true, synced: false };
    return { ok: true, synced: true };
  }

  function escHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function injectKomandaAdminStyles() {
    if (document.getElementById("pdd-komanda-admin-styles")) return;
    const st = document.createElement("style");
    st.id = "pdd-komanda-admin-styles";
    st.textContent = `
      .team-users-panel:has(#pdd-komanda-admin-root) > .table-wrap { display: none !important; }
      .pdd-komanda-admin-toolbar {
        display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center;
        margin: 0 0 0.65rem;
      }
      .pdd-komanda-admin-msg { font-size: 0.78rem; color: var(--muted, #64748b); }
      .pdd-komanda-admin-msg.is-err { color: #b91c1c; }
      .pdd-komanda-admin-msg.is-ok { color: #047857; }
      .pdd-komanda-admin-table-wrap { overflow: auto; border: 1px solid var(--border, #c5ebe3); border-radius: 10px; }
      .pdd-komanda-admin-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; min-width: 880px; }
      .pdd-komanda-admin-table th, .pdd-komanda-admin-table td {
        border-bottom: 1px solid var(--border, #e0f2ee); padding: 0.42rem 0.45rem; vertical-align: top;
      }
      .pdd-komanda-admin-table th { background: #e8f8f3; color: #065f46; font-weight: 600; text-align: left; }
      .pdd-komanda-admin-table input,
      .pdd-komanda-admin-table select,
      .pdd-komanda-admin-table textarea {
        width: 100%; box-sizing: border-box; font: inherit; font-size: 0.78rem;
        border: 1px solid var(--border, #c5ebe3); border-radius: 6px; padding: 0.22rem 0.35rem; background: #fff;
      }
      .pdd-komanda-admin-table textarea { min-height: 3.2rem; resize: vertical; }
      .pdd-komanda-admin-actions { display: flex; flex-wrap: wrap; gap: 0.3rem; white-space: nowrap; }
      .pdd-komanda-admin-btn {
        border: 1px solid var(--border, #c5ebe3); background: #fff; border-radius: 8px;
        padding: 0.22rem 0.5rem; font-size: 0.76rem; cursor: pointer;
      }
      .pdd-komanda-admin-btn.primary { background: #0d9488; color: #fff; border-color: #0d9488; }
      .pdd-komanda-admin-btn.danger { color: #b91c1c; border-color: #fecaca; }
      .pdd-komanda-admin-btn:disabled { opacity: 0.55; cursor: not-allowed; }
      .pdd-komanda-admin-new {
        margin: 0 0 0.75rem; padding: 0.65rem 0.75rem; border: 1px dashed #c5ebe3;
        border-radius: 10px; background: #f8fffd;
      }
      .pdd-komanda-admin-new-grid {
        display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 0.45rem;
      }
      .pdd-komanda-admin-new label { display: grid; gap: 0.15rem; font-size: 0.74rem; color: #0f766e; }
    `;
    document.head.appendChild(st);
  }

  function mountKomandaAdminUi(panel) {
    if (!panel || !isActorAdmin()) return;
    if (panel.querySelector("#pdd-komanda-admin-root")) return;
    injectKomandaAdminStyles();

    const root = document.createElement("div");
    root.id = "pdd-komanda-admin-root";
    root.innerHTML = `
      <div class="pdd-komanda-admin-toolbar">
        <button type="button" class="pdd-komanda-admin-btn primary" data-act="toggle-new">+ Jauns lietotājs</button>
        <span class="pdd-komanda-admin-msg" data-role="msg"></span>
      </div>
      <div class="pdd-komanda-admin-new" data-role="new-form" hidden>
        <div class="pdd-komanda-admin-new-grid">
          <label>Vārds uzvārds<input type="text" data-new="name" placeholder="Vārds Uzvārds" /></label>
          <label>e-pasts<input type="email" data-new="email" placeholder="vards.uzvards@vid.gov.lv" /></label>
          <label>Amats<input type="text" data-new="amats" placeholder="Amats" /></label>
          <label>Loma
            <select data-new="role">
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
          </label>
        </div>
        <div style="margin-top:0.45rem;display:flex;gap:0.35rem;flex-wrap:wrap">
          <button type="button" class="pdd-komanda-admin-btn primary" data-act="create-user">Pievienot</button>
          <button type="button" class="pdd-komanda-admin-btn" data-act="cancel-new">Atcelt</button>
        </div>
      </div>
      <div class="pdd-komanda-admin-table-wrap">
        <table class="pdd-komanda-admin-table">
          <thead>
            <tr>
              <th>Loma</th>
              <th>Vārds uzvārds</th>
              <th>e-pasts</th>
              <th>Amats</th>
              <th>Aizvieto</th>
              <th>Kompetence</th>
              <th></th>
            </tr>
          </thead>
          <tbody data-role="tbody"></tbody>
        </table>
      </div>
    `;

    const tableWrap = panel.querySelector(".table-wrap");
    if (tableWrap) panel.insertBefore(root, tableWrap);
    else panel.appendChild(root);

    const msgEl = root.querySelector('[data-role="msg"]');
    const tbody = root.querySelector('[data-role="tbody"]');
    const newForm = root.querySelector('[data-role="new-form"]');

    function setMsg(text, kind) {
      if (!msgEl) return;
      msgEl.textContent = String(text ?? "");
      msgEl.classList.remove("is-err", "is-ok");
      if (kind === "err") msgEl.classList.add("is-err");
      if (kind === "ok") msgEl.classList.add("is-ok");
    }

    function aizvietoOptions(excludeId) {
      return getReplacementOptions(excludeId)
        .map((o) => `<option value="${escHtml(o.id)}">${escHtml(o.name)}</option>`)
        .join("");
    }

    function renderAdminTable() {
      const users = loadTeamUsers();
      if (!tbody) return;
      tbody.innerHTML = users
        .map((u) => {
          const uid = escHtml(u.id);
          const role = u.role === "admin" ? "admin" : "user";
          const aizvRaw = String(u.Aizvieto ?? "").trim();
          const usersList = loadTeamUsers();
          const aizvByName = usersList.find(
            (x) =>
              String(x?.["Vārds uzvārds"] ?? x?.full_name ?? "")
                .trim()
                .toLowerCase() === aizvRaw.toLowerCase(),
          );
          const aizvSel = String(aizvByName?.id ?? "").trim();
          return `
            <tr data-uid="${uid}">
              <td>
                <select data-f="role">
                  <option value="user"${role === "user" ? " selected" : ""}>user</option>
                  <option value="admin"${role === "admin" ? " selected" : ""}>admin</option>
                </select>
              </td>
              <td><input type="text" data-f="name" value="${escHtml(u["Vārds uzvārds"] ?? u.full_name ?? "")}" /></td>
              <td><input type="email" data-f="email" value="${escHtml(u.email ?? u["i-mail"] ?? "")}" /></td>
              <td><input type="text" data-f="amats" value="${escHtml(u.Amats ?? "")}" /></td>
              <td>
                <select data-f="aizvieto">
                  <option value="">Nav norādīts</option>
                  ${aizvietoOptions(u.id)}
                </select>
              </td>
              <td><textarea data-f="kompetence" rows="2">${escHtml(u[COL_KOMPETENCE_PAPILDU] ?? "")}</textarea></td>
              <td>
                <div class="pdd-komanda-admin-actions">
                  <button type="button" class="pdd-komanda-admin-btn primary" data-act="save-row">Saglabāt</button>
                  <button type="button" class="pdd-komanda-admin-btn danger" data-act="delete-row">Dzēst</button>
                </div>
              </td>
            </tr>
          `;
        })
        .join("");

      for (const tr of tbody.querySelectorAll("tr[data-uid]")) {
        const uid = tr.getAttribute("data-uid");
        const u = users.find((x) => String(x.id) === String(uid));
        if (!u) continue;
        const aizvRaw = String(u.Aizvieto ?? "").trim();
        const byName = users.find(
          (x) =>
            String(x?.["Vārds uzvārds"] ?? x?.full_name ?? "")
              .trim()
              .toLowerCase() === aizvRaw.toLowerCase(),
        );
        const sel = tr.querySelector('[data-f="aizvieto"]');
        if (sel && byName?.id) sel.value = String(byName.id);
        else if (sel && !aizvRaw) sel.value = "";
      }
    }

    async function saveRow(tr) {
      const uid = tr.getAttribute("data-uid");
      if (!uid) return;
      const aizvId = String(tr.querySelector('[data-f="aizvieto"]')?.value ?? "").trim();
      let aizvietoName = "";
      if (aizvId) {
        const rep = loadTeamUsers().find((x) => String(x.id) === aizvId);
        aizvietoName = String(rep?.["Vārds uzvārds"] ?? rep?.full_name ?? "").trim();
      }
      const btn = tr.querySelector('[data-act="save-row"]');
      if (btn) btn.disabled = true;
      setMsg("Saglabā…", "");
      const r = await updateTeamUserProfile({
        userId: uid,
        patch: {
          role: tr.querySelector('[data-f="role"]')?.value ?? "user",
          "Vārds uzvārds": tr.querySelector('[data-f="name"]')?.value ?? "",
          email: tr.querySelector('[data-f="email"]')?.value ?? "",
          Amats: tr.querySelector('[data-f="amats"]')?.value ?? "",
          Aizvieto: aizvietoName,
          [COL_KOMPETENCE_PAPILDU]: tr.querySelector('[data-f="kompetence"]')?.value ?? "",
        },
        syncDb: true,
      });
      if (btn) btn.disabled = false;
      if (r?.error) {
        setMsg(String(r.error?.message ?? r.error), "err");
        return;
      }
      setMsg(r?.synced === false ? "Saglabāts lokāli; DB sinhronizācija neizdevās." : "Saglabāts.", r?.synced === false ? "err" : "ok");
      renderAdminTable();
    }

    root.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn || !root.contains(btn)) return;
      const act = btn.getAttribute("data-act");
      if (act === "toggle-new") {
        if (newForm) newForm.hidden = !newForm.hidden;
        return;
      }
      if (act === "cancel-new") {
        if (newForm) newForm.hidden = true;
        return;
      }
      if (act === "create-user") {
        btn.disabled = true;
        setMsg("Pievieno…", "");
        const r = await createTeamUser({
          vardUzv: root.querySelector('[data-new="name"]')?.value ?? "",
          email: root.querySelector('[data-new="email"]')?.value ?? "",
          amats: root.querySelector('[data-new="amats"]')?.value ?? "",
          role: root.querySelector('[data-new="role"]')?.value ?? "user",
          syncDb: true,
        });
        btn.disabled = false;
        if (r?.error) {
          setMsg(String(r.error?.message ?? r.error), "err");
          return;
        }
        setMsg(r?.synced === false ? "Pievienots lokāli; DB sinhronizācija neizdevās." : "Lietotājs pievienots.", r?.synced === false ? "err" : "ok");
        if (newForm) {
          newForm.hidden = true;
          for (const el of newForm.querySelectorAll("input")) el.value = "";
          const roleSel = newForm.querySelector('[data-new="role"]');
          if (roleSel) roleSel.value = "user";
        }
        renderAdminTable();
        return;
      }
      const tr = btn.closest("tr[data-uid]");
      if (!tr) return;
      if (act === "save-row") {
        await saveRow(tr);
        return;
      }
      if (act === "delete-row") {
        const uid = tr.getAttribute("data-uid");
        const name = tr.querySelector('[data-f="name"]')?.value ?? "";
        if (!uid) return;
        if (!confirm(`Dzēst lietotāju „${name || uid}"?`)) return;
        btn.disabled = true;
        setMsg("Dzēš…", "");
        const r = await deleteTeamUserWithDb(uid, { syncDb: true });
        btn.disabled = false;
        if (r?.error) {
          setMsg(String(r.error?.message ?? r.error), "err");
          return;
        }
        setMsg(r?.synced === false ? "Dzēsts lokāli; DB dzēšana neizdevās." : "Dzēsts.", r?.synced === false ? "err" : "ok");
        renderAdminTable();
      }
    });

    window.addEventListener("pdd:komanda-team-users-changed", renderAdminTable);
    renderAdminTable();
  }

  function scanKomandaAdminPanels() {
    if (!isActorAdmin()) return;
    for (const panel of document.querySelectorAll(".team-users-panel")) {
      mountKomandaAdminUi(panel);
    }
  }

  function initKomandaAdminUi() {
    scanKomandaAdminPanels();
    const root = document.getElementById("root");
    if (!root || typeof MutationObserver === "undefined") return;
    const obs = new MutationObserver(() => {
      scanKomandaAdminPanels();
    });
    obs.observe(root, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initKomandaAdminUi);
  } else {
    initKomandaAdminUi();
  }

  // Public API (tikai komandas lietotāji; ziņas atsevišķi Zinas.js)
  window.KOMANDA = {
    loadTeamUsers,
    saveTeamUsers,
    isTeamUsersCacheFresh,
    mergeTeamUsersCache(rows) {
      if (!Array.isArray(rows) || !rows.length) return;
      const byId = new Map(loadTeamUsers().map((u) => [String(u.id), u]));
      for (const r of rows) {
        const id = String(r?.id ?? "").trim();
        if (!id) continue;
        byId.set(id, normalizeUser({ ...(byId.get(id) || {}), ...r, id }));
      }
      saveTeamUsers([...byId.values()]);
    },
    upsertTeamUser,
    deleteTeamUser,
    createTeamUser,
    updateTeamUserProfile,
    deleteTeamUserWithDb,
    saveTeamUserToSupabase,
    isActorAdmin,
    getReplacementOptions,
    setUserAizvieto,
    setUserPapilduKompetenceInfo,
    saveAizvietoToSupabase,
    savePapilduKompetenceToSupabase,
    COL_KOMPETENCE_PAPILDU,
    mayEditTeamUserRow: (targetUserId) => assertMayEditTeamUserRow(targetUserId).ok,
    TEAM_SECTION_IMAGE_SRC,
  };
})();

