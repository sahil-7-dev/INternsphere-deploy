// js/dashboard-company.js

import { requireRole } from "./guard.js";
requireRole(["company"]);

import { auth, db, storage } from "../firebase/firebase.js";
import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  deleteDoc,
  doc,
  updateDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-storage.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { esc } from "./lib/escape.js";

function parseBullets(raw) {
  return String(raw || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

// role archetypes
const ROLE_ARCHETYPES = {
  webdev: {
    match: [/front.?end/i, /web\s*dev/i, /full.?stack/i, /react/i, /vue/i, /angular/i, /next\.?js/i, /html|css|javascript|typescript/i],
    label: "web developer",
    skills: "e.g. React, TypeScript, Tailwind, REST APIs",
    mission: "e.g. Help ship the customer-facing web app used by 50k+ users. You'll pair with senior engineers on new features, performance work, and accessibility fixes.",
    responsibilities:
      "Build and review UI components in our React codebase\nImplement designs pixel-accurately across breakpoints\nWrite unit + integration tests before merging\nDebug bugs reported by support",
    requirements:
      "Comfortable with JavaScript / TypeScript + one modern framework\nUnderstanding of semantic HTML and responsive CSS\nA public repo or side project we can read\nClear written communication in PRs",
  },
  backend: {
    match: [/back.?end/i, /api/i, /node/i, /python.*back|django|flask/i, /golang|rust.*back|java.*back|spring/i, /microservice/i, /server.?side/i],
    label: "backend developer",
    skills: "e.g. Node.js, PostgreSQL, REST, Docker",
    mission: "e.g. Own a slice of our API that powers mobile + web clients. You'll design endpoints, write migrations, and help keep the service reliable.",
    responsibilities:
      "Design and implement REST / GraphQL endpoints\nWrite database migrations and indexes\nAdd logging, metrics, and alerts\nFix bugs surfaced by monitoring",
    requirements:
      "Fluent in at least one server-side language\nComfortable with SQL + a relational DB\nCan explain a trade-off in a design doc\nCare about tests and edge cases",
  },
  mobile: {
    match: [/mobile/i, /ios/i, /android/i, /swift/i, /kotlin/i, /flutter/i, /react.?native/i],
    label: "mobile developer",
    skills: "e.g. Swift/Kotlin, REST, offline-first UX",
    mission: "e.g. Help build the mobile experience our users spend the most time in. You'll own end-to-end features from design hand-off through release.",
    responsibilities:
      "Implement new screens from Figma designs\nWire API calls with proper loading + error states\nProfile and fix performance regressions\nSubmit builds to TestFlight / Play internal testing",
    requirements:
      "Experience shipping at least one native or hybrid app\nComfort reading OS-level logs and crash reports\nTaste for smooth UI transitions\nPatience for app-store review cycles",
  },
  design: {
    match: [/ui\/?ux/i, /designer/i, /product.*design/i, /visual.*design/i, /figma/i],
    label: "product designer",
    skills: "e.g. Figma, prototyping, user research",
    mission: "e.g. Design simple, delightful flows for real users. You'll partner with PM and eng in a cross-functional squad from discovery through ship.",
    responsibilities:
      "Turn ambiguous briefs into clear flows and prototypes\nRun weekly usability sessions with 5 users\nMaintain the design system library we share with engineers\nPair with devs during implementation to protect polish",
    requirements:
      "Portfolio showing process, not just pretty screens\nComfort with Figma components, auto-layout, variants\nCan defend design decisions with evidence\nWritten communication strength",
  },
  data: {
    match: [/data\s*sci/i, /\bML\b/i, /machine.?learning/i, /analytics?\b/i, /data\s*engin/i, /ai\b|nlp\b/i],
    label: "data / ML intern",
    skills: "e.g. Python, pandas, SQL, scikit-learn",
    mission: "e.g. Partner with product and engineering to turn raw events into decisions. You'll explore datasets, prototype models, and ship insights the team actually uses.",
    responsibilities:
      "Write SQL queries and notebooks to answer product questions\nPrototype and evaluate ML models on real data\nBuild small dashboards / reports for stakeholders\nDocument findings so others can reproduce them",
    requirements:
      "Comfortable with Python + pandas / numpy\nCan write non-trivial SQL\nBasic understanding of statistics and evaluation metrics\nCuriosity about the business, not just the algorithm",
  },
  marketing: {
    match: [/market/i, /growth/i, /seo/i, /\bsocial\b/i, /content/i, /brand/i, /copy.?writ/i, /email.*campaign/i],
    label: "marketing intern",
    skills: "e.g. Copywriting, analytics, SEO basics",
    mission: "e.g. Grow our reach by turning a tight brand voice into content people actually want to read. You'll ship campaigns end to end, measure what worked, and iterate.",
    responsibilities:
      "Draft and schedule social posts across channels\nWrite long-form blog content tied to keywords we care about\nRun A/B tests on subject lines and landing copy\nReport weekly on acquisition metrics",
    requirements:
      "A portfolio of published writing (blog, newsletter, thread, etc.)\nComfort with basic analytics (GA, Mixpanel, or similar)\nEye for brand voice consistency\nCan plan a 4-week content calendar independently",
  },
  product: {
    match: [/product.?manag/i, /\bPM\b/i, /product\s*owner/i, /associate\s*product/i],
    label: "product manager",
    skills: "e.g. Discovery, specs, stakeholder alignment",
    mission: "e.g. Help shape what we build. You'll sit between design, eng, and customers — sharpening problems worth solving and watching them ship.",
    responsibilities:
      "Write clear specs with problem + constraints + acceptance criteria\nRun user interviews and synthesize findings\nOwn the roadmap for one small area\nShip weekly updates to the internal team",
    requirements:
      "Can write clearly — we'll ask for a sample doc\nCurious about users, not just features\nFamiliarity with at least one analytics tool\nComfortable pushing back when a scope feels wrong",
  },
  devops: {
    match: [/devops/i, /sre\b/i, /site.?reliab/i, /cloud/i, /aws|gcp|azure/i, /infra/i, /kubernetes|k8s|docker/i, /ci\/cd/i],
    label: "DevOps / SRE intern",
    skills: "e.g. AWS, Terraform, Docker, CI/CD",
    mission: "e.g. Keep the infrastructure that hosts our product fast and boring. You'll automate what's manual and help the team deploy safely.",
    responsibilities:
      "Maintain and improve CI/CD pipelines\nWrite Terraform / IaC for new resources\nTune alerts and runbooks for on-call\nHelp debug production incidents during business hours",
    requirements:
      "Comfort on a Linux shell\nBasic understanding of networking + HTTP\nOne cloud provider experience (AWS / GCP / Azure)\nWillingness to write docs when you fix something",
  },
};

const DEFAULT_HINTS = {
  skills: "e.g. React, Node.js, Python",
  mission: "e.g. Help us build delightful spending experiences for millions of users. You'll work with a cross-functional product team…",
  responsibilities: "Own design for the mobile wallet flow\nRun weekly user research sessions\nShip visual QA tickets with engineering",
  requirements: "Portfolio showing product thinking\nComfort with Figma or similar\nWritten communication strength",
};

function detectArchetype(title) {
  const t = String(title || "");
  if (!t.trim()) return null;
  for (const key of Object.keys(ROLE_ARCHETYPES)) {
    const a = ROLE_ARCHETYPES[key];
    if (a.match.some((re) => re.test(t))) return a;
  }
  return null;
}

function refreshRoleHints() {
  const title = document.getElementById("field-title")?.value || "";
  const a = detectArchetype(title) || DEFAULT_HINTS;
  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.setAttribute("placeholder", v);
  };
  set("field-skills", a.skills);
  set("field-mission", a.mission);
  set("field-responsibilities", a.responsibilities);
  set("field-requirements", a.requirements);
}

// shortlist modal
async function submitShortlist(app, interviewAt, interviewDetails) {
  try {
    const tz = (() => {
      try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; }
      catch { return ""; }
    })();

    const isReschedule = app.status === "Shortlisted";
    await updateDoc(doc(db, "applications", app.id), {
      status: "Shortlisted",
      interviewAt: interviewAt || "",
      interviewDetails: interviewDetails || "",
      interviewTimezone: tz,
    });
    if (!isReschedule) {
      await sendNotification(app.id, "Shortlisted");
    }
  } catch (e) {
    console.error("Failed to shortlist:", e);
    alert("Could not save — check console.");
  }
}

