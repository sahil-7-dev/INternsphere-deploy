// js/guest-mode.js
// Lightweight guest / demo mode. Let reviewers explore student or company
// dashboards without signing up. Anonymous Firebase auth makes Firestore
// reads work. A capture-phase click/submit interceptor blocks any write
// action (apply, post, approve, send, save, delete) and shows a toast. A
// small pill in the bottom-right marks the session.
//
// NOT imported by any dashboard HTML — loaded explicitly by login.js when
// the user clicks Try-as-Student or Try-as-Company, then runs on every
// page via a lightweight script entry (see bottom of file).

import { auth } from "../firebase/firebase.js";
import {
  signInAnonymously,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";

const GUEST_KEY = "guestRole";
const GREETED_KEY = "guestGreetingShown";

export function isGuest() {
  try { return !!sessionStorage.getItem(GUEST_KEY); } catch { return false; }
}
export function getGuestRole() {
  try { return sessionStorage.getItem(GUEST_KEY) || ""; } catch { return ""; }
}
export async function enterGuest(role) {
  if (role !== "student" && role !== "company") return;
  sessionStorage.setItem(GUEST_KEY, role);
  try { if (auth.currentUser && !auth.currentUser.isAnonymous) await signOut(auth); } catch {}
  try { await signInAnonymously(auth); } catch (e) { console.warn("[guest] anon sign-in failed:", e); }
}
export async function exitGuest() {
  try { sessionStorage.removeItem(GUEST_KEY); } catch {}
  try { sessionStorage.removeItem(GREETED_KEY); } catch {}
  try { await signOut(auth); } catch {}
}

// ─── Write interceptor ───

const BLOCKED_CLICK_SELECTORS = [
  // creation / save actions
  "#add-internship-btn",
  "#modal-save",
  "#task-modal-save",
  "#submitBtn",
  "#applyBtn",
  "#saveBtn",
  "#review-save",
  // CV / resume analyzer
  "#raAnalyzeBtn",
  "#uploadResumeBtn",
  "#aiAnalyzerLink",
  "#openResumeAnalyzerBtn",
  "#cvFeedbackBtn",
  "#pitchBtn",
  // settings / profile writes
  "#updateProfileBtn",
  "#changeEmailBtn",
  "#changePasswordBtn",
  "#contactUsBtn",
  "#updateCompanyNameBtn",
  "#updateCompanyLocationBtn",
  "#companyEmailBtn",
  "#companyPasswordBtn",
  "#companyContactBtn",
  // application mutations
  ".btn-approve",
  ".btn-reject",
  ".btn-shortlist",
  ".btn-del",
  ".btn-dup",
  ".btn-edit",
  // notifications
  "#markAllRead",
  "#coMarkAllRead",
  // TARS (student)
  ".tars-chip",
  ".tars-suggest-item:not(.tars-suggest-custom)",
  // TARS (company)
  "#coTarsSuggest [data-action]",
  "#coTarsSuggest [data-role]",
];
const BLOCKED_FORM_IDS = new Set([
  "applyForm",
  "tarsChatForm",
  "coTarsChatForm",
  "qaForm",
]);

function showGuestToast(msg) {
  let host = document.getElementById("guestToastHost");
  if (!host) {
    host = document.createElement("div");
    host.id = "guestToastHost";
    host.className = "guest-toast-host";
    document.body.appendChild(host);
  }
  const t = document.createElement("div");
  t.className = "guest-toast";
  t.textContent = msg;
  host.appendChild(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 260);
  }, 2400);
}

function matchesBlocked(el) {
  for (const sel of BLOCKED_CLICK_SELECTORS) {
    if (el.matches?.(sel) || el.closest?.(sel)) return true;
  }
  return false;
}

