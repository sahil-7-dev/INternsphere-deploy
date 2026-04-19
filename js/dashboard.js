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

  // task data
  const tasks = [
    {
      id: 1,
      title: "Submit API assignment",
      meta: "Orbit • Workroom",
      due: "Today",
      tag: "High",
      tagType: "warn",
      done: false,
      bucket: "today",
    },
    {
      id: 2,
      title: "Update resume with REST APIs",
      meta: "AI Analyzer",
      due: "Tomorrow",
      tag: "Medium",
      tagType: "ok",
      done: false,
      bucket: "week",
    },
    {
      id: 3,
      title: "Prepare interview notes",
      meta: "Nova • Interview",
      due: "Thu",
      tag: "Medium",
      tagType: "ok",
      done: false,
      bucket: "week",
    },
    {
      id: 4,
      title: "Upload project screenshots",
      meta: "Portfolio",
      due: "Sat",
      tag: "Low",
      tagType: "",
      done: true,
      bucket: "week",
    },
    {
      id: 5,
      title: "Request feedback from mentor",
      meta: "Feedback",
      due: "Sun",
      tag: "Low",
      tagType: "",
      done: false,
      bucket: "week",
    },
  ];

  const taskList = document.getElementById("taskList");
  const segBtns = document.querySelectorAll(".seg-btn");

  function renderTasks(filter = "all") {
    if (!taskList) return;

    taskList.innerHTML = "";

    const filteredTasks =
      filter === "all" ? tasks : tasks.filter((task) => task.bucket === filter);

    filteredTasks.forEach((task) => {
      const row = document.createElement("div");
      row.className = "task";

      row.innerHTML = `
        <div class="task-left">
          <button class="check ${task.done ? "done" : ""}" data-id="${task.id}" aria-label="Toggle task done">
            ${task.done ? "✓" : ""}
          </button>
          <div class="task-meta">
            <b>${task.title}</b>
            <small>${task.meta}</small>
          </div>
        </div>

        <div class="task-right">
          <span class="due">${task.due}</span>
          <span class="tag ${task.tagType || ""}">${task.tag}</span>
        </div>
      `;

      taskList.appendChild(row);
    });
  }

  taskList?.addEventListener("click", (e) => {
    const btn = e.target.closest(".check");
    if (!btn) return;

    const id = Number(btn.getAttribute("data-id"));
    const task = tasks.find((item) => item.id === id);
    if (!task) return;

    task.done = !task.done;

    const activeFilter =
      document.querySelector(".seg-btn.active")?.dataset.filter || "all";

    renderTasks(activeFilter);
  });

  segBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      segBtns.forEach((item) => item.classList.remove("active"));
      btn.classList.add("active");
      renderTasks(btn.dataset.filter || "all");
    });
  });

  renderTasks("all");

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
    const finalValue = parseInt(el.textContent.replace(/\D/g, ""), 10) || 0;
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

const tableBody  = document.getElementById("applicationsTableBody");
  const filterBtns = document.querySelectorAll(".filter-btn");

  let apps          = [];
  let currentFilter = "all";
  let lastData      = "";

  function getApps() {
    return JSON.parse(localStorage.getItem("applications")) || [];
  }

  function renderApps(force = false) {
    if (!tableBody) return;

    const data        = getApps();
    const currentData = JSON.stringify(data) + currentFilter;

    if (!force && currentData === lastData) return;
    lastData = currentData;

    apps = data;
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
      return;
    }

    filtered.slice().reverse().forEach((app) => {
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
        <td><span class="status ${statusClass}">${_esc(app.status)}</span></td>
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

  renderApps(true);

  // filter buttons
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".filter-btn");
  if (!btn) return;

  document.querySelectorAll(".filter-btn").forEach((b) => {
    b.classList.remove("active");
  });

  btn.classList.add("active");

  currentFilter = btn.dataset.filter || "all";

  renderApps(true);
});
  window.addEventListener("storage", (e) => {
    if (e.key === "applications") {
      lastData = "";
      renderApps();
    }
  });

  setInterval(renderApps, 800);

  // modal
  function openModal(app) {
    const modal        = document.getElementById("appModal");
    const modalContent = document.getElementById("modalContent");
    const title        = document.getElementById("appDetailsTitle");
    if (!modal || !modalContent) return;

    const status = (app.status || "Pending");
    const statusClass = status.toLowerCase();

    const cvBlock = app.cvData
      ? `<a class="app-cv" href="${esc(app.cvData)}" download="${esc(app.cvName || "cv.pdf")}">
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
    await signOut(auth);
    localStorage.removeItem("currentUser");
    window.location.href = "./login.html";
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

  const normalMessages = [
    "Analyzing your profile...",
    "Run the AI Resume Analyzer to see your ATS score",
    "Add SQL to boost your score",
    "Check your open tasks in the Workroom",
    "Apply to matching roles from the Internships page"
  ];

  const devMessages = [
    "3 uncommitted changes in your branch.",
    "Warning: function 'fetchData' took 2.3s to execute.",
    "New error: 'Cannot read property x of undefined'.",
    "Memory usage is higher than usual, check your loops.",
    "You have 2 pending TODOs in your code.",
    "API response delayed by 450ms.",
    "Unit tests: 2 failed, 18 passed.",
    "Console shows 1 deprecation warning.",
    "Your last commit was 3 hours ago.",
    "Linting: 5 issues detected in style.js.",
    "Branch is ahead by 2 commits, behind by 1.",
    "Database query returned empty result. Verify your logic.",
    "Dependency 'lodash' is outdated.",
    "Server response code: 500. Investigate immediately.",
    "UI render time spiked to 120ms on this component.",
    "Ahh… not developer again. Brace for impact.",
    "Console.log is silently judging you.",
    "You debug like a detective who lost their magnifying glass.",
    "Somewhere a bug is applauding your creative chaos.",
    "Your commit history tells a suspenseful story.",
    "Variables are panicking… slightly.",
    "You didn’t break it… but it’s thinking about it.",
    "Temporary fixes strike again. Bold choice.",
    "Stack Overflow called. It has questions about you.",
    "The dashboard trembles… it knows you’re here.",
    "Every click you make sends ripples through the server.",
    "Ahh… developer again. The console whispers: 'Please… not today.'",
    "Your logic haunts production with theatrical flair.",
    "Even AI hesitates reading your code. It needs therapy."
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

    function getMessagePool() {
      return isDev ? [...devMessages] : [...normalMessages];
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
});

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

  onSnapshot(q, (snap) => {
    const notifications = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const unread = notifications.filter(n => !n.isRead).length;

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
    await signOut(auth);
    localStorage.removeItem("currentUser");
    window.location.href = "./login.html";
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
