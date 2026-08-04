/**
 * Saderības ceļš — faktiskais modulis ir PakalpojumuVadiba.js (ASCII nosaukums serverim).
 * Ja šis fails tiek ielādēts atsevišķi, pāradresē uz galveno moduli.
 */
(function () {
  if (typeof globalThis !== "undefined" && globalThis.PDD_PAKALPOJUMU_VADIBA) return;
  if (typeof document === "undefined") return;
  const s = document.createElement("script");
  s.src = "./PakalpojumuVadiba.js?v=202608050";
  s.defer = true;
  document.head.appendChild(s);
})();
