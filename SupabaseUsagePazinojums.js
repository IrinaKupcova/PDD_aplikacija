/**
 * DB slodzes pārbaudes paziņojums — tikai Irinai Kupcovai, vienkāršā latviešu valodā.
 * Datus raksta GitHub Action «Supabase usage weekly».
 * Atverot lapu, papildus parāda šī brīža atbildi un vai kaut kas jādara.
 */
(function initPddUsageWeeklyNotice() {
  "use strict";
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const BANNER_ID = "pdd-usage-weekly-banner";
  const TABLE = "pdd_usage_weekly_notice";
  const OWNER_EMAIL = "irina.kupcova@vid.gov.lv";
  const FIRST_DELAY_MS = 2000;
  const LIVE_PROBE_MS = 5000;
  const LIVE_SLOW_MS = 4000;

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
    const db = document.getElementById("pdd-db-resource-banner");
    const usage = document.getElementById(BANNER_ID);
    const dbH = db ? db.offsetHeight : 0;
    const usageH = usage ? usage.offsetHeight : 0;
    if (usage) usage.style.top = dbH ? `${dbH}px` : "0";
    const total = dbH + usageH;
    document.body.style.paddingTop = total ? `${total}px` : "";
  }

  function formatWhen(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleString("lv-LV", {
        weekday: "long",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  }

  function liveLabel(live) {
    if (!live || live.pending) return "pārbaudu šī brīža atbildi…";
    if (live.ok === true && typeof live.ms === "number") {
      return `datu bāze atbild normāli (${live.ms} ms)`;
    }
    if (live.ok === false && live.slow && typeof live.ms === "number") {
      return `datu bāze atbild, bet lēni (${live.ms} ms) — iespējama slodze`;
    }
    if (live.ok === false) {
      return "datu bāze neatbild vai ir pārslogota";
    }
    return "šī brīža statusu neizdevās noskaidrot";
  }

  function buildHumanCopy(row, live) {
    const when = formatWhen(row?.captured_at || row?.updated_at);
    const hasRealCheck = Boolean(String(row?.notice_id || "").trim());
    const weeklyAlert = Boolean(row?.alert);
    const liveBad = Boolean(live && live.ok === false && !live.pending);
    const loadError = Boolean(row?._loadError);
    const nowLine = `Šobrīd, atverot lapu: ${liveLabel(live)}.`;
    const actionNone =
      "Tev šobrīd nekas nav jādara — pārbaudi un veco datu tīrīšanu dara sistēma, ne tu.";

    if (!hasRealCheck) {
      return {
        title: liveBad ? "Datu bāzes slodze — uzmanību" : "Datu bāzes slodze",
        lines: [
          nowLine,
          loadError
            ? "Pēdējā automātiskā pārbaude: rezultātu šobrīd nevaru ielādēt."
            : "Pēdējā automātiskā pārbaude: vēl nav veikta. Sistēma to dara pati katru pirmdienu ap plkst. 10:00.",
          actionNone,
        ],
        alert: liveBad,
        pending: !liveBad,
      };
    }

    if (weeklyAlert || liveBad) {
      const checkLine = weeklyAlert
        ? `Pēdējā automātiskā pārbaude: ${when || "laiks nav zināms"}. Konstatēts paaugstināts pārslogojuma risks — lietotne var kļūt lēna.`
        : `Pēdējā automātiskā pārbaude: ${when || "laiks nav zināms"}. Toreiz paaugstināts risks netika konstatēts, bet šobrīd atbilde nav normāla.`;
      return {
        title: "Datu bāzes slodze — uzmanību",
        lines: [
          nowLine,
          checkLine,
          "Ko sistēma dara: pati brīdina un tīra vecos datus.",
          actionNone,
        ],
        alert: true,
        pending: false,
      };
    }

    return {
      title: "Datu bāzes slodze — viss kārtībā",
      lines: [
        nowLine,
        `Pēdējā automātiskā pārbaude: ${when || "laiks nav zināms"}. Paaugstināts pārslogojuma risks netika konstatēts.`,
        actionNone,
      ],
      alert: false,
      pending: false,
    };
  }

  function showBanner(row, live) {
    if (closedThisPageLoad) {
      hideBanner();
      return;
    }

    const copy = buildHumanCopy(row, live);
    if (!copy.lines?.length) {
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

    const dbEl = document.getElementById("pdd-db-resource-banner");
    el.style.cssText = [
      "position:fixed",
      "left:0",
      "right:0",
      dbEl ? `top:${dbEl.offsetHeight}px` : "top:0",
      "z-index:10001",
      "padding:0.65rem 1rem",
      copy.alert ? "background:#92400e" : copy.pending ? "background:#334155" : "background:#1e3a5f",
      copy.alert ? "color:#fff7ed" : "color:#e0f2fe",
      copy.alert ? "border-bottom:1px solid #c2410c" : "border-bottom:1px solid #475569",
      "font:600 0.86rem/1.4 system-ui,Segoe UI,sans-serif",
      "display:flex",
      "gap:0.75rem",
      "align-items:flex-start",
      "justify-content:space-between",
      "flex-wrap:wrap",
      "box-shadow:0 4px 14px rgba(0,0,0,.18)",
    ].join(";");

    el.innerHTML = "";
    const textWrap = document.createElement("div");
    textWrap.style.cssText = "flex:1;min-width:16rem;";
    const title = document.createElement("div");
    title.textContent = copy.title;
    title.style.cssText = "font-weight:700;font-size:0.92rem;";
    textWrap.append(title);
    for (const line of copy.lines) {
      const rowEl = document.createElement("div");
      rowEl.style.cssText = "font-weight:500;margin-top:0.18rem;";
      rowEl.textContent = line;
      textWrap.append(rowEl);
    }

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

  async function probeLiveStatus() {
    const sb = globalThis.__PDD_SUPABASE__;
    if (!sb || typeof sb.from !== "function") {
      return { ok: null, pending: false };
    }
    const started = Date.now();
    try {
      const result = await Promise.race([
        sb.from("users").select("id").limit(1),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), LIVE_PROBE_MS)
        ),
      ]);
      const ms = Date.now() - started;
      if (result?.error) {
        return { ok: false, ms, pending: false };
      }
      if (ms >= LIVE_SLOW_MS) {
        return { ok: false, slow: true, ms, pending: false };
      }
      return { ok: true, ms, pending: false };
    } catch {
      return { ok: false, ms: Date.now() - started, pending: false };
    }
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

    let row = { notice_id: "", captured_at: null, alert: false };
    try {
      const { data, error } = await sb.from(TABLE).select("*").eq("id", 1).maybeSingle();
      if (error) {
        if (/does not exist|schema cache|42P01/i.test(String(error.message || error))) {
          row = { notice_id: "", captured_at: null, alert: false };
        } else {
          row = { notice_id: "", captured_at: null, alert: false, _loadError: true };
        }
      } else if (data) {
        row = data;
      }
    } catch {
      row = { notice_id: "", captured_at: null, alert: false, _loadError: true };
    }

    showBanner(row, { pending: true });
    const live = await probeLiveStatus();
    if (!closedThisPageLoad) showBanner(row, live);
    return { ok: true };
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