function openShortlistModal(app) {
  const existing = document.getElementById("shortlistModal");
  if (existing) existing.remove();

  const isReschedule = app.status === "Shortlisted";

  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  const pad = (n) => String(n).padStart(2, "0");
  const defaultWhen =
    d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
    "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());

  const prefillWhen = app.interviewAt || defaultWhen;
  const prefillDetails = app.interviewDetails || "";

  let tzHint = "";
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) {
      const parts = Intl.DateTimeFormat("en", { timeZone: tz, timeZoneName: "short" })
        .formatToParts(new Date());
      const z = parts.find((p) => p.type === "timeZoneName");
      tzHint = " (saved as " + esc(z ? z.value : tz) + ")";
    }
  } catch { }

  const title = isReschedule ? "Reschedule interview" : "Shortlist applicant";
  const submitLbl = isReschedule ? "Save changes" : "Send shortlist";
  const subLine = isReschedule
    ? ("Update the interview with <b>" + esc(app.name || "this applicant") + "</b>.")
    : ("Schedule an interview with <b>" + esc(app.name || "this applicant") + "</b>.");

  const modal = document.createElement("div");
  modal.id = "shortlistModal";
  modal.className = "sl-modal";
  modal.innerHTML =
    '<div class="sl-modal-card">' +
      '<div class="sl-modal-head">' +
        '<h3>' + title + '</h3>' +
        '<button class="sl-modal-close" aria-label="Close">✕</button>' +
      '</div>' +
      '<p class="sl-modal-sub">' + subLine + '</p>' +
      '<label class="sl-label">Interview date &amp; time' + tzHint + '</label>' +
      '<input id="slWhen" type="datetime-local" value="' + esc(prefillWhen) + '">' +
      '<label class="sl-label">Meeting link or location</label>' +
      '<input id="slDetails" type="text" placeholder="https://meet.google.com/… or office address" value="' + esc(prefillDetails) + '">' +
      '<div class="sl-modal-foot">' +
        '<button class="btn-ghost sl-cancel" type="button">Cancel</button>' +
        '<button class="btn-primary sl-submit" type="button">' + submitLbl + '</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector(".sl-modal-close").addEventListener("click", close);
  modal.querySelector(".sl-cancel").addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

  modal.querySelector(".sl-submit").addEventListener("click", async () => {
    const when = document.getElementById("slWhen").value;
    const details = document.getElementById("slDetails").value.trim();
    if (!when) {
      alert("Please pick an interview date and time.");
      return;
    }
    await submitShortlist(app, when, details);
    close();
  });
}

async function sendNotification(appId, newStatus, extraReason) {
  try {
    const appSnap = await getDoc(doc(db, "applications", appId));
    if (!appSnap.exists()) return;
    const appData = appSnap.data();

    const intSnap = await getDoc(doc(db, "internships", appData.internshipId));
    const internshipTitle = intSnap.exists() ? intSnap.data().title : "the internship";

    const coSnap = await getDoc(doc(db, "companies", appData.companyId));
    const companyName = coSnap.exists()
      ? (coSnap.data().companyName || coSnap.data().name || "the company")
      : "the company";

    const reason = String(extraReason || "").trim();
    const rejectMsg = reason
      ? `Your application for ${internshipTitle} at ${companyName} was not selected — "${reason}"`
      : `Your application for ${internshipTitle} at ${companyName} was not selected.`;

    const messages = {
      Approved:    `🎉 Your application for ${internshipTitle} at ${companyName} was approved!`,
      Rejected:    rejectMsg,
      Shortlisted: `⭐ You've been shortlisted for ${internshipTitle} at ${companyName}!`
    };

    await addDoc(collection(db, "notifications"), {
      studentId:       appData.studentId,
      companyId:       appData.companyId,
      internshipId:    appData.internshipId,
      internshipTitle: internshipTitle,
      companyName:     companyName,
      status:          newStatus,
      message:         messages[newStatus],
      kind:            "app-status",
      senderUid:       auth.currentUser?.uid || appData.companyId,
      senderRole:      "company",
      senderName:      companyName,
      isRead:          false,
      createdAt:       serverTimestamp()
    });
  } catch (e) {
    console.error("Failed to send notification:", e);
  }
}

