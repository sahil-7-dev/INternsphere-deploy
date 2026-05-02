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

// Bats share the flyby — smaller, faster, darker. Single sprite for a
// uniform flock; swap the URL to restyle.
const BAT_VARIANTS = [
  "https://img.icons8.com/color/96/bat.png",
];

// Witch flyby — primary asset is a local webm clip (animated broom flight).
// If the video fails to load we fall back to a static icon, then to inline SVG.
// Her cackle plays synchronized with her on-screen entry rather than the
// generic flyby start.
// Witch squadron — leader at the front, followers staggered behind. All
// share a single flight path (entry → 360° swing → fast sweep out).
const WITCH_LEADER_URL = "assets/images/_cache/Witch%20leader.webm";
const WITCH_FOLLOWER_URLS = [
  "assets/images/_cache/witch2.webm",
  "assets/images/_cache/witch3.webm",
];
const WITCH_VARIANTS = [
  "https://img.icons8.com/3d-fluency/94/witch-on-broomstick.png",
  "https://img.icons8.com/color/96/witch.png",
  "https://img.icons8.com/emoji/96/woman-mage-emoji.png",
];

// Animated webm assets for the rest of the cast. Filenames have spaces, so
// they're URL-encoded inline.
// Only WebMs encoded with an alpha channel (yuva420p) render with a
// transparent background. MP4/H.264 has no alpha support — the source
// chroma-key colour (green) shows through instead. To add more variants,
// re-export the source clips with VP9+alpha:
//   ffmpeg -i input.mov -c:v libvpx-vp9 -pix_fmt yuva420p -auto-alt-ref 0 out.webm
const BAT_VIDEO_URLS = [
  "assets/images/_cache/bat.webm",
];
const RUNNING_SKELETON_URL   = "assets/images/_cache/running%20skeleton.webm";
const ZOMBIE_URL             = "assets/images/_cache/zombie.webm";
const DANCING_SKELETON_URL   = "assets/images/_cache/dancing%20skeleton.webm";
const GUITAR_SKELETON_URL    = "assets/images/_cache/guitar%20skeleton.webm";
const EGYPT_MUMMY_URL        = "assets/images/_cache/egyptmummy.webm";
const GRAVE_URL              = "assets/images/_cache/Grave.webm";

// Bubble text pools — picked at random per chase so the same lines don't
// repeat. Tonal mix: panic/comedic for the skeleton, menace/hungry for
// the zombie. Keep entries short (~25 chars) — bubbles use `white-space:
// nowrap`, so long lines make very wide bubbles.
const SKELETON_BUBBLES = [
  "help me!",
  "noooo!",
  "save me!",
  "AAAAAH!",
  "stop chasing me!",
  "i don't wanna die!",
  "not today!!",
  "guys??",
  "this is fine",
  "skip leg day, big mistake",
  "i'm too young!",
  "anyone?? help!",
  "wait wait wait",
  "leave me alone!",
];

const ZOMBIE_BUBBLES = [
  "grrrr…",
  "BRAINS",
  "hungry…",
  "come back!",
  "yum yum",
  "rrraaagh",
  "tasty bones",
  "calcium…",
  "snack escaping",
  "wait up!!",
  "om nom",
  "feast time",
  "you're mine",
  "i'm starving",
  "share the meat",
];

// ── Click-only quote pools (only fired when the user actually clicks the sprite) ──
// Each cast member responds at most once per appearance. Scarecrow is the
// exception — it has its own 2-minute cooldown handled in the dashboard
// inline script.
const MUMMY_CLICK_QUOTES = [
  "3000 years for this?",
  "i was someone, once.",
  "the curse is mostly emotional.",
  "needs more bandages.",
  "i'd run, but… joints.",
  "wrap it up, kid.",
  "is this a tomb or a startup?",
];

const GUITARIST_CLICK_QUOTES = [
  "rock and bone!",
  "this riff slaps.",
  "encore!",
  "bone-y jovi.",
  "🤘",
  "i'm in B-flat. always.",
  "shred mode: ON.",
];

const DANCER_CLICK_QUOTES = [
  "spooky scary!",
  "rattle rattle.",
  "bone to be wild.",
  "shake those bones.",
  "no rest for the funky.",
  "left foot, no foot.",
  "clap if you got ribs.",
  "come dance with me.",
];

const SKELETON_CLICK_QUOTES = [
  "really? trying to pause me huh",
  "please save me",
  "make him go away",
  "i am scared, can't stop",
  "nice try",
];

// Zombie click quotes — one entry is a two-part: the line "bones or flesh?"
// pauses for ~1.1s and then says the follow-up.
const ZOMBIE_CLICK_QUOTES = [
  { text: "humans hand's yummmm" },
  { text: "don't poke me." },
  { text: "warm finger…" },
  { text: "hands. yum." },
  { text: "5-second rule on hands?" },
  { text: "bones or flesh?", followUp: "both are fine, yum yum…", followUpDelay: 1100 },
];

// ── Click-quote helpers — wires a sprite so a single click during its
// appearance pops a speech bubble above it. After speaking once the sprite
// stops responding for the rest of its lifetime; next time the same kind
// of cast member appears, the new instance is fresh again. ──
function showCastQuote(spriteEl, text, holdMs) {
  if (!spriteEl || !text) return;
  const bubble = document.createElement("span");
  bubble.className = "cast-quote";
  bubble.textContent = text;
  bubble.style.animationDuration = (holdMs || 2500) + "ms";
  bubble.addEventListener("animationend", () => bubble.remove());
  spriteEl.appendChild(bubble);
}

// Shuffled-queue picker per pool — guarantees every quote is heard before
// any repeats. Each call to wireSpriteClick(pool, …) on the same pool
// shares the same queue at module level via _quoteQueues, so consecutive
// sprite spawns don't keep landing on the same line.
const _quoteQueues = new WeakMap();
function pickFromPool(pool) {
  let queue = _quoteQueues.get(pool);
  if (!queue || queue.length === 0) {
    queue = pool.slice();
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = queue[i]; queue[i] = queue[j]; queue[j] = t;
    }
    _quoteQueues.set(pool, queue);
  }
  return queue.shift();
}

function wireSpriteClick(spriteEl, pool) {
  if (!spriteEl || !Array.isArray(pool) || !pool.length) return;
  spriteEl.classList.add("is-clickable");
  let spoken = false;
  spriteEl.addEventListener("click", (e) => {
    e.stopPropagation();
    if (spoken) return;
    spoken = true;
    const entry = pickFromPool(pool);
    if (typeof entry === "string") {
      showCastQuote(spriteEl, entry, 3125);
    } else if (entry && entry.text) {
      showCastQuote(spriteEl, entry.text, entry.followUp ? 1250 : 3125);
      if (entry.followUp) {
        setTimeout(() => {
          showCastQuote(spriteEl, entry.followUp, 3125);
        }, entry.followUpDelay || 1100);
      }
    }
  });
}

// Inline SVG fallback when the CDN is unreachable. Stylised witch on a broom.
const WITCH_ICON_FALLBACK =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 64">' +
      '<line x1="14" y1="52" x2="86" y2="44" stroke="#7c3a0e" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M86 44 L96 36 L96 52 L86 50 Z" fill="#caa45a" stroke="#7c3a0e" stroke-width="1"/>' +
      '<ellipse cx="50" cy="38" rx="14" ry="7" fill="#1a1a2e"/>' +
      '<circle cx="44" cy="22" r="8" fill="#9be7a3"/>' +
      '<circle cx="42" cy="22" r="1.2" fill="#1f2027"/>' +
      '<path d="M36 19 L44 3 L52 19 Z" fill="#221833"/>' +
      '<rect x="34" y="19" width="20" height="3" fill="#221833"/>' +
      '<rect x="42" y="14" width="4" height="2" fill="#7c6bff"/>' +
      '<path d="M40 24 Q42 32 38 35 Q35 31 38 26 Z" fill="#3a1a3a"/>' +
    '</svg>'
  );

// Witch cackle. Local file is preferred — drop your scary laugh at the path
// below and it'll be used automatically. If the local file is missing or the
// browser fails to load it, we fall back to Google's public cartoon cackle.
//
// Autoplay policies require prior user interaction. The login button click
// doesn't carry across the navigation (transient activation expires), so we
// "unlock" the audio on the first click/key/touch the user makes on this
// page (see setupAudioUnlock below). After that, playback works for the
// remainder of the session.
const WITCH_LAUGH_LOCAL    = "assets/audio/witch-laugh.mp3";
const WITCH_LAUGH_FALLBACK = "https://actions.google.com/sounds/v1/cartoon/witch_cackle.ogg";

// Skeleton's panic-cry. Loops while he's running from the zombie. Plays
// only when a chase is active — same autoplay-unlock plumbing as the
// witch cackle below.
const SKELE_CRY_LOCAL      = "assets/audio/skele-crying.mp3";

// Guitarist riff. Loops the entire time the band is on screen, snaps off
// the moment they leave. ~2-second clip designed to loop seamlessly.
const GUITARIST_LOCAL      = "assets/audio/guitarist.mp3";

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

  // Once per session — refreshing doesn't replay it. When the modal won't
  // be shown, return an already-resolved promise so the welcome burst fires
  // immediately on subsequent navigations.
  let shown = false;
  try { shown = sessionStorage.getItem(GREETING_SHOWN_KEY) === "1"; } catch {}
  if (shown) return Promise.resolve();

  return new Promise((resolveClosed) => {
  setTimeout(() => {
    if (document.getElementById("ghostGreetingModal")) return;
    try { sessionStorage.setItem(GREETING_SHOWN_KEY, "1"); } catch {}

    // Use the user's first name from the topbar if it's been hydrated yet.
    const rawName = document.getElementById("userName")?.textContent?.trim();
    const firstName = rawName && rawName !== "User" ? rawName : "there";
    const safeName = firstName.replace(/[<>&"]/g, (c) => ({
      "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;"
    }[c]));

    const backdrop = document.createElement("div");
    backdrop.id = "ghostGreetingModal";
    backdrop.className = "ghost-modal-backdrop";
    backdrop.innerHTML =
      '<div class="ghost-modal" role="dialog" aria-modal="true" aria-labelledby="ghostModalTitle">' +
        '<button type="button" class="ghost-modal__close" aria-label="Skip">×</button>' +
        '<img class="ghost-modal__icon" src="' + GHOST_ICON_URL + '" alt="" ' +
        'onerror="this.onerror=null;this.src=\'' + GHOST_ICON_FALLBACK + '\'">' +
        '<h2 id="ghostModalTitle" class="ghost-modal__title">Welcome back, ' + safeName + '. We have a slight problem.</h2>' +
        '<p class="ghost-modal__body">' +
          "Something's gotten into InternSphere tonight. We're not sure what — " +
          "the lights are flickering, TARS keeps mumbling, and the dashboard feels… watched." +
        '</p>' +
        '<p class="ghost-modal__body">' +
          "<b>Stay safe.</b> Don't linger too long in here. " +
          "Your applications are saved (we checked that part, at least)." +
        '</p>' +
        '<div class="ghost-modal__actions">' +
          '<button type="button" class="ghost-modal__skip">Not now</button>' +
          '<button type="button" class="ghost-modal__cta">Enter →</button>' +
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
      // Signal the welcome burst to start now that the modal is gone.
      resolveClosed();
    };

    backdrop.querySelector(".ghost-modal__close")?.addEventListener("click", close);
    backdrop.querySelector(".ghost-modal__skip")?.addEventListener("click", close);
    backdrop.querySelector(".ghost-modal__cta")?.addEventListener("click", close);
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
  });
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