function installInterceptor() {
  document.addEventListener("click", (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    if (!matchesBlocked(target)) return;
    e.preventDefault();
    e.stopPropagation();
    showGuestToast("Guest mode — sign up to use this feature.");
  }, true);

  document.addEventListener("submit", (e) => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (!BLOCKED_FORM_IDS.has(form.id)) return;
    e.preventDefault();
    e.stopPropagation();
    showGuestToast("Guest mode — sign up to submit.");
  }, true);

  document.addEventListener("change", (e) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement)) return;
    if (el.id !== "raFileInput" && el.id !== "cv") return;
    if (!el.files || el.files.length === 0) return;
    el.value = "";
    e.preventDefault();
    e.stopPropagation();
    showGuestToast("Guest mode — sign up to upload.");
  }, true);
}

// ─── Pill (bottom-right) ───

function installPill() {
  if (document.getElementById("guestPill")) return;
  const role = getGuestRole();
  const label = role === "company" ? "Company" : "Student";
  const pill = document.createElement("div");
  pill.id = "guestPill";
  pill.className = "guest-pill";
  pill.innerHTML =
    '<span class="guest-pill__dot" aria-hidden="true"></span>' +
    '<span>Guest · <b>' + label + '</b></span>' +
    '<button type="button" class="guest-pill__exit" aria-label="Exit guest mode">Exit</button>';
  document.body.appendChild(pill);
  pill.querySelector(".guest-pill__exit")?.addEventListener("click", async () => {
    await exitGuest();
    window.location.href = "Index.html";
  });
}

// ─── Welcome modal (once per session) ───

function installWelcomeModal() {
  let shown = false;
  try { shown = sessionStorage.getItem(GREETED_KEY) === "1"; } catch {}
  if (shown) return;
  try { sessionStorage.setItem(GREETED_KEY, "1"); } catch {}

  const role = getGuestRole();
  const label = role === "company" ? "Company" : "Student";

  setTimeout(() => {
    if (document.getElementById("guestWelcome")) return;

    const backdrop = document.createElement("div");
    backdrop.id = "guestWelcome";
    backdrop.className = "guest-modal-backdrop";
    backdrop.innerHTML =
      '<div class="guest-modal" role="dialog" aria-modal="true" aria-labelledby="guestWelcomeTitle">' +
        '<button type="button" class="guest-modal__close" aria-label="Dismiss">×</button>' +
        '<div class="guest-modal__chip">Preview</div>' +
        '<h2 id="guestWelcomeTitle" class="guest-modal__title">Welcome — you\'re browsing as a ' + label + '.</h2>' +
        '<p class="guest-modal__body">' +
          'Look around as much as you like. Actions that would change data ' +
          '(applying, posting, approving, messaging, uploading) are disabled in preview. ' +
          'Sign up anytime to unlock everything.' +
        '</p>' +
        '<div class="guest-modal__actions">' +
          '<button type="button" class="guest-modal__skip">Continue browsing</button>' +
          '<a href="login.html" class="guest-modal__cta">Sign up free →</a>' +
        '</div>' +
        '<div class="guest-modal__timer" aria-hidden="true"><div class="guest-modal__timer-fill"></div></div>' +
      '</div>';
    document.body.appendChild(backdrop);

    let autoDismissTimer = null;
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      if (autoDismissTimer) { clearTimeout(autoDismissTimer); autoDismissTimer = null; }
      backdrop.classList.add("is-closing");
      setTimeout(() => backdrop.remove(), 220);
    };
    backdrop.querySelector(".guest-modal__close")?.addEventListener("click", close);
    backdrop.querySelector(".guest-modal__skip")?.addEventListener("click", close);
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
    document.addEventListener("keydown", function onEsc(e) {
      if (e.key === "Escape") {
        document.removeEventListener("keydown", onEsc);
        close();
      }
    });

    // auto-dismiss after 10s; bar animates to empty in sync
    const fill = backdrop.querySelector(".guest-modal__timer-fill");
    if (fill) {
      fill.style.transition = "transform 10s linear";
      requestAnimationFrame(() => { fill.style.transform = "scaleX(0)"; });
    }
    autoDismissTimer = setTimeout(close, 10000);

    requestAnimationFrame(() => backdrop.classList.add("is-open"));
  }, 900);
}

