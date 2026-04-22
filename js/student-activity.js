// student-activity.js — Student dashboard: assigned tasks, company

import { auth, db } from "../firebase/firebase.js";
import {
  collection,
  query,
  where,
  getDoc,
  getDocs,
  onSnapshot,
  doc,
  updateDoc,
  setDoc,
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { esc } from "./lib/escape.js";

// Helpers
function $(id) { return document.getElementById(id); }

let state = {
  uid: null,
  approvedApp: null, // application doc
  internship: null,  // internship doc
  tasks: [],
  submissions: {},
  applications: [], // all apps by this student
  studentDoc: null,  // cached students/{uid} data for completeness calc
};

function greetingForTime() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function renderWelcomeBanner() {
  const kicker = $("dashGreetingKicker");
  const to = $("dashGreetingTo");
  const nameEl = $("dashGreetingName");
  const sub = $("dashGreetingSub");
  if (!nameEl) return;

  const firstName =
    (state.studentDoc?.name || "").trim().split(/\s+/)[0] ||
    (auth.currentUser?.displayName || "").split(/\s+/)[0] ||
    "";

  if (kicker) kicker.textContent = greetingForTime();
  if (to) to.textContent = "Welcome back,";
  nameEl.textContent = firstName || "there";

  // Contextual subtitle
  let subLine = "Here's your snapshot for today.";
  const pending = state.applications.filter((a) => (a.status || "Pending") === "Pending").length;
  const totalTasks = state.tasks.length;
  const doneTasks = state.tasks.filter((t) => {
    const s = state.submissions[t.id];
    return s && s.feedback?.status !== "rejected";
  }).length;

  if (!state.applications.length) {
    subLine = "No applications yet — browse internships to get started.";
  } else if (state.approvedApp && totalTasks > 0 && doneTasks < totalTasks) {
    subLine = `You have ${totalTasks - doneTasks} task${totalTasks - doneTasks === 1 ? "" : "s"} to work on in the Workroom.`;
  } else if (state.approvedApp && totalTasks > 0 && doneTasks === totalTasks) {
    subLine = "All tasks submitted — awaiting review.";
  } else if (state.approvedApp) {
    subLine = "Welcome to your internship. Your tasks will appear soon.";
  } else if (pending > 0) {
    subLine = `${pending} application${pending === 1 ? "" : "s"} under review. Hang tight.`;
  }
  if (sub) sub.textContent = subLine;

  const openTaskCount = state.tasks.filter((t) => {
    const s = state.submissions[t.id];
    return !s || s.feedback?.status === "rejected";
  }).length;
  const tarsTasksEl = document.getElementById("tarsTasksPending");
  if (tarsTasksEl) {
    tarsTasksEl.textContent = openTaskCount === 0
      ? "No task pending"
      : `Tasks Pending: ${openTaskCount}`;
  }

  const focus = document.getElementById("dashFocus");
  const focusText = document.getElementById("dashFocusText");
  if (focus && focusText) {
    const openTasks = state.tasks.filter((t) => {
      const s = state.submissions[t.id];
      return !s || s.feedback?.status === "rejected";
    });

    let focusLine = "";
    if (openTasks.length > 0) {
      focusLine = `Next up: ${openTasks[0].title}`;
    } else if (state.approvedApp && totalTasks > 0 && doneTasks === totalTasks) {
      focusLine = "All caught up — waiting on feedback.";
    } else if (pending > 0) {
      focusLine = `${pending} application${pending === 1 ? "" : "s"} awaiting review`;
    } else if (!state.applications.length) {
      focusLine = "Browse open internships to get started";
    }

    if (focusLine) {
      focusText.textContent = focusLine;
      focus.style.display = "";
    } else {
      focus.style.display = "none";
    }
  }
}

// Profile
// In-memory copy of current skills array
let profileSkills = [];

async function loadProfile(user) {
  const email = user.email || "";
  $("profileEmail").value = email;
  $("profileUid").textContent = user.uid;

  const createdAt = user.metadata?.creationTime;
  if (createdAt) {
    try {
      $("profileMemberSince").textContent = new Date(createdAt).toLocaleDateString(undefined, {
        month: "short", year: "numeric",
      });
    } catch { $("profileMemberSince").textContent = "—"; }
  }

  try {
    const sSnap = await getDoc(doc(db, "students", user.uid));
    const d = sSnap.exists() ? sSnap.data() : {};
    state.studentDoc = d;

    $("profileName").value = d.name || user.displayName || "";
    $("profilePhone").value = d.phone || "";
    $("profileLocation").value = d.location || "";
    $("profileBio").value = d.bio || "";
    $("profileCollege").value = d.college || "";
    $("profileGradYear").value = d.graduationYear || "";
    $("profileMajor").value = d.major || "";
    $("profileLinkedIn").value = d.linkedin || "";
    $("profileGitHub").value = d.github || "";
    $("profilePortfolio").value = d.portfolio || "";
    profileSkills = Array.isArray(d.skills) ? d.skills.slice() : [];
    renderSkillChips();
    applyAvailability(d.available !== false); // default true
    updateBioCount();

    applyProfilePic(d.profilePic, d.name || email);
    updateTopbarIdentity(d.name || email, d.profilePic);

    renderCompleteness();
    renderWelcomeBanner();
    renderActivityFeed();
  } catch (e) {
    console.error("loadProfile:", e);
  }
}

function applyAvailability(on) {
  const chk = $("profileAvailability");
  const lbl = $("profileAvailabilityLabel");
  if (chk) chk.checked = !!on;
  if (lbl) {
    lbl.textContent = on ? "Available" : "Not available";
    lbl.style.color = on ? "#22c55e" : "#f59e0b";
  }
}

function updateBioCount() {
  const el = $("profileBio");
  const counter = $("profileBioCount");
  if (!el || !counter) return;
  counter.textContent = `${el.value.length} / 180`;
}

function renderSkillChips() {
  const wrap = $("profileSkillsChips");
  if (!wrap) return;
  if (!profileSkills.length) {
    wrap.innerHTML = '<span style="font-size:0.8rem;opacity:0.5">No skills yet</span>';
    return;
  }
  wrap.innerHTML = profileSkills
    .map((s, i) => `<span class="skill-chip">${escHtml(s)}<button type="button" data-rm="${i}" aria-label="Remove">×</button></span>`)
    .join("");
  wrap.querySelectorAll("[data-rm]").forEach((b) => {
    b.addEventListener("click", () => {
      const i = parseInt(b.getAttribute("data-rm"), 10);
      profileSkills.splice(i, 1);
      renderSkillChips();
    });
  });
}

function escHtml(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function addSkillFromInput() {
  const inp = $("profileSkillInput");
  if (!inp) return;
  const parts = inp.value.split(",").map((x) => x.trim()).filter(Boolean);
  parts.forEach((s) => {
    if (s.length > 30) return;
    const norm = s.toLowerCase();
    if (!profileSkills.some((x) => x.toLowerCase() === norm)) {
      profileSkills.push(s);
    }
  });
  inp.value = "";
  renderSkillChips();
}

function applyProfilePic(dataUrl, nameOrEmail) {
  const img = $("profilePicImg");
  const initials = $("profilePicInitials");
  const remove = $("removeProfilePic");
  const wrap = $("profilePicWrap");
  if (!img || !initials) return;
  if (dataUrl) {
    img.src = dataUrl;
    img.style.display = "";
    initials.style.display = "none";
    if (remove) remove.style.display = "";
    if (wrap) wrap.setAttribute("data-zoomable", "1");
  } else {
    img.removeAttribute("src");
    img.style.display = "none";
    initials.style.display = "";
    initials.textContent = (nameOrEmail || "U").slice(0, 2).toUpperCase();
    if (remove) remove.style.display = "none";
    if (wrap) wrap.removeAttribute("data-zoomable");
  }
}

(function wireProfilePicZoom() {
  const wrap = $("profilePicWrap");
  if (!wrap || wrap.__zoomWired) return;
  wrap.__zoomWired = true;
  wrap.addEventListener("click", (e) => {
    if (e.target.tagName === "LABEL" || e.target.tagName === "INPUT") return;
    if (wrap.getAttribute("data-zoomable") !== "1") return;
    const src = $("profilePicImg")?.src;
    if (src) window.InternSphereLightbox?.open(src, "Your profile picture");
  });
})();

function updateTopbarIdentity(name, profilePic) {
  const userName = $("userName");
  const avatar = document.querySelector(".avatar");
  if (userName) userName.textContent = (name || "User").split(" ")[0];
  if (avatar) {
    if (profilePic) {
      avatar.style.backgroundImage = `url(${profilePic})`;
      avatar.style.backgroundSize = "cover";
      avatar.style.backgroundPosition = "center";
      avatar.textContent = "";
    } else {
      avatar.style.backgroundImage = "";
      avatar.textContent = (name || "U").slice(0, 1).toUpperCase();
    }
  }
}

async function saveProfile() {
  if (!state.uid) return;

  const pending = $("profileSkillInput")?.value.trim();
  if (pending) addSkillFromInput();

  const btn = $("saveProfileBtn");
  const status = $("profileStatusMsg");
  if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
  if (status) { status.textContent = ""; status.style.color = ""; }

  const img = $("profilePicImg");
  const profilePic = img?.style.display !== "none" && img?.src ? img.src : "";

  const name = $("profileName").value.trim();
  const payload = {
    name,
    phone: $("profilePhone").value.trim(),
    location: $("profileLocation").value.trim(),
    bio: $("profileBio").value.trim().slice(0, 180),
    college: $("profileCollege").value.trim(),
    graduationYear: parseInt($("profileGradYear").value, 10) || null,
    major: $("profileMajor").value.trim(),
    linkedin: $("profileLinkedIn").value.trim(),
    github: $("profileGitHub").value.trim(),
    portfolio: $("profilePortfolio").value.trim(),
    skills: profileSkills,
    available: !!$("profileAvailability")?.checked,
    profilePic,
    updatedAt: new Date().toISOString(),
  };

  try {
    await setDoc(doc(db, "students", state.uid), payload, { merge: true });
    // Mirror minimal fields to users collection
    await setDoc(doc(db, "users", state.uid), { name }, { merge: true });
    updateTopbarIdentity(name, profilePic);
    if (status) { status.textContent = "Saved ✓"; status.style.color = "#22c55e"; }
    setTimeout(closeProfileModal, 700);
  } catch (e) {
    console.error("saveProfile:", e);
    if (status) {
      status.textContent = "Failed: " + (e?.message || "unknown");
      status.style.color = "#ef4444";
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Save Profile"; }
  }
}

function openProfileModal() {
  $("profileModal")?.classList.add("is-open");
}
function closeProfileModal() {
  $("profileModal")?.classList.remove("is-open");
}

function wireProfilePicPicker() {
  const input = $("profilePicInput");
  const PROFILE_PIC_MAX = 5 * 1024 * 1024; // 5 MB
  input?.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > PROFILE_PIC_MAX) {
      alert(`Image too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Please pick one under 5 MB.`);
      input.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      applyProfilePic(dataUrl, $("profileName").value || "U");
    };
    reader.readAsDataURL(file);
    input.value = "";
  });

  $("removeProfilePic")?.addEventListener("click", () => {
    applyProfilePic(null, $("profileName").value || "U");
  });
}

