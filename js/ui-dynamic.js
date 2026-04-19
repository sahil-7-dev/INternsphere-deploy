// js/ui-dynamic.js

(function () {
  "use strict";

  const ARRIVAL_FLAG_KEY = "is.logoArrivalAnim";

  // sticky nav collapse
  function initCollapsingHeader() {
    const header = document.querySelector(
      ".nav, .topbar, header.nav, header.topbar",
    );
    if (!header) return;

    const cs = window.getComputedStyle(header);
    if (cs.position !== "sticky" && cs.position !== "fixed") {
      header.style.position = "sticky";
      header.style.top = "0";
      header.style.zIndex = "9999";
    }

    header.classList.remove("is-compact");
    document.documentElement.style.setProperty(
      "--nav-height",
      header.offsetHeight + "px",
    );
    window.addEventListener("resize", () => {
      document.documentElement.style.setProperty(
        "--nav-height",
        header.offsetHeight + "px",
      );
    });
    return;

    const setNavHeight = () => {
      document.documentElement.style.setProperty(
        "--nav-height",
        header.offsetHeight + "px",
      );
    };
    setNavHeight();
    window.addEventListener("resize", setNavHeight);

    const EDGE_TOP = 8;
    const BUFFER = 10;
    let lastY = window.scrollY || 0;
    let lastDir = 0;
    let ticking = false;
    let isCompact = false;

    const applyState = (compact) => {
      if (compact === isCompact) return;
      isCompact = compact;
      header.classList.toggle("is-compact", compact);
      setNavHeight();
    };

    const update = () => {
      const y = Math.max(0, window.scrollY || 0);
      const dy = y - lastY;

      if (y <= EDGE_TOP) {
        applyState(false);
      } else if (Math.abs(dy) >= BUFFER) {
        if (dy > 0) {
          applyState(true);
          lastDir = 1;
        } else {
          applyState(false);
          lastDir = -1;
        }
        lastY = y;
      }

      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(update);
        ticking = true;
      }
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  // dynamic logo animation
  function initDynamicLogos() {
    try {
      const pending = sessionStorage.getItem(ARRIVAL_FLAG_KEY);
      if (pending) {
        sessionStorage.removeItem(ARRIVAL_FLAG_KEY);
        document.querySelectorAll(".brand-logo").forEach((logo) => {
          logo.classList.remove("logo-animate");
          void logo.offsetWidth;
          logo.classList.add("logo-arrive");
          logo.addEventListener(
            "animationend",
            () => logo.classList.remove("logo-arrive"),
            { once: true },
          );
        });
      }
    } catch (e) {
    }

    const wireLogo = (el) => {
      if (!el || el.__logoWired) return;
      el.__logoWired = true;

      el.addEventListener("click", (evt) => {
        const anchor =
          el.closest("a.brand, a[data-logo-has-text], a.logo, a[href]") ||
          el.closest("a");
        const logoImg =
          el.tagName === "IMG" ? el : el.querySelector(".brand-logo, img");

        let navigatesAway = false;
        if (anchor) {
          const href = anchor.getAttribute("href") || "";
          if (href && href !== "#" && !href.startsWith("#")) {
            try {
              const url = new URL(href, window.location.href);
              const samePath =
                url.pathname === window.location.pathname &&
                url.host === window.location.host;
              navigatesAway = !samePath;
            } catch {
              navigatesAway = true;
            }
          }
        }

        if (navigatesAway) {
          try {
            sessionStorage.setItem(ARRIVAL_FLAG_KEY, "1");
          } catch {}
        } else {
          evt.preventDefault?.();
          if (logoImg) {
            logoImg.classList.remove("logo-arrive");
            void logoImg.offsetWidth;
            logoImg.classList.add("logo-animate");
            logoImg.addEventListener(
              "animationend",
              () => logoImg.classList.remove("logo-animate"),
              { once: true },
            );
          }
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      });
    };

    document
      .querySelectorAll("a.brand, .brand, .brand-logo")
      .forEach(wireLogo);
  }

  // image lightbox
  function ensureLightbox() {
    let lb = document.getElementById("is-lightbox");
    if (lb) return lb;

    lb = document.createElement("div");
    lb.id = "is-lightbox";
    lb.className = "is-lightbox";
    lb.setAttribute("role", "dialog");
    lb.setAttribute("aria-modal", "true");
    lb.setAttribute("aria-label", "Image preview");
    lb.innerHTML =
      '<button type="button" class="is-lightbox-close" aria-label="Close preview">✕</button>' +
      '<img class="is-lightbox-img" alt="" />';
    document.body.appendChild(lb);

    lb.addEventListener("click", (e) => {
      if (
        e.target === lb ||
        e.target.classList.contains("is-lightbox-close")
      ) {
        closeLightbox();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (
        e.key === "Escape" &&
        lb.classList.contains("is-open")
      ) {
        closeLightbox();
      }
    });
    return lb;
  }

  function openLightbox(src, alt) {
    if (!src) return;
    const lb = ensureLightbox();
    const img = lb.querySelector(".is-lightbox-img");
    img.src = src;
    img.alt = alt || "";
    lb.classList.remove("is-open");
    void lb.offsetWidth;
    lb.classList.add("is-open");
    document.body.style.overflow = "hidden";
  }

  function closeLightbox() {
    const lb = document.getElementById("is-lightbox");
    if (!lb) return;
    lb.classList.remove("is-open");
    document.body.style.overflow = "";
  }

  window.InternSphereLightbox = { open: openLightbox, close: closeLightbox };

  // boot
  function init() {
    initCollapsingHeader();
    initDynamicLogos();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
