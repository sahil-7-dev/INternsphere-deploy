// virtualworkroom.js — Firestore-powered student workroom

import { auth, db } from "../firebase/firebase.js";
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  addDoc,
  doc,
  updateDoc,
  deleteField,
  serverTimestamp,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { esc } from "./lib/escape.js";

// ---- DOM refs -------------------------------------------------------
const editor = document.getElementById("editor");
const submitBtn = document.getElementById("submitBtn");
const consoleBox = document.getElementById("console");
const inputField = document.getElementById("input");
const uploadBox = document.getElementById("uploadBox");
const wordCount = document.getElementById("wordCount");
const charCount = document.getElementById("charCount");
const focusBtn = document.getElementById("focusToggle");
const exitFocusBtn = document.getElementById("exitFocus");
const taskList = document.getElementById("taskList");
const titleEl = document.querySelector(".task-header h2");
const descEl = document.querySelector(".desc");
const progressFill = document.getElementById("progressFill");
const progressLabel = document.getElementById("progressLabel");
const completionModal = document.getElementById("completionModal");

// ---- State ---------------------------------------------------------
let studentUid = null;
let studentName = "Intern";          // real name resolved from students/{uid}
let internshipId = null;
let internshipTitle = null;
let internshipCompany = "";          // company name that posted the role
let tasks = [];
let submissions = {}; // { taskId: submissionDoc }
let activeTaskId = null;
let pendingPdf = null; // { name, size, dataUrl } for the currently-active task
let approvedAppId = null;            // firestore id of the approved application
let certificateIssued = false;       // company-flipped flag gating completion cert

function isLocked(sub) {
  if (!sub) return false;
  return sub.feedback?.status !== "rejected";
}

function activeTaskKey() {
  if (!studentUid || !internshipId) return null;
  return `wr_activeTask_${studentUid}_${internshipId}`;
}
function loadActiveTaskId() {
  const k = activeTaskKey();
  if (!k) return null;
  try { return localStorage.getItem(k); } catch { return null; }
}
function saveActiveTaskId(id) {
  const k = activeTaskKey();
  if (!k || !id) return;
  try { localStorage.setItem(k, id); } catch {}
}

//   TASK LOADING + SUBMISSIONS

async function bootstrapForStudent(user) {
  studentUid = user.uid;

  try {
    const stu = await getDoc(doc(db, "students", user.uid));
    const n = stu.exists() ? (stu.data().name || "").trim() : "";
    if (n) studentName = n;
  } catch (_) { /* ignore */ }
  if (studentName === "Intern") {
    const fallback = (user.displayName || "").trim() ||
      (user.email || "").split("@")[0] || "Intern";
    studentName = fallback;
  }

  const appsQ = query(
    collection(db, "applications"),
    where("studentId", "==", user.uid),
    where("status", "==", "Approved"),
  );
  const appsSnap = await getDocs(appsQ);

  if (appsSnap.empty) {
    showNoInternship();
    return;
  }

  // Pick first approved
  const appDoc = appsSnap.docs[0];
  const app = appDoc.data();
  internshipId = app.internshipId;
  approvedAppId = appDoc.id;
  certificateIssued = app.certificateIssued === true;

  try {
    const intSnap = await getDoc(doc(db, "internships", internshipId));
    if (intSnap.exists()) {
      const d = intSnap.data();
      internshipTitle = d.title || internshipTitle;
      internshipCompany = d.companyName || d.company || "";
    }
  } catch (e) {
    console.warn("Could not load internship title:", e);
  }

  // Subscribe to tasks
  subscribeToTasks();
  // Subscribe to submissions
  subscribeToSubmissions();
  // Live-watch the application doc so certificateIssued updates without a reload
  subscribeToApprovedApp();
}

function subscribeToApprovedApp() {
  if (!approvedAppId) return;
  onSnapshot(doc(db, "applications", approvedAppId), (snap) => {
    if (!snap.exists()) return;
    certificateIssued = snap.data().certificateIssued === true;
    // if the student is already on the completion modal, refresh its controls
    refreshCompletionModal();
  });
}

