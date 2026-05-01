// js/dashboard.js

import { requireRole } from "./guard.js";

import { auth, db } from "../firebase/firebase.js";

import {
  verifyBeforeUpdateEmail,
  updatePassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";

import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
  doc,
  writeBatch,
  getDocs,
  getDoc,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

import { esc } from "./lib/escape.js";






requireRole(["student", "dev"]);

document.addEventListener("DOMContentLoaded", () => {

  // sidebar drawer
  const hamburger = document.getElementById("hamburger");
  const mobileSidebar = document.getElementById("sidebar");
  const sidebarBackdrop = document.getElementById("sidebarBackdrop");

  function openSidebar() {
    if (!mobileSidebar) return;
    mobileSidebar.classList.add("open");
    sidebarBackdrop?.classList.add("is-visible");
    document.body.classList.add("sidebar-open");
    hamburger?.setAttribute("aria-expanded", "true");
  }
  function closeSidebar() {
    mobileSidebar?.classList.remove("open");
    sidebarBackdrop?.classList.remove("is-visible");
    document.body.classList.remove("sidebar-open");
    hamburger?.setAttribute("aria-expanded", "false");
  }

  hamburger?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (mobileSidebar?.classList.contains("open")) closeSidebar();
    else openSidebar();
  });

  sidebarBackdrop?.addEventListener("click", closeSidebar);
  mobileSidebar?.querySelectorAll(".side-link").forEach((a) => {
    a.addEventListener("click", () => closeSidebar());
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && mobileSidebar?.classList.contains("open")) {
      closeSidebar();
    }
  });

  let _resizeT;
  window.addEventListener("resize", () => {
    clearTimeout(_resizeT);
    _resizeT = setTimeout(() => {
      if (window.innerWidth > 980 && mobileSidebar?.classList.contains("open")) {
        closeSidebar();
      }
    }, 120);
  });

  // sidebar collapse
  const collapseBtn = document.querySelector(".collapse-btn");
  const sidebarPanel = document.querySelector(".sidebar");

  collapseBtn?.addEventListener("click", () => {
    sidebarPanel?.classList.toggle("collapsed");
  });

  // Real tasks are rendered from Firestore by js/student-activity.js → renderTasks().
  // No hardcoded sample data here.

  // search focus shortcut
  const globalSearch = document.getElementById("globalSearch");

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      globalSearch?.focus();
    }
  });

  // kpi counter animation
  function animateValue(el, start, end, duration) {
    let startTime = null;

    function step(timestamp) {
      if (!startTime) startTime = timestamp;

      const progress = Math.min((timestamp - startTime) / duration, 1);
      el.textContent = Math.floor(progress * (end - start) + start);

      if (progress < 1) {
        requestAnimationFrame(step);
      }
    }

    requestAnimationFrame(step);
  }

  document.querySelectorAll(".kpi-val").forEach((el) => {
    const raw = el.textContent.trim();
    if (!raw || raw === "—") return;
    const finalValue = parseInt(raw.replace(/\D/g, ""), 10);
    if (!Number.isFinite(finalValue)) return;
    animateValue(el, 0, finalValue, 1200);
  });

  const reveals = document.querySelectorAll(".reveal");

  if (reveals.length > 0) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("active");
          }
        });
      },
      {
        threshold: 0.15,
      }
    );

    reveals.forEach((el) => observer.observe(el));
  }
});

