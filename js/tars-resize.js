// Vertical drag-to-resize for the TARS chat card.
// Loaded on dashboard.html, dashboard-company.html, internship-detailss.html.
// Not loaded on virtualworkroom.html (the workroom AI panel uses a different layout).

(function () {
  const MIN_H = 360;
  const VIEWPORT_PADDING = 40;

  function maxH() { return Math.max(MIN_H, window.innerHeight - VIEWPORT_PADDING); }
  function clamp(h) { return Math.max(MIN_H, Math.min(maxH(), h)); }

  function applyHeight(card, h) {
    card.style.height = clamp(h) + "px";
  }

  function attach(card) {
    if (card.dataset.resizeWired === "1") return;
    card.dataset.resizeWired = "1";

    const handle = document.createElement("div");
    handle.className = "tars-chat-resize-handle";
    handle.setAttribute("aria-hidden", "true");
    handle.title = "Drag to resize";
    card.prepend(handle);

    let dragging = false;
    let startY = 0;
    let startH = 0;
    let activePointerId = null;

    function onDown(e) {
      dragging = true;
      startY = e.clientY;
      startH = card.getBoundingClientRect().height;
      activePointerId = e.pointerId;
      try { handle.setPointerCapture(e.pointerId); } catch (_) {}
      document.body.classList.add("tars-resizing");
      e.preventDefault();
    }
    function onMove(e) {
      if (!dragging) return;
      const newH = startH + (startY - e.clientY);
      applyHeight(card, newH);
    }
    function onUp(e) {
      if (!dragging) return;
      dragging = false;
      try { handle.releasePointerCapture(activePointerId); } catch (_) {}
      activePointerId = null;
      document.body.classList.remove("tars-resizing");
    }

    handle.addEventListener("pointerdown", onDown);
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  }

  function init() {
    document.querySelectorAll(
      ".tars-chat-modal .tars-chat-card, .qa-modal .qa-card"
    ).forEach(attach);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.addEventListener("resize", () => {
    document.querySelectorAll(
      ".tars-chat-modal .tars-chat-card, .qa-modal .qa-card"
    ).forEach((card) => {
      const cur = parseInt(card.style.height, 10);
      if (cur) applyHeight(card, cur);
    });
  });
})();
