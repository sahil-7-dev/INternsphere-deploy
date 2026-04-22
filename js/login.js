// js/login.js
import {
  setRemember,
  signupEmail,
  loginEmail,
  resetPassword,
  getUserRole,
  loginWithGoogle
} from "./auth.js";
import { auth } from "../firebase/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { roleHome } from "./lib/role-home.js";

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  // Anonymous users came from the guest card — don't auto-redirect them.
  // (The card click already navigated.) The guest-mode module owns their UI.
  if (user.isAnonymous) return;
  // Real user signed in — ALWAYS clear any leftover guest flag so the pill,
  // welcome modal, and interceptor don't bleed into their real session.
  try { sessionStorage.removeItem("guestRole"); } catch {}
  try { sessionStorage.removeItem("guestGreetingShown"); } catch {}
  try {
    const role = await getUserRole(user.uid);
    const params = new URLSearchParams(location.search);
    const next = params.get("next");
    const safeNext = next && /^\/?[\w\-./?=&%]+$/.test(next) ? next : "";
    window.location.href = safeNext ? safeNext : "./" + roleHome(role);
  } catch (_) { }
});

// Guest card handling — set the session role, sign out any real user that
// happens to still be authenticated, then navigate to the matching dashboard.
// The guest module (loaded on the destination page) picks up the flag, signs
// in anonymously, and installs its interceptor + pill.
import { signOut, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";

document.addEventListener("click", async (e) => {
  const btn = e.target instanceof Element ? e.target.closest(".guest-try") : null;
  if (!btn) return;
  e.preventDefault();
  const role = btn.getAttribute("data-guest-role");
  if (role !== "student" && role !== "company") return;
  try { sessionStorage.setItem("guestRole", role); } catch {}
  try {
    if (auth.currentUser && !auth.currentUser.isAnonymous) {
      await signOut(auth);
    }
  } catch (err) { console.warn("guest signout:", err); }
  // Do the anonymous sign-in BEFORE navigating so a Firebase-side failure
  // (unauthorized domain on a fresh deployment, anonymous provider disabled)
  // shows on the login page instead of silently breaking the dashboard.
  try {
    await signInAnonymously(auth);
  } catch (err) {
    try { sessionStorage.removeItem("guestRole"); } catch {}
    const msg = err?.code === "auth/unauthorized-domain"
      ? "Guest mode unavailable — this domain isn't authorized in Firebase (Authentication → Settings → Authorized domains)."
      : err?.code === "auth/admin-restricted-operation" || err?.code === "auth/operation-not-allowed"
        ? "Guest mode unavailable — anonymous sign-in is disabled in Firebase (Authentication → Sign-in method)."
        : "Guest mode unavailable — " + (err?.code || err?.message || "unknown error");
    showAuthMsg(msg, "error");
    return;
  }
  const dest = role === "company" ? "dashboard-company.html" : "dashboard.html";
  window.location.href = "./" + dest;
});

import { friendlyAuthError } from "./lib/auth-errors.js";

// auth message toast
let _authMsgTimer = null;
function showAuthMsg(text, kind = "info") {
  const wrap = document.getElementById("authMsg");
  if (!wrap) { alert(text); return; }
  const span = wrap.querySelector(".auth-msg__text");
  if (span) span.textContent = text;
  wrap.classList.remove("auth-msg--info", "auth-msg--error", "auth-msg--success");
  wrap.classList.add("auth-msg--" + kind);
  wrap.hidden = false;
  // eslint-disable-next-line no-unused-expressions
  wrap.offsetHeight;
  wrap.classList.add("is-visible");

  clearTimeout(_authMsgTimer);
  _authMsgTimer = setTimeout(hideAuthMsg, kind === "error" ? 6000 : 4000);
}
function hideAuthMsg() {
  const wrap = document.getElementById("authMsg");
  if (!wrap) return;
  wrap.classList.remove("is-visible");
  setTimeout(() => { wrap.hidden = true; }, 220);
}
document.addEventListener("click", (e) => {
  if (e.target?.closest?.(".auth-msg__close")) hideAuthMsg();
});

// safe redirect
async function safeRedirect(user) {
  const realRole = await getUserRole(user.uid);

  localStorage.setItem(
    "currentUser",
    JSON.stringify({
      uid: user.uid,
      role: realRole
    })
  );

if (realRole === "dev") sessionStorage.setItem("justLoggedIn", "true");
window.location.href = "./" + roleHome(realRole);
}
// DOM ready
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("authForm");
  const emailEl = document.getElementById("email");
  const passEl = document.getElementById("password");
  const rememberEl = document.getElementById("remember");

  const companyNameField = document.getElementById("companyNameField");
  const companyNameEl = document.getElementById("companyName");

  const submitBtn = document.getElementById("submitBtn");
  const switchBtn = document.getElementById("switchBtn");
  const forgotBtn = document.getElementById("forgotBtn");
  const googleBtn = document.getElementById("googleBtn");

  const panelTitle = document.getElementById("panelTitle");
  const panelDesc = document.getElementById("panelDesc");

  const roleTabs = document.querySelectorAll(".role-tab");
  const modeBtns = document.querySelectorAll(".mode-btn");

  let role = "student";
  let mode = "login";

  // render UI
  function render() {
    const roleLabel =
      role === "student" ? "Student" :
      role === "company" ? "Company" :
      "Dev";

    const modeLabel = mode === "login" ? "Login" : "Sign up";

    if (panelTitle) panelTitle.textContent = `${modeLabel} • ${roleLabel}`;

    if (panelDesc) {
      panelDesc.textContent =
        role === "company"
          ? mode === "login"
            ? "Access your company dashboard and manage internships."
            : "Create your company account to post internships."
          : mode === "login"
          ? "Access your internship dashboard."
          : "Create your student account and get started.";
    }

    const showCompany = role === "company" && mode === "signup";

    if (companyNameField) companyNameField.classList.toggle("is-hidden", !showCompany);
    if (companyNameEl) companyNameEl.required = showCompany;

    if (submitBtn) submitBtn.textContent = mode === "login" ? "Login" : "Create account";
    if (switchBtn) switchBtn.textContent = mode === "login"
      ? "Create an account"
      : "I already have an account";

    if (forgotBtn) forgotBtn.style.display = mode === "login" ? "inline-block" : "none";

    roleTabs.forEach(btn => {
      const active = btn.dataset.role === role;
      btn.classList.toggle("is-active", active);
    });

    modeBtns.forEach(btn => {
      const active = btn.dataset.mode === mode;
      btn.classList.toggle("is-active", active);
    });
  }

  // loading state
  function setLoading(isLoading) {
    if (!submitBtn) return;

    submitBtn.disabled = isLoading;
    submitBtn.textContent = isLoading
      ? "Please wait..."
      : mode === "login"
      ? "Login"
      : "Create account";
  }

  // extract clean name
  function generateName(email) {
    const raw = email.split("@")[0];

    return raw
      .replace(/[0-9]/g, "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[^a-zA-Z]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  // event handlers
  roleTabs.forEach(btn => {
    btn.addEventListener("click", () => {
      role = btn.dataset.role || "student";
      render();
    });
  });

  modeBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      mode = btn.dataset.mode || "login";
      render();
    });
  });

  switchBtn?.addEventListener("click", () => {
    mode = mode === "login" ? "signup" : "login";
    render();
  });

  forgotBtn?.addEventListener("click", async () => {
    const email = emailEl?.value?.trim();
    if (!email) return showAuthMsg("Enter your email first.", "error");

    try {
      await resetPassword(email);
      showAuthMsg("Password reset email sent. Check your inbox.", "success");
    } catch (e) {
      showAuthMsg(friendlyAuthError(e), "error");
    }
  });

  googleBtn?.addEventListener("click", async () => {
    try {
      const remember = Boolean(rememberEl?.checked);
      await setRemember(remember);
      localStorage.setItem("autoLogin", remember);

      const user = await loginWithGoogle(role);
      await safeRedirect(user);
    } catch (e) {
      showAuthMsg(friendlyAuthError(e), "error");
    }
  });

  // form submit
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = emailEl?.value?.trim();
    const password = passEl?.value;
    const companyName = companyNameEl?.value?.trim() || "";

    if (!email || !password) {
      showAuthMsg("Enter your email and password.", "error");
      return;
    }

    if (role === "company" && mode === "signup" && !companyName) {
      showAuthMsg("Enter your company name to create an account.", "error");
      return;
    }

    try {
      setLoading(true);

      const remember = Boolean(rememberEl?.checked);
      await setRemember(remember);
      localStorage.setItem("autoLogin", remember);

      // signup
      if (mode === "signup") {
        let nameToSave =
          role === "company"
            ? companyName
            : generateName(email);

        const roleLabel =
          role === "company" ? "Company" :
          role === "student" ? "Student" :
          "Dev";

        const newUser = await signupEmail({
          email,
          password,
          role,
          name: nameToSave,
          roleLabel
        });

        await safeRedirect(newUser);
        return;
      }

      // login
      const user = await loginEmail({ email, password });
      await safeRedirect(user);

    } catch (err) {
      showAuthMsg(friendlyAuthError(err), "error");
    } finally {
      setLoading(false);
    }
  });

  render();
});