// Spawn a mix of image and video bats inside the intro scene that fly on
// random paths, independently of the two candle-follow bats. Each bat is
// scoped to the #ghostIntroBats layer so the phase-blackout fade cleans
// them up too.
function spawnIntroBats(overlay) {
  const layer = overlay.querySelector(".ghost-intro__bat-layer");
  if (!layer) return;

  const imgVariants = [GHOST_INTRO_ASSETS.bat, GHOST_INTRO_ASSETS.bats];
  const paths = ["ltr", "rtl", "wave", "diag-down", "diag-up"];
  const imgCount   = 5 + Math.floor(Math.random() * 3);    // 5–7 image bats
  const videoCount = 4 + Math.floor(Math.random() * 3);    // 4–6 video bats

  function place(el, i, total) {
    const top   = 8 + Math.random() * 55;
    const size  = 70 + Math.random() * 65;     // 70–135px (was 40–85; bigger so they read clearly)
    const dur   = 6 + Math.random() * 4;       // 6–10s
    const delay = 0.4 + i * 0.55 + Math.random() * 0.6;
    const bob   = 18 + Math.random() * 22;
    el.style.top                = top + "%";
    el.style.width              = size + "px";
    el.style.animationDuration  = dur + "s";
    el.style.animationDelay     = delay + "s";
    el.style.setProperty("--ghost-bob", bob + "px");
    el.addEventListener("animationend", (e) => {
      if (e.target === el) el.remove();
    });
    layer.appendChild(el);
  }

  // Image bats — the legacy stock-art pair.
  for (let i = 0; i < imgCount; i++) {
    const bat = document.createElement("img");
    bat.className = "ghost-intro__bat-rand ghost-intro__bat-rand--" + paths[Math.floor(Math.random() * paths.length)];
    bat.src = imgVariants[Math.floor(Math.random() * imgVariants.length)];
    bat.alt = "";
    place(bat, i, imgCount);
  }

  // Video bats — alpha-channel webm so they fly on a transparent background.
  for (let i = 0; i < videoCount; i++) {
    const bat = document.createElement("video");
    bat.className = "ghost-intro__bat-rand ghost-intro__bat-rand--" + paths[Math.floor(Math.random() * paths.length)];
    bat.src = BAT_VIDEO_URLS[0];
    bat.muted = true;
    bat.playsInline = true;
    bat.autoplay = true;
    bat.loop = true;
    bat.preload = "auto";
    place(bat, imgCount + i, imgCount + videoCount);
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
      '</div>';
    document.body.appendChild(overlay);
    document.body.classList.add("ghost-intro-lock");

    // Skip button lives OUTSIDE the overlay so the overlay's fade-in
    // doesn't gate its visibility — it's clickable from frame zero.
    const skipBtn = document.createElement("button");
    skipBtn.type = "button";
    skipBtn.className = "ghost-intro__skip";
    skipBtn.textContent = "Skip →";
    document.body.appendChild(skipBtn);

    const cap = overlay.querySelector("#ghostIntroCap");
    const candleEl = overlay.querySelector(".ghost-intro__candle");
    const setCap = (txt) => { if (cap) cap.textContent = txt; };

    let skipped = false;
    const finish = () => {
      overlay.classList.add("ghost-intro--closing");
      skipBtn.classList.add("ghost-intro__skip--leaving");
      // Wait long enough for the new 1.4s fade-out curve to fully play out.
      setTimeout(() => {
        overlay.remove();
        skipBtn.remove();
        document.body.classList.remove("ghost-intro-lock");
        resolve();
      }, 1500);
    };
    const skip = () => {
      if (skipped) return;
      skipped = true;
      finish();
    };
    skipBtn.addEventListener("click", skip);
    document.addEventListener("keydown", function onKey(e) {
      if (e.key === "Escape") {
        document.removeEventListener("keydown", onKey);
        skip();
      }
    });

    (async () => {
      // Phase 0: overlay fades in — room dims, candle still hidden off-screen.
      // Hold longer so the fade-in fully resolves before the candle drift
      // kicks off; nothing should pop in mid-fade.
      await wait(40);
      overlay.classList.add("is-visible");
      setCap("The lights begin to dim…");

      // Phase 1: candle floats in from the left and settles center-stage;
      // launch random-path bats in the scene alongside the candle entry.
      await wait(1300);   // was 600 — gives the 1.8s fade-in room to finish
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

      // Phase 3: skeleton fades in close to the candle. Longer hold so
      // the smoother (1.4s) entry resolves before the swoosh starts.
      overlay.classList.add("phase-skeleton");
      await wait(1500);
      if (skipped) return;

      // Phase 4: skeleton leans in and blows — candle reacts
      overlay.classList.add("phase-swoosh");
      await wait(900);
      if (skipped) return;

      // Phase 5: candle out — hide it AND snap to pitch black on the same
      // frame, no in-between beat. Hold the blackout briefly, then reveal
      // the dashboard.
      if (candleEl) candleEl.style.display = "none";
      overlay.classList.add("phase-blackout");
      await wait(380);
      if (skipped) return;

      overlay.classList.add("phase-reveal");
      await wait(500);
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
let witchAudio       = null;
let skeleCryAudio    = null;
let guitaristAudio   = null;
let halloweenAudioUnlocked = false;

function prepareAudio() {
  // Witch cackle.
  if (!witchAudio) {
    try {
      witchAudio = new Audio();
      witchAudio.preload = "auto";
      witchAudio.volume  = 1.0;
      let triedFallback = false;
      witchAudio.addEventListener("error", () => {
        if (triedFallback) return;
        triedFallback = true;
        console.warn("[witch] local audio failed to load, falling back to CDN");
        witchAudio.src = WITCH_LAUGH_FALLBACK;
        witchAudio.load();
      });
      witchAudio.src = WITCH_LAUGH_LOCAL;
    } catch { witchAudio = null; }
  }

  // Skeleton's panic-cry — looped during the chase.
  if (!skeleCryAudio) {
    try {
      skeleCryAudio = new Audio();
      skeleCryAudio.preload = "auto";
      skeleCryAudio.volume  = 0.55;
      skeleCryAudio.loop    = true;
      skeleCryAudio.src     = SKELE_CRY_LOCAL;
    } catch { skeleCryAudio = null; }
  }

  // Guitarist riff — looped while the band is on screen.
  if (!guitaristAudio) {
    try {
      guitaristAudio = new Audio();
      guitaristAudio.preload = "auto";
      guitaristAudio.volume  = 0.5;
      guitaristAudio.loop    = true;
      guitaristAudio.src     = GUITARIST_LOCAL;
    } catch { guitaristAudio = null; }
  }

  setupAudioUnlock();
}

// Unlock playback on the first user gesture so subsequent halloween
// cackles / cries aren't blocked by autoplay policies. Browsers permit
// muted media to autoplay freely — playing each element once while muted
// "activates" it, after which unmuted plays succeed for the rest of the session.
function setupAudioUnlock() {
  if (halloweenAudioUnlocked) return;
  const targets = [witchAudio, skeleCryAudio, guitaristAudio].filter(Boolean);
  if (!targets.length) return;

  const events = ["pointerdown", "keydown", "touchstart", "click"];
  function unlock() {
    if (halloweenAudioUnlocked) return;
    let pending = targets.length;
    let anySucceeded = false;
    targets.forEach((audio) => {
      const wasMuted = audio.muted;
      audio.muted = true;
      const p = audio.play();
      const finish = (ok) => {
        audio.pause();
        audio.currentTime = 0;
        audio.muted = wasMuted;
        if (ok) anySucceeded = true;
        if (--pending === 0 && anySucceeded) {
          halloweenAudioUnlocked = true;
          events.forEach((ev) => document.removeEventListener(ev, unlock, true));
        }
      };
      if (p && typeof p.then === "function") {
        p.then(() => finish(true)).catch(() => finish(false));
      } else {
        finish(true);
      }
    });
  }
  events.forEach((ev) => document.addEventListener(ev, unlock, true));
}

let cackleEndedHandler = null;

function playWitchLaugh() {
  if (!witchAudio) return;
  try {
    // Cancel any in-progress double-play before starting a new one (e.g. if
    // a flyby fires while the previous cackle is still on its second pass).
    if (cackleEndedHandler) {
      witchAudio.removeEventListener("ended", cackleEndedHandler);
      cackleEndedHandler = null;
    }

    let plays = 0;
    cackleEndedHandler = function onEnded() {
      plays += 1;
      if (plays >= 2) {
        witchAudio.removeEventListener("ended", cackleEndedHandler);
        cackleEndedHandler = null;
        return;
      }
      witchAudio.currentTime = 0;
      const p2 = witchAudio.play();
      if (p2 && typeof p2.catch === "function") p2.catch(() => {});
    };
    witchAudio.addEventListener("ended", cackleEndedHandler);

    witchAudio.currentTime = 0;
    const p = witchAudio.play();
    if (p && typeof p.catch === "function") {
      p.catch((err) => {
        if (cackleEndedHandler) {
          witchAudio.removeEventListener("ended", cackleEndedHandler);
          cackleEndedHandler = null;
        }
        console.warn("[witch] cackle blocked — interact with the page once to unlock audio:", err?.name || err);
      });
    }
  } catch (err) {
    console.warn("[witch] cackle threw:", err);
  }
}

// ─── Vignette intensity (refcounted) ───
// Each spawn calls pushScene() at start and popScene() after its duration.
// Guitarist riff — fires the instant the band spawns and snaps off the
// moment they leave. No leading or trailing silence.
function startGuitaristRiff() {
  if (!guitaristAudio) return;
  try {
    guitaristAudio.currentTime = 0;
    const p = guitaristAudio.play();
    if (p && typeof p.catch === "function") {
      p.catch((err) => {
        console.warn("[guitarist] riff blocked — interact with the page once to unlock audio:", err?.name || err);
      });
    }
  } catch (err) {
    console.warn("[guitarist] riff threw:", err);
  }
}

function stopGuitaristRiff() {
  if (!guitaristAudio) return;
  try { guitaristAudio.pause(); guitaristAudio.currentTime = 0; } catch {}
}

// Skele cry control — looped through the chase, with leading and trailing
// silence so the audio doesn't fire the moment he enters frame and lingers
// briefly after the chase ends for emotional effect.
let skeleCryStartTimer = null;
let skeleCryStopTimer  = null;

function startSkeleCryForChase(chaseDurMs) {
  if (!skeleCryAudio) return;
  // Cancel any previous chase still queued (shouldn't normally happen).
  if (skeleCryStartTimer) { clearTimeout(skeleCryStartTimer); skeleCryStartTimer = null; }
  if (skeleCryStopTimer)  { clearTimeout(skeleCryStopTimer);  skeleCryStopTimer  = null; }
  try { skeleCryAudio.pause(); skeleCryAudio.currentTime = 0; } catch {}

  const START_DELAY_MS = 1200;   // wait until he's clearly running before he cries
  const TRAIL_MS       = 1000;   // keep crying 1s after the chase visuals end

  skeleCryStartTimer = setTimeout(() => {
    skeleCryStartTimer = null;
    if (!skeleCryAudio) return;
    try {
      skeleCryAudio.currentTime = 0;
      const p = skeleCryAudio.play();
      if (p && typeof p.catch === "function") {
        p.catch((err) => {
          console.warn("[skele] cry blocked — interact with the page once to unlock audio:", err?.name || err);
        });
      }
    } catch (err) {
      console.warn("[skele] cry threw:", err);
    }
  }, START_DELAY_MS);

  skeleCryStopTimer = setTimeout(() => {
    skeleCryStopTimer = null;
    if (!skeleCryAudio) return;
    try {
      skeleCryAudio.pause();
      skeleCryAudio.currentTime = 0;
    } catch {}
  }, chaseDurMs + TRAIL_MS);
}

// The vignette opacity scales with how many scenes overlap, so a lone
// flyby gets a subtle shift while multiple overlapping events darken
// the screen more noticeably.
let activeScenes = 0;

function ensureOverlay() {
  let overlay = document.getElementById("ghostHorrorOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "ghostHorrorOverlay";
    overlay.className = "ghost-horror-overlay";
    document.body.appendChild(overlay);
  }
  return overlay;
}

function updateVignetteIntensity() {
  const overlay = ensureOverlay();
  if (activeScenes <= 0) {
    overlay.classList.remove("is-active");
    overlay.style.removeProperty("--horror-strength");
    return;
  }
  // 1 scene  → 0.45 (subtle, noticeable)
  // 2 scenes → 0.70
  // 3+ scenes → 1.00 (full intensity)
  const strength = Math.min(1, 0.45 + (activeScenes - 1) * 0.25);
  overlay.style.setProperty("--horror-strength", strength.toFixed(2));
  overlay.classList.add("is-active");
}

function pushScene(durationMs) {
  activeScenes += 1;
  updateVignetteIntensity();
  setTimeout(() => {
    activeScenes = Math.max(0, activeScenes - 1);
    updateVignetteIntensity();
  }, Math.max(800, durationMs));
}

// Back-compat shim — older code paths called this with a single duration.
function triggerHorrorOverlay(durationMs) { pushScene(durationMs); }

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

// Spawn a single witch on the squadron flight path. Caller controls size,
// vertical position, spawn delay, and which video she rides. The wrapper
// carries the animation; the trail glow comes from `.witch-fly`'s ::before
// and ::after pseudos and rides along automatically.
// Spawn a single golden spark at the witch's current screen position.
// The spark falls straight to the bottom of the viewport and stays at
// full opacity — body's overflow:hidden visually "swallows" it at the
// bottom edge.
function spawnGoldenSpark(wrap, onLanding) {
  if (!wrap.isConnected) return;
  const rect = wrap.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  const spark = document.createElement("div");
  spark.className = "witch-spark";

  // Origin: somewhere in the lower half of the witch's bounding box —
  // emulates sparks dropping from her broom.
  const xOffset = (Math.random() - 0.5) * rect.width * 0.7;
  const startX  = rect.left + rect.width / 2 + xOffset;
  const startY  = rect.top  + rect.height * (0.55 + Math.random() * 0.3);

  // Distance to bottom of viewport plus a margin so it disappears below.
  const fallY  = (window.innerHeight - startY) + 40;
  const driftX = (Math.random() - 0.5) * 50;
  const size   = 5 + Math.random() * 7;
  const dur    = 1.4 + Math.random() * 0.9;

  spark.style.left = startX + "px";
  spark.style.top  = startY + "px";
  spark.style.setProperty("--spark-size",  size + "px");
  spark.style.setProperty("--spark-dur",   dur + "s");
  spark.style.setProperty("--spark-fall",  fallY + "px");
  spark.style.setProperty("--spark-drift", driftX + "px");

  spark.addEventListener("animationend", () => {
    spark.remove();
    if (onLanding) onLanding(startX + driftX);
  });
  document.body.appendChild(spark);
}

// Wrapper-relative spark trail: starts at 70% of the witch's animation,
// runs to 100%, spawns a spark every ~70ms during the sweep. One spark
// in the middle of the sweep is "loaded" — when it hits the ground, it
// triggers a bat burst from its impact point (handled by the onLanding
// callback on spawnGoldenSpark).
function startWitchSparkTrail(wrap, durationSec, delaySec) {
  const sweepStartMs = (delaySec + durationSec * 0.7) * 1000;
  const sweepLengthMs = (durationSec * 0.30) * 1000;

  setTimeout(() => {
    if (!wrap.isConnected) return;
    const interval = setInterval(() => {
      if (!wrap.isConnected) {
        clearInterval(interval);
        return;
      }
      spawnGoldenSpark(wrap);
    }, 70);
    setTimeout(() => clearInterval(interval), sweepLengthMs);
  }, sweepStartMs);

  // Loaded spark — drops mid-sweep and triggers a bat burst on landing.
  setTimeout(() => {
    if (!wrap.isConnected) return;
    spawnGoldenSpark(wrap, (landingX) => spawnBatBurstFromPoint(landingX));
  }, sweepStartMs + sweepLengthMs * 0.4);
}

function spawnSingleWitch({ src, top, size, duration, delay, bob, leader, swingCw, pathClass, witchX, enableSparkTrail }) {
  const wrap = document.createElement("div");
  wrap.className = "witch-fly"
    + (leader ? " witch-fly--leader" : "")
    + (swingCw ? " witch-fly--swing-cw" : "")
    + (pathClass ? " " + pathClass : "");
  wrap.setAttribute("aria-hidden", "true");
  wrap.style.top               = top + "%";
  wrap.style.width             = size + "px";
  wrap.style.height            = Math.round(size * 0.62) + "px";
  wrap.style.animationDuration = duration + "s";
  wrap.style.animationDelay    = (delay || 0) + "s";
  wrap.style.setProperty("--ghost-bob", bob + "px");
  if (typeof witchX === "number") wrap.style.setProperty("--witch-x", witchX + "vw");

  // Spark trail kicks in during her sweep-out phase (70%→100% of the
  // animation), only on the looping paths where the post-swing acceleration
  // exists. Disabled for zigzag/straight/vertical.
  if (enableSparkTrail) {
    startWitchSparkTrail(wrap, duration, delay || 0);
  }

  const sprite = document.createElement("video");
  sprite.className = "witch-fly__sprite";
  sprite.src = src;
  sprite.muted = true;          // required for autoplay alongside our separate cackle audio
  sprite.playsInline = true;
  sprite.autoplay = true;
  sprite.loop = true;
  sprite.preload = "auto";

  // If the video can't load, swap to an icon — and if that also fails,
  // fall back to the inline SVG so the witch always shows up.
  sprite.addEventListener("error", () => {
    const img = document.createElement("img");
    img.className = "witch-fly__sprite";
    img.src = pick(WITCH_VARIANTS);
    img.addEventListener("error", function onImgErr() {
      img.removeEventListener("error", onImgErr);
      img.src = WITCH_ICON_FALLBACK;
    });
    if (sprite.parentNode) sprite.replaceWith(img);
  });

  wrap.appendChild(sprite);
  wrap.addEventListener("animationend", (e) => {
    if (e.target === wrap) wrap.remove();
  });
  document.body.appendChild(wrap);
}

// Spawn the witch squadron: leader at the front, two followers staggered
// behind her. All ride the same flight path (slow entry → 360° swing →
// fast sweep out), separated by short delays so they form a procession.
// Pick a flight path. The squadron all rides the same one per flyby.
function pickWitchPath() {
  const r = Math.random();
  if (r < 0.40) return "loop";       // 40% — full circle loop
  if (r < 0.65) return "zigzag";     // 25% — heavy weave
  if (r < 0.85) return "straight";   // 20% — calm sweep
  if (r < 0.93) return "up";         //  8% — bottom to top
  return "down";                     //  7% — top to bottom
}

function spawnWitch() {
  const path    = pickWitchPath();
  const dur     = 14 + Math.random() * 4;       // 14–18s
  const swingCw = Math.random() < 0.5;          // only used by the loop paths

  // Vertical paths use a CSS variable for horizontal column offsets
  // (followers sit to the left/right of the leader). Horizontal paths
  // use the existing `top` offset for above/below leader formation.
  const isVertical = path === "up" || path === "down";
  // Spark trail only fires on the loop paths because their keyframes are
  // the only ones with a sweep-out phase after the spin.
  const enableSparkTrail = path === "loop";

  let pathClass = null;
  if (path === "zigzag")        pathClass = "witch-fly--path-zigzag";
  else if (path === "straight") pathClass = "witch-fly--path-straight";
  else if (path === "up")       pathClass = "witch-fly--path-up";
  else if (path === "down")     pathClass = "witch-fly--path-down";
  // path === "loop" leaves pathClass null; default keyframes handle it,
  // optionally with the swing-cw modifier flipping direction.

  const baseTop = isVertical
    ? 0                                          // vertical paths anchor at viewport top; keyframes handle Y
    : 38 + Math.random() * 12;                   // 38–50% middle band

  // Leader — anchor of the squadron. (+50% over previous 170–200)
  spawnSingleWitch({
    src: WITCH_LEADER_URL,
    top: baseTop,
    size: 255 + Math.random() * 45,
    duration: dur,
    delay: 0,
    bob: 30 + Math.random() * 12,
    leader: true,
    swingCw: !isVertical && swingCw,
    pathClass,
    witchX: isVertical ? 0 : undefined,
    enableSparkTrail,
  });

  // Follower 1 — well behind. (+50% over previous 130–155)
  spawnSingleWitch({
    src: WITCH_FOLLOWER_URLS[0],
    top: isVertical ? baseTop : Math.max(2, baseTop - 5 - Math.random() * 2),
    size: 195 + Math.random() * 38,
    duration: dur,
    delay: 0.9 + Math.random() * 0.5,
    bob: 26 + Math.random() * 12,
    leader: false,
    swingCw: !isVertical && swingCw,
    pathClass,
    witchX: isVertical ? -7 - Math.random() * 2 : undefined,
    enableSparkTrail,
  });

  // Follower 2 — even further behind. (+50% over previous 130–155)
  spawnSingleWitch({
    src: WITCH_FOLLOWER_URLS[1],
    top: isVertical ? baseTop : Math.min(46, baseTop + 5 + Math.random() * 2),
    size: 195 + Math.random() * 38,
    duration: dur,
    delay: 1.7 + Math.random() * 0.5,
    bob: 26 + Math.random() * 12,
    leader: false,
    swingCw: !isVertical && swingCw,
    pathClass,
    witchX: isVertical ? 7 + Math.random() * 2 : undefined,
    enableSparkTrail,
  });

  // Cackle synced with the leader's entry.
  setTimeout(playWitchLaugh, 280);

  // Always spawn ~4 bats around the witches — they share the same vertical
  // band (or upper half for vertical paths) so the squadron feels surrounded.
  spawnBatsAroundWitches(baseTop, isVertical);

  // Squadron is fully gone when the last follower finishes.
  return dur + 1.4;
}

// ─── Animated bat (video variant) ───
// Reuses the ghost-fly path keyframes so bats can fly anywhere on screen.
// Picks a random video clip from the pool per spawn so the flock looks varied.
function spawnVideoBat({ pathClass, delay }) {
  const wrap = document.createElement("div");
  wrap.className = "ghost-fly bat-fly bat-video " + pathClass;
  wrap.setAttribute("aria-hidden", "true");

  const top  = 6 + Math.random() * 74;
  const size = 122 + Math.random() * 88;      // 122–210px (+35% over previous 90–155 range)
  const dur  = 7 + Math.random() * 5;         // 7–12s
  const bob  = 22 + Math.random() * 22;

  wrap.style.top               = top + "%";
  wrap.style.width             = size + "px";
  wrap.style.animationDuration = dur + "s";
  wrap.style.animationDelay    = delay + "s";
  wrap.style.setProperty("--ghost-bob", bob + "px");

  const v = document.createElement("video");
  v.className = "halloween-video-sprite";
  v.src = pick(BAT_VIDEO_URLS);
  v.muted = true;
  v.playsInline = true;
  v.autoplay = true;
  v.loop = true;
  v.preload = "auto";
  wrap.appendChild(v);

  wrap.addEventListener("animationend", (e) => {
    if (e.target === wrap) wrap.remove();
  });
  document.body.appendChild(wrap);
  return dur + delay;
}

// Spawn a flock of N bats with random paths, sizes, and entry delays so
// they look like they're scattering across the viewport rather than
// marching in formation.
function spawnBatFlock(count) {
  const n = count || (5 + Math.floor(Math.random() * 4));   // 5–8 bats by default (-35% from prior 8–12)
  for (let i = 0; i < n; i++) {
    spawnVideoBat({
      pathClass: pick(PATH_CLASSES),
      delay: i * 0.2 + Math.random() * 0.7,
    });
  }
}

// Bats positioned in a tight band around the witch squadron, so they look
// like they're flying with/around the witches rather than scattered across
// the whole viewport.
function spawnBatsAroundWitches(baseTop, isVertical) {
  const count = 3;   // -35% from prior 4
  for (let i = 0; i < count; i++) {
    const wrap = document.createElement("div");
    wrap.className = "ghost-fly bat-fly bat-video " + pick(PATH_CLASSES);
    wrap.setAttribute("aria-hidden", "true");

    // For horizontal paths, hug the leader's vertical band ±10% so the
    // bats orbit the squadron instead of scattering. For vertical paths,
    // pick anywhere in the upper-half since the witches traverse all of it.
    const top = isVertical
      ? 8 + Math.random() * 60
      : Math.max(4, Math.min(82, baseTop + (Math.random() * 20 - 10)));
    const size = 100 + Math.random() * 60;     // 100–160px (slightly tighter than the wider flock)
    const dur  = 8 + Math.random() * 4;        // 8–12s
    const bob  = 22 + Math.random() * 22;
    const delay = i * 0.35 + Math.random() * 0.4;

    wrap.style.top               = top + "%";
    wrap.style.width             = size + "px";
    wrap.style.animationDuration = dur + "s";
    wrap.style.animationDelay    = delay + "s";
    wrap.style.setProperty("--ghost-bob", bob + "px");

    const v = document.createElement("video");
    v.className = "halloween-video-sprite";
    v.src = pick(BAT_VIDEO_URLS);
    v.muted = true;
    v.playsInline = true;
    v.autoplay = true;
    v.loop = true;
    v.preload = "auto";
    wrap.appendChild(v);

    wrap.addEventListener("animationend", (e) => {
      if (e.target === wrap) wrap.remove();
    });
    document.body.appendChild(wrap);
  }
}

// ─── Bat burst from a ground point ───
// Fired when one of the witch's golden sparks hits the ground. Bats erupt
// upward and outward in a fan from the impact point, each on its own path,
// then fade as they travel off-screen. Visual narrative: spark = summon.
function spawnBatBurstFromPoint(landingX) {
  if (document.hidden || !isHalloweenEnabled()) return;
  const count = 14 + Math.floor(Math.random() * 6);   // 14–19 bats (was 6–10)
  for (let i = 0; i < count; i++) {
    const wrap = document.createElement("div");
    wrap.className = "bat-burst";
    wrap.setAttribute("aria-hidden", "true");

    // Fan upward and outward. End offsets are relative to the landing
    // point (which we anchor with left + bottom 0). Wider lateral spread
    // so the eruption covers the dashboard, not just one side.
    const endX = (Math.random() - 0.5) * 2400;             // -1200 to +1200px lateral
    const endY = -(420 + Math.random() * 680);             // -420 to -1100px upward
    const dur  = 4 + Math.random() * 3;                    // 4–7s
    const size = 60 + Math.random() * 50;                  // 60–110px
    const spin = (Math.random() - 0.5) * 30;
    const delay = i * 0.04 + Math.random() * 0.10;

    wrap.style.left   = landingX + "px";
    wrap.style.bottom = "0";
    wrap.style.width  = size + "px";
    wrap.style.height = size + "px";
    wrap.style.setProperty("--bat-end-x", endX + "px");
    wrap.style.setProperty("--bat-end-y", endY + "px");
    wrap.style.setProperty("--bat-spin",  spin + "deg");
    wrap.style.animationDuration = dur + "s";
    wrap.style.animationDelay    = delay + "s";

    const v = document.createElement("video");
    v.className = "halloween-video-sprite";
    v.src = pick(BAT_VIDEO_URLS);
    v.muted = true;
    v.playsInline = true;
    v.autoplay = true;
    v.loop = true;
    v.preload = "auto";
    wrap.appendChild(v);

    wrap.addEventListener("animationend", (e) => {
      if (e.target === wrap) wrap.remove();
    });
    document.body.appendChild(wrap);
  }

  // Alongside the ground-fan, scatter a free-flight flock across the whole
  // viewport so the bats aren't visually clumped at the spark's landing
  // point — they should blanket the dashboard.
  spawnBatFlock(7 + Math.floor(Math.random() * 4));   // 7–10 extra wide-distributed bats

  // Rare crossover: ~1 in 5 witch bursts pulls another cast member in for a
  // brief multi-character moment. Fires after a short beat so it reads as
  // "the ruckus drew them out", not as part of the same explosion.
  if (Math.random() < 0.2) {
    const ALLIES = ["chase", "band"];
    const allyId = pick(ALLIES);
    const ally   = SCENE_CAST.find(c => c.id === allyId);
    if (ally) setTimeout(() => _fireScene(ally), 700);
  }

  pushScene(7000);
}

// Light "stray bat" loop — keeps a faint sense of motion between witch
// flybys without competing with the burst moment as the bats' main beat.
function scheduleBatFlock() {
  function next() {
    const delay = (1.5 * 60 * 1000) + Math.random() * (30 * 1000);   // 1.5–2 min
    setTimeout(() => {
      if (!document.hidden && isHalloweenEnabled()) {
        spawnBatFlock(1 + Math.floor(Math.random() * 2));   // 1–2 stray bats
        pushScene(5000);
      }
      next();
    }, delay);
  }
  // First flock ~30–45s after mount.
  setTimeout(() => {
    if (!document.hidden && isHalloweenEnabled()) {
      spawnBatFlock(1 + Math.floor(Math.random() * 2));
      pushScene(5000);
    }
    next();
  }, 30000 + Math.random() * 15000);   // first stray bat 30–45s after mount
}

// ─── Running skeleton chased by a zombie ───
// Both videos sprint across the lower portion of the viewport in the same
// direction. The zombie spawns slightly later so he reads as "behind". They
// use bottom-based positioning so feet stay at ground level no matter how
// large the sprite is, and each carries a speech bubble for character.
function spawnSkeletonChase() {
  const direction  = Math.random() < 0.5 ? "chase--ltr" : "chase--rtl";
  // Fixed baseline so skeleton, zombie, and the grave obstacle all sit on
  // the same straight line. Grave's wrap uses bottom:0; we match it here.
  const baseBottom = 0;
  const dur        = 9 + Math.random() * 4;   // 9–13s

  // 1 in 3 chases includes a grave obstacle the skeleton has to vault.
  // Skeleton uses jumping keyframes; zombie keeps lumbering through.
  const hasGraveObstacle = Math.random() < 0.33;

  // Spawn-gap floor bumped up so the zombie never overlaps the skeleton,
  // while still keeping him close enough to read as actively chasing.
  //   ~30% close   (0.35–0.55s)
  //   ~40% medium  (0.55–0.80s)
  //   ~30% long    (0.80–1.10s)
  let zombieSpawnGap;
  const r = Math.random();
  if      (r < 0.30) zombieSpawnGap = 0.35 + Math.random() * 0.20;
  else if (r < 0.70) zombieSpawnGap = 0.55 + Math.random() * 0.25;
  else               zombieSpawnGap = 0.80 + Math.random() * 0.30;

  function entity(src, className, opts) {
    const wrap = document.createElement("div");
    wrap.className = "chase-fly " + className + " " + direction
      + (opts.extraClass ? " " + opts.extraClass : "");
    wrap.setAttribute("aria-hidden", "true");
    wrap.style.bottom            = opts.bottom + "%";
    wrap.style.width             = opts.size + "px";
    wrap.style.animationDuration = opts.duration + "s";
    wrap.style.animationDelay    = opts.delay + "s";

    if (opts.bubbleText) {
      const bubble = document.createElement("span");
      bubble.className = "chase-bubble chase-bubble--" + opts.bubbleVariant;
      bubble.textContent = opts.bubbleText;
      // Delay the bubble so it doesn't fire the moment the sprite enters frame
      // — characters run silently for a beat, then vocalize.
      bubble.style.animationDelay = (opts.bubbleDelay || 0) + "s";
      wrap.appendChild(bubble);
    }

    const v = document.createElement("video");
    v.className = "halloween-video-sprite";
    v.src = src;
    v.muted = true;
    v.playsInline = true;
    v.autoplay = true;
    v.loop = true;
    v.preload = "auto";
    wrap.appendChild(v);

    wrap.addEventListener("animationend", (e) => {
      if (e.target === wrap) wrap.remove();
    });
    document.body.appendChild(wrap);
    return wrap;
  }

  // Skeleton cries out 2–3s into the chase, after he's clearly running.
  const skeletonBubbleAt = 2 + Math.random();
  // Zombie growls back 2–3s after the skeleton's bubble appears — long
  // enough that the skeleton's text has mostly faded by the time the
  // zombie's pops in, so they read as call-and-response. Both bubbles'
  // animation-delays are relative to when their elements enter the DOM
  // (the same instant), so this is a direct offset.
  const zombieBubbleAt = skeletonBubbleAt + 2 + Math.random();

  // Skeleton (lead, panicking). Use jumping keyframes when there's a grave
  // to vault — class targets `.chase-skeleton.chase--with-obstacle.chase--ltr`.
  const skeletonWrap = entity(RUNNING_SKELETON_URL, "chase-skeleton", {
    bottom: baseBottom,
    size: 220 + Math.random() * 50,           // 220–270px
    delay: 0,
    duration: dur,
    bubbleText: pick(SKELETON_BUBBLES),
    bubbleVariant: "skeleton",
    bubbleDelay: skeletonBubbleAt,
    extraClass: hasGraveObstacle ? "chase--with-obstacle" : null,
  });
  wireSpriteClick(skeletonWrap, SKELETON_CLICK_QUOTES);

  // Zombie (slightly behind and slightly larger for menace). Doesn't jump
  // — he just plows through the grave even when one is present. Same
  // baseBottom as the skeleton so the two stay on a single straight line.
  const zombieWrap = entity(ZOMBIE_URL, "chase-zombie", {
    bottom: baseBottom,
    size: 240 + Math.random() * 50,           // 240–290px
    delay: zombieSpawnGap,
    duration: dur + 0.3,
    bubbleText: pick(ZOMBIE_BUBBLES),
    bubbleVariant: "zombie",
    bubbleDelay: zombieBubbleAt,
  });
  wireSpriteClick(zombieWrap, ZOMBIE_CLICK_QUOTES);

  // Grave obstacle: lock the spawn to the skeleton's jump moment in
  // wallclock, not to a percentage of dur. The grave webm has a fixed
  // internal rise animation (~GRAVE_RISE_LEAD_MS), so the gravestone
  // needs to start that many ms before the skeleton arrives at peak
  // (56% of dur, where the jump apex sits). Direction matters: LTR
  // skeleton peaks at 59vw, RTL skeleton peaks at 41vw, so the grave
  // is placed accordingly to stay under the apex.
  if (hasGraveObstacle) {
    const GRAVE_RISE_LEAD_MS = 2500;
    const jumpPeakMs   = dur * 0.56 * 1000;
    const graveSpawnMs = Math.max(0, jumpPeakMs - GRAVE_RISE_LEAD_MS);
    setTimeout(() => {
      if (!document.hidden && isHalloweenEnabled()) {
        spawnGraveObstacle(direction);
      }
    }, graveSpawnMs);
  }

  // Skeleton's panic-cry plays in a loop while he's running. It starts
  // after a brief delay so it kicks in once he's clearly in motion, and
  // hangs on for ~1s after the chase visuals end.
  const totalChaseMs = (dur + 0.75) * 1000;
  startSkeleCryForChase(totalChaseMs);

  return dur + 0.75;
}

// ─── Skeleton band: guitar player + dancer side by side ───
// Pops up in a random bottom corner. Guitarist is the anchor; the dancer
// stands right next to him, vibing along. They share an entry/exit fade.
function spawnSkeletonBand() {
  if (document.hidden) return;
  if (!isHalloweenEnabled()) return;

  // Random horizontal anchor: pick a side AND a random offset so the band
  // doesn't always show up at the same corner.
  const isRight = Math.random() < 0.5;
  const offsetPct = 4 + Math.random() * 60;     // 4–64% from the chosen edge

  const wrap = document.createElement("div");
  wrap.className = "skeleton-band " + (isRight ? "skeleton-band--right" : "skeleton-band--left");
  wrap.setAttribute("aria-hidden", "true");
  if (isRight) wrap.style.right = offsetPct + "%";
  else         wrap.style.left  = offsetPct + "%";

  function makeVideo(src, extraClass) {
    const v = document.createElement("video");
    v.className = "skeleton-band__member " + extraClass;
    v.src = src;
    v.muted = true;
    v.playsInline = true;
    v.autoplay = true;
    v.loop = true;
    v.preload = "auto";
    return v;
  }

  function wrapBandMember(video) {
    const span = document.createElement("span");
    span.className = "skeleton-band__slot";
    span.appendChild(video);
    return span;
  }

  const guitar     = makeVideo(GUITAR_SKELETON_URL,  "skeleton-band__guitar");
  const dancer     = makeVideo(DANCING_SKELETON_URL, "skeleton-band__dancer");
  const guitarSlot = wrapBandMember(guitar);
  const dancerSlot = wrapBandMember(dancer);

  // Order in the DOM = visual left-to-right. We always want the dancer on
  // the OUTER side and the guitarist on the INNER side, so the pair faces
  // toward the centre of the screen rather than off-screen. The dancer's
  // source clip naturally faces one direction; we flip her when she's on
  // the LEFT of the guitarist so she keeps facing him either way.
  if (isRight) {
    // Band at bottom-right: dancer on LEFT of guitarist → flip to face right.
    dancer.classList.add("skeleton-band__dancer--flip");
    wrap.appendChild(dancerSlot);
    wrap.appendChild(guitarSlot);
  } else {
    // Band at bottom-left: dancer on RIGHT of guitarist → natural facing.
    wrap.appendChild(guitarSlot);
    wrap.appendChild(dancerSlot);
  }

  document.body.appendChild(wrap);

  // Each band member responds to one click during this appearance.
  wireSpriteClick(guitarSlot, GUITARIST_CLICK_QUOTES);
  wireSpriteClick(dancerSlot, DANCER_CLICK_QUOTES);

  // Start the riff the instant the band appears — no delay.
  startGuitaristRiff();

  const visibleMs = 6000 + Math.random() * 3000;    // 6–9s on screen (50% of previous)
  setTimeout(() => {
    wrap.classList.add("is-leaving");
    // Riff cuts the moment they start exiting, before the fade animation finishes.
    stopGuitaristRiff();
    setTimeout(() => wrap.remove(), 1200);
  }, visibleMs);
}

// ─── Egypt mummy (lumbering walk across the bottom) ───
// Reuses the chase keyframes for a slow horizontal sprint. Lower z-index
// than the chase so if they ever co-occur he reads as background.
function spawnEgyptMummy() {
  if (document.hidden || !isHalloweenEnabled()) return;

  const direction = Math.random() < 0.5 ? "chase--ltr" : "chase--rtl";
  const wrap = document.createElement("div");
  wrap.className = "chase-fly chase-mummy " + direction;
  wrap.setAttribute("aria-hidden", "true");
  wrap.style.bottom            = "0";                              // grounded — feet at viewport bottom
  wrap.style.width             = (220 + Math.random() * 60) + "px"; // 220–280px
  wrap.style.animationDuration = (16 + Math.random() * 4) + "s";   // 16–20s lumbering walk

  const v = document.createElement("video");
  v.className = "halloween-video-sprite";
  v.src = EGYPT_MUMMY_URL;
  v.muted = true;
  v.playsInline = true;
  v.autoplay = true;
  v.loop = true;
  v.preload = "auto";
  wrap.appendChild(v);

  wrap.addEventListener("animationend", (e) => {
    if (e.target === wrap) wrap.remove();
  });
  document.body.appendChild(wrap);
  wireSpriteClick(wrap, MUMMY_CLICK_QUOTES);
}

// ─── Grave obstacle (single-play, mid-chase) ───
// Spawned only as part of the skeleton chase scenario (1 in 3 chases).
// Position depends on chase direction so it lands directly under the
// skeleton's jump apex. Its video plays through ONCE — when it ends, the
// element fades and is removed. No looping.
function spawnGraveObstacle(direction) {
  if (document.hidden || !isHalloweenEnabled()) return;

  const wrap = document.createElement("div");
  wrap.className = "grave-cameo grave-cameo--obstacle";
  wrap.setAttribute("aria-hidden", "true");
  // Skeleton's jump apex sits at 56% of his chase animation: that maps
  // to 59vw on LTR runs and 41vw on RTL runs. The grave is 180px wide,
  // so subtract 90px from the apex x to centre it under him.
  const apexVw = direction === "chase--rtl" ? 41 : 59;
  wrap.style.bottom = "0";
  wrap.style.left   = "calc(" + apexVw + "vw - 90px)";

  const v = document.createElement("video");
  v.className = "halloween-video-sprite";
  v.src = GRAVE_URL;
  v.muted = true;
  v.playsInline = true;
  v.autoplay = true;
  v.loop = false;            // play once and stop
  v.preload = "auto";
  v.addEventListener("ended", () => {
    if (!wrap.isConnected) return;
    wrap.classList.add("is-leaving");
    setTimeout(() => wrap.remove(), 700);
  });
  wrap.appendChild(v);

  document.body.appendChild(wrap);
}

// Dev-only toggle. Reads/writes localStorage so the choice persists across
// reloads. When "off" the flyby scheduler keeps ticking but bails out, and
// the vignette + button switch into a faded normal-mode look.
const HALLOWEEN_FLAG_KEY = "halloweenDevMode";
function isHalloweenEnabled() {
  try {
    const v = localStorage.getItem(HALLOWEEN_FLAG_KEY);
    // Default to ON (this whole module only loads for dev accounts already).
    return v === null ? true : v === "on";
  } catch { return true; }
}

// ─── Scene rotator ───
// Single coordinator that decides which featured animation fires next.
// Each cast member has its own cooldown range; the rotator picks among
// the eligible (cooled-down) members weighted by time-since-last-fire,
// with a hard rule: never fire the same one twice in a row. Bats stay
// on their own ambient loop and are NOT part of this rotation.
const SCENE_CAST = [
  {
    id: "chase",
    cooldownMin: 2.5 * 60 * 1000,
    cooldownMax: 3.5 * 60 * 1000,
    fire() {
      const dur = spawnSkeletonChase();
      pushScene(Math.min(13000, Math.ceil(dur * 1000)));
    },
  },
  {
    id: "witch",
    cooldownMin: 2 * 60 * 1000,
    cooldownMax: 3 * 60 * 1000,
    fire() {
      const dur = spawnWitch();
      pushScene(Math.min(16000, Math.ceil(dur * 1000)));
      // Bats no longer ride alongside as an escort — they erupt from the
      // ground when one of her golden sparks lands (loop-path flybys
      // only, where the spark trail is enabled). See startWitchSparkTrail.
    },
  },
  {
    id: "mummy",
    cooldownMin: 3.5 * 60 * 1000,
    cooldownMax: 4 * 60 * 1000,
    fire() {
      spawnEgyptMummy();
      pushScene(12000);
    },
  },
  {
    id: "band",
    cooldownMin: 4 * 60 * 1000,
    cooldownMax: 4.5 * 60 * 1000,
    fire() {
      spawnSkeletonBand();
      pushScene(9000);
    },
  },
];

// First witch flyby fires 40s after the welcome modal closes — gives the
// user a calm window before the cinematic ramp-up — then the rest of the
// burst follows. Mummy is held back so the welcome window doesn't dump
// the entire cast at once.
const SCENE_WELCOME_BURST = [
  { id: "witch", at: 40000 },
  { id: "chase", at: 61000 },
  { id: "band",  at: 91000 },
];

const SCENE_TICK_MS = 15000;
const _sceneLastFireAt = new Map();
let _sceneLastFiredId  = null;

function _pickNextScene(now) {
  const eligible = SCENE_CAST.filter(c => {
    if (c.id === _sceneLastFiredId) return false;
    const last = _sceneLastFireAt.has(c.id) ? _sceneLastFireAt.get(c.id) : -Infinity;
    return now - last >= c.cooldownMin;
  });
  if (eligible.length === 0) return null;

  // Weight = how far past cooldownMin we are, relative to the cooldown
  // window. Members that have waited longest get the highest pick chance.
  const weights = eligible.map(c => {
    const last    = _sceneLastFireAt.has(c.id) ? _sceneLastFireAt.get(c.id) : 0;
    const overdue = Math.max(0, now - last - c.cooldownMin);
    const window  = c.cooldownMax - c.cooldownMin || 1;
    return 1 + Math.min(1, overdue / window) * 4;   // 1×–5× weight
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < eligible.length; i++) {
    r -= weights[i];
    if (r <= 0) return eligible[i];
  }
  return eligible[eligible.length - 1];
}

function _fireScene(cast) {
  if (document.hidden || !isHalloweenEnabled()) return;
  cast.fire();
  _sceneLastFireAt.set(cast.id, Date.now());
  _sceneLastFiredId = cast.id;
}

function startSceneRotator(greetingClosedPromise = Promise.resolve()) {
  // Wait for the greeting modal to close before kicking off the welcome
  // burst — the first burst should fire AFTER the modal auto-dismisses
  // (or the user closes it), not while it's still on screen.
  greetingClosedPromise.then(() => {
    // Pre-record the welcome burst's scheduled fire times in
    // _sceneLastFireAt so an early steady-state tick can't pick a cast
    // member that's about to fire from the burst.
    const startedAt = Date.now();
    SCENE_WELCOME_BURST.forEach(({ id, at }) => {
      _sceneLastFireAt.set(id, startedAt + at);
    });

    // Welcome burst — overrides cooldowns to seed variety quickly.
    SCENE_WELCOME_BURST.forEach(({ id, at }) => {
      setTimeout(() => {
        const cast = SCENE_CAST.find(c => c.id === id);
        if (cast) _fireScene(cast);
      }, at);
    });

    // Steady-state tick. Each wake-up considers eligible cast members and
    // picks one weighted by overdue-ness. Skips silently when nothing has
    // cooled down yet, when the tab is hidden, or when halloween is off.
    setInterval(() => {
      const next = _pickNextScene(Date.now());
      if (next) _fireScene(next);
    }, SCENE_TICK_MS);
  });
}

function scheduleGhostFlybys(greetingClosedPromise) {
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  } catch {}

  prepareAudio();
  installHalloweenToggle();
  scheduleBatFlock();                            // ambient texture — runs independently of the rotator
  startSceneRotator(greetingClosedPromise);      // chase / witch / mummy / band — coordinated; waits for modal close
}

// Floating dev-only toggle. Halloween / Normal. Persists to localStorage.
function installHalloweenToggle() {
  if (document.getElementById("halloweenToggle")) return;

  const btn = document.createElement("button");
  btn.id = "halloweenToggle";
  btn.type = "button";
  btn.className = "halloween-toggle";
  btn.setAttribute("aria-label", "Toggle Halloween mode");
  btn.innerHTML = '<span class="halloween-toggle__ico">🎃</span>';

  function syncState() {
    const on = isHalloweenEnabled();
    btn.classList.toggle("is-on",  on);
    btn.classList.toggle("is-off", !on);
    btn.title = on ? "Halloween mode — click to switch to normal" : "Normal mode — click to switch to Halloween";
    document.body.classList.toggle("halloween-mode-off", !on);
    if (!on) {
      // Remove any active vignette so the page snaps back to normal.
      document.getElementById("ghostHorrorOverlay")?.classList.remove("is-active");
      // Cancel any in-flight skele-cry so the audio stops along with visuals.
      if (skeleCryStartTimer) { clearTimeout(skeleCryStartTimer); skeleCryStartTimer = null; }
      if (skeleCryStopTimer)  { clearTimeout(skeleCryStopTimer);  skeleCryStopTimer  = null; }
      try { skeleCryAudio?.pause(); if (skeleCryAudio) skeleCryAudio.currentTime = 0; } catch {}
      // Snap the guitarist riff off too if the band is mid-show.
      stopGuitaristRiff();
    }
  }

  btn.addEventListener("click", () => {
    const next = !isHalloweenEnabled();
    try { localStorage.setItem(HALLOWEEN_FLAG_KEY, next ? "on" : "off"); } catch {}
    syncState();
  });

  document.body.appendChild(btn);
  syncState();
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

    /* witch on broomstick — bigger, slower, with a slight broom tilt */
    .witch-fly {
      position: fixed;
      top: 0;
      left: 0;
      pointer-events: none;
      user-select: none;
      z-index: 9991;
      opacity: 0;
      will-change: transform, opacity;
      animation-timing-function: linear;       /* loop is constant-speed; entry & exit override per-keyframe */
      animation-fill-mode: both;
      animation-iteration-count: 1;
      /* Pivot the spin from the lower-middle of the wrapper so the swing
         visibly orbits around her body instead of appearing to spin from her head. */
      transform-origin: 50% 68%;
    }
    /* Golden spark trail — shed by the witch during her sweep-out phase.
       Each spark falls straight to the bottom of the viewport at full
       opacity. Body's overflow:hidden visually "swallows" them at the
       bottom edge so they don't disappear, they vanish off-screen. */
    .witch-spark {
      position: fixed;
      width:  var(--spark-size, 7px);
      height: var(--spark-size, 7px);
      border-radius: 50%;
      pointer-events: none;
      z-index: 9990;
      transform: translate(-50%, -50%);
      background: radial-gradient(circle,
        rgba(255, 240, 170, 1)  0%,
        rgba(255, 200,  80, 0.9) 35%,
        rgba(255, 160,  40, 0.6) 65%,
        rgba(255, 140,  20, 0.0) 100%);
      filter:
        blur(0.5px)
        drop-shadow(0 0 6px rgba(255, 200, 80, 0.85))
        drop-shadow(0 0 14px rgba(255, 140, 30, 0.55));
      animation: witchSparkFall var(--spark-dur, 1.6s) cubic-bezier(0.4, 0, 0.7, 1) forwards;
      will-change: transform;
    }
    @keyframes witchSparkFall {
      0%   { transform: translate(-50%, -50%); }
      100% {
        transform: translate(
          calc(-50% + var(--spark-drift, 0px)),
          calc(-50% + var(--spark-fall, 800px))
        );
      }
    }

    /* Bat burst — fired when a loaded golden spark lands. Each bat starts
       at the impact point (left set inline, anchored to bottom: 0) and
       arcs outward/upward to its end offset, fading as it goes. The
       inner video fills the wrapper; the wrapper carries the motion. */
    .bat-burst {
      position: fixed;
      pointer-events: none;
      z-index: 9990;
      opacity: 0;
      will-change: transform, opacity;
      animation-name: batBurst;
      animation-timing-function: cubic-bezier(0.2, 0.65, 0.4, 1);
      animation-fill-mode: forwards;
    }
    .bat-burst > video {
      width: 100%;
      height: 100%;
      display: block;
    }
    @keyframes batBurst {
      0%   { transform: translate(-50%, 0) scale(0.4) rotate(0deg); opacity: 0; }
      8%   { opacity: 1; }
      88%  { opacity: 1; }
      100% {
        transform:
          translate(calc(-50% + var(--bat-end-x, 0px)), var(--bat-end-y, -100vh))
          scale(1)
          rotate(var(--bat-spin, 0deg));
        opacity: 0;
      }
    }

    /* Default path is the CCW circular loop. Modifier classes pick another. */
    .witch-fly { animation-name: witchFlySquadron; }
    .witch-fly--swing-cw      { animation-name: witchFlySquadronCw; }
    .witch-fly--path-zigzag   { animation-name: witchFlyZigzag; }
    .witch-fly--path-straight { animation-name: witchFlyStraight; }
    .witch-fly--path-up       { animation-name: witchFlyUp; }
    .witch-fly--path-down     { animation-name: witchFlyDown; }
    .witch-fly--leader {
      filter: drop-shadow(0 8px 22px rgba(124, 50, 220, 0.55))
              drop-shadow(0 0 28px rgba(168, 85, 247, 0.30));
    }
    /* Leader source clip is mirrored from the followers — flip her horizontally
       so she actually faces the direction the squadron is flying. */
    .witch-fly--leader .witch-fly__sprite {
      transform: scaleX(-1);
    }
    .witch-fly--leader::before { width: 220px; height: 12px; right: 70%; }
    .witch-fly--leader::after  { width: 130px; height: 6px;  right: 72%; }

    .witch-fly__sprite {
      width: 100%;
      height: auto;
      display: block;
      filter: drop-shadow(0 6px 14px rgba(124, 50, 220, 0.45))
              drop-shadow(0 0 16px rgba(168, 85, 247, 0.22));
    }

    /* Subtle glowing trail behind the broom — natural, not glaring. */
    .witch-fly::before {
      content: "";
      position: absolute;
      top: 58%;
      right: 72%;
      width: 160px;
      height: 10px;
      transform: translateY(-50%);
      border-radius: 999px;
      background: linear-gradient(to left,
        rgba(168, 85, 247, 0.65) 0%,
        rgba(124, 107, 255, 0.40) 35%,
        rgba(168, 85, 247, 0.10) 75%,
        rgba(168, 85, 247, 0)    100%);
      filter: blur(7px);
      animation: witchTrailPulse 0.85s ease-in-out infinite;
      pointer-events: none;
    }
    .witch-fly::after {
      content: "";
      position: absolute;
      top: 58%;
      right: 74%;
      width: 95px;
      height: 5px;
      transform: translateY(-50%);
      border-radius: 999px;
      background: linear-gradient(to left,
        rgba(255, 230, 255, 0.55) 0%,
        rgba(168, 85, 247, 0.30) 45%,
        rgba(168, 85, 247, 0)    100%);
      filter: blur(3px);
      animation: witchTrailPulse 0.6s ease-in-out infinite;
      pointer-events: none;
    }

    @keyframes witchTrailPulse {
      0%, 100% { opacity: 0.55; }
      50%      { opacity: 0.85; }
    }

    /* Squadron path — three phases:
         0–25%   : ease-out entry from off-screen left
         25–70%  : full 360° circular loop, traced at constant speed.
                   Witch ends back at her loop-start position; sprite rotates
                   one full turn matching the path tangent.
         70–100% : cubic-bezier ease-out — fast immediate sweep right out of frame.
       Entry and exit phases override the wrapper's linear timing per-keyframe. */
    @keyframes witchFlySquadron {
      0% {
        transform: translate(-26vw, 0) rotate(-6deg);
        opacity: 0;
        animation-timing-function: cubic-bezier(0.25, 0, 0.4, 1);
      }
      25% {
        /* Loop start: cruising at (22vw, 0), facing right. Inherits linear from here. */
        transform: translate(22vw, 0) rotate(-6deg);
        opacity: 1;
      }
      /* Loop quarters — counter-clockwise full circle around (22vw, -5vw). */
      31% { transform: translate(25.5vw, -1.5vw) rotate(-51deg); }   /*  45° */
      36% { transform: translate(27vw,   -5vw)   rotate(-96deg); }   /*  90° — right side, moving up */
      42% { transform: translate(25.5vw, -8.5vw) rotate(-141deg); }  /* 135° */
      48% { transform: translate(22vw,   -10vw)  rotate(-186deg); }  /* 180° — top, inverted */
      54% { transform: translate(18.5vw, -8.5vw) rotate(-231deg); }  /* 225° */
      59% { transform: translate(17vw,   -5vw)   rotate(-276deg); }  /* 270° — left side, moving down */
      65% { transform: translate(18.5vw, -1.5vw) rotate(-321deg); }  /* 315° */
      70% {
        /* Loop complete at (22vw, 0), one full rotation done. Snap into the sweep. */
        transform: translate(22vw, 0) rotate(-366deg);
        animation-timing-function: cubic-bezier(0.2, 0.85, 0.4, 1);
      }
      100% {
        transform: translate(135vw, 0) rotate(-366deg);
        opacity: 0;
      }
    }

    /* Same path, but the loop swings in the opposite direction (clockwise).
       The squadron picks one direction per flyby via the JS so all witches
       in the formation swing the same way. */
    @keyframes witchFlySquadronCw {
      0% {
        transform: translate(-26vw, 0) rotate(6deg);
        opacity: 0;
        animation-timing-function: cubic-bezier(0.25, 0, 0.4, 1);
      }
      25% {
        transform: translate(22vw, 0) rotate(6deg);
        opacity: 1;
      }
      31% { transform: translate(18.5vw, -1.5vw) rotate(51deg); }
      36% { transform: translate(17vw,   -5vw)   rotate(96deg); }
      42% { transform: translate(18.5vw, -8.5vw) rotate(141deg); }
      48% { transform: translate(22vw,   -10vw)  rotate(186deg); }
      54% { transform: translate(25.5vw, -8.5vw) rotate(231deg); }
      59% { transform: translate(27vw,   -5vw)   rotate(276deg); }
      65% { transform: translate(25.5vw, -1.5vw) rotate(321deg); }
      70% {
        transform: translate(22vw, 0) rotate(366deg);
        animation-timing-function: cubic-bezier(0.2, 0.85, 0.4, 1);
      }
      100% {
        transform: translate(135vw, 0) rotate(366deg);
        opacity: 0;
      }
    }

    /* Zigzag — heavy weave across the viewport, no looping. */
    @keyframes witchFlyZigzag {
      0%   { transform: translate(-26vw, 0)         rotate(-5deg);   opacity: 0; animation-timing-function: cubic-bezier(0.25, 0, 0.4, 1); }
      10%  { opacity: 1; }
      22%  { transform: translate(15vw,  -7vw)      rotate(-15deg); }
      38%  { transform: translate(35vw,   7vw)      rotate(8deg); }
      55%  { transform: translate(55vw,  -8vw)      rotate(-15deg); }
      72%  { transform: translate(78vw,   5vw)      rotate(7deg); }
      88%  { transform: translate(100vw, -5vw)      rotate(-12deg); opacity: 1; }
      100% { transform: translate(135vw, 0)         rotate(-5deg);  opacity: 0; }
    }

    /* Straight — calm horizontal sweep with a tiny dip. */
    @keyframes witchFlyStraight {
      0%   { transform: translate(-26vw, 0)         rotate(-4deg);  opacity: 0; animation-timing-function: cubic-bezier(0.25, 0, 0.4, 1); }
      10%  { opacity: 1; }
      40%  { transform: translate(35vw,  -2vw)      rotate(-3deg); }
      70%  { transform: translate(80vw,   1.5vw)    rotate(-5deg); }
      90%  { opacity: 1; }
      100% { transform: translate(135vw, 0)         rotate(-4deg);  opacity: 0; }
    }

    /* Vertical — bottom to top. Witch enters below the viewport, swings
       up through center with a slight S-curve, exits off the top. The
       --witch-x CSS variable lets followers offset horizontally. */
    @keyframes witchFlyUp {
      0%   { transform: translate(calc(50vw + var(--witch-x, 0vw)), 110vh) rotate(-90deg); opacity: 0; animation-timing-function: cubic-bezier(0.25, 0, 0.4, 1); }
      12%  { opacity: 1; }
      35%  { transform: translate(calc(50vw + var(--witch-x, 0vw) - 4vw), 50vh)  rotate(-83deg); }
      65%  { transform: translate(calc(50vw + var(--witch-x, 0vw) + 3vw),  -2vh) rotate(-97deg); }
      88%  { opacity: 1; }
      100% { transform: translate(calc(50vw + var(--witch-x, 0vw)), -25vh)  rotate(-90deg); opacity: 0; }
    }

    /* Vertical — top to bottom. Mirror of witchFlyUp. */
    @keyframes witchFlyDown {
      0%   { transform: translate(calc(50vw + var(--witch-x, 0vw)), -25vh) rotate(90deg); opacity: 0; animation-timing-function: cubic-bezier(0.25, 0, 0.4, 1); }
      12%  { opacity: 1; }
      35%  { transform: translate(calc(50vw + var(--witch-x, 0vw) + 4vw), 25vh) rotate(83deg); }
      65%  { transform: translate(calc(50vw + var(--witch-x, 0vw) - 3vw), 75vh) rotate(97deg); }
      88%  { opacity: 1; }
      100% { transform: translate(calc(50vw + var(--witch-x, 0vw)), 110vh) rotate(90deg); opacity: 0; }
    }

    /* floating dev toggle: halloween / normal */
    .halloween-toggle {
      position: fixed;
      bottom: 18px;
      left: 18px;
      z-index: 10001;
      width: 46px;
      height: 46px;
      border-radius: 50%;
      border: 1px solid rgba(168, 85, 247, 0.45);
      background: rgba(36, 18, 90, 0.85);
      color: #fff;
      font-size: 22px;
      cursor: pointer;
      display: grid;
      place-items: center;
      box-shadow: 0 6px 18px rgba(0,0,0,0.45), 0 0 0 0 rgba(168, 85, 247, 0.0);
      transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease, opacity 0.2s ease, filter 0.2s ease;
    }
    .halloween-toggle:hover {
      transform: scale(1.08);
      box-shadow: 0 8px 24px rgba(124, 50, 220, 0.45), 0 0 0 6px rgba(168, 85, 247, 0.10);
    }
    .halloween-toggle.is-off {
      background: rgba(40, 40, 50, 0.78);
      border-color: rgba(255, 255, 255, 0.18);
      filter: saturate(0.25) brightness(0.85);
      opacity: 0.75;
    }
    .halloween-toggle__ico {
      line-height: 1;
      filter: drop-shadow(0 0 6px rgba(255, 140, 0, 0.4));
    }
    .halloween-toggle.is-off .halloween-toggle__ico {
      filter: none;
    }

    /* When the dev flips to Normal mode, suppress all Halloween visuals
       even if a flyby is mid-flight. The flyby scheduler is already gated,
       but this hides any stragglers. */
    body.halloween-mode-off .ghost-fly,
    body.halloween-mode-off .witch-fly,
    body.halloween-mode-off .witch-spark,
    body.halloween-mode-off .bat-burst,
    body.halloween-mode-off .chase-fly,
    body.halloween-mode-off .skeleton-band,
    body.halloween-mode-off .grave-cameo,
    body.halloween-mode-off .ghost-horror-overlay {
      display: none !important;
    }

    /* Shared style for video-based sprites — fills its wrapper. */
    .halloween-video-sprite {
      width: 100%;
      height: auto;
      display: block;
    }

    /* Skeleton-vs-zombie chase — sprints across the lower band of the
       viewport. Uses its own keyframes so the pair stays grounded instead
       of bobbing through the air with the airborne flock. Bottom-based
       anchor keeps feet at ground level regardless of sprite size. */
    .chase-fly {
      position: fixed;
      bottom: 4%;
      left: 0;
      pointer-events: none;
      user-select: none;
      z-index: 9989;
      opacity: 0;
      will-change: transform, opacity;
      animation-timing-function: linear;
      animation-fill-mode: both;
      animation-iteration-count: 1;
      filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.55));
    }
    .chase-zombie {
      filter: drop-shadow(0 6px 14px rgba(80, 30, 30, 0.55))
              drop-shadow(0 0 12px rgba(60, 20, 80, 0.30));
    }
    /* Mummy lumbers — slightly lower z-index so he reads as background
       relative to the runner-vs-zombie chase. */
    .chase-mummy {
      z-index: 9988;
      filter: drop-shadow(0 6px 14px rgba(70, 50, 20, 0.55))
              drop-shadow(0 0 14px rgba(180, 150, 80, 0.25));
    }

    /* Grave — stationary, bottom-anchored cameo. */
    .grave-cameo {
      position: fixed;
      width: 170px;
      z-index: 9988;
      pointer-events: none;
      opacity: 0;
      animation: graveEnter 0.9s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
      filter: drop-shadow(0 8px 18px rgba(0, 0, 0, 0.6));
    }
    /* Obstacle variant: sits at center-stage, sized so the skeleton's
       jump (-120px) clears it. The chase wrapper jumps 120px high; the
       grave is 180px wide so the visual collision area is well-defined. */
    .grave-cameo--obstacle {
      width: 180px;
      z-index: 9989;       /* slightly above the chase characters' z-index */
    }
    .grave-cameo.is-leaving {
      animation: graveExit 0.9s ease-in forwards;
    }
    @keyframes graveEnter {
      0%   { opacity: 0; transform: translateY(30px) scale(0.95); }
      100% { opacity: 1; transform: translateY(0)    scale(1); }
    }
    @keyframes graveExit {
      0%   { opacity: 1; transform: translateY(0)    scale(1); }
      100% { opacity: 0; transform: translateY(20px) scale(0.95); }
    }
    .chase--ltr { animation-name: chaseLtr; }
    .chase--rtl { animation-name: chaseRtl; }
    /* Skeleton-with-obstacle override: he vaults the grave at midpoint.
       Higher specificity (3 classes) overrides .chase--ltr / .chase--rtl. */
    .chase-skeleton.chase--with-obstacle.chase--ltr { animation-name: chaseLtrSkeletonJump; }
    .chase-skeleton.chase--with-obstacle.chase--rtl { animation-name: chaseRtlSkeletonJump; }

    @keyframes chaseLtr {
      0%   { transform: translate(-25vw, 0); opacity: 0; }
      8%   { opacity: 1; }
      50%  { transform: translate(50vw, -8px); }
      92%  { opacity: 1; }
      100% { transform: translate(125vw, 0); opacity: 0; }
    }
    @keyframes chaseRtl {
      0%   { transform: translate(125vw, 0) scaleX(-1); opacity: 0; }
      8%   { opacity: 1; }
      50%  { transform: translate(50vw, -8px) scaleX(-1); }
      92%  { opacity: 1; }
      100% { transform: translate(-25vw, 0) scaleX(-1); opacity: 0; }
    }

    /* Skeleton-jump-over-grave keyframes. Short, snappy hop: pushes off
       at 50%, peaks at 56% over the grave at 59vw, lands at 62% (12% of
       dur airtime, ~1.3s on the avg chase). Shifted +6% from the prior
       50%-peak version to delay the jump by ~0.7s on an 11s chase — the
       grave's x position moves to 59vw to stay aligned with the new peak.
       Intermediate keyframes at 53% / 59% sample a parabolic arc so a
       linear timing function still reads as a natural curve — without the
       apex hang that eased curves produce. Horizontal positions track the
       linear chase progression (1.5vw per 1%) at every step, so he keeps
       moving forward at the same pace through the entire jump. */
    @keyframes chaseLtrSkeletonJump {
      0%   { transform: translate(-25vw, 0); opacity: 0; }
      8%   { opacity: 1; }
      50%  { transform: translate(50vw, 0);     animation-timing-function: linear; }
      53%  { transform: translate(54.5vw, -35px); animation-timing-function: linear; }
      56%  { transform: translate(59vw, -50px);   animation-timing-function: linear; }
      59%  { transform: translate(63.5vw, -35px); animation-timing-function: linear; }
      62%  { transform: translate(68vw, 0); }
      92%  { opacity: 1; }
      100% { transform: translate(125vw, 0); opacity: 0; }
    }
    @keyframes chaseRtlSkeletonJump {
      0%   { transform: translate(125vw, 0) scaleX(-1); opacity: 0; }
      8%   { opacity: 1; }
      50%  { transform: translate(50vw, 0) scaleX(-1);     animation-timing-function: linear; }
      53%  { transform: translate(45.5vw, -35px) scaleX(-1); animation-timing-function: linear; }
      56%  { transform: translate(41vw, -50px) scaleX(-1);   animation-timing-function: linear; }
      59%  { transform: translate(36.5vw, -35px) scaleX(-1); animation-timing-function: linear; }
      62%  { transform: translate(32vw, 0) scaleX(-1); }
      92%  { opacity: 1; }
      100% { transform: translate(-25vw, 0) scaleX(-1); opacity: 0; }
    }

    /* Speech bubbles above the runners. They flash in once, hold briefly,
       then fade upward and disappear — total lifecycle ~1.5s. The wrapper
       flips on RTL keyframes, so bubbles compensate with scaleX(-1) to
       keep the text readable. */
    .chase-bubble {
      position: absolute;
      bottom: calc(100% + 12px);
      left: 50%;
      padding: 7px 16px;
      border-radius: 16px;
      font: 800 16px/1.2 "Inter", system-ui, sans-serif;
      letter-spacing: 0.2px;
      white-space: nowrap;
      box-shadow: 0 6px 14px rgba(0, 0, 0, 0.45);
      pointer-events: none;
      z-index: 1;
      opacity: 0;
      animation: bubbleLife 3.75s ease-out forwards;
    }
    .chase-bubble::after {
      content: "";
      position: absolute;
      top: 100%;
      left: 50%;
      transform: translateX(-50%);
      width: 0;
      height: 0;
      border-left: 7px solid transparent;
      border-right: 7px solid transparent;
      border-top: 8px solid currentColor;
      filter: drop-shadow(0 1px 0 rgba(0,0,0,0.2));
    }
    .chase-bubble--skeleton {
      background: #ffffff;
      color: #b91c1c;
      border: 2px solid #fecaca;
    }
    .chase-bubble--skeleton::after {
      border-top-color: #ffffff;
    }
    .chase-bubble--zombie {
      background: rgba(20, 12, 24, 0.96);
      color: #fca5a5;
      border: 2px solid rgba(248, 113, 113, 0.5);
      letter-spacing: 1px;
      text-transform: lowercase;
    }
    .chase-bubble--zombie::after {
      border-top-color: rgba(20, 12, 24, 0.96);
    }
    .chase--rtl .chase-bubble {
      animation-name: bubbleLifeRtl;
    }
    @keyframes bubbleLife {
      0%   { opacity: 0; transform: translateX(-50%) translateY(8px) scale(0.9); }
      18%  { opacity: 1; transform: translateX(-50%) translateY(0)   scale(1); }
      70%  { opacity: 1; transform: translateX(-50%) translateY(-2px) scale(1); }
      100% { opacity: 0; transform: translateX(-50%) translateY(-14px) scale(0.96); }
    }
    @keyframes bubbleLifeRtl {
      0%   { opacity: 0; transform: translateX(-50%) scaleX(-1) translateY(8px); }
      18%  { opacity: 1; transform: translateX(-50%) scaleX(-1) translateY(0); }
      70%  { opacity: 1; transform: translateX(-50%) scaleX(-1) translateY(-2px); }
      100% { opacity: 0; transform: translateX(-50%) scaleX(-1) translateY(-14px); }
    }

    /* ── Click-to-speak: applied to whichever wrap a click handler uses ── */
    .is-clickable {
      pointer-events: auto;
      cursor: pointer;
    }
    /* Right-to-left chase wraps are mirrored via scaleX(-1) on the wrap;
       cancel that on the bubble so text reads normally. */
    .chase--rtl .cast-quote { transform: translateX(-50%) scaleX(-1); }
    .cast-quote {
      position: absolute;
      bottom: calc(100% + 8px);
      left: 50%;
      transform: translateX(-50%);
      padding: 7px 14px;
      background: rgba(26, 26, 46, 0.96);
      color: #f1f5f9;
      border-radius: 12px;
      border: 1px solid rgba(124, 107, 255, 0.5);
      font-size: 16px;
      font-weight: 700;
      white-space: nowrap;
      pointer-events: none;
      z-index: 10000;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
      opacity: 0;
      animation: castQuotePop 3125ms ease-out forwards;
    }
    .cast-quote::after {
      content: "";
      position: absolute;
      top: 100%;
      left: 50%;
      margin-left: -6px;
      border: 6px solid transparent;
      border-top-color: rgba(26, 26, 46, 0.96);
    }
    @keyframes castQuotePop {
      0%   { opacity: 0; transform: translateX(-50%) translateY(8px)  scale(0.85); }
      14%  { opacity: 1; transform: translateX(-50%) translateY(0)    scale(1); }
      82%  { opacity: 1; transform: translateX(-50%) translateY(-2px) scale(1); }
      100% { opacity: 0; transform: translateX(-50%) translateY(-12px) scale(0.96); }
    }
    /* Light-theme polish for cast + chase bubbles — the dark navy bg
       already reads on light backgrounds but a stronger border + heavier
       shadow keeps them visually anchored on a white viewport. */
    body.theme-light .cast-quote,
    body.theme-light .chase-bubble {
      border-color: rgba(15, 23, 42, 0.55);
      box-shadow: 0 8px 22px rgba(15, 23, 42, 0.28);
    }

    /* Band-member slots wrap each video so the click bubble has a
       same-size positioned anchor and doesn't try to anchor inside a
       <video> element. */
    .skeleton-band__slot {
      position: relative;
      display: inline-block;
      line-height: 0;
    }

    /* Skeleton band — guitarist + dancer in a bottom corner. They share
       a wrapper so they enter and leave together. */
    .skeleton-band {
      position: fixed;
      bottom: 12px;
      z-index: 9989;
      pointer-events: none;
      display: flex;
      align-items: flex-end;
      gap: 4px;
      opacity: 0;
      animation: dancingSkeletonEnter 1.2s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
      filter: drop-shadow(0 6px 14px rgba(124, 50, 220, 0.40));
    }
    .skeleton-band--left  { left: 14px; }
    .skeleton-band--right { right: 14px; }
    .skeleton-band.is-leaving {
      animation: dancingSkeletonExit 1.2s ease-in forwards;
    }
    .skeleton-band__member {
      display: block;
      height: auto;
    }
    .skeleton-band__guitar { width: 338px; }
    .skeleton-band__dancer { width: 195px; }
    /* The dancer's source clip faces one direction; flip when she's on
       the opposite side of the guitarist so she always faces him. */
    .skeleton-band__dancer--flip { transform: scaleX(-1); }
    @keyframes dancingSkeletonEnter {
      0%   { opacity: 0; transform: translateY(40px) scale(0.92); }
      100% { opacity: 1; transform: translateY(0)    scale(1); }
    }
    @keyframes dancingSkeletonExit {
      0%   { opacity: 1; transform: translateY(0)    scale(1); }
      100% { opacity: 0; transform: translateY(40px) scale(0.92); }
    }

    /* Subtle night-time vignette. Strength scales with how many scenes
       are active (controlled by --horror-strength, set by JS). A lone
       creature gets a faint shift; overlapping scenes darken further. */
    .ghost-horror-overlay {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 9985;
      background:
        radial-gradient(circle at 50% 40%, transparent 45%, rgba(0,0,0,0.30) 100%),
        radial-gradient(circle at 50% 50%, rgba(50, 30, 120, 0.12) 0%, transparent 70%),
        linear-gradient(to bottom, rgba(15, 20, 50, 0.10), rgba(5, 8, 25, 0.18));
      opacity: 0;
      transition: opacity 1.6s ease-in-out;
    }
    .ghost-horror-overlay.is-active {
      opacity: var(--horror-strength, 0.45);
      animation: horrorPulse 3.2s ease-in-out infinite;
    }
    @keyframes horrorPulse {
      0%, 100% { filter: brightness(0.96); }
      50%      { filter: brightness(1.02); }
    }

    @media (prefers-reduced-motion: reduce) {
      .ghost-fly, .witch-fly, .witch-spark, .bat-burst, .chase-fly, .skeleton-band, .grave-cameo, .ghost-horror-overlay {
        display: none !important;
      }
    }

    @media (max-width: 640px) {
      .ghost-modal { padding: 22px 20px 18px; }
      .ghost-modal__title { font-size: 1.15rem; }
      .ghost-modal__icon { width: 60px; height: 60px; }
      .ghost-modal__actions { flex-direction: column; gap: 8px; }
      .ghost-modal__skip, .ghost-modal__cta { width: 100%; }
      .ghost-fly { opacity: 0.6; }
      .witch-fly { opacity: 0.85; }
      .skeleton-band__guitar { width: 248px; }
      .skeleton-band__dancer { width: 143px; }
      .chase-fly { transform-origin: center; }
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
      /* Long, gentle ease for a buttery fade-in. */
      transition: opacity 1.8s cubic-bezier(0.22, 0.61, 0.36, 1);
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
      /* Equally smooth fade-out — slower than before so the cinematic
         tapers gently rather than snapping out. */
      transition: opacity 1.4s cubic-bezier(0.22, 0.61, 0.36, 1);
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
      opacity: 0;   /* invisible until phase-enter so it can fade in alongside drifting */
      filter:
        drop-shadow(0 -6px 22px rgba(255, 160, 50, 0.9))
        drop-shadow(0 0 40px rgba(255, 100, 30, 0.6));
      animation: candleFlicker 0.45s ease-in-out infinite alternate;
    }
    .ghost-intro.phase-enter .ghost-intro__candle {
      animation:
        candleFloatIn 5.6s cubic-bezier(0.22, 0.61, 0.36, 1) forwards,
        candleFlicker 0.45s ease-in-out infinite alternate;
    }
    @keyframes candleFloatIn {
      0%   { left: -360px; opacity: 0;   transform: translate3d(0, 0, 0) rotate(-3deg); }
      14%  {               opacity: 0.55; }
      30%  {               opacity: 1;    transform: translate3d(0, -10px, 0) rotate(1deg); }
      55%  { transform: translate3d(0, -14px, 0) rotate(1.5deg); }
      78%  { transform: translate3d(0, -6px, 0)  rotate(-0.5deg); }
      100% { left: calc(50% - 160px); opacity: 1; transform: translate3d(0, 0, 0) rotate(0); }
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
      /* Smoother arrival — no bounce, longer ramp, gradual opacity. */
      animation: skeletonPopIn 1.4s cubic-bezier(0.22, 0.61, 0.36, 1) forwards;
    }
    @keyframes skeletonPopIn {
      0%   { opacity: 0;   transform: scale(0.85) translateY(20px); filter: drop-shadow(0 0 0 rgba(0,0,0,0)); }
      40%  { opacity: 0.55; }
      100% { opacity: 1;   transform: scale(1)    translateY(0);
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
      /* Brighter against the dark cinematic scene: lift the silhouette,
         add a warm candle-lit halo, and keep a dark depth-shadow underneath. */
      filter:
        brightness(1.35) saturate(1.2) contrast(1.05)
        drop-shadow(0 0 6px  rgba(255, 200, 120, 0.85))
        drop-shadow(0 0 18px rgba(255, 110,  30, 0.55))
        drop-shadow(0 4px 10px rgba(0, 0, 0, 0.7));
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
      /* Lives outside the .ghost-intro overlay so the overlay's fade-in
         doesn't gate its visibility — it's clickable from frame zero. */
      position: fixed;
      top: 20px; right: 20px;
      padding: 9px 16px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.3);
      background: rgba(0, 0, 0, 0.55);
      color: rgba(255, 255, 255, 0.92);
      font: 700 0.82rem/1 system-ui, -apple-system, "Segoe UI", Inter, sans-serif;
      cursor: pointer;
      backdrop-filter: blur(4px);
      z-index: 1000001;     /* one above .ghost-intro */
      opacity: 1;
      transition: background 0.18s ease, border-color 0.18s ease, opacity 0.35s ease;
    }
    .ghost-intro__skip:hover {
      background: rgba(255, 255, 255, 0.14);
      border-color: rgba(255, 255, 255, 0.55);
    }
    .ghost-intro__skip--leaving { opacity: 0; pointer-events: none; }

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
    const greetingClosed = installGreetingModal();
    scheduleGhostFlybys(greetingClosed);
  };
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
}

init();
