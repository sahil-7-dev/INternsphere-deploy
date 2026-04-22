// company-tasks.js — Task management for company dashboard

import { auth, db } from "../firebase/firebase.js";
import {
  collection,
  addDoc,
  getDoc,
  getDocs,
  query,
  where,
  doc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
  orderBy,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { esc } from "./lib/escape.js";
import { sanitizeSubmissionHtml } from "./lib/sanitize.js";

let internshipsForTasks = [];
let tasksCache = [];
let selectedInternshipId = "";
let editingTaskId = null;
let tasksUnsub = null;
let taskCurrentPage = 1;
const TASKS_PER_PAGE = 9;

function $(id) { return document.getElementById(id); }

// --------- Internship select ------------
async function loadInternshipsForTasks(userUid) {
  const q = query(collection(db, "internships"), where("companyId", "==", userUid));
  const snap = await getDocs(q);
  internshipsForTasks = [];
  snap.forEach((d) => internshipsForTasks.push({ id: d.id, ...d.data() }));
  renderInternshipSelect();
}

function renderInternshipSelect() {
  const sel = $("task-internship-select");
  if (!sel) return;
  sel.innerHTML =
    '<option value="">— Select internship —</option>' +
    internshipsForTasks
      .map((i) => `<option value="${i.id}">${esc(i.title)}</option>`)
      .join("");
}

// --------- Tasks list ---------
function renderTasks() {
  const grid = $("tasks-grid");
  const empty = $("tasks-empty");
  const hint = $("tasks-hint");
  const pager = $("tasks-pager");
  const pagerInfo = $("task-pager-info");
  const pagerPrev = $("task-pager-prev");
  const pagerNext = $("task-pager-next");
  if (!grid) return;

  if (!selectedInternshipId) {
    grid.innerHTML = "";
    if (empty) empty.style.display = "none";
    if (hint) hint.style.display = "block";
    if (pager) pager.style.display = "none";
    return;
  }

  if (hint) hint.style.display = "none";

  if (!tasksCache.length) {
    grid.innerHTML = "";
    if (empty) empty.style.display = "block";
    if (pager) pager.style.display = "none";
    return;
  }

  if (empty) empty.style.display = "none";

  const sorted = tasksCache.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  const totalPages = Math.max(1, Math.ceil(sorted.length / TASKS_PER_PAGE));
  if (taskCurrentPage > totalPages) taskCurrentPage = totalPages;
  if (taskCurrentPage < 1) taskCurrentPage = 1;
  const startIdx = (taskCurrentPage - 1) * TASKS_PER_PAGE;
  const pageSlice = sorted.slice(startIdx, startIdx + TASKS_PER_PAGE);

  if (pager) {
    pager.style.display = totalPages > 1 ? "flex" : "none";
    if (pagerInfo) pagerInfo.textContent = `Page ${taskCurrentPage} of ${totalPages}`;
    if (pagerPrev) pagerPrev.disabled = taskCurrentPage <= 1;
    if (pagerNext) pagerNext.disabled = taskCurrentPage >= totalPages;
  }

  grid.innerHTML = pageSlice
    .map((t) => {
      const due = t.dueDate || "—";
      const finalRingStyle = t.isFinal
        ? 'box-shadow:0 0 0 2px rgba(236,72,153,0.35), 0 10px 28px rgba(236,72,153,0.18);'
        : '';
      const avatarGradient = t.isFinal
        ? 'background:linear-gradient(135deg,#ec4899,#f59e0b);'
        : 'background:linear-gradient(135deg,#7c6bff,#a855f7);';
      return `
        <div class="app-card task-card" data-id="${t.id}" style="${finalRingStyle}">
          <div class="ac-top">
            <div class="ac-left">
              <div class="ac-avatar" style="${avatarGradient}color:#fff">${t.isFinal ? "🏁" : (t.order || 1)}</div>
              <div class="ac-left-text">
                <div class="ac-name">${esc(t.title)}</div>
                <div class="ac-role">${esc(t.description || "No description").slice(0, 80)}${(t.description || "").length > 80 ? "…" : ""}</div>
              </div>
            </div>
            <div class="ac-tags">
              ${t.isFinal ? '<span class="skill-tag task-tag--final">🏁 FINAL</span>' : ''}
              <span class="skill-tag task-tag--due">Due ${esc(due)}</span>
              ${t.requirePdf ? '<span class="skill-tag task-tag--pdf">📎 PDF</span>' : ''}
            </div>
          </div>
          <div class="ac-actions task-actions">
            <button class="btn-approve" data-act="edit">Edit</button>
            <button class="btn-reject" data-act="delete">Delete</button>
            <button class="btn-submissions" data-act="submissions">Submissions</button>
          </div>
        </div>`;
    })
    .join("");

  grid.querySelectorAll("[data-id]").forEach((card) => {
    const id = card.getAttribute("data-id");
    card.querySelectorAll("[data-act]").forEach((b) => {
      b.addEventListener("click", () => {
        const act = b.getAttribute("data-act");
        if (act === "delete") deleteTask(id);
        if (act === "edit") {
          const t = tasksCache.find((x) => x.id === id);
          if (t) openTaskModal(t);
        }
        if (act === "submissions") {
          const t = tasksCache.find((x) => x.id === id);
          if (t) openSubmissions(t);
        }
      });
    });
  });
}

function subscribeTasks() {
  if (tasksUnsub) tasksUnsub();
  tasksCache = [];
  if (!selectedInternshipId) {
    renderTasks();
    return;
  }

  const q = query(
    collection(db, "tasks"),
    where("internshipId", "==", selectedInternshipId),
  );
  tasksUnsub = onSnapshot(q, (snap) => {
    tasksCache = [];
    snap.forEach((d) => tasksCache.push({ id: d.id, ...d.data() }));
    renderTasks();
  });
}

async function deleteTask(id) {
  if (!confirm("Delete this task? Interns won't see it anymore.")) return;
  try {
    await deleteDoc(doc(db, "tasks", id));
  } catch (e) {
    console.error(e);
    alert("Failed to delete task.");
  }
}

// --------- Task modal ---------
function openTaskModal(t) {
  editingTaskId = t ? t.id : null;
  $("task-modal-title").textContent = t ? "Edit Task" : "New Task";
  $("task-field-title").value = t ? t.title || "" : "";
  $("task-field-desc").value = t ? t.description || "" : "";
  $("task-field-due").value = t ? t.dueDate || "" : "";
  $("task-field-order").value = t ? t.order || 1 : tasksCache.length + 1;
  const pdfChk = $("task-field-requirePdf");
  if (pdfChk) pdfChk.checked = t ? !!t.requirePdf : false;
  const finalChk = $("task-field-isFinal");
  if (finalChk) finalChk.checked = t ? !!t.isFinal : false;
  $("task-modal").classList.remove("hidden");
}

function closeTaskModal() {
  $("task-modal").classList.add("hidden");
  editingTaskId = null;
}

async function saveTask() {
  const user = auth.currentUser;
  if (!user) return alert("You must be logged in to add tasks.");
  if (!selectedInternshipId) return alert("Select an internship first.");

  const titleEl = $("task-field-title");
  const descEl = $("task-field-desc");
  const dueEl = $("task-field-due");
  const orderEl = $("task-field-order");
  if (!titleEl) return alert("Form not ready.");

  const title = (titleEl.value || "").trim();
  const description = (descEl?.value || "").trim();
  const dueDate = (dueEl?.value || "").trim(); // yyyy-mm-dd or ""
  const order = parseInt(orderEl?.value, 10) || 1;
  const requirePdf = !!$("task-field-requirePdf")?.checked;
  const isFinal = !!$("task-field-isFinal")?.checked;

  if (!title) return alert("Task title is required.");

  const payload = {
    title,
    description,
    dueDate,
    order,
    requirePdf,
    isFinal,
    internshipId: selectedInternshipId,
    companyId: user.uid,
  };

  const saveBtn = $("task-modal-save");
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";
  }

  try {
    if (isFinal) {
      const others = tasksCache.filter(
        (t) => t.isFinal && t.id !== editingTaskId,
      );
      await Promise.all(
        others.map((t) =>
          updateDoc(doc(db, "tasks", t.id), { isFinal: false }),
        ),
      );
    }

    if (editingTaskId) {
      await updateDoc(doc(db, "tasks", editingTaskId), {
        title,
        description,
        dueDate,
        order,
        requirePdf,
        isFinal,
      });
    } else {
      await addDoc(collection(db, "tasks"), {
        ...payload,
        createdAt: serverTimestamp(),
      });
    }
    closeTaskModal();
  } catch (e) {
    console.error("[company-tasks] Save failed:", e);
    const code = e?.code || "";
    const msg = e?.message || String(e);
    let hint = "";
    if (code === "permission-denied" || /permission|insufficient/i.test(msg)) {
      hint =
        "\n\nFirestore rules are blocking writes to the 'tasks' collection. " +
        "Add this to your rules (Firebase Console → Firestore → Rules):\n\n" +
        "match /tasks/{taskId} {\n" +
        "  allow read: if request.auth != null;\n" +
        "  allow write: if request.auth != null && request.auth.uid == request.resource.data.companyId;\n" +
        "}";
    }
    alert("Failed to save task.\n\n" + (code ? "Code: " + code + "\n" : "") + msg + hint);
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save Task";
    }
  }
}

