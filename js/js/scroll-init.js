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

  function raf(time) {
    lenis.raf(time);
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);
})();