// Approved internship + tasks + feedback
// Uses onSnapshot so downstream UI (certificates section) stays live when
// the company flips offerLetterIssued / certificateIssued.
let _approvedAppSubbed = false;
function loadApprovedInternship(uid) {
  const q = query(
    collection(db, "applications"),
    where("studentId", "==", uid),
    where("status", "==", "Approved"),
  );
  return new Promise((resolve) => {
    onSnapshot(q, async (snap) => {
      if (snap.empty) {
        state.approvedApp = null;
        state.internship = null;
        showLockedState();
        renderTasks([]);
        renderCertificates();
        resolve();
        return;
      }

      const app = { id: snap.docs[0].id, ...snap.docs[0].data() };
      state.approvedApp = app;

      if (!_approvedAppSubbed) {
        _approvedAppSubbed = true;
        state.internship = { id: app.internshipId };
        subscribeToTasks();
        subscribeToMySubmissions();

        try {
          const intSnap = await getDoc(doc(db, "internships", app.internshipId));
          if (intSnap.exists()) {
            state.internship = { id: intSnap.id, ...intSnap.data() };
          }
        } catch (e) {
          console.error("load internship:", e);
        }
      }

      showUnlockedState();
      renderCertificates();
      resolve();
    }, (err) => {
      console.error("approved app subscription:", err);
      resolve();
    });
  });
}

