/**
 * Procesu vadība — pieslēgums PDD navigācijai (tikai jauns, neaiztiek citus moduļus).
 * Pievieno navigācijas pogu un reģistrē skatu index.html aplikācijā.
 */
(function () {
  const VIEW_ID = "procesuVadiba";

  function injectNavLink() {
    // Navigācijas poga jau ir Navigacija.js — neinjicējam dublikātu.
    return false;
  }

  function highlightNav(view) {
    const btn = document.getElementById("pdd-nav-procesu-vadiba");
    if (!btn) return;
    btn.classList.toggle("active", view === VIEW_ID);
  }

  function tryInject() {
    if (injectNavLink()) return;
    requestAnimationFrame(tryInject);
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", tryInject, { once: true });
    } else {
      tryInject();
    }
  }

  globalThis.PDD_PROCESU_VADIBA_INTEGRACIJA = {
    VIEW_ID,
    highlightNav,
    getPanel(html, React) {
      return globalThis.PDD_PROCESU_VADIBA?.createProcesuVadibaModule?.(html, React) || null;
    },
  };
})();