const tableBody = document.getElementById("applicationsTableBody");

  let apps = [];
  let currentFilter = "all";
  let appsExpanded = false;
  const APPS_PREVIEW_LIMIT = 5;
  const companyNameCache = new Map();

  // Numeric timestamp resolver for sorting applications. Mirrors the logic
  // on the company dashboard: prefers appliedAtMs (reliable), then ISO /
  // en-US parse, then a regex fallback for locale-formatted strings.
  function _appTs(a) {
    if (typeof a.appliedAtMs === "number" && !isNaN(a.appliedAtMs)) {
      return a.appliedAtMs;
    }
    if (a.appliedAt) {
      const t = Date.parse(a.appliedAt);
      if (!isNaN(t)) return t;
      const m = String(a.appliedAt).match(
        /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?/
      );
      if (m) {
        let n1 = parseInt(m[1], 10);
        let n2 = parseInt(m[2], 10);
        let yr = parseInt(m[3], 10);
        let hr = parseInt(m[4], 10);
        const min = parseInt(m[5], 10);
        const sec = parseInt(m[6] || "0", 10);
        const ampm = (m[7] || "").toLowerCase();
        if (ampm === "pm" && hr < 12) hr += 12;
        if (ampm === "am" && hr === 12) hr = 0;
        if (yr < 100) yr += 2000;
        let mo, day;
        if (n1 > 12) { day = n1; mo = n2; }
        else         { mo  = n1; day = n2; }
        const parsed = Date.UTC(yr, mo - 1, day, hr, min, sec);
        if (!isNaN(parsed)) return parsed;
      }
    }
    return 0;
  }

  async function enrichApps(rawApps) {
    const ids = [...new Set(rawApps.map((a) => a.companyId).filter(Boolean))];
    await Promise.all(
      ids.map(async (id) => {
        if (companyNameCache.has(id)) return;
        try {
          const snap = await getDoc(doc(db, "companies", id));
          if (snap.exists()) {
            const d = snap.data();
            companyNameCache.set(id, d.companyName || d.name || "");
          } else {
            companyNameCache.set(id, "");
          }
        } catch (_) {
          companyNameCache.set(id, "");
        }
      })
    );
    return rawApps.map((a) => ({
      ...a,
      company: a.company || companyNameCache.get(a.companyId) || "InternSphere",
    }));
  }

  function renderApps() {
    if (!tableBody) return;
    tableBody.innerHTML = "";

    let filtered = apps;

    if (currentFilter !== "all") {
      filtered = apps.filter((app) => {
        if (!app.status) return false;
        return app.status.trim().toLowerCase() === currentFilter.trim().toLowerCase();
      });
    }

    if (filtered.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" class="muted">No applications found</td>
        </tr>
      `;
      updateViewAllBtn(0, 0);
      return;
    }

    // Sort newest first using a reliable numeric timestamp when available,
    // loose-parse the legacy locale string otherwise, and fall back to the
    // doc id as a stable tiebreaker so results never shuffle between renders.
    const ordered = filtered.slice().sort((a, b) => {
      const d = _appTs(b) - _appTs(a);
      return d !== 0 ? d : String(b.id || "").localeCompare(String(a.id || ""));
    });
    const totalCount = ordered.length;
    const visible = appsExpanded ? ordered : ordered.slice(0, APPS_PREVIEW_LIMIT);
    updateViewAllBtn(visible.length, totalCount);

    visible.forEach((app) => {
      let statusClass = "s-wait";
      if (app.status === "Approved") statusClass = "s-good";
      if (app.status === "Shortlisted") statusClass = "s-shortlisted";
      if (app.status === "Rejected") statusClass = "s-bad";

      const row = document.createElement("tr");

      const _esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

      row.innerHTML = `
        <td>${_esc(app.company || "InternSphere")}</td>
        <td>${_esc(app.role    || "Frontend Intern")}</td>
        <td><span class="status ${statusClass}">${_esc(app.status || "Pending")}</span></td>
        <td class="muted">${_esc(app.appliedAt || "Just now")}</td>
        <td>
          <button class="mini-btn view-btn">View</button>
        </td>
      `;

      row.querySelector(".view-btn").addEventListener("click", () => {
        openModal(app);
      });

      tableBody.appendChild(row);
    });
  }

  function subscribeToApps(user) {
    const appsQ = query(
      collection(db, "applications"),
      where("studentId", "==", user.uid)
    );
    onSnapshot(appsQ, async (snap) => {
      const rawApps = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      apps = await enrichApps(rawApps);
      renderApps();
    });
  }

  function updateViewAllBtn(shown, total) {
    const btn = document.getElementById("appsViewAllBtn");
    if (!btn) return;
    if (total <= APPS_PREVIEW_LIMIT) {
      btn.style.display = "none";
      return;
    }
    btn.style.display = "";
    btn.textContent = appsExpanded
      ? `Show less`
      : `View all (${total})`;
  }

  document.getElementById("appsViewAllBtn")?.addEventListener("click", () => {
    appsExpanded = !appsExpanded;
    renderApps();
  });

  renderApps();

  // filter buttons
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".filter-btn");
  if (!btn) return;

  document.querySelectorAll(".filter-btn").forEach((b) => {
    b.classList.remove("active");
  });

  btn.classList.add("active");

  currentFilter = btn.dataset.filter || "all";

  renderApps();
});

  // modal
  function openModal(app) {
    const modal        = document.getElementById("appModal");
    const modalContent = document.getElementById("modalContent");
    const title        = document.getElementById("appDetailsTitle");
    if (!modal || !modalContent) return;

    const status = (app.status || "Pending");
    const statusClass = status.toLowerCase();

    const cvHref = app.cvUrl || app.cvData;
    const cvBlock = cvHref
      ? `<a class="app-cv" href="${esc(cvHref)}" download="${esc(app.cvName || "cv.pdf")}">
            <span class="app-cv-ico">📄</span>
            <span>
              <b>${esc(app.cvName || "cv.pdf")}</b>
              <small>${app.cvSize ? (app.cvSize / 1024).toFixed(0) + " KB · " : ""}Click to download</small>
            </span>
         </a>`
      : `<div class="app-cv app-cv--missing">
            <span class="app-cv-ico">⚠</span>
            <span><b>No CV attached</b><small>This application has no PDF on file.</small></span>
         </div>`;

    if (title) title.textContent = app.role ? `Application · ${app.role}` : "Application Details";

    const offerBlock = status === "Approved"
      ? `
      <div class="app-section">
        <div class="app-section-title">Offer letter</div>
        <p class="muted" style="margin:0 0 10px;font-size:0.88rem;line-height:1.5">
          You've been offered this internship. Download your formal offer letter below.
        </p>
        <button type="button" class="btn btn-primary" id="downloadOfferBtn"
                style="width:auto">⬇ Download offer letter</button>
      </div>`
      : "";

    modalContent.innerHTML = `
      <div class="app-section app-status-row">
        <span class="app-label">Current status</span>
        <span class="app-badge app-badge--${statusClass}">${esc(status)}</span>
      </div>

      ${offerBlock}

      <div class="app-section">
        <div class="app-section-title">Role</div>
        <div class="app-grid">
          <div class="app-pair">
            <span class="app-label">Position</span>
            <span class="app-val">${esc(app.role || "—")}</span>
          </div>
          <div class="app-pair">
            <span class="app-label">Applied on</span>
            <span class="app-val app-mono">${esc(app.appliedAt || "—")}</span>
          </div>
        </div>
      </div>

      <div class="app-section">
        <div class="app-section-title">Your details</div>
        <div class="app-grid">
          ${app.name ? `
          <div class="app-pair">
            <span class="app-label">Name</span>
            <span class="app-val">${esc(app.name)}</span>
          </div>` : ""}
          <div class="app-pair">
            <span class="app-label">Email</span>
            <span class="app-val">${esc(app.email || "—")}</span>
          </div>
          <div class="app-pair">
            <span class="app-label">Phone</span>
            <span class="app-val">${esc(app.phone || "—")}</span>
          </div>
        </div>
      </div>

      <div class="app-section">
        <div class="app-section-title">Attached CV</div>
        ${cvBlock}
      </div>
    `;

    if (status === "Approved") {
      const btn = document.getElementById("downloadOfferBtn");
      btn?.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "Preparing…";
        let extras = {};
        try {
          if (app.internshipId) {
            const snap = await getDoc(doc(db, "internships", app.internshipId));
            if (snap.exists()) {
              const d = snap.data();
              extras = {
                duration: d.duration || d.durationKey || "",
                location: d.location || "",
                stipend:  d.stipend  || "",
              };
            }
          }
        } catch (_) { }
        window.downloadOfferLetter?.({
          studentName: app.name || "",
          company:     app.company || "",
          role:        app.role || "Internship",
          startDate:   app.appliedAt || "",
          ...extras,
        });
        setTimeout(() => {
          btn.disabled = false;
          btn.textContent = "⬇ Download offer letter";
        }, 1200);
      });
    }

    modal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }

  window.closeModal = () => {
    document.getElementById("appModal")?.classList.add("hidden");
    document.body.style.overflow = "";
  };

  document.getElementById("appModal")?.addEventListener("click", (e) => {
    if (e.target.id === "appModal") window.closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const m = document.getElementById("appModal");
      if (m && !m.classList.contains("hidden")) window.closeModal();
    }
  });

window.addEventListener("load", () => {
  document.body.classList.add("loaded");
});

document.addEventListener("DOMContentLoaded", () => {
  const globalSearch = document.getElementById("globalSearch");

  globalSearch?.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      const query = globalSearch.value.trim();
      if (!query) return;

      window.location.href = `internshipdetails.html?search=${encodeURIComponent(query)}`;
    }
  });
});

  // settings modal

document.addEventListener("DOMContentLoaded", () => {

  const modal = document.getElementById("settingsModal");
  const openBtn = document.getElementById("openSettingsSidebar");
  const closeBtn = document.getElementById("closeSettingsModal");

  openBtn?.addEventListener("click", () => modal.classList.add("show"));
  closeBtn?.addEventListener("click", () => modal.classList.remove("show"));

  modal?.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.remove("show");
  });

  // auth check
onAuthStateChanged(auth, async (user) => {
  if (sessionStorage.getItem("guestRole")) return;
  if (!user) {
    window.location.href = "./login.html";
  } else {
    loadUserData(user);
    injectUserIntoUI(user);
  }
});

  // email
const emailBtn = document.getElementById("changeEmailBtn");
const emailStatus = document.getElementById("emailStatus");

emailBtn?.addEventListener("click", async () => {
  const user = auth.currentUser;
  const email = document.getElementById("changeEmailInput").value.trim();

  if (!email) {
    showStatus(emailStatus, "Enter a valid email", "error");
    return;
  }

  try {
    emailBtn.classList.add("btn-loading");

    await verifyBeforeUpdateEmail(user, email);

    showStatus(emailStatus, "✔ Verification email sent. Check inbox.", "success");

  } catch (err) {
    if (err.code === "auth/requires-recent-login") {
      showStatus(emailStatus, "Session expired. Please login again.", "error");
    } else {
      showStatus(emailStatus, err.message, "error");
    }
  } finally {
    emailBtn.classList.remove("btn-loading");
  }
});

  // password
  const passBtn = document.getElementById("changePasswordBtn");
const passStatus = document.getElementById("passwordStatus");

passBtn?.addEventListener("click", async () => {
  const user = auth.currentUser;
  const pass = document.getElementById("changePasswordInput").value.trim();

  if (!pass) {
    showStatus(passStatus, "Enter a valid password", "error");
    return;
  }

  try {
    passBtn.classList.add("btn-loading");

    await updatePassword(user, pass);

    showStatus(passStatus, "✔ Password updated. Keep it secure.", "success");

    document.getElementById("changePasswordInput").value = "";

  } catch (err) {
    if (err.code === "auth/requires-recent-login") {
      showStatus(passStatus, "Session expired. Please login again.", "error");
    } else {
      showStatus(passStatus, err.message, "error");
    }
  } finally {
    passBtn.classList.remove("btn-loading");
  }
});

  // profile
const profileBtn = document.getElementById("updateProfileBtn");
const profileStatus = document.getElementById("profileStatus");

profileBtn?.addEventListener("click", async () => {
  const user = auth.currentUser;
  const name = document.getElementById("changeNameInput").value.trim();

  if (!name) {
    showStatus(profileStatus, "Enter your name", "error");
    return;
  }

  try {
    profileBtn.classList.add("btn-loading");

    await updateDoc(doc(db, "users", user.uid), { name });

    showStatus(profileStatus, "✔ Profile updated successfully", "success");

  } catch (err) {
    showStatus(profileStatus, err.message, "error");
  } finally {
    profileBtn.classList.remove("btn-loading");
  }
});

  // support
const supportBtn = document.getElementById("contactUsBtn");
const supportStatus = document.getElementById("supportStatus");

supportBtn?.addEventListener("click", async () => {
  const user = auth.currentUser;
  const msg = document.getElementById("contactUsMessage").value.trim();

  if (!msg) {
    showStatus(supportStatus, "Enter your message", "error");
    return;
  }

  try {
    supportBtn.classList.add("btn-loading");

    await addDoc(collection(db, "supportMessages"), {
      uid: user.uid,
      email: user.email,
      message: msg,
      role: "student",
      createdAt: serverTimestamp()
    });

    showStatus(supportStatus, "Sending...", "loading");

setTimeout(() => {
  showStatus(supportStatus, "✔ Support request submitted successfully.", "success");
}, 800);

    document.getElementById("contactUsMessage").value = "";

  } catch (err) {
    showStatus(supportStatus, err.message, "error");
  } finally {
    supportBtn.classList.remove("btn-loading");
  }
});

  // logout
  document.getElementById("logoutBtn")?.addEventListener("click", async () => {
    try { sessionStorage.removeItem("guestRole"); } catch {}
    try { sessionStorage.removeItem("guestGreetingShown"); } catch {}
    await signOut(auth);
    localStorage.removeItem("currentUser");
    window.location.href = "./Index.html";
  });

});

// load user data
async function loadUserData(user) {
  try {
    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);

    if (!snap.exists()) return;

    let data = snap.data();
    let currentName = data.name || "";

    if (!currentName || /\d/.test(currentName)) {
      const raw = user.email.split("@")[0];

      const cleanName = raw
        .replace(/[0-9]/g, "")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/[^a-zA-Z]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b\w/g, c => c.toUpperCase());

      await updateDoc(userRef, { name: cleanName });

      currentName = cleanName;
    }

    document.getElementById("changeNameInput").value = currentName;
    document.getElementById("changeEmailInput").value = user.email || "";

  } catch (err) {
    console.error(err);
  }
}

function showStatus(el, msg, type) {
  if (!el) return;

  el.textContent = msg;
  el.className = `setting-status ${type}`;

  requestAnimationFrame(() => {
    el.classList.add("show");
  });

  setTimeout(() => {
    el.classList.remove("show");
  }, 4000);
}

async function injectUserIntoUI(user) {
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (!snap.exists()) return;

    const data = snap.data();

    const name = data.name || user.email?.split("@")[0] || "User";
    const roleLabel = data.roleLabel || "Student";

    let ats = 0;
    try {
      const stuSnap = await getDoc(doc(db, "students", user.uid));
      if (stuSnap.exists()) {
        const raw = Number(stuSnap.data()?.resumeAnalysis?.atsScore);
        if (Number.isFinite(raw)) ats = Math.max(0, Math.min(100, Math.round(raw)));
      }
    } catch (_) { }

    const profileName = document.querySelector(".profile-meta b");
    const profileMeta = document.querySelector(".profile-meta small");

    if (profileName) profileName.textContent = name;
    if (profileMeta) profileMeta.textContent = `${roleLabel} • ${ats}% ATS`;

    const currentUser = { name, roleLabel, email: user.email || "" };
    localStorage.setItem("currentUser", JSON.stringify(currentUser));

  } catch (err) {
    console.error("UI Inject Error:", err);
  }
}

function showToast(message, type = "info", duration = 3000) {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add("show");
  });

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 400);
  }, duration);
}

showToast("Profile updated", "success");
showToast("Invalid password", "error");
showToast("Loading data...", "loading");

// feedback

const feedbackBtn = document.getElementById("openFeedback");

feedbackBtn?.addEventListener("click", (e) => {
  e.preventDefault();

  const modal = document.getElementById("settingsModal");
  const supportSection = document.getElementById("supportSection");
  const textarea = document.getElementById("contactUsMessage");

  modal.classList.add("show");

  setTimeout(() => {
    supportSection?.scrollIntoView({ behavior: "smooth", block: "center" });
    textarea?.focus();
  }, 200);
});

// application redirect

const appNavBtn = document.getElementById("openApplications");

appNavBtn?.addEventListener("click", (e) => {
  e.preventDefault();

  const section = document.getElementById("applicationsSection");

  section?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
});

// task redirect

const tasksBtn = document.getElementById("openTasks");

tasksBtn?.addEventListener("click", (e) => {
  e.preventDefault();

  const section = document.getElementById("tasksSection");

  section?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
});

// TARS console
const tarsMessage = document.getElementById("tarsMessage");

if (tarsMessage) {
  let isTyping = false;

  // Pre-analysis pool — balanced mix of warm greetings, useful reminders,
  // and occasional (gentle) CV-analyzer nudges. Heavy on hospitality so it
  // doesn't feel like the app is pestering the user on login.
  const preAnalysisMessages = [
    // friendly / warm
    "Good to see you — glad you're back.",
    "Hope you're having a good one.",
    "Ready when you are.",
    "Take a breath, then let's make today count.",
    "Quiet day or busy one? Either works.",
    "You don't need to rush — explore at your pace.",
    // navigation + useful nudges
    "Browse internships from the Internships page when you're ready.",
    "The Workroom has everything for your active tasks.",
    "Keep tabs on application status from the Applications card below.",
    "Interviews show up on the dashboard the moment they're scheduled.",
    "Save roles for later — the bookmark ★ keeps them one click away.",
    // soft CV-analyzer reminders (minority of the pool)
    "Whenever you're ready, I can scan your CV for an ATS score.",
    "Curious how your résumé reads to recruiters? The Analyzer can help.",
    "A CV scan unlocks personalized tips — but only when you feel like it.",
  ];

  const devMessages = [
    "Average API latency is hovering around 380ms — worth a profile pass.",
    "Cold-start time on first paint sitting near 1.1s. Normal for the morning hit.",
    "Cache hit rate around 70% — room to climb with longer TTLs.",
    "Memory footprint stable across the last session. No leaks flagged.",
    "Background sync queue cleared on the last interval.",
    "Re-renders climbing on this page — memoization worth a look.",
    "Error rate sitting well inside the daily budget.",
    "Network panel shows a few redundant calls on load — batching candidates.",
    "DOM node count creeping past 2k. Virtualize the long list?",
    "First Contentful Paint trending toward 1.4s. Watch the critical CSS.",
    "Largest Contentful Paint green on desktop, yellow on 4G.",
    "Layout shift score nudged past 0.05. Lock down image dimensions.",
    "Long task detected on the main thread (>200ms). Chunk-split worth trying.",
    "Auth token refresh cycle on schedule — next rotation in ~25 min.",
    "Firestore read count running ~200/min, well inside the comfort zone.",
    "Image asset payload is 1.4MB on this view — compress or lazy-load?",
    "JS execution time on dashboard load is up about 15% week-over-week.",
    "Unused CSS sitting around 18%. Worth running a purge pass.",
    "Pending fetch promises: 0. Idle state looks healthy.",
    "Two minor console warnings showing — nothing breaking, but worth a sweep.",
    "Fonts swapping in around 280ms. Preloading the primary face would help.",
    "Service worker registered, offline shell current.",
    "Session storage usage at ~24KB. Well under quota.",
    "LocalStorage growth flat this session — no surprise writes.",
    "Time-to-interactive just over a second on this route. Solid.",
    "Frame drops negligible on scroll. Animation budget healthy.",
    "One transitive dependency chain deeper than the rest — flattening would shave install time.",
    "Bundle size up roughly 12KB this week. Tree-shake check is due.",
    "Listener count after the last navigation looks slightly high — verify cleanup.",
    "Background fetch ran ~600ms — still inside the soft target."
  ];

  let messagePool = [];

// voice greeting
function speakMessage(text) {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();

  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "en-US";

  utter.pitch = 0.6;
  utter.rate = 0.85;
  utter.volume = 1.2;
  utter.voice = speechSynthesis.getVoices().find(v =>
    v.lang.startsWith("en") && !/google/i.test(v.name)
  ) || speechSynthesis.getVoices()[0];

  speechSynthesis.speak(utter);
}

function triggerDevGreeting() {
  if (sessionStorage.getItem("devGreeted")) return;
  sessionStorage.setItem("devGreeted", "true");
  speakMessage("Welcome back, sir.");
}

// Build the normal-mode message pool from the student's live
// resumeAnalysis doc. If no analysis yet, return the pre-analysis nudges.
// If analysis exists, synthesize data-driven messages that quote the
// actual numbers / skills / improvements so TARS feels personalized.
function buildAnalysisMessages(analysis) {
  const out = [];
  if (!analysis || typeof analysis.atsScore !== "number") {
    return preAnalysisMessages.slice();
  }
  const ats = Math.max(0, Math.min(100, Math.round(Number(analysis.atsScore) || 0)));
  const match = typeof analysis.skillsMatch === "number"
    ? Math.max(0, Math.min(100, Math.round(analysis.skillsMatch))) : null;
  const detected = Array.isArray(analysis.detectedSkills) ? analysis.detectedSkills : [];
  const missing = Array.isArray(analysis.missingSkills) ? analysis.missingSkills : [];
  const improvements = Array.isArray(analysis.improvements) ? analysis.improvements : [];
  const strengths = Array.isArray(analysis.strengths) ? analysis.strengths : [];
  const summary = String(analysis.summary || "").trim();

  // Score-tiered opener
  if (ats >= 85)      out.push(`You're ${ats}% ATS-ready — solid work. Keep tightening the bullets.`);
  else if (ats >= 70) out.push(`You're ${ats}% ATS-ready. A few tweaks away from strong.`);
  else if (ats >= 50) out.push(`${ats}% ATS-ready — let's fix the formatting gaps.`);
  else                out.push(`${ats}% ATS — worth another pass before you apply.`);

  if (match !== null) {
    if (match >= 75)      out.push(`Skill match: ${match}%. You're a natural fit for most tech roles.`);
    else if (match >= 50) out.push(`Skill match: ${match}%. Pick up 1-2 of your missing skills to climb higher.`);
    else                  out.push(`Skill match: ${match}%. Widening your stack will unlock more openings.`);
  }

  if (summary) out.push(summary);

  // Missing skills — quote them by name, one per message
  missing.slice(0, 4).forEach((skill) => {
    if (!skill) return;
    const s = String(skill).trim();
    if (!s) return;
    out.push(`Add ${s} to your résumé — it boosts match for common roles.`);
  });

  // Improvements — quote each one verbatim (these are already specific)
  improvements.slice(0, 4).forEach((tip) => {
    if (!tip) return;
    out.push(`Next step: ${String(tip).trim()}`);
  });

  // Strengths — give the student something to feel good about
  strengths.slice(0, 3).forEach((s) => {
    if (!s) return;
    out.push(`Strength worth leaning on: ${String(s).trim()}.`);
  });

  // Detected-skills factoid (once)
  if (detected.length >= 3) {
    out.push(`I see ${detected.length} skills on your CV — keep adding projects that prove them.`);
  }

  // Always-available generic follow-ups for variety
  out.push("Apply to matching roles from the Internships page",
           "Check your open tasks in the Workroom",
           "Re-run the Analyzer after edits to see your score climb");

  return out;
}

async function initTars() {
  try {
    const user = auth.currentUser;
    if (!user) return;

    const snap = await getDoc(doc(db, "users", user.uid));
    if (!snap.exists()) return;

    const data = snap.data();
    const isDev = data.role === "dev";

    // dev greeting
if (isDev) {
  const justLoggedIn = sessionStorage.getItem("justLoggedIn");
  sessionStorage.removeItem("justLoggedIn");

  if (justLoggedIn && !sessionStorage.getItem("devGreeted")) {
    sessionStorage.setItem("devGreeted", "true");
    setTimeout(() => speakMessage("Welcome back, sir."), 800);
  }
}

    // Live-watch the student's resumeAnalysis so when they finish analyzing
    // mid-session TARS swaps immediately from nudges to data-driven tips.
    let currentAnalysis = null;
    if (!isDev) {
      onSnapshot(doc(db, "students", user.uid), (sSnap) => {
        currentAnalysis = sSnap.exists() ? (sSnap.data().resumeAnalysis || null) : null;
        // Reset pool so next rotation uses fresh messages
        messagePool = getMessagePool();
      }, () => { /* ignore — falls back to nudge pool */ });
    }

    function getMessagePool() {
      if (isDev) return [...devMessages];
      return buildAnalysisMessages(currentAnalysis);
    }

    messagePool = getMessagePool();

    function getRandomMessage() {
      if (messagePool.length === 0) messagePool = getMessagePool();
      const index = Math.floor(Math.random() * messagePool.length);
      return messagePool.splice(index, 1)[0];
    }

    function typeMessage(text) {
      let i = 0;
      isTyping = true;
      tarsMessage.textContent = "";
      const interval = setInterval(() => {
        tarsMessage.textContent += text.charAt(i);
        i++;
        if (i >= text.length) {
          clearInterval(interval);
          isTyping = false;
        }
      }, 20);
    }

    function showMessage(text) {
      tarsMessage.style.opacity = 0;
      setTimeout(() => {
        if (isDev) typeMessage(text);
        else tarsMessage.textContent = text;
        tarsMessage.style.opacity = 1;
      }, 300);
    }

    showMessage(getRandomMessage());

    setInterval(() => {
      if (isTyping) return;
      showMessage(getRandomMessage());
    }, 6500);

  } catch (err) {
    console.error("TARS init error:", err);
  }
}

onAuthStateChanged(auth, (user) => {
  if (!user) return;

  initTars();
  setupNotifications(user);
  loadKPIs(user);
  subscribeToApps(user);
  _maybeLoadInternal(user.uid);
});

// Dev-only: dynamically import the private analytics module if this uid's
// SHA-256 matches the hardcoded prefix. Non-dev users never trigger the
// import — the file is never fetched and never appears in Network / Sources.
//
// To set the prefix for yourself:
//   1. Log in as yourself and open DevTools console.
//   2. Run:
//        (async () => {
//          const h = await crypto.subtle.digest(
//            "SHA-256",
//            new TextEncoder().encode(firebase.auth().currentUser.uid)
//          );
//          console.log(Array.from(new Uint8Array(h))
//            .map(b => b.toString(16).padStart(2,"0")).join("").slice(0,10));
//        })();
//   3. Copy the printed 10-char hex prefix into DEV_UID_HASH_PREFIX below.
async function _maybeLoadInternal(uid) {
  const DEV_UID_HASH_PREFIX = "8e1b59b572";
  if (DEV_UID_HASH_PREFIX === "__UNSET__") return;
  try {
    const buf = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(uid)
    );
    const hex = Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    if (!hex.startsWith(DEV_UID_HASH_PREFIX)) return;
    await import("./internal-analytics.js");
  } catch (_) { /* silent */ }
}