function renderCertificates() {
  const section = document.getElementById("certificatesSection");
  if (!section) return;
  const app = state.approvedApp;
  if (!app) { section.style.display = "none"; return; }
  section.style.display = "";

  const internship = state.internship || {};
  const studentName = (state.studentDoc?.name || "").trim() ||
    (auth.currentUser?.displayName || "").split(/\s+/)[0] || "Intern";
  const companyName = internship.companyName || "";
  const internshipTitle = internship.title || app.role || "Virtual Internship";

  // ── Offer letter tile ──
  const offerTile   = document.getElementById("certOfferTile");
  const offerStatus = document.getElementById("certOfferStatus");
  const offerBtn    = document.getElementById("certOfferBtn");
  const offerIssued = app.offerLetterIssued === true;

  if (offerIssued) {
    offerTile.dataset.state = "ready";
    if (offerStatus) offerStatus.textContent = "Signed and ready to download.";
    if (offerBtn) {
      offerBtn.disabled = false;
      offerBtn.innerHTML = "<span>⬇</span><span>Download</span>";
      offerBtn.onclick = () => {
        const extras = {
          duration: internship.duration || internship.durationKey || "",
          location: internship.location || "",
          stipend:  internship.stipend  || "",
        };
        window.downloadOfferLetter?.({
          studentName,
          company: companyName,
          role: internshipTitle,
          startDate: app.appliedAt || "",
          ...extras,
        });
      };
    }
  } else {
    offerTile.dataset.state = "locked";
    if (offerStatus) offerStatus.textContent = "Locked — your company will issue this soon.";
    if (offerBtn) {
      offerBtn.disabled = true;
      offerBtn.innerHTML = '<span class="cert-tile__lock">🔒</span><span>Locked</span>';
      offerBtn.onclick = null;
    }
  }

  // ── Completion certificate tile ──
  const compTile   = document.getElementById("certCompletionTile");
  const compStatus = document.getElementById("certCompletionStatus");
  const compBtn    = document.getElementById("certCompletionBtn");
  const certIssued = app.certificateIssued === true;

  if (certIssued) {
    compTile.dataset.state = "ready";
    if (compStatus) compStatus.textContent = "Certificate approved and ready to download.";
    if (compBtn) {
      compBtn.disabled = false;
      compBtn.innerHTML = "<span>⬇</span><span>Download</span>";
      compBtn.onclick = () => {
        window.downloadCompletionCertificate?.({
          studentName,
          internshipTitle,
          internshipCompany: companyName,
          buttonEl: compBtn,
        });
      };
    }
  } else {
    compTile.dataset.state = "locked";
    if (compStatus) compStatus.textContent = "Finish your tasks — your company will approve this.";
    if (compBtn) {
      compBtn.disabled = true;
      compBtn.innerHTML = '<span class="cert-tile__lock">🔒</span><span>Locked</span>';
      compBtn.onclick = null;
    }
  }
}

