const SODIEN_STORE_KEY = "pdd_sodien_aktualitates_v1";
const ENGAGE_STORE_KEY = "pdd_aktualitates_engage_v1";
const TABLE_REACTIONS = "aktualitates_reactions";
const TABLE_COMMENTS = "aktualitates_comments";

/** DB tabula (ASCII), kā Supabase kļūdziņā: „AKTUALITATES”. */
const TABLE_AKTUALITATES = "AKTUALITATES";
const AKTUALITATES_ATTACHMENTS_BUCKET = "pdd-aktualitates-files";
const ATTACHMENT_WARNING_TEXT =
  "Šobrīd aplikācija atrodas uz ārējā servera, tādēļ esi uzmanīgs ar darba informācijas publicēšanu! Spied OK, ja vēlies turpināt pielikuma pievienošanu.";

const AKTUALITATES_NAME_CANDIDATES = [
  "AKTUALITATES",
  "aktualitates",
  "Aktualitates",
  "AKTUALIT\u0100TES",
];

let resolvedAktualitatesTableName = null;
let authorNameByEmailCache = new Map();
let authorNameByAuditIdCache = new Map();

/** Autora UUID no DB rindas (kolonnu nosaukumi atšķiras pēc tabulas / PostgREST). */
function aktualitateAutorsIdFromRow(r) {
  if (!r || typeof r !== "object") return "";
  return pick(
    r.Autors ??
      r.autors ??
      r.created_by ??
      r.createdBy ??
      r.user_id ??
      r.userId ??
      r.Ievietoja ??
      r.ievietoja,
  );
}

function normalizeEmailKey(v) {
  return String(v ?? "").trim().toLowerCase();
}

function isUuidLike(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v ?? "").trim());
}

function preferredActorUserId() {
  const candidates = [
    globalThis.__PDD_ACTOR_USER_ID__,
    sessionStorage.getItem("pdd_local_user_id"),
    localStorage.getItem("pdd_local_user_id"),
    globalThis.__PDD_SESSION_USER_ID__,
  ];
  for (const one of candidates) {
    const s = String(one ?? "").trim();
    if (s && isUuidLike(s)) return s;
  }
  return "";
}

function preferredLocalUserId() {
  const candidates = [
    sessionStorage.getItem("pdd_local_user_id"),
    localStorage.getItem("pdd_local_user_id"),
    globalThis.__PDD_ACTOR_USER_ID__,
  ];
  for (const one of candidates) {
    const s = String(one ?? "").trim();
    if (s) return s;
  }
  return "";
}

function currentActorDisplayName() {
  const fromGlobal = pick(globalThis.__PDD_ACTOR_DISPLAY_NAME__);
  if (fromGlobal) return fromGlobal;
  const localId = preferredLocalUserId();
  if (!localId) return "";
  const team = Array.isArray(globalThis.KOMANDA?.loadTeamUsers?.()) ? globalThis.KOMANDA.loadTeamUsers() : [];
  const byId = team.find((u) => String(u?.id ?? "").trim() === localId);
  return pick(byId?.["Vārds uzvārds"] ?? byId?.["Vards uzvards"] ?? byId?.full_name);
}

function buildAuthorMetaMarker(name, localUserId) {
  const n = String(name ?? "").trim();
  const uid = String(localUserId ?? "").trim();
  if (!n && !uid) return "";
  return `<!--PDD_AUTHOR:${encodeURIComponent(JSON.stringify({ n, uid }))}-->`;
}

function extractAuthorMetaNameFromHtml(html) {
  const src = String(html ?? "");
  const m = /<!--PDD_AUTHOR:([^>]+)-->/i.exec(src);
  if (!m) return "";
  try {
    const obj = JSON.parse(decodeURIComponent(String(m[1] || "")));
    return pick(obj?.n);
  } catch {
    return "";
  }
}

function withAuthorMeta(html, name, localUserId) {
  const src = String(html ?? "");
  const marker = buildAuthorMetaMarker(name, localUserId);
  if (!marker) return src;
  if (/<!--PDD_AUTHOR:[^>]+-->/i.test(src)) return src.replace(/<!--PDD_AUTHOR:[^>]+-->/i, marker);
  return `${src}${marker}`;
}

async function resolveActorUserIdForAutors(sb) {
  // FK AKTUALITATES.Autors norāda uz auth.users(id), tāpēc insertam jālieto auth UID.
  if (!sb) return "";
  try {
    const { data: sess } = await sb.auth.getSession();
    const uid = String(sess?.session?.user?.id ?? "").trim();
    if (isUuidLike(uid)) return uid;
  } catch {
    /* ignore */
  }
  const sid = String(globalThis.__PDD_SESSION_USER_ID__ ?? "").trim();
  return isUuidLike(sid) ? sid : "";
}

/** Autora e-pasts no DB rindas (dažādi nosaukumi pēc migrācijām/RPC). */
function aktualitateAutorsEmailFromRow(r) {
  if (!r || typeof r !== "object") return "";
  return pick(
    r.created_by_email ??
      r.autors_email ??
      r.Autors_email ??
      r.Ievietoja_epasts ??
      r.ievietoja_epasts ??
      r["i-mail"] ??
      r["e-mail"] ??
      r.email,
  );
}

function normUserId(s) {
  return String(s ?? "").trim().toLowerCase();
}

function extractUserDisplayName(p) {
  if (!p || typeof p !== "object") return "";
  return pick(
    p["Vārds uzvārds"] ||
      p["Vārds Uzvārds"] ||
      p["Vards uzvards"] ||
      p["Vards Uzvards"] ||
      p.vards_uzvards ||
      p.full_name ||
      p["i-mail"] ||
      p.imail ||
      p.email,
  );
}

/** Vārdi: RPC (users + auth meta), tad public.users atsevišķi trūkstošajiem. */
async function fetchAuthorNameMap(sb, rawRows) {
  const rows = Array.isArray(rawRows) ? rawRows : [];
  const idTokens = [...new Set(rows.map((r) => aktualitateAutorsIdFromRow(r)).filter(Boolean))];
  const ids = idTokens.filter((v) => isUuidLike(v));
  authorNameByEmailCache = new Map();
  authorNameByAuditIdCache = new Map();
  if (!sb) return new Map();
  const m = new Map();
  const wantedEmails = new Set();
  for (const r of rows) {
    const e = normalizeEmailKey(aktualitateAutorsEmailFromRow(r));
    if (e) wantedEmails.add(e);
    const aid = normalizeEmailKey(aktualitateAutorsIdFromRow(r));
    if (aid && aid.includes("@")) wantedEmails.add(aid);
  }
  if (ids.length === 0 && wantedEmails.size === 0) return m;
  if (ids.length) {
    const { data: rpcRows, error: rpcErr } = await sb.rpc("pdd_display_name_for_user_ids", { p_ids: ids });
    if (!rpcErr && Array.isArray(rpcRows)) {
      for (const row of rpcRows) {
        const uid = pick(row.user_id);
        const label = pick(row.display_name);
        if (uid && label) m.set(normUserId(uid), label);
      }
    }
  }
  // Primāri mēģinām vienā pieprasījumā visus autorus.
  const { data: batchRows, error: batchErr } = ids.length ? await sb.from("users").select("*").in("id", ids) : { data: [], error: null };
  if (!batchErr && Array.isArray(batchRows)) {
    for (const one of batchRows) {
      const uid = pick(one?.id);
      const label = extractUserDisplayName(one);
      if (uid && label) m.set(normUserId(uid), label);
      const e1 = normalizeEmailKey(one?.email);
      const e2 = normalizeEmailKey(one?.["e-mail"]);
      const e3 = normalizeEmailKey(one?.["i-mail"]);
      if (label && e1) authorNameByEmailCache.set(e1, label);
      if (label && e2) authorNameByEmailCache.set(e2, label);
      if (label && e3) authorNameByEmailCache.set(e3, label);
    }
  }
  // Rezerves ceļš: pa vienam autoram.
  for (const id of ids) {
    const nk = normUserId(id);
    if (m.has(nk)) continue;
    const { data: one } = await sb.from("users").select("*").eq("id", id).maybeSingle();
    const label = extractUserDisplayName(one);
    if (label) m.set(nk, label);
  }
  // Pilns users saraksts (maza komanda): ja .in() kļūdaina vai RLS dīvainība.
  if (m.size < ids.length || wantedEmails.size) {
    const { data: allRows, error: allErr } = await sb.from("users").select("*").limit(2500);
    if (!allErr && Array.isArray(allRows)) {
      for (const one of allRows) {
        const uid = pick(one?.id);
        const nk = normUserId(uid);
        if (!nk || m.has(nk)) continue;
        const label = extractUserDisplayName(one);
        if (label) m.set(nk, label);
        const e1 = normalizeEmailKey(one?.email);
        const e2 = normalizeEmailKey(one?.["e-mail"]);
        const e3 = normalizeEmailKey(one?.["i-mail"]);
        if (label && e1) authorNameByEmailCache.set(e1, label);
        if (label && e2) authorNameByEmailCache.set(e2, label);
        if (label && e3) authorNameByEmailCache.set(e3, label);
      }
    }
  }
  // Pēdējais fallback: lokāli ielādētā KOMANDA (ja DB users piekļuve ierobežota).
  if (m.size < ids.length) {
    const team = Array.isArray(globalThis.KOMANDA?.loadTeamUsers?.()) ? globalThis.KOMANDA.loadTeamUsers() : [];
    if (team.length) {
      for (const id of ids) {
        const nk = normUserId(id);
        if (m.has(nk)) continue;
        const byId = team.find((u) => normUserId(u?.id) === nk);
        const label = extractUserDisplayName(byId);
        if (label) m.set(nk, label);
        const e1 = normalizeEmailKey(byId?.email);
        const e2 = normalizeEmailKey(byId?.["e-mail"]);
        const e3 = normalizeEmailKey(byId?.["i-mail"]);
        if (label && e1) authorNameByEmailCache.set(e1, label);
        if (label && e2) authorNameByEmailCache.set(e2, label);
        if (label && e3) authorNameByEmailCache.set(e3, label);
      }
    }
  }
  // Rezerves fallback: Auditācijas vēsture (actor_id -> actor_name).
  if (ids.length) {
    const auditTables = ["Auditacijas_vesture", "Auditacijas_vēsture"];
    for (const t of auditTables) {
      let rows = null;
      let err = null;
      try {
        const q = await sb.from(t).select("actor_id, actor_name").in("actor_id", ids).order("ts", { ascending: false }).limit(5000);
        rows = q.data;
        err = q.error;
      } catch (e) {
        err = e;
      }
      if (err || !Array.isArray(rows)) continue;
      for (const one of rows) {
        const aid = normUserId(one?.actor_id);
        const nm = pick(one?.actor_name);
        if (!aid || !nm) continue;
        if (!authorNameByAuditIdCache.has(aid)) authorNameByAuditIdCache.set(aid, nm);
      }
      if (authorNameByAuditIdCache.size) break;
    }
  }
  return m;
}

/**
 * Atrod tabulas nosaukumu PostgREST kešatmiņā (mēģina vairākus variantus).
 * Rezultāts tiek saglabāts `globalThis.__PDD_AKTUALITATES_TABLE__` (Realtime).
 */
