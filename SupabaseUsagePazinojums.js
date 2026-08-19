/**
 * DB slodzes pārbaudes paziņojums — tikai Irinai Kupcovai, vienkāršā latviešu valodā.
 * Datus raksta GitHub Action «Supabase usage weekly».
 */
(function initPddUsageWeeklyNotice() {
  "use strict";
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const BANNER_ID = "pdd-usage-weekly-banner";
  const TABLE = "pdd_usage_weekly_notice";
  const OWNER_EMAIL = "irina.kupcova@vid.gov.lv";
  const FIRST_DELAY_MS = 2000;

  let closedThisPageLoad = false;

  function actorEmail() {
    return String(
      globalThis.__PDD_ACTOR_EMAIL__ || sessionStorage.getItem("pdd_local_email") || ""
    )
      .trim()
      .toLowerCase();
  }

  function isOwnerViewer() {
    return actorEmail() === OWNER_EMAIL;
  }

  function hideBanner() {
    document.getElementById(BANNER_ID)?.remove();
    adjustBodyPadding();
  }

  function adjustBodyPadding() {
    const hasDb = document.getElementById("pdd-db-resource-banner");
    const hasUsage = document.getElementById(BANNER_ID);
    if (hasDb || hasUsage) {
      document.body.style.paddingTop = hasDb && hasUsage ? "6.1rem" : "3.2rem";
    } else {
      document.body.style.paddingTop = "";
    }
  }

  function formatWhen(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleString("lv-LV", { dateStyle: "short", timeStyle: "short" });
    } catch {
      return "";
    }
  }

  function buildHumanCopy(row) {
    const when = formatWhen(row?.captured_at || row?.updated_at);
    const hasRealCheck = Boolean(String(row?.notice_id || "").trim());
    const alert = Boolean(row?.alert);

    if (!hasRealCheck) {
      return {
        title: "Datu bāzes slodze",
        body:
          "Automātiskā nedēļas pārbaude vēl nav pabeigta. Kad tā būs gatava, šeit redzēsi īsu rezultātu — tev nekas nav jādara.",
        alert: false,
        pending: true,
      };
    }

    if (alert) {
      return {
        title: "Datu bāzes slodze — uzmanību",
        body: `Tika veikta pārbaude${when ? ` (${when})` : ""}. Šobrīd pastāv paaugstināts datu bāzes pārslogojuma risks — lietotne var kļūt lēna. Sistēma jau pati brīdina un tīra vecos datus; tev šobrīd nekas nav jādara.`,
        alert: true,
        pending: false,
      };
    }

    return {
      title: "Datu bāzes slodze — viss kārtībā",
      body: `Tika veikta pārbaude${when ? ` (${when})` : ""}. Paaugstināts pārslogojuma risks šobrīd nav konstatēts — datu bāzei vajadzētu strādāt normāli.`,
      alert: false,
      pending: false,
    };
  }

  function showBanner(row) {
    if (closedThisPageLoad) {
      hideBanner();
      return;
    }

    const copy = buildHumanCopy(row);
    if (!copy.body) {
      hideBanner();
      return;
    }

    let el = document.getElementById(BANNER_ID);
    if (!el) {
      el = document.createElement("div");
      el.id = BANNER_ID;
      el.setAttribute("role", "status");
      document.body.prepend(el);
    }

    el.style.cssText = [
      "position:fixed",
      "left:0",
      "right:0",
      document.getElementById("pdd-db-resource-banner") ? "top:3.2rem" : "top:0",
      "z-index:10001",
      "padding:0.65rem 1rem",
      copy.alert ? "background:#92400e" : copy.pending ? "background:#334155" : "background:#1e3a5f",
      copy.alert ? "color:#fff7ed" : "color:#e0f2fe",
      copy.alert ? "border-bottom:1px solid #c2410c" : "border-bottom:1px solid #475569",
      "font:600 0.88rem/1.45 system-ui,Segoe UI,sans-serif",
      "display:flex",
      "gap:0.75rem",
      "align-items:flex-start",
      "justify-content:space-between",
      "flex-wrap:wrap",
      "box-shadow:0 4px 14px rgba(0,0,0,.18)",
    ].join(";");

    el.innerHTML = "";
    const textWrap = document.createElement("div");
    textWrap.style.cssText = "flex:1;min-width:14rem;";
    const title = document.createElement("div");
    title.textContent = copy.title;
    title.style.fontWeight = "700";
    const body = document.createElement("div");
    body.style.cssText = "font-weight:500;margin-top:0.2rem;";
    body.textContent = copy.body;

    textWrap.append(title, body);

    const actions = document.createElement("span");
    actions.style.cssText = "display:inline-flex;gap:0.4rem;flex-shrink:0;";
    const seenBtn = document.createElement("button");
    seenBtn.type = "button";
    seenBtn.textContent = "Sapratu";
    seenBtn.style.cssText =
      "appearance:none;border:1px solid rgba(255,255,255,.45);background:rgba(0,0,0,.15);color:inherit;border-radius:6px;padding:0.3rem 0.65rem;font:inherit;cursor:pointer;";
    seenBtn.onclick = () => {
      closedThisPageLoad = true;
      hideBanner();
    };
    actions.append(seenBtn);
    el.append(textWrap, actions);
    adjustBodyPadding();
  }

  async function fetchNoticeOnce() {
    if (!isOwnerViewer()) {
      hideBanner();
      return { skip: true };
    }
    if (closedThisPageLoad) {
      hideBanner();
      return { skip: true, closed: true };
    }
    const sb = globalThis.__PDD_SUPABASE__;
    if (!sb || typeof sb.from !== "function") return { skip: true };

    try {
      const { data, error } = await sb.from(TABLE).select("*").eq("id", 1).maybeSingle();
      if (error) {
        if (/does not exist|schema cache|42P01/i.test(String(error.message || error))) {
          showBanner({
            notice_id: "",
            captured_at: new Date().toISOString(),
            alert: false,
          });
          return { ok: true, pendingMigration: true };
        }
        return { skip: true };
      }
      if (!data) {
        showBanner({ notice_id: "", captured_at: null, alert: false });
        return { ok: true, empty: true };
      }
      showBanner(data);
      return { ok: true };
    } catch {
      return { skip: true };
    }
  }

  function start() {
    window.addEventListener("pdd:actor-ready", () => void fetchNoticeOnce());
    setTimeout(() => void fetchNoticeOnce(), FIRST_DELAY_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  globalThis.PDD_USAGE_WEEKLY_NOTICE = { fetchNoticeOnce, hideBanner };
})();