function showLockedState() {
  $("feedbackLocked").style.display = "";
  $("feedbackUnlocked").style.display = "none";
  const chip = $("feedbackStatusChip");
  if (chip) chip.style.display = "none";
}

function showUnlockedState() {
  $("feedbackLocked").style.display = "none";
  $("feedbackUnlocked").style.display = "";

  const chip = $("feedbackStatusChip");
  if (chip) { chip.style.display = ""; chip.textContent = "Active"; }

  const i = state.internship || {};
  const name = i.companyName || "Your Company";
  const title = i.title || "Role";

  $("companyNameLbl").textContent = name;

  const subParts = [title];
  if (i.duration) subParts.push(i.duration);
  if (i.location) subParts.push(i.location);
  $("internshipTitleLbl").textContent = subParts.filter(Boolean).join(" · ");

  paintCompanyAvatar(name, i.companyId || state.approvedApp?.companyId);
}

async function paintCompanyAvatar(name, companyId) {
  const el = $("companyAvatar");
  if (!el) return;

  const initials = (name || "?").slice(0, 2).toUpperCase();
  el.textContent = initials;
  el.style.backgroundImage = "";

  if (!companyId) return;
  try {
    const snap = await getDoc(doc(db, "companies", companyId));
    if (!snap.exists()) return;
    const logo = (snap.data().logo || "").trim();
    if (!logo) return;

    const img = new Image();
    img.onload = () => {
      el.textContent = "";
      el.style.backgroundImage = `url("${logo.replace(/"/g, '\\"')}")`;
      el.style.backgroundSize = "cover";
      el.style.backgroundPosition = "center";
      el.style.backgroundRepeat = "no-repeat";
    };
    img.onerror = () => { /* keep initials on failure */ };
    img.src = logo;
  } catch (e) {
    console.warn("[feedback] company logo fetch failed:", e);
  }
}

function subscribeToTasks() {
  if (!state.internship) return;
  const q = query(collection(db, "tasks"), where("internshipId", "==", state.internship.id));
  onSnapshot(q, (snap) => {
    state.tasks = [];
    snap.forEach((d) => state.tasks.push({ id: d.id, ...d.data() }));
    state.tasks.sort((a, b) => (a.order || 0) - (b.order || 0));
    renderTasks(state.tasks);
    renderFeedback();
  });
}

function subscribeToMySubmissions() {
  if (!state.uid || !state.internship) return;
  const q = query(
    collection(db, "taskSubmissions"),
    where("studentId", "==", state.uid),
    where("internshipId", "==", state.internship.id),
  );
  onSnapshot(q, (snap) => {
    state.submissions = {};
    snap.forEach((d) => {
      const data = d.data();
      state.submissions[data.taskId] = { id: d.id, ...data };
    });
    renderTasks(state.tasks);
    renderFeedback();
  });
}