function subscribeToTasks() {
  const q = query(collection(db, "tasks"), where("internshipId", "==", internshipId));
  onSnapshot(q, (snap) => {
    tasks = [];
    snap.forEach((d) => tasks.push({ id: d.id, ...d.data() }));
    tasks.sort((a, b) => (a.order || 0) - (b.order || 0));
    renderTasks();
  });
}

function subscribeToSubmissions() {
  const q = query(
    collection(db, "taskSubmissions"),
    where("studentId", "==", studentUid),
    where("internshipId", "==", internshipId),
  );
  onSnapshot(q, (snap) => {
    submissions = {};
    snap.forEach((d) => {
      const data = d.data();
      submissions[data.taskId] = { id: d.id, ...data };
    });
    renderTasks();
  });
}

function renderTasks() {
  if (!taskList) return;

  if (!tasks.length) {
    taskList.innerHTML = `
      <div class="task-empty" style="color:var(--muted);font-size:13px;padding:14px 0;line-height:1.6">
        No tasks have been assigned for <strong style="color:var(--text)">${esc(internshipTitle || "this internship")}</strong> yet. Check back soon.
      </div>`;
    updateProgress();
    if (titleEl) titleEl.textContent = "Awaiting tasks";
    if (descEl) descEl.textContent = "Your company will assign tasks shortly.";
    if (submitBtn) submitBtn.disabled = true;
    return;
  }

  if (!activeTaskId || !tasks.find((t) => t.id === activeTaskId)) {
    const saved = loadActiveTaskId();
    if (saved && tasks.find((t) => t.id === saved)) {
      activeTaskId = saved;
    } else {
      const needsWork = tasks.find((t) => !isLocked(submissions[t.id]));
      activeTaskId = (needsWork && needsWork.id) || tasks[0].id;
    }
  }
  saveActiveTaskId(activeTaskId);

  taskList.innerHTML = tasks
    .map((t) => {
      const sub = submissions[t.id];
      const rejected = sub?.feedback?.status === "rejected";
      const locked = isLocked(sub);
      const isActive = t.id === activeTaskId;
      const cls = ["task"];
      if (locked) cls.push("done");
      if (rejected) cls.push("rejected");
      if (isActive) cls.push("active");
      if (t.isFinal) cls.push("is-final");
      const marker = rejected ? "✖" : locked ? "✔" : isActive ? "➤" : "•";
      const finalFlag = t.isFinal ? ' <span style="font-size:10px;padding:1px 6px;border-radius:999px;background:rgba(236,72,153,0.18);color:#ec4899;margin-left:4px;font-weight:800;letter-spacing:0.04em">🏁 FINAL</span>' : "";
      return `<div class="${cls.join(" ")}" data-id="${t.id}">${marker} ${esc(t.title)}${finalFlag}</div>`;
    })
    .join("");

  taskList.querySelectorAll(".task").forEach((el) => {
    el.addEventListener("click", () => {
      // Save current editor draft before switching
      saveDraft();
      activeTaskId = el.getAttribute("data-id");
      saveActiveTaskId(activeTaskId);
      loadActive();
      renderTasks();
    });
  });

  loadActive();
  updateProgress();
  maybeShowCompletion();
}

