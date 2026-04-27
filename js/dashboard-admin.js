// js/dashboard-admin.js

import { requireAdmin } from "./guard.js";
import { auth, db } from "../firebase/firebase.js";
import {
  collection,
  query,
  where,
  onSnapshot,
  getDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  addDoc,
  writeBatch,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import {
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import {
  getFunctions,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-functions.js";
import { escAttr as esc } from "./lib/escape.js";

const _functions = getFunctions();
const deleteAuthUserFn = httpsCallable(_functions, "deleteAuthUser");

requireAdmin("login.html");

// helpers

function $(id) { return document.getElementById(id); }
function fmtDate(ts) {
  if (!ts) return "—";
  if (ts.toDate) return ts.toDate().toLocaleDateString();
  try { return new Date(ts).toLocaleDateString(); } catch { return "—"; }
}

function showAdminNotice(title, body) {
  const modal = $("adminNoticeModal");
  const t     = $("adminNoticeTitle");
  const b     = $("adminNoticeBody");
  const ok    = $("adminNoticeOk");
  if (!modal || !t || !b || !ok) {
    alert(typeof body === "string" ? body : (b?.textContent || title));
    return;
  }
  t.textContent = title || "Notice";
  b.textContent = body || "";
  modal.hidden = false;
  document.body.classList.add("modal-open");

  const close = () => {
    modal.hidden = true;
    document.body.classList.remove("modal-open");
    ok.removeEventListener("click", close);
    modal.removeEventListener("click", onBackdrop);
    document.removeEventListener("keydown", onKey);
  };
  const onBackdrop = (e) => { if (e.target === modal) close(); };
  const onKey = (e) => { if (e.key === "Escape" || e.key === "Enter") close(); };

  ok.addEventListener("click", close);
  modal.addEventListener("click", onBackdrop);
  document.addEventListener("keydown", onKey);
  ok.focus();
}

// state

let CURRENT_UID = null;
let users       = [];
let companies   = {};
let students    = {};
let supportMsgs = [];
let reports     = [];
let activeTab   = "users";

// tab switching

function setTab(name) {
  activeTab = name;
  document.querySelectorAll(".admin-tab").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.tab === name));
  document.querySelectorAll(".nav-item").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.tab === name));
  document.querySelectorAll(".admin-section").forEach((s) =>
    s.hidden = s.dataset.tabPanel !== name);
}
document.querySelectorAll("[data-tab]").forEach((el) => {
  el.addEventListener("click", (e) => {
    e.preventDefault();
    setTab(el.dataset.tab);
  });
});

// identity

let CURRENT_ADMIN_NAME  = "Admin";
let CURRENT_ADMIN_EMAIL = "";

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  CURRENT_UID = user.uid;
  CURRENT_ADMIN_EMAIL = user.email || "";
  try {
    const u = await getDoc(doc(db, "users", user.uid));
    const d = u.exists() ? u.data() : {};
    const name = d.name || user.email?.split("@")[0] || "Admin";
    CURRENT_ADMIN_NAME = name;
    $("adminName").textContent = name;
    paintAdminAvatar(d.profilePic || "", name);
  } catch (_) { }
});

function paintAdminAvatar(pic, name) {
  const el = $("adminAvatar");
  if (!el) return;
  const initial = (name || CURRENT_ADMIN_NAME || "A").charAt(0).toUpperCase();
  if (pic) {
    el.style.backgroundImage = `url("${pic}")`;
    el.classList.add("has-pic");
    el.textContent = initial;
  } else {
    el.style.backgroundImage = "";
    el.classList.remove("has-pic");
    el.textContent = initial;
  }
}

// data subscribers

function onSnapErr(tableSelector, collName) {
  return (err) => {
    console.error(`[admin] ${collName} subscription failed:`, err);
    const tbody = document.querySelector(tableSelector);
    if (tbody) {
      tbody.innerHTML = `
        <tr><td colspan="6" class="admin-hint" style="color:#ef4444">
          Could not load ${esc(collName)} — <b>${esc(err.code || "error")}</b>.
          <br><small>Most likely your Firestore rules don't grant admin reads on <code>${esc(collName)}</code>.
          See the comment at the bottom of <code>js/dashboard-admin.js</code> for the rules you need.</small>
        </td></tr>`;
    }
  };
}

onSnapshot(
  collection(db, "users"),
  (snap) => {
    const raw = [];
    snap.forEach((d) => raw.push({ uid: d.id, ...d.data() }));
    users = raw;
    renderStats();
    renderUsers();
  },
  onSnapErr("#usersTable tbody", "users"),
);

onSnapshot(
  collection(db, "students"),
  (snap) => {
    students = {};
    snap.forEach((d) => { students[d.id] = d.data(); });
    renderUsers();
  },
  onSnapErr("#usersTable tbody", "students"),
);

onSnapshot(
  collection(db, "companies"),
  (snap) => {
    companies = {};
    snap.forEach((d) => { companies[d.id] = d.data(); });
    renderStats();
    renderUsers();
    renderVerification();
  },
  onSnapErr("#verifyTable tbody", "companies"),
);

