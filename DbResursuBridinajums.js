/**
 * Viegls baneris vietnē, ja Supabase neatbild / resursi izsmelti.
 * Neaiztiek citus moduļus — tikai DOM pārklājums.
 */
(function initPddDbResourceBanner() {
  "use strict";
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const BANNER_ID = "pdd-db-resource-banner";
  const LS_SNOOZE = "pdd_db_resource_banner_snooze_until";
  const PROBE_MS = 10000;
  const INTERVAL_MS = 5 * 60 * 1000;
  const FIRST_DELAY_MS = 20000;

  function snoozed() {
    try {
      const until = Number(localStorage.getItem(LS_SNOOZE) || 0);
      return until > Date.now();
    } catch {
      return false;
    }
  }

  function setSnoozeHours(h) {
    try {
      localStorage.setItem(LS_SNOOZE, String(Date.now() + h * 3600 * 1000));
    } catch {
      /* ignore */
    }
  }

  function hideBanner() {
    document.getElementById(BANNER_ID)?.remove();
    document.body.style.paddingTop = "";
    try {
      void globalThis.PDD_USAGE_WEEKLY_NOTICE?.fetchNoticeOnce?.();
    } catch {
      /* ignore */
    }
  }

  function showBanner(detail) {
    if (snoozed()) return;
    let el = document.getElementById(BANNER_ID);
    if (!el) {
      el = document.createElement("div");
      el.id = BANNER_ID;
      el.setAttribute("role", "alert");
      el.style.cssText = [
        "position:fixed",
        "left:0",
        "right:0",
        "top:0",
        "z-index:10000",
        "padding:0.65rem 1rem",
        "background:#7c2d12",
        "color:#ffedd5",
        "border-bottom:1px solid #c2410c",
        "font:600 0.88rem/1.35 system-ui,Segoe UI,sans-serif",
        "display:flex",
        "gap:0.75rem",
        "align-items:center",
        "justify-content:space-between",
        "flex-wrap:wrap",
        "box-shadow:0 4px 16px rgba(0,0,0,.25)",
      ].join(";");
      document.body.appendChild(el);
      document.body.style.paddingTop = "3.2rem";
    }
    const msg = String(detail || "Supabase neatbild laikā — iespējami resursu limiti.");
    el.innerHTML = "";
    const text = document.createElement("span");
    text.textContent =
      "DB resursu brīdinājums: " + msg + " Dati var ielādēties lēni. Restart / tīrīšana Supabase panelī.";
    const actions = document.createElement("span");
    actions.style.cssText = "display:inline-flex;gap:0.4rem;flex-wrap:wrap;";
    const snoozeBtn = document.createElement("button");
    snoozeBtn.type = "button";
    snoozeBtn.textContent = "Slēpt 4 h";
    snoozeBtn.style.cssText =
      "appearance:none;border:1px solid #fdba74;background:#9a3412;color:#fff7ed;border-radius:6px;padding:0.25rem 0.55rem;font:inherit;cursor:pointer;";
    snoozeBtn.onclick = () => {
      setSnoozeHours(4);
      hideBanner();
      document.body.style.paddingTop = "";
    };
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "Aizvērt";
    closeBtn.style.cssText = snoozeBtn.style.cssText;
    closeBtn.onclick = () => {
      hideBanner();
      document.body.style.paddingTop = "";
    };
    actions.append(snoozeBtn, closeBtn);
    el.append(text, actions);
    try {
      void globalThis.PDD_USAGE_WEEKLY_NOTICE?.fetchNoticeOnce?.();
    } catch {
      /* ignore */
    }
  }

  function looksBad(errMsg, ms) {
    const blob = String(errMsg || "").toLowerCase();
    if (ms >= PROBE_MS - 50) return true;
    return /timeout|abort|exhaust|resource|over.?capacit|usage.?limit|503|502|529|546|57014|statement timeout|fetch failed|network/i.test(
      blob
    );
  }

  async function probeOnce() {
    const sb = globalThis.__PDD_SUPABASE__;
    if (!sb || typeof sb.from !== "function") return { skip: true };

    const started = Date.now();
    try {
      const result = await Promise.race([
        sb.from("users").select("id").limit(1),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout ${PROBE_MS}ms`)), PROBE_MS)
        ),
      ]);
      const ms = Date.now() - started;
      const err = result?.error;
      if (err) {
        const msg = err.message || String(err);
        if (looksBad(msg, ms)) return { ok: false, detail: msg };
        return { ok: true };
      }
      if (ms > PROBE_MS * 0.85) return { ok: false, detail: `Lēna atbilde (${ms} ms)` };
      hideBanner();
      document.body.style.paddingTop = "";
      return { ok: true, ms };
    } catch (e) {
      const msg = e?.message || String(e);
      if (looksBad(msg, Date.now() - started)) return { ok: false, detail: msg };
      return { ok: true };
    }
  }

  async function tick() {
    try {
      const r = await probeOnce();
      if (r?.skip) return;
      if (r && r.ok === false) showBanner(r.detail);
    } catch {
      /* ignore */
    }
  }

  function start() {
    setTimeout(() => {
      void tick();
      setInterval(() => void tick(), INTERVAL_MS);
    }, FIRST_DELAY_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  globalThis.PDD_DB_RESOURCE_BANNER = { probeOnce, showBanner, hideBanner };
})();