function loadActive() {
  const t = tasks.find((x) => x.id === activeTaskId);
  if (!t) return;
  pendingPdf = null;
  if (titleEl) titleEl.textContent = t.title;
  if (descEl) {
    let desc = t.description || "—";
    if (t.requirePdf) desc += "  ·  📎 PDF attachment required";
    descEl.textContent = desc;
  }

  const sub = submissions[t.id];
  const rejected = sub?.feedback?.status === "rejected";
  const locked = isLocked(sub);

  // Banner for rejected tasks
  showRejectionBanner(t, sub, rejected);

  if (editor) {
    if (locked) {
      editor.innerHTML = sub.content || "";
      editor.contentEditable = "false";
    } else if (rejected) {
      editor.innerHTML = sub.content || localStorage.getItem(`wr_draft_${studentUid}_${t.id}`) || "";
      editor.contentEditable = "true";
    } else {
      editor.innerHTML = localStorage.getItem(`wr_draft_${studentUid}_${t.id}`) || "";
      editor.contentEditable = "true";
    }
    updateCounts();
    toggleSubmit();
  }

  // Refresh upload UI
  const uploadLabel = document.getElementById("uploadLabel");
  if (uploadLabel) {
    if (locked && sub?.pdfName) {
      uploadLabel.innerHTML = `📎 <strong>${escapeHtml(sub.pdfName)}</strong> already submitted`;
    } else if (t.requirePdf) {
      uploadLabel.innerHTML = `📎 <strong>PDF required</strong> — drop or browse a .pdf file`;
    } else {
      uploadLabel.textContent = "Drop files or browse";
    }
  }
  const uploadedList = document.getElementById("uploadedList");
  if (uploadedList) uploadedList.innerHTML = "";
}

function showRejectionBanner(task, sub, rejected) {
  let banner = document.getElementById("rejectBanner");
  if (!rejected) {
    banner?.remove();
    return;
  }
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "rejectBanner";
    banner.style.cssText =
      "padding:14px 18px;border-radius:12px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.3);margin:8px 0 14px;color:#fca5a5";
    const workspace = document.querySelector(".workspace");
    const desc = document.querySelector(".workspace .desc");
    if (workspace && desc) desc.after(banner);
    else if (workspace) workspace.prepend(banner);
  }
  const fb = sub?.feedback || {};
  const who = fb.reviewerName
    ? `${esc(fb.reviewerName)}${fb.reviewerPosition ? ` · ${esc(fb.reviewerPosition)}` : ""}`
    : "your reviewer";
  banner.innerHTML = `
    <strong style="color:#ef4444">This submission was rejected. Please revise and resubmit.</strong>
    <div style="font-size:13px;line-height:1.55;margin-top:6px;color:rgba(255,255,255,0.78)">
      <em>Feedback from ${who}:</em> ${esc(fb.note || "No note provided.")}
    </div>`;
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function saveDraft() {
  if (!editor || !activeTaskId) return;
  if (submissions[activeTaskId]) return;
  localStorage.setItem(`wr_draft_${studentUid}_${activeTaskId}`, editor.innerHTML);
}

function updateProgress() {
  const total = tasks.length;
  const done = tasks.filter((t) => isLocked(submissions[t.id])).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  if (progressFill) progressFill.style.width = pct + "%";
  if (progressLabel)
    progressLabel.textContent =
      total === 0 ? "No tasks" : `${done}/${total} tasks done`;
}

function showNoInternship() {
  if (taskList)
    taskList.innerHTML = `
      <div class="task-empty" style="color:var(--muted);font-size:13px;padding:14px 0;line-height:1.6">
        You don't have an approved internship yet. Apply and get approved first.
      </div>`;
  if (titleEl) titleEl.textContent = "No active internship";
  if (descEl)
    descEl.textContent =
      "Apply to an internship from your dashboard. Once approved, your tasks will appear here.";
  if (submitBtn) submitBtn.disabled = true;
  if (progressLabel) progressLabel.textContent = "—";
}

