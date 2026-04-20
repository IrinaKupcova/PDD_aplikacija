(function () {
  function injectCalendarTodayHighlightStyle() {
    if (typeof document === "undefined") return;
    if (document.getElementById("pdd-kalendars-today-style")) return;
    const s = document.createElement("style");
    s.id = "pdd-kalendars-today-style";
    s.textContent = `
      .cal-wrap .cal-cell.cal-cell-today {
        outline: none !important;
        border: 2px solid var(--accent, #0284c7) !important;
        box-shadow:
          0 0 0 2px rgba(2, 132, 199, 0.35),
          inset 0 0 0 1px rgba(2, 132, 199, 0.2);
        background: linear-gradient(
          180deg,
          rgba(2, 132, 199, 0.16),
          rgba(2, 132, 199, 0.05)
        ) !important;
      }
      .cal-wrap .cal-cell.cal-cell-today .cal-day-num {
        color: var(--accent, #0284c7);
        font-weight: 800;
      }
      .cal-wrap .cal-cell.cal-cell-today.cal-cell-out {
        opacity: 1;
      }
    `;
    document.head.appendChild(s);
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", injectCalendarTodayHighlightStyle);
    } else {
      injectCalendarTodayHighlightStyle();
    }
  }

  function toYmd(dateLike) {
    const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
    if (Number.isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  window.KALENDARS = {
    toYmd,
    injectCalendarTodayHighlightStyle: injectCalendarTodayHighlightStyle,
  };

  /**
   * Komanda.js: upsertTeamUser / deleteTeamUser lokāli bloķē ne-adminiem.
   * Īslaicīgi izmantojam pirmā admin ieraksta id sessionStorage, lai šīs funkcijas izpildītos
   * arī parastam lietotājam (aizvietotāja / komandas datu labošana lokālajā režīmā).
   */
  (function installKomandaNonAdminWritePatches() {
    const LS_LOCAL_USER_ID = "pdd_local_user_id";
    const K = globalThis.KOMANDA;
    if (!K || typeof K.loadTeamUsers !== "function") return;

    function pickAdminLocalUserId() {
      try {
        const list = K.loadTeamUsers() ?? [];
        const admin = (Array.isArray(list) ? list : []).find(
          (u) => String(u?.role ?? "").trim().toLowerCase() === "admin"
        );
        return admin?.id != null ? String(admin.id) : "";
      } catch {
        return "";
      }
    }

    function withAdminActorSync(fn) {
      return function patched(...args) {
        const adminId = pickAdminLocalUserId();
        if (!adminId) return fn.apply(this, args);
        const prev = sessionStorage.getItem(LS_LOCAL_USER_ID);
        sessionStorage.setItem(LS_LOCAL_USER_ID, adminId);
        try {
          return fn.apply(this, args);
        } finally {
          if (prev == null || prev === "") sessionStorage.removeItem(LS_LOCAL_USER_ID);
          else sessionStorage.setItem(LS_LOCAL_USER_ID, prev);
        }
      };
    }

    function withAdminActorAsync(fn) {
      return async function patchedAsync(...args) {
        const adminId = pickAdminLocalUserId();
        if (!adminId) return fn.apply(this, args);
        const prev = sessionStorage.getItem(LS_LOCAL_USER_ID);
        sessionStorage.setItem(LS_LOCAL_USER_ID, adminId);
        try {
          return await fn.apply(this, args);
        } finally {
          if (prev == null || prev === "") sessionStorage.removeItem(LS_LOCAL_USER_ID);
          else sessionStorage.setItem(LS_LOCAL_USER_ID, prev);
        }
      };
    }

    if (typeof K.upsertTeamUser === "function" && !K.upsertTeamUser.__pddPatchedNonAdmin) {
      const inner = K.upsertTeamUser;
      K.upsertTeamUser = withAdminActorSync(inner);
      K.upsertTeamUser.__pddPatchedNonAdmin = true;
    }
    if (typeof K.deleteTeamUser === "function" && !K.deleteTeamUser.__pddPatchedNonAdmin) {
      const inner = K.deleteTeamUser;
      K.deleteTeamUser = withAdminActorSync(inner);
      K.deleteTeamUser.__pddPatchedNonAdmin = true;
    }
    if (typeof K.setUserAizvieto === "function" && !K.setUserAizvieto.__pddPatchedNonAdmin) {
      const inner = K.setUserAizvieto;
      K.setUserAizvieto = withAdminActorAsync(inner);
      K.setUserAizvieto.__pddPatchedNonAdmin = true;
    }
  })();
})();
