(function () {
  const LS_TEAM_USERS = "pdd_team_users_v1";
  const LS_LOCAL_USER_ID = "pdd_local_user_id";
  const LOCAL_USER_ID = "local-user-1";

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
      created_at: new Date().toISOString(),
    },
    {
      id: "u-5",
      role: "admin",
      Amats: "Pakalpojumu pārvaldības procesu eksperte",
      "Vārds uzvārds": "Lilita Gurnasa",
      email: "lilita.gurnasa@vid.gov.lv",
      "i-mail": "lilita.gurnasa@vid.gov.lv",
      full_name: "Lilita Gurnasa",
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
      created_at: new Date().toISOString(),
    },
  ];

  function loadTeamUsers() {
    const raw = localStorage.getItem(LS_TEAM_USERS);
    if (!raw) {
      localStorage.setItem(LS_TEAM_USERS, JSON.stringify(seedUsers));
      return [...seedUsers].map(normalizeUser);
    }
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error("bad");
      return parsed.map(normalizeUser);
    } catch {
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
    const iMail = u?.["i-mail"] ?? u?.imail ?? u?.email ?? u?.["e-pasts"] ?? "";
    const email = u?.email ?? iMail ?? "";
    const full = u?.full_name ?? vard;
    return {
      id,
      role,
      full_name: String(full ?? ""),
      email: String(email ?? ""),
      created_at: u?.created_at ?? new Date().toISOString(),
      "Vārds uzvārds": String(vard ?? ""),
      "Amats": String(amats ?? ""),
      "i-mail": String(iMail ?? ""),
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
  };
})();