// ─── Anon auth bridge ───

function ensureAnonAuth() {
  onAuthStateChanged(auth, (user) => {
    if (!isGuest()) return;
    // If a real (non-anonymous) user is signed in, the guest flag is stale —
    // a previous guest session didn't clean up. Clear flags and tear down
    // the pill / welcome so the real session isn't contaminated.
    if (user && !user.isAnonymous) {
      try { sessionStorage.removeItem(GUEST_KEY); } catch {}
      try { sessionStorage.removeItem(GREETED_KEY); } catch {}
      document.getElementById("guestPill")?.remove();
      document.getElementById("guestWelcome")?.remove();
      return;
    }
    if (!user) {
      signInAnonymously(auth).catch((e) => {
        console.warn("[guest] anon sign-in failed:", e);
        // Surface the failure so silent breakage (e.g. missing authorized
        // domain on a new deployment, anonymous provider disabled) is
        // visible in the UI instead of only in the console.
        const hint = e?.code === "auth/unauthorized-domain"
          ? "This domain isn't authorized in Firebase. Add it in Authentication → Settings → Authorized domains."
          : e?.code === "auth/admin-restricted-operation" || e?.code === "auth/operation-not-allowed"
            ? "Anonymous sign-in is disabled in Firebase. Enable it in Authentication → Sign-in method."
            : (e?.code || e?.message || "unknown error");
        showGuestToast("Guest sign-in failed — " + hint);
      });
    }
  });
}

// ─── Styles ───

