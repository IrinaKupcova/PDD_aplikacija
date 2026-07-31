/**
 * Pakalpojumu vadība — pieslēgums PDD (bez navigācijas injekcijas; poga ir Navigacija.js).
 */
(function () {
  const VIEW_ID = "pakalpojumuVadiba";

  function removeLegacyNavDuplicate() {
    if (typeof document === "undefined") return;
    document.getElementById("pdd-nav-pakalpojumu-vadiba-wrap")?.remove();
    document.getElementById("pdd-nav-pakalpojumu-vadiba")?.remove();
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", removeLegacyNavDuplicate, { once: true });
    } else {
      removeLegacyNavDuplicate();
    }
  }

  globalThis.PDD_PAKALPOJUMU_VADIBA_INTEGRACIJA = {
    VIEW_ID,
    getPanel(html, React) {
      return globalThis.PDD_PAKALPOJUMU_VADIBA?.createPakalpojumuVadibaModule?.(html, React) || null;
    },
  };
})();
