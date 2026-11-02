// js/scroll-init.js
(function () {
  if (typeof Lenis === "undefined") return;

  var body = document.body || document.documentElement;
  var duration = parseFloat(body.getAttribute("data-lenis-duration"));
  if (!isFinite(duration) || duration <= 0) duration = 2;

  var lenis = new Lenis({
    duration: duration,
    easing: function (t) { return 1 - Math.pow(1 - t, 4); },
    smooth: true,
    smoothTouch: true,
    touchMultiplier: duration < 2 ? 1.6 : 2,
    infinite: false,
  });
  window.lenis = lenis;

  // Lenis only needs frames while a smooth scroll is animating. Instead of a
  // rAF loop that runs forever (waking the main thread 60-120x/s on idle
  // pages), run it while Lenis is busy and park it after a short idle
  // period. Wheel/touch input and programmatic scrollTo() wake it again.
  //
  // Lenis derives its step from the delta between raf(time) calls, so we
  // feed it a clock that never jumps across the parked gap (otherwise the
  // first frame after waking would finish the whole animation at once).
  var IDLE_FRAMES = 20;
  var running = false;
  var idle = 0;
  var lastNow = 0;
  var clock = 0;
  var canPark = !!(lenis.animate && "isRunning" in lenis.animate);

  function busy() {
    return lenis.isScrolling || lenis.animate.isRunning;
  }

  function raf(now) {
    var dt = lastNow ? Math.min(now - lastNow, 100) : 16;
    lastNow = now;
    clock += dt;
    lenis.raf(clock);

    if (canPark) {
      if (busy()) idle = 0;
      else if (++idle > IDLE_FRAMES) {
        running = false;
        lastNow = 0;
        return;
      }
    }
    requestAnimationFrame(raf);
  }

  function wake() {
    idle = 0;
    if (running) return;
    running = true;
    requestAnimationFrame(raf);
  }

  var opts = { passive: true };
  window.addEventListener("wheel", wake, opts);
  window.addEventListener("touchstart", wake, opts);
  window.addEventListener("touchmove", wake, opts);
  window.addEventListener("scroll", wake, opts);

  var origScrollTo = lenis.scrollTo;
  if (typeof origScrollTo === "function") {
    lenis.scrollTo = function () {
      var r = origScrollTo.apply(lenis, arguments);
      wake();
      return r;
    };
  }

  wake();
})();
