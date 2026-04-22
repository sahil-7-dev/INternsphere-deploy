// js/internal-analytics.js
// Private dev-only cinematic module. Not imported by any HTML file.
// Loaded dynamically from dashboard.js ONLY when the signed-in user's
// SHA-256(uid) matches a hardcoded prefix. Everyone else never fetches this
// file. When active it plays the candle/skeleton intro, schedules ambient
// ghost + bat flybys, shows a welcome modal, and adds a horror vignette.

// Primary ghost mascot — used on the login cards and the greeting modal.
// Swap this single URL to restyle the headline mascot.
export const GHOST_ICON_URL = "https://img.icons8.com/?size=100&id=NyNfWKm6Qyue&format=png&color=000000";

// Variant pool for the flyby flocks — each ghost in a group picks one at
// random, so the flock looks less uniform / a little more spooky-chaotic.
// Browse styles at https://icons8.com/icons/set/ghost and paste more here.
const GHOST_VARIANTS = [
  GHOST_ICON_URL,
  "https://img.icons8.com/fluency/96/ghost.png",
  "https://img.icons8.com/color/96/ghost.png",
  "https://img.icons8.com/plasticine/100/ghost.png",
  "https://img.icons8.com/3d-fluency/94/ghost.png",
  "https://img.icons8.com/color-glass/96/ghost.png",
];

// Bats share the flyby — smaller, faster, darker. See
// https://icons8.com/icons/set/bat for alternates.
const BAT_VARIANTS = [
  "https://img.icons8.com/color/96/bat.png",
  "https://img.icons8.com/fluency/96/bat.png",
  "https://img.icons8.com/emoji/96/bat-emoji.png",
];

// Witch cackle plays when a flyby kicks off. Google's public sound library
// serves this directly. Autoplay policies require prior user interaction —
// ghost users got there via a button click on /login.html, but the navigation
// resets that gesture, so first-load audio may be silently denied on some
// browsers. The .catch() below swallows that failure.
const WITCH_LAUGH_URL = "https://actions.google.com/sounds/v1/cartoon/witch_cackle.ogg";

// ─── Cinematic intro assets ───
const GHOST_INTRO_ASSETS = {
  candle:     "assets/images/_cache/candle.png",
  skeleton:   "assets/images/_cache/skeleton.png",
  atmosphere: "assets/images/_cache/atmosphere.png",
  bat:        "assets/images/_cache/bat.png",    // single bat
  bats:       "assets/images/_cache/bats.png",   // pair/swarm bat image
};
// Bumped to v2 after rewriting the intro sequence — old flags don't block the
// new cinematic.
const GHOST_INTRO_SHOWN_KEY = "ghostIntroShown_v2";

// Inline SVG fallback for when the CDN is unreachable. Keeps the UI on-theme.
export const GHOST_ICON_FALLBACK =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
      '<defs><linearGradient id="g" x1="0" x2="0" y1="0" y2="1">' +
      '<stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e5e7ff"/>' +
      '</linearGradient></defs>' +
      '<path fill="url(#g)" stroke="#7c6bff" stroke-width="2" stroke-linejoin="round" ' +
      'd="M32 6c-11 0-20 9-20 20v26l6-5 5 5 5-5 5 5 5-5 5 5 5-5 4 5V26c0-11-9-20-20-20z"/>' +
      '<circle cx="24" cy="28" r="3" fill="#1f2027"/>' +
      '<circle cx="40" cy="28" r="3" fill="#1f2027"/>' +
      '<path d="M27 37q5 4 10 0" stroke="#1f2027" stroke-width="2" fill="none" stroke-linecap="round"/>' +
    '</svg>'
  );

const GREETING_SHOWN_KEY = "ghostGreetingShown";
const GREETING_DELAY_MS = 5000;
const GREETING_AUTO_DISMISS_MS = 20000;

function installGreetingModal() {
  document.body.classList.add("is-ghost");

  // Once per session — refreshing doesn't replay it.
  let shown = false;
  try { shown = sessionStorage.getItem(GREETING_SHOWN_KEY) === "1"; } catch {}
  if (shown) return;

  setTimeout(() => {
    if (document.getElementById("ghostGreetingModal")) return;
    try { sessionStorage.setItem(GREETING_SHOWN_KEY, "1"); } catch {}

    const backdrop = document.createElement("div");
    backdrop.id = "ghostGreetingModal";
    backdrop.className = "ghost-modal-backdrop";
    backdrop.innerHTML =
      '<div class="ghost-modal" role="dialog" aria-modal="true" aria-labelledby="ghostModalTitle">' +
        '<button type="button" class="ghost-modal__close" aria-label="Skip">×</button>' +
        '<img class="ghost-modal__icon" src="' + GHOST_ICON_URL + '" alt="" ' +
        'onerror="this.onerror=null;this.src=\'' + GHOST_ICON_FALLBACK + '\'">' +
        '<h2 id="ghostModalTitle" class="ghost-modal__title">Welcome back, Ghost 👻</h2>' +
        '<p class="ghost-modal__body">' +
          "The <b>night realm</b> welcomes you back. Watch your back, " +
          "don't feed the bats 🦇 — everything else is yours to roam. " +
          "Exit the chaos anytime." +
        '</p>' +
        '<div class="ghost-modal__actions">' +
          '<button type="button" class="ghost-modal__skip">Skip</button>' +
          '<a href="login.html" class="ghost-modal__cta">Sign up free →</a>' +
        '</div>' +
        '<div class="ghost-modal__timer" aria-hidden="true">' +
          '<div class="ghost-modal__timer-fill"></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(backdrop);

    let dismissed = false;
    const close = () => {
      if (dismissed) return;
      dismissed = true;
      backdrop.classList.add("is-closing");
      setTimeout(() => backdrop.remove(), 220);
    };

    backdrop.querySelector(".ghost-modal__close")?.addEventListener("click", close);
    backdrop.querySelector(".ghost-modal__skip")?.addEventListener("click", close);
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close();
    });
    document.addEventListener("keydown", function onEsc(e) {
      if (e.key === "Escape") {
        document.removeEventListener("keydown", onEsc);
        close();
      }
    });

    // kick off timer bar animation + auto-dismiss
    const fill = backdrop.querySelector(".ghost-modal__timer-fill");
    if (fill) {
      fill.style.transition = "transform " + GREETING_AUTO_DISMISS_MS + "ms linear";
      requestAnimationFrame(() => { fill.style.transform = "scaleX(0)"; });
    }
    setTimeout(close, GREETING_AUTO_DISMISS_MS);

    requestAnimationFrame(() => backdrop.classList.add("is-open"));
  }, GREETING_DELAY_MS);
}