onSnapshot(
  collection(db, "supportMessages"),
  (snap) => {
    supportMsgs = [];
    snap.forEach((d) => supportMsgs.push({ id: d.id, ...d.data() }));
    supportMsgs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    renderStats();
    renderSupport();
    paintSupportBadge();
  },
  onSnapErr("#supportTable tbody", "supportMessages"),
);

onSnapshot(
  collection(db, "reports"),
  (snap) => {
    reports = [];
    snap.forEach((d) => reports.push({ id: d.id, ...d.data() }));
    reports.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    renderModeration();
    paintModerationBadge();
  },
  onSnapErr("#modTable tbody", "reports"),
);

// stats

function renderStats() {
  const total = users.length;
  const studentsCount  = users.filter((u) => u.role === "student").length;
  const companiesCount = users.filter((u) => u.role === "company").length;
  const unverified     = Object.values(companies).filter((c) => c.verified !== true).length;
  const supportOpen    = supportMsgs.filter((m) => !m.resolvedAt).length;

  $("statUsers").textContent     = total;
  $("statStudents").textContent  = studentsCount;
  $("statCompanies").textContent = companiesCount;
  $("statUnverified").textContent = unverified;
  $("statSupport").textContent   = supportOpen;
}

// users panel

const USERS_PAGE_SIZE = 25;
let usersSortKey = "createdAt";
let usersSortDir = "desc";
let usersPage    = 1;

function compareUsers(a, b, key, dir) {
  const mul = dir === "asc" ? 1 : -1;
  const va = _sortValueFor(a, key);
  const vb = _sortValueFor(b, key);
  const emptyA = va === "" || va == null;
  const emptyB = vb === "" || vb == null;
  if (emptyA && !emptyB) return 1;
  if (!emptyA && emptyB) return -1;
  if (typeof va === "number" && typeof vb === "number") return (va - vb) * mul;
  return String(va).localeCompare(String(vb)) * mul;
}
function _sortValueFor(u, key) {
  if (key === "createdAt") {
    return u.createdAt?.seconds || 0;
  }
  if (key === "status") return u.disabled === true ? "disabled" : "active";
  if (key === "role")   return u.role || "zzz";
  return (u[key] || "").toString().toLowerCase();
}

