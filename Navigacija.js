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
      }
      .app-nav-vesture-summary::-webkit-details-marker {
        display: none;
      }
      .app-nav-vesture-details .app-nav-sub {
        margin-top: 0.2rem;
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
      const historyNavOpen =
        view === "prombutnes" || view === "home" || view === "aktualitatesHistory" || view === "team";
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
              ${historyNavOpen
                ? html`
                    <details class="app-nav-vesture-details">
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
                      </div>
                    </details>
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
