// Two TARS-related ambient effects, shared across dashboard / dashboard-company
// / internship-detailss:
//
//   1) The lightning gradient bar above each .tars-chat-header pulses on a
//      random 30–45s interval (subtle but noticeable).
//
//   2) While TARS is generating a reply (i.e. a typing indicator is live in
//      the chat thread), the InternSphere brand logo softly pulses. The glow
//      stops as soon as the typing indicator is replaced by the real reply.

(function () {
  const PULSE_CLASS = "tars-pulse-now";
  const BRAND_PULSE = "brand-pulse-active";
  const MIN_DELAY   = 30_000;
  const MAX_DELAY   = 45_000;
  const PULSE_DURATION = 1700;

  // ---------- (1) random ambient pulse on the lightning bar ----------

  function getHeaders() {
    return Array.from(document.querySelectorAll(".tars-chat-header, .qa-header"));
  }

  function pulseHeaders() {
    const headers = getHeaders();
    if (!headers.length) return;
    headers.forEach((h) => {
      h.classList.remove(PULSE_CLASS);
      // Force a reflow so the animation can replay if it just ran.
      void h.offsetWidth;
      h.classList.add(PULSE_CLASS);
      setTimeout(() => h.classList.remove(PULSE_CLASS), PULSE_DURATION + 50);
    });
  }

  function nextDelay() {
    return MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY);
  }

  function scheduleNext() {
    setTimeout(() => {
      // Skip if the tab is hidden — no point burning frames on an unseen pulse.
      if (!document.hidden) pulseHeaders();
      scheduleNext();
    }, nextDelay());
  }

  // ---------- (2) brand logo glow during TARS response ----------

  function getBrandLogos() {
    return Array.from(document.querySelectorAll(
      ".brand-logo, .brand img, .brand-word img"
    ));
  }

  function setBrandPulse(active) {
    getBrandLogos().forEach((el) => el.classList.toggle(BRAND_PULSE, active));
  }

  function threadHasTyping(thread) {
    return !!thread.querySelector(".tars-chat-msg-typing");
  }

  function watchThread(thread) {
    if (!thread || thread.dataset.brandPulseWired === "1") return;
    thread.dataset.brandPulseWired = "1";

    const obs = new MutationObserver(() => {
      const anyTyping = document
        .querySelectorAll(".tars-chat-msg-typing").length > 0;
      setBrandPulse(anyTyping);
    });
    obs.observe(thread, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  }

  function wireThreads() {
    [
      "tarsChatThread",     // dashboard.html
      "coTarsChatThread",   // dashboard-company.html
      "qaThread",           // internship-detailss.html
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el) watchThread(el);
    });
  }

  function init() {
    wireThreads();
    scheduleNext();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