function renderUsers() {
  const tbody = document.querySelector("#usersTable tbody");
  if (!tbody) return;

  const q    = ($("userSearch").value || "").trim().toLowerCase();
  const role = $("userRoleFilter").value;
  const stat = $("userStatusFilter").value;

  const filtered = users.filter((u) => {
    if (role && u.role !== role) return false;
    if (stat === "active" && u.disabled === true) return false;
    if (stat === "disabled" && u.disabled !== true) return false;
    if (q) {
      const hay = `${u.name || ""} ${u.email || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  filtered.sort((a, b) => compareUsers(a, b, usersSortKey, usersSortDir));

  document.querySelectorAll("#usersTable th.admin-sort").forEach((th) => {
    if (th.dataset.sort === usersSortKey) th.setAttribute("data-sort-dir", usersSortDir);
    else                                  th.removeAttribute("data-sort-dir");
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / USERS_PAGE_SIZE));
  if (usersPage > totalPages) usersPage = totalPages;
  const start = (usersPage - 1) * USERS_PAGE_SIZE;
  const pageRows = filtered.slice(start, start + USERS_PAGE_SIZE);

  const pager = $("usersPager");
  if (filtered.length > USERS_PAGE_SIZE) {
    pager.hidden = false;
    $("usersPagerInfo").textContent = `Page ${usersPage} / ${totalPages}`;
    $("usersPagerPrev").disabled = usersPage <= 1;
    $("usersPagerNext").disabled = usersPage >= totalPages;
  } else {
    pager.hidden = true;
  }

  $("usersCount").textContent = `${filtered.length} ${filtered.length === 1 ? "user" : "users"}`;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="admin-hint">No users match these filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = pageRows.map((u) => {
    const enriched = (u.role === "company" ? companies[u.uid] : students[u.uid]) || {};
    const name    = u.name || enriched.name || u.email?.split("@")[0] || "—";
    const status  = u.disabled === true ? "disabled" : "active";
    const roleKey = u.role || "student";
    const roleLabel = roleKey === "admin"   ? "Admin"
                    : roleKey === "company" ? "Company"
                    : roleKey === "dev"     ? "Dev"
                    : "Student";
    const isSelf = u.uid === CURRENT_UID;

    return `
      <tr data-uid="${esc(u.uid)}">
        <td>${esc(name)}</td>
        <td class="admin-mono">${esc(u.email || "—")}</td>
        <td><span class="admin-badge admin-badge--role-${roleKey}">${esc(roleLabel)}</span></td>
        <td>
          ${status === "disabled"
            ? `<span class="admin-badge admin-badge--off">Suspended</span>`
            : `<span class="admin-badge admin-badge--ok">Active</span>`}
        </td>
        <td class="admin-mono">${fmtDate(u.createdAt)}</td>
        <td style="text-align:right;white-space:nowrap">
          ${isSelf
            ? `<span class="admin-mono" style="opacity:0.6">(you)</span>`
            : `
              <button class="admin-btn" data-act="role" data-uid="${esc(u.uid)}">Change role</button>
              <button class="admin-btn ${status === "disabled" ? "is-success" : ""}"
                      data-act="toggle" data-uid="${esc(u.uid)}">
                ${status === "disabled" ? "Reinstate" : "Suspend"}
              </button>
              <button class="admin-btn is-danger" data-act="delete" data-uid="${esc(u.uid)}">Delete</button>
            `}
        </td>
      </tr>
    `;
  }).join("");
}

document.querySelector("#usersTable").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const act = btn.dataset.act;
  const uid = btn.dataset.uid;
  const user = users.find((u) => u.uid === uid);
  if (!user) return;

  if (act === "toggle") {
    const next = !(user.disabled === true);
    if (!confirm(`${next ? "Suspend" : "Reinstate"} ${user.email}?`)) return;
    await updateDoc(doc(db, "users", uid), { disabled: next });
    await logAdminAction(next ? "suspend" : "reinstate", { uid, email: user.email });
  }

  if (act === "role") {
    const current = user.role || "student";
    const next = prompt(
      "Change role to one of: admin | company | student | dev\n\n" +
      `Currently: ${current}`,
      current
    );
    if (!next) return;
    const val = next.trim().toLowerCase();
    if (!["admin", "company", "student", "dev"].includes(val)) {
      alert("Invalid role. Must be one of: admin, company, student, dev.");
      return;
    }
    await updateDoc(doc(db, "users", uid), { role: val });
    await logAdminAction("role-change", { uid, email: user.email, from: current, to: val });
  }

  if (act === "delete") {
    if (!confirm(`Delete ${user.email}? This permanently removes the Firebase Auth record (via Cloud Function) AND all their Firestore data.`)) return;

    let authRemoved = false;
    let authErrorMsg = "";
    try {
      const res = await deleteAuthUserFn({ uid });
      authRemoved = !!(res && res.data && res.data.ok);
    } catch (err) {
      authErrorMsg = err.code || err.message || "unknown";
      console.warn("[admin] deleteAuthUser failed:", err);
    }

    try {
      await deleteDoc(doc(db, "users", uid));
      if (user.role === "company") {
        await deleteDoc(doc(db, "companies", uid)).catch(() => {});
      } else {
        await deleteDoc(doc(db, "students", uid)).catch(() => {});
      }
      await logAdminAction("delete-user", {
        uid,
        email: user.email,
        authRemoved,
        authError: authErrorMsg,
      });

      if (!authRemoved) {
        showAdminNotice(
          "Auth account not deleted",
          "Firestore data removed, but the Firebase Auth account could " +
          "NOT be deleted automatically (" + (authErrorMsg || "unknown") + ").\n\n" +
          "Deploy the `deleteAuthUser` Cloud Function (see functions/index.js) " +
          "to enable one-click Auth deletion, or open Firebase console → " +
          "Authentication → Users and delete " + user.email + " manually."
        );
      } else {
        showAdminNotice(
          "User deleted",
          user.email + " has been removed. Their Firebase Auth account and all Firestore data are gone."
        );
      }
    } catch (err) {
      showAdminNotice("Delete failed", err.message || String(err));
    }
  }
});

["userSearch", "userRoleFilter", "userStatusFilter"].forEach((id) => {
  $(id)?.addEventListener("input", () => {
    usersPage = 1;
    renderUsers();
  });
});

document.querySelectorAll("#usersTable th.admin-sort").forEach((th) => {
  th.addEventListener("click", () => {
    const key = th.dataset.sort;
    if (usersSortKey === key) {
      usersSortDir = usersSortDir === "asc" ? "desc" : "asc";
    } else {
      usersSortKey = key;
      usersSortDir = "asc";
    }
    usersPage = 1;
    renderUsers();
  });
});

$("usersPagerPrev")?.addEventListener("click", () => {
  if (usersPage > 1) { usersPage--; renderUsers(); }
});
$("usersPagerNext")?.addEventListener("click", () => {
  usersPage++;
  renderUsers();
});

// verification panel

function renderVerification() {
  const tbody = document.querySelector("#verifyTable tbody");
  if (!tbody) return;

  const queue = users
    .filter((u) => u.role === "company")
    .map((u) => ({ u, c: companies[u.uid] || {} }))
    .filter(({ c }) => c.verified !== true);

  $("verifyCount").textContent = `${queue.length} in queue`;

  if (!queue.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="admin-hint">Queue clear — no companies awaiting verification.</td></tr>`;
    return;
  }

  tbody.innerHTML = queue.map(({ u, c }) => {
    const name = c.name || u.name || u.email?.split("@")[0] || "—";
    const about = (c.about || "").slice(0, 120);
    const rejected = c.rejected === true;
    const reason = c.rejectReason || "";

    const actions = rejected
      ? `<button class="admin-btn"           data-vact="reinstate" data-uid="${esc(u.uid)}">Reinstate</button>
         <button class="admin-btn is-danger" data-vact="delete"    data-uid="${esc(u.uid)}">Delete</button>`
      : `<button class="admin-btn is-success" data-vact="approve"  data-uid="${esc(u.uid)}">Approve</button>
         <button class="admin-btn is-danger"  data-vact="reject"   data-uid="${esc(u.uid)}">Reject</button>`;

    return `
      <tr data-uid="${esc(u.uid)}">
        <td>
          <b>${esc(name)}</b>
          ${rejected ? `<div style="margin-top:4px"><span class="admin-badge admin-badge--off">Rejected</span></div>` : ""}
        </td>
        <td class="admin-mono">${esc(u.email || "—")}</td>
        <td style="max-width:320px;color:var(--text2)">
          ${esc(about) || "<i>No description provided.</i>"}
          ${rejected && reason ? `<div style="margin-top:6px;font-size:0.78rem;color:#ef4444"><b>Reason:</b> ${esc(reason)}</div>` : ""}
        </td>
        <td class="admin-mono">${fmtDate(u.createdAt)}</td>
        <td style="text-align:right;white-space:nowrap">${actions}</td>
      </tr>
    `;
  }).join("");
}

document.querySelector("#verifyTable").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-vact]");
  if (!btn) return;
  const uid = btn.dataset.uid;
  const user = users.find((u) => u.uid === uid);
  if (!user) return;
  const act = btn.dataset.vact;

  const setCompany = async (patch) => {
    const mod = await import("https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js");
    await mod.setDoc(doc(db, "companies", uid), patch, { merge: true });
  };

  if (act === "approve") {
    if (!confirm(`Approve ${user.email} as a verified company?`)) return;
    await setCompany({ verified: true, rejected: false, rejectReason: "" });
    await addDoc(collection(db, "notifications"), {
      studentId: uid,
      companyId: uid,
      message: "Your company account was verified — you can now post internships.",
      kind: "verify-approved",
      senderUid:  CURRENT_UID,
      senderRole: "admin",
      senderName: "InternSphere Admin",
      isRead: false,
      createdAt: serverTimestamp(),
    });
    await logAdminAction("approve-company", { uid, email: user.email });
  }

  if (act === "reject") {
    const reason = prompt(
      `Reject ${user.email}?\n\nOptional reason (shown in the admin queue and in a notification to the company):`,
      ""
    );
    if (reason === null) return;
    await setCompany({
      rejected: true,
      rejectReason: reason.trim().slice(0, 400),
      verified: false,
    });
    await addDoc(collection(db, "notifications"), {
      studentId: uid,
      companyId: uid,
      message: reason.trim()
        ? `Your company verification was not approved — reason: ${reason.trim()}`
        : "Your company verification was not approved. Contact support for details.",
      kind: "verify-rejected",
      senderUid:  CURRENT_UID,
      senderRole: "admin",
      senderName: "InternSphere Admin",
      isRead: false,
      createdAt: serverTimestamp(),
    });
    await logAdminAction("reject-company", { uid, email: user.email, reason: reason.trim() });
  }

  if (act === "reinstate") {
    if (!confirm(`Reinstate ${user.email} back into the pending queue?`)) return;
    await setCompany({ rejected: false, rejectReason: "" });
    await logAdminAction("reinstate-company", { uid, email: user.email });
  }

  if (act === "delete") {
    if (!confirm(`Permanently delete ${user.email}?\n\nThis removes the company's Firestore data AND attempts to remove the Firebase Auth account.`)) return;
    try {
      let authRemoved = false, authError = "";
      try {
        const res = await deleteAuthUserFn({ uid });
        authRemoved = !!(res && res.data && res.data.ok);
      } catch (err) {
        authError = err.code || err.message || "unknown";
      }
      await deleteDoc(doc(db, "users", uid));
      await deleteDoc(doc(db, "companies", uid)).catch(() => {});
      await logAdminAction("delete-rejected-company", {
        uid, email: user.email, authRemoved, authError,
      });
      if (!authRemoved) {
        showAdminNotice(
          "Auth account not deleted",
          "Firestore removed. The Firebase Auth account could not be " +
          "deleted automatically (" + (authError || "unknown") + ") — remove " +
          user.email + " manually from Firebase console → Authentication."
        );
      } else {
        showAdminNotice(
          "Company deleted",
          user.email + " has been removed. Their Firebase Auth account and all Firestore data are gone."
        );
      }
    } catch (err) {
      showAdminNotice("Delete failed", err.message || String(err));
    }
  }
});