// reject modal
function openRejectModal(app, clearFields) {
  const existing = document.getElementById("rejectModal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "rejectModal";
  modal.className = "sl-modal";
  modal.innerHTML =
    '<div class="sl-modal-card">' +
      '<div class="sl-modal-head">' +
        '<h3>Reject applicant</h3>' +
        '<button class="sl-modal-close" aria-label="Close">✕</button>' +
      '</div>' +
      '<p class="sl-modal-sub">Let <b>' + esc(app.name || "this applicant") + '</b> know why — they\'ll see it in their notification. Optional.</p>' +
      '<label class="sl-label">Reason (optional)</label>' +
      '<textarea id="rejectReason" rows="3" placeholder="e.g. We\'re moving forward with candidates who have more backend experience."></textarea>' +
      '<div class="sl-modal-foot">' +
        '<button class="btn-ghost rj-cancel" type="button">Cancel</button>' +
        '<button class="btn-danger rj-submit" type="button">Reject application</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector(".sl-modal-close").addEventListener("click", close);
  modal.querySelector(".rj-cancel").addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

  modal.querySelector(".rj-submit").addEventListener("click", async () => {
    const reason = document.getElementById("rejectReason").value.trim();
    try {
      await updateDoc(doc(db, "applications", app.id), {
        status: "Rejected",
        rejectionReason: reason,
        ...(clearFields || {}),
      });
      await sendNotification(app.id, "Rejected", reason);
    } catch (e) {
      console.error("Failed to reject:", e);
      alert("Could not save — check console.");
    } finally {
      close();
    }
  });
}

var internshipsCache = [];
var appsCache        = [];
var approvedSubsCache = [];        // taskSubmissions with feedback.status === "approved"
var tasksCacheByInternship = {};   // internshipId -> [tasks]
var editingId        = null;
var currentFilter    = "all";
var searchQuery      = "";
var currentSort      = "newest";
var currentPage      = 1;
var APPS_PER_PAGE    = 9;
var filteredCount    = 0;
var intCurrentPage   = 1;
var INT_PER_PAGE     = 9;

// theme
(function () {
  var KEY = "internsphere_theme";
  function applyTheme(t) {
    var light = t === "light";
    document.body.classList.toggle("light", light);
    var h = document.documentElement;
    h.style.colorScheme = light ? "light" : "dark";
    h.style.backgroundColor = light ? "#f4f6fa" : "#080b10";
    localStorage.setItem(KEY, light ? "light" : "dark");
    var lbl = document.getElementById("themeLabel");
    if (lbl) lbl.textContent = light ? "Light" : "Dark";
  }
  applyTheme(localStorage.getItem(KEY) || "dark");
  document.addEventListener("DOMContentLoaded", function () {
    applyTheme(localStorage.getItem(KEY) || "dark");
    var btn = document.getElementById("themeToggle");
    if (btn) btn.addEventListener("click", function () {
      applyTheme(document.body.classList.contains("light") ? "dark" : "light");
    });
  });
})();

// utilities
function setText(id, v) { var e = document.getElementById(id); if (e) e.textContent = v; }
function wire(id, fn)   { var el = document.getElementById(id); if (el) el.addEventListener("click", fn); }

// student cache
var studentCache  = {};
var studentPending = new Set();

function buildInitials(app, cached) {
  var sourceName = (cached && cached.name) || app.name;
  if (sourceName && String(sourceName).trim()) {
    var parts = String(sourceName).trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  var email = app.email || "";
  if (email.includes("@")) return email.split("@")[0].slice(0, 2).toUpperCase();
  if (email) return email.slice(0, 2).toUpperCase();
  return "S";
}

function applicantAvatarHtml(app, opts) {
  opts = opts || {};
  var size = opts.size || "md";
  var cached = app.studentId ? studentCache[app.studentId] : null;
  var hasPic = cached && cached.profilePic;
  var cls = (opts.className || "") + " ap-avatar ap-avatar--" + size;
  if (hasPic) {
    return '<div class="' + cls.trim() + ' has-pic">' +
             '<img src="' + esc(cached.profilePic) + '" alt="' + esc(cached.name || app.email || "") + '">' +
           '</div>';
  }
  return '<div class="' + cls.trim() + '">' + esc(buildInitials(app, cached)) + '</div>';
}

function primeStudents(apps, onReady) {
  var ids = Array.from(new Set(
    apps.map(function (a) { return a.studentId; }).filter(Boolean)
  ));
  var toFetch = ids.filter(function (id) {
    return !(id in studentCache) && !studentPending.has(id);
  });
  if (!toFetch.length) return;

  toFetch.forEach(function (id) {
    studentPending.add(id);
    getDoc(doc(db, "students", id))
      .then(function (s) {
        studentCache[id] = s.exists()
          ? {
              name: s.data().name || "",
              email: s.data().email || "",
              phone: s.data().phone || "",
              profilePic: s.data().profilePic || "",
            }
          : { name: "", email: "", phone: "", profilePic: "" };
      })
      .catch(function () {
        studentCache[id] = { name: "", email: "", phone: "", profilePic: "" };
      })
      .finally(function () {
        studentPending.delete(id);
        if (!studentPending.size) onReady && onReady();
      });
  });
}

function resetModalFields() {
  document.getElementById("field-title").value    = "";
  document.getElementById("field-dept").value     = "";
  document.getElementById("field-location").value = "";
  document.getElementById("field-type").value     = "";
  document.getElementById("field-duration").value = "";
  document.getElementById("field-stipend").value  = "";
  document.getElementById("field-deadline").value = "";
  document.getElementById("field-openings").value = "1";
  document.getElementById("field-status").value   = "Open";
  document.getElementById("field-skills").value   = "";
  document.getElementById("field-mission").value  = "";
  document.getElementById("field-responsibilities").value = "";
  document.getElementById("field-requirements").value     = "";
  document.getElementById("field-desc").value     = "";
  const heroEl = document.getElementById("field-hero-image");
  if (heroEl) heroEl.value = "";
  const heroHint = document.getElementById("field-hero-hint");
  if (heroHint) heroHint.textContent = "Leave empty to use a random stock photo.";
  editingId = null;
}

function bulletsToText(v) {
  if (Array.isArray(v)) return v.join("\n");
  return String(v || "");
}

// modal helpers
function openIntModal(item) {
  editingId = item ? item.id : null;
  setText("modal-title", item ? "Edit Role" : "Post New Role");
  document.getElementById("field-title").value    = item ? (item.title    || "") : "";
  document.getElementById("field-dept").value     = item ? (item.dept     || "") : "";
  document.getElementById("field-location").value = item ? (item.location || "") : "";
  document.getElementById("field-type").value     = item ? (item.type     || "") : "";
  document.getElementById("field-duration").value = item ? (item.duration || "") : "";
  document.getElementById("field-stipend").value  = item ? (item.stipend  || "") : "";
  document.getElementById("field-deadline").value = item ? (item.deadline || "") : "";
  document.getElementById("field-openings").value = item ? String(item.openings || 1) : "1";
  document.getElementById("field-status").value   = item ? (item.status   || "Open") : "Open";
  document.getElementById("field-skills").value   = item ? (item.skills   || "") : "";
  document.getElementById("field-mission").value  = item ? (item.mission  || "") : "";
  document.getElementById("field-responsibilities").value = item ? bulletsToText(item.responsibilities) : "";
  document.getElementById("field-requirements").value     = item ? bulletsToText(item.requirements)     : "";
  document.getElementById("field-desc").value     = item ? (item.desc     || "") : "";

  const heroEl = document.getElementById("field-hero-image");
  if (heroEl) heroEl.value = "";
  const heroHint = document.getElementById("field-hero-hint");
  if (heroHint) {
    heroHint.textContent = item && item.heroImage
      ? "A custom banner is already uploaded. Pick a new file to replace it, or leave empty to keep the current one."
      : "Leave empty to use a random stock photo.";
  }

  refreshRoleHints();

  document.getElementById("internship-modal").classList.remove("hidden");
}

function closeIntModal() {
  document.getElementById("internship-modal").classList.add("hidden");
  resetModalFields();
}

// dashboard render
function renderDashboard() {
  var apps  = appsCache;
  var ints  = internshipsCache;
  var total = apps.length;
  var pend  = apps.filter(function (a) { return a.status === "Pending";     }).length;
  var shrt  = apps.filter(function (a) { return a.status === "Shortlisted"; }).length;
  var appr  = apps.filter(function (a) { return a.status === "Approved";    }).length;
  var rej   = apps.filter(function (a) { return a.status === "Rejected";    }).length;

  setText("total-apps",       total);
  setText("pending-apps",     pend);
  setText("shortlisted-apps", shrt);
  setText("approved-apps",    appr);
  setText("rejected-apps",    rej);

  function setBar(id, val) {
    var el = document.getElementById(id);
    if (el) el.style.width = (total > 0 ? Math.round((val / total) * 100) : 0) + "%";
  }
  var barTotal = document.getElementById("bar-total");
  if (barTotal) barTotal.style.width = total > 0 ? "100%" : "0%";
  setBar("bar-pending",     pend);
  setBar("bar-shortlisted", shrt);
  setBar("bar-approved",    appr);
  setBar("bar-rejected",    rej);

  var badge = document.getElementById("nav-badge");
  if (badge) {
    badge.textContent = pend;
    badge.classList.toggle("visible", pend > 0);
  }

  setText("last-updated", new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));

  primeStudents(apps, function () { renderDashboard(); renderApps(); });

  // recent apps feed
  var feed = document.getElementById("recent-apps-list");
  if (feed) {
    if (!apps.length) {
      feed.innerHTML = '<p class="empty-hint">No applications yet.</p>';
    } else {
      var recent = apps.slice().sort(function (a, b) {
        var ta = a.appliedAt ? Date.parse(a.appliedAt) : 0;
        var tb = b.appliedAt ? Date.parse(b.appliedAt) : 0;
        return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
      }).slice(0, 6);

      feed.innerHTML = "";
      recent.forEach(function (app) {
        var status = (app.status || "Pending").toLowerCase();
        var cached = app.studentId ? studentCache[app.studentId] : null;
        var resolvedName  = app.name  || (cached && cached.name)  || "";
        var resolvedEmail = app.email || (cached && cached.email) || "";
        var displayName = resolvedName
          || resolvedEmail
          || (app.studentId ? "Applicant " + String(app.studentId).slice(0, 6) : "Applicant");
        var metaLine = app.role || "General Application";
        var row = document.createElement("div");
        row.className = "feed-row";
        row.innerHTML =
          applicantAvatarHtml(app, { size: "sm", className: "feed-avatar" }) +
          '<div class="feed-info">' +
            '<div class="feed-name">'  + esc(displayName)                   + '</div>' +
            '<div class="feed-meta">'  + esc(metaLine) + '</div>' +
          '</div>' +
          '<span class="badge ' + status + '">' + esc(app.status || "Pending") + '</span>';
        feed.appendChild(row);
      });
    }
  }

  // role chart
  var roleMap = {};
  apps.forEach(function (a) { var r = a.role || "General"; roleMap[r] = (roleMap[r] || 0) + 1; });
  var sorted = Object.entries(roleMap).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 5);
  var maxC   = sorted.length ? sorted[0][1] : 1;

  var rolesEl = document.getElementById("top-roles");
  if (rolesEl) {
    if (!sorted.length) {
      rolesEl.innerHTML = '<li class="empty-hint">No data yet.</li>';
    } else {
      rolesEl.innerHTML = sorted.map(function (e) {
        return '<li class="rc-row">' +
          '<span class="rc-name">'  + esc(e[0]) + '</span>' +
          '<div class="rc-track"><div class="rc-fill" style="width:' + Math.round((e[1] / maxC) * 100) + '%"></div></div>' +
          '<span class="rc-count">' + e[1] + '</span>' +
          '</li>';
      }).join("");
    }
  }

  // open internships summary
  var openEl = document.getElementById("active-internships-summary");
  if (openEl) {
    var open = ints.filter(function (i) { return i.status === "Open"; });
    if (!open.length) {
      openEl.innerHTML = '<p class="empty-hint">No open positions.</p>';
    } else {
      openEl.innerHTML = open.map(function (i) {
        return '<div class="open-row">' +
          '<div>' +
            '<div class="open-title">' + esc(i.title) + '</div>' +
            '<div class="open-sub">'   + esc(i.dept) + ' · ' + esc(i.location) + '</div>' +
          '</div>' +
          '<span class="badge open">Open</span>' +
          '</div>';
      }).join("");
    }
  }

  renderDonut(appr, shrt, pend, rej, total);
  renderUpcomingInterviews();
}

// upcoming interviews
function renderUpcomingInterviews() {
  var host   = document.getElementById("upcoming-interviews-panel");
  var listEl = document.getElementById("upcoming-interviews-list");
  if (!host || !listEl) return;

  var now = Date.now();
  var upcoming = (appsCache || []).filter(function (a) {
    if (a.status !== "Shortlisted") return false;
    if (!a.interviewAt) return false;
    var t = Date.parse(a.interviewAt);
    return !isNaN(t) && t >= now - 60 * 60 * 1000;
  });

  if (!upcoming.length) {
    host.style.display = "none";
    listEl.innerHTML = "";
    return;
  }

  upcoming.sort(function (a, b) { return Date.parse(a.interviewAt) - Date.parse(b.interviewAt); });

  function tzAbbrOf(tz) {
    if (!tz) return "";
    try {
      var parts = Intl.DateTimeFormat("en", { timeZone: tz, timeZoneName: "short" }).formatToParts(new Date());
      var z = parts.find(function (p) { return p.type === "timeZoneName"; });
      return z ? z.value : tz;
    } catch { return tz; }
  }
  function fmtWhen(iso, tz) {
    var split = String(iso).split("T");
    if (split.length < 2) return iso;
    var d = new Date(split[0] + "T12:00:00Z");
    var day = isNaN(d.getTime())
      ? split[0]
      : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    var time = split[1].slice(0, 5);
    var abbr = tzAbbrOf(tz);
    return day + " · " + time + (abbr ? " " + abbr : "");
  }

  var internshipById = {};
  (internshipsCache || []).forEach(function (i) { internshipById[i.id] = i; });

  listEl.innerHTML = upcoming.map(function (app) {
    var intern = internshipById[app.internshipId] || {};
    var role = intern.title || "Internship";
    var cached = app.studentId ? studentCache[app.studentId] : null;
    var studentName = (cached && cached.name) || app.name || app.email || "Applicant";
    var when = fmtWhen(app.interviewAt, app.interviewTimezone);
    var details = app.interviewDetails || "";
    var isHttp = /^https?:\/\//i.test(details);
    var detailsBlock = details
      ? (isHttp
          ? '<a class="ui-link" href="' + esc(details) + '" target="_blank" rel="noopener">Join meeting ↗</a>'
          : '<span class="ui-muted">' + esc(details) + '</span>')
      : '<span class="ui-muted">Details to be shared</span>';

    return (
      '<article class="ui-card" data-app-id="' + esc(app.id) + '">' +
        '<header class="ui-head">' +
          '<span class="ui-chip">⭐ Shortlisted</span>' +
          '<h3>' + esc(studentName) + '</h3>' +
          '<p class="ui-sub">' + esc(role) + '</p>' +
        '</header>' +
        '<div class="ui-body">' +
          '<div class="ui-row">' +
            '<span class="ui-label">When</span>' +
            '<span class="ui-val">' + esc(when) + '</span>' +
          '</div>' +
          '<div class="ui-row">' +
            '<span class="ui-label">Meeting</span>' +
            '<span class="ui-val">' + detailsBlock + '</span>' +
          '</div>' +
          '<div class="ui-row" style="justify-content:flex-end">' +
            '<button class="btn-shortlist ui-reschedule" type="button">📅 Reschedule</button>' +
          '</div>' +
        '</div>' +
      '</article>'
    );
  }).join("");

  listEl.querySelectorAll(".ui-reschedule").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      var card = e.currentTarget.closest("[data-app-id]");
      var appId = card && card.getAttribute("data-app-id");
      var app = (appsCache || []).find(function (a) { return a.id === appId; });
      if (app) openShortlistModal(app);
    });
  });

  host.style.display = "";
}

