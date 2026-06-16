/**
 * Galvenās lietotnes navigācijas čaula (htm/React).
 * index.html: pēc `const html = htm.bind(...)` izsauc
 * `const AppShellWithNav = globalThis.PDD_NAV.createAppShellWithNav(html);`
 */
(function () {
  function ensureNavigacijaExtraStyles() {
    if (typeof document === "undefined") return;
    if (document.getElementById("pdd-navigacija-extra-style-v3")) return;
    const s = document.createElement("style");
    s.id = "pdd-navigacija-extra-style-v3";
    s.textContent = `
      .app-nav-top-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        margin-bottom: 0.45rem;
      }
      .app-nav-top-row .app-nav-title {
        margin: 0;
      }
      .app-nav .pdd-nav-pin-btn {
        border: 1px solid var(--border);
        background: var(--surface);
        color: var(--text);
        border-radius: 8px;
        font-size: 0.76rem;
        padding: 0.32rem 0.5rem;
        cursor: pointer;
      }
      .app-nav .pdd-nav-pin-btn:hover:not(:disabled) {
        border-color: var(--accent, #0284c7);
        color: var(--accent, #0284c7);
      }
      .app-nav .pdd-nav-pin-btn:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }
      .app-nav .pdd-nav-back-btn {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 0.45rem;
        width: 100%;
        margin: 0 0 0.55rem 0;
        padding: 0.5rem 0.55rem;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--surface);
        color: var(--text);
        font-size: 0.82rem;
        font-weight: 500;
        cursor: pointer;
        box-sizing: border-box;
      }
      .app-nav .pdd-nav-back-btn:hover {
        background: var(--bg);
        border-color: var(--accent, #0284c7);
        color: var(--accent, #0284c7);
      }
      .app-nav .pdd-nav-back-btn svg {
        flex: 0 0 auto;
      }
      .app-nav-vesture-details {
        width: 100%;
        margin: 0;
      }
      .app-nav-accordion {
        width: 100%;
        margin: 0;
      }
      .app-nav-accordion-summary {
        list-style: none;
        cursor: pointer;
        user-select: none;
        position: relative;
        padding-right: 1.1rem;
      }
      .app-nav-accordion-summary::-webkit-details-marker {
        display: none;
      }
      .app-nav-accordion-summary::after {
        content: "▸";
        position: absolute;
        right: 0.2rem;
        top: 50%;
        transform: translateY(-50%);
        font-size: 0.76rem;
        color: var(--muted);
        transition: transform 0.15s ease;
      }
      .app-nav-accordion[open] > .app-nav-accordion-summary::after {
        transform: translateY(-50%) rotate(90deg);
      }
      @media (max-width: 720px) {
        .app-nav-vesture-details {
          flex: 1 1 100%;
        }
      }
      .app-nav-vesture-summary {
        list-style: none;
        cursor: pointer;
        user-select: none;
        font-weight: 400;
        position: relative;
        padding-right: 1.1rem;
      }
      .app-nav-vesture-summary::-webkit-details-marker {
        display: none;
      }
      .app-nav-vesture-summary::after {
        content: "▸";
        position: absolute;
        right: 0.2rem;
        top: 50%;
        transform: translateY(-50%);
        font-size: 0.76rem;
        color: var(--muted);
        transition: transform 0.15s ease;
      }
      .app-nav-vesture-details[open] > .app-nav-vesture-summary::after {
        transform: translateY(-50%) rotate(90deg);
      }
      .app-nav-vesture-details .app-nav-sub {
        margin-top: 0.2rem;
      }
      .app-nav-badge-new {
        display: inline-flex;
        align-items: center;
        margin-left: 0.45rem;
        padding: 0.08rem 0.36rem;
        border-radius: 999px;
        background: #dc2626;
        color: #fff;
        font-size: 0.64rem;
        font-weight: 700;
        letter-spacing: 0.02em;
      }
      .pdd-nav-poll-alert {
        margin-top: 0.75rem;
        border: 1px solid #fb923c;
        background: linear-gradient(180deg, #fff7ed, #ffedd5);
        border-radius: 12px;
        padding: 0.6rem 0.65rem;
        display: grid;
        gap: 0.45rem;
      }
      .pdd-nav-poll-alert-title {
        margin: 0;
        font-size: 0.82rem;
        color: #9a3412;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
      }
      .pdd-nav-poll-alert-sub {
        margin: 0;
        font-size: 0.74rem;
        color: #7c2d12;
        line-height: 1.35;
      }
      .pdd-nav-poll-alert-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
      }
      .pdd-nav-poll-alert-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 1.25rem;
        height: 1.25rem;
        padding: 0 0.35rem;
        border-radius: 999px;
        background: #f97316;
        color: #fff;
        font-weight: 700;
        font-size: 0.72rem;
      }
      .pdd-pinned-bar {
        position: sticky;
        bottom: 0;
        z-index: 35;
        margin-top: 0.85rem;
        border: 1px solid var(--border);
        background: color-mix(in oklab, var(--surface) 92%, var(--bg) 8%);
        border-radius: 10px;
        padding: 0.45rem 0.55rem;
        box-shadow: 0 -4px 10px rgba(0, 0, 0, 0.12);
      }
      .pdd-pinned-title {
        margin: 0 0 0.38rem;
        color: var(--muted);
        font-size: 0.78rem;
      }
      .pdd-pinned-list {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
      }
      .pdd-pinned-item {
        display: inline-flex;
        align-items: center;
        border: 1px solid var(--border);
        border-radius: 999px;
        background: var(--bg);
        overflow: hidden;
      }
      .pdd-pinned-open-btn,
      .pdd-pinned-close-btn {
        border: 0;
        background: transparent;
        color: var(--text);
        cursor: pointer;
      }
      .pdd-pinned-open-btn {
        padding: 0.22rem 0.6rem;
        font-size: 0.79rem;
      }
      .pdd-pinned-close-btn {
        padding: 0.22rem 0.45rem;
        border-left: 1px solid var(--border);
        color: var(--muted);
        font-size: 0.85rem;
      }
      .pdd-pinned-item.is-active {
        border-color: var(--accent, #0284c7);
      }
      .pdd-pinned-item.is-active .pdd-pinned-open-btn {
        color: var(--accent, #0284c7);
      }
      .pdd-pinned-close-btn:hover {
        color: var(--danger, #dc2626);
      }
    `;
    document.head.appendChild(s);
  }

  function scrollToHomeAktualitates() {
    if (typeof document === "undefined") return;
    const run = (attempt) => {
      const el = document.getElementById("sodien-aktualitates-panel");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      if (attempt < 25) requestAnimationFrame(() => run(attempt + 1));
    };
    requestAnimationFrame(() => run(0));
  }

  function pddTodayYmd() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function pddSafeParseJson(raw, fallback) {
    try {
      const v = JSON.parse(String(raw || ""));
      return v === undefined ? fallback : v;
    } catch {
      return fallback;
    }
  }

  function pddIsUuidLike(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? "").trim());
  }

  function pddActorKeyForPollVotes() {
    const candidates = [
      globalThis.__PDD_ACTOR_USER_ID__,
      sessionStorage.getItem("pdd_local_user_id"),
      localStorage.getItem("pdd_local_user_id"),
      globalThis.__PDD_SESSION_USER_ID__,
    ];
    for (const c of candidates) {
      const id = String(c ?? "").trim();
      if (id && pddIsUuidLike(id)) return id;
    }
    const em = String(globalThis.__PDD_ACTOR_EMAIL__ ?? sessionStorage.getItem("pdd_local_email") ?? "").trim().toLowerCase();
    if (em) return em;
    return "anonymous";
  }

  function pddExtractPollItemsFromEvent(ev) {
    const poll = ev && typeof ev === "object" ? ev.poll : null;
    if (poll && typeof poll === "object") {
      if (Array.isArray(poll.items) && poll.items.length) return poll.items;
      if (
        poll.question ||
        (Array.isArray(poll.options) && poll.options.length) ||
        (poll.votes && typeof poll.votes === "object")
      ) {
        return [
          {
            id: "poll-legacy",
            type: poll.type || "choice",
            pollTitle: "",
            pollDate: "",
            question: poll.question || "",
            options: poll.options || [],
            votes: poll.votes || {},
          },
        ];
      }
    }
    return [];
  }

  function pddFormatPollDateLv(ymd) {
    const s = String(ymd || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
    const d = new Date(`${s}T12:00:00`);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString("lv-LV", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function pddFindPendingSaliedesanaPoll() {
    const list = pddSafeParseJson(localStorage.getItem("pdd_saliedesana_pasakumi_v2") || "[]", []);
    if (!Array.isArray(list) || !list.length) return null;
    const actor = pddActorKeyForPollVotes();
    const actorEmail = String(globalThis.__PDD_ACTOR_EMAIL__ ?? sessionStorage.getItem("pdd_local_email") ?? "").trim().toLowerCase();
    const today = pddTodayYmd();
    const norm = (x) => String(x || "").trim();
    const isDeclined = (v) => norm(v) === "__DECLINED__";
    const isAnswered = (p) => {
      const votes = p && typeof p.votes === "object" ? p.votes : {};
      const mineA = votes ? votes[actor] : "";
      const mineB = actorEmail ? votes[actorEmail] : "";
      if (isDeclined(mineA) || isDeclined(mineB)) return true;
      return Boolean(norm(mineA) || norm(mineB));
    };
    const hasUsableQuestion = (p) => Boolean(norm(p?.question));
    const optionsFor = (p) => (Array.isArray(p?.options) ? p.options : []).map((x) => norm(x)).filter(Boolean);

    const upcoming = list
      .filter((ev) => ev && typeof ev === "object")
      .filter((ev) => {
        const d = norm(ev.date || ev.event_date || ev.Datums);
        return d && d >= today;
      })
      .sort((a, b) => `${norm(a.date)} ${norm(a.time)}`.localeCompare(`${norm(b.date)} ${norm(b.time)}`));

    const found = [];
    for (const ev of upcoming) {
      const eventId = norm(ev.id) || norm(ev.local_id) || (ev.remoteId ? `remote-${ev.remoteId}` : "");
      const date = norm(ev.date);
      const title = norm(ev.title) || "Pasākums";
      const items = pddExtractPollItemsFromEvent(ev);
      for (const p of items) {
        const pid = norm(p?.id) || "poll";
        const type = String(p?.type || "choice") === "text" ? "text" : "choice";
        const opts = type === "choice" ? optionsFor(p) : [];
        const sentAt = norm(p?.sentAt ?? p?.sent_at);
        if (!sentAt) continue; // rādam navigācijā tikai nosūtītās aptaujas
        const audience = String(p?.audience || "all") === "selected" ? "selected" : "all";
        const targets = Array.isArray(p?.targets) ? p.targets.map((x) => norm(x)).filter(Boolean) : [];
        if (audience === "selected") {
          // actor var būt UUID vai e-pasts; atbalstām abus.
          const ok = targets.includes(actor) || (actorEmail && targets.includes(actorEmail));
          if (!ok) continue;
        }
        if (!hasUsableQuestion(p)) continue;
        if (type === "choice" && opts.length < 2) continue;
        if (isAnswered(p)) continue;
        found.push({
          eventId,
          date,
          title,
          pollId: pid,
          pollTitle: norm(p?.pollTitle ?? p?.poll_title ?? ""),
          pollDate: norm(p?.pollDate ?? p?.poll_date ?? ""),
          question: norm(p?.question),
          type,
        });
      }
    }
    if (!found.length) return null;
    return { count: found.length, first: found[0], preview: found.slice(0, 2) };
  }

  function createAppShellWithNav(html) {
    function backArrowSvg() {
      return html`
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M9 15 3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"></path>
        </svg>
      `;
    }

    return function AppShellWithNav({
      view,
      onChangeView,
      promSub,
      onPromSubChange,
      showPromDeputyTab,
      showPendingCitsBadge,
      showPddAppChangesBadge,
      canGoBack,
      onGoBack,
      onPinCurrentSection,
      isCurrentSectionPinned,
      pinnedSections,
      onOpenPinnedSection,
      onUnpinSection,
      header,
      children,
    }) {
      ensureNavigacijaExtraStyles();
      const pendingPoll = pddFindPendingSaliedesanaPoll();

      const darbaUzdevumiNavOpen = view === "darbaUzdevumiIad";
      const vestureAccordionOpen =
        Boolean(showPddAppChangesBadge) ||
        view === "aktualitatesHistory" ||
        view === "pddAppChanges" ||
        (view === "prombutnes" && promSub === "changes");
      const showBack = Boolean(canGoBack && typeof onGoBack === "function");

      return html`
        <div class="app-layout">
          <aside class="app-nav" aria-label="Galvenā navigācija">
            <div class="app-nav-inner">
              ${showBack
                ? html`
                    <button
                      type="button"
                      class="pdd-nav-back-btn"
                      aria-label="Atpakaļ"
                      title="Atpakaļ"
                      onClick=${() => onGoBack()}
                    >
                      ${backArrowSvg()}
                      <span>Atpakaļ</span>
                    </button>
                  `
                : null}
              <div class="app-nav-top-row">
                <p class="app-nav-title">Navigācija</p>
                <button
                  type="button"
                  class="pdd-nav-pin-btn"
                  aria-label=${isCurrentSectionPinned ? "Sadaļa jau ir piesprausta" : "Piespraust aktīvo sadaļu"}
                  disabled=${typeof onPinCurrentSection !== "function" || Boolean(isCurrentSectionPinned)}
                  onClick=${() => onPinCurrentSection && onPinCurrentSection()}
                  title=${isCurrentSectionPinned ? "Šī sadaļa jau ir piesprausta" : "Piespraust aktīvo sadaļu"}
                >
                  📌
                </button>
              </div>
              <div>
                <button
                  type="button"
                  class=${`app-nav-link ${view === "home" ? "active" : ""}`}
                  onClick=${() => onChangeView("home")}
                >
                  Sākums
                </button>
                <div class="app-nav-sub" role="group" aria-label="Sākuma apakšsadaļas">
                  <button
                    type="button"
                    class="app-nav-sublink"
                    onClick=${() => {
                      onChangeView("home");
                      scrollToHomeAktualitates();
                    }}
                  >
                    Aktualitātes
                  </button>
                </div>
              </div>
              <div>
                <button
                  type="button"
                  class=${`app-nav-link ${view === "prombutnes" ? "active" : ""}`}
                  onClick=${() => onChangeView("prombutnes")}
                >
                  Prombūtnes
                </button>
                <div class="app-nav-sub" role="group" aria-label="Prombūtnes apakšsadaļas">
                  <button
                    type="button"
                    class=${`app-nav-sublink ${view === "prombutnes" && promSub === "calendar" ? "active" : ""}`}
                    onClick=${() => onPromSubChange("calendar")}
                  >
                    Kalendārs
                  </button>
                  <button
                    type="button"
                    class=${`app-nav-sublink ${view === "prombutnes" && promSub === "request" ? "active" : ""}`}
                    onClick=${() => onPromSubChange("request")}
                  >
                    Prombūtnes pieteikums
                  </button>
                  <button
                    type="button"
                    class=${`app-nav-sublink ${view === "prombutnes" && promSub === "history" ? "active" : ""}`}
                    onClick=${() => onPromSubChange("history")}
                  >
                    Prombūtnes vēsture
                    ${showPendingCitsBadge
                      ? html`<span class="app-nav-badge-cits" title="Gaida apstiprinājumu">Gaida apstiprinājumu</span>`
                      : null}
                  </button>
                  <button
                    type="button"
                    class=${`app-nav-sublink ${view === "prombutnes" && promSub === "atvalinajumi" ? "active" : ""}`}
                    onClick=${() => onPromSubChange("atvalinajumi")}
                  >
                    Atvaļinājumu grafiks
                  </button>
                  ${showPromDeputyTab
                    ? html`
                        <button
                          type="button"
                          class=${`app-nav-sublink ${view === "prombutnes" && promSub === "deputy" ? "active" : ""}`}
                          onClick=${() => onPromSubChange("deputy")}
                        >
                          Apstiprinātāja maiņa
                        </button>
                      `
                    : null}
                </div>
              </div>
              <button
                type="button"
                class=${`app-nav-link ${view === "team" ? "active" : ""}`}
                onClick=${() => {
                  onChangeView("team");
                }}
              >
                Komanda
              </button>
              <details class="app-nav-accordion" open=${darbaUzdevumiNavOpen}>
                <summary class=${`app-nav-link app-nav-accordion-summary ${view === "darbaUzdevumiIad" ? "active" : ""}`}>Darba uzdevumi</summary>
                <div class="app-nav-sub" role="group" aria-label="Darba uzdevumu apakšsadaļas">
                  <button
                    type="button"
                    class=${`app-nav-sublink ${view === "darbaUzdevumiIad" ? "active" : ""}`}
                    onClick=${() => onChangeView("darbaUzdevumiIad")}
                  >
                    IAD ieteikumi
                  </button>
                </div>
              </details>
              <button
                type="button"
                class=${`app-nav-link ${view === "saliedesana" ? "active" : ""}`}
                onClick=${() => onChangeView("saliedesana")}
              >
                Saliedēšanas pasākumi, svētku dienas u.c.
              </button>
              <details class="app-nav-vesture-details" open=${vestureAccordionOpen}>
                <summary class="app-nav-link app-nav-vesture-summary">Vēsture</summary>
                <div class="app-nav-sub" role="group" aria-label="Vēstures apakšsadaļas">
                  <button
                    type="button"
                    class=${`app-nav-sublink ${view === "prombutnes" && promSub === "changes" ? "active" : ""}`}
                    onClick=${() => {
                      onChangeView("prombutnes");
                      onPromSubChange("changes");
                    }}
                  >
                    Auditācijas vēsture
                  </button>
                  <button
                    type="button"
                    class=${`app-nav-sublink ${view === "aktualitatesHistory" ? "active" : ""}`}
                    onClick=${() => onChangeView("aktualitatesHistory")}
                  >
                    Aktualitāšu vēsture
                  </button>
                  <button
                    type="button"
                    class=${`app-nav-sublink ${view === "pddAppChanges" ? "active" : ""}`}
                    onClick=${() => onChangeView("pddAppChanges")}
                  >
                    Izmaiņas PDD aplikācijā
                    ${showPddAppChangesBadge ? html`<span class="app-nav-badge-new">NEW</span>` : null}
                  </button>
                </div>
              </details>
              ${pendingPoll
                ? html`
                    <section class="pdd-nav-poll-alert" aria-label="Neaizpildīta aptauja">
                      <p class="pdd-nav-poll-alert-title">
                        <span>📊 Neaizpildīta aptauja</span>
                        <span class="pdd-nav-poll-alert-badge" title="Neaizpildīto aptauju skaits">${Number(pendingPoll.count || 0) || 1}</span>
                      </p>
                      <p class="pdd-nav-poll-alert-sub">
                        ${Array.isArray(pendingPoll.preview) && pendingPoll.preview.length
                          ? pendingPoll.preview.map(
                              (x) => html`<span key=${`${x.eventId}-${x.pollId}`}>
                                <strong>${x.title}</strong>
                                <br />
                                <span>${x.pollTitle || x.question || "Aptauja"}</span>${x.pollDate ? html` · ${pddFormatPollDateLv(x.pollDate)}` : null}
                                <br />
                                ${x.pollTitle && x.question ? html`<span style=${{ color: "var(--muted)", fontSize: "0.92em" }}>${x.question}</span><br />` : null}
                                <span style=${{ color: "var(--muted)" }}>${x.date || ""}</span>
                                <br />
                              </span>`
                            )
                          : html`<span>
                              <strong>${pendingPoll.first?.title || "Pasākums"}</strong>
                              <br />
                              <span>${pendingPoll.first?.pollTitle || pendingPoll.first?.question || "Aptauja"}</span>${pendingPoll.first?.pollDate
                                ? html` · ${pddFormatPollDateLv(pendingPoll.first.pollDate)}`
                                : null}
                              <br />
                              ${pendingPoll.first?.pollTitle && pendingPoll.first?.question
                                ? html`<span style=${{ color: "var(--muted)", fontSize: "0.92em" }}>${pendingPoll.first.question}</span><br />`
                                : null}
                              <span style=${{ color: "var(--muted)" }}>${pendingPoll.first?.date || ""}</span>
                            </span>`}
                      </p>
                      <div class="pdd-nav-poll-alert-actions">
                        <button
                          type="button"
                          class="btn btn-primary btn-small"
                          onClick=${() => {
                            try {
                              const f = pendingPoll.first || pendingPoll;
                              globalThis.__PDD_SALIEDESANA_PENDING_OPEN_EVENT_ID__ = String(f.eventId || "");
                              globalThis.__PDD_SALIEDESANA_PENDING_OPEN_EVENT_DATE__ = String(f.date || "");
                              globalThis.__PDD_SALIEDESANA_PENDING_OPEN_EVENT_TITLE__ = String(f.title || "");
                              globalThis.__PDD_SALIEDESANA_PENDING_OPEN_EVENT_OPEN_POLL_FILL__ = "1";
                            } catch {
                              // ignore
                            }
                            onChangeView("saliedesana");
                          }}
                        >
                          Aizpildīt
                        </button>
                        <button
                          type="button"
                          class="btn btn-ghost btn-small"
                          onClick=${() => {
                            try {
                              const f = pendingPoll.first || pendingPoll;
                              globalThis.__PDD_SALIEDESANA_PENDING_POLL_ACTION__ = {
                                action: "decline",
                                eventId: String(f.eventId || ""),
                                pollId: String(f.pollId || ""),
                              };
                            } catch {
                              // ignore
                            }
                            onChangeView("saliedesana");
                          }}
                        >
                          Atteikties
                        </button>
                      </div>
                    </section>
                  `
                : null}
            </div>
          </aside>
          <div class="app-main">
            ${header}
            ${children}
            ${Array.isArray(pinnedSections) && pinnedSections.length
              ? html`
                  <section class="pdd-pinned-bar" aria-label="Piespraustās sadaļas">
                    <p class="pdd-pinned-title">Atvērtās sadaļas</p>
                    <div class="pdd-pinned-list">
                      ${pinnedSections.map((item) => {
                        const key = String(item?.key ?? "");
                        const label = String(item?.label ?? "Sadaļa");
                        const isActive = view === item?.view && (item?.view !== "prombutnes" || promSub === item?.promSub);
                        return html`
                          <span class=${`pdd-pinned-item ${isActive ? "is-active" : ""}`} key=${key}>
                            <button
                              type="button"
                              class="pdd-pinned-open-btn"
                              onClick=${() => onOpenPinnedSection && onOpenPinnedSection(item)}
                            >
                              ${label}
                            </button>
                            <button
                              type="button"
                              class="pdd-pinned-close-btn"
                              title="Noņemt piespraudi"
                              onClick=${() => onUnpinSection && onUnpinSection(key)}
                            >
                              ✕
                            </button>
                          </span>
                        `;
                      })}
                    </div>
                  </section>
                `
              : null}
          </div>
        </div>
      `;
    };
  }

  globalThis.PDD_NAV = { createAppShellWithNav };
})();
