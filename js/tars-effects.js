// TARS ambient effect: the lightning gradient bar above each
// .tars-chat-header pulses on a random 30–45s interval (subtle but noticeable).

(function () {
  const PULSE_CLASS = "tars-pulse-now";
  const MIN_DELAY   = 30_000;
  const MAX_DELAY   = 45_000;
  const PULSE_DURATION = 1700;

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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleNext);
  } else {
    scheduleNext();
  }
})();