// support panel

function renderSupport() {
  const tbody = document.querySelector("#supportTable tbody");
  if (!tbody) return;

  const statusFilter = $("supportStatusFilter").value;
  const rows = supportMsgs.filter((m) => {
    if (statusFilter === "open")     return !m.resolvedAt;
    if (statusFilter === "resolved") return !!m.resolvedAt;
    return true;
  });

  $("supportCount").textContent = `${rows.length} ${statusFilter || "total"}`;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="admin-hint">Nothing here. Nice.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map((m) => {
    const preview = (m.message || "").slice(0, 80);
    const resolved = !!m.resolvedAt;
    const senderUser = m.uid ? users.find((u) => u.uid === m.uid) : null;
    const roleRaw = m.role || senderUser?.role || "";
    const roleKey = ["admin","company","dev","student"].includes(roleRaw) ? roleRaw : "student";
    const roleLabel = roleKey === "admin"   ? "Admin"
                    : roleKey === "company" ? "Company"
                    : roleKey === "dev"     ? "Dev"
                    : "Student";
    return `
      <tr data-id="${esc(m.id)}">
        <td>
          <div class="admin-mono">${esc(m.email || "—")}</div>
          <span class="admin-badge admin-badge--role-${roleKey}">${esc(roleLabel)}</span>
        </td>
        <td style="max-width:420px">${esc(preview)}${(m.message || "").length > 80 ? "…" : ""}</td>
        <td class="admin-mono">${fmtDate(m.createdAt)}</td>
        <td>${resolved
          ? `<span class="admin-badge admin-badge--ok">Resolved</span>`
          : `<span class="admin-badge admin-badge--warn">Open</span>`}</td>
        <td style="text-align:right;white-space:nowrap">
          <button class="admin-btn is-primary" data-sact="open" data-id="${esc(m.id)}">Open</button>
        </td>
      </tr>
    `;
  }).join("");
}