function renderDonut(appr, shrt, pend, rej, total) {
  var C   = 2 * Math.PI * 30;
  var gap = 2;
  var segments = [
    { id: "seg-approved",    count: appr },
    { id: "seg-shortlisted", count: shrt },
    { id: "seg-pending",     count: pend },
    { id: "seg-rejected",    count: rej  },
  ];
  var gapCount = segments.length;
  function seg(count) {
    return total > 0 ? (count / total) * (C - gap * gapCount) : 0;
  }

  var running = 0;
  segments.forEach(function (s, i) {
    var el = document.getElementById(s.id);
    if (!el) return;
    var len = seg(s.count);
    var offset = i === 0 ? 0 : -(running + gap * i);
    el.style.strokeDasharray  = len + " " + (C - len);
    el.style.strokeDashoffset = offset;
    running += len;
  });

  var legend = document.getElementById("donut-legend");
  if (!legend) return;
  if (total === 0) { legend.innerHTML = '<p class="empty-hint" style="padding:0">No data</p>'; return; }
  legend.innerHTML = [
    { label: "Approved",    val: appr, col: "var(--emerald)" },
    { label: "Shortlisted", val: shrt, col: "#7dd3fc"        },
    { label: "Pending",     val: pend, col: "var(--amber)"   },
    { label: "Rejected",    val: rej,  col: "var(--rose)"    }
  ].map(function (r) {
    return '<div class="legend-row">' +
      '<span class="legend-dot" style="background:' + r.col + '"></span>' +
      '<span>' + r.label + '</span>' +
      '<span class="legend-val">' + r.val + '</span>' +
      '</div>';
  }).join("");
}

// applications render
function renderApps() {
  var grid  = document.getElementById("apps");
  var empty = document.getElementById("empty-state");
  if (!grid) return;

  var statusCounts = {
    all: appsCache.length,
    Pending:     appsCache.filter(function (a) { return a.status === "Pending";     }).length,
    Shortlisted: appsCache.filter(function (a) { return a.status === "Shortlisted"; }).length,
    Approved:    appsCache.filter(function (a) { return a.status === "Approved";    }).length,
    Rejected:    appsCache.filter(function (a) { return a.status === "Rejected";    }).length,
  };

  var pend  = statusCounts.Pending;
  var badge = document.getElementById("nav-badge");
  if (badge) { badge.textContent = pend; badge.classList.toggle("visible", pend > 0); }

  document.querySelectorAll(".ftab[data-filter]").forEach(function (btn) {
    var key = btn.getAttribute("data-filter");
    var base = btn.getAttribute("data-label");
    if (!base) {
      base = btn.textContent.replace(/\s*\(\d+\)\s*$/, "").trim();
      btn.setAttribute("data-label", base);
    }
    var n = statusCounts[key];
    btn.textContent = n != null ? base + " (" + n + ")" : base;
  });

  var filtered = appsCache.slice();
  if (currentFilter !== "all") filtered = filtered.filter(function (a) { return a.status === currentFilter; });
  if (searchQuery) {
    var q = searchQuery.toLowerCase();
    filtered = filtered.filter(function (a) {
      return (a.email || "").toLowerCase().includes(q) || (a.role || "").toLowerCase().includes(q);
    });
  }

  // Returns a numeric timestamp in ms for sort comparisons.
  // 1. Prefer the explicit numeric appliedAtMs we set on new submissions.
  // 2. Otherwise try Date.parse on appliedAt (works for ISO strings and
  //    most en-US locale strings).
  // 3. For older locale-formatted strings that Date.parse can't handle
  //    (e.g. "DD/MM/YYYY, HH:MM:SS"), try a tolerant regex that swaps
  //    day/month. This keeps legacy rows from all falling to "0" and
  //    shuffling randomly under a newest/oldest sort.
  // 4. Last resort: 0 (will tie-break by doc id, which at least keeps a
  //    stable order instead of Firestore's random default).
  function tsOf(a) {
    if (typeof a.appliedAtMs === "number" && !isNaN(a.appliedAtMs)) {
      return a.appliedAtMs;
    }
    if (a.appliedAt) {
      var t = Date.parse(a.appliedAt);
      if (!isNaN(t)) return t;
      // Loose parse for "D/M/YYYY, H:MM:SS [AM/PM]" or similar
      var m = String(a.appliedAt).match(
        /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?/
      );
      if (m) {
        var n1  = parseInt(m[1], 10);
        var n2  = parseInt(m[2], 10);
        var yr  = parseInt(m[3], 10);
        var hr  = parseInt(m[4], 10);
        var min = parseInt(m[5], 10);
        var sec = parseInt(m[6] || "0", 10);
        var ampm = (m[7] || "").toLowerCase();
        if (ampm === "pm" && hr < 12) hr += 12;
        if (ampm === "am" && hr === 12) hr = 0;
        if (yr < 100) yr += 2000;
        // Pick month/day: if first number > 12 it must be the day
        var mo, day;
        if (n1 > 12)       { day = n1; mo = n2; }
        else if (n2 > 12)  { mo  = n1; day = n2; }
        else               { mo  = n1; day = n2; } // ambiguous, assume M/D
        var parsed = Date.UTC(yr, mo - 1, day, hr, min, sec);
        if (!isNaN(parsed)) return parsed;
      }
    }
    return 0;
  }
  // Stable tiebreaker — when two rows have equal tsOf(), fall back to the
  // Firestore doc id so newest-first stays deterministic instead of random.
  function tie(a, b) {
    return (b.id || "").localeCompare(a.id || "");
  }
  if (currentSort === "newest") {
    filtered.sort(function (a, b) {
      var d = tsOf(b) - tsOf(a);
      return d !== 0 ? d : tie(a, b);
    });
  } else if (currentSort === "oldest") {
    filtered.sort(function (a, b) {
      var d = tsOf(a) - tsOf(b);
      return d !== 0 ? d : -tie(a, b);
    });
  } else if (currentSort === "unreviewed") {
    filtered.sort(function (a, b) {
      var aP = (a.status || "Pending") === "Pending" ? 0 : 1;
      var bP = (b.status || "Pending") === "Pending" ? 0 : 1;
      if (aP !== bP) return aP - bP;
      return tsOf(b) - tsOf(a);
    });
  }

  grid.innerHTML = "";

  var pager     = document.getElementById("apps-pager");
  var pagerInfo = document.getElementById("pager-info");
  var pagerPrev = document.getElementById("pager-prev");
  var pagerNext = document.getElementById("pager-next");

  filteredCount = filtered.length;

  if (!filtered.length) {
    if (empty) empty.style.display = "block";
    if (pager) pager.style.display = "none";
    return;
  }
  if (empty) empty.style.display = "none";

  var totalPages = Math.max(1, Math.ceil(filtered.length / APPS_PER_PAGE));
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  var startIdx = (currentPage - 1) * APPS_PER_PAGE;
  var pageSlice = filtered.slice(startIdx, startIdx + APPS_PER_PAGE);

  if (pager) {
    pager.style.display = totalPages > 1 ? "flex" : "none";
    if (pagerInfo) pagerInfo.textContent = "Page " + currentPage + " of " + totalPages;
    if (pagerPrev) pagerPrev.disabled = currentPage <= 1;
    if (pagerNext) pagerNext.disabled = currentPage >= totalPages;
  }

  pageSlice.forEach(function (app) {
    var status = app.status || "Pending";
    var cached = app.studentId ? studentCache[app.studentId] : null;
    var resolvedName  = app.name  || (cached && cached.name)  || "";
    var resolvedEmail = app.email || (cached && cached.email) || "";
    var resolvedPhone = app.phone || (cached && cached.phone) || "";
    var displayName = resolvedName
      || resolvedEmail
      || (app.studentId ? "Applicant " + String(app.studentId).slice(0, 6) : "Applicant");
    var subLine = (resolvedName && resolvedEmail) ? resolvedEmail : (app.role || "General Application");

    var card = document.createElement("div");
    card.className = "app-card";
    card.innerHTML =
      '<div class="ac-top">' +
        '<div class="ac-left">' +
          applicantAvatarHtml(app, { size: "md", className: "ac-avatar" }) +
          '<div>' +
            '<div class="ac-name">' + esc(displayName) + '</div>' +
            '<div class="ac-role">' + esc(subLine) + '</div>' +
          '</div>' +
        '</div>' +
        '<span class="badge ' + status.toLowerCase() + '">' + esc(status) + '</span>' +
      '</div>' +
      '<div class="ac-meta">' +
        (resolvedEmail
          ? '<div class="ac-meta-row">' +
              '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2 4l6 5 6-5"/><rect x="2" y="4" width="12" height="9" rx="1.5"/></svg>' +
              '<a class="ac-email" href="mailto:' + esc(resolvedEmail) + '">' + esc(resolvedEmail) + '</a>' +
            '</div>'
          : '') +
        '<div class="ac-meta-row">' +
          '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2 3a1 1 0 011-1h2l1 3-1.5 1.5A11 11 0 009.5 11.5L11 10l3 1v2a1 1 0 01-1 1A13 13 0 012 3z"/></svg>' +
          esc(resolvedPhone || "—") +
        '</div>' +
        '<div class="ac-meta-row">' +
          '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2 4l6 5 6-5"/><rect x="2" y="4" width="12" height="9" rx="1.5"/></svg>' +
          (() => {
            var cvHref = app.cvUrl || app.cvData;
            if (!cvHref) return '<span style="opacity:0.55">No CV attached</span>';
            var sizeKb = app.cvSize ? ((app.cvSize / 1024).toFixed(0) + ' KB') : '';
            if (app.cvSize && app.cvSize > 1024 * 1024) {
              sizeKb = (app.cvSize / 1024 / 1024).toFixed(1) + ' MB';
            }
            return '<a class="cv-link" href="' + esc(cvHref) + '" target="_blank" rel="noopener" download="' + esc(app.cvName || "cv.pdf") + '" title="Download applicant CV (PDF)">📄 ' + esc(app.cvName || "cv.pdf") + (sizeKb ? '<span class="cv-size"> · ' + sizeKb + '</span>' : '') + '</a>';
          })() +
        '</div>' +
        '<div class="ac-meta-row">' +
          '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2" y="3" width="12" height="11" rx="1.5"/><path d="M5 1v3M11 1v3M2 7h12"/></svg>' +
          esc(app.appliedAt || "—") +
        '</div>' +
      '</div>' +
      (app.applicantNote
        ? '<div class="ac-note">' +
            '<div class="ac-note-label">Message from applicant</div>' +
            '<blockquote class="ac-note-text">' + esc(app.applicantNote) + '</blockquote>' +
          '</div>'
        : '') +
      '<div class="ac-actions">' +
        '<button class="btn-approve"' + (status === "Approved" ? " disabled" : "") + '>✓ Approve</button>' +
        '<button class="btn-shortlist">' + (status === "Shortlisted" ? "📅 Reschedule" : "⭐ Shortlist") + '</button>' +
        '<button class="btn-reject"'  + (status === "Rejected" ? " disabled" : "") + '>✕ Reject</button>' +
      '</div>';

    const clearInterviewFields = {
      interviewAt: "",
      interviewDetails: "",
      interviewTimezone: "",
    };

    card.querySelector(".btn-approve").addEventListener("click", async function () {
      try {
        await updateDoc(doc(db, "applications", app.id), {
          status: "Approved",
          ...clearInterviewFields,
        });
        await sendNotification(app.id, "Approved");
      } catch (e) { console.error("Failed to approve:", e); }
    });

    card.querySelector(".btn-reject").addEventListener("click", function () {
      openRejectModal(app, clearInterviewFields);
    });

    card.querySelector(".btn-shortlist").addEventListener("click", function () {
      openShortlistModal(app);
    });

    grid.appendChild(card);
  });
}

