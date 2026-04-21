(function () {
  const LS_TEAM_USERS = "pdd_team_users_v1";
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

  // Lokāls seed (varēsi labot/dzēst/papildināt UI).
  // Shape atbilst Supabase public.users kolonnām (tā, lai UI šeit un migrācijās nesajūk):
  // id, full_name, email, role, created_at, Amats, Vārds uzvārds, i-mail
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
  }

  function upsertTeamUser(user) {
    const actor = getCurrentLocalActor();
    if (actor.role !== "admin") {
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
    };
  }

  function deleteTeamUser(id) {
    const actor = getCurrentLocalActor();
    if (actor.role !== "admin") {
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
    const actorEmail = await resolveActorEmail(supabase);
    let lastError = null;

    async function tryRpc() {
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

    for (const col of AIZVIETO_KEYS) {
      const payload = { [col]: value };
      const { data, error } = await supabase.from("users").update(payload).eq("id", uid).select("id").limit(1);
      if (!error) {
        if (Array.isArray(data) && data.length > 0) return { ok: true, column: col };
        const { error: eBare } = await supabase.from("users").update(payload).eq("id", uid);
        if (!eBare) return { ok: true, column: col };
        lastError = eBare;
        const rpcOk = await tryRpc();
        if (rpcOk) return rpcOk;
        break;
      }
      const msg = String(error?.message ?? "");
      if (/column .* does not exist/i.test(msg) || /Could not find the .* column/i.test(msg)) {
        lastError = error;
        continue;
      }
      lastError = error;
      const rpcOk = await tryRpc();
      if (rpcOk) return rpcOk;
      break;
    }
    const rpcOk = await tryRpc();
    if (rpcOk) return rpcOk;
    return { error: lastError ?? new Error("Neizdevās saglabāt Aizvieto (users / RPC).") };
  }

  async function setUserAizvieto({ userId, replacementUserId = "", replacementName = "", syncDb = true }) {
    const uid = String(userId ?? "").trim();
    if (!uid) return { error: new Error("Trūkst userId.") };

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
    if (db?.error) return { ok: false, user: users[targetIndex], synced: false, error: db.error };
    return { ok: true, user: users[targetIndex], synced: true };
  }

  function getCurrentLocalActor() {
    // Šī lapa strādā “lokālajā režīmā” caur sessionStorage, un loma nāk no COMANDA lokālās tabulas.
    // Ja nav login-informācijas, pieņemam defaultu (local-user-1).
    const uid = sessionStorage.getItem(LS_LOCAL_USER_ID) || LOCAL_USER_ID;
    const list = loadTeamUsers();
    const me = (Array.isArray(list) ? list : []).find((u) => String(u.id) === String(uid)) ?? null;
    const role = normalizeUser(me)?.role === "admin" ? "admin" : "user";
    return { id: uid, role };
  }

  // Public API (tikai komandas lietotāji; ziņas atsevišķi Zinas.js)
  window.KOMANDA = {
    loadTeamUsers,
    saveTeamUsers,
    upsertTeamUser,
    deleteTeamUser,
    getReplacementOptions,
    setUserAizvieto,
    saveAizvietoToSupabase,
    TEAM_SECTION_IMAGE_SRC,
  };
})();