//   SUBMIT TASK — write to Firestore
async function submitActiveTask() {
  if (!editor || !activeTaskId || !studentUid || !internshipId) return;
  if (editor.innerText.trim().length === 0) return;

  const existing = submissions[activeTaskId];
  const rejected = existing?.feedback?.status === "rejected";

  if (existing && !rejected) {
    showToast("Already submitted.", "info");
    return;
  }

  const task = tasks.find((x) => x.id === activeTaskId);
  const needsNewPdf = task?.requirePdf && !pendingPdf && !(rejected && existing?.pdfName);
  if (needsNewPdf) {
    showToast("PDF attachment required for this task.", "error");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = rejected ? "Resubmitting…" : "Submitting…";
  try {
    if (existing) {
      const payload = {
        content: editor.innerHTML,
        submittedAt: serverTimestamp(),
        reviewed: false,
        feedback: deleteField(), // remove prior feedback; company will re-review
      };
      if (pendingPdf) {
        payload.pdfName = pendingPdf.name;
        payload.pdfSize = pendingPdf.size;
        payload.pdfData = pendingPdf.dataUrl;
      }
      await updateDoc(doc(db, "taskSubmissions", existing.id), payload);
      showToast("Task resubmitted — awaiting company review.");
    } else {
      // FRESH submission
      const payload = {
        taskId: activeTaskId,
        studentId: studentUid,
        internshipId,
        companyId: task?.companyId || "",
        content: editor.innerHTML,
        submittedAt: serverTimestamp(),
        reviewed: false,
      };
      if (pendingPdf) {
        payload.pdfName = pendingPdf.name;
        payload.pdfSize = pendingPdf.size;
        payload.pdfData = pendingPdf.dataUrl;
      }
      await addDoc(collection(db, "taskSubmissions"), payload);
      showToast("Task submitted successfully!");
    }

    localStorage.removeItem(`wr_draft_${studentUid}_${activeTaskId}`);
    pendingPdf = null;
  } catch (e) {
    console.error(e);
    const msg = e?.message || String(e);
    showToast("Failed to submit: " + msg.slice(0, 100), "error");
    submitBtn.disabled = false;
  } finally {
    submitBtn.textContent = rejected ? "Resubmit Task" : "Submit Task";
  }
}

function maybeShowCompletion() {
  if (!tasks.length) return;

  const finalTask = tasks.find((t) => t.isFinal);
  const allLocked = tasks.every((t) => isLocked(submissions[t.id]));
  const finalLocked = !!finalTask && isLocked(submissions[finalTask.id]);
  const finished = allLocked && !!finalTask && finalLocked;

  renderFinalTaskBanner(finalTask);

  if (
    finished &&
    completionModal &&
    !completionModal.classList.contains("is-open")
  ) {
    if (sessionStorage.getItem("wr_shown_complete") !== "1") {
      sessionStorage.setItem("wr_shown_complete", "1");
      completionModal.classList.add("is-open");
    }
  } else if (!finished) {
    sessionStorage.removeItem("wr_shown_complete");
  }

  refreshCompletionModal();
}

// Keeps the completion modal's button/copy in sync with whether the company
// has approved the certificate. Called on certificateIssued changes and
// after every task/submission update.
function refreshCompletionModal() {
  if (!completionModal) return;
  const btn = document.getElementById("downloadCertBtn");
  const hint = document.getElementById("completionHint");
  if (!btn) return;

  if (certificateIssued) {
    btn.disabled = false;
    btn.style.opacity = "";
    btn.textContent = "⬇ Download Certificate";
    if (hint) hint.textContent = "Your company has approved — certificate ready to download.";
  } else {
    btn.disabled = true;
    btn.style.opacity = "0.55";
    btn.textContent = "🔒 Waiting for company approval";
    if (hint) hint.textContent = "Your company will review your submission and approve your certificate. You'll receive your certificate within 1 week.";
  }
}

function renderFinalTaskBanner(finalTask) {
  let banner = document.getElementById("finalTaskBanner");

  // Remove banner if everything's already complete
  if (finalTask && isLocked(submissions[finalTask.id])) {
    banner?.remove();
    return;
  }

  const sidebar = document.querySelector(".sidebar") || document.getElementById("wrSidebar");
  if (!sidebar) return;

  if (!banner) {
    banner = document.createElement("div");
    banner.id = "finalTaskBanner";
    banner.style.cssText =
      "margin-top:14px;padding:12px 14px;border-radius:12px;border:1px solid rgba(236,72,153,0.35);background:linear-gradient(135deg,rgba(236,72,153,0.1),rgba(245,158,11,0.08));color:inherit;font-size:13px;line-height:1.5";
    sidebar.appendChild(banner);
  }

  if (!finalTask) {
    banner.innerHTML =
      '<strong style="color:#ec4899">🏁 Final task</strong>' +
      '<div style="opacity:0.8;margin-top:4px;font-size:12px">Your company will mark a final task to close out this internship. You\'ll see a completion message once it\'s submitted and locked in.</div>';
    return;
  }

  const sub = submissions[finalTask.id];
  const rejected = sub?.feedback?.status === "rejected";
  const submitted = !!sub && !rejected;

  if (submitted) {
    banner.innerHTML =
      '<strong style="color:#22c55e">✓ Final task submitted</strong>' +
      `<div style="opacity:0.8;margin-top:4px;font-size:12px">Your company is reviewing <em>${esc(finalTask.title)}</em>.</div>`;
  } else if (rejected) {
    banner.innerHTML =
      '<strong style="color:#ef4444">🏁 Final task needs revision</strong>' +
      `<div style="opacity:0.8;margin-top:4px;font-size:12px">Revise <em>${esc(finalTask.title)}</em> — completion is gated on this submission.</div>`;
  } else {
    banner.innerHTML =
      '<strong style="color:#ec4899">🏁 Final task</strong>' +
      `<div style="opacity:0.8;margin-top:4px;font-size:12px">Finish <em>${esc(finalTask.title)}</em> to complete this internship.</div>`;
  }
}

// Autosave drafts periodically
if (editor) {
  setInterval(saveDraft, 2000);
  editor.addEventListener("input", () => {
    updateCounts();
    toggleSubmit();
  });
}

function updateCounts() {
  if (!editor) return;
  const text = editor.innerText.trim();
  const words = text.length === 0 ? 0 : text.split(/\s+/).filter(Boolean).length;
  if (wordCount) wordCount.textContent = words + " words";
  if (charCount) charCount.textContent = text.length + " chars";
}

function toggleSubmit() {
  if (!submitBtn || !editor) return;
  const sub = activeTaskId ? submissions[activeTaskId] : null;
  const locked = isLocked(sub);
  const rejected = sub?.feedback?.status === "rejected";
  const task = tasks.find((x) => x.id === activeTaskId);
  const textOk = editor.innerText.trim().length > 0;
  const pdfOk = !task?.requirePdf || !!pendingPdf || !!(rejected && sub?.pdfName);
  submitBtn.disabled = locked || !textOk || !pdfOk;
  submitBtn.textContent = rejected ? "Resubmit Task" : "Submit Task";
  if (task?.requirePdf && !pendingPdf && !pdfOk && !locked) {
    submitBtn.title = "Attach a PDF file to submit this task.";
  } else {
    submitBtn.title = "";
  }
}

// Toolbar
document.querySelectorAll(".toolbar [data-cmd]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.execCommand(btn.dataset.cmd, false, null);
    editor?.focus();
    btn.classList.toggle(
      "toolbar-active",
      document.queryCommandState(btn.dataset.cmd),
    );
  });
});