// internships
async function loadInternships() {
  const user = auth.currentUser;
  if (!user) return;
  const q    = query(collection(db, "internships"), where("companyId", "==", user.uid));
  const snap = await getDocs(q);
  const list = [];
  snap.forEach(d => list.push({ id: d.id, ...d.data() }));
  internshipsCache = list;
  renderInternships(list);
  renderDashboard();
}

// ─── Certificates panel ───
// Lists every Approved application for this company, with two controls:
//   1. Generate / revoke offer letter (toggles offerLetterIssued)
//   2. Approve / revoke completion certificate (toggles certificateIssued)
// "Approve completion" is only enabled once the student has submitted the
// internship's final task AND that submission has been approved by the company.
function renderCertificatesPanel() {
  const list  = document.getElementById("certs-list");
  const empty = document.getElementById("certs-empty");
  if (!list) return;

  const approved = (appsCache || []).filter((a) => a.status === "Approved");
  if (!approved.length) {
    list.innerHTML = "";
    if (empty) empty.style.display = "block";
    return;
  }
  if (empty) empty.style.display = "none";

  // Prime student profiles (profilePic) then re-render once loaded
  const unprimedIds = approved
    .map((a) => a.studentId)
    .filter((id) => id && !(id in studentCache) && !studentPending.has(id));
  if (unprimedIds.length) {
    primeStudents(approved, function () { renderCertificatesPanel(); });
    // Fall through to render with whatever is cached so far (initials)
  }

  list.innerHTML = approved.map((app) => {
    const intTasks = tasksCacheByInternship[app.internshipId] || [];
    const finalTask = intTasks.find((t) => t.isFinal);
    const finalApproved = !!finalTask && approvedSubsCache.some((s) =>
      s.studentId === app.studentId &&
      s.taskId === finalTask.id
    );

    const offerIssued = app.offerLetterIssued === true;
    const certIssued  = app.certificateIssued === true;

    const initials = (() => {
      const n = (app.name || app.email || "").trim();
      if (!n) return "?";
      const parts = n.split(/[\s@]+/).filter(Boolean);
      return parts.length >= 2
        ? (parts[0][0] + parts[1][0]).toUpperCase()
        : parts[0].slice(0, 2).toUpperCase();
    })();

    const displayName = app.name || app.email || ("Applicant " + (app.studentId || "").slice(0, 6));
    const role = app.role || "Intern";

    // completion approval copy
    let completionHint = "";
    let completionDisabled = !finalApproved && !certIssued;
    if (!finalTask) {
      completionHint = "No final task marked on this internship yet.";
      completionDisabled = true;
    } else if (!finalApproved && !certIssued) {
      completionHint = "Student hasn't finished the final task yet.";
    } else if (finalApproved && !certIssued) {
      completionHint = "Final task approved — ready to issue.";
    } else if (certIssued) {
      completionHint = "Completion certificate issued.";
    }

    // Use cached profile pic if available
    const cachedStudent = app.studentId ? studentCache[app.studentId] : null;
    const hasPic = cachedStudent && cachedStudent.profilePic;
    const avatarHtml = hasPic
      ? '<div class="cert-row__avatar cert-row__avatar--img"><img src="' + esc(cachedStudent.profilePic) + '" alt="' + esc(displayName) + '"></div>'
      : '<div class="cert-row__avatar">' + esc(initials) + '</div>';

    return (
      '<div class="cert-row" data-app-id="' + esc(app.id) + '">' +
        '<div class="cert-row__identity">' +
          avatarHtml +
          '<div>' +
            '<div class="cert-row__name">' + esc(displayName) + '</div>' +
            '<div class="cert-row__role">' + esc(role) + '</div>' +
          '</div>' +
        '</div>' +

        '<div class="cert-row__actions">' +
          '<div class="cert-row__action' + (offerIssued ? ' cert-row__action--issued' : '') + '">' +
            '<span class="cert-row__action-label">Offer Letter</span>' +
            (offerIssued
              ? '<div style="display:flex;gap:8px;align-items:center">' +
                  '<span class="cert-row__issued-tag">✓ Issued</span>' +
                  '<button class="cert-row__action-btn cert-row__action-btn--revoke" data-act="revoke-offer">Revoke</button>' +
                '</div>'
              : '<button class="cert-row__action-btn cert-row__action-btn--issue" data-act="issue-offer">Generate offer letter</button>'
            ) +
          '</div>' +

          '<div class="cert-row__action' + (certIssued ? ' cert-row__action--issued' : '') + '">' +
            '<span class="cert-row__action-label">Completion Certificate</span>' +
            (certIssued
              ? '<div style="display:flex;gap:8px;align-items:center">' +
                  '<span class="cert-row__issued-tag">✓ Approved</span>' +
                  '<button class="cert-row__action-btn cert-row__action-btn--revoke" data-act="revoke-completion">Revoke</button>' +
                '</div>'
              : '<div style="display:flex;flex-direction:column;gap:4px">' +
                  '<button class="cert-row__action-btn cert-row__action-btn--issue" data-act="issue-completion"' +
                    (completionDisabled ? ' disabled' : '') + '>Approve completion</button>' +
                  '<span class="cert-row__hint">' + esc(completionHint) + '</span>' +
                '</div>'
            ) +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }).join("");

  list.querySelectorAll(".cert-row").forEach((row) => {
    const appId = row.getAttribute("data-app-id");
    row.querySelectorAll("[data-act]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const act = btn.getAttribute("data-act");
        try {
          if (act === "issue-offer") {
            await updateDoc(doc(db, "applications", appId), {
              offerLetterIssued: true,
              offerLetterIssuedAt: serverTimestamp(),
            });
          } else if (act === "revoke-offer") {
            await updateDoc(doc(db, "applications", appId), {
              offerLetterIssued: false,
            });
          } else if (act === "issue-completion") {
            await updateDoc(doc(db, "applications", appId), {
              certificateIssued: true,
              certificateIssuedAt: serverTimestamp(),
            });
          } else if (act === "revoke-completion") {
            await updateDoc(doc(db, "applications", appId), {
              certificateIssued: false,
            });
          }
        } catch (e) {
          console.error("certificate action failed:", e);
          alert("Could not save — please try again.");
        }
      });
    });
  });
}