async function resolveAktualitatesTableName(sb) {
  if (resolvedAktualitatesTableName) return resolvedAktualitatesTableName;
  if (!sb) throw new Error("Nav Supabase klienta");
  let lastErr = null;
  const probe = async (t, cols) => {
    const q = sb.from(t).select(cols).limit(1);
    return Promise.race([
      q,
      new Promise((resolve) =>
        setTimeout(() => resolve({ data: null, error: { message: "Tabulas pārbaude noildza" } }), 3500),
      ),
    ]);
  };
  // Vispirms tabula, kurā ir kolonna „Autors” (citādi `select *` var atrast vecāku AKTUALITĀTES bez autora).
  for (const t of AKTUALITATES_NAME_CANDIDATES) {
    const { error } = await probe(t, "id, Autors");
    if (!error) {
      resolvedAktualitatesTableName = t;
      if (typeof globalThis !== "undefined") globalThis.__PDD_AKTUALITATES_TABLE__ = t;
      return t;
    }
    lastErr = error;
  }
  for (const t of AKTUALITATES_NAME_CANDIDATES) {
    const { error } = await probe(t, "*");
    if (!error) {
      resolvedAktualitatesTableName = t;
      if (typeof globalThis !== "undefined") globalThis.__PDD_AKTUALITATES_TABLE__ = t;
      return t;
    }
    lastErr = error;
  }
  throw new Error(
    "Aktualitāšu tabula nav atrasta. Pārbaudi Table Editor: public → AKTUALITATES (Kas_sodien_vel_aktuals, Sakums, Beigas, Autors). Ja tabula jauna — uzgaidi ~1 min. Kļūda: " +
      (lastErr?.message || "nezināma")
  );
}

/** Ielādē tabulas nosaukumu pirms Realtime abonementa. */
async function primeAktualitatesTable(sb) {
  if (!sb) return;
  await resolveAktualitatesTableName(sb);
}

/** Pēdējās renderTodayInfo opcijas (add/delete izmanto attālināti). */
let sodienEngageHydrateTimer = null;
let sodienEngageCache = null;
let engageRealtimeChannel = null;

function emptyEngageBucket() {
  return { reactions: [], comments: [] };
}

function loadEngageStore() {
  try {
    const raw = localStorage.getItem(ENGAGE_STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveEngageStore(store) {
  try {
    localStorage.setItem(ENGAGE_STORE_KEY, JSON.stringify(store && typeof store === "object" ? store : {}));
  } catch {
    /* ignore */
  }
  sodienEngageCache = store && typeof store === "object" ? store : {};
}

function getEngageBucket(aktualitateId) {
  const id = String(aktualitateId ?? "").trim();
  if (!id) return emptyEngageBucket();
  if (!sodienEngageCache) sodienEngageCache = loadEngageStore();
  const bucket = sodienEngageCache[id];
  if (!bucket || typeof bucket !== "object") return emptyEngageBucket();
  return {
    reactions: Array.isArray(bucket.reactions) ? bucket.reactions : [],
    comments: Array.isArray(bucket.comments) ? bucket.comments : [],
  };
}

function setEngageBucket(aktualitateId, bucket) {
  const id = String(aktualitateId ?? "").trim();
  if (!id) return;
  const store = sodienEngageCache ? { ...sodienEngageCache } : loadEngageStore();
  store[id] = {
    reactions: Array.isArray(bucket?.reactions) ? bucket.reactions : [],
    comments: Array.isArray(bucket?.comments) ? bucket.comments : [],
  };
  saveEngageStore(store);
}

function currentEngageActor() {
  const key =
    preferredActorUserId() ||
    preferredLocalUserId() ||
    normalizeEmailKey(globalThis.__PDD_ACTOR_EMAIL__ || sessionStorage.getItem("pdd_local_email") || "") ||
    "anon-local";
  const name =
    currentActorDisplayName() ||
    pick(globalThis.__PDD_ACTOR_EMAIL__ || sessionStorage.getItem("pdd_local_email")) ||
    "Lietotājs";
  return { key: String(key).trim(), name: String(name).trim() };
}

function escEngageHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatEngageTs(iso) {
  const s = String(iso ?? "").trim();
  if (!s) return "";
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s.slice(0, 16).replace("T", " ");
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${dd}.${mm}.${yy} ${hh}:${mi}`;
  } catch {
    return s.slice(0, 16).replace("T", " ");
  }
}

async function syncEngageFromSupabase(aktualitateId) {
  const sb = globalThis.__PDD_SUPABASE__;
  const id = String(aktualitateId ?? "").trim();
  if (!sb || !id || !sodienUiOpts.useSupabase) return getEngageBucket(id);
  try {
    const [rx, cx] = await Promise.all([
      sb.from(TABLE_REACTIONS).select("*").eq("aktualitate_id", id),
      sb.from(TABLE_COMMENTS).select("*").eq("aktualitate_id", id).order("created_at", { ascending: true }),
    ]);
    if (rx.error) console.warn("[aktualitates.reactions.sync]", rx.error.message || rx.error);
    if (cx.error) console.warn("[aktualitates.comments.sync]", cx.error.message || cx.error);
    const reactions =
      !rx.error && Array.isArray(rx.data)
        ? rx.data.map((r) => ({
            actorKey: String(r.actor_key ?? "").trim(),
            actorName: String(r.actor_name ?? "").trim(),
            reaction: r.reaction === "dislike" ? "dislike" : "like",
            updatedAt: String(r.updated_at ?? r.created_at ?? ""),
          }))
        : getEngageBucket(id).reactions;
    const comments =
      !cx.error && Array.isArray(cx.data)
        ? cx.data.map((c) => ({
            id: String(c.id ?? "").trim(),
            actorKey: String(c.actor_key ?? "").trim(),
            actorName: String(c.actor_name ?? "").trim(),
            body: String(c.body ?? "").trim(),
            createdAt: String(c.created_at ?? ""),
          }))
        : getEngageBucket(id).comments;
    const next = { reactions, comments };
    setEngageBucket(id, next);
    return next;
  } catch (e) {
    console.warn("[aktualitates.engage.sync]", e?.message || e);
    return getEngageBucket(id);
  }
}

async function setAktualitateReaction(aktualitateId, reaction) {
  const id = String(aktualitateId ?? "").trim();
  if (!id) return;
  const want = reaction === "dislike" ? "dislike" : reaction === "like" ? "like" : "";
  const actor = currentEngageActor();
  const bucket = getEngageBucket(id);
  const prev = bucket.reactions.find((r) => String(r.actorKey) === actor.key);
  let reactions;
  if (!want || (prev && prev.reaction === want)) {
    reactions = bucket.reactions.filter((r) => String(r.actorKey) !== actor.key);
  } else {
    reactions = [
      ...bucket.reactions.filter((r) => String(r.actorKey) !== actor.key),
      { actorKey: actor.key, actorName: actor.name, reaction: want, updatedAt: new Date().toISOString() },
    ];
  }
  setEngageBucket(id, { ...bucket, reactions });

  const sb = globalThis.__PDD_SUPABASE__;
  if (sb && sodienUiOpts.useSupabase) {
    try {
      await sb.from(TABLE_REACTIONS).delete().eq("aktualitate_id", id).eq("actor_key", actor.key);
      if (want) {
        const { error } = await sb.from(TABLE_REACTIONS).upsert(
          {
            aktualitate_id: id,
            actor_key: actor.key,
            actor_name: actor.name,
            reaction: want,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "aktualitate_id,actor_key" },
        );
        if (error) throw error;
      }
    } catch (e) {
      console.warn("[aktualitates.reactions]", e?.message || e);
    }
  }
  await refreshEngagePanel(id);
}

async function addAktualitateComment(aktualitateId, bodyRaw) {
  const id = String(aktualitateId ?? "").trim();
  const body = String(bodyRaw ?? "").trim().slice(0, 2000);
  if (!id || !body) return;
  const actor = currentEngageActor();
  const localId =
    globalThis.crypto?.randomUUID?.() || `c-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const createdAt = new Date().toISOString();
  const comment = {
    id: localId,
    actorKey: actor.key,
    actorName: actor.name,
    body,
    createdAt,
  };
  const bucket = getEngageBucket(id);
  setEngageBucket(id, { ...bucket, comments: [...bucket.comments, comment] });

  const sb = globalThis.__PDD_SUPABASE__;
  if (sb && sodienUiOpts.useSupabase) {
    try {
      const { data, error } = await sb
        .from(TABLE_COMMENTS)
        .insert({
          id: localId,
          aktualitate_id: id,
          actor_key: actor.key,
          actor_name: actor.name,
          body,
        })
        .select("*")
        .maybeSingle();
      if (!error && data?.id) {
        const synced = getEngageBucket(id);
        setEngageBucket(id, {
          ...synced,
          comments: synced.comments.map((c) =>
            String(c.id) === localId
              ? {
                  ...c,
                  id: String(data.id),
                  createdAt: String(data.created_at || createdAt),
                }
              : c
          ),
        });
      }
    } catch (e) {
      console.warn("[aktualitates.comments]", e?.message || e);
    }
  }
  await refreshEngagePanel(id);
}

async function deleteAktualitateComment(aktualitateId, commentId) {
  const id = String(aktualitateId ?? "").trim();
  const cid = String(commentId ?? "").trim();
  if (!id || !cid) return;
  const actor = currentEngageActor();
  const bucket = getEngageBucket(id);
  const target = bucket.comments.find((c) => String(c.id) === cid);
  if (!target) return;
  const canDelete =
    isCurrentActorAdmin() || String(target.actorKey) === actor.key || !sodienUiOpts.useSupabase;
  if (!canDelete) {
    alert("Dzēst komentāru drīkst autors vai administrators.");
    return;
  }
  setEngageBucket(id, {
    ...bucket,
    comments: bucket.comments.filter((c) => String(c.id) !== cid),
  });
  const sb = globalThis.__PDD_SUPABASE__;
  if (sb && sodienUiOpts.useSupabase) {
    try {
      await sb.from(TABLE_COMMENTS).delete().eq("id", cid);
    } catch (e) {
      console.warn("[aktualitates.comments.delete]", e?.message || e);
    }
  }
  await refreshEngagePanel(id);
}

function renderEngagePanelHtml(aktualitateId) {
  const id = String(aktualitateId ?? "").trim();
  const bucket = getEngageBucket(id);
  const actor = currentEngageActor();
  const likes = bucket.reactions.filter((r) => r.reaction === "like").length;
  const dislikes = bucket.reactions.filter((r) => r.reaction === "dislike").length;
  const total = likes + dislikes;
  const likePct = total ? Math.round((likes / total) * 100) : 0;
  const dislikePct = total ? 100 - likePct : 0;
  const mine = bucket.reactions.find((r) => String(r.actorKey) === actor.key);
  const likeActive = mine?.reaction === "like";
  const dislikeActive = mine?.reaction === "dislike";
  const ratioHtml = total
    ? `<div class="sodien-akt-ratio" title="Patīk ${likes} · Nepatīk ${dislikes} · kopā ${total}">
        <div class="sodien-akt-ratio-bar">
          <div class="sodien-akt-ratio-like" style="width:${likePct}%"></div>
          <div class="sodien-akt-ratio-dislike" style="width:${dislikePct}%"></div>
        </div>
        <div class="sodien-akt-ratio-labels">
          <span>👍 ${likePct}% (${likes})</span>
          <span>👎 ${dislikePct}% (${dislikes})</span>
        </div>
      </div>`
    : `<div class="sodien-akt-ratio sodien-akt-ratio-empty">Vēl nav novērtējumu — īpatsvars parādīsies pēc pirmā balsojuma.</div>`;
  const commentsHtml = bucket.comments.length
    ? bucket.comments
        .map((c) => {
          const canDel =
            isCurrentActorAdmin() || String(c.actorKey) === actor.key || !sodienUiOpts.useSupabase;
          return `<div class="sodien-akt-comment">
            <div class="sodien-akt-comment-meta">
              <strong>${escEngageHtml(c.actorName || "Lietotājs")}</strong>
              <span>${escEngageHtml(formatEngageTs(c.createdAt))}</span>
              ${
                canDel
                  ? `<button type="button" class="btn btn-ghost btn-small sodien-akt-comment-del" data-comment-id="${escEngageHtml(c.id)}">Dzēst</button>`
                  : ""
              }
            </div>
            <div class="sodien-akt-comment-body">${escEngageHtml(c.body)}</div>
          </div>`;
        })
        .join("")
    : `<p class="sodien-akt-engage-empty">Vēl nav komentāru.</p>`;

  return `
    <div class="sodien-akt-engage-inner">
      <div class="sodien-akt-reactions">
        <button type="button" class="btn btn-ghost btn-small sodien-akt-react ${likeActive ? "is-active" : ""}" data-reaction="like" title="Patīk">
          👍 Patīk <span>${likes}</span>
        </button>
        <button type="button" class="btn btn-ghost btn-small sodien-akt-react ${dislikeActive ? "is-active" : ""}" data-reaction="dislike" title="Nepatīk">
          👎 Nepatīk <span>${dislikes}</span>
        </button>
      </div>
      ${ratioHtml}
      <div class="sodien-akt-comments">
        <div class="sodien-akt-comments-title">Komentāri (${bucket.comments.length})</div>
        <div class="sodien-akt-comments-list">${commentsHtml}</div>
        <div class="sodien-akt-comment-form">
          <textarea class="textarea sodien-akt-comment-input" rows="2" maxlength="2000" placeholder="Pievieno komentāru…"></textarea>
          <button type="button" class="btn btn-primary btn-small sodien-akt-comment-add">Publicēt komentāru</button>
        </div>
      </div>
    </div>
  `;
}

function bindEngagePanel(el, aktualitateId) {
  const id = String(aktualitateId ?? "").trim();
  if (!el || !id) return;
  el.querySelectorAll(".sodien-akt-react").forEach((btn) => {
    btn.addEventListener("click", () => {
      const reaction = btn.getAttribute("data-reaction");
      void setAktualitateReaction(id, reaction);
    });
  });
  el.querySelectorAll(".sodien-akt-comment-del").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cid = btn.getAttribute("data-comment-id");
      if (!confirm("Dzēst šo komentāru?")) return;
      void deleteAktualitateComment(id, cid);
    });
  });
  const addBtn = el.querySelector(".sodien-akt-comment-add");
  const input = el.querySelector(".sodien-akt-comment-input");
  if (addBtn && input) {
    addBtn.addEventListener("click", () => {
      const body = String(input.value || "").trim();
      if (!body) return;
      input.value = "";
      void addAktualitateComment(id, body);
    });
  }
}

