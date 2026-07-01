/**
 * Procesu vadība — pieslēgums PDD (bez navigācijas injekcijas; poga ir Navigacija.js).
 */
(function () {
  const VIEW_ID = "procesuVadiba";

  function removeLegacyNavDuplicate() {
    if (typeof document === "undefined") return;
    document.getElementById("pdd-nav-procesu-vadiba-wrap")?.remove();
    document.getElementById("pdd-nav-procesu-vadiba")?.remove();
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", removeLegacyNavDuplicate, { once: true });
    } else {
      removeLegacyNavDuplicate();
    }
  }

  globalThis.PDD_PROCESU_VADIBA_INTEGRACIJA = {
    VIEW_ID,
    getPanel(html, React) {
      return globalThis.PDD_PROCESU_VADIBA?.createProcesuVadibaModule?.(html, React) || null;
    },
  };
})();