document.addEventListener("selectionchange", () => {
  document.querySelectorAll(".toolbar [data-cmd]").forEach((btn) => {
    btn.classList.toggle(
      "toolbar-active",
      document.queryCommandState(btn.dataset.cmd),
    );
  });
});

const aiUndoStack = [];

function pushAiUndoSnapshot() {
  if (!editor) return;
  aiUndoStack.push(editor.innerHTML);
  // Cap to prevent unbounded memory
  if (aiUndoStack.length > 20) aiUndoStack.shift();
  updateUndoButton();
}

function updateUndoButton() {
  const btn = document.getElementById("undoAI");
  if (!btn) return;
  const hasAiEdit = aiUndoStack.length > 0;
  btn.textContent = hasAiEdit ? `Undo AI (${aiUndoStack.length})` : "Undo AI";
  btn.disabled = false;
  btn.title = hasAiEdit
    ? "Revert the last AI-generated change"
    : "Undo last edit";
}

document.getElementById("undoAI")?.addEventListener("click", () => {
  if (!editor) return;
  if (aiUndoStack.length > 0) {
    const prev = aiUndoStack.pop();
    editor.innerHTML = prev;
    editor.focus();
    updateCounts();
    toggleSubmit();
    updateUndoButton();
    showToast("AI change reverted");
  } else {
    document.execCommand("undo");
    editor.focus();
  }
});