function setupNotifications(user) {
  const notifBtn      = document.getElementById("notifBtn");
  const notifDropdown = document.getElementById("notifDropdown");
  const notifBadge    = document.getElementById("notifBadge");
  const notifList     = document.getElementById("notifList");
  const markAllBtn    = document.getElementById("markAllRead");

  notifBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    notifDropdown.classList.toggle("hidden");
  });

  document.addEventListener("click", (e) => {
    if (!notifDropdown?.contains(e.target) && e.target !== notifBtn) {
      notifDropdown.classList.add("hidden");
    }
  });

  const q = query(
    collection(db, "notifications"),
    where("studentId", "==", user.uid),
    orderBy("createdAt", "desc")
  );

  // Track seen ids between snapshots so we can ping only when a truly new
  // notification arrives — not on every snapshot or when flags flip.
  const _seenNotifIds = new Set();
  let _seenInitialized = false;

  onSnapshot(q, (snap) => {
    const notifications = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const unread = notifications.filter(n => !n.isRead).length;

    // Fire the ping when a new notification id appears after the first load.
    const currentIds = notifications.map((n) => n.id);
    if (_seenInitialized) {
      const fresh = currentIds.filter((id) => !_seenNotifIds.has(id));
      if (fresh.length && typeof window.playNotifPing === "function") {
        window.playNotifPing();
      }
    }
    _seenNotifIds.clear();
    currentIds.forEach((id) => _seenNotifIds.add(id));
    _seenInitialized = true;

    if (unread > 0) {
      notifBadge.textContent = unread;
      notifBadge.style.display = "inline-block";
    } else {
      notifBadge.style.display = "none";
    }

    if (!notifications.length) {
      notifList.innerHTML = '<p class="notif-empty">No notifications yet.</p>';
      return;
    }

    const escAttr = (s) =>
      String(s ?? "").replace(/[&<>"']/g, (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

    const senderChip = (n) => {
      const role = n.senderRole || "";
      const name = n.senderName || n.companyName || "InternSphere";
      const roleLabel = role === "admin"   ? "Admin"
                      : role === "company" ? "Company"
                      : role === "system"  ? "System"
                      : "InternSphere";
      const roleClass = ["admin","company","system"].includes(role) ? role : "system";
      return `<span class="notif-sender notif-sender--${roleClass}">
                <b>${escAttr(name)}</b>
                <span class="notif-sender-role">${escAttr(roleLabel)}</span>
              </span>`;
    };

    notifList.innerHTML = notifications.map(n => {
      const time = n.createdAt?.toDate
        ? n.createdAt.toDate().toLocaleString()
        : "Just now";

      return `
        <div class="notif-item ${n.isRead ? "read" : "unread"}" data-id="${escAttr(n.id)}">
          <span class="notif-dot"></span>
          <div>
            ${senderChip(n)}
            <div class="notif-msg">${escAttr(n.message)}</div>
            <div class="notif-time">${escAttr(time)}</div>
          </div>
        </div>
      `;
    }).join("");

    notifList.querySelectorAll(".notif-item").forEach(item => {
      item.addEventListener("click", async () => {
        const id = item.getAttribute("data-id");
        await updateDoc(doc(db, "notifications", id), { isRead: true });
      });
    });
  });

  markAllBtn?.addEventListener("click", async () => {
    const batch = writeBatch(db);

    const snap2 = await getDocs(query(
      collection(db, "notifications"),
      where("studentId", "==", user.uid),
      where("isRead", "==", false)
    ));

    snap2.forEach(d => {
      batch.update(d.ref, { isRead: true });
    });

    await batch.commit();
  });
}

document.querySelector(".logout")?.addEventListener("click", async () => {
  const tarsMessage = document.getElementById("tarsMessage");

  if (tarsMessage) {
    tarsMessage.style.opacity = 0;
    setTimeout(() => {
      tarsMessage.textContent = "Logging you out...";
      tarsMessage.style.opacity = 1;
    }, 200);
  }

  setTimeout(async () => {
    sessionStorage.removeItem("devGreeted");
    sessionStorage.removeItem("guestRole");
    sessionStorage.removeItem("guestGreetingShown");
    await signOut(auth);
    localStorage.removeItem("currentUser");
    window.location.href = "./Index.html";
  }, 1200);
});

// quick nav
document.querySelectorAll(".tars-menu-btn")[0]?.addEventListener("click", (e) => {
  e.preventDefault();
  document.getElementById("profileModal")?.classList.add("is-open");
});

// profile dropdown
document.addEventListener("DOMContentLoaded", () => {
  const profileBtn = document.querySelector(".profile");
  const tarsConsole = document.getElementById("tarsConsole");
  if (!profileBtn || !tarsConsole) return;

  profileBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    tarsConsole.classList.toggle("show");
  });

  document.addEventListener("click", (e) => {
    if (!tarsConsole.contains(e.target) && !profileBtn.contains(e.target)) {
      tarsConsole.classList.remove("show");
    }
  });
});
}