function paintEngagePanel(aktualitateId) {
  const id = String(aktualitateId ?? "").trim();
  if (!id) return;
  document.querySelectorAll(".sodien-akt-engage[data-akt-id]").forEach((host) => {
    if (String(host.getAttribute("data-akt-id") || "").trim() !== id) return;
    host.innerHTML = renderEngagePanelHtml(id);
    bindEngagePanel(host, id);
    host.dataset.hydrated = "1";
  });
}

async function refreshEngagePanel(aktualitateId) {
  const id = String(aktualitateId ?? "").trim();
  if (!id) return;
  if (sodienUiOpts.useSupabase) await syncEngageFromSupabase(id);
  paintEngagePanel(id);
}

function remountEngagePanel(aktualitateId) {
  void refreshEngagePanel(aktualitateId);
}

function engagePanelIdFromChangePayload(payload) {
  const row = payload?.new && typeof payload.new === "object" ? payload.new : payload?.old;
  return String(row?.aktualitate_id ?? "").trim();
}

function ensureEngageRealtimeSubscription() {
  const sb = globalThis.__PDD_SUPABASE__;
  if (!sb || !sodienUiOpts.useSupabase || engageRealtimeChannel) return;
  try {
    engageRealtimeChannel = sb
      .channel("pdd-aktualitates-engage")
      .on("postgres_changes", { event: "*", schema: "public", table: TABLE_REACTIONS }, (payload) => {
        const id = engagePanelIdFromChangePayload(payload);
        if (id) void refreshEngagePanel(id);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: TABLE_COMMENTS }, (payload) => {
        const id = engagePanelIdFromChangePayload(payload);
        if (id) void refreshEngagePanel(id);
      })
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[aktualitates.engage.realtime]", status, err?.message ?? err);
        }
      });
  } catch (e) {
    console.warn("[aktualitates.engage.realtime]", e?.message || e);
  }
}

function hydrateEngagePanels() {
  ensureEngageRealtimeSubscription();
  const hosts = document.querySelectorAll(".sodien-akt-engage[data-akt-id]");
  hosts.forEach((host) => {
    const id = String(host.getAttribute("data-akt-id") || "").trim();
    if (!id) return;
    void refreshEngagePanel(id);
  });
}

function scheduleHydrateEngagePanels() {
  clearTimeout(sodienEngageHydrateTimer);
  sodienEngageHydrateTimer = setTimeout(() => hydrateEngagePanels(), 30);
}

let sodienUiOpts = {
  useSupabase: false,
  refreshAktualitates: null,
};
let selectedEditorImage = null;
let selectedEditorAttachment = null;
let sodienDraft = {
  usePeriod: false,
  start: "",
  end: "",
};

function ensureSodienDraftDefaults() {
  const today = ymd(new Date());
  if (!sodienDraft.start) sodienDraft.start = today;
  if (!sodienDraft.end) sodienDraft.end = sodienDraft.start || today;
}

function onToggleUsePeriod(ev) {
  sodienDraft.usePeriod = Boolean(ev?.target?.checked);
}

function onStartDateChange(ev) {
  const v = pick(ev?.target?.value || "");
  if (!v) return;
  sodienDraft.start = v;
  if (!sodienDraft.end) sodienDraft.end = v;
}

function onEndDateChange(ev) {
  const v = pick(ev?.target?.value || "");
  if (!v) return;
  sodienDraft.end = v;
}

function ymd(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isNaN(dt.getTime()) ? "" : dt.toISOString().slice(0, 10);
}

function toDateInput(v) {
  const s = pick(v);
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return ymd(s);
}

function pick(v) {
  return String(v ?? "").trim();
}

function isSaliedesanaAktualitateHtml(html) {
  return /SALIEDESANA:/i.test(String(html || ""));
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

function normalizeTimeHHMM(value) {
  const s = pick(value);
  if (!s) return "";
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s);
  if (!m) return s;
  return `${String(m[1]).padStart(2, "0")}:${String(m[2]).padStart(2, "0")}`;
}