function ensureStyles() {
  if (document.getElementById("guestStyles")) return;
  const s = document.createElement("style");
  s.id = "guestStyles";
  s.textContent = `
    .guest-pill {
      position: fixed;
      bottom: 18px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 99990;
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 8px 8px 8px 14px;
      border-radius: 999px;
      border: 1px solid rgba(124, 107, 255, 0.45);
      background: rgba(18, 18, 22, 0.82);
      color: #fff;
      font: 600 0.8rem/1 system-ui, -apple-system, "Segoe UI", Inter, sans-serif;
      backdrop-filter: blur(8px);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
    }
    .guest-pill__dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: linear-gradient(135deg, #7c6bff, #a855f7);
      box-shadow: 0 0 8px rgba(168, 85, 247, 0.8);
    }
    .guest-pill b { font-weight: 700; }
    .guest-pill__exit {
      margin-left: 2px;
      padding: 4px 10px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.22);
      background: transparent;
      color: #fff;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }
    .guest-pill__exit:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.4);
    }
    @media (max-width: 640px) {
      .guest-pill { bottom: 12px; font-size: 0.72rem; padding: 6px 6px 6px 10px; }
    }

    .guest-toast-host {
      position: fixed;
      left: 50%;
      bottom: 80px;
      transform: translateX(-50%);
      z-index: 99998;
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: center;
      pointer-events: none;
    }
    .guest-toast {
      padding: 10px 16px;
      background: #1f2027;
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #fff;
      font: 600 0.84rem/1.3 system-ui, -apple-system, "Segoe UI", Inter, sans-serif;
      border-radius: 10px;
      box-shadow: 0 14px 40px rgba(0, 0, 0, 0.4);
      opacity: 0;
      transform: translateY(8px);
      transition: opacity 0.22s ease, transform 0.22s ease;
    }
    .guest-toast.show {
      opacity: 1;
      transform: translateY(0);
    }

    .guest-modal-backdrop {
      position: fixed;
      inset: 0;
      z-index: 99999;
      background: rgba(6, 8, 16, 0.55);
      backdrop-filter: blur(6px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      opacity: 0;
      transition: opacity 0.22s ease;
    }
    .guest-modal-backdrop.is-open { opacity: 1; }
    .guest-modal-backdrop.is-closing { opacity: 0; }
    .guest-modal {
      width: min(100%, 440px);
      padding: 26px 28px 22px;
      border-radius: 18px;
      background: linear-gradient(160deg, #1f2027 0%, #15161b 100%);
      color: #fff;
      border: 1px solid rgba(124, 107, 255, 0.28);
      box-shadow: 0 30px 80px rgba(0, 0, 0, 0.5);
      position: relative;
      text-align: left;
      transform: translateY(10px) scale(0.97);
      transition: transform 0.26s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .guest-modal-backdrop.is-open .guest-modal { transform: translateY(0) scale(1); }
    .guest-modal__close {
      position: absolute;
      top: 10px; right: 10px;
      width: 30px; height: 30px;
      border-radius: 50%;
      border: 0;
      background: rgba(255, 255, 255, 0.08);
      color: rgba(255, 255, 255, 0.78);
      font-size: 1.3rem;
      line-height: 1;
      cursor: pointer;
    }
    .guest-modal__close:hover { background: rgba(255, 255, 255, 0.16); }
    .guest-modal__chip {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 999px;
      background: rgba(124, 107, 255, 0.18);
      color: #c9bfff;
      font: 700 0.66rem/1 system-ui, -apple-system, "Segoe UI", Inter, sans-serif;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      margin-bottom: 12px;
    }
    .guest-modal__title {
      margin: 0 0 8px;
      font: 800 1.15rem/1.35 system-ui, -apple-system, "Segoe UI", Inter, sans-serif;
    }
    .guest-modal__body {
      margin: 0 0 18px;
      font: 500 0.9rem/1.55 system-ui, -apple-system, "Segoe UI", Inter, sans-serif;
      color: rgba(255, 255, 255, 0.76);
    }
    .guest-modal__actions {
      display: flex;
      gap: 10px;
      justify-content: flex-end;
      margin-bottom: 14px;
    }
    .guest-modal__timer {
      height: 3px;
      border-radius: 2px;
      background: rgba(255, 255, 255, 0.06);
      overflow: hidden;
    }
    .guest-modal__timer-fill {
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, #7c6bff, #a855f7);
      transform-origin: left center;
      transform: scaleX(1);
    }
    .guest-modal__skip,
    .guest-modal__cta {
      padding: 9px 16px;
      border-radius: 9px;
      font: 700 0.86rem/1 system-ui, -apple-system, "Segoe UI", Inter, sans-serif;
      cursor: pointer;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
    }
    .guest-modal__skip {
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.22);
      color: rgba(255, 255, 255, 0.85);
    }
    .guest-modal__skip:hover { background: rgba(255, 255, 255, 0.08); }
    .guest-modal__cta {
      background: linear-gradient(135deg, #7c6bff, #a855f7);
      color: #fff;
      border: 0;
      box-shadow: 0 6px 16px rgba(124, 107, 255, 0.35);
    }
    @media (max-width: 640px) {
      .guest-modal__actions { flex-direction: column; }
      .guest-modal__skip, .guest-modal__cta { width: 100%; justify-content: center; }
    }
  `;
  document.head.appendChild(s);
}

// ─── Boot ───

function init() {
  if (!isGuest()) return;
  // If a real (non-anonymous) user is already signed in at page-load time,
  // the flag is stale — clear it and don't install any guest UI.
  if (auth.currentUser && !auth.currentUser.isAnonymous) {
    try { sessionStorage.removeItem(GUEST_KEY); } catch {}
    try { sessionStorage.removeItem(GREETED_KEY); } catch {}
    return;
  }
  ensureStyles();
  ensureAnonAuth();
  const mount = () => {
    // Re-check right before mount — if auth resolved between isGuest() and
    // here and it's a real user, skip installing guest UI entirely.
    if (auth.currentUser && !auth.currentUser.isAnonymous) return;
    installInterceptor();
    installPill();
    installWelcomeModal();
  };
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
}

init();