// virtual workroom button
const workroomBtn = document.getElementById('enterWorkroom');
workroomBtn.addEventListener('click', () => {
  window.location.href = '/virtualworkroom.html';
});


// Find Internships button in TARS menu
document.getElementById("openAiSearchFromProfile")?.addEventListener("click", () => {
  // close TARS console first
  document.getElementById("tarsConsole")?.classList.remove("show");
  // redirect to internship listing page
  window.location.href = "internshipdetails.html";
});

// Contact Us button in TARS menu
document.querySelectorAll(".tars-menu-btn")[3]?.addEventListener("click", () => {
  window.location.href = "mailto:InternSphere7@gmail.com";
});



// Strip trailing role suffixes like "Developer", "Engineer", "Intern",
// so multi-role labels stay short: "Frontend Developer" → "Frontend".
function shortenRole(role) {
  const s = String(role || "").trim();
  if (!s) return "";
  const trimmed = s
    .replace(/\b(intern(ship)?s?|developer|engineer|designer|manager)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const out = trimmed || s.split(/\s+/)[0];
  return out.length > 18 ? out.slice(0, 16) + "…" : out;
}

const _kpiCompanyNameCache = new Map();

function _esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Reliable numeric timestamp for an application — mirrors the apps-table
// resolver: prefers appliedAtMs, falls back to Date.parse, then a regex for
// locale-formatted strings. Used by the Active Role KPI to sort newest-first.
function _kpiAppTs(a) {
  if (typeof a.appliedAtMs === "number" && !isNaN(a.appliedAtMs)) return a.appliedAtMs;
  if (a.appliedAt) {
    const t = Date.parse(a.appliedAt);
    if (!isNaN(t)) return t;
    const m = String(a.appliedAt).match(
      /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?/
    );
    if (m) {
      let n1 = parseInt(m[1], 10);
      let n2 = parseInt(m[2], 10);
      let yr = parseInt(m[3], 10);
      let hr = parseInt(m[4], 10);
      const min = parseInt(m[5], 10);
      const sec = parseInt(m[6] || "0", 10);
      const ampm = (m[7] || "").toLowerCase();
      if (ampm === "pm" && hr < 12) hr += 12;
      if (ampm === "am" && hr === 12) hr = 0;
      if (yr < 100) yr += 2000;
      const mo = n1 > 12 ? n2 : n1;
      const day = n1 > 12 ? n1 : n2;
      const parsed = Date.UTC(yr, mo - 1, day, hr, min, sec);
      if (!isNaN(parsed)) return parsed;
    }
  }
  return 0;
}

// Build a Map<appId, companyName> by hydrating the companies cache once for
// the set of company ids touched by these apps.
async function _resolveCompanyByApp(apps) {
  const out = new Map();
  const ids = [...new Set(apps.map((a) => a.companyId).filter(Boolean))];
  await Promise.all(ids.map(async (id) => {
    if (_kpiCompanyNameCache.has(id)) return;
    try {
      const snap = await getDoc(doc(db, "companies", id));
      _kpiCompanyNameCache.set(
        id,
        snap.exists() ? (snap.data().companyName || snap.data().name || "") : ""
      );
    } catch (_) {
      _kpiCompanyNameCache.set(id, "");
    }
  }));
  apps.forEach((a) => {
    out.set(
      a.id,
      a.company || _kpiCompanyNameCache.get(a.companyId) || ""
    );
  });
  return out;
}

async function resolveCompanyNames(apps) {
  const ids = [...new Set(apps.map((a) => a.companyId).filter(Boolean))];
  await Promise.all(ids.map(async (id) => {
    if (_kpiCompanyNameCache.has(id)) return;
    try {
      const snap = await getDoc(doc(db, "companies", id));
      _kpiCompanyNameCache.set(
        id,
        snap.exists() ? (snap.data().companyName || snap.data().name || "") : ""
      );
    } catch (_) {
      _kpiCompanyNameCache.set(id, "");
    }
  }));
  return [...new Set(
    apps
      .map((a) => a.company || _kpiCompanyNameCache.get(a.companyId) || "")
      .filter(Boolean)
  )];
}

async function loadKPIs(user) {
  const kpiAppsVal   = document.querySelector(".kpi:nth-child(1) .kpi-val");
  const kpiAppsSubEl = document.querySelector(".kpi:nth-child(1) .kpi-sub");
  const kpiTasksVal  = document.querySelector(".kpi:nth-child(2) .kpi-val");
  const kpiTasksSubEl= document.querySelector(".kpi:nth-child(2) .kpi-sub");
  const kpiProgVal   = document.querySelector(".kpi:nth-child(3) .kpi-val");
  const kpiProgSubEl = document.querySelector(".kpi:nth-child(3) .kpi-sub");
  const kpiRoleVal   = document.querySelector(".kpi:nth-child(4) .kpi-val");
  const kpiRoleSubEl = document.querySelector(".kpi:nth-child(4) .kpi-sub");

  // ── 1. Applications KPI ── read from Firestore, NOT localStorage
  try {
    const appsQ = query(
      collection(db, "applications"),
      where("studentId", "==", user.uid)
    );
    onSnapshot(appsQ, (snap) => {
      const apps = snap.docs.map(d => d.data());
      const total    = apps.length;
      const approved = apps.filter(a => a.status === "Approved").length;
      const rejected = apps.filter(a => a.status === "Rejected").length;
      const pending  = apps.filter(a => a.status === "Pending" || !a.status).length;

      if (kpiAppsVal) kpiAppsVal.textContent = total;
      if (kpiAppsSubEl) {
        const parts = [];
        if (approved) parts.push(`${approved} approved`);
        if (rejected) parts.push(`${rejected} rejected`);
        if (pending)  parts.push(`${pending} pending`);
        kpiAppsSubEl.textContent = parts.join(" · ") || "No applications yet";
      }
    });
  } catch (err) {
    console.error("KPI applications error:", err);
  }

  // ── 2. Tasks KPI ── read taskSubmissions collection
  try {
    const tasksQ = query(
      collection(db, "taskSubmissions"),
      where("studentId", "==", user.uid)
    );
    onSnapshot(tasksQ, (snap) => {
      const submissions = snap.docs.map((d) => d.data());
      const total    = submissions.length;
      // Approval state lives at feedback.status === "approved" (lowercase).
      const approved = submissions.filter(
        (s) => s.feedback && s.feedback.status === "approved"
      ).length;

      if (kpiTasksVal) kpiTasksVal.textContent = total;
      if (kpiTasksSubEl) {
        kpiTasksSubEl.textContent = total
          ? `${approved}/${total} approved`
          : "No tasks yet";
      }
    });
  } catch (err) {
    console.error("KPI tasks error:", err);
  }

  // ── 3 & 4. Progress + Active Role — from the student's active internship ──
  try {
    // Query all apps for this student (no composite index needed) and
    // filter Approved client-side — more robust than a compound where() that
    // can silently fail if the Firestore composite index isn't deployed.
    const activeAppQ = query(
      collection(db, "applications"),
      where("studentId", "==", user.uid)
    );

    onSnapshot(activeAppQ, async (rawSnap) => {
      const snap = {
        empty: rawSnap.docs.every((d) => d.data().status !== "Approved"),
        docs: rawSnap.docs.filter((d) => d.data().status === "Approved"),
      };
      if (snap.empty) {
        if (kpiRoleVal) kpiRoleVal.textContent = "—";
        if (kpiRoleSubEl) kpiRoleSubEl.textContent = "No active role";
        if (kpiProgVal) kpiProgVal.textContent = "—";
        if (kpiProgSubEl) kpiProgSubEl.textContent = "No internship active";
        return;
      }

      const approvedApps = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // Sort newest-first using the same reliable resolver as the apps table.
      approvedApps.sort((a, b) => _kpiAppTs(b) - _kpiAppTs(a));

      // ── Active Role KPI ── stack each role on its own line, latest first.
      // Resolve company names up-front so sub-line + per-line pairings match.
      const companyByApp = await _resolveCompanyByApp(approvedApps);

      // Only show the two most recent internships — enough to be informative
      // without overflowing the compact KPI card.
      const shown = approvedApps.slice(0, 2);

      if (kpiRoleVal) {
        if (!shown.length) {
          kpiRoleVal.classList.remove("kpi-val--stack");
          kpiRoleVal.textContent = "—";
          kpiRoleVal.title = "";
        } else if (shown.length === 1) {
          kpiRoleVal.classList.remove("kpi-val--stack");
          kpiRoleVal.textContent = shown[0].role || "Intern";
          kpiRoleVal.title = shown[0].role || "";
        } else {
          kpiRoleVal.classList.add("kpi-val--stack");
          kpiRoleVal.innerHTML = shown
            .map((a, i) => {
              const role = _esc(a.role || "Intern");
              return '<span class="kpi-val__role kpi-val__role--' + (i === 0 ? "primary" : "secondary") + '">' +
                       role +
                     '</span>';
            })
            .join("");
          kpiRoleVal.title = shown.map((a) => a.role || "Intern").join(" · ");
        }
      }

      if (kpiRoleSubEl) {
        if (!shown.length) {
          kpiRoleSubEl.textContent = "No active role";
          kpiRoleSubEl.classList.remove("kpi-sub--stack");
        } else if (shown.length === 1) {
          kpiRoleSubEl.classList.remove("kpi-sub--stack");
          kpiRoleSubEl.textContent = companyByApp.get(shown[0].id) || "Active internship";
        } else {
          kpiRoleSubEl.classList.add("kpi-sub--stack");
          kpiRoleSubEl.innerHTML = shown
            .map((a) => {
              const co = _esc(companyByApp.get(a.id) || "Active internship");
              return '<span class="kpi-sub__co">at ' + co + '</span>';
            })
            .join("");
        }
      }

      // ── Progress KPI ──
      // The *newest* approved internship might be a fresh one with no tasks
      // yet. Scan every approved internship and pick the one with the most
      // tasks so Progress reflects the internship the student is actually
      // working on. Fall back to the newest if none have tasks yet.
      try {
        const subsSnap = await getDocs(query(
          collection(db, "taskSubmissions"),
          where("studentId", "==", user.uid)
        ));
        const subs = subsSnap.docs.map((d) => d.data());

        const perInternship = await Promise.all(
          approvedApps
            .filter((a) => a.internshipId)
            .map(async (a) => {
              const tSnap = await getDocs(query(
                collection(db, "tasks"),
                where("internshipId", "==", a.internshipId)
              ));
              const totalTasks = tSnap.size;
              const approvedSubs = subs.filter(
                (s) => s.internshipId === a.internshipId
                    && s.feedback && s.feedback.status === "approved"
              ).length;
              return { app: a, totalTasks, approvedSubs };
            })
        );

        // Prefer internships with tasks; among those, pick the one with the
        // highest task count (most "active"). If none have tasks yet, fall
        // back to the newest approved app so we still say something useful.
        const withTasks = perInternship.filter((p) => p.totalTasks > 0);
        const pick = withTasks.length
          ? withTasks.sort((a, b) => b.totalTasks - a.totalTasks)[0]
          : { app: approvedApps[0], totalTasks: 0, approvedSubs: 0 };

        if (!pick.app || !pick.app.internshipId || pick.totalTasks === 0) {
          if (kpiProgVal) kpiProgVal.textContent = "—";
          if (kpiProgSubEl) kpiProgSubEl.textContent = "No tasks assigned yet";
          return;
        }

        const pct = Math.round((pick.approvedSubs / pick.totalTasks) * 100);
        if (kpiProgVal) kpiProgVal.textContent = `${pct}%`;

        let duration = "";
        try {
          const intSnap = await getDoc(doc(db, "internships", pick.app.internshipId));
          if (intSnap.exists()) {
            const d = intSnap.data();
            duration = d.duration || d.durationKey || "";
          }
        } catch (_) {}

        if (kpiProgSubEl) {
          const approvedCount = pick.approvedSubs;
          const totalTasks = pick.totalTasks;
          kpiProgSubEl.textContent = [
            `${approvedCount}/${totalTasks} tasks approved`,
            duration,
          ].filter(Boolean).join(" · ");
        }
      } catch (err) {
        console.error("KPI progress error:", err);
        if (kpiProgVal) kpiProgVal.textContent = "—";
        if (kpiProgSubEl) kpiProgSubEl.textContent = "Couldn't load progress";
      }
    }, (err) => {
      console.error("KPI active role subscription error:", err);
      if (kpiRoleVal) kpiRoleVal.textContent = "—";
      if (kpiRoleSubEl) kpiRoleSubEl.textContent = "Couldn't load role";
    });
  } catch (err) {
    console.error("KPI active role error:", err);
  }
}