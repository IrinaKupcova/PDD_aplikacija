/**
 * Nedēļas Supabase Usage/Egress trends — paziņojums lapā (admin / uzturētājs).
 * Datus raksta GitHub Action «Supabase usage weekly» tabulā pdd_usage_weekly_notice.
 */
(function initPddUsageWeeklyNotice() {
  "use strict";
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const BANNER_ID = "pdd-usage-weekly-banner";
  const LS_SEEN = "pdd_usage_weekly_seen_notice_id_v1";
  const TABLE = "pdd_usage_weekly_notice";
  const FIRST_DELAY_MS = 2500;
  const INTERVAL_MS = 10 * 60 * 1000;
  const ROLE_POLL_MS = 2000;
  const ROLE_POLL_MAX_MS = 120000;

  function isUsageNoticeViewer() {
    const role = String(globalThis.__PDD_ACTOR_ROLE__ || "").trim().toLowerCase();
    if (role === "admin" || role === "manager" || role === "vaditajs" || role === "vadītājs") return true;
    try {
      if (globalThis.KOMANDA?.isGlobalActorAdmin?.()) return true;
    } catch {
      /* ignore */
    }
    const em = String(globalThis.__PDD_ACTOR_EMAIL__ || sessionStorage.getItem("pdd_local_email") || "")
      .trim()
      .toLowerCase();
    if (em === "irina.kupcova@vid.gov.lv" || em === "katrina.jurgensone@vid.gov.lv") return true;
    return false;
  }

  function seenNoticeId() {
    try {
      return String(localStorage.getItem(LS_SEEN) || "").trim();
    } catch {
      return "";
    }
  }

  function markSeen(noticeId) {
    try {
      localStorage.setItem(LS_SEEN, String(noticeId || "").trim());
    } catch {
      /* ignore */
    }
  }

  function hideBanner() {
    const el = document.getElementById(BANNER_ID);
    if (el) el.remove();
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

  function effectiveNoticeId(row) {
    const direct = String(row?.notice_id || "").trim();
    if (direct) return direct;
    const captured = String(row?.captured_at || row?.updated_at || "").trim();
    if (captured) return `weekly-${captured}`;
    const summary = String(row?.summary || "").trim();
    if (summary) return `weekly-summary-${summary.slice(0, 48)}`;
    return "";
  }

  function fmtPct(n) {
    if (n == null || Number.isNaN(Number(n))) return "—";
    const v = Number(n);
    const sign = v > 0 ? "+" : "";
    return `${sign}${v.toFixed(1)}%`;
  }

  function buildDetailText(row) {
    const d = row?.details && typeof row.details === "object" ? row.details : {};
    const totals = d.totals || {};
    const changes = d.changes || {};
    const hasTotals = Object.keys(totals).length > 0;
    if (!hasTotals) {
      return [
        "Egress GB: Supabase Dashboard → Organization → Usage (Free limits 5 GB/mēn.)",
        "Ja šeit nav skaitļu — GitHub → Actions → «Supabase usage weekly» → Run workflow.",
      ].join("\n");
    }
    const lines = [
      `REST (7d): ${Number(totals.rest || 0).toLocaleString("lv-LV")} (${fmtPct(changes.rest)} vs iepriekšējā nedēļa)`,
      `Realtime (7d): ${Number(totals.realtime || 0).toLocaleString("lv-LV")} (${fmtPct(changes.realtime)})`,
      `Kopā API: ${Number(totals.combined || 0).toLocaleString("lv-LV")} (${fmtPct(changes.combined)})`,
      "Egress GB: skatīt Supabase Dashboard → Organization → Usage (Free limits 5 GB/mēn.)",
    ];
    if (d.dashboardUrl) lines.push(`Saite: ${d.dashboardUrl}`);
    return lines.join("\n");
  }

  function showBanner(row) {
    const noticeId = effectiveNoticeId(row);
    const summary = String(row?.summary || "").trim();
    if (!noticeId || !summary) {
      hideBanner();
      return;
    }
    if (seenNoticeId() === noticeId) {
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

    const alert = Boolean(row?.alert);
    const pending = !String(row?.notice_id || "").trim();
    el.style.cssText = [
      "position:fixed",
      "left:0",
      "right:0",
      document.getElementById("pdd-db-resource-banner") ? "top:3.2rem" : "top:0",
      "z-index:10001",
      "padding:0.65rem 1rem",
      alert ? "background:#92400e" : pending ? "background:#334155" : "background:#1e3a5f",
      alert ? "color:#fff7ed" : "color:#e0f2fe",
      alert ? "border-bottom:1px solid #c2410c" : "border-bottom:1px solid #475569",
      "font:600 0.86rem/1.4 system-ui,Segoe UI,sans-serif",
      "display:flex",
      "gap:0.75rem",
      "align-items:flex-start",
      "justify-content:space-between",
      "flex-wrap:wrap",
      "box-shadow:0 4px 14px rgba(0,0,0,.18)",
    ].join(";");

    const captured = row?.captured_at ? new Date(row.captured_at).toLocaleString("lv-LV") : "";
    const detail = buildDetailText(row);

    el.innerHTML = "";
    const textWrap = document.createElement("div");
    textWrap.style.cssText = "flex:1;min-width:14rem;";
    const title = document.createElement("div");
    title.textContent = alert
      ? "Supabase Usage brīdinājums — trends aug"
      : pending
        ? "Supabase Usage — gaida pirmo nedēļas pārbaudi"
        : "Supabase Usage — nedēļas trends";
    title.style.fontWeight = "700";
    const body = document.createElement("div");
    body.style.cssText = "font-weight:500;margin-top:0.15rem;white-space:pre-wrap;";
    body.textContent = `${summary}${captured ? `\n(${captured})` : ""}${detail ? `\n${detail}` : ""}`;

    textWrap.append(title, body);

    const actions = document.createElement("span");
    actions.style.cssText = "display:inline-flex;gap:0.4rem;flex-wrap:wrap;flex-shrink:0;";
    const seenBtn = document.createElement("button");
    seenBtn.type = "button";
    seenBtn.textContent = "Sapratu";
    seenBtn.style.cssText =
      "appearance:none;border:1px solid rgba(255,255,255,.45);background:rgba(0,0,0,.15);color:inherit;border-radius:6px;padding:0.25rem 0.55rem;font:inherit;cursor:pointer;";
    seenBtn.onclick = () => {
      markSeen(noticeId);
      hideBanner();
    };
    actions.append(seenBtn);
    el.append(textWrap, actions);
    adjustBodyPadding();
  }

  async function fetchNoticeOnce() {
    if (!isUsageNoticeViewer()) {
      hideBanner();
      return { skip: true, reason: "not-viewer" };
    }
    const sb = globalThis.__PDD_SUPABASE__;
    if (!sb || typeof sb.from !== "function") return { skip: true, reason: "no-supabase" };

    try {
      const { data, error } = await sb.from(TABLE).select("*").eq("id", 1).maybeSingle();
      if (error) {
        if (/does not exist|schema cache|42P01/i.test(String(error.message || error))) {
          showBanner({
            notice_id: "",
            captured_at: new Date().toISOString(),
            alert: false,
            summary:
              "Supabase Usage tabula vēl nav DB (migrācija 20260813160000). Pēc migrācijas palaid Actions → Supabase usage weekly.",
            details: {},
          });
          return { ok: true, pendingMigration: true };
        }
        console.warn("[PDD Usage notice]", error.message || error);
        return { skip: true, reason: "query-error" };
      }
      if (!data) {
        hideBanner();
        return { ok: true, empty: true };
      }
      showBanner(data);
      return { ok: true };
    } catch (e) {
      console.warn("[PDD Usage notice]", e?.message || e);
      return { skip: true };
    }
  }

  async function tick() {
    try {
      await fetchNoticeOnce();
    } catch {
      /* ignore */
    }
  }

  function startRolePoll() {
    const started = Date.now();
    const poll = setInterval(() => {
      if (isUsageNoticeViewer()) {
        clearInterval(poll);
        void tick();
      } else if (Date.now() - started > ROLE_POLL_MAX_MS) {
        clearInterval(poll);
      }
    }, ROLE_POLL_MS);
  }

  function start() {
    window.addEventListener("pdd:actor-ready", () => void tick());
    setTimeout(() => {
      void tick();
      setInterval(() => void tick(), INTERVAL_MS);
    }, FIRST_DELAY_MS);
    startRolePoll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  globalThis.PDD_USAGE_WEEKLY_NOTICE = { fetchNoticeOnce, showBanner, hideBanner, markSeen };
})();