// Tasks widget on the dashboard
function renderTasks(tasks) {
  const list = $("taskList");
  if (!list) return;

  const foot = document.getElementById("tasksFoot");
  const toggle = document.getElementById("tasksToggle");
  const section = document.getElementById("tasksSection");

  const hideFoot = () => { if (foot) foot.style.display = "none"; };
  const setHasTasks = (has) => {
    section?.classList.toggle("has-tasks", !!has);
  };

  if (!state.approvedApp) {
    list.innerHTML = `
      <div style="padding:14px 16px;border-radius:12px;background:rgba(124,107,255,0.06);border:1px dashed rgba(124,107,255,0.22);color:var(--muted);font-size:0.88rem">
        <strong style="color:var(--text)">No active internship yet.</strong>
        Apply and get approved — tasks assigned by your company will appear here.
      </div>`;
    hideFoot();
    setHasTasks(false);
    return;
  }

  if (!tasks.length) {
    list.innerHTML = `
      <div style="padding:14px 16px;border-radius:12px;background:rgba(124,107,255,0.06);border:1px dashed rgba(124,107,255,0.22);color:var(--muted);font-size:0.88rem">
        No tasks assigned yet. Your company will add tasks soon.
      </div>`;
    hideFoot();
    setHasTasks(false);
    return;
  }

  setHasTasks(true);
  const VISIBLE = 5;

  list.innerHTML = tasks
    .map((t, i) => {
      const overflow = i >= VISIBLE ? " task-item--overflow" : "";
      const sub = state.submissions[t.id];
      const fb = sub?.feedback;
      const rejected = fb?.status === "rejected";
      const approved = fb?.status === "approved" && typeof fb.score === "number";

      let status, statusBg, statusColor, iconBg, icon;
      if (rejected) {
        status = `Rejected · redo`;
        statusBg = "rgba(239,68,68,0.18)";
        statusColor = "#ef4444";
        iconBg = "linear-gradient(135deg,#ef4444,#b91c1c)";
        icon = "↻";
      } else if (approved) {
        status = `Approved · ${fb.score}/100`;
        statusBg = "rgba(34,197,94,0.18)";
        statusColor = "#22c55e";
        iconBg = "linear-gradient(135deg,#22c55e,#16a34a)";
        icon = "✓";
      } else if (sub) {
        status = "Awaiting review";
        statusBg = "rgba(124,107,255,0.18)";
        statusColor = "#a855f7";
        iconBg = "linear-gradient(135deg,#7c6bff,#a855f7)";
        icon = "⋯";
      } else {
        status = "Pending";
        statusBg = "rgba(245,158,11,0.18)";
        statusColor = "#f59e0b";
        iconBg = "linear-gradient(135deg,#7c6bff,#a855f7)";
        icon = t.order || "•";
      }

      const pdfBadge = t.requirePdf
        ? '<span style="font-size:11px;font-weight:700;padding:3px 8px;border-radius:999px;background:rgba(236,72,153,0.15);color:#ec4899;margin-left:6px">📎 PDF</span>'
        : "";
      const finalBadge = t.isFinal
        ? '<span style="font-size:11px;font-weight:800;padding:3px 8px;border-radius:999px;background:linear-gradient(135deg,rgba(236,72,153,0.2),rgba(245,158,11,0.16));color:#ec4899;border:1px solid rgba(236,72,153,0.35);margin-left:6px;letter-spacing:0.04em">🏁 FINAL</span>'
        : "";

      const finalIconBg = t.isFinal ? "linear-gradient(135deg,#ec4899,#f59e0b)" : iconBg;
      const finalIcon = t.isFinal && !sub ? "🏁" : icon;
      const borderStyle = t.isFinal
        ? "border:1px solid rgba(236,72,153,0.3);box-shadow:0 0 0 1px rgba(236,72,153,0.1)"
        : "border:1px solid rgba(255,255,255,0.06)";

      return `
        <div class="task-item${overflow}" style="display:flex;align-items:center;gap:14px;padding:14px;border-radius:12px;background:rgba(255,255,255,0.03);${borderStyle};transition:all 200ms">
          <div style="width:32px;height:32px;border-radius:10px;display:grid;place-items:center;font-weight:900;background:${finalIconBg};color:#fff;font-size:13px">${finalIcon}</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:0.95rem">${esc(t.title)}${finalBadge}${pdfBadge}</div>
            <div class="muted" style="font-size:0.82rem;margin-top:2px">${esc(t.description || "").slice(0, 100)}${(t.description || "").length > 100 ? "…" : ""}</div>
          </div>
          <span style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:999px;background:${statusBg};color:${statusColor};white-space:nowrap">${status}</span>
        </div>`;
    })
    .join("");

  if (foot && toggle) {
    if (tasks.length > VISIBLE) {
      foot.style.display = "";
      const expanded = list.classList.contains("is-expanded");
      toggle.textContent = expanded
        ? "Show less"
        : `View all tasks (${tasks.length})`;
    } else {
      foot.style.display = "none";
      list.classList.remove("is-expanded");
    }
  }

  // Tasks / Progress / Active Role KPIs are owned by dashboard.js::loadKPIs()
  // which handles multi-internship. Writing them here would overwrite those
  // values every time a task/submission updates.

  renderWelcomeBanner();
  renderActivityFeed();
}