// ─── Cinematic intro (student-only, one-shot per session) ───
// Dramatic sequence: ghost flies in carrying a lit candle, a skeleton rises
// from below and blows out the flame, full blackout, reveal the dashboard.
// Skippable at any point; session-scoped so it only plays on first entry.

function shouldPlayIntro() {
  try { return sessionStorage.getItem(GHOST_INTRO_SHOWN_KEY) !== "1"; }
  catch { return false; }
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Spawn a handful of bats inside the intro scene that fly on random paths,
// independently of the two candle-follow bats. Each bat is scoped to the
// #ghostIntroBats layer so the phase-blackout fade cleans them up too.
function spawnIntroBats(overlay) {
  const layer = overlay.querySelector(".ghost-intro__bat-layer");
  if (!layer) return;

  const variants = [GHOST_INTRO_ASSETS.bat, GHOST_INTRO_ASSETS.bats];
  const paths = ["ltr", "rtl", "wave", "diag-down", "diag-up"];
  const count = 4 + Math.floor(Math.random() * 2); // 4–5

  for (let i = 0; i < count; i++) {
    const bat = document.createElement("img");
    bat.className = "ghost-intro__bat-rand ghost-intro__bat-rand--" + paths[Math.floor(Math.random() * paths.length)];
    bat.src = variants[Math.floor(Math.random() * variants.length)];
    bat.alt = "";

    const top = 8 + Math.random() * 55;        // upper half of scene, avoid ground
    const size = 36 + Math.random() * 42;      // 36–78px
    const dur = 6 + Math.random() * 4;         // 6–10s crossing
    const delay = 0.4 + i * 0.7 + Math.random() * 0.6;
    const bob = 18 + Math.random() * 22;

    bat.style.top = top + "%";
    bat.style.width = size + "px";
    bat.style.animationDuration = dur + "s";
    bat.style.animationDelay = delay + "s";
    bat.style.setProperty("--ghost-bob", bob + "px");
    bat.addEventListener("animationend", () => bat.remove());

    layer.appendChild(bat);
  }
}

function playGhostIntro() {
  if (!shouldPlayIntro()) return Promise.resolve();
  try { sessionStorage.setItem(GHOST_INTRO_SHOWN_KEY, "1"); } catch {}

  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "ghost-intro";
    overlay.innerHTML =
      '<div class="ghost-intro__atmos"></div>' +
      '<div class="ghost-intro__stars"></div>' +
      '<div class="ghost-intro__mist"></div>' +
      '<div class="ghost-intro__scene">' +
        '<img class="ghost-intro__skeleton" src="' + GHOST_INTRO_ASSETS.skeleton + '" alt="">' +
        '<img class="ghost-intro__candle"   src="' + GHOST_INTRO_ASSETS.candle   + '" alt="">' +
        '<img class="ghost-intro__bat-follow ghost-intro__bat-follow--1" src="' + GHOST_INTRO_ASSETS.bat  + '" alt="">' +
        '<img class="ghost-intro__bat-follow ghost-intro__bat-follow--2" src="' + GHOST_INTRO_ASSETS.bats + '" alt="">' +
        '<div class="ghost-intro__bat-layer" aria-hidden="true"></div>' +
      '</div>' +
      '<div class="ghost-intro__blink" aria-hidden="true"></div>' +
      '<div class="ghost-intro__caption" id="ghostIntroCap"></div>' +
      '<div class="ghost-intro__hint" role="status" aria-live="polite">' +
        '<span class="ghost-intro__hint-dot" aria-hidden="true">⛶</span>' +
        '<span>For the best experience, switch to <b>fullscreen</b> (F11).</span>' +
      '</div>' +
      '<button type="button" class="ghost-intro__skip">Skip →</button>';
    document.body.appendChild(overlay);
    document.body.classList.add("ghost-intro-lock");

    const cap = overlay.querySelector("#ghostIntroCap");
    const candleEl = overlay.querySelector(".ghost-intro__candle");
    const setCap = (txt) => { if (cap) cap.textContent = txt; };

    let skipped = false;
    const finish = () => {
      overlay.classList.add("ghost-intro--closing");
      setTimeout(() => {
        overlay.remove();
        document.body.classList.remove("ghost-intro-lock");
        resolve();
      }, 700);
    };
    const skip = () => {
      if (skipped) return;
      skipped = true;
      finish();
    };
    overlay.querySelector(".ghost-intro__skip").addEventListener("click", skip);
    document.addEventListener("keydown", function onKey(e) {
      if (e.key === "Escape") {
        document.removeEventListener("keydown", onKey);
        skip();
      }
    });

    (async () => {
      // Phase 0: overlay fades in — room dims, candle still hidden off-screen
      await wait(40);
      overlay.classList.add("is-visible");
      setCap("The lights begin to dim…");

      // Phase 1: candle floats in from the left and settles center-stage;
      // launch random-path bats in the scene alongside the candle entry.
      await wait(600);
      if (skipped) return;
      overlay.classList.add("phase-enter");
      setCap("A candle drifts in…");
      spawnIntroBats(overlay);
      await wait(5100); // candle animation takes 5s
      if (skipped) return;

      // Phase 2: quick dark blink — one flash of pure black
      overlay.classList.add("phase-blink");
      setCap("");
      await wait(400);
      if (skipped) return;
      overlay.classList.remove("phase-blink");
      await wait(120);
      if (skipped) return;

      // Phase 3: skeleton pops in close to the candle
      overlay.classList.add("phase-skeleton");
      await wait(800);
      if (skipped) return;

      // Phase 4: skeleton leans in and blows — candle reacts
      overlay.classList.add("phase-swoosh");
      await wait(900);
      if (skipped) return;

      // Phase 5a: candle blown out — hide the candle instantly but keep the
      // skeleton and scene visible for a beat so the viewer registers the
      // moment of extinction.
      if (candleEl) candleEl.style.display = "none";
      await wait(260);
      if (skipped) return;

      // Phase 5b: instant hard cut to pitch black
      overlay.classList.add("phase-blackout");
      await wait(420);
      if (skipped) return;

      // Phase 6: reveal the dashboard
      overlay.classList.add("phase-reveal");
      await wait(600);
      if (skipped) return;
      finish();
    })();
  });
}

