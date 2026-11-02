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
  // Same list without the :not([hidden]) filter, used to decide whether a
  // mutation can affect a modal at all (a dialog that just became hidden no
  // longer matches COMBINED but still needs a re-check).
  const RELEVANT = MODAL_SELECTORS
    .map((s) => s.replace(":not([hidden])", ""))
    .join(",");

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

  // True when `node` is a modal or contains one. Cheap for the common case
  // (a leaf element whose class/style changes during an animation).
  function touchesModal(node) {
    if (!node || node.nodeType !== 1) return false;
    try {
      if (node.matches(RELEVANT)) return true;
      return node.firstElementChild !== null && node.querySelector(RELEVANT) !== null;
    } catch (_) {
      return false;
    }
  }

  // The observer watches the whole body, so it sees every class/style write
  // on the page (animations, hovers, typing effects...). Previously each one
  // queued a full applyLock() (querySelectorAll + getComputedStyle per
  // modal). Now only mutations that involve a modal schedule a check.
  function onMutations(records) {
    if (rafPending) return;
    for (const r of records) {
      if (r.type === "attributes") {
        if (touchesModal(r.target)) { scheduleCheck(); return; }
        continue;
      }
      for (const n of r.addedNodes) {
        if (touchesModal(n)) { scheduleCheck(); return; }
      }
      for (const n of r.removedNodes) {
        if (touchesModal(n)) { scheduleCheck(); return; }
      }
    }
  }

  // Modals that fade in/out via CSS transitions/animations finish changing
  // opacity after the triggering mutation, so re-check when they settle.
  function onSettle(e) {
    if (touchesModal(e.target)) scheduleCheck();
  }

  function observe() {
    const observer = new MutationObserver(onMutations);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class", "hidden", "style"],
      subtree: true,
      childList: true,
    });
  }
  document.addEventListener("transitionend", onSettle, true);
  document.addEventListener("animationend", onSettle, true);

  // document.body is null if this script is ever included from <head>.
  if (document.body) observe();
  else document.addEventListener("DOMContentLoaded", observe);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyLock);
  } else {
    applyLock();
  }
})();