function renderInternships(list) {
  var grid  = document.getElementById("internships-grid");
  var empty = document.getElementById("internships-empty");
  var pager = document.getElementById("internships-pager");
  var pagerInfo = document.getElementById("int-pager-info");
  var pagerPrev = document.getElementById("int-pager-prev");
  var pagerNext = document.getElementById("int-pager-next");
  if (!grid) return;
  grid.innerHTML = "";
  if (!list.length) {
    if (empty) empty.style.display = "block";
    if (pager) pager.style.display = "none";
    return;
  }
  if (empty) empty.style.display = "none";

  var totalPages = Math.max(1, Math.ceil(list.length / INT_PER_PAGE));
  if (intCurrentPage > totalPages) intCurrentPage = totalPages;
  if (intCurrentPage < 1) intCurrentPage = 1;
  var startIdx = (intCurrentPage - 1) * INT_PER_PAGE;
  var pageSlice = list.slice(startIdx, startIdx + INT_PER_PAGE);

  if (pager) {
    pager.style.display = totalPages > 1 ? "flex" : "none";
    if (pagerInfo) pagerInfo.textContent = "Page " + intCurrentPage + " of " + totalPages;
    if (pagerPrev) pagerPrev.disabled = intCurrentPage <= 1;
    if (pagerNext) pagerNext.disabled = intCurrentPage >= totalPages;
  }

  pageSlice.forEach(function (item) {
    var cnt = appsCache.filter(function (a) {
      return (a.internshipId === item.id) ||
             (a.role || "").toLowerCase() === (item.title || "").toLowerCase();
    }).length;

    var skillsHtml = "";
    if (item.skills) {
      skillsHtml = item.skills.split(",").map(function (s) {
        return '<span class="skill-tag">' + esc(s.trim()) + '</span>';
      }).join("");
    }

    var card = document.createElement("div");
    card.className = "int-card";
    card.innerHTML =
      '<div class="ic-hd">' +
        '<div>' +
          '<div class="ic-title">' + esc(item.title) + '</div>' +
          '<div class="ic-dept">'  + esc(item.dept)  + '</div>' +
        '</div>' +
        '<span class="badge ' + (item.status || "open").toLowerCase() + '">' + esc(item.status) + '</span>' +
      '</div>' +
      (item.desc     ? '<p class="ic-desc">'    + esc(item.desc)  + '</p>'  : '') +
      (skillsHtml    ? '<div class="ic-skills">' + skillsHtml      + '</div>' : '') +
      '<div class="ic-details">' +
        '<div class="ic-det"><div class="ic-det-label">Location</div><div class="ic-det-val">'  + esc(item.location) + '</div></div>' +
        '<div class="ic-det"><div class="ic-det-label">Duration</div><div class="ic-det-val">'  + esc(item.duration) + '</div></div>' +
        '<div class="ic-det"><div class="ic-det-label">Stipend</div><div class="ic-det-val">'   + esc(item.stipend)  + '</div></div>' +
        '<div class="ic-det"><div class="ic-det-label">Applicants</div><div class="ic-det-val" style="font-family:var(--mono)">' + cnt + '</div></div>' +
      '</div>' +
      '<div class="ic-ft">' +
        '<span class="ic-count">' + cnt + ' applicant' + (cnt !== 1 ? 's' : '') + '</span>' +
        '<div class="ic-actions">' +
          '<button class="btn-edit">Edit</button>' +
          '<button class="btn-dup" title="Duplicate this posting">Duplicate</button>' +
          '<button class="btn-del">Delete</button>' +
        '</div>' +
      '</div>';

    card.querySelector(".btn-edit").addEventListener("click", function () { openIntModal(item); });
    card.querySelector(".btn-dup").addEventListener("click", function () {
      var clone = Object.assign({}, item);
      delete clone.id;
      delete clone.createdAt;
      delete clone.heroImage;
      clone.title = (item.title || "Untitled") + " (copy)";
      openIntModal(clone);
      editingId = null;
    });
    card.querySelector(".btn-del").addEventListener("click", async function () {
      if (!confirm('Delete "' + item.title + '"?')) return;
      try { await deleteDoc(doc(db, "internships", item.id)); loadInternships(); }
      catch (e) { alert("Delete failed. Please try again."); console.error(e); }
    });

    grid.appendChild(card);
  });
}

