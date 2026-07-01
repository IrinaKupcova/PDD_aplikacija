/**
 * Procesu vadība — pieslēgums PDD navigācijai (tikai jauns, neaiztiek citus moduļus).
 * Pievieno navigācijas pogu un reģistrē skatu index.html aplikācijā.
 */
(function () {
  const VIEW_ID = "procesuVadiba";

  function injectNavLink() {
    if (typeof document === "undefined") return false;
    const nav = document.querySelector(".app-nav-inner");
    if (!nav || document.getElementById("pdd-nav-procesu-vadiba")) return false;

    const wrap = document.createElement("div");
    wrap.id = "pdd-nav-procesu-vadiba-wrap";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "pdd-nav-procesu-vadiba";
    btn.className = "app-nav-link";
    btn.textContent = "Procesu vadība";
    btn.title = "Procesu vadības sistēma — uzdevumi, tabulas, Gantt";
    btn.addEventListener("click", () => {
      if (typeof globalThis.__PDD_CHANGE_VIEW__ === "function") {
        globalThis.__PDD_CHANGE_VIEW__(VIEW_ID);
        return;
      }
      window.location.href = "./procesu-vadiba.html";
    });

    wrap.appendChild(btn);

    const salied = nav.querySelector('.app-nav-link[class*="saliedesana"]')?.closest("div");
    const teamBtn = [...nav.querySelectorAll(".app-nav-link")].find((b) => /komanda/i.test(b.textContent || ""));
    if (teamBtn?.parentElement) {
      teamBtn.parentElement.insertAdjacentElement("afterend", wrap);
    } else if (salied) {
      nav.insertBefore(wrap, salied);
    } else {
      nav.appendChild(wrap);
    }
    return true;
  }

  function highlightNav(view) {
    const btn = document.getElementById("pdd-nav-procesu-vadiba");
    if (!btn) return;
    btn.classList.toggle("active", view === VIEW_ID);
  }

  function tryInject() {
    if (injectNavLink()) return;
    requestAnimationFrame(tryInject);
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", tryInject, { once: true });
    } else {
      tryInject();
    }
  }

  globalThis.PDD_PROCESU_VADIBA_INTEGRACIJA = {
    VIEW_ID,
    highlightNav,
    getPanel(html, React) {
      return globalThis.PDD_PROCESU_VADIBA?.createProcesuVadibaModule?.(html, React) || null;
    },
  };
})();