// --------- Init ---------
function wire(id, fn, ev = "click") {
  const el = $(id);
  if (el) el.addEventListener(ev, fn);
}

document.addEventListener("DOMContentLoaded", () => {
  document
    .querySelectorAll('.nav-item[data-section="tasks"]')
    .forEach((el) => {
      el.addEventListener("click", () => {
        const user = auth.currentUser;
        if (user) loadInternshipsForTasks(user.uid);
      });
    });

  wire("task-internship-select", (e) => {
    selectedInternshipId = e.target.value;
    taskCurrentPage = 1;
    const btn = $("open-task-modal-btn");
    if (btn) btn.disabled = !selectedInternshipId;
    subscribeTasks();
  }, "change");

  // tasks pagination
  wire("task-pager-prev", () => {
    if (taskCurrentPage > 1) {
      taskCurrentPage -= 1;
      renderTasks();
      $("tasks-grid")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
  wire("task-pager-next", () => {
    const total = Math.max(1, Math.ceil(tasksCache.length / TASKS_PER_PAGE));
    if (taskCurrentPage < total) {
      taskCurrentPage += 1;
      renderTasks();
      $("tasks-grid")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  wire("open-task-modal-btn", () => openTaskModal(null));
  wire("task-modal-cancel", closeTaskModal);
  wire("task-modal-cancel-2", closeTaskModal);
  wire("task-modal-save", saveTask);

  const modal = $("task-modal");
  if (modal)
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeTaskModal();
    });

  onAuthStateChanged(auth, (user) => {
    if (user) loadInternshipsForTasks(user.uid);
  });

  // ───── Submissions review wiring ─────
  wire("submissions-modal-close", closeSubmissions);
  wire("review-modal-close", closeReview);
  wire("review-cancel", closeReview);
  wire("review-save", saveReview);

  // Show/hide custom position input
  const posSelect = $("review-reviewer-position");
  posSelect?.addEventListener("change", () => {
    const wrap = $("review-reviewer-custom-wrap");
    if (!wrap) return;
    wrap.style.display = posSelect.value === "__custom__" ? "" : "none";
    if (posSelect.value === "__custom__") $("review-reviewer-custom")?.focus();
  });

  const subsModal = $("submissions-modal");
  if (subsModal) subsModal.addEventListener("click", (e) => {
    if (e.target === subsModal) closeSubmissions();
  });
  const revModal = $("review-modal");
  if (revModal) revModal.addEventListener("click", (e) => {
    if (e.target === revModal) closeReview();
  });
});

//   SUBMISSIONS REVIEW

let reviewingSub = null;
let subsUnsub = null;

async function openSubmissions(task) {
  reviewingSub = null;
  const title = $("submissions-modal-title");
  if (title) title.textContent = `Submissions — ${task.title || ""}`;

  const modal = $("submissions-modal");
  const list = $("submissions-list");
  const empty = $("submissions-empty");
  if (!modal || !list) return;
  modal.classList.remove("hidden");
  list.innerHTML = '<p style="text-align:center;padding:24px;color:#8a95a3">Loading…</p>';

  if (subsUnsub) subsUnsub();

  const user = auth.currentUser;
  if (!user) return;
  const q = query(
    collection(db, "taskSubmissions"),
    where("taskId", "==", task.id),
    where("companyId", "==", user.uid),
  );
  subsUnsub = onSnapshot(q, async (snap) => {
    const subs = [];
    snap.forEach((d) => subs.push({ id: d.id, ...d.data() }));
    if (!subs.length) {
      list.innerHTML = "";
      if (empty) empty.style.display = "block";
      return;
    }
    if (empty) empty.style.display = "none";

    const nameCache = {};
    await Promise.all(
      subs.map(async (s) => {
        if (!nameCache[s.studentId]) {
          try {
            const sd = await getDoc(doc(db, "students", s.studentId));
            if (sd.exists()) {
              const d = sd.data();
              nameCache[s.studentId] = d.name || d.email || s.studentId;
            } else {
              nameCache[s.studentId] = s.studentId;
            }
          } catch {
            nameCache[s.studentId] = s.studentId;
          }
        }
      }),
    );

    list.innerHTML = subs
      .map((s) => {
        const name = nameCache[s.studentId] || s.studentId;
        const reviewed = s.feedback && typeof s.feedback.score === "number";
        const status = reviewed
          ? `<span class="badge ${s.feedback.status === "rejected" ? "rejected" : "approved"}">Reviewed · ${s.feedback.score}/100</span>`
          : `<span class="badge pending">Pending review</span>`;
        return `
          <div class="app-card" data-sub-id="${s.id}">
            <div class="ac-top">
              <div class="ac-left">
                <div class="ac-avatar">${(name || "?").slice(0, 2).toUpperCase()}</div>
                <div>
                  <div class="ac-name">${esc(name)}</div>
                  <div class="ac-role">Submitted · ${s.submittedAt?.toDate ? s.submittedAt.toDate().toLocaleString() : ""}</div>
                </div>
              </div>
              ${status}
            </div>
            <div class="ac-actions">
              <button class="btn-approve" data-review="${s.id}">${reviewed ? "Update Review" : "Review"}</button>
            </div>
          </div>`;
      })
      .join("");

    list.querySelectorAll("[data-review]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-review");
        const sub = subs.find((x) => x.id === id);
        if (sub) openReview(sub, nameCache[sub.studentId]);
      });
    });
  });
}