document.querySelector("#supportTable").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-sact=open]");
  if (!btn) return;
  const m = supportMsgs.find((x) => x.id === btn.dataset.id);
  if (m) openSupportModal(m);
});
$("supportStatusFilter")?.addEventListener("change", renderSupport);

function paintSupportBadge() {
  const badge = $("adminSupportBadge");
  if (!badge) return;
  const open = supportMsgs.filter((m) => !m.resolvedAt).length;
  if (open > 0) { badge.hidden = false; badge.textContent = open; }
  else          { badge.hidden = true; }
}

// support reply modal

let modalMsg = null;

function openSupportModal(m) {
  modalMsg = m;
  $("sm_subject").textContent = "Support message from " + (m.email || "(unknown)");
  $("sm_meta").textContent = `Received ${fmtDate(m.createdAt)} · uid: ${m.uid || "—"}`;
  $("sm_body").textContent = m.message || "(empty)";
  $("sm_reply").value = "";
  $("supportModal").hidden = false;
}
function closeSupportModal() {
  modalMsg = null;
  $("supportModal").hidden = true;
}

$("sm_close")?.addEventListener("click", closeSupportModal);
$("supportModal")?.addEventListener("click", (e) => {
  if (e.target.id === "supportModal") closeSupportModal();
});

$("sm_resolve")?.addEventListener("click", async () => {
  if (!modalMsg) return;
  await updateDoc(doc(db, "supportMessages", modalMsg.id), {
    resolvedAt: serverTimestamp(),
    resolvedBy: CURRENT_UID,
  });
  await logAdminAction("support-resolve", { msgId: modalMsg.id, email: modalMsg.email });
  closeSupportModal();
});

$("sm_send")?.addEventListener("click", async () => {
  if (!modalMsg) return;
  const reply = $("sm_reply").value.trim();
  if (!reply) return alert("Reply is empty — use 'Mark resolved' if no reply is needed.");

  await updateDoc(doc(db, "supportMessages", modalMsg.id), {
    resolvedAt: serverTimestamp(),
    resolvedBy: CURRENT_UID,
    adminReply: reply,
  });
  if (modalMsg.uid) {
    await addDoc(collection(db, "notifications"), {
      studentId: modalMsg.uid,
      message: `Reply from InternSphere support: ${reply}`,
      kind: "support-reply",
      senderUid:  CURRENT_UID,
      senderRole: "admin",
      senderName: "InternSphere Support",
      isRead: false,
      createdAt: serverTimestamp(),
    });
  }
  await logAdminAction("support-reply", { msgId: modalMsg.id, email: modalMsg.email });
  closeSupportModal();
});

// moderation panel

const targetCache   = new Map();
const targetInflight = new Set();