function renderFeedback() {
  const list = $("feedbackList");
  const empty = $("feedbackEmpty");
  if (!list) return;

  const reviewed = Object.values(state.submissions).filter(
    (s) => s.feedback && typeof s.feedback.score === "number",
  );

  if (!reviewed.length) {
    list.innerHTML = "";
    if (empty) empty.style.display = "";
    return;
  }
  if (empty) empty.style.display = "none";

  list.innerHTML = reviewed
    .map((s) => {
      const task = state.tasks.find((t) => t.id === s.taskId);
      const taskTitle = task?.title || "Task";
      const fb = s.feedback;
      const ok = fb.status !== "rejected";
      const color = ok ? "#22c55e" : "#ef4444";
      const bg = ok ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)";

      const reviewerLine =
        fb.reviewerName || fb.reviewerPosition
          ? `<div style="display:flex;align-items:center;gap:8px;margin-top:10px;padding-top:10px;border-top:1px dashed ${color}33">
              <div style="width:28px;height:28px;border-radius:999px;background:${color}22;color:${color};display:grid;place-items:center;font-weight:900;font-size:11px">${esc((fb.reviewerName || "?").slice(0, 2).toUpperCase())}</div>
              <div style="line-height:1.3">
                <div style="font-weight:700;font-size:0.82rem">${esc(fb.reviewerName || "Reviewer")}</div>
                <div class="muted" style="font-size:0.72rem">${esc(fb.reviewerPosition || "—")}${fb.reviewedAt ? " · " + new Date(fb.reviewedAt).toLocaleDateString() : ""}</div>
              </div>
            </div>`
          : "";

      return `
        <div style="padding:14px;border-radius:12px;background:${bg};border:1px solid ${color}33">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:10px;flex-wrap:wrap">
            <strong style="font-size:0.95rem">${esc(taskTitle)}</strong>
            <span style="font-size:11px;font-weight:800;padding:3px 10px;border-radius:999px;background:${color}22;color:${color}">${ok ? "Approved" : "Rejected"} · ${fb.score}/100</span>
          </div>
          <p class="muted" style="font-size:0.88rem;margin:0;line-height:1.55">${esc(fb.note || "No note provided.")}</p>
          ${reviewerLine}
        </div>`;
    })
    .join("");
}

// Boot
function wireProfileModal() {
  $("closeProfileModal")?.addEventListener("click", closeProfileModal);

  // Bio character counter
  $("profileBio")?.addEventListener("input", updateBioCount);

  // Availability toggle label
  $("profileAvailability")?.addEventListener("change", (e) => {
    applyAvailability(e.target.checked);
  });

  const skillInput = $("profileSkillInput");
  skillInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addSkillFromInput();
    } else if (e.key === "Backspace" && !skillInput.value && profileSkills.length) {
      profileSkills.pop();
      renderSkillChips();
    }
  });
  skillInput?.addEventListener("blur", addSkillFromInput);
  $("cancelProfileBtn")?.addEventListener("click", closeProfileModal);
  $("saveProfileBtn")?.addEventListener("click", saveProfile);
  $("profileModal")?.addEventListener("click", (e) => {
    if (e.target === $("profileModal")) closeProfileModal();
  });
  wireProfilePicPicker();

  $("tarsQuickBtn")?.addEventListener("click", () => {
    document.getElementById("tarsOrb")?.click();
  });
  $("qaOpenTars")?.addEventListener("click", () => {
    document.getElementById("tarsOrb")?.click();
  });
  $("completenessEditBtn")?.addEventListener("click", openProfileModal);
}

function renderCompleteness() {
  const d = state.studentDoc || {};
  const fields = [
    { key: "name",        label: "Full name",         val: d.name },
    { key: "profilePic",  label: "Profile photo",     val: d.profilePic },
    { key: "phone",       label: "Phone number",      val: d.phone },
    { key: "location",    label: "Location",          val: d.location },
    { key: "bio",         label: "Short bio",         val: d.bio },
    { key: "college",     label: "College / education", val: d.college },
    { key: "skills",      label: "Skills",            val: Array.isArray(d.skills) && d.skills.length ? "ok" : "" },
    { key: "linkedin",    label: "LinkedIn",          val: d.linkedin },
  ];
  const filled = fields.filter((f) => !!(f.val && String(f.val).trim())).length;
  const total = fields.length;
  const pct = Math.round((filled / total) * 100);
  const missing = fields.filter((f) => !(f.val && String(f.val).trim()));

  const chip = $("completenessChip");
  const fill = $("completenessFill");
  const list = $("completenessList");
  if (!chip || !fill || !list) return;

  chip.textContent = pct + "%";
  chip.className = "chip";
  if (pct === 100) chip.classList.add("complete-full");
  else if (pct >= 70) chip.classList.add("complete-ok");
  else chip.classList.add("complete-low");

  requestAnimationFrame(() => { fill.style.width = pct + "%"; });

  if (!missing.length) {
    list.innerHTML = `<li class="complete-done">✓ All set — your profile is complete.</li>`;
    $("completenessEditBtn").textContent = "Edit profile";
  } else {
    list.innerHTML = missing
      .slice(0, 4)
      .map((f) => `<li><span class="complete-dot"></span>${escHtml(f.label)}</li>`)
      .join("");
    $("completenessEditBtn").textContent = "Complete profile";
  }
}