function closeSubmissions() {
  $("submissions-modal")?.classList.add("hidden");
  if (subsUnsub) { subsUnsub(); subsUnsub = null; }
}

function openReview(sub, studentName) {
  reviewingSub = sub;
  $("review-student").textContent = studentName || sub.studentId;

  const reportBtn = document.getElementById("reportSubmissionBtn");
  if (reportBtn) {
    reportBtn.onclick = () => {
      if (window.reportTarget) {
        window.reportTarget(
          "submission",
          sub.id,
          `Submission by ${studentName || sub.studentId}`
        );
      }
    };
  }
  const content = $("review-content");
  if (content) {
    const safe = sanitizeSubmissionHtml(sub.content);
    content.innerHTML = safe || "<em>(no content)</em>";
  }

  // PDF row
  const pdfRow = $("review-pdf-row");
  const pdfLink = $("review-pdf-link");
  if (sub.pdfData && pdfRow && pdfLink) {
    pdfRow.style.display = "";
    pdfLink.href = sub.pdfData;
    pdfLink.setAttribute("download", sub.pdfName || "submission.pdf");
    pdfLink.textContent = `Download ${sub.pdfName || "submission.pdf"}`;
  } else if (pdfRow) {
    pdfRow.style.display = "none";
  }

  const fb = sub.feedback || {};
  // Prefill if already reviewed
  $("review-score").value = fb.score ?? 80;
  $("review-status").value = fb.status || "approved";
  $("review-note").value = fb.note || "";

  const remembered = (() => {
    try {
      return JSON.parse(sessionStorage.getItem("is.lastReviewer") || "{}");
    } catch { return {}; }
  })();

  const rnameEl = $("review-reviewer-name");
  const rposEl = $("review-reviewer-position");
  const rcustomEl = $("review-reviewer-custom");
  const rcustomWrap = $("review-reviewer-custom-wrap");
  if (rnameEl) rnameEl.value = fb.reviewerName || remembered.reviewerName || "";

  const preset = ["CEO","Head","Manager","Supervisor","Team Lead","HR","Mentor"];
  const savedPos = fb.reviewerPosition || remembered.reviewerPosition || "";
  if (savedPos && !preset.includes(savedPos)) {
    if (rposEl) rposEl.value = "__custom__";
    if (rcustomEl) rcustomEl.value = savedPos;
    if (rcustomWrap) rcustomWrap.style.display = "";
  } else {
    if (rposEl) rposEl.value = savedPos;
    if (rcustomEl) rcustomEl.value = "";
    if (rcustomWrap) rcustomWrap.style.display = "none";
  }

  $("review-modal").classList.remove("hidden");
}