function timeInterval(a) {
  const from = normalizeTimeHHMM(a?.laiks_no || a?.Laiks_no || a?.laiksNo || "");
  const to = normalizeTimeHHMM(a?.laiks_lidz || a?.Laiks_lidz || a?.laiksLidz || "");
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

/**
 * Atver Prombūtnes → „Prombūtnes vēsture” un izceļ konkrēto ierakstu.
 * Izmanto to pašu `?citsRow=` mehānismu kā `PrombutnesSection` (index.html) ielādēšanās brīdī,
 * tad simulē klikšķi uz navigācijas pogas (lietotājs parasti ir Sākumā, kur redzams Šodien.js bloks).
 * @param {string} absenceId — `prombutnes_dati.id` (vai lokālais UUID)
 */
function navigateToPrombutnesVestureDetail(absenceId) {
  const id = String(absenceId ?? "").trim();
  if (!id) return;
  try {
    const u = new URL(window.location.href);
    u.searchParams.set("citsRow", id);
    window.history.replaceState({}, "", u.pathname + u.search + u.hash);
  } catch (e) {
    console.warn("[Sodien] navigateToPrombutnesVestureDetail URL", e);
  }
  const clickPrombutnesVestureNav = () => {
    const navRoot = document.querySelector("aside.app-nav") || document.querySelector(".app-nav");
    if (!navRoot) return false;
    const buttons = navRoot.querySelectorAll("button.app-nav-sublink");
    for (const b of buttons) {
      const t = String(b.textContent || "")
        .replace(/\s+/g, " ")
        .trim();
      if (/^Prombūtnes vēsture/i.test(t)) {
        b.click();
        return true;
      }
    }
    return false;
  };
  if (!clickPrombutnesVestureNav()) {
    queueMicrotask(() => {
      if (!clickPrombutnesVestureNav()) requestAnimationFrame(() => void clickPrombutnesVestureNav());
    });
  }
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

function stableSyntheticRowId(html, start, end, autorsOrTag) {
  const s = `${start}|${end}|${autorsOrTag}|${String(html).slice(0, 160)}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return `syn-${Math.abs(h)}`;
}

function authorLabelFromDbRow(r, nameMap) {
  const aid = aktualitateAutorsIdFromRow(r);
  const authorEmail = aktualitateAutorsEmailFromRow(r);
  const emailKey = normalizeEmailKey(authorEmail);
  const htmlAuthorName = extractAuthorMetaNameFromHtml(r?.Kas_sodien_vel_aktuals ?? r?.kas_sodien_vel_aktuals);
  if (htmlAuthorName) return htmlAuthorName;
  // Tikai skaidri autora lauki — neņemam sakritības no rindas saknes `email`/`full_name`,
  // jo tie var būt no citas kolonnas / vecās denormalizācijas un rādīt nepareizu personu.
  const usersText = typeof r?.users === "string" ? pick(r.users) : "";
  if (usersText) return usersText;
  const directLabel = pick(
    r?.authorLabel ??
      r?.author_label ??
      r?.Autors_vards ??
      r?.autors_vards ??
      r?.created_by_name ??
      r?.created_by_email ??
      r?.Autors_display ??
      r?.autors_display
  );
  if (directLabel) return directLabel;
  const aidN = normUserId(aid);
  if (nameMap && aidN && nameMap.has(aidN)) return nameMap.get(aidN);
  if (aidN && authorNameByAuditIdCache.has(aidN)) return authorNameByAuditIdCache.get(aidN);
  if (emailKey && authorNameByEmailCache.has(emailKey)) return authorNameByEmailCache.get(emailKey);
  if (aid && !isUuidLike(aid)) {
    const aidEmail = normalizeEmailKey(aid);
    if (aidEmail.includes("@") && authorNameByEmailCache.has(aidEmail)) return authorNameByEmailCache.get(aidEmail);
    // Veciem ierakstiem autors var būt jau saglabāts kā teksts ("Vārds uzvārds").
    if (!aid.includes("@") && /[A-Za-zĀ-ž]/.test(aid) && aid.length <= 120) return aid;
  }
  const sid = normUserId(preferredActorUserId());
  const sidAuth = normUserId(globalThis.__PDD_SESSION_USER_ID__);
  const selfName = pick(currentActorDisplayName());
  const selfEmail = pick(globalThis.__PDD_ACTOR_EMAIL__);
  // Tikai savam ierakstam drīkst rādīt sesijas vārdu/e-pastu kā rezervi — nevis visiem.
  if (aidN && ((sid && aidN === sid) || (sidAuth && aidN === sidAuth))) {
    if (selfName) return selfName;
    if (selfEmail) return selfEmail;
  }
  const emb = r?.users;
  if (emb && typeof emb === "object" && !Array.isArray(emb)) {
    const n = extractUserDisplayName(emb);
    if (n) return n;
  }
  if (Array.isArray(emb) && emb[0]) {
    const n = extractUserDisplayName(emb[0]);
    if (n) return n;
  }
  if (aid || emailKey) {
    const team = Array.isArray(globalThis.KOMANDA?.loadTeamUsers?.()) ? globalThis.KOMANDA.loadTeamUsers() : [];
    const byId = team.find((u) => normUserId(u?.id) === aidN);
    const teamName = pick(byId?.["Vārds uzvārds"] ?? byId?.full_name);
    if (teamName) return teamName;
    if (emailKey) {
      const byEmail = team.find((u) => {
        const a = normalizeEmailKey(u?.email);
        const b = normalizeEmailKey(u?.["e-mail"]);
        const c = normalizeEmailKey(u?.["i-mail"]);
        return emailKey && (a === emailKey || b === emailKey || c === emailKey);
      });
      const teamNameByEmail = pick(byEmail?.["Vārds uzvārds"] ?? byEmail?.full_name);
      if (teamNameByEmail) return teamNameByEmail;
    }
  }
  return "Nezināms autors";
}

function rowFromDb(r, nameMap) {
  if (!r || typeof r !== "object") return null;
  const html = pick(r.Kas_sodien_vel_aktuals ?? r.kas_sodien_vel_aktuals);
  if (isSaliedesanaAktualitateHtml(html)) return null;
  const start = toDateInput(r.Sakums ?? r.sakums);
  const end = toDateInput(r.Beigas ?? r.beigas);
  const created_at = pick(r.created_at);
  const autors_id = aktualitateAutorsIdFromRow(r);
  if (!html || !start || !end) return null;
  const dbRowId = pick(r.id);
  const use_period = start !== end;
  const authorLabel = authorLabelFromDbRow(r, nameMap);
  const id = dbRowId || stableSyntheticRowId(html, start, end, autors_id || authorLabel);
  return {
    id,
    dbRowId: dbRowId || null,
    canMutateRemote: Boolean(dbRowId),
    html,
    start,
    end,
    use_period,
    created_at,
    autors_id,
    authorLabel,
  };
}

function isCurrentActorAdmin() {
  return pick(globalThis.__PDD_ACTOR_ROLE__).toLowerCase() === "admin";
}

function canCurrentActorManageAktualitate(item) {
  if (!item || typeof item !== "object") return false;
  if (isCurrentActorAdmin()) return true;
  if (!sodienUiOpts.useSupabase) return true;
  const myId = normUserId(preferredActorUserId());
  const myAuthId = normUserId(globalThis.__PDD_SESSION_USER_ID__);
  const authorId = normUserId(item?.autors_id);
  if (!authorId) return false;
  return Boolean((myId && myId === authorId) || (myAuthId && myAuthId === authorId));
}

function applyLegacyMatchFilter(q, item) {
  const html = pick(item?.html);
  const start = pick(item?.start);
  const end = pick(item?.end);
  const autors = pick(item?.autors_id);
  let qq = q.eq("Kas_sodien_vel_aktuals", html).eq("Sakums", start).eq("Beigas", end);
  if (autors) qq = qq.eq("Autors", autors);
  return qq;
}

function extractStorageObjectPathsFromHtml(htmlText) {
  const html = String(htmlText || "");
  if (!html) return [];
  const paths = [];
  const re = /https?:\/\/[^"'\s]+\/storage\/v1\/object\/public\/pdd-aktualitates-files\/([^"'\s<]+)/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const rawPath = String(m[1] || "");
    if (!rawPath) continue;
    try {
      paths.push(decodeURIComponent(rawPath));
    } catch {
      paths.push(rawPath);
    }
  }
  return [...new Set(paths)];
}

async function removeStorageAttachmentsForItem(sb, item) {
  if (!sb || !item) return;
  const paths = extractStorageObjectPathsFromHtml(item?.html);
  if (!paths.length) return;
  const { error } = await sb.storage.from(AKTUALITATES_ATTACHMENTS_BUCKET).remove(paths);
  if (error) {
    console.warn("[aktualitates.storage.remove]", error.message || error, paths);
  }
}

function visibleAktualitatesActive() {
  const today = ymd(new Date());
  const cleaned = cleanExpired(loadAktualitates()).filter((x) => !isSaliedesanaAktualitateHtml(x?.html));
  saveAktualitates(cleaned);
  return cleaned.filter((x) => {
    const e = pick(x.end || "");
    return !e || e >= today;
  });
}

/**
 * Aktuālās aktualitātes pēc perioda (šodien iekļauts [Sakums, Beigas]).
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 */
async function fetchActiveAktualitatesViaRest() {
  const url =
    String(globalThis.__PDD_SUPABASE__?.supabaseUrl || "").trim() ||
    "https://fdnkvecgqetmwilwolgt.supabase.co";
  const key =
    String(globalThis.__PDD_SUPABASE__?.supabaseKey || "").trim() ||
    "sb_publishable_wPrwQc6F0QVlnAubnhamJw_RuxtvtGo";
  const base = url.replace(/\/+$/, "");
  const today = ymd(new Date());
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = setTimeout(() => {
    try {
      ctrl?.abort?.();
    } catch {
      /* ignore */
    }
  }, 20000);
  try {
    const params = new URLSearchParams();
    params.set("select", "*");
    params.set("Sakums", `lte.${today}`);
    params.set("Beigas", `gte.${today}`);
    params.set("order", "Sakums.desc");
    const resp = await fetch(`${base}/rest/v1/AKTUALITATES?${params}`, {
      method: "GET",
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: ctrl?.signal,
    });
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(txt || `HTTP ${resp.status}`);
    }
    const data = await resp.json();
    const list = (Array.isArray(data) ? data : []).map((row) => rowFromDb(row, new Map())).filter(Boolean);
    try {
      // Lielus base64 attēlus localStorage bieži nevar ietilpināt — kešojam tikai tad, ja ietilpst.
      if (list.length) saveAktualitates(mergeAktualitatesPreferRemote(loadAktualitates(), list));
    } catch {
      /* ignore */
    }
    return list;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchActiveAktualitatesFromSupabase(sb) {
  // REST vienreiz — nevilcinām ar supabase-js tabulu meklēšanu.
  try {
    const viaRest = await fetchActiveAktualitatesViaRest();
    if (Array.isArray(viaRest)) return viaRest;
  } catch (e) {
    console.warn("[aktualitates.rest]", e?.message || e);
  }
  if (!sb) return [];
  try {
    const t = await resolveAktualitatesTableName(sb);
    const today = ymd(new Date());
    const { data, error } = await Promise.race([
      sb
        .from(t)
        .select("*")
        .lte("Sakums", today)
        .gte("Beigas", today)
        .order("Sakums", { ascending: false })
        .order("Beigas", { ascending: false }),
      new Promise((resolve) =>
        setTimeout(() => resolve({ data: null, error: { message: "Aktualitātes noildza" } }), 12000),
      ),
    ]);
    if (!error && Array.isArray(data)) {
      let nameMap = new Map();
      try {
        nameMap = await Promise.race([
          fetchAuthorNameMap(sb, data ?? []),
          new Promise((resolve) => setTimeout(() => resolve(new Map()), 2000)),
        ]);
      } catch {
        nameMap = new Map();
      }
      const list = data.map((row) => rowFromDb(row, nameMap)).filter(Boolean);
      try {
        if (list.length) saveAktualitates(mergeAktualitatesPreferRemote(loadAktualitates(), list));
      } catch {
        /* ignore */
      }
      return list;
    }
    if (error) console.warn("[aktualitates.sb]", error.message || error);
  } catch (e) {
    console.warn("[aktualitates.sb]", e?.message || e);
  }
  return [];
}

function mergeAktualitatesPreferRemote(localRows, remoteRows) {
  const map = new Map();
  for (const r of [...(localRows || []), ...(remoteRows || [])]) {
    if (!r || !r.id) continue;
    map.set(String(r.id), r);
  }
  for (const r of remoteRows || []) {
    if (r?.id) map.set(String(r.id), r);
  }
  return [...map.values()];
}

/**
 * Visa vēsture (ieskaitot beigušās).
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 */
async function fetchAllAktualitatesFromSupabase(sb) {
  const t = await resolveAktualitatesTableName(sb);
  const { data, error } = await sb
    .from(t)
    .select("*")
    .order("Sakums", { ascending: false })
    .order("Beigas", { ascending: false })
    .limit(500);
  if (error) throw error;
  const nameMap = await fetchAuthorNameMap(sb, data ?? []);
  return (data ?? []).map((row) => rowFromDb(row, nameMap)).filter(Boolean);
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
  const ed = currentEditor();
  const htmlValue = String(htmlText || "");
  if (!ed || !htmlValue) return;
  if (!sel || sel.rangeCount === 0) {
    // Ja nav aktīvas atlases, pievienojam redaktora beigās.
    ed.insertAdjacentHTML("beforeend", htmlValue);
    return;
  }
  const r = sel.getRangeAt(0);
  const inEditor = ed.contains(r.commonAncestorContainer);
  if (!inEditor) {
    // Ja atlase ir ārpus redaktora, pievienojam redaktora beigās.
    ed.insertAdjacentHTML("beforeend", htmlValue);
    return;
  }
  const frag = r.createContextualFragment(htmlValue);
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

const AKT_IMG_SPACE_WARN =
  "Bildes aktualitātēs vairs nav atļautas — datubāzes vietas taupīšanai.\nLūdzu, izmanto tekstu vai failu-pielikumu (ne screenshot).";

/** Bildes aktualitātēs ir aizliegtas (FREE DB limits). */
const AKTUALITATES_IMAGES_DISABLED = true;

function confirmAktualitateImageInsert() {
  if (typeof alert === "function") alert(AKT_IMG_SPACE_WARN);
  return false;
}

function stripAktualitateImagesFromHtml(html) {
  let s = String(html || "");
  if (!s) return s;
  s = s.replace(/<img\b[^>]*>/gi, "");
  s = s.replace(/<figure\b[^>]*>[\s\S]*?<\/figure>/gi, "");
  return s;
}

function onPickImage(ev) {
  if (ev?.target) ev.target.value = "";
  confirmAktualitateImageInsert();
}

const AKT_IMG_MAX_EDGE = 960;
const AKT_IMG_TARGET_CHARS = 90000; // ~70 KB data-URL
const AKT_IMG_SHRINK_IF_OVER = 18000; // sākam mazāku, ja lielāks par ~14 KB

/** Automātiski samazina attēlu (izmērs + JPEG kvalitāte), lai DB/apjoms būtu mazāks. */
function compressAktualitateImageDataUrl(dataUrl, mimeHint, options = {}) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const maxEdge = Number(options.maxEdge) > 0 ? Number(options.maxEdge) : AKT_IMG_MAX_EDGE;
        const targetChars = Number(options.targetChars) > 0 ? Number(options.targetChars) : AKT_IMG_TARGET_CHARS;
        let w = img.naturalWidth || img.width || 0;
        let h = img.naturalHeight || img.height || 0;
        if (!w || !h) {
          resolve(dataUrl);
          return;
        }
        let scale = Math.min(1, maxEdge / w, maxEdge / h);
        let out = String(dataUrl || "");
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        for (let attempt = 0; attempt < 4; attempt += 1) {
          const tw = Math.max(1, Math.round(w * scale));
          const th = Math.max(1, Math.round(h * scale));
          canvas.width = tw;
          canvas.height = th;
          ctx.clearRect(0, 0, tw, th);
          ctx.drawImage(img, 0, 0, tw, th);
          let quality = 0.68 - attempt * 0.08;
          out = canvas.toDataURL("image/jpeg", Math.max(0.4, quality));
          if (out.length <= targetChars) break;
          scale *= 0.75;
        }
        resolve(out.length > 0 && out.length < String(dataUrl).length ? out : dataUrl);
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/** Visus lielos data:image HTML saturā saspiež automātiski (arī vecie ieraksti pie saglabāšanas). */
async function shrinkHeavyImagesInHtml(html) {
  const s = String(html || "");
  if (!/data:image\//i.test(s)) return s;
  const re = /src=(["'])(data:image\/[^"']+)\1/gi;
  const seen = new Map();
  let m;
  while ((m = re.exec(s)) !== null) {
    const src = m[2];
    if (!src || src.length < AKT_IMG_SHRINK_IF_OVER) continue;
    if (seen.has(src)) continue;
    seen.set(src, null);
  }
  if (!seen.size) return s;
  for (const src of [...seen.keys()]) {
    try {
      const compressed = await compressAktualitateImageDataUrl(src);
      seen.set(src, compressed && compressed.length < src.length ? compressed : src);
    } catch {
      seen.set(src, src);
    }
  }
  let out = s;
  for (const [src, next] of seen.entries()) {
    if (!next || next === src) continue;
    out = out.split(src).join(next);
  }
  return out;
}

function onEditorPasteImages(ev) {
  const cd = ev?.clipboardData;
  if (!cd?.items) return;
  let hasImage = false;
  for (const it of cd.items) {
    if (it.kind === "file" && String(it.type || "").startsWith("image/")) {
      hasImage = true;
      break;
    }
  }
  if (!hasImage) return;
  ev.preventDefault();
  confirmAktualitateImageInsert();
}

function markSelectedEditorImage(img) {
  const ed = currentEditor();
  if (selectedEditorImage && selectedEditorImage !== img) {
    selectedEditorImage.classList.remove("sodien-selected-img");
  }
  selectedEditorImage = img && ed?.contains(img) ? img : null;
  if (selectedEditorImage) selectedEditorImage.classList.add("sodien-selected-img");
}

function onEditorClickForImageSelection(ev) {
  const ed = currentEditor();
  if (!ed) return;
  if (selectedEditorAttachment) {
    selectedEditorAttachment.classList.remove("sodien-selected-attachment");
    selectedEditorAttachment = null;
  }
  const link = ev?.target?.closest?.("a");
  if (link && ed.contains(link)) {
    selectedEditorAttachment = link;
    selectedEditorAttachment.classList.add("sodien-selected-attachment");
    markSelectedEditorImage(null);
    return;
  }
  const img = ev?.target?.closest?.("img");
  if (img && ed.contains(img)) {
    markSelectedEditorImage(img);
    return;
  }
  markSelectedEditorImage(null);
}

function withSelectedImage(fn) {
  const ed = currentEditor();
  if (!ed || !selectedEditorImage || !ed.contains(selectedEditorImage)) {
    alert("Vispirms uzklikšķini uz bildes teksta zonā.");
    return;
  }
  fn(selectedEditorImage, ed);
}

function resizeSelectedImage(multiplier) {
  withSelectedImage((img, ed) => {
    const edWidth = Math.max(120, Math.floor(ed.clientWidth - 16));
    const current = Math.max(40, Math.floor(img.getBoundingClientRect().width || 0));
    const next = Math.min(edWidth, Math.max(60, Math.round(current * multiplier)));
    img.style.width = `${next}px`;
    img.style.maxWidth = "100%";
    img.style.height = "auto";
  });
}

function alignSelectedImage(mode) {
  withSelectedImage((img) => {
    if (mode === "left") img.style.margin = "0.35rem auto 0.35rem 0";
    else if (mode === "right") img.style.margin = "0.35rem 0 0.35rem auto";
    else img.style.margin = "0.35rem auto";
    img.style.display = "block";
  });
}

function moveSelectedImage(step) {
  withSelectedImage((img, ed) => {
    const children = Array.from(ed.children);
    const idx = children.indexOf(img);
    if (idx < 0) return;
    const target = idx + step;
    if (target < 0 || target >= children.length) return;
    if (step < 0) ed.insertBefore(img, children[target]);
    else ed.insertBefore(img, children[target].nextSibling);
  });
}

function selectedAttachmentStoragePath() {
  const href = String(selectedEditorAttachment?.getAttribute?.("href") || "").trim();
  if (!href) return "";
  const m = /\/storage\/v1\/object\/public\/pdd-aktualitates-files\/(.+)$/i.exec(href);
  if (!m) return "";
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

async function deleteSelectedAttachment() {
  const ed = currentEditor();
  if (!ed || !selectedEditorAttachment || !ed.contains(selectedEditorAttachment)) {
    alert("Vispirms uzklikšķini uz pielikuma saites teksta zonā.");
    return;
  }
  const link = selectedEditorAttachment;
  const path = selectedAttachmentStoragePath();
  const sb = globalThis.__PDD_SUPABASE__;
  const useRemote = Boolean(sodienUiOpts.useSupabase && sb);
  if (useRemote && path) {
    const { error } = await sb.storage.from(AKTUALITATES_ATTACHMENTS_BUCKET).remove([path]);
    if (error) console.warn("[aktualitates.storage.remove.selected]", error.message || error, path);
  }
  const p = link.closest("p");
  if (p && ed.contains(p)) p.remove();
  else link.remove();
  selectedEditorAttachment.classList.remove("sodien-selected-attachment");
  selectedEditorAttachment = null;
}

function deleteSelectedImage() {
  withSelectedImage((img) => {
    img.remove();
    markSelectedEditorImage(null);
  });
}

function onBeforePickAttachment(ev) {
  const ok = confirm(ATTACHMENT_WARNING_TEXT);
  if (!ok) {
    ev?.preventDefault?.();
    ev?.stopPropagation?.();
    if (ev?.target) ev.target.value = "";
    return;
  }
  if (ev?.target?.dataset) ev.target.dataset.attachmentAllowed = "1";
}

function onPickAttachment(ev) {
  const allowedByClick = String(ev?.target?.dataset?.attachmentAllowed || "") === "1";
  if (!allowedByClick) {
    const ok = confirm(ATTACHMENT_WARNING_TEXT);
    if (!ok) {
      if (ev?.target) ev.target.value = "";
      return;
    }
  }
  if (ev?.target?.dataset) ev.target.dataset.attachmentAllowed = "";
  const f = ev?.target?.files?.[0];
  if (!f) return;
  if (String(f.type || "").startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(String(f.name || ""))) {
    if (ev?.target) ev.target.value = "";
    confirmAktualitateImageInsert();
    return;
  }
  const sb = globalThis.__PDD_SUPABASE__;
  const useRemote = Boolean(sodienUiOpts.useSupabase && sb);

  const fallbackToInline = () => {
    const fr = new FileReader();
    fr.onload = () => {
      const src = String(fr.result || "");
      if (!src) return;
      insertAtCursor(
      `<p data-akt-attachment-row="1">Pielikums: <a data-akt-attachment="1" href="${escHtml(src)}" target="_blank" rel="noopener noreferrer">${escHtml(f.name)}</a> ` +
          `(<a href="${escHtml(src)}" download="${escHtml(f.name)}">Lejupielādēt</a>)</p>`,
      );
    };
    fr.readAsDataURL(f);
  };

  const uploadToStorage = async () => {
    const { data: sess } = await sb.auth.getSession();
    const uid = pick(sess?.session?.user?.id || "");
    if (!uid) throw new Error("Nav aktīvas sesijas faila augšupielādei.");
    const safeFileName = String(f.name || "pielikums")
      .replace(/[^\w.\-()]/g, "_")
      .replace(/_+/g, "_")
      .slice(-120);
    const suffix = typeof crypto?.randomUUID === "function" ? crypto.randomUUID() : String(Date.now());
    const objectPath = `${uid}/${Date.now()}-${suffix}-${safeFileName}`;
    const { error: upErr } = await sb.storage
      .from(AKTUALITATES_ATTACHMENTS_BUCKET)
      .upload(objectPath, f, {
        cacheControl: "3600",
        upsert: false,
        contentType: f.type || "application/octet-stream",
      });
    if (upErr) throw upErr;
    const pub = sb.storage.from(AKTUALITATES_ATTACHMENTS_BUCKET).getPublicUrl(objectPath);
    const url = pick(pub?.data?.publicUrl || "");
    if (!url) throw new Error("Neizdevās iegūt publisko URL pielikumam.");
    insertAtCursor(
      `<p data-akt-attachment-row="1">Pielikums: <a data-akt-attachment="1" href="${escHtml(url)}" target="_blank" rel="noopener noreferrer">${escHtml(f.name)}</a> ` +
        `(<a href="${escHtml(url)}" download="${escHtml(f.name)}">Lejupielādēt</a>)</p>`,
    );
  };

  if (useRemote) {
    uploadToStorage().catch((e) => {
      alert(
        "Neizdevās augšupielādēt pielikumu uz Supabase Storage: " +
          (e?.message || String(e)) +
          ". Pielikums tiks ievietots lokāli šajā ierakstā."
      );
      fallbackToInline();
    });
  } else {
    fallbackToInline();
  }
  ev.target.value = "";
}

async function addAktualitate() {
  const ed = currentEditor();
  if (!ed) return;
  let content = String(ed.innerHTML || "").trim();
  if (!content || content === "<br>") {
    alert("Ievadi aktualitātes tekstu.");
    return;
  }
  // Bildes nav atļautas — noņem pirms saglabāšanas (arī no paste/veciem draftiem).
  content = stripAktualitateImagesFromHtml(content);
  ed.innerHTML = content;
  if (!String(content || "").replace(/<[^>]+>/g, "").trim()) {
    alert("Ievadi aktualitātes tekstu (bildes nav atļautas).");
    return;
  }
  const today = ymd(new Date());
  ensureSodienDraftDefaults();
  const usePeriodChecked = Boolean(document.getElementById("sodien-use-period")?.checked);
  const startPicked = toDateInput(document.getElementById("sodien-start")?.value || sodienDraft.start || today);
  const endPicked = toDateInput(document.getElementById("sodien-end")?.value || sodienDraft.end || startPicked || today);
  const start = startPicked || today;
  const end = endPicked || start || today;
  const usePeriod = Boolean(sodienDraft.usePeriod || usePeriodChecked || start !== end);
  if (start && end && end < start) {
    alert("Perioda beigu datums nevar būt mazāks par sākuma datumu.");
    return;
  }
  const editId = pick(currentEditIdField()?.value || "");
  const sb = globalThis.__PDD_SUPABASE__;
  const useRemote = Boolean(sodienUiOpts.useSupabase && sb);

  if (useRemote) {
    const actorNameForInsert = currentActorDisplayName();
    const actorLocalIdForInsert = preferredLocalUserId();
    const contentWithMeta = withAuthorMeta(content, actorNameForInsert, actorLocalIdForInsert);
    const payload = {
      Kas_sodien_vel_aktuals: contentWithMeta,
      Sakums: start || today,
      Beigas: end || start || today,
    };
    const actorEmail = pick(globalThis.__PDD_ACTOR_EMAIL__ || sessionStorage.getItem("pdd_local_email") || "");
    try {
      const t = await resolveAktualitatesTableName(sb);
      if (editId) {
        const curEdit = (sodienUiOpts.__lastAktList || []).find((x) => String(x?.id) === String(editId));
        if (curEdit && !canCurrentActorManageAktualitate(curEdit)) {
          alert("Labot drīkst tikai autors vai administrators.");
          return;
        }
        if (String(editId).startsWith("syn-")) {
          if (!curEdit) {
            alert("Neizdevās atrast labojamo ierakstu.");
            return;
          }
          const q = applyLegacyMatchFilter(sb.from(t).update(payload), curEdit).select("id, Sakums, Beigas");
          const { data, error } = await q;
          if (error) throw error;
          if (!Array.isArray(data) || data.length === 0) {
            throw new Error("Aktualitātes ieraksts netika atjaunots.");
          }
        } else {
          const { data, error } = await sb.from(t).update(payload).eq("id", editId).select("id, Sakums, Beigas").maybeSingle();
          if (error) throw error;
          if (!data) {
            if (!actorEmail) throw new Error("Aktualitātes ieraksts netika atjaunots.");
            const { data: rpcData, error: rpcError } = await sb.rpc("pdd_update_aktualitate_by_email", {
              p_actor_email: actorEmail,
              p_id: editId,
              p_html: payload.Kas_sodien_vel_aktuals,
              p_sakums: payload.Sakums,
              p_beigas: payload.Beigas,
            });
            if (rpcError) throw rpcError;
            if (!rpcData) throw new Error("Aktualitātes ieraksts netika atjaunots.");
          }
        }
      } else {
        const uid = await resolveActorUserIdForAutors(sb);
        if (!uid) {
          alert("Neizdevās noteikt autorizētu sesijas lietotāju.");
          return;
        }
        if (!pick(globalThis.__PDD_ACTOR_USER_ID__)) globalThis.__PDD_ACTOR_USER_ID__ = uid;
        const { error } = await sb.from(t).insert({
          ...payload,
          Autors: uid,
          users: actorNameForInsert || null,
        });
        if (error) throw error;
      }
    } catch (e) {
      alert("Neizdevās saglabāt Supabase: " + (e?.message || String(e)));
      return;
    }
    resetAktualitateForm();
    if (typeof sodienUiOpts.refreshAktualitates === "function") await sodienUiOpts.refreshAktualitates();
    return;
  }

  const list = cleanExpired(loadAktualitates());
  const authorLabel = pick(globalThis.__PDD_ACTOR_DISPLAY_NAME__) || "Lokāli";
  const row = {
    id: editId || crypto.randomUUID(),
    html: content,
    start: start || today,
    end: end || start || today,
    use_period: usePeriod,
    created_at: new Date().toISOString(),
    authorLabel,
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

let sodienDeleteModalEl = null;

function closeSodienDeleteModal() {
  if (sodienDeleteModalEl && sodienDeleteModalEl.parentNode) {
    sodienDeleteModalEl.parentNode.removeChild(sodienDeleteModalEl);
  }
  sodienDeleteModalEl = null;
}

function openSodienDeleteModal(id) {
  closeSodienDeleteModal();
  const backdrop = document.createElement("div");
  backdrop.setAttribute("role", "presentation");
  backdrop.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:70;padding:1rem;";
  const panel = document.createElement("div");
  panel.className = "list-panel";
  panel.style.cssText = "max-width:360px;width:100%;box-sizing:border-box;";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", "Dzēst aktualitāti");
  panel.addEventListener("click", (ev) => ev.stopPropagation());
  const p = document.createElement("p");
  p.textContent = "Dzēst šo aktualitāti?";
  p.style.margin = "0 0 0.75rem";
  const row = document.createElement("div");
  row.className = "row";
  row.style.cssText = "gap:0.35rem;flex-wrap:wrap;";
  const btnDel = document.createElement("button");
  btnDel.type = "button";
  btnDel.className = "btn btn-danger btn-small";
  btnDel.textContent = "Jā, dzēst";
  const btnCancel = document.createElement("button");
  btnCancel.type = "button";
  btnCancel.className = "btn btn-ghost btn-small";
  btnCancel.textContent = "Atcelt";
  btnCancel.onclick = () => closeSodienDeleteModal();
  backdrop.onclick = () => closeSodienDeleteModal();
  btnDel.onclick = () => {
    closeSodienDeleteModal();
    void runDeleteAktualitate(id);
  };
  row.appendChild(btnDel);
  row.appendChild(btnCancel);
  panel.appendChild(p);
  panel.appendChild(row);
  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);
  sodienDeleteModalEl = backdrop;
}

function deleteAktualitate(id) {
  openSodienDeleteModal(id);
}

async function runDeleteAktualitate(id) {
  const sb = globalThis.__PDD_SUPABASE__;
  const useRemote = Boolean(sodienUiOpts.useSupabase && sb);
  if (useRemote) {
    const cur = (sodienUiOpts.__lastAktList || []).find((x) => String(x?.id) === String(id));
    if (cur && !canCurrentActorManageAktualitate(cur)) {
      alert("Dzēst drīkst tikai autors vai administrators.");
      return;
    }
    try {
      const t = await resolveAktualitatesTableName(sb);
      if (String(id).startsWith("syn-")) {
        if (!cur) {
          alert("Neizdevās atrast dzēšamo ierakstu.");
          return;
        }
        const q = applyLegacyMatchFilter(sb.from(t).delete(), cur);
        const { error } = await q;
        if (error) throw error;
      } else {
        const { error } = await sb.from(t).delete().eq("id", id);
        if (error) throw error;
      }
      await removeStorageAttachmentsForItem(sb, cur);
    } catch (e) {
      alert("Neizdevās dzēst: " + (e?.message || String(e)));
      return;
    }
    if (typeof sodienUiOpts.refreshAktualitates === "function") await sodienUiOpts.refreshAktualitates();
    return;
  }
  const list = cleanExpired(loadAktualitates()).filter((x) => String(x.id) !== String(id));
  saveAktualitates(list);
  window.location.reload();
}

function setFormMode(isEdit) {
  const btn = document.getElementById("sodien-submit-btn");
  if (btn) btn.textContent = isEdit ? "Saglabāt" : "Pievienot aktualitāti";
  const title = document.getElementById("sodien-editor-title");
  if (title) title.textContent = isEdit ? "Labot aktualitāti" : "Pievienot aktualitāti";
  const details = document.getElementById("sodien-editor-details");
  if (details && isEdit) details.open = true;
}

function resetAktualitateForm() {
  const ed = currentEditor();
  if (ed) ed.innerHTML = "";
  markSelectedEditorImage(null);
  if (selectedEditorAttachment) {
    selectedEditorAttachment.classList.remove("sodien-selected-attachment");
    selectedEditorAttachment = null;
  }
  const editField = currentEditIdField();
  if (editField) editField.value = "";
  const today = ymd(new Date());
  sodienDraft = { usePeriod: false, start: today, end: today };
  const cb = document.getElementById("sodien-use-period");
  const start = document.getElementById("sodien-start");
  const end = document.getElementById("sodien-end");
  if (cb) cb.checked = false;
  if (start) start.value = today;
  if (end) end.value = today;
  const details = document.getElementById("sodien-editor-details");
  if (details) details.open = false;
  setFormMode(false);
}

function editAktualitate(id) {
  const useRemote = Boolean(sodienUiOpts.useSupabase && globalThis.__PDD_SUPABASE__);
  const list = useRemote ? sodienUiOpts.__lastAktList || [] : cleanExpired(loadAktualitates());
  const item = list.find((x) => String(x.id) === String(id));
  if (!item) return;
  if (useRemote && !canCurrentActorManageAktualitate(item)) {
    alert("Labot drīkst tikai autors vai administrators.");
    return;
  }
  const editorPanel = document.getElementById("sodien-editor-details");
  if (editorPanel) editorPanel.open = true;
  if (editorPanel?.scrollIntoView) editorPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  const ed = currentEditor();
  if (ed) {
    ed.innerHTML = String(item.html || "");
    // Automātiski samazina vecos lielos attēlus redaktorā (saglabājot — DB arī kļūst mazāka).
    void shrinkHeavyImagesInHtml(String(ed.innerHTML || "")).then((shrunk) => {
      if (shrunk && shrunk !== ed.innerHTML && currentEditor() === ed) ed.innerHTML = shrunk;
    });
  }
  markSelectedEditorImage(null);
  if (selectedEditorAttachment) {
    selectedEditorAttachment.classList.remove("sodien-selected-attachment");
    selectedEditorAttachment = null;
  }
  sodienDraft = {
    usePeriod: Boolean(item.use_period),
    start: toDateInput(item.start || ymd(new Date())),
    end: toDateInput(item.end || item.start || ymd(new Date())),
  };
  const editField = currentEditIdField();
  if (editField) editField.value = String(item.id);
  const cb = document.getElementById("sodien-use-period");
  const start = document.getElementById("sodien-start");
  const end = document.getElementById("sodien-end");
  if (cb) cb.checked = Boolean(item.use_period);
  if (start) start.value = toDateInput(item.start || ymd(new Date()));
  if (end) end.value = toDateInput(item.end || start?.value || ymd(new Date()));
  setFormMode(true);
}

function ensureSodienAktStyleOnce() {
  if (typeof document === "undefined") return;
  if (document.getElementById("pdd-sodien-akt-style-v3")) return;
  document.getElementById("pdd-sodien-akt-style-v2")?.remove();
  document.getElementById("pdd-sodien-akt-style")?.remove();
  const s = document.createElement("style");
  s.id = "pdd-sodien-akt-style-v3";
  s.textContent = `
    #sodien-aktualitates-panel .sodien-akt-html {
      overflow-wrap: anywhere;
      word-break: break-word;
      max-width: 100%;
    }
    #sodien-aktualitates-panel .sodien-akt-html img,
    #sodien-aktualitates-panel .sodien-akt-html svg,
    #sodien-aktualitates-panel .sodien-akt-html video {
      max-width: 100% !important;
      height: auto !important;
    }
    #sodien-aktualitates-panel .sodien-akt-html table {
      max-width: 100%;
      display: block;
      overflow-x: auto;
    }
    #sodien-aktualitates-panel .sodien-akt-html pre {
      max-width: 100%;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .pdd-akt-img-collapsed {
      display: flex; align-items: center; gap: 0.55rem; flex-wrap: wrap;
      width: 100%; max-width: 420px; margin: 0.4rem 0; padding: 0.55rem 0.7rem;
      border: 1px dashed rgba(2,132,199,0.55); border-radius: 10px;
      background: linear-gradient(180deg, #f0f9ff, #e0f2fe); color: #075985;
      cursor: pointer; font: inherit; text-align: left;
    }
    .pdd-akt-img-collapsed:hover { background: #bae6fd; }
    .pdd-akt-img-collapsed .pdd-akt-img-ico { font-size: 1.35rem; line-height: 1; }
    .pdd-akt-img-collapsed .pdd-akt-img-meta { font-size: 0.82rem; opacity: 0.9; }
    .pdd-akt-img-lightbox {
      position: fixed; inset: 0; z-index: 90; background: rgba(15,23,42,0.72);
      display: flex; align-items: center; justify-content: center; padding: 1rem;
    }
    .pdd-akt-img-lightbox-inner {
      position: relative; max-width: min(960px, 100%); max-height: 90vh;
      background: #fff; border-radius: 12px; padding: 0.65rem; box-shadow: 0 18px 50px rgba(0,0,0,.35);
    }
    .pdd-akt-img-lightbox-inner img {
      display: block; max-width: 100%; max-height: min(82vh, 900px); height: auto; border-radius: 8px;
    }
    .pdd-akt-img-lightbox-close {
      position: absolute; top: 0.35rem; right: 0.45rem; border: 0; background: rgba(15,23,42,0.75);
      color: #fff; width: 2rem; height: 2rem; border-radius: 999px; cursor: pointer; font-size: 1.1rem; line-height: 1;
    }
    .akt-vesture-html {
      box-sizing: border-box;
      min-width: 0;
      max-width: 100%;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .akt-vesture-html img,
    .akt-vesture-html svg,
    .akt-vesture-html video {
      max-width: 100% !important;
      height: auto !important;
    }
    .akt-vesture-html table {
      max-width: 100%;
      display: block;
      overflow-x: auto;
    }
    .akt-vesture-html pre {
      max-width: 100%;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }
    #sodien-akt-editor img.sodien-selected-img {
      outline: 2px solid #0284c7;
      outline-offset: 2px;
      cursor: move;
    }
    #sodien-akt-editor a.sodien-selected-attachment {
      outline: 2px solid #0284c7;
      outline-offset: 2px;
      border-radius: 4px;
    }
    .sodien-akt-engage {
      margin-top: 0.55rem;
      padding-top: 0.5rem;
      border-top: 1px dashed rgba(2,132,199,0.35);
    }
    .sodien-akt-reactions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
      margin-bottom: 0.45rem;
    }
    .sodien-akt-react.is-active {
      background: rgba(14,116,144,0.16) !important;
      border-color: rgba(14,116,144,0.55) !important;
      font-weight: 600;
    }
    .sodien-akt-ratio {
      margin: 0 0 0.55rem;
    }
    .sodien-akt-ratio-empty {
      font-size: 0.78rem;
      color: var(--muted, #64748b);
    }
    .sodien-akt-ratio-bar {
      display: flex;
      height: 10px;
      border-radius: 999px;
      overflow: hidden;
      background: #e2e8f0;
      border: 1px solid rgba(14,116,144,0.2);
    }
    .sodien-akt-ratio-like {
      background: linear-gradient(90deg, #34d399, #059669);
      min-width: 0;
      transition: width 0.2s ease;
    }
    .sodien-akt-ratio-dislike {
      background: linear-gradient(90deg, #f87171, #dc2626);
      min-width: 0;
      transition: width 0.2s ease;
    }
    .sodien-akt-ratio-labels {
      display: flex;
      justify-content: space-between;
      gap: 0.5rem;
      margin-top: 0.25rem;
      font-size: 0.76rem;
      color: #0f172a;
      font-weight: 600;
    }
    .sodien-akt-comments-title {
      font-size: 0.82rem;
      font-weight: 600;
      color: #075985;
      margin-bottom: 0.35rem;
    }
    .sodien-akt-comments-list {
      display: grid;
      gap: 0.35rem;
      margin-bottom: 0.45rem;
    }
    .sodien-akt-comment {
      background: rgba(255,255,255,0.9);
      border: 1px solid rgba(14,116,144,0.25);
      border-radius: 8px;
      padding: 0.4rem 0.5rem;
    }
    .sodien-akt-comment-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
      align-items: center;
      font-size: 0.75rem;
      color: var(--muted, #64748b);
      margin-bottom: 0.2rem;
    }
    .sodien-akt-comment-body {
      font-size: 0.86rem;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .sodien-akt-comment-form {
      display: grid;
      gap: 0.35rem;
    }
    .sodien-akt-engage-empty {
      margin: 0;
      font-size: 0.8rem;
      color: var(--muted, #64748b);
    }
  `;
  document.head.appendChild(s);
}

const sodienAktFlexibleBox = {
  boxSizing: "border-box",
  minWidth: 0,
  maxWidth: "100%",
  width: "100%",
};

const sodienAktHtmlBox = {
  ...sodienAktFlexibleBox,
  fontSize: "0.92rem",
  overflowWrap: "anywhere",
  wordBreak: "break-word",
  overflowX: "auto",
};

function htmlHasAttachments(htmlRaw) {
  const s = String(htmlRaw ?? "");
  if (!s) return false;
  if (/data-akt-attachment/i.test(s)) return true;
  if (/pdd-aktualitates-files/i.test(s)) return true;
  if (/data:image\//i.test(s)) return true;
  if (/<img\b/i.test(s)) return true;
  return false;
}

/** Lieli base64 attēli — sarakstā tikai mazs pogas vietturis; pilnais atveras uz klikšķa. */
const heavyAktImgStore = new Map();
const HEAVY_AKT_IMG_CHARS = 12000; // ~9KB — tipiski screenshoti/base64

function formatAktImageSizeLabel(dataUrl) {
  const n = String(dataUrl || "").length;
  const kb = Math.max(1, Math.round(n / 1024));
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${kb} KB`;
}

function prepareAktualitateHtmlForPaint(html) {
  const s = String(html || "");
  if (!/data:image\//i.test(s)) return s;
  let n = 0;
  return s.replace(/<img\b([^>]*?)src=(["'])(data:image\/[^"']+)\2([^>]*)>/gi, (full, _pre, _q, src) => {
    if (String(src).length < HEAVY_AKT_IMG_CHARS) return full;
    n += 1;
    const id = `pddakt${Date.now().toString(36)}_${n}_${Math.random().toString(36).slice(2, 7)}`;
    heavyAktImgStore.set(id, src);
    const size = formatAktImageSizeLabel(src);
    return (
      `<button type="button" class="pdd-akt-img-collapsed" data-pdd-akt-open="${id}" title="Atvērt attēlu">` +
      `<span class="pdd-akt-img-ico" aria-hidden="true">📷</span>` +
      `<span><strong>Attēls</strong><span class="pdd-akt-img-meta"> · ${size} · nospied, lai atvērtu</span></span>` +
      `</button>`
    );
  });
}

function closeHeavyAktImageLightbox() {
  document.getElementById("pdd-akt-img-lightbox")?.remove();
}

function openHeavyAktImageLightbox(id) {
  const src = heavyAktImgStore.get(String(id || ""));
  if (!src || typeof document === "undefined") return;
  closeHeavyAktImageLightbox();
  const bg = document.createElement("div");
  bg.id = "pdd-akt-img-lightbox";
  bg.className = "pdd-akt-img-lightbox";
  bg.setAttribute("role", "dialog");
  bg.setAttribute("aria-modal", "true");
  bg.setAttribute("aria-label", "Attēls");
  bg.innerHTML =
    `<div class="pdd-akt-img-lightbox-inner">` +
    `<button type="button" class="pdd-akt-img-lightbox-close" aria-label="Aizvērt">×</button>` +
    `<img alt="Attēls" />` +
    `</div>`;
  const img = bg.querySelector("img");
  if (img) img.src = src;
  bg.addEventListener("click", (ev) => {
    if (ev.target === bg || ev.target?.closest?.(".pdd-akt-img-lightbox-close")) closeHeavyAktImageLightbox();
  });
  document.body.appendChild(bg);
}

function ensureHeavyAktImageClickHandler() {
  if (typeof document === "undefined") return;
  if (document.documentElement.dataset.pddAktImgClick === "1") return;
  document.documentElement.dataset.pddAktImgClick = "1";
  document.addEventListener(
    "click",
    (ev) => {
      const btn = ev.target?.closest?.("[data-pdd-akt-open]");
      if (!btn) return;
      ev.preventDefault();
      openHeavyAktImageLightbox(btn.getAttribute("data-pdd-akt-open"));
    },
    true,
  );
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") closeHeavyAktImageLightbox();
  });
}

function renderTodayInfo({
  html,
  absences,
  aktualitates,
  refreshAktualitates,
  useSupabase,
  syncError,
  loadingAktualitates,
  todayTaskItems,
  onOpenTodayTask,
}) {
  if (typeof html !== "function") return null;
  ensureSodienAktStyleOnce();
  ensureSodienDraftDefaults();
  sodienUiOpts = {
    useSupabase: Boolean(useSupabase),
    refreshAktualitates: typeof refreshAktualitates === "function" ? refreshAktualitates : null,
    __lastAktList: Array.isArray(aktualitates) ? aktualitates : [],
  };
  const awayRows = todayRows(absences);
  const aktList =
    loadingAktualitates && aktualitates === undefined
      ? null
      : Array.isArray(aktualitates)
        ? aktualitates
        : visibleAktualitatesActive();
  const tasksToday = Array.isArray(todayTaskItems) ? todayTaskItems : [];
  const today = sodienDraft.start || ymd(new Date());
  const out = html`
    <section
      id="sodien-aktualitates-panel"
      class="list-panel"
      style=${{
        marginTop: "1rem",
        background: "linear-gradient(180deg, rgba(56,189,248,0.16), rgba(14,116,144,0.1))",
        border: "1px solid rgba(14,116,144,0.55)",
        boxSizing: "border-box",
        minWidth: 0,
        maxWidth: "100%",
        width: "100%",
      }}
    >
      <h3 style=${{ margin: "0 0 0.75rem", fontSize: "1rem", color: "#075985" }}>AKTUALITĀTES</h3>

      ${syncError
        ? html`<div class="banner-warn" role="alert" style=${{ marginBottom: "0.75rem", fontSize: "0.88rem" }}>Aktualitāšu sinhronizācija: ${String(syncError)}</div>`
        : null}

      <div style=${{ fontWeight: 700, borderBottom: "1px solid rgba(14,116,144,0.35)", paddingBottom: "0.35rem", marginBottom: "0.55rem" }}>
        Šodien nav darbā
      </div>
      ${awayRows.length
        ? html`
            <div class="stack" style=${{ gap: "0.5rem", marginBottom: "0.9rem" }}>
              ${awayRows.map(
                (a, i) => html`
                  <button
                    type="button"
                    key=${`today-away-${a.id ?? i}`}
                    title="Atvērt pilnu ierakstu sadaļā Vēsture → Prombūtnes vēsture"
                    style=${{
                      display: "block",
                      width: "100%",
                      boxSizing: "border-box",
                      textAlign: "left",
                      font: "inherit",
                      color: "inherit",
                      cursor: "pointer",
                      border: "1px solid rgba(14,116,144,0.4)",
                      borderRadius: "10px",
                      padding: "0.55rem 0.65rem",
                      background: "rgba(255,255,255,0.72)",
                    }}
                    onClick=${() => navigateToPrombutnesVestureDetail(a.id)}
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
                  </button>
                `
              )}
            </div>
          `
        : html`<p style=${{ margin: "0 0 0.9rem", color: "var(--muted)" }}>Šodien nav neviena prombūtnes ieraksta.</p>`}

      <div style=${{ fontWeight: 700, borderBottom: "1px solid rgba(14,116,144,0.35)", paddingBottom: "0.35rem", marginBottom: "0.55rem" }}>
        Kas šobrīd vēl aktuāls
      </div>
      ${aktList === null
        ? html`<p style=${{ margin: "0 0 0.75rem", color: "var(--muted)" }}>Ielādē aktualitātes…</p>`
        : aktList.length
          ? html`
              <div class="stack" style=${{ gap: "0.5rem", marginBottom: "0.75rem", ...sodienAktFlexibleBox }}>
                ${aktList.map(
                  (x) => html`
                    <div
                      key=${x.id}
                      style=${{
                        border: "1px dashed rgba(2,132,199,0.55)",
                        borderRadius: "10px",
                        padding: "0.55rem 0.65rem",
                        background: "rgba(255,255,255,0.8)",
                        ...sodienAktFlexibleBox,
                      }}
                    >
                      <div style=${{ fontSize: "0.8rem", color: "var(--muted)", marginBottom: "0.3rem", ...sodienAktFlexibleBox }}>
                        ${x.use_period ? `Periods: ${formatLvDate(x.start)} — ${formatLvDate(x.end)}` : `Datums: ${formatLvDate(x.start)}`}
                        ${htmlHasAttachments(x.html)
                          ? html`<span class="pdd-attach-clip" title="Ir pievienots pielikums" aria-label="Ir pievienots pielikums">📎</span>`
                          : null}
                      </div>
                      <div style=${{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: "0.3rem", ...sodienAktFlexibleBox }}>
                        Autors: ${pick(x.authorLabel) || "—"}
                      </div>
                      <div
                        class="sodien-akt-html"
                        style=${sodienAktHtmlBox}
                        dangerouslySetInnerHTML=${{ __html: prepareAktualitateHtmlForPaint(x.html) }}
                      ></div>
                      ${canCurrentActorManageAktualitate(x)
                        ? html`
                            <div class="row" style=${{ marginTop: "0.45rem", flexWrap: "wrap", ...sodienAktFlexibleBox }}>
                              <button type="button" class="btn btn-ghost btn-small" onClick=${() => editAktualitate(x.id)}>Labot</button>
                              <button type="button" class="btn btn-danger btn-small" onClick=${() => void deleteAktualitate(x.id)}>Dzēst</button>
                            </div>
                          `
                        : null}
                      <div class="sodien-akt-engage" data-akt-id=${String(x.id)}></div>
                    </div>
                  `
                )}
              </div>
            `
          : html`<p style=${{ margin: "0 0 0.75rem", color: "var(--muted)" }}>Papildu aktualitātes nav pievienotas.</p>`}

      <details id="sodien-editor-details" class="list-panel" style=${{ marginTop: "0.8rem", background: "rgba(255,255,255,0.45)" }}>
        <summary id="sodien-editor-title" style=${{ cursor: "pointer", fontWeight: 600, fontSize: "0.98rem" }}>Pievienot aktualitāti</summary>
        <div class="stack" style=${{ gap: "0.5rem", marginTop: "0.6rem" }}>
          <input id="sodien-edit-id" type="hidden" value="" />
          <div class="row" style=${{ gap: "0.35rem", flexWrap: "wrap" }}>
            <button type="button" class="btn btn-ghost btn-small" onClick=${() => applyCmd("bold")}>B</button>
            <button type="button" class="btn btn-ghost btn-small" onClick=${() => applyCmd("italic")}>I</button>
            <button type="button" class="btn btn-ghost btn-small" onClick=${() => applyCmd("underline")}>U</button>
            <button type="button" class="btn btn-ghost btn-small" onClick=${() => applyCmd("strikeThrough")} title="Izsvītrots"><s>S</s></button>
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
            onClick=${onEditorClickForImageSelection}
            onPaste=${onEditorPasteImages}
            style=${{
              minHeight: "110px",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              background: "rgba(255,255,255,0.9)",
              padding: "0.55rem",
              boxSizing: "border-box",
              minWidth: 0,
              maxWidth: "100%",
              width: "100%",
              overflowWrap: "anywhere",
              wordBreak: "break-word",
              overflowX: "auto",
            }}
            data-placeholder="Aktualitāte — brīvais teksts"
          ></div>

          <div class="row" style=${{ gap: "0.45rem", flexWrap: "wrap" }}>
            <label class="btn btn-ghost btn-small" style=${{ cursor: "pointer" }}>
              Pievienot pielikumu
              <input type="file" style=${{ display: "none" }} onClick=${onBeforePickAttachment} onChange=${onPickAttachment} />
            </label>
            <span style=${{ fontSize: "0.82rem", color: "var(--muted)" }}>Bildes / screenshot nav atļauti (vietas taupīšanai).</span>
          </div>
          <div class="row" style=${{ gap: "0.35rem", flexWrap: "wrap" }}>
            <button type="button" class="btn btn-danger btn-small" onClick=${() => void deleteSelectedAttachment()}>Dzēst pielikumu</button>
          </div>

          <label style=${{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
            <input
              id="sodien-use-period"
              type="checkbox"
              defaultChecked=${Boolean(sodienDraft.usePeriod)}
              onInput=${onToggleUsePeriod}
              onChange=${onToggleUsePeriod}
            />
            Atzīmēt periodu
          </label>
          <div class="row" style=${{ gap: "0.75rem" }}>
            <div class="field" style=${{ flex: "1 1 140px" }}>
              <label>Sākums</label>
              <input
                id="sodien-start"
                type="date"
                class="input"
                defaultValue=${sodienDraft.start || today}
                onInput=${onStartDateChange}
                onChange=${onStartDateChange}
              />
            </div>
            <div class="field" style=${{ flex: "1 1 140px" }}>
              <label>Beigas</label>
              <input
                id="sodien-end"
                type="date"
                class="input"
                defaultValue=${sodienDraft.end || today}
                onInput=${onEndDateChange}
                onChange=${onEndDateChange}
              />
            </div>
          </div>

          <div class="row">
            <button id="sodien-submit-btn" type="button" class="btn btn-primary btn-small" onClick=${() => void addAktualitate()}>Pievienot aktualitāti</button>
            <button type="button" class="btn btn-ghost btn-small" onClick=${resetAktualitateForm}>Atcelt</button>
          </div>
        </div>
      </details>

      <div style=${{ fontWeight: 700, borderBottom: "1px solid rgba(14,116,144,0.35)", paddingBottom: "0.35rem", marginBottom: "0.55rem", marginTop: "0.8rem" }}>
        Darba uzdevumu aktualitātes uz šodienu
      </div>
      ${tasksToday.length
        ? html`
            <div class="stack" style=${{ gap: "0.45rem", marginBottom: "0.9rem" }}>
              ${tasksToday.map(
                (t, i) => html`
                  <button
                    key=${String(t?.key || `task-${i}`)}
                    type="button"
                    class="btn btn-ghost btn-small"
                    style=${{ justifyContent: "flex-start", textAlign: "left", width: "100%" }}
                    onClick=${() => (typeof onOpenTodayTask === "function" ? onOpenTodayTask(t) : null)}
                  >
                    ${String(t?.module || "Darba uzdevumi")} · ${String(t?.subtitle || "").trim() ? `${String(t.subtitle).trim()} — ` : ""}${String(t?.title || "Uzdevums")}
                    ${String(t?.topic || "").trim() ? ` · Tēma: ${String(t.topic).trim()}` : ""}
                    ${String(t?.dueDate || "").trim() ? ` (${formatLvDate(String(t.dueDate))})` : ""}
                    ${t?.hasAttachments
                      ? html`<span class="pdd-attach-clip" title="Ir pievienots pielikums" aria-label="Ir pievienots pielikums">📎</span>`
                      : null}
                  </button>
                `
              )}
            </div>
          `
        : html`<p style=${{ margin: "0 0 0.9rem", color: "var(--muted)" }}>Šodien nav darba uzdevumu ar aktuālu izpildes periodu.</p>`}
    </section>
  `;
  scheduleHydrateEngagePanels();
  ensureHeavyAktImageClickHandler();
  return out;
}

function retentionCutoffYmd() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return ymd(d);
}

let aktualitatesHistoryPurgeStarted = false;

/** Automātiski dzēš beigušās / vecākas aktualitātes un noņem <img> no atlikušajām. */
async function purgeAktualitatesHistoryOnce(sb) {
  if (aktualitatesHistoryPurgeStarted || !sb) return;
  aktualitatesHistoryPurgeStarted = true;
  const today = ymd(new Date());
  const cutoff = retentionCutoffYmd();
  try {
    await Promise.race([
      (async () => {
        const t = await resolveAktualitatesTableName(sb);
        // Beigušās vai vecākas par iepriekšējā mēneša sākumu
        try {
          await sb.from(t).delete().lt("Beigas", cutoff);
        } catch (e) {
          console.warn("[aktualitates.purge.old]", e?.message || e);
        }
        try {
          await sb.from(t).delete().lt("Beigas", today);
        } catch (e) {
          console.warn("[aktualitates.purge.expired]", e?.message || e);
        }
        // Lokālā keša
        try {
          const local = loadAktualitates();
          const cleaned = local
            .filter((x) => {
              const end = String(x?.end || x?.Beigas || "");
              return !end || (end >= cutoff && end >= today);
            })
            .map((x) => ({
              ...x,
              html: stripAktualitateImagesFromHtml(x?.html || ""),
            }));
          if (cleaned.length !== local.length) saveAktualitates(cleaned);
          else saveAktualitates(cleaned);
        } catch {
          /* ignore */
        }
      })(),
      new Promise((r) => setTimeout(r, 12000)),
    ]);
  } catch (e) {
    console.warn("[aktualitates.purge]", e?.message || e);
  }
}

window.PDDSodien = {
  renderTodayInfo,
  htmlHasAttachments,
  loadAktualitates,
  saveAktualitates,
  visibleAktualitatesActive,
  fetchActiveAktualitatesFromSupabase,
  fetchActiveAktualitatesViaRest,
  fetchAllAktualitatesFromSupabase,
  primeAktualitatesTable,
  ensureSodienAktStyleOnce,
  TABLE_AKTUALITATES,
  navigateToPrombutnesVestureDetail,
  purgeAktualitatesHistoryOnce,
  stripAktualitateImagesFromHtml,
  AKTUALITATES_IMAGES_DISABLED,
};
