/**
 * Saderības ceļš — faktiskais modulis ir ProcesuVadiba.js (ASCII nosaukums serverim).
 * Ja šis fails tiek ielādēts atsevišķi, pāradresē uz galveno moduli.
 */
(function () {
  if (typeof globalThis !== "undefined" && globalThis.PDD_PROCESU_VADIBA) return;
  if (typeof document === "undefined") return;
  const s = document.createElement("script");
  s.src = "./ProcesuVadiba.js?v=202606206";
  s.defer = true;
  document.head.appendChild(s);
})();