function closeReview() {
  $("review-modal")?.classList.add("hidden");
  reviewingSub = null;
}

async function saveReview() {
  if (!reviewingSub) return;
  const score = parseInt($("review-score").value, 10);
  const status = $("review-status").value;
  const note = ($("review-note").value || "").trim();
  const reviewerName = ($("review-reviewer-name")?.value || "").trim();
  const positionSelect = $("review-reviewer-position")?.value || "";
  const customPosition = ($("review-reviewer-custom")?.value || "").trim();
  const reviewerPosition =
    positionSelect === "__custom__" ? customPosition : positionSelect;

  if (isNaN(score) || score < 0 || score > 100) return alert("Score must be 0–100.");
  if (!reviewerName) return alert("Reviewer name is required.");
  if (!reviewerPosition) return alert("Please select or enter a reviewer position.");

  const btn = $("review-save");
  if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }

  try {
    await updateDoc(doc(db, "taskSubmissions", reviewingSub.id), {
      reviewed: true,
      feedback: {
        score,
        status,
        note,
        reviewerName,
        reviewerPosition,
        reviewedAt: new Date().toISOString(),
      },
    });
    try {
      sessionStorage.setItem(
        "is.lastReviewer",
        JSON.stringify({ reviewerName, reviewerPosition }),
      );
    } catch {}
    closeReview();
  } catch (e) {
    console.error("Save review failed:", e);
    alert("Failed to save review.\n\n" + (e?.code || "") + "\n" + (e?.message || e));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Submit Feedback"; }
  }
}