async function enrichTarget(report) {
  const key = `${report.targetType}:${report.targetId}`;
  if (targetCache.has(key) || targetInflight.has(key)) return;
  targetInflight.add(key);
  try {
    if (report.targetType === "internship") {
      const s = await getDoc(doc(db, "internships", report.targetId));
      const d = s.exists() ? s.data() : null;
      targetCache.set(key, d ? {
        type: "internship",
        data: {
          title:       d.title || "(untitled)",
          companyName: d.companyName || d.company || "(unknown company)",
          companyId:   d.companyId || "",
        },
      } : { type: "internship", data: null });
    } else if (report.targetType === "submission") {
      const sSnap = await getDoc(doc(db, "taskSubmissions", report.targetId));
      const sub = sSnap.exists() ? sSnap.data() : null;
      let studentName = "";
      let internshipTitle = "";
      let companyName = "";
      let companyId = sub?.companyId || "";
      if (sub) {
        const [stuSnap, intSnap] = await Promise.all([
          sub.studentId    ? getDoc(doc(db, "students", sub.studentId))         : Promise.resolve(null),
          sub.internshipId ? getDoc(doc(db, "internships", sub.internshipId))  : Promise.resolve(null),
        ]);
        if (stuSnap?.exists?.()) studentName = stuSnap.data().name || "";
        if (intSnap?.exists?.()) {
          const idata = intSnap.data();
          internshipTitle = idata.title || "";
          companyName     = idata.companyName || idata.company || companyName;
          companyId       = idata.companyId   || companyId;
        }
      }
      targetCache.set(key, sub ? {
        type: "submission",
        data: {
          studentUid:      sub.studentId || "",
          studentName:     studentName || "(unknown student)",
          internshipTitle: internshipTitle || "(untitled role)",
          companyName:     companyName || "(unknown company)",
          companyId:       companyId || "",
        },
      } : { type: "submission", data: null });
    }
    renderModeration();
  } catch (err) {
    console.warn("[admin-mod] enrich failed for", key, err);
    targetCache.set(key, { type: report.targetType, data: null });
  } finally {
    targetInflight.delete(key);
  }
}

function renderTargetCell(r) {
  const key = `${r.targetType}:${r.targetId}`;
  const hit = targetCache.get(key);

  if (!hit) {
    enrichTarget(r);
    return `<span class="admin-mono" style="opacity:0.6">${esc(r.targetType)} · ${esc(r.targetId.slice(0, 10))}…</span>`;
  }
  if (!hit.data) {
    return `<span style="color:var(--text3)"><i>${esc(r.targetType)} no longer exists</i></span>
            <div class="admin-mono" style="font-size:0.75rem;opacity:0.55">id: ${esc(r.targetId)}</div>`;
  }

  if (hit.type === "internship") {
    const d = hit.data;
    return `
      <div><b>${esc(d.title)}</b></div>
      <div style="font-size:0.8rem;color:var(--text2);margin-top:2px">
        Company: <b>${esc(d.companyName)}</b>
        ${d.companyId ? `· <span class="admin-mono" style="opacity:0.65">${esc(d.companyId.slice(0, 10))}…</span>` : ""}
      </div>
      <div style="margin-top:6px">
        <a class="admin-btn"
           href="internship-detailss.html?id=${encodeURIComponent(r.targetId)}${d.companyId ? `&companyId=${encodeURIComponent(d.companyId)}` : ""}">View listing →</a>
      </div>
    `;
  }

  const d = hit.data;
  return `
    <div><b>${esc(d.studentName)}</b> — <i>${esc(d.internshipTitle)}</i></div>
    <div style="font-size:0.8rem;color:var(--text2);margin-top:2px">
      Company: <b>${esc(d.companyName)}</b>
    </div>
    <div class="admin-mono" style="font-size:0.72rem;opacity:0.55;margin-top:2px">
      sub: ${esc(r.targetId.slice(0, 14))}…
    </div>
  `;
}

function renderModeration() {
  const tbody = document.querySelector("#modTable tbody");
  if (!tbody) return;

  const filter = $("modStatusFilter")?.value ?? "open";
  const rows = reports.filter((r) => {
    if (filter === "open")     return !r.resolvedAt;
    if (filter === "resolved") return !!r.resolvedAt;
    return true;
  });

  $("modCount").textContent = `${rows.length} ${filter || "total"}`;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="admin-hint">No reports ${filter === "open" ? "open" : "to show"}.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map((r) => {
    const resolved = !!r.resolvedAt;

    const actions = resolved
      ? `<span class="admin-badge admin-badge--ok">${esc(r.resolution || "resolved")}</span>`
      : `
        <button class="admin-btn"           data-mact="dismiss"  data-id="${esc(r.id)}">Dismiss</button>
        <button class="admin-btn is-danger" data-mact="takedown" data-id="${esc(r.id)}">Take down</button>`;

    return `
      <tr data-id="${esc(r.id)}">
        <td style="min-width:280px">${renderTargetCell(r)}</td>
        <td class="admin-mono">${esc(r.reporterEmail || r.reporterUid || "—")}</td>
        <td style="max-width:360px">${esc((r.reason || "").slice(0, 180))}${(r.reason || "").length > 180 ? "…" : ""}</td>
        <td class="admin-mono">${fmtDate(r.createdAt)}</td>
        <td>${resolved
          ? `<span class="admin-badge admin-badge--ok">Resolved</span>`
          : `<span class="admin-badge admin-badge--warn">Open</span>`}</td>
        <td style="text-align:right;white-space:nowrap">${actions}</td>
      </tr>
    `;
  }).join("");
}

