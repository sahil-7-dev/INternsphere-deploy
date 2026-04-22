// js/modal-scroll-lock.js

(function () {
  const MODAL_SELECTORS = [
    ".modal",
    ".modal-backdrop",
    ".completion-modal",
    ".admin-modal",
    ".cp-modal",
    ".profile-modal",
    ".onboarding-modal",
    ".submissions-modal",
    ".tars-chat-modal",
    ".sl-modal",
    ".guest-modal-backdrop",
    "#settingsModal",
    "[role='dialog']:not([hidden])",
  ];
  const COMBINED = MODAL_SELECTORS.join(",");

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    if (el.hidden) return false;
    if (el.classList.contains("hidden")) return false;
    const s = getComputedStyle(el);
    if (s.display === "none") return false;
    if (s.visibility === "hidden") return false;
    if (parseFloat(s.opacity) === 0) return false;
    return true;
  }

  let rafPending = false;
  function scheduleCheck() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      applyLock();
    });
  }

  function stampLenisPrevent(modal) {
    modal.setAttribute("data-lenis-prevent", "");

    const inners = modal.querySelectorAll([
      ".modal-content", ".modal-box", ".completion-card",
      ".admin-modal__card", ".cp-card", ".profile-card",
      ".onboarding-modal .onb-card", ".tars-chat-card",
      ".modal-card", ".settings-body", ".sl-modal-card",
      ".guest-modal", ".ghost-modal",
      ".modal-scroll",
      '[style*="overflow-y:auto"]', '[style*="overflow-y: auto"]',
      '[style*="overflow:auto"]',   '[style*="overflow: auto"]',
    ].join(","));
    inners.forEach((el) => el.setAttribute("data-lenis-prevent", ""));
  }

  function applyLock() {
    const modals = Array.from(document.querySelectorAll(COMBINED));
    let anyOpen = false;
    for (const m of modals) {
      if (!m.hasAttribute("data-lenis-prevent")) stampLenisPrevent(m);
      if (isVisible(m)) anyOpen = true;
    }
    document.body.classList.toggle("modal-open", anyOpen);
    document.documentElement.classList.toggle("modal-open", anyOpen);

    if (window.lenis) {
      if (anyOpen) window.lenis.stop();
      else         window.lenis.start();
    }
  }

  const observer = new MutationObserver(scheduleCheck);
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ["class", "hidden", "style"],
    subtree: true,
    childList: true,
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyLock);
  } else {
    applyLock();
  }
})();
