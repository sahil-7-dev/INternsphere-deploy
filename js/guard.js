// js/guard.js
import { auth, db } from "../firebase/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { roleHome } from "./lib/role-home.js";

export function requireAuth(redirectTo = "login.html") {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `${redirectTo}?next=${next}`;
      return;
    }
    try {
      const u = await getDoc(doc(db, "users", user.uid));
      if (u.exists() && u.data().disabled === true) {
        const { signOut } = await import("https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js");
        await signOut(auth);
        alert("Your account has been suspended. Please contact support.");
        window.location.href = redirectTo;
      }
    } catch (_) { }
  });
}

export function requireAdmin(fallback = "login.html") {
  onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = fallback; return; }
    try {
      const u = await getDoc(doc(db, "users", user.uid));
      const data = u.exists() ? u.data() : {};
      if (data.disabled === true || data.role !== "admin") {
        window.location.href = fallback;
      }
    } catch (_) {
      window.location.href = fallback;
    }
  });
}

export function requireRole(allowedRoles) {
  const allowed = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `login.html?next=${next}`;
      return;
    }
    try {
      const u = await getDoc(doc(db, "users", user.uid));
      const data = u.exists() ? u.data() : {};

      if (data.disabled === true) {
        const { signOut } = await import("https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js");
        await signOut(auth);
        alert("Your account has been suspended. Please contact support.");
        window.location.href = "login.html";
        return;
      }

      const role = data.role || "student";
      if (allowed.includes(role)) return;

      const home = roleHome(role);
      if (!window.location.pathname.endsWith("/" + home)
          && !window.location.pathname.endsWith(home)) {
        window.location.href = "./" + home;
      }
    } catch (_) {
      window.location.href = "login.html";
    }
  });
}
