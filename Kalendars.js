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

  const LS_CALENDAR_VIEW_MODE = "pdd_calendar_view_mode_v1";
  const LV_MONTHS = [
    "janvaris",
    "februaris",
    "marts",
    "aprilis",
    "maijs",
    "junijs",
    "julijs",
    "augusts",
    "septembris",
    "oktobris",
    "novembris",
    "decembris",
  ];
  const HOLIDAY_CACHE = new Map();
  const CALENDAR_VIEW_OPTIONS = [
    { id: "month_all", label: "Mēnesis (pilns)" },
    { id: "month_workdays", label: "Mēnesis (darba dienas, brīvdienas blāvas)" },
    { id: "week_all", label: "Nedēļa" },
    { id: "week_workdays", label: "Darba nedēļa" },
  ];

  function normalizeCalendarViewMode(mode) {
    const m = String(mode ?? "").trim();
    return CALENDAR_VIEW_OPTIONS.some((x) => x.id === m) ? m : "month_all";
  }

  function getCalendarViewMode() {
    try {
      return normalizeCalendarViewMode(localStorage.getItem(LS_CALENDAR_VIEW_MODE));
    } catch {
      return "month_all";
    }
  }

  function setCalendarViewMode(mode) {
    const safe = normalizeCalendarViewMode(mode);
    try {
      localStorage.setItem(LS_CALENDAR_VIEW_MODE, safe);
    } catch {
      // ignore storage errors
    }
    return safe;
  }

  function injectCalendarViewStyle() {
    if (typeof document === "undefined") return;
    if (document.getElementById("pdd-kalendars-view-style")) return;
    const s = document.createElement("style");
    s.id = "pdd-kalendars-view-style";
    s.textContent = `
      .cal-wrap .cal-head {
        gap: .45rem;
        flex-wrap: wrap;
      }
      .cal-wrap .pdd-cal-view-wrap {
        margin-left: auto;
        display: inline-flex;
        align-items: center;
        gap: .35rem;
      }
      .cal-wrap .pdd-cal-view-label {
        font-size: .78rem;
        color: var(--muted, #64748b);
        white-space: nowrap;
      }
      .cal-wrap .pdd-cal-view-select {
        min-width: 220px;
        max-width: 100%;
        border: 1px solid rgba(148, 163, 184, .65);
        border-radius: 8px;
        padding: .26rem .45rem;
        background: #fff;
        font-size: .8rem;
      }
      .cal-wrap .pdd-cal-weekend-dim {
        opacity: .35 !important;
        filter: saturate(.6);
      }
      .cal-wrap .pdd-cal-holiday {
        box-shadow: inset 0 0 0 1px rgba(220, 38, 38, .22);
        background: linear-gradient(180deg, rgba(220, 38, 38, .08), rgba(220, 38, 38, .03));
      }
      .cal-wrap .pdd-cal-holiday-dim {
        opacity: .35 !important;
        filter: saturate(.6);
      }
    `;
    document.head.appendChild(s);
  }

  function normalizeTextLv(v) {
    return String(v ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function parseCalendarMonthFromWrap(calWrap) {
    const titleEl = calWrap?.querySelector?.(".cal-head strong");
    const raw = String(titleEl?.textContent ?? "").trim();
    const m = /^([^\d]+)\s+(\d{4})$/.exec(raw);
    if (!m) return null;
    const monthName = normalizeTextLv(m[1]).replace(/\./g, "");
    const monthIndex = LV_MONTHS.indexOf(monthName);
    if (monthIndex < 0) return null;
    const year = Number(m[2]);
    if (!Number.isFinite(year) || year < 1900) return null;
    return { year, monthIndex };
  }

  function mondayBasedOffset(jsDay) {
    return (Number(jsDay) + 6) % 7;
  }

  function getCalendarGridStartDate(year, monthIndex) {
    const first = new Date(year, monthIndex, 1);
    const shift = mondayBasedOffset(first.getDay());
    return new Date(year, monthIndex, 1 - shift);
  }

  function addDays(baseDate, days) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + Number(days || 0));
    return d;
  }

  function computeEasterSunday(year) {
    // Meeus/Jones/Butcher (Gregorian calendar).
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=Mar,4=Apr
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  }

  function buildLatviaHolidaySet(year) {
    const y = Number(year);
    if (!Number.isFinite(y)) return new Set();
    if (HOLIDAY_CACHE.has(y)) return HOLIDAY_CACHE.get(y);

    const set = new Set();
    function addDate(dateObj) {
      const k = toYmd(dateObj);
      if (k) set.add(k);
    }
    function addFixed(month1, day) {
      addDate(new Date(y, month1 - 1, day));
    }

    // Fixed public holidays.
    addFixed(1, 1);
    addFixed(5, 1);
    addFixed(5, 4);
    addFixed(6, 23);
    addFixed(6, 24);
    addFixed(11, 18);
    addFixed(12, 24);
    addFixed(12, 25);
    addFixed(12, 26);

    // Easter-related (Good Friday, Easter, Easter Monday).
    const easterSunday = computeEasterSunday(y);
    addDate(addDays(easterSunday, -2));
    addDate(easterSunday);
    addDate(addDays(easterSunday, 1));

    // Moved holidays if May 4 or Nov 18 fall on weekend.
    const may4 = new Date(y, 4, 4);
    if (may4.getDay() === 0) addDate(new Date(y, 4, 5));
    if (may4.getDay() === 6) addDate(new Date(y, 4, 6));
    const nov18 = new Date(y, 10, 18);
    if (nov18.getDay() === 0) addDate(new Date(y, 10, 19));
    if (nov18.getDay() === 6) addDate(new Date(y, 10, 20));

    HOLIDAY_CACHE.set(y, set);
    return set;
  }

  function getWeekRowIndex(cells) {
    const list = Array.isArray(cells) ? cells : [];
    if (!list.length) return 0;
    const todayIndex = list.findIndex((el) => el.classList.contains("cal-cell-today"));
    if (todayIndex >= 0) return Math.floor(todayIndex / 7);
    const firstInMonth = list.findIndex((el) => !el.classList.contains("cal-cell-out"));
    if (firstInMonth >= 0) return Math.floor(firstInMonth / 7);
    return 0;
  }

  function resetCalendarGridVisuals(grid, dows, cells) {
    if (grid) grid.style.gridTemplateColumns = "";
    for (const el of [...dows, ...cells]) {
      el.style.display = "";
      el.classList.remove("pdd-cal-weekend-dim");
      el.classList.remove("pdd-cal-holiday");
      el.classList.remove("pdd-cal-holiday-dim");
    }
  }

  function applyCalendarViewToWrap(calWrap) {
    if (!calWrap || calWrap.dataset.pddCalendarDisabled === "1") return;
    const grid = calWrap.querySelector(".cal-grid");
    const head = calWrap.querySelector(".cal-head");
    if (!grid || !head) return;

    const dows = Array.from(grid.querySelectorAll(".cal-dow"));
    const cells = Array.from(grid.querySelectorAll(".cal-cell"));
    if (!cells.length) return;

    const mode = getCalendarViewMode();
    const weekRow = getWeekRowIndex(cells);
    const isWeekendCol = (idx) => idx % 7 === 5 || idx % 7 === 6;
    const parsedMonth = parseCalendarMonthFromWrap(calWrap);
    const gridStart = parsedMonth ? getCalendarGridStartDate(parsedMonth.year, parsedMonth.monthIndex) : null;
    const holidaySet = parsedMonth ? buildLatviaHolidaySet(parsedMonth.year) : new Set();
    const isHolidayCell = (idx) => {
      if (!gridStart || !holidaySet?.size) return false;
      const d = addDays(gridStart, idx);
      return holidaySet.has(toYmd(d));
    };

    resetCalendarGridVisuals(grid, dows, cells);

    // Always mark holidays visually in calendar cells.
    cells.forEach((el, idx) => {
      if (isHolidayCell(idx)) {
        el.classList.add("pdd-cal-holiday");
        el.title = (el.title ? `${el.title} · ` : "") + "Latvijas svētku diena";
      }
    });

    if (mode === "month_workdays") {
      dows.forEach((el, idx) => {
        if (isWeekendCol(idx)) el.classList.add("pdd-cal-weekend-dim");
      });
      cells.forEach((el, idx) => {
        if (isWeekendCol(idx) || isHolidayCell(idx)) {
          el.classList.add("pdd-cal-weekend-dim");
          if (isHolidayCell(idx)) el.classList.add("pdd-cal-holiday-dim");
        }
      });
    }

    if (mode === "week_all" || mode === "week_workdays") {
      grid.style.gridTemplateColumns = "repeat(7, minmax(0, 1fr))";
      cells.forEach((el, idx) => {
        const row = Math.floor(idx / 7);
        if (row !== weekRow) el.style.display = "none";
      });
      if (mode === "week_workdays") {
        grid.style.gridTemplateColumns = "repeat(5, minmax(0, 1fr))";
        dows.forEach((el, idx) => {
          if (isWeekendCol(idx)) el.style.display = "none";
        });
        cells.forEach((el, idx) => {
          if (Math.floor(idx / 7) === weekRow && isWeekendCol(idx)) el.style.display = "none";
          if (Math.floor(idx / 7) === weekRow && !isWeekendCol(idx) && isHolidayCell(idx)) {
            el.classList.add("pdd-cal-holiday-dim");
          }
        });
      }
    }
  }

  function ensureCalendarViewSelector(calWrap) {
    if (!calWrap) return;
    const head = calWrap.querySelector(".cal-head");
    if (!head) return;
    let wrap = head.querySelector(".pdd-cal-view-wrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "pdd-cal-view-wrap";
      const label = document.createElement("span");
      label.className = "pdd-cal-view-label";
      label.textContent = "Skats:";
      const select = document.createElement("select");
      select.className = "pdd-cal-view-select";
      CALENDAR_VIEW_OPTIONS.forEach((opt) => {
        const option = document.createElement("option");
        option.value = opt.id;
        option.textContent = opt.label;
        select.appendChild(option);
      });
      select.value = getCalendarViewMode();
      select.addEventListener("change", (ev) => {
        setCalendarViewMode(ev.target.value);
        refreshAllCalendarWraps();
      });
      wrap.appendChild(label);
      wrap.appendChild(select);
      head.appendChild(wrap);
    } else {
      const select = wrap.querySelector(".pdd-cal-view-select");
      if (select) select.value = getCalendarViewMode();
    }
  }

  function refreshAllCalendarWraps() {
    const wraps = Array.from(document.querySelectorAll(".cal-wrap"));
    wraps.forEach((w) => {
      ensureCalendarViewSelector(w);
      applyCalendarViewToWrap(w);
    });
  }

  function installCalendarViewControls() {
    if (typeof document === "undefined") return;
    injectCalendarViewStyle();
    refreshAllCalendarWraps();
    const root = document.body || document.documentElement;
    if (!root) return;
    let t = null;
    const scheduleRefresh = () => {
      clearTimeout(t);
      t = setTimeout(() => refreshAllCalendarWraps(), 40);
    };
    const mo = new MutationObserver(scheduleRefresh);
    mo.observe(root, { childList: true, subtree: true });
    window.addEventListener("storage", (ev) => {
      if (ev.key === LS_CALENDAR_VIEW_MODE) scheduleRefresh();
    });
  }

  window.KALENDARS = {
    toYmd,
    injectCalendarTodayHighlightStyle: injectCalendarTodayHighlightStyle,
    getCalendarViewMode,
    setCalendarViewMode,
    refreshAllCalendarWraps,
  };

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", installCalendarViewControls);
    } else {
      installCalendarViewControls();
    }
  }

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
    // setUserAizvieto nedrīkst apiet ar admin sessionStorage — DB/RPC vajag īsto auth e-pastu
    // (sk. Komanda.js resolveActorEmail + pdd_update_user_aizvieto_*).
  })();
})();