function diffChangedWordIndices(oldText, newText) {
  const oldWords = (oldText || "").split(/\s+/).filter(Boolean);
  const newWords = (newText || "").split(/\s+/).filter(Boolean);

  if (oldWords.length * newWords.length > 200000) {
    return new Set(newWords.map((_, i) => i));
  }

  const m = oldWords.length;
  const n = newWords.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldWords[i - 1] === newWords[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const changed = new Set();
  let i = m, j = n;
  while (j > 0) {
    if (i > 0 && oldWords[i - 1] === newWords[j - 1]) { i--; j--; }
    else if (i === 0 || dp[i][j - 1] >= dp[i - 1][j]) { changed.add(j - 1); j--; }
    else { i--; }
  }
  return changed;
}

function wrapWordsForReveal(root, changedSet, { maxRevealMs = 2800 } = {}) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const textNodes = [];
  let n;
  while ((n = walker.nextNode())) {
    if (n.nodeValue && /\S/.test(n.nodeValue)) textNodes.push(n);
    else if (n.nodeValue) {
      // keep whitespace nodes intact
    }
  }

  let totalWords = 0;
  for (const t of textNodes) totalWords += (t.nodeValue.match(/\S+/g) || []).length;
  const delayPerWord = totalWords > 0
    ? Math.max(10, Math.min(30, Math.floor(maxRevealMs / totalWords)))
    : 24;

  let wordIdx = 0;
  for (const textNode of textNodes) {
    const text = textNode.nodeValue;
    const tokens = text.split(/(\s+)/);
    const frag = document.createDocumentFragment();
    for (const tok of tokens) {
      if (!tok) continue;
      if (/^\s+$/.test(tok)) {
        frag.appendChild(document.createTextNode(tok));
      } else {
        const span = document.createElement("span");
        span.className = "ai-word";
        if (changedSet.has(wordIdx)) span.classList.add("ai-changed");
        span.style.setProperty("--ai-delay", `${wordIdx * delayPerWord}ms`);
        span.textContent = tok;
        frag.appendChild(span);
        wordIdx++;
      }
    }
    textNode.parentNode.replaceChild(frag, textNode);
  }

  return {
    totalWords,
    totalMs: totalWords * delayPerWord + 5000 + 500,
  };
}

function unwrapAiSpans(root) {
  if (!root) return;
  root.querySelectorAll(".ai-word").forEach((span) => {
    const text = document.createTextNode(span.textContent);
    span.parentNode.replaceChild(text, span);
  });
  root.normalize();
}

let aiAnimCleanupTimer = null;

window.WorkroomEditor = {
  getContent() {
    return editor?.innerHTML || "";
  },
  getPlainText() {
    return editor?.innerText?.trim() || "";
  },
  isEmpty() {
    return !editor || editor.innerText.trim().length === 0;
  },
  replaceContent(html) {
    if (!editor) return false;
    pushAiUndoSnapshot();
    editor.innerHTML = html;
    updateCounts();
    toggleSubmit();
    return true;
  },
  replaceContentAnimated(html) {
    if (!editor) return false;

    if (aiAnimCleanupTimer) {
      clearTimeout(aiAnimCleanupTimer);
      unwrapAiSpans(editor);
      aiAnimCleanupTimer = null;
    }

    const oldText = editor.innerText || "";
    pushAiUndoSnapshot();

    editor.innerHTML = html;
    const newText = editor.innerText || "";
    const changed = diffChangedWordIndices(oldText, newText);
    const { totalMs } = wrapWordsForReveal(editor, changed);

    updateCounts();
    toggleSubmit();

    aiAnimCleanupTimer = setTimeout(() => {
      unwrapAiSpans(editor);
      aiAnimCleanupTimer = null;
    }, totalMs);
    return true;
  },
  appendContent(html) {
    if (!editor) return false;
    pushAiUndoSnapshot();
    editor.innerHTML = (editor.innerHTML || "") + html;
    updateCounts();
    toggleSubmit();
    return true;
  },
  focus() { editor?.focus(); },
  isEditable() {
    return editor && editor.getAttribute("contenteditable") !== "false";
  },
};