// ─── Horror flybys (student-only) ───
// Groups of ghosts + bats drift across the screen on random paths, backed by
// a pulsing dark vignette and a witch cackle. First flyby ~20s after mount,
// then every 45–55s. Gated to the student role — companies shouldn't get
// haunted on a business dashboard.
let witchAudio = null;
function prepareAudio() {
  if (witchAudio) return;
  try {
    witchAudio = new Audio(WITCH_LAUGH_URL);
    witchAudio.preload = "auto";
    witchAudio.volume = 0.35;
  } catch { witchAudio = null; }
}

function playWitchLaugh() {
  if (!witchAudio) return;
  try {
    witchAudio.currentTime = 0;
    const p = witchAudio.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch {}
}

function triggerHorrorOverlay(durationMs) {
  let overlay = document.getElementById("ghostHorrorOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "ghostHorrorOverlay";
    overlay.className = "ghost-horror-overlay";
    document.body.appendChild(overlay);
  }
  overlay.classList.add("is-active");
  setTimeout(() => overlay.classList.remove("is-active"), durationMs);
}

const PATH_CLASSES = [
  "ghost-fly--ltr",
  "ghost-fly--rtl",
  "ghost-fly--diag-down",
  "ghost-fly--diag-up",
  "ghost-fly--wave",
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function spawnCreature({ variants, baseClass, sizeRange, durationRange, bobRange, pathClass, delay }) {
  const img = document.createElement("img");
  const src = pick(variants);
  img.className = baseClass + " " + pathClass;
  img.setAttribute("aria-hidden", "true");
  img.src = src;
  img.addEventListener("error", function onErr() {
    img.removeEventListener("error", onErr);
    img.src = GHOST_ICON_FALLBACK;
  });

  const top  = 6 + Math.random() * 74;
  const size = sizeRange[0] + Math.random() * (sizeRange[1] - sizeRange[0]);
  const dur  = durationRange[0] + Math.random() * (durationRange[1] - durationRange[0]);
  const bob  = bobRange[0] + Math.random() * (bobRange[1] - bobRange[0]);

  img.style.top               = top + "%";
  img.style.width             = size + "px";
  img.style.height            = size + "px";
  img.style.animationDuration = dur + "s";
  img.style.animationDelay    = delay + "s";
  img.style.setProperty("--ghost-bob", bob + "px");

  img.addEventListener("animationend", () => img.remove());
  document.body.appendChild(img);
  return dur + delay;
}

function spawnGhostFlyby() {
  if (document.hidden) return;

  const ghostCount = 3 + Math.floor(Math.random() * 3); // 3–5 ghosts
  const batCount   = 2 + Math.floor(Math.random() * 3); // 2–4 bats
  let maxEnd = 0;

  for (let i = 0; i < ghostCount; i++) {
    const end = spawnCreature({
      variants: GHOST_VARIANTS,
      baseClass: "ghost-fly",
      sizeRange: [34, 62],
      durationRange: [10, 15],
      bobRange: [14, 30],
      pathClass: pick(PATH_CLASSES),
      delay: i * 0.4 + Math.random() * 0.6,
    });
    if (end > maxEnd) maxEnd = end;
  }

  for (let i = 0; i < batCount; i++) {
    const end = spawnCreature({
      variants: BAT_VARIANTS,
      baseClass: "ghost-fly bat-fly",
      sizeRange: [24, 40],
      durationRange: [7, 11],           // bats are quicker
      bobRange: [20, 40],
      pathClass: pick(PATH_CLASSES),
      delay: 0.6 + i * 0.3 + Math.random() * 0.5,
    });
    if (end > maxEnd) maxEnd = end;
  }

  // Horror vignette lasts roughly as long as the longest creature is on-screen.
  triggerHorrorOverlay(Math.ceil(maxEnd * 1000) + 400);
  playWitchLaugh();
}

function scheduleGhostFlybys() {
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  } catch {}

  prepareAudio();

  function queueNext() {
    const delay = 45000 + Math.random() * 10000; // 45–55s
    setTimeout(() => {
      spawnGhostFlyby();
      queueNext();
    }, delay);
  }
  // First flyby: around 20 seconds after mount.
  setTimeout(() => {
    spawnGhostFlyby();
    queueNext();
  }, 18000 + Math.random() * 4000);
}

function wireDevLogout() {
  // When the dev signs out, reset the session flags so the next sign-in
  // replays the cinematic + welcome modal cleanly.
  document.addEventListener("click", (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    if (t.closest("#logoutBtn, .logout")) {
      try { sessionStorage.removeItem(GREETING_SHOWN_KEY); } catch {}
      try { sessionStorage.removeItem(GHOST_INTRO_SHOWN_KEY); } catch {}
    }
  }, true);
}

function ensureStyles() {
  if (document.getElementById("ghostStyles")) return;
  const s = document.createElement("style");
  s.id = "ghostStyles";
  s.textContent = `
    .ghost-modal-backdrop {
      position: fixed;
      inset: 0;
      z-index: 99999;
      background: rgba(10, 10, 14, 0.55);
      backdrop-filter: blur(6px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      opacity: 0;
      transition: opacity 0.22s ease;
    }
    .ghost-modal-backdrop.is-open { opacity: 1; }
    .ghost-modal-backdrop.is-closing { opacity: 0; }

    .ghost-modal {
      position: relative;
      width: min(100%, 440px);
      padding: 28px 28px 22px;
      border-radius: 20px;
      background: linear-gradient(160deg, #1f2027 0%, #18191d 100%);
      color: #fff;
      border: 1px solid rgba(124, 107, 255, 0.35);
      box-shadow: 0 30px 80px rgba(0, 0, 0, 0.5),
                  0 0 0 1px rgba(255, 255, 255, 0.04) inset;
      text-align: center;
      transform: translateY(10px) scale(0.97);
      transition: transform 0.26s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .ghost-modal-backdrop.is-open .ghost-modal { transform: translateY(0) scale(1); }

    .ghost-modal__close {
      position: absolute;
      top: 12px;
      right: 12px;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: 0;
      background: rgba(255, 255, 255, 0.08);
      color: rgba(255, 255, 255, 0.8);
      font-size: 1.3rem;
      line-height: 1;
      cursor: pointer;
      transition: background 0.15s;
    }
    .ghost-modal__close:hover { background: rgba(255, 255, 255, 0.16); }

    .ghost-modal__icon {
      width: 72px;
      height: 72px;
      margin: 0 auto 12px;
      display: block;
      filter: drop-shadow(0 10px 24px rgba(124, 107, 255, 0.4));
      animation: ghostFloat 3s ease-in-out infinite;
    }
    @keyframes ghostFloat {
      0%, 100% { transform: translateY(0); }
      50%      { transform: translateY(-6px); }
    }

    .ghost-modal__title {
      margin: 0 0 10px;
      font: 800 1.3rem/1.2 system-ui, -apple-system, "Segoe UI", Inter, sans-serif;
      letter-spacing: -0.01em;
    }
    .ghost-modal__body {
      margin: 0 0 22px;
      font: 500 0.92rem/1.55 system-ui, -apple-system, "Segoe UI", Inter, sans-serif;
      color: rgba(255, 255, 255, 0.78);
    }
    .ghost-modal__body b { color: #fff; font-weight: 700; }

    .ghost-modal__actions {
      display: flex;
      gap: 10px;
      justify-content: center;
      margin-bottom: 18px;
    }
    .ghost-modal__skip,
    .ghost-modal__cta {
      padding: 10px 18px;
      border-radius: 10px;
      font: 700 0.9rem/1 system-ui, -apple-system, "Segoe UI", Inter, sans-serif;
      cursor: pointer;
      text-decoration: none;
      transition: transform 0.12s ease, background 0.15s, border-color 0.15s, box-shadow 0.15s;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .ghost-modal__skip {
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.22);
      color: rgba(255, 255, 255, 0.85);
    }
    .ghost-modal__skip:hover {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.4);
    }
    .ghost-modal__cta {
      background: linear-gradient(135deg, #7c6bff, #a855f7);
      color: #fff;
      border: 0;
      box-shadow: 0 8px 20px rgba(124, 107, 255, 0.4);
    }
    .ghost-modal__cta:hover { transform: translateY(-1px); }

    .ghost-modal__timer {
      height: 3px;
      background: rgba(255, 255, 255, 0.06);
      border-radius: 2px;
      overflow: hidden;
    }
    .ghost-modal__timer-fill {
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, #7c6bff, #a855f7);
      transform-origin: left center;
      transform: scaleX(1);
    }

    .ghost-toast-host {
      position: fixed;
      left: 50%;
      bottom: 28px;
      transform: translateX(-50%);
      z-index: 99998;
      display: flex;
      flex-direction: column;
      gap: 10px;
      align-items: center;
      pointer-events: none;
    }
    .ghost-toast {
      padding: 10px 18px;
      background: #1f2027;
      border: 1px solid rgba(255,255,255,0.1);
      color: #fff;
      font: 600 0.86rem/1.3 system-ui, -apple-system, "Segoe UI", Inter, sans-serif;
      border-radius: 10px;
      box-shadow: 0 14px 40px rgba(0,0,0,0.4);
      opacity: 0;
      transform: translateY(8px);
      transition: opacity 0.22s ease, transform 0.22s ease;
    }
    .ghost-toast.show {
      opacity: 1;
      transform: translateY(0);
    }

    /* visually dim blocked action controls so users know they're non-functional */
    body.is-ghost #add-internship-btn,
    body.is-ghost #applyBtn,
    body.is-ghost #submitBtn,
    body.is-ghost #saveBtn,
    body.is-ghost .btn-approve,
    body.is-ghost .btn-reject,
    body.is-ghost .btn-shortlist {
      filter: saturate(0.6) brightness(0.92);
    }

    /* horror flybys — ghosts + bats */
    .ghost-fly {
      position: fixed;
      top: 0;
      left: 0;
      pointer-events: none;
      user-select: none;
      z-index: 9990;
      opacity: 0;
      filter: drop-shadow(0 6px 14px rgba(124, 107, 255, 0.35));
      will-change: transform, opacity;
      animation-timing-function: linear;
      animation-fill-mode: both;
      animation-iteration-count: 1;
    }
    .bat-fly {
      filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.55))
              drop-shadow(0 0 18px rgba(88, 28, 135, 0.35));
      opacity: 0.9;
    }

    .ghost-fly--ltr       { animation-name: ghostFlyLtr; }
    .ghost-fly--rtl       { animation-name: ghostFlyRtl; }
    .ghost-fly--diag-down { animation-name: ghostFlyDiagDown; }
    .ghost-fly--diag-up   { animation-name: ghostFlyDiagUp; }
    .ghost-fly--wave      { animation-name: ghostFlyWave; }

    @keyframes ghostFlyLtr {
      0%   { transform: translate(-18vw, 0); opacity: 0; }
      8%   { opacity: 0.78; }
      25%  { transform: translate(22vw, calc(var(--ghost-bob, 20px) * -1)); }
      50%  { transform: translate(50vw, var(--ghost-bob, 20px)); }
      75%  { transform: translate(78vw, calc(var(--ghost-bob, 20px) * -1)); }
      92%  { opacity: 0.78; }
      100% { transform: translate(120vw, 0); opacity: 0; }
    }
    @keyframes ghostFlyRtl {
      0%   { transform: translate(120vw, 0) scaleX(-1); opacity: 0; }
      8%   { opacity: 0.78; }
      25%  { transform: translate(78vw, calc(var(--ghost-bob, 20px) * -1)) scaleX(-1); }
      50%  { transform: translate(50vw, var(--ghost-bob, 20px)) scaleX(-1); }
      75%  { transform: translate(22vw, calc(var(--ghost-bob, 20px) * -1)) scaleX(-1); }
      92%  { opacity: 0.78; }
      100% { transform: translate(-18vw, 0) scaleX(-1); opacity: 0; }
    }
    @keyframes ghostFlyDiagDown {
      0%   { transform: translate(-15vw, -25vh) rotate(-6deg); opacity: 0; }
      10%  { opacity: 0.8; }
      50%  { transform: translate(50vw, 10vh) rotate(4deg); }
      90%  { opacity: 0.8; }
      100% { transform: translate(118vw, 45vh) rotate(-3deg); opacity: 0; }
    }
    @keyframes ghostFlyDiagUp {
      0%   { transform: translate(118vw, 40vh) scaleX(-1) rotate(4deg); opacity: 0; }
      10%  { opacity: 0.8; }
      50%  { transform: translate(50vw, 5vh) scaleX(-1) rotate(-6deg); }
      90%  { opacity: 0.8; }
      100% { transform: translate(-15vw, -20vh) scaleX(-1) rotate(0deg); opacity: 0; }
    }
    @keyframes ghostFlyWave {
      0%   { transform: translate(-16vw, 0); opacity: 0; }
      10%  { opacity: 0.8; }
      20%  { transform: translate(16vw, calc(var(--ghost-bob, 20px) * -1.5)); }
      35%  { transform: translate(32vw, calc(var(--ghost-bob, 20px) * 1.5)); }
      50%  { transform: translate(50vw, calc(var(--ghost-bob, 20px) * -1.5)); }
      65%  { transform: translate(68vw, calc(var(--ghost-bob, 20px) * 1.5)); }
      80%  { transform: translate(84vw, calc(var(--ghost-bob, 20px) * -1.5)); }
      90%  { opacity: 0.8; }
      100% { transform: translate(120vw, 0); opacity: 0; }
    }

    /* horror vignette: pulsing dark edges, faint red glow */
    .ghost-horror-overlay {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 9985;
      background:
        radial-gradient(circle at 50% 40%, transparent 35%, rgba(0,0,0,0.55) 100%),
        radial-gradient(circle at 50% 50%, rgba(120, 0, 30, 0.18) 0%, transparent 60%);
      opacity: 0;
      transition: opacity 1.2s ease-in-out;
    }
    .ghost-horror-overlay.is-active {
      opacity: 1;
      animation: horrorPulse 2.4s ease-in-out infinite;
    }
    @keyframes horrorPulse {
      0%, 100% { filter: brightness(1); }
      50%      { filter: brightness(1.12); }
    }

    @media (prefers-reduced-motion: reduce) {
      .ghost-fly, .ghost-horror-overlay { display: none !important; }
    }

    @media (max-width: 640px) {
      .ghost-modal { padding: 22px 20px 18px; }
      .ghost-modal__title { font-size: 1.15rem; }
      .ghost-modal__icon { width: 60px; height: 60px; }
      .ghost-modal__actions { flex-direction: column; gap: 8px; }
      .ghost-modal__skip, .ghost-modal__cta { width: 100%; }
      .ghost-fly { opacity: 0.6; }
    }

    /* ═══ cinematic intro ═══ */
    body.ghost-intro-lock { overflow: hidden; }

    .ghost-intro {
      position: fixed;
      inset: 0;
      z-index: 1000000;
      /* Base dark gradient fallback sits under the atmosphere image in case
         the PNG ever fails to load. */
      background:
        radial-gradient(ellipse at 50% 110%, rgba(140, 30, 20, 0.28) 0%, transparent 55%),
        radial-gradient(ellipse at 50% 45%, #1a0208 0%, #050104 55%, #000 100%);
      overflow: hidden;
      opacity: 0;
      transition: opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .ghost-intro__atmos {
      position: absolute;
      inset: -6%; /* slight overshoot so the scale never reveals the edges */
      background: url("${GHOST_INTRO_ASSETS.atmosphere}") center / cover no-repeat;
      z-index: 1;
      pointer-events: none;
      opacity: 0.78;
      filter: brightness(0.8) saturate(1.08) contrast(1.06);
      transform-origin: 50% 55%;
      animation:
        atmosKenBurns 22s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite alternate,
        atmosBreathe 6s ease-in-out infinite;
      will-change: transform, filter;
    }
    .ghost-intro__atmos::after {
      content: "";
      position: absolute;
      inset: 0;
      background:
        linear-gradient(180deg, rgba(0,0,0,0.28) 0%, transparent 35%, transparent 60%, rgba(0,0,0,0.55) 100%);
      pointer-events: none;
    }
    /* Slow Ken-Burns — scale up + drift diagonally so the still image feels
       like it's breathing / creeping closer. */
    @keyframes atmosKenBurns {
      0%   { transform: scale(1.08) translate3d(-18px, -6px, 0); }
      50%  { transform: scale(1.14) translate3d(12px,  -14px, 0); }
      100% { transform: scale(1.18) translate3d(-6px,  14px, 0); }
    }
    /* Independent brightness/saturation pulse — tiny, but it makes the
       candles-in-the-fog vibe feel alive instead of flat. */
    @keyframes atmosBreathe {
      0%, 100% { filter: brightness(0.80) saturate(1.08) contrast(1.06); }
      50%      { filter: brightness(0.92) saturate(1.18) contrast(1.10); }
    }
    .ghost-intro.is-visible { opacity: 1; }
    .ghost-intro--closing {
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.7s cubic-bezier(0.4, 0, 0.2, 1);
    }

    /* Vignette — heavy dark edges, claustrophobic feel */
    .ghost-intro::before {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      background: radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.85) 100%);
      z-index: 2;
    }

    /* Lightning flash: fires during the blink phase */
    .ghost-intro__stars {
      position: absolute;
      inset: 0;
      background: rgba(180, 90, 90, 0);
      pointer-events: none;
      transition: background 0.08s ease;
    }
    .ghost-intro.phase-blink .ghost-intro__stars {
      background: rgba(255, 230, 220, 0.18);
      animation: introLightning 0.35s steps(4) 1;
    }
    @keyframes introLightning {
      0%   { background: rgba(255, 230, 220, 0.00); }
      25%  { background: rgba(255, 230, 220, 0.20); }
      50%  { background: rgba(255, 230, 220, 0.02); }
      75%  { background: rgba(255, 230, 220, 0.22); }
      100% { background: rgba(255, 230, 220, 0.00); }
    }

    /* Fog — slow drifting volumetric layer */
    .ghost-intro__mist {
      position: absolute;
      inset: -20%;
      background:
        radial-gradient(ellipse 60% 40% at 20% 90%, rgba(70, 12, 18, 0.45), transparent 70%),
        radial-gradient(ellipse 55% 35% at 80% 95%, rgba(50, 10, 40, 0.38), transparent 70%),
        radial-gradient(ellipse 70% 45% at 50% 85%, rgba(35, 8, 20, 0.55), transparent 75%),
        radial-gradient(ellipse 40% 25% at 30% 30%, rgba(30, 5, 15, 0.4), transparent 80%);
      filter: blur(1px);
      animation: introFog 14s ease-in-out infinite alternate;
    }
    @keyframes introFog {
      0%   { transform: translate3d(-40px, 0, 0) scale(1.02); }
      100% { transform: translate3d(40px, -10px, 0) scale(1.06); }
    }

    .ghost-intro__scene { position: absolute; inset: 0; z-index: 3; }

    .ghost-intro__candle,
    .ghost-intro__skeleton {
      position: absolute;
      image-rendering: -webkit-optimize-contrast;
      will-change: transform, opacity, filter;
      backface-visibility: hidden;
    }

    /* Candle: starts off-screen left, floats to rest right under the
       skeleton's chin so the flame reads as touching his face. */
    .ghost-intro__candle {
      width: 200px;
      height: auto;
      top: 44%;
      left: -360px;
      z-index: 4;   /* above skeleton so the flame overlaps his chin */
      transform: translate3d(0, 0, 0);
      filter:
        drop-shadow(0 -6px 22px rgba(255, 160, 50, 0.9))
        drop-shadow(0 0 40px rgba(255, 100, 30, 0.6));
      animation: candleFlicker 0.45s ease-in-out infinite alternate;
    }
    .ghost-intro.phase-enter .ghost-intro__candle {
      animation:
        candleFloatIn 5s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards,
        candleFlicker 0.45s ease-in-out infinite alternate;
    }
    @keyframes candleFloatIn {
      0%   { left: -360px; transform: translate3d(0, 0, 0) rotate(-3deg); }
      20%  { transform: translate3d(0, -10px, 0) rotate(1deg); }
      40%  { transform: translate3d(0, -16px, 0) rotate(2deg); }
      60%  { transform: translate3d(0, -8px, 0) rotate(-1deg); }
      80%  { transform: translate3d(0, 4px, 0)  rotate(0.5deg); }
      100% { left: calc(50% - 160px); transform: translate3d(0, 0, 0) rotate(0); }
    }
    @keyframes candleFlicker {
      from { filter:
        drop-shadow(0 -6px 18px rgba(255, 160, 50, 0.85))
        drop-shadow(0 0 32px rgba(255, 100, 30, 0.55));
      }
      to   { filter:
        drop-shadow(0 -6px 32px rgba(255, 200, 110, 1))
        drop-shadow(0 0 50px rgba(255, 140, 50, 0.8));
      }
    }

    /* Dark blink — hard flash of black */
    .ghost-intro__blink {
      position: absolute;
      inset: 0;
      background: #000;
      opacity: 0;
      pointer-events: none;
      z-index: 20;
      transition: opacity 0.1s ease;
    }
    .ghost-intro.phase-blink .ghost-intro__blink { opacity: 1; }

    /* Skeleton: centered so his chin sits right above the candle's flame.
       Width tuned so the face is roughly the same scale as the candle. */
    .ghost-intro__skeleton {
      width: 420px;
      height: auto;
      top: 40%;
      left: calc(50% - 270px);
      z-index: 3;
      opacity: 0;
      transform: scale(0.85) translateY(14px);
      transform-origin: center bottom;
      filter:
        drop-shadow(0 18px 50px rgba(0, 0, 0, 0.85))
        drop-shadow(0 0 24px rgba(255, 120, 40, 0.28));
    }
    .ghost-intro.phase-skeleton .ghost-intro__skeleton {
      animation: skeletonPopIn 0.7s cubic-bezier(0.2, 1.05, 0.3, 1) forwards;
    }
    @keyframes skeletonPopIn {
      0%   { opacity: 0; transform: scale(0.7) translateY(30px); filter: drop-shadow(0 0 0 rgba(0,0,0,0)); }
      60%  { opacity: 1; transform: scale(1.05) translateY(-4px); }
      100% { opacity: 1; transform: scale(1) translateY(0);
             filter: drop-shadow(0 18px 50px rgba(0, 0, 0, 0.85))
                     drop-shadow(0 -4px 18px rgba(255, 120, 40, 0.25)); }
    }

    /* ═══ bats ═══ */

    /* Follow bats: travel alongside the candle using the same left-edge to
       center motion, with slight offsets so they read as companions. */
    .ghost-intro__bat-follow {
      position: absolute;
      opacity: 0;
      z-index: 3;
      pointer-events: none;
      filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.55));
      will-change: transform, left, opacity;
    }
    .ghost-intro__bat-follow--1 {
      width: 80px;
      top: 28%; /* above candle */
      left: -280px;
    }
    .ghost-intro__bat-follow--2 {
      width: 110px;
      top: 58%; /* below candle */
      left: -300px;
    }
    .ghost-intro.phase-enter .ghost-intro__bat-follow--1 {
      animation:
        batFollow1 5.2s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.2s forwards,
        batFlutter 0.22s ease-in-out infinite alternate;
    }
    .ghost-intro.phase-enter .ghost-intro__bat-follow--2 {
      animation:
        batFollow2 5.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.4s forwards,
        batFlutter 0.26s ease-in-out infinite alternate;
    }
    @keyframes batFollow1 {
      0%   { left: -280px; opacity: 0; transform: translate3d(0, 0, 0) scale(0.9); }
      15%  { opacity: 0.9; }
      40%  { transform: translate3d(0, -18px, 0) scale(1); }
      70%  { transform: translate3d(0, -6px, 0)  scale(1); }
      100% { left: calc(50% - 60px); transform: translate3d(0, -2px, 0) scale(1); opacity: 0.95; }
    }
    @keyframes batFollow2 {
      0%   { left: -300px; opacity: 0; transform: translate3d(0, 0, 0) scale(0.9); }
      15%  { opacity: 0.9; }
      45%  { transform: translate3d(0, -12px, 0) scale(1); }
      80%  { transform: translate3d(0, 8px, 0)  scale(1); }
      100% { left: calc(50% - 250px); transform: translate3d(0, 0, 0) scale(1); opacity: 0.92; }
    }
    /* Tiny wing-flap style up/down — played on top of the entry path */
    @keyframes batFlutter {
      from { transform: translate3d(0, 0, 0) scaleY(1); }
      to   { transform: translate3d(0, -4px, 0) scaleY(0.93); }
    }

    /* Random-path bats spawned via JS — inherit cross-screen motion from the
       existing ghost-fly keyframes but at a smaller scale + faster speed. */
    .ghost-intro__bat-layer {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 3;
    }
    .ghost-intro__bat-rand {
      position: absolute;
      top: 0;
      left: 0;
      opacity: 0;
      filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.55))
              drop-shadow(0 0 14px rgba(88, 28, 135, 0.35));
      will-change: transform, opacity;
      animation-timing-function: linear;
      animation-fill-mode: both;
      animation-iteration-count: 1;
    }
    .ghost-intro__bat-rand--ltr       { animation-name: ghostFlyLtr; }
    .ghost-intro__bat-rand--rtl       { animation-name: ghostFlyRtl; }
    .ghost-intro__bat-rand--diag-down { animation-name: ghostFlyDiagDown; }
    .ghost-intro__bat-rand--diag-up   { animation-name: ghostFlyDiagUp; }
    .ghost-intro__bat-rand--wave      { animation-name: ghostFlyWave; }

    /* When the candle blows out, kill bat animations + force invisible.
       !important is required to defeat keyframe-driven opacity values. */
    .ghost-intro.phase-blackout .ghost-intro__bat-follow,
    .ghost-intro.phase-blackout .ghost-intro__bat-rand {
      animation: none !important;
      opacity: 0 !important;
      transition: none;
    }

    /* Blow: skeleton leans DOWN toward the candle with a slight head dip,
       holds for a beat, then recoils. */
    .ghost-intro.phase-swoosh .ghost-intro__skeleton {
      animation: skeletonBlow 0.9s cubic-bezier(0.34, 1.1, 0.5, 1) 1;
    }
    @keyframes skeletonBlow {
      0%   { transform: translate3d(0, 0, 0) rotate(0); }
      30%  { transform: translate3d(0, 8px, 0) rotate(-1deg); }
      55%  { transform: translate3d(0, 12px, 0) rotate(-2deg) scale(1.03); }
      75%  { transform: translate3d(0, 6px, 0) rotate(-1deg) scale(1.02); }
      100% { transform: translate3d(0, 0, 0) rotate(0); }
    }
    .ghost-intro.phase-swoosh .ghost-intro__candle {
      animation: candleReact 0.9s cubic-bezier(0.4, 0, 0.2, 1) 1,
                 candleFlicker 0.12s ease-in-out infinite alternate;
    }
    @keyframes candleReact {
      0%   { transform: translate3d(0, 0, 0) rotate(0); }
      25%  { transform: translate3d(0, 0, 0) rotate(-12deg); }
      50%  { transform: translate3d(0, 2px, 0) rotate(14deg); }
      75%  { transform: translate3d(0, 0, 0) rotate(-6deg); }
      100% { transform: translate3d(0, 0, 0) rotate(0); }
    }

    /* Blackout: instant — everything disappears the moment the flame dies */
    .ghost-intro.phase-blackout {
      background: #000 !important;
      transition: none;
    }
    .ghost-intro.phase-blackout::before { opacity: 0; }
    .ghost-intro.phase-blackout .ghost-intro__atmos,
    .ghost-intro.phase-blackout .ghost-intro__scene,
    .ghost-intro.phase-blackout .ghost-intro__mist,
    .ghost-intro.phase-blackout .ghost-intro__stars,
    .ghost-intro.phase-blackout .ghost-intro__caption {
      opacity: 0;
      transition: none;
    }

    /* Reveal: overlay itself fades to transparent — dashboard shows through */
    .ghost-intro.phase-reveal {
      opacity: 0;
      transition: opacity 1s ease;
    }

    .ghost-intro__caption {
      position: absolute;
      left: 0; right: 0;
      bottom: 12vh;
      text-align: center;
      color: rgba(255, 255, 255, 0.82);
      font: 600 0.95rem/1.5 system-ui, -apple-system, "Segoe UI", Inter, sans-serif;
      letter-spacing: 0.02em;
      min-height: 1.4em;
      transition: opacity 0.4s ease;
    }

    .ghost-intro__hint {
      position: absolute;
      bottom: 20px;
      right: 20px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.22);
      background: rgba(0, 0, 0, 0.55);
      color: rgba(255, 255, 255, 0.88);
      font: 600 0.78rem/1 system-ui, -apple-system, "Segoe UI", Inter, sans-serif;
      backdrop-filter: blur(4px);
      z-index: 30;
      opacity: 0;
      transform: translateY(8px);
      transition: opacity 0.45s ease 0.3s, transform 0.45s ease 0.3s;
      pointer-events: none;
    }
    .ghost-intro.is-visible .ghost-intro__hint {
      opacity: 1;
      transform: translateY(0);
    }
    .ghost-intro.phase-blackout .ghost-intro__hint {
      opacity: 0;
      transition: opacity 0.2s ease;
    }
    .ghost-intro__hint-dot {
      font-size: 0.95rem;
      line-height: 1;
      color: rgba(168, 85, 247, 0.95);
    }
    .ghost-intro__hint b {
      font-weight: 800;
      color: #fff;
    }

    @media (max-width: 640px) {
      .ghost-intro__hint { display: none; }
    }

    .ghost-intro__skip {
      position: absolute;
      top: 20px; right: 20px;
      padding: 9px 16px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.3);
      background: rgba(0, 0, 0, 0.45);
      color: rgba(255, 255, 255, 0.88);
      font: 700 0.82rem/1 system-ui, -apple-system, "Segoe UI", Inter, sans-serif;
      cursor: pointer;
      backdrop-filter: blur(4px);
      transition: background 0.15s, border-color 0.15s;
    }
    .ghost-intro__skip:hover {
      background: rgba(255, 255, 255, 0.14);
      border-color: rgba(255, 255, 255, 0.55);
    }

    @media (max-width: 640px) {
      .ghost-intro__candle   { width: 130px; top: 48%; left: calc(50% - 105px) !important; }
      .ghost-intro__skeleton { width: 280px; top: 44%; left: calc(50% - 180px); }
      .ghost-intro__caption  { font-size: 0.85rem; bottom: 8vh; padding: 0 16px; }
    }

    @media (prefers-reduced-motion: reduce) {
      .ghost-intro { display: none !important; }
    }
  `;
  document.head.appendChild(s);
}

function init() {
  ensureStyles();
  const mount = async () => {
    wireDevLogout();
    // Intro first — blocks until the cinematic finishes (or is skipped).
    await playGhostIntro();
    installGreetingModal();
    scheduleGhostFlybys();
  };
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
}

init();
