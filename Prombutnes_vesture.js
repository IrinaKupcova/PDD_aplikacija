/**
 * Prombūtnes vēsture — palīgfunkcijas navigācijas zīmītei, rindu izcelšanai, dzēšanai un kalendāra vārdiem.
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

  function isUuidLike(v) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v ?? "").trim());
  }

  function pickUserNameFromProfile(u) {
    if (!u || typeof u !== "object") return "";
    for (const k of ["Vārds uzvārds", "Vards uzvards", "full_name", "name", "display_name"]) {
      const s = String(u[k] ?? "").trim();
      if (s && !isUuidLike(s)) return s;
    }
    return "";
  }

  function pickUserEmailFromProfile(u) {
    if (!u || typeof u !== "object") return "";
    for (const k of ["e-pasts", "email", "i-mail", "e-mail"]) {
      const s = String(u[k] ?? "").trim();
      if (s.includes("@")) return s.toLowerCase();
    }
    return "";
  }

  function isCitsSaskanotsTypeName(name) {
    return normLoose(name).startsWith("cits");
  }

  function isPendingCitsAbsence(a) {
    if (!a || typeof a !== "object") return false;
    const typeLabel = String(
      a.type?.name ?? a.type?.type ?? a["Prombūtnes veids"] ?? a.prombutnes_veids ?? ""
    ).trim();
    if (!typeLabel || !isCitsSaskanotsTypeName(typeLabel)) return false;
    const st = String(a.status ?? "").trim().toLowerCase();
    return st === "pending" || st === "pending_manager" || st === "gaida";
  }

  function shouldShowPendingCitsNavBadge(absences, userId, approverView) {
    const list = Array.isArray(absences) ? absences : [];
    const uid = String(userId ?? "").trim();
    return list.some((a) => {
      if (!isPendingCitsAbsence(a)) return false;
      if (approverView) return true;
      return String(a.user_id ?? "").trim() === uid;
    });
  }

  function findUserInMapByRef(pmap, ref) {
    const r = String(ref ?? "").trim();
    if (!r || !(pmap instanceof Map)) return null;
    if (pmap.has(r)) return pmap.get(r);
    if (isUuidLike(r)) return pmap.get(r) ?? null;
    const want = normLoose(r);
    for (const [id, u] of pmap.entries()) {
      if (normLoose(pickUserNameFromProfile(u)) === want) return u;
      if (normLoose(id) === want) return u;
    }
    return null;
  }

  /** Kolonna „Vārds uzvārds” DB — FK uz users.id; saglabājam UUID. */
  function dbUserRefForPrombutnesColumn({ userId, userName, columnName }) {
    const c = String(columnName ?? "").toLowerCase().trim();
    const id = String(userId ?? "").trim();
    const name = String(userName ?? "").trim();
    const isUserFkCol =
      c.includes("vārds") || c.includes("vards") || c.includes("darbin") || c.includes("user") || c.includes("uuid");
    if (isUserFkCol && id && isUuidLike(id)) return id;
    if (isUuidLike(id)) return id;
    if (isUuidLike(name)) return name;
    if (isUserFkCol && id) return id;
    if (name) return name;
    return id || name || null;
  }

  function enrichAbsenceRow(r, pmap, ctx) {
    const row = r && typeof r === "object" ? r : {};
    const uidRaw = String(row.user_id ?? row["Vārds uzvārds"] ?? row["Vards uzvards"] ?? "").trim();
    const pmapLocal = pmap instanceof Map ? pmap : new Map();
    let employee = findUserInMapByRef(pmapLocal, uidRaw);
    const ctxName = String(ctx?.actorDisplayName ?? ctx?.fallbackName ?? "").trim();
    const ctxUid = String(ctx?.userId ?? "").trim();
    const ctxEmail = String(ctx?.sessionEmail ?? "").trim().toLowerCase();

    if (!employee && ctxUid && (uidRaw === ctxUid || normLoose(uidRaw) === normLoose(ctxName))) {
      employee = findUserInMapByRef(pmapLocal, ctxUid) ?? {
        id: ctxUid,
        full_name: ctxName,
        "Vārds uzvārds": ctxName,
      };
    }

    let displayName = employee ? pickUserNameFromProfile(employee) : "";
    if (!displayName || isUuidLike(displayName)) {
      const fromCol = String(row["Vārds uzvārds"] ?? row["Vards uzvards"] ?? "").trim();
      if (fromCol && !isUuidLike(fromCol)) displayName = fromCol;
    }
    if ((!displayName || isUuidLike(displayName)) && uidRaw && !isUuidLike(uidRaw)) {
      displayName = uidRaw;
    }
    if ((!displayName || isUuidLike(displayName)) && ctxName && uidRaw === ctxUid) {
      displayName = ctxName;
    }

    const resolvedId =
      (employee && String(employee.id ?? "").trim()) ||
      (isUuidLike(uidRaw) ? uidRaw : isUuidLike(ctxUid) ? ctxUid : uidRaw);

    const employeeOut = displayName
      ? {
          ...(employee && typeof employee === "object" ? employee : {}),
          id: resolvedId,
          full_name: displayName,
          "Vārds uzvārds": displayName,
        }
      : employee;

    return {
      ...row,
      user_id: isUuidLike(resolvedId) ? resolvedId : String(row.user_id ?? uidRaw).trim(),
      employee: employeeOut,
    };
  }

  /**
   * Vai ieraksts pieder pašreizējam lietotājam (pēc id, e-pasta vai vārda).
   */
  function isOwnAbsenceRecord(a, ctx) {
    if (!a || typeof a !== "object") return false;
    const uid = String(ctx?.userId ?? "").trim();
    const rowUid = String(a.user_id ?? "").trim();
    if (uid && rowUid && rowUid === uid) return true;

    const em = String(ctx?.sessionEmail ?? "").trim().toLowerCase();
    const ls = String(ctx?.localEmail ?? "").trim().toLowerCase();
    const wantEmail = em || ls;
    if (wantEmail && a?.employee) {
      const uem = pickUserEmailFromProfile(a.employee);
      if (uem && uem === wantEmail) return true;
    }

    const mine = String(ctx?.displayName ?? "").trim().toLowerCase();
    if (mine) {
      const empName = pickUserNameFromProfile(a.employee).toLowerCase();
      if (empName && empName === mine) return true;
      if (rowUid && normLoose(rowUid) === normLoose(mine)) return true;
    }

    return false;
  }

  /** Jebkurš lietotājs var dzēst savus ierakstus; administrators — visus. */
  function canDeleteAbsenceRecord(a, ctx) {
    if (ctx?.isAdmin) return true;
    return isOwnAbsenceRecord(a, ctx);
  }

  const api = {
    isCitsSaskanotsTypeName,
    isPendingCitsAbsence,
    shouldShowPendingCitsNavBadge,
    isUuidLike,
    dbUserRefForPrombutnesColumn,
    enrichAbsenceRow,
    isOwnAbsenceRecord,
    canDeleteAbsenceRecord,
    pickUserNameFromProfile,
    toYmd: function toYmd(v) {
      return String(v ?? "").slice(0, 10);
    },
    intersectsYmdRange: function intersectsYmdRange(aStart, aEnd, pStart, pEnd) {
      const as = String(aStart ?? "");
      const ae = String(aEnd ?? "");
      const ps = String(pStart ?? "");
      const pe = String(pEnd ?? "");
      if (!as || !ae || !ps || !pe) return true;
      return as <= pe && ae >= ps;
    },
  };

  global.PDDPrombutnesVesture = api;
})(typeof window !== "undefined" ? window : globalThis);