// Initialize undo-button label
updateUndoButton();

// Focus mode
if (focusBtn && exitFocusBtn) {
  focusBtn.addEventListener("click", () => {
    document.body.classList.add("focus-mode");
    focusBtn.style.display = "none";
    exitFocusBtn.style.display = "inline-flex";
  });
  exitFocusBtn.addEventListener("click", () => {
    document.body.classList.remove("focus-mode");
    exitFocusBtn.style.display = "none";
    focusBtn.style.display = "inline-flex";
  });
}

submitBtn?.addEventListener("click", submitActiveTask);

// Toast
function showToast(message, type = "success") {
  const existing = document.getElementById("toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.id = "toast";
  toast.className = "toast " + type;
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("toast-show"));
  setTimeout(() => {
    toast.classList.remove("toast-show");
    setTimeout(() => toast.remove(), 300);
  }, 2800);
}

// TARS empty / message UI
function showEmptyState() {
  if (!consoleBox) return;
  const isEmpty = consoleBox.querySelectorAll(".msg").length === 0;
  let empty = consoleBox.querySelector(".console-empty");
  if (isEmpty && !empty) {
    empty = document.createElement("div");
    empty.className = "console-empty";
    empty.textContent = "No messages yet. Ask TARS anything.";
    consoleBox.appendChild(empty);
  } else if (!isEmpty && empty) {
    empty.remove();
  }
}

function addMessage(text, sender = "bot") {
  if (!consoleBox) return;
  const empty = consoleBox.querySelector(".console-empty");
  if (empty) empty.remove();
  const msg = document.createElement("div");
  msg.className = "msg " + sender;
  consoleBox.appendChild(msg);
  let i = 0;
  msg.classList.add("typing");
  function typeEffect() {
    if (i < text.length) {
      msg.textContent += text[i++];
      setTimeout(typeEffect, 12);
    } else {
      msg.classList.remove("typing");
    }
  }
  typeEffect();
  consoleBox.scrollTop = consoleBox.scrollHeight;
}

// File upload
const fileInput = document.getElementById("fileInput");
const uploadedList = document.getElementById("uploadedList");
const uploadLabel = document.getElementById("uploadLabel");

const ALLOWED_TYPES = [
  "image/png", "image/jpeg", "image/gif", "image/webp",
  "application/pdf", "text/plain", "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

const PDF_MAX_BYTES = 900 * 1024; // 900 KB base64-encoded fits Firestore 1MB doc limit

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function updateUploadLabel() {
  if (!uploadedList || !uploadLabel) return;
  const count = uploadedList.querySelectorAll(".uploaded-item").length;
  uploadLabel.textContent =
    count === 0
      ? "Drop files or browse"
      : count + " file" + (count > 1 ? "s" : "") + " added — drop more or browse";
}

async function handleFiles(files) {
  if (!files || files.length === 0) return;
  const arr = Array.from(files);
  const task = tasks.find((x) => x.id === activeTaskId);

  for (const file of arr) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      showToast("Unsupported file: " + file.name, "error");
      continue;
    }

    if (file.type === "application/pdf" && task?.requirePdf) {
      if (file.size > PDF_MAX_BYTES) {
        showToast(
          `PDF too large (${formatSize(file.size)}). Max ${formatSize(PDF_MAX_BYTES)}.`,
          "error",
        );
        continue;
      }
      try {
        const dataUrl = await readFileAsDataUrl(file);
        pendingPdf = { name: file.name, size: file.size, dataUrl };
        showToast(`PDF attached: ${file.name}`, "success");
      } catch (e) {
        console.error(e);
        showToast("Failed to read PDF.", "error");
        continue;
      }
    }

    const item = document.createElement("div");
    item.className = "uploaded-item";
    const ext = file.name.split(".").pop().toUpperCase();
    item.innerHTML = `
      <span class="file-ext">${ext}</span>
      <span class="file-info">
        <span class="file-name">${escapeHtml(file.name)}</span>
        <span class="file-size">${formatSize(file.size)}</span>
      </span>
      <button class="remove-file" title="Remove">&#x2715;</button>
    `;
    item.querySelector(".remove-file").addEventListener("click", () => {
      item.classList.add("removing");
      if (file.type === "application/pdf") pendingPdf = null;
      setTimeout(() => {
        item.remove();
        updateUploadLabel();
        toggleSubmit();
      }, 200);
    });
    uploadedList.appendChild(item);
  }
  updateUploadLabel();
  toggleSubmit();
}