// DOMContentLoaded
document.addEventListener("DOMContentLoaded", function () {

  // section switching
  function activate(name) {
    document.querySelectorAll(".nav-item[data-section]").forEach(function (l) { l.classList.remove("active"); });
    var lnk = document.querySelector('.nav-item[data-section="' + name + '"]');
    if (lnk) lnk.classList.add("active");
    document.querySelectorAll(".page").forEach(function (s) { s.classList.remove("active"); });
    var sec = document.getElementById("section-" + name);
    if (sec) sec.classList.add("active");
    if (name === "dashboard")    renderDashboard();
    if (name === "applications") renderApps();
    if (name === "internships")  loadInternships();
    if (name === "certificates") renderCertificatesPanel();
  }

  document.querySelectorAll(".nav-item[data-section]").forEach(function (l) {
    l.addEventListener("click", function (e) { e.preventDefault(); activate(l.getAttribute("data-section")); });
  });
  document.querySelectorAll(".ghost-link[data-goto]").forEach(function (b) {
    b.addEventListener("click", function () { activate(b.getAttribute("data-goto")); });
  });

  // auth guard
  onAuthStateChanged(auth, async function (user) {
    if (sessionStorage.getItem("guestRole")) return;
    if (!user) { window.location.href = "login.html"; return; }

    loadInternships();

    const appsQuery = query(
      collection(db, "applications"),
      where("companyId", "==", user.uid)
    );

    onSnapshot(appsQuery, function (snap) {
      appsCache = snap.docs.map(function (d) { return { id: d.id, ...d.data() }; });
      renderApps();
      renderDashboard();
      renderInternships(internshipsCache);
      renderCertificatesPanel();
    }, function (err) {
      console.error("Applications listener error:", err);
    });

    // Live-watch approved submissions for final tasks — used by the
    // certificates panel to know when "Approve completion" becomes enabled.
    const subsQ = query(
      collection(db, "taskSubmissions"),
      where("companyId", "==", user.uid)
    );
    onSnapshot(subsQ, function (snap) {
      approvedSubsCache = snap.docs
        .map(function (d) { return { id: d.id, ...d.data() }; })
        .filter(function (s) {
          return s.feedback && s.feedback.status === "approved";
        });
      renderCertificatesPanel();
    }, function (err) {
      console.warn("Submissions listener error:", err);
    });

    // Live-watch all this company's internship tasks so we can check which
    // of them is the `isFinal` task per internship.
    const tasksQ = query(
      collection(db, "tasks"),
      where("companyId", "==", user.uid)
    );
    onSnapshot(tasksQ, function (snap) {
      tasksCacheByInternship = {};
      snap.forEach(function (d) {
        const t = { id: d.id, ...d.data() };
        if (!t.internshipId) return;
        (tasksCacheByInternship[t.internshipId] = tasksCacheByInternship[t.internshipId] || []).push(t);
      });
      renderCertificatesPanel();
    }, function (err) {
      console.warn("Tasks listener error:", err);
    });

    // verification gate: live-watch the company doc
    onSnapshot(doc(db, "companies", user.uid), function (snap) {
      applyVerificationGate(snap.exists() ? snap.data() : {});
    }, function (err) {
      console.error("Company doc listener error:", err);
    });
  });

  function applyVerificationGate(company) {
    var banner   = document.getElementById("verify-banner");
    var titleEl  = document.getElementById("verify-banner-title");
    var msgEl    = document.getElementById("verify-banner-msg");
    var actionEl = document.getElementById("verify-banner-action");
    var addBtn   = document.getElementById("add-internship-btn");

    var verified = company.verified === true;
    var rejected = company.rejected === true;

    if (addBtn) {
      addBtn.classList.toggle("is-locked", !verified);
      addBtn.setAttribute("aria-disabled", verified ? "false" : "true");
      addBtn.title = verified ? "" : "Awaiting admin verification";
    }

    if (!banner) return;
    if (verified) {
      banner.style.display = "none";
      banner.classList.remove("verify-banner--rejected", "verify-banner--pending");
      return;
    }

    banner.style.display = "flex";
    if (rejected) {
      banner.classList.add("verify-banner--rejected");
      banner.classList.remove("verify-banner--pending");
      if (titleEl) titleEl.textContent = "Verification rejected";
      if (msgEl) {
        var reason = String(company.rejectReason || "").trim();
        msgEl.textContent = reason
          ? "Admin rejected your verification — reason: " + reason + ". Update your profile and request again."
          : "Admin rejected your verification. Update your profile and request again.";
      }
      if (actionEl) { actionEl.textContent = "Request again"; actionEl.disabled = false; }
    } else {
      banner.classList.add("verify-banner--pending");
      banner.classList.remove("verify-banner--rejected");
      if (titleEl) titleEl.textContent = "Verification required";
      if (msgEl)   msgEl.textContent   = "Your company account is awaiting admin approval. You can post internships once verified. An admin will review shortly.";
      if (actionEl) {
        actionEl.textContent = company.verifyRequestedAt ? "Verification requested ✓" : "Request verification";
        actionEl.disabled = !!company.verifyRequestedAt;
      }
    }

    if (actionEl && !actionEl.dataset.wired) {
      actionEl.dataset.wired = "1";
      actionEl.addEventListener("click", async function () {
        var u = auth.currentUser;
        if (!u) return;
        actionEl.disabled = true;
        actionEl.textContent = "Sending…";
        try {
          await updateDoc(doc(db, "companies", u.uid), {
            rejected: false,
            rejectReason: "",
            verifyRequestedAt: serverTimestamp(),
          });
        } catch (err) {
          console.error("Failed to request verification:", err);
          actionEl.disabled = false;
          actionEl.textContent = "Request verification";
        }
      });
    }
  }

  // settings modal
  var setModal = document.getElementById("companySettingsModal");
  var openBtn  = document.getElementById("openCompanySettings");
  var closeBtn = document.getElementById("closeCompanySettingsModal");

  if (openBtn) openBtn.addEventListener("click", function (e) {
    e.preventDefault();
    document.querySelectorAll(".nav-item").forEach(function (l) { l.classList.remove("active"); });
    openBtn.classList.add("active");
    var cached    = localStorage.getItem("companyName");
    var nameInput = document.getElementById("companyNameInput");
    if (nameInput && cached) nameInput.value = cached;
    setModal.classList.remove("hidden");
  });

  function closeSettings() { setModal.classList.add("hidden"); activate("dashboard"); }
  if (closeBtn) closeBtn.addEventListener("click", closeSettings);
  if (setModal) setModal.addEventListener("click", function (e) { if (e.target === setModal) closeSettings(); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && setModal && !setModal.classList.contains("hidden")) closeSettings();
  });

  function showStatus(id, msg, type) {
    var el = document.getElementById(id); if (!el) return;
    el.textContent = msg;
    el.className = "settings-status " + (type === "ok" ? "ok" : "err");
    setTimeout(function () { el.textContent = ""; el.className = "settings-status"; }, 3000);
  }

  wire("updateCompanyNameBtn", async function () {
    const user = auth.currentUser;
    if (!user) return showStatus("companyNameStatus", "Not logged in.", "err");
    var v = document.getElementById("companyNameInput").value.trim();
    if (!v) return showStatus("companyNameStatus", "Name is required.", "err");
    try {
      await updateDoc(doc(db, "companies", user.uid), { companyName: v });
      localStorage.setItem("companyName", v);
      var sn = document.getElementById("sidebar-company-name"); if (sn) sn.textContent = v;
      var av = document.getElementById("sidebar-avatar");       if (av) av.textContent = v.slice(0, 2).toUpperCase();
      showStatus("companyNameStatus", "Updated.", "ok");
    } catch (e) { console.error(e); showStatus("companyNameStatus", "Failed to save.", "err"); }
  });

  wire("updateCompanyLocationBtn", function () {
    var v = document.getElementById("companyLocationInput").value.trim();
    if (!v) return showStatus("companyLocationStatus", "Location required.", "err");
    localStorage.setItem("companyLocation", v);
    showStatus("companyLocationStatus", "Location saved.", "ok");
  });

  wire("companyEmailBtn", function () {
    var v = document.getElementById("companyEmailInput").value.trim();
    if (!v) return showStatus("companyEmailStatus", "Email required.", "err");
    showStatus("companyEmailStatus", "Email update requested.", "ok");
  });

  wire("companyPasswordBtn", function () {
    var v = document.getElementById("companyPasswordInput").value;
    if (v.length < 6) return showStatus("companyPasswordStatus", "Min. 6 characters.", "err");
    showStatus("companyPasswordStatus", "Password updated.", "ok");
  });

  wire("companySupportBtn", async function () {
    var v = document.getElementById("companySupportMessage").value.trim();
    if (!v) return showStatus("companySupportStatus", "Message is empty.", "err");
    var user = auth.currentUser;
    if (!user) return showStatus("companySupportStatus", "You must be signed in.", "err");

    try {
      await addDoc(collection(db, "supportMessages"), {
        uid: user.uid,
        email: user.email,
        message: v,
        role: "company",
        createdAt: serverTimestamp(),
      });
      document.getElementById("companySupportMessage").value = "";
      showStatus("companySupportStatus", "Sent to support.", "ok");
    } catch (e) {
      console.error("[company-support] send failed:", e);
      showStatus("companySupportStatus", "Could not send — " + (e?.code || e?.message || "error"), "err");
    }
  });

  (function () {
    var modal   = document.getElementById("companyLogoutModal");
    var openBtn = document.getElementById("companyLogoutBtn");
    var cancel  = document.getElementById("companyLogoutCancel");
    var closeX  = document.getElementById("companyLogoutClose");
    var confirmBtn = document.getElementById("companyLogoutConfirm");
    if (!modal || !openBtn || !confirmBtn) return;

    function open()  { modal.classList.remove("hidden"); document.body.classList.add("modal-open"); }
    function close() { modal.classList.add("hidden");    document.body.classList.remove("modal-open"); }

    openBtn.addEventListener("click", open);
    cancel  && cancel.addEventListener("click", close);
    closeX  && closeX.addEventListener("click", close);
    modal.addEventListener("click", function (e) { if (e.target === modal) close(); });
    document.addEventListener("keydown", function (e) {
      if (!modal.classList.contains("hidden") && e.key === "Escape") close();
    });

    confirmBtn.addEventListener("click", async function () {
      confirmBtn.disabled = true;
      confirmBtn.textContent = "Signing out…";
      try { sessionStorage.removeItem("guestRole"); } catch (e) {}
      try { sessionStorage.removeItem("guestGreetingShown"); } catch (e) {}
      try {
        const { signOut } = await import("https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js");
        await signOut(auth);
      } catch (e) { console.error(e); }
      var theme = localStorage.getItem("theme");
      var legacyTheme = localStorage.getItem("internsphere_theme");
      localStorage.clear();
      if (theme)       localStorage.setItem("theme", theme);
      if (legacyTheme) localStorage.setItem("internsphere_theme", legacyTheme);
      window.location.href = "Index.html";
    });
  })();

  // filter tabs
  document.querySelectorAll(".ftab").forEach(function (b) {
    b.addEventListener("click", function () {
      document.querySelectorAll(".ftab").forEach(function (x) { x.classList.remove("active"); });
      b.classList.add("active");
      currentFilter = b.getAttribute("data-filter");
      currentPage = 1;
      renderApps();
    });
  });

  var srch = document.getElementById("app-search");
  if (srch) srch.addEventListener("input", function () {
    searchQuery = srch.value.trim();
    currentPage = 1;
    renderApps();
  });

  var sortEl = document.getElementById("app-sort");
  if (sortEl) sortEl.addEventListener("change", function () {
    currentSort = sortEl.value || "newest";
    currentPage = 1;
    renderApps();
  });

  // pagination controls
  var pagerPrev = document.getElementById("pager-prev");
  var pagerNext = document.getElementById("pager-next");
  if (pagerPrev) pagerPrev.addEventListener("click", function () {
    if (currentPage > 1) {
      currentPage -= 1;
      renderApps();
      var grid = document.getElementById("apps");
      if (grid) grid.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
  if (pagerNext) pagerNext.addEventListener("click", function () {
    var total = Math.max(1, Math.ceil(filteredCount / APPS_PER_PAGE));
    if (currentPage < total) {
      currentPage += 1;
      renderApps();
      var grid = document.getElementById("apps");
      if (grid) grid.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  // internships pagination controls
  var intPagerPrev = document.getElementById("int-pager-prev");
  var intPagerNext = document.getElementById("int-pager-next");
  if (intPagerPrev) intPagerPrev.addEventListener("click", function () {
    if (intCurrentPage > 1) {
      intCurrentPage -= 1;
      renderInternships(internshipsCache);
      var grid = document.getElementById("internships-grid");
      if (grid) grid.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
  if (intPagerNext) intPagerNext.addEventListener("click", function () {
    var total = Math.max(1, Math.ceil(internshipsCache.length / INT_PER_PAGE));
    if (intCurrentPage < total) {
      intCurrentPage += 1;
      renderInternships(internshipsCache);
      var grid = document.getElementById("internships-grid");
      if (grid) grid.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  // internship modal
  var addBtn = document.getElementById("add-internship-btn");
  if (addBtn) addBtn.addEventListener("click", async function () {
    if (addBtn.classList.contains("is-locked")) {
      var banner = document.getElementById("verify-banner");
      if (banner) banner.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    openIntModal(null);
  });

  var cancelBtn  = document.getElementById("modal-cancel");
  if (cancelBtn)  cancelBtn.addEventListener("click", closeIntModal);
  var cancelBtn2 = document.getElementById("modal-cancel-2");
  if (cancelBtn2) cancelBtn2.addEventListener("click", closeIntModal);

  var intModal = document.getElementById("internship-modal");
  if (intModal) intModal.addEventListener("click", function (e) { if (e.target === intModal) closeIntModal(); });

  var titleEl = document.getElementById("field-title");
  if (titleEl) {
    var hintTimer = null;
    titleEl.addEventListener("input", function () {
      clearTimeout(hintTimer);
      hintTimer = setTimeout(refreshRoleHints, 200);
    });
  }

  // save internship
  document.getElementById("modal-save").addEventListener("click", async function () {
    const user = auth.currentUser;
    if (!user) return alert("Not logged in");

    const saveBtn = document.getElementById("modal-save");
    const originalLbl = saveBtn.textContent;

    const title    = document.getElementById("field-title").value.trim();
    const dept     = document.getElementById("field-dept").value.trim();
    const location = document.getElementById("field-location").value.trim();
    const type     = document.getElementById("field-type").value;
    const duration = document.getElementById("field-duration").value.trim();
    const stipend  = document.getElementById("field-stipend").value.trim();
    const deadline = document.getElementById("field-deadline").value;
    const openings = Number(document.getElementById("field-openings").value) || 1;
    const status   = document.getElementById("field-status").value;
    const skills   = document.getElementById("field-skills").value.trim();
    const mission          = document.getElementById("field-mission").value.trim();
    const responsibilities = parseBullets(document.getElementById("field-responsibilities").value);
    const requirements     = parseBullets(document.getElementById("field-requirements").value);
    const desc             = document.getElementById("field-desc").value.trim();

    const heroFile = document.getElementById("field-hero-image")?.files?.[0] || null;

    if (!title) return alert("Role title is required.");

    try {
      const snap = await getDoc(doc(db, "companies", user.uid));
      if (snap.exists() && snap.data().verified !== true) {
        alert("Your company account is still awaiting verification. An admin must approve your account before you can post internships. You'll receive a notification when approved.");
        return;
      }
    } catch (_) { }

    const companyName = localStorage.getItem("companyName") || "";

    async function uploadHeroIfAny(internshipId) {
      if (!heroFile) return undefined;
      const ext = (heroFile.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `companies/${user.uid}/internships/${internshipId}/hero-${Date.now()}.${ext}`;
      const r = storageRef(storage, path);
      await uploadBytes(r, heroFile);
      return await getDownloadURL(r);
    }

    saveBtn.disabled = true;
    saveBtn.textContent = heroFile ? "Uploading…" : "Saving…";
    try {
      const basePayload = {
        title, dept, location, type, duration, stipend,
        deadline, openings, status, skills, desc,
        mission, responsibilities, requirements,
        companyName,
      };

      let internshipId = editingId;
      if (editingId) {
        const heroUrl = await uploadHeroIfAny(editingId);
        const patch = { ...basePayload };
        if (heroUrl !== undefined) patch.heroImage = heroUrl;
        await updateDoc(doc(db, "internships", editingId), patch);
      } else {
        const created = await addDoc(collection(db, "internships"), {
          ...basePayload,
          companyId:   user.uid,
          createdAt:   serverTimestamp(),
        });
        internshipId = created.id;
        const heroUrl = await uploadHeroIfAny(internshipId);
        if (heroUrl !== undefined) {
          await updateDoc(doc(db, "internships", internshipId), { heroImage: heroUrl });
        }
      }
      closeIntModal();
      resetModalFields();
      loadInternships();
    } catch (e) {
      alert("Failed to save role. Please try again.");
      console.error(e);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = originalLbl;
    }
  });

  renderDashboard();
});

// notifications bell
(function initCompanyNotifications() {
  const btn       = document.getElementById("coNotifBtn");
  const dropdown  = document.getElementById("coNotifDropdown");
  const list      = document.getElementById("coNotifList");
  const badge     = document.getElementById("coNotifBadge");
  const markAll   = document.getElementById("coMarkAllRead");
  if (!btn || !dropdown || !list) return;

  function toggleDropdown(force) {
    const willOpen = force === true || (force !== false && dropdown.classList.contains("hidden"));
    dropdown.classList.toggle("hidden", !willOpen);
    btn.setAttribute("aria-expanded", willOpen ? "true" : "false");
  }
  btn.addEventListener("click", (e) => { e.stopPropagation(); toggleDropdown(); });
  document.addEventListener("click", (e) => {
    if (!dropdown.classList.contains("hidden")
        && !dropdown.contains(e.target)
        && !btn.contains(e.target)) {
      toggleDropdown(false);
    }
  });

  onAuthStateChanged(auth, (user) => {
    if (!user) return;

    const q = query(
      collection(db, "notifications"),
      where("studentId", "==", user.uid),
      orderBy("createdAt", "desc"),
    );

    const _seenCompanyNotifIds = new Set();
    let _seenCoInit = false;

    onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const unread = items.filter((n) => !n.isRead).length;

      const currentIds = items.map((n) => n.id);
      if (_seenCoInit) {
        const fresh = currentIds.filter((id) => !_seenCompanyNotifIds.has(id));
        if (fresh.length && typeof window.playNotifPing === "function") {
          window.playNotifPing();
        }
      }
      _seenCompanyNotifIds.clear();
      currentIds.forEach((id) => _seenCompanyNotifIds.add(id));
      _seenCoInit = true;

      if (unread > 0) {
        badge.hidden = false;
        badge.textContent = unread > 99 ? "99+" : String(unread);
      } else {
        badge.hidden = true;
      }

      if (!items.length) {
        list.innerHTML = `<p class="notif-empty">No notifications yet.</p>`;
        return;
      }

      const senderChip = (n) => {
        const role = n.senderRole || "";
        const name = n.senderName || "InternSphere";
        const roleLabel = role === "admin"   ? "Admin"
                        : role === "company" ? "Company"
                        : role === "system"  ? "System"
                        : "InternSphere";
        const roleClass = ["admin","company","system"].includes(role) ? role : "system";
        return `<span class="notif-sender notif-sender--${roleClass}">
                  <b>${esc(name)}</b>
                  <span class="notif-sender-role">${esc(roleLabel)}</span>
                </span>`;
      };

      list.innerHTML = items.map((n) => {
        const time = n.createdAt?.toDate
          ? n.createdAt.toDate().toLocaleString()
          : "Just now";
        return `
          <div class="notif-item ${n.isRead ? "read" : "unread"}" data-id="${esc(n.id)}">
            <span class="notif-dot"></span>
            <div>
              ${senderChip(n)}
              <div class="notif-msg">${esc(n.message || "")}</div>
              <div class="notif-time">${esc(time)}</div>
            </div>
          </div>`;
      }).join("");

      list.querySelectorAll(".notif-item").forEach((row) => {
        row.addEventListener("click", async () => {
          const id = row.getAttribute("data-id");
          if (!id) return;
          try {
            await updateDoc(doc(db, "notifications", id), { isRead: true });
          } catch (err) {
            console.warn("[company-notif] mark read failed:", err);
          }
        });
      });
    }, (err) => {
      console.error("[company-notif] subscription failed:", err);
      list.innerHTML = `<p class="notif-empty" style="color:#ef4444">Could not load notifications.</p>`;
    });

    markAll?.addEventListener("click", async () => {
      try {
        const snap2 = await getDocs(query(
          collection(db, "notifications"),
          where("studentId", "==", user.uid),
          where("isRead", "==", false),
        ));
        if (snap2.empty) return;
        const batch = writeBatch(db);
        snap2.forEach((d) => batch.update(d.ref, { isRead: true }));
        await batch.commit();
      } catch (err) {
        console.warn("[company-notif] mark-all failed:", err);
      }
    });
  });
})();
