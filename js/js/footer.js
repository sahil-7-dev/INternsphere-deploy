// js/footer.js

(function () {
  "use strict";

  const APP_VERSION = "v1.0";

  // full footer
  const FULL_FOOTER_HTML = `
    <div class="container footer-grid">
      <div class="footer-brand-col">
        <div class="foot-brand">
          <img class="brand-logo sm" src="assets/images/Internsphere logo.png" alt="InternSphere logo" />
          <b>InternSphere</b>
        </div>
        <p class="foot-tag">Virtual internship platform connecting students and companies.</p>
      </div>

      <div>
        <h4>Product</h4>
        <a href="Index.html#features">Features</a>
        <a href="Index.html#how">How it works</a>
        <a href="login.html">Sign in</a>
      </div>

      <div>
        <h4>Company</h4>
        <a href="mailto:InternSphere7@gmail.com?subject=InternSphere%20%E2%80%94%20Contact">Contact</a>
        <a href="mailto:InternSphere7@gmail.com?subject=InternSphere%20%E2%80%94%20Support">Support</a>
      </div>

      <div>
        <h4>Legal</h4>
        <a href="#">Privacy</a>
        <a href="#">Terms</a>
      </div>
    </div>

    <div class="container footer-bottom">
      <span class="foot-copy">© 2026 InternSphere. All rights reserved.</span>
      <div class="foot-socials">
        <a href="#" aria-label="LinkedIn" title="LinkedIn">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4.98 3.5C4.98 4.88 3.87 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5zM.22 8h4.56v14H.22V8zm7.44 0h4.37v1.92h.06c.61-1.15 2.09-2.36 4.3-2.36 4.6 0 5.45 3.03 5.45 6.96V22h-4.56v-6.14c0-1.47-.03-3.36-2.05-3.36-2.05 0-2.36 1.6-2.36 3.25V22H7.66V8z"/></svg>
        </a>
        <a href="#" aria-label="X / Twitter" title="X / Twitter">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.9 3H22l-7.4 8.46L23 21h-6.84l-5.36-7.02L4.7 21H1.6l7.92-9.06L1 3h7l4.84 6.4L18.9 3zm-2.4 16h1.9L7.6 5H5.6l10.9 14z"/></svg>
        </a>
        <a href="#" aria-label="GitHub" title="GitHub">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5a12 12 0 00-3.8 23.4c.6.1.8-.27.8-.6v-2.1c-3.34.73-4.04-1.6-4.04-1.6-.55-1.4-1.35-1.78-1.35-1.78-1.1-.76.08-.74.08-.74 1.22.08 1.86 1.25 1.86 1.25 1.08 1.86 2.84 1.33 3.54 1.02.1-.78.42-1.33.77-1.64-2.67-.3-5.47-1.33-5.47-5.93 0-1.3.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.17 0 0 1-.32 3.3 1.23a11.4 11.4 0 016 0c2.3-1.55 3.3-1.23 3.3-1.23.66 1.65.25 2.87.12 3.17.77.84 1.24 1.92 1.24 3.22 0 4.61-2.8 5.62-5.48 5.92.43.37.82 1.1.82 2.22v3.3c0 .32.22.7.83.58A12 12 0 0012 .5z"/></svg>
        </a>
      </div>
    </div>
  `;

  // minimal footer
  const MINIMAL_FOOTER_HTML = `
    <div class="footer-mini-inner">
      <span class="footer-mini-copy">© 2026 InternSphere</span>
      <span class="footer-mini-sep" aria-hidden="true">·</span>
      <span class="footer-mini-ver">${APP_VERSION}</span>
      <span class="footer-mini-sep" aria-hidden="true">·</span>
      <a class="footer-mini-help" href="mailto:InternSphere7@gmail.com?subject=InternSphere%20%E2%80%94%20Help">Help</a>
    </div>
  `;

  function inject() {
    if (document.querySelector("footer.footer")) return;

    const mode = document.body?.dataset?.footer || "full";
    const footer = document.createElement("footer");

    if (mode === "none") return;
    if (mode === "minimal") {
      footer.className = "footer footer--minimal";
      footer.innerHTML = MINIMAL_FOOTER_HTML;
    } else {
      footer.className = "footer footer--injected";
      footer.innerHTML = FULL_FOOTER_HTML;
    }

    document.body.appendChild(footer);

    footer.querySelector("[data-back-to-top]")?.addEventListener("click", (e) => {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inject);
  } else {
    inject();
  }
})();