$("modStatusFilter")?.addEventListener("change", renderModeration);

document.querySelector("#modTable").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-mact]");
  if (!btn) return;
  const r = reports.find((x) => x.id === btn.dataset.id);
  if (!r) return;
  const act = btn.dataset.mact;

  if (act === "dismiss") {
    if (!confirm("Dismiss this report? (No action taken against the target.)")) return;
    await updateDoc(doc(db, "reports", r.id), {
      resolvedAt: serverTimestamp(),
      resolvedBy: CURRENT_UID,
      resolution: "dismissed",
    });
    await logAdminAction("mod-dismiss", { reportId: r.id, targetType: r.targetType, targetId: r.targetId });
  }

  if (act === "takedown") {
    if (!confirm(`Take down this ${r.targetType}?\n\nThis DELETES the target document permanently.`)) return;
    let takedownError = "";
    try {
      const coll = r.targetType === "submission" ? "taskSubmissions" : "internships";
      await deleteDoc(doc(db, coll, r.targetId));
    } catch (err) {
      takedownError = err.code || err.message || "unknown";
      console.warn("[admin-moderation] takedown failed:", err);
    }
    await updateDoc(doc(db, "reports", r.id), {
      resolvedAt: serverTimestamp(),
      resolvedBy: CURRENT_UID,
      resolution: "taken-down",
      takedownError: takedownError || null,
    });
    await logAdminAction("mod-takedown", {
      reportId: r.id, targetType: r.targetType, targetId: r.targetId,
      error: takedownError || null,
    });
    if (takedownError) {
      alert(`Report closed but the target could not be deleted (${takedownError}). Check the target doc manually.`);
    }
  }
});

function paintModerationBadge() {
  const badge = $("adminModerationBadge");
  if (!badge) return;
  const open = reports.filter((r) => !r.resolvedAt).length;
  if (open > 0) { badge.hidden = false; badge.textContent = open; }
  else          { badge.hidden = true; }
}

// audit log

async function logAdminAction(type, detail) {
  try {
    await addDoc(collection(db, "adminActions"), {
      type,
      detail: detail || {},
      actor: CURRENT_UID || "unknown",
      at: serverTimestamp(),
    });
  } catch (err) {
    console.warn("[admin] audit log failed:", err);
  }
}

// profile picture
(function initAdminProfilePic() {
  const chip    = $("adminProfileChip");
  const modal   = $("adminProfileModal");
  const preview = $("ap_preview");
  const file    = $("ap_file");
  const meta    = $("ap_meta");
  const btnClose  = $("ap_close");
  const btnSave   = $("ap_save");
  const btnRemove = $("ap_remove");
  if (!chip || !modal) return;

  let pendingPic = null;
  let originalPic = "";

  function setPreview(url, initial) {
    if (url) {
      preview.style.backgroundImage = `url("${url}")`;
      preview.textContent = "";
    } else {
      preview.style.backgroundImage = "";
      preview.textContent = (initial || "A").charAt(0).toUpperCase();
    }
  }

  async function openModal() {
    if (!CURRENT_UID) return;
    let cur = "";
    try {
      const u = await getDoc(doc(db, "users", CURRENT_UID));
      if (u.exists()) cur = u.data().profilePic || "";
    } catch (_) { }
    originalPic = cur;
    pendingPic = null;
    meta.textContent = `${CURRENT_ADMIN_NAME} · ${CURRENT_ADMIN_EMAIL}`;
    setPreview(cur, CURRENT_ADMIN_NAME);
    file.value = "";
    modal.hidden = false;
  }

  function closeModal() {
    modal.hidden = true;
    pendingPic = null;
  }

  chip.addEventListener("click", openModal);
  chip.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openModal(); }
  });
  btnClose?.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  file?.addEventListener("change", async () => {
    const f = file.files?.[0];
    if (!f) return;
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) {
      alert("Please pick a PNG, JPG, or WebP image.");
      return;
    }
    if (f.size > 2 * 1024 * 1024) {
      alert("Image is larger than 2 MB. Please pick something smaller.");
      return;
    }
    try {
      const url = await readAsDataUrl(f);
      const shrunk = f.size > 900 * 1024 ? await downscale(url, 384) : url;
      pendingPic = shrunk;
      setPreview(shrunk, CURRENT_ADMIN_NAME);
    } catch (err) {
      console.warn("[admin-profile-pic] read failed:", err);
      alert("Couldn't read that image.");
    }
  });

  btnSave?.addEventListener("click", async () => {
    if (!CURRENT_UID) return;
    if (pendingPic === null) { closeModal(); return; }
    try {
      await updateDoc(doc(db, "users", CURRENT_UID), { profilePic: pendingPic });
      paintAdminAvatar(pendingPic, CURRENT_ADMIN_NAME);
      await logAdminAction("update-profile-pic", { size: pendingPic.length });
      closeModal();
    } catch (err) {
      console.error("[admin-profile-pic] save failed:", err);
      alert("Save failed: " + (err.message || err));
    }
  });

  btnRemove?.addEventListener("click", async () => {
    if (!CURRENT_UID) return;
    if (!confirm("Remove your profile picture?")) return;
    try {
      await updateDoc(doc(db, "users", CURRENT_UID), { profilePic: "" });
      paintAdminAvatar("", CURRENT_ADMIN_NAME);
      pendingPic = null;
      originalPic = "";
      setPreview("", CURRENT_ADMIN_NAME);
      await logAdminAction("remove-profile-pic", {});
    } catch (err) {
      console.error("[admin-profile-pic] remove failed:", err);
      alert("Remove failed: " + (err.message || err));
    }
  });

  function readAsDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload  = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }

  function downscale(dataUrl, max) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        try { resolve(c.toDataURL("image/jpeg", 0.82)); }
        catch (e) { reject(e); }
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }
})();