if (uploadBox) {
  uploadBox.addEventListener("click", (e) => {
    if (e.target.classList.contains("remove-file")) return;
    fileInput.click();
  });
  fileInput?.addEventListener("change", () => {
    handleFiles(fileInput.files);
    fileInput.value = "";
  });
  uploadBox.addEventListener("dragover", (e) => {
    e.preventDefault();
    uploadBox.classList.add("dragging");
  });
  uploadBox.addEventListener("dragleave", (e) => {
    if (!uploadBox.contains(e.relatedTarget))
      uploadBox.classList.remove("dragging");
  });
  uploadBox.addEventListener("drop", (e) => {
    e.preventDefault();
    uploadBox.classList.remove("dragging");
    handleFiles(e.dataTransfer.files);
  });
}

// Exit modal
const exitWorkroomBtn = document.getElementById("exitWorkroom");
const exitModal = document.getElementById("exitModal");
const cancelExitBtn = document.getElementById("cancelExit");
const confirmExitBtn = document.getElementById("confirmExit");
exitWorkroomBtn?.addEventListener("click", () => exitModal?.classList.remove("hidden"));
cancelExitBtn?.addEventListener("click", () => exitModal?.classList.add("hidden"));
confirmExitBtn?.addEventListener("click", () => {
  window.location.href = "dashboard.html";
});
exitModal?.addEventListener("click", (e) => {
  if (e.target === exitModal) exitModal.classList.add("hidden");
});

// Completion modal buttons
document.getElementById("completionOk")?.addEventListener("click", () => {
  window.location.href = "dashboard.html";
});
document.getElementById("completionStay")?.addEventListener("click", () => {
  completionModal?.classList.remove("is-open");
});
document.getElementById("downloadCertBtn")?.addEventListener("click", () => {
  if (!certificateIssued) return;
  downloadCertificate();
});

function downloadCertificate() {
  const btn = document.getElementById("downloadCertBtn");
  if (typeof window.downloadCompletionCertificate !== "function") {
    console.warn("certificate.js not loaded");
    return;
  }
  window.downloadCompletionCertificate({
    studentName,
    internshipTitle,
    internshipCompany,
    buttonEl: btn,
  });
}

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key === "Enter") {
    e.preventDefault();
    if (submitBtn && !submitBtn.disabled) submitBtn.click();
  }
  if (ctrl && e.shiftKey && e.key === "F") {
    e.preventDefault();
    document.body.classList.contains("focus-mode")
      ? exitFocusBtn?.click()
      : focusBtn?.click();
  }
  if (e.key === "Escape") {
    exitModal?.classList.add("hidden");
    completionModal?.classList.remove("is-open");
  }
});

//   BOOT
onAuthStateChanged(auth, (user) => {
  if (sessionStorage.getItem("guestRole")) { showNoInternship(); return; }
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  bootstrapForStudent(user).catch((err) => {
    console.error("Workroom init failed:", err);
    showNoInternship();
  });
});

showEmptyState();
