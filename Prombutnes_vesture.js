/**
 * Prombūtnes vēsture — palīgfunkcijas navigācijas zīmītei un rindu izcelšanai (gaidošs Cits).
 * Ielādē pirms galvenā index.html skripta.
 */
(function (global) {
  "use strict";

  function normLoose(v) {
    return String(v ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function isCitsSaskanotsTypeName(name) {
    return normLoose(name).startsWith("cits");
  }

  function isPendingCitsAbsence(a) {
    if (!a || typeof a !== "object") return false;
    const typeName = a.type?.name ?? a.type_id ?? "";
    if (!isCitsSaskanotsTypeName(typeName)) return false;
    const st = String(a.status ?? "").trim().toLowerCase();
    return st === "pending" || st === "pending_manager" || st === "gaida";
  }

  /**
   * Vai rādīt „Gaida apstiprinājumu” pie navigācijas.
   * @param {Array} absences — pilns normalizētais saraksts (kā PrombutnesSection)
   * @param {string} userId — pašreizējais lietotājs
   * @param {boolean} approverView — true, ja lietotājs redz visu komandu (vadītājs)
   */
  function shouldShowPendingCitsNavBadge(absences, userId, approverView) {
    const list = Array.isArray(absences) ? absences : [];
    const uid = String(userId ?? "").trim();
    return list.some((a) => {
      if (!isPendingCitsAbsence(a)) return false;
      if (approverView) return true;
      return String(a.user_id ?? "").trim() === uid;
    });
  }

  global.PDDPrombutnesVesture = {
    isCitsSaskanotsTypeName,
    isPendingCitsAbsence,
    shouldShowPendingCitsNavBadge,
  };
})(typeof window !== "undefined" ? window : globalThis);