// broadcast
(function initBroadcast() {
  const openBtn  = $("openBroadcastBtn");
  const modal    = $("broadcastModal");
  const closeBtn = $("bc_close");
  const sendBtn  = $("bc_send");
  const meta     = $("bc_meta");
  const audSel   = $("bc_audience");
  const msgEl    = $("bc_message");
  if (!openBtn || !modal) return;

  function countAudience(kind) {
    if (kind === "students")  return users.filter((u) => u.role === "student" || u.role === "dev").length;
    if (kind === "companies") return users.filter((u) => u.role === "company").length;
    return users.filter((u) => u.role !== "admin").length;
  }
  function paintMeta() {
    meta.textContent = `Audience: ${countAudience(audSel.value)} recipient(s)`;
  }
  function open() {
    msgEl.value = "";
    audSel.value = "everyone";
    paintMeta();
    modal.hidden = false;
  }
  function close() { modal.hidden = true; }

  openBtn.addEventListener("click", open);
  closeBtn?.addEventListener("click", close);
  audSel?.addEventListener("change", paintMeta);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

  sendBtn?.addEventListener("click", async () => {
    const msg = (msgEl.value || "").trim();
    if (!msg) return alert("Write a message first.");

    const kind = audSel.value;
    const targets = users.filter((u) => {
      if (u.role === "admin") return false;
      if (kind === "students")  return u.role === "student" || u.role === "dev";
      if (kind === "companies") return u.role === "company";
      return true;
    });

    if (!targets.length) return alert("No matching recipients.");
    if (!confirm(`Send this message to ${targets.length} recipient(s)?\n\n"${msg.slice(0, 140)}${msg.length > 140 ? "…" : ""}"`)) return;

    sendBtn.disabled = true;
    sendBtn.textContent = "Sending…";

    try {
      const CHUNK = 450;
      let sent = 0;
      for (let i = 0; i < targets.length; i += CHUNK) {
        const slice = targets.slice(i, i + CHUNK);
        const batch = writeBatch(db);
        slice.forEach((u) => {
          const ref = doc(collection(db, "notifications"));
          batch.set(ref, {
            studentId:  u.uid,
            message:    msg,
            kind:       "broadcast",
            senderUid:  CURRENT_UID,
            senderRole: "admin",
            senderName: "InternSphere Admin",
            isRead:     false,
            createdAt:  serverTimestamp(),
          });
        });
        await batch.commit();
        sent += slice.length;
      }

      await logAdminAction("broadcast", { audience: kind, recipients: sent, preview: msg.slice(0, 140) });
      alert(`Sent to ${sent} recipient(s).`);
      close();
    } catch (err) {
      console.error("[admin-broadcast]", err);
      alert("Broadcast failed: " + (err.message || err));
    } finally {
      sendBtn.disabled = false;
      sendBtn.textContent = "Send broadcast";
    }
  });
})();

// logout

(function () {
  const btn     = $("adminLogoutBtn");
  const modal   = $("adminLogoutModal");
  const cancel  = $("adminLogoutCancel");
  const confirmBtn = $("adminLogoutConfirm");
  if (!btn || !modal || !cancel || !confirmBtn) return;

  const open  = () => { modal.hidden = false; document.body.classList.add("modal-open"); };
  const close = () => { modal.hidden = true;  document.body.classList.remove("modal-open"); };

  btn.addEventListener("click", open);
  cancel.addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
  document.addEventListener("keydown", (e) => { if (!modal.hidden && e.key === "Escape") close(); });

  confirmBtn.addEventListener("click", async () => {
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Signing out…";
    const theme = localStorage.getItem("theme");
    const legacy = localStorage.getItem("internsphere_theme");
    try { await signOut(auth); } catch (_) {}
    localStorage.clear();
    if (theme)  localStorage.setItem("theme", theme);
    if (legacy) localStorage.setItem("internsphere_theme", legacy);
    window.location.href = "Index.html";
  });
})();