function renderActivityFeed() {
  const list = $("activityList");
  if (!list) return;

  const events = [];

  for (const app of state.applications) {
    const t = parseApplied(app.appliedAt);
    events.push({
      ts: t,
      html:
        `Applied to <b>${escHtml(app.role || "a role")}</b>` +
        (app.status && app.status !== "Pending"
          ? ` <span class="act-chip act-chip-${(app.status || "").toLowerCase()}">${escHtml(app.status)}</span>`
          : ""),
    });
  }

  // Task submissions + feedback
  for (const sub of Object.values(state.submissions)) {
    const task = state.tasks.find((t) => t.id === sub.taskId);
    const taskTitle = task?.title || "a task";
    events.push({
      ts: parseApplied(sub.submittedAt) || 0,
      html: `Submitted <b>${escHtml(taskTitle)}</b>`,
    });
    if (sub.feedback && typeof sub.feedback.score === "number") {
      const ok = sub.feedback.status !== "rejected";
      events.push({
        ts: parseApplied(sub.feedback.reviewedAt) || 0,
        html: `${ok ? "✓" : "✗"} Feedback on <b>${escHtml(taskTitle)}</b> — ${sub.feedback.score}/100`,
      });
    }
  }

  events.sort((a, b) => (b.ts || 0) - (a.ts || 0));

  const foot = document.getElementById("activityFoot");
  const toggle = document.getElementById("activityToggle");

  if (!events.length) {
    list.innerHTML = `<div class="activity-empty muted" style="padding:10px 0;font-size:0.88rem">Your activity will appear here once you apply, submit tasks, or receive feedback.</div>`;
    if (foot) foot.style.display = "none";
    return;
  }

  const VISIBLE = 5;
  list.innerHTML = events
    .map((e, i) => `
      <div class="activity-item${i >= VISIBLE ? ' activity-item--overflow' : ''}">
        <span class="dot"></span>
        <div>${e.html}<div class="muted">${formatRelTime(e.ts)}</div></div>
      </div>`)
    .join("");

  if (foot && toggle) {
    if (events.length > VISIBLE) {
      foot.style.display = "";
      const expanded = list.classList.contains("is-expanded");
      toggle.textContent = expanded
        ? "Show less"
        : `View all activity (${events.length})`;
    } else {
      foot.style.display = "none";
      list.classList.remove("is-expanded");
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const activityToggle = document.getElementById("activityToggle");
  activityToggle?.addEventListener("click", () => {
    const list = document.getElementById("activityList");
    if (!list) return;
    const expanded = list.classList.toggle("is-expanded");
    const total = list.querySelectorAll(".activity-item").length;
    activityToggle.textContent = expanded
      ? "Show less"
      : `View all activity (${total})`;
  });

  const tasksToggle = document.getElementById("tasksToggle");
  tasksToggle?.addEventListener("click", () => {
    const list = document.getElementById("taskList");
    if (!list) return;
    const expanded = list.classList.toggle("is-expanded");
    const total = list.querySelectorAll(".task-item").length;
    tasksToggle.textContent = expanded
      ? "Show less"
      : `View all tasks (${total})`;
  });
});

function parseApplied(val) {
  if (!val) return 0;
  if (val && typeof val.toDate === "function") return val.toDate().getTime();
  if (typeof val === "string") {
    const d = new Date(val);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }
  if (typeof val === "number") return val;
  return 0;
}

function formatRelTime(ts) {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

document.addEventListener("DOMContentLoaded", () => {
  wireProfileModal();

  onAuthStateChanged(auth, (user) => {
    if (!user) return;
    state.uid = user.uid;
    loadProfile(user);
    subscribeToMyApplications(user.uid);
    loadApprovedInternship(user.uid).catch((e) => {
      console.error("loadApprovedInternship:", e);
      showLockedState();
    });
  });
});

function subscribeToMyApplications(uid) {
  const q = query(collection(db, "applications"), where("studentId", "==", uid));
  onSnapshot(q, (snap) => {
    state.applications = [];
    snap.forEach((d) => state.applications.push({ id: d.id, ...d.data() }));
    renderApplicationsKpi();
    renderUpcomingInterviews();
  });
}

const _interviewMetaCache = {};
async function hydrateShortlistMeta(app) {
  if (_interviewMetaCache[app.id]) return _interviewMetaCache[app.id];
  let companyName = "the company";
  let internshipTitle = "the internship";
  try {
    if (app.internshipId) {
      const intSnap = await getDoc(doc(db, "internships", app.internshipId));
      if (intSnap.exists()) internshipTitle = intSnap.data().title || internshipTitle;
    }
    if (app.companyId) {
      const coSnap = await getDoc(doc(db, "companies", app.companyId));
      if (coSnap.exists()) {
        const d = coSnap.data();
        companyName = d.companyName || d.name || companyName;
      }
    }
  } catch (e) { /* ignore — fall back to defaults */ }
  _interviewMetaCache[app.id] = { companyName, internshipTitle };
  return _interviewMetaCache[app.id];
}

async function renderUpcomingInterviews() {
  const host = document.getElementById("upcomingInterviews");
  if (!host) return;

  const now = Date.now();
  const shortlisted = (state.applications || []).filter((a) => {
    if (a.status !== "Shortlisted") return false;
    if (!a.interviewAt) return true; // still show even if time wasn't set
    const t = Date.parse(a.interviewAt);
    return isNaN(t) || t >= now - 60 * 60 * 1000; // include if within the last hour too
  });

  if (!shortlisted.length) {
    host.style.display = "none";
    host.innerHTML = "";
    return;
  }

  // Sort by soonest interview
  shortlisted.sort((a, b) => {
    const ta = a.interviewAt ? Date.parse(a.interviewAt) : Infinity;
    const tb = b.interviewAt ? Date.parse(b.interviewAt) : Infinity;
    return ta - tb;
  });

  const enriched = await Promise.all(
    shortlisted.map(async (app) => ({ app, meta: await hydrateShortlistMeta(app) })),
  );

  const tzAbbrOf = (tz) => {
    if (!tz) return "";
    try {
      const parts = Intl.DateTimeFormat("en", {
        timeZone: tz,
        timeZoneName: "short",
      }).formatToParts(new Date());
      const z = parts.find((p) => p.type === "timeZoneName");
      return z ? z.value : tz;
    } catch { return tz; }
  };

  const fmtWhen = (iso, tz) => {
    if (!iso) return "Time to be confirmed";
    const [dPart, tPart] = String(iso).split("T");
    if (!dPart || !tPart) return "Time to be confirmed";
    const day = new Date(dPart + "T12:00:00Z");
    const dayStr = isNaN(day.getTime())
      ? dPart
      : day.toLocaleDateString(undefined, {
          weekday: "short", month: "short", day: "numeric",
        });
    const timeStr = tPart.slice(0, 5); // "HH:MM"
    const abbr = tzAbbrOf(tz);
    return `${dayStr} · ${timeStr}${abbr ? " " + abbr : ""}`;
  };

  const isHttpLink = (s) => /^https?:\/\//i.test(s || "");

  const cards = enriched.map(({ app, meta }) => {
    const details = app.interviewDetails || "";
    const detailsBlock = details
      ? (isHttpLink(details)
          ? `<a class="ui-link" href="${escHtml(details)}" target="_blank" rel="noopener">Join meeting ↗</a>`
          : `<span class="ui-muted">${escHtml(details)}</span>`)
      : `<span class="ui-muted">Details to be shared</span>`;

    return `
      <article class="ui-card">
        <header class="ui-head">
          <span class="ui-chip">⭐ Shortlisted</span>
          <h3>${escHtml(meta.internshipTitle)}</h3>
          <p class="ui-sub">${escHtml(meta.companyName)}</p>
        </header>
        <div class="ui-body">
          <div class="ui-row">
            <span class="ui-label">When</span>
            <span class="ui-val">${escHtml(fmtWhen(app.interviewAt, app.interviewTimezone))}</span>
          </div>
          <div class="ui-row">
            <span class="ui-label">Meeting</span>
            <span class="ui-val">${detailsBlock}</span>
          </div>
        </div>
      </article>`;
  }).join("");

  host.innerHTML = `
    <div class="ui-head-row">
      <h2>Upcoming Interview${enriched.length > 1 ? "s" : ""}</h2>
      <p class="muted">Shortlisted by ${enriched.length > 1 ? "these companies" : "a company"} — prep details below.</p>
    </div>
    <div class="ui-grid">${cards}</div>`;
  host.style.display = "";
}

function renderApplicationsKpi() {
  const kpis = document.querySelectorAll(".kpi");
  if (!kpis.length) return;

  const apps = state.applications || [];
  const total = apps.length;
  const pending = apps.filter((a) => a.status === "Pending").length;
  const approved = apps.filter((a) => a.status === "Approved").length;
  const shortlisted = apps.filter((a) => a.status === "Shortlisted").length;
  const rejected = apps.filter((a) => a.status === "Rejected").length;

  const valEl = kpis[0]?.querySelector(".kpi-val");
  const subEl = kpis[0]?.querySelector(".kpi-sub");
  if (valEl) {
    valEl.removeAttribute("data-value");
    valEl.textContent = String(total);
  }
  if (subEl) {
    if (!total) {
      subEl.textContent = "No applications yet — browse internships to apply.";
    } else {
      const parts = [];
      if (approved) parts.push(`${approved} approved`);
      if (shortlisted) parts.push(`${shortlisted} shortlisted`);
      if (pending) parts.push(`${pending} pending`);
      if (rejected) parts.push(`${rejected} rejected`);
      subEl.textContent = parts.join(" · ");
    }
  }

  renderWelcomeBanner();
  renderActivityFeed();
}
