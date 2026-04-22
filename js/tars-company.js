// js/tars-company.js

import { auth, db } from "../firebase/firebase.js";
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import {
  askGemini,
  askGeminiJson,
  analyzePdf,
  friendlyGeminiError,
} from "./gemini.js";
import {
  composeSystemPrompt,
  loadHistory,
  saveHistory,
  clearHistory,
} from "./tars-core.js";
import { esc } from "./lib/escape.js";

const $ = (id) => document.getElementById(id);

// state
let currentUid = null;
let companyName = "";
let apps = [];
let internships = [];

let menuMode = "root";
let menuPendingAction = null;

// CV summary cache
const CVSUM_KEY = (appId, size) => `is.cvsum.${appId}.${size || 0}`;

function loadCvSummary(appId, size) {
  try {
    const raw = localStorage.getItem(CVSUM_KEY(appId, size));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function saveCvSummary(appId, size, obj) {
  try { localStorage.setItem(CVSUM_KEY(appId, size), JSON.stringify(obj)); } catch {}
}

// system prompt
function buildSystemPrompt() {
  const now = new Date();
  const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);

  const openRoles   = internships.filter((i) => (i.status || 'Open') === 'Open');
  const pending     = apps.filter((a) => (a.status || 'Pending') === 'Pending');
  const approved    = apps.filter((a) => a.status === 'Approved');
  const shortlisted = apps.filter((a) => a.status === 'Shortlisted');
  const rejected    = apps.filter((a) => a.status === 'Rejected');
  const thisWeek    = apps.filter((a) => { const d = humanDateFromApp(a); return d && d >= weekAgo; });

  const rolesSummary = openRoles.map((r) => {
    const count = apps.filter((a) => a.internshipId === r.id).length;
    return '  • ' + r.title + ' (' + count + ' applicant' + (count === 1 ? '' : 's') + ', ' + (r.location || '—') + ')';
  }).join('
') || '  (none)';

  const state = [
    companyName && ('Company: ' + companyName),
    'Today: ' + now.toDateString(),
    'Open roles: ' + openRoles.length + ' / total posted: ' + internships.length,
    openRoles.length > 0 ? ('Open roles detail:
' + rolesSummary) : null,
    'Total applications: ' + apps.length,
    '  — Pending: ' + pending.length,
    '  — Shortlisted: ' + shortlisted.length,
    '  — Approved: ' + approved.length,
    '  — Rejected: ' + rejected.length,
    'Applications this week: ' + thisWeek.length,
  ].filter(Boolean).join('
');

  const pageLines = [
    'User is a company recruiter on the InternSphere dashboard.',
    'The LIVE HIRING DATA above is fetched fresh from the database — use these exact numbers when answering questions about applications or roles.',
    'Keep responses actionable and numerical when possible.',
    'When ranking candidates, include a brief reasoning per candidate.',
    'Always label AI-suggested ranking as non-authoritative — the recruiter makes the final call.',
  ].join('
');

  return composeSystemPrompt({
    studentName: companyName,
    studentState: state,
    pageContext: pageLines,
  });
}
// data loading
async function refreshData(uid) {
  try {
    const intSnap = await getDocs(query(
      collection(db, "internships"),
      where("companyId", "==", uid),
    ));
    internships = intSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn("[tars-company] internships:", e);
  }

  try {
    const appsSnap = await getDocs(query(
      collection(db, "applications"),
      where("companyId", "==", uid),
    ));
    apps = appsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn("[tars-company] apps:", e);
  }
}

// UI helpers
function appendMsg(htmlOrText, from = "bot", { html = false } = {}) {
  const thread = $("coTarsChatThread");
  if (!thread) return null;
  const el = document.createElement("div");
  el.className = "tars-chat-msg tars-chat-msg-" + from;
  if (html) el.innerHTML = htmlOrText;
  else el.textContent = htmlOrText;
  thread.appendChild(el);
  thread.scrollTop = thread.scrollHeight;
  return el;
}

function appendTyping() {
  const thread = $("coTarsChatThread");
  if (!thread) return null;
  const el = document.createElement("div");
  el.className = "tars-chat-msg tars-chat-msg-bot tars-chat-msg-typing";
  thread.appendChild(el);
  thread.scrollTop = thread.scrollHeight;
  return el;
}

function showError(msg) {
  const thread = $("coTarsChatThread");
  if (!thread) return;
  const el = document.createElement("div");
  el.className = "tars-chat-msg tars-chat-msg-bot";
  el.style.borderColor = "rgba(239,68,68,0.35)";
  el.style.color = "#fca5a5";
  el.textContent = "⚠ " + msg;
  thread.appendChild(el);
  thread.scrollTop = thread.scrollHeight;
}

function openChat() {
  $("coTarsModal")?.classList.add("is-open");
  setTimeout(() => $("coTarsChatInput")?.focus(), 80);
}
function closeChat() {
  $("coTarsModal")?.classList.remove("is-open");
}

// dropdown menu
const ROOT_ACTIONS = [
  { id: "today",     ico: "📊", label: "Today's applications",                sub: "count + breakdown by role" },
  { id: "weekly",    ico: "📈", label: "This week's hiring snapshot",          sub: "totals by status" },
  { id: "stale",     ico: "⏰", label: "Pending reviews over 48 hours",        sub: "applications needing action" },
  { id: "recent",    ico: "🆕", label: "Recent applicants (last 10)",          sub: "across all roles" },
  { id: "skill",     ico: "🎯", label: "Skill coverage for a role",            sub: "pick a role → see skills vs required", multi: true },
  { id: "promising", ico: "⭐", label: "Find promising applicants",            sub: "pick a role → AI ranks applicants",    multi: true },
  { id: "interview", ico: "🤝", label: "Who to interview next",                sub: "top 3 pending, any role" },
  { id: "custom",    ico: "✎",  label: "Custom message",                      sub: "ask me anything", custom: true },
];

function renderRootMenu() {
  const sugg = $("coTarsSuggest");
  if (!sugg) return;
  menuMode = "root";
  menuPendingAction = null;
  sugg.innerHTML =
    `<div class="tars-suggest-title"><span class="tars-suggest-spark">✦</span> Quick actions</div>` +
    ROOT_ACTIONS.map((a) => `
      <button type="button" class="tars-suggest-item ${a.custom ? "tars-suggest-custom" : ""}" data-action="${a.id}">
        <span class="tars-suggest-ico">${a.ico}</span>
        <span style="display:flex;flex-direction:column;gap:2px;min-width:0">
          <span style="font-weight:700">${esc(a.label)}</span>
          <span style="font-size:0.7rem;opacity:0.6;font-weight:500">${esc(a.sub)}</span>
        </span>
      </button>
    `).join("");
  wireMenuClicks();
}

function renderRoleMenu(action) {
  const sugg = $("coTarsSuggest");
  if (!sugg) return;
  menuMode = `role:${action}`;
  menuPendingAction = action;

  const roles = internships.slice().sort((a, b) => (a.status === "Open" ? -1 : 1));
  if (!roles.length) {
    sugg.innerHTML = `
      <div class="tars-suggest-title"><span class="tars-suggest-spark">✦</span> Pick a role</div>
      <div style="padding:14px 10px;color:rgba(255,255,255,0.55);font-size:0.85rem">
        You haven't posted any roles yet.
      </div>
      <button type="button" class="tars-suggest-item tars-suggest-custom" data-back="1">
        <span class="tars-suggest-ico">←</span> Back
      </button>
    `;
  } else {
    sugg.innerHTML =
      `<div class="tars-suggest-title"><span class="tars-suggest-spark">✦</span> Pick a role</div>` +
      roles.map((r) => {
        const count = apps.filter((a) => a.internshipId === r.id).length;
        const statusTag = (r.status && r.status !== "Open")
          ? ` <span style="font-size:0.68rem;padding:1px 6px;border-radius:999px;background:rgba(255,255,255,0.08);margin-left:6px">${esc(r.status)}</span>`
          : "";
        return `
          <button type="button" class="tars-suggest-item" data-role="${esc(r.id)}">
            <span class="tars-suggest-ico">📌</span>
            <span style="display:flex;flex-direction:column;gap:2px;min-width:0;flex:1">
              <span style="font-weight:700">${esc(r.title)}${statusTag}</span>
              <span style="font-size:0.7rem;opacity:0.65">${count} applicant${count === 1 ? "" : "s"} · ${esc(r.location || "—")}</span>
            </span>
          </button>`;
      }).join("") +
      `<button type="button" class="tars-suggest-item tars-suggest-custom" data-back="1">
        <span class="tars-suggest-ico">←</span> Back
      </button>`;
  }
  wireMenuClicks();
}

function wireMenuClicks() {
  $("coTarsSuggest")?.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", () => handleRootAction(btn.getAttribute("data-action")));
  });
  $("coTarsSuggest")?.querySelectorAll("[data-role]").forEach((btn) => {
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", () => handleRoleSelection(btn.getAttribute("data-role")));
  });
  $("coTarsSuggest")?.querySelectorAll("[data-back]").forEach((btn) => {
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", () => {
      renderRootMenu();
    });
  });
}

function handleRootAction(id) {
  const action = ROOT_ACTIONS.find((a) => a.id === id);
  if (!action) return;
  hideSuggest();

  if (action.custom) {
    $("coTarsChatInput")?.focus();
    return;
  }
  if (action.multi) {
    showSuggest();
    renderRoleMenu(id);
    return;
  }
  executeAction(id);
}

function handleRoleSelection(roleId) {
  const action = menuPendingAction;
  hideSuggest();
  renderRootMenu();
  if (!action || !roleId) return;
  executeAction(action, { roleId });
}

function showSuggest() { $("coTarsSuggest")?.classList.remove("is-hidden"); }
function hideSuggest() { $("coTarsSuggest")?.classList.add("is-hidden"); }

// actions
// Returns a Date from an application object, preferring the numeric
// appliedAtMs timestamp (reliable) over the locale-string appliedAt field
// (unreliable across locales). Falls back gracefully.
function humanDateFromApp(app) {
  if (!app) return null;
  if (typeof app.appliedAtMs === "number" && !isNaN(app.appliedAtMs)) {
    return new Date(app.appliedAtMs);
  }
  if (app.appliedAt) {
    const d = new Date(app.appliedAt);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

// Legacy string-only variant (kept for callers that pass raw strings)
function humanDateString(str) {
  if (!str) return null;
  const d = new Date(str);
  if (isNaN(d.getTime())) return null;
  return d;
}

async function executeAction(id, opts = {}) {
  if (currentUid) await refreshData(currentUid);

  switch (id) {
    case "today":     return actionToday();
    case "weekly":    return actionWeekly();
    case "stale":     return actionStale();
    case "recent":    return actionRecent();
    case "skill":     return actionSkillCoverage(opts.roleId);
    case "promising": return actionPromising(opts.roleId);
    case "interview": return actionInterviewNext();
  }
}

function actionToday() {
  const now = new Date();
  const today = apps.filter((a) => {
    const d = humanDateFromApp(a);
    return d && sameDay(d, now);
  });
  if (!today.length) {
    appendMsg("No new applications today — yet.", "bot");
    return;
  }
  const byRole = {};
  for (const a of today) {
    const role = a.role || "General";
    byRole[role] = (byRole[role] || 0) + 1;
  }
  const breakdown = Object.entries(byRole)
    .sort((a, b) => b[1] - a[1])
    .map(([r, n]) => `<li>${esc(r)} — <strong>${n}</strong></li>`)
    .join("");
  appendMsg(
    `<strong>${today.length} application${today.length === 1 ? "" : "s"} today.</strong>` +
    `<ul style="padding-left:18px;margin:6px 0 0">${breakdown}</ul>`,
    "bot",
    { html: true },
  );
}

function actionWeekly() {
  const now = new Date();
  const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
  const week = apps.filter((a) => {
    const d = humanDateFromApp(a);
    return d && d >= weekAgo;
  });
  const total   = week.length;
  const pending = week.filter((a) => (a.status || "Pending") === "Pending").length;
  const approved    = week.filter((a) => a.status === "Approved").length;
  const shortlisted = week.filter((a) => a.status === "Shortlisted").length;
  const rejected    = week.filter((a) => a.status === "Rejected").length;

  appendMsg(
    `<strong>Last 7 days</strong>` +
    `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px;font-size:0.85rem">` +
      statChip("Total", total, "#7c6bff") +
      statChip("Pending", pending, "#f59e0b") +
      statChip("Approved", approved, "#22c55e") +
      statChip("Shortlisted", shortlisted, "#a855f7") +
      statChip("Rejected", rejected, "#ef4444") +
    `</div>`,
    "bot",
    { html: true },
  );
}

function statChip(label, val, color) {
  return `<div style="padding:8px 10px;border-radius:10px;background:${color}1a;border:1px solid ${color}44">
    <div style="font-size:0.68rem;text-transform:uppercase;letter-spacing:0.08em;opacity:0.75">${esc(label)}</div>
    <div style="font-weight:900;font-size:1.2rem;color:${color};font-family:ui-monospace,monospace">${val}</div>
  </div>`;
}

function actionStale() {
  const now = new Date();
  const cutoff = new Date(now); cutoff.setHours(cutoff.getHours() - 48);
  const stale = apps.filter((a) => {
    if ((a.status || "Pending") !== "Pending") return false;
    const d = humanDateFromApp(a);
    return d && d <= cutoff;
  });
  if (!stale.length) {
    appendMsg("All pending applications are under 48 hours old — nothing stale.", "bot");
    return;
  }
  const rows = stale
    .slice(0, 12)
    .map((a) => applicantCardHtml(a, { subtitle: `Pending since ${esc(a.appliedAt || "—")}` }))
    .join("");
  appendMsg(
    `<strong>${stale.length} pending application${stale.length === 1 ? "" : "s"} over 48 hours.</strong>` +
    `<div class="tars-card-list">${rows}</div>`,
    "bot",
    { html: true },
  );
}

function actionRecent() {
  if (!apps.length) {
    appendMsg("No applications yet.", "bot");
    return;
  }
  const recent = apps
    .slice()
    .sort((a, b) => {
      const da = humanDateFromApp(a) || 0;
      const db = humanDateFromApp(b) || 0;
      return db - da;
    })
    .slice(0, 10);
  const rows = recent.map((a) => applicantCardHtml(a)).join("");
  appendMsg(
    `<strong>Last 10 applications</strong>` +
    `<div class="tars-card-list">${rows}</div>`,
    "bot",
    { html: true },
  );
}

function actionSkillCoverage(roleId) {
  const role = internships.find((r) => r.id === roleId);
  if (!role) return showError("Role not found.");
  const required = (role.skills || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const roleApps = apps.filter((a) => a.internshipId === roleId);
  if (!roleApps.length) {
    appendMsg(`No applications yet for <strong>${esc(role.title)}</strong>.`, "bot", { html: true });
    return;
  }

  if (!required.length) {
    appendMsg(
      `No required skills are listed on <strong>${esc(role.title)}</strong>. Add skills to the role to enable coverage analysis.`,
      "bot",
      { html: true },
    );
    return;
  }

  const typing = appendTyping();
  (async () => {
    const studentSkills = await Promise.all(roleApps.map((a) => fetchStudentSkills(a.studentId)));
    typing?.remove();

    const skillCount = {};
    for (const arr of studentSkills) {
      for (const s of arr || []) {
        const key = s.toLowerCase();
        skillCount[key] = (skillCount[key] || 0) + 1;
      }
    }
    const total = roleApps.length;
    const coverage = required.map((s) => {
      const key = s.toLowerCase();
      const n = skillCount[key] || 0;
      return { skill: s, n, pct: total ? Math.round((n / total) * 100) : 0 };
    });

    const html =
      `<strong>Skill coverage · ${esc(role.title)}</strong> <span style="opacity:0.6">(${total} applicant${total === 1 ? "" : "s"})</span>` +
      `<div style="margin-top:8px;display:flex;flex-direction:column;gap:6px">` +
      coverage.map((c) => {
        const color = c.pct >= 50 ? "#22c55e" : c.pct >= 20 ? "#f59e0b" : "#ef4444";
        return `
          <div style="display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:8px;background:rgba(255,255,255,0.03)">
            <div style="flex:1;min-width:0;font-weight:700;font-size:0.86rem">${esc(c.skill)}</div>
            <div style="width:120px;height:6px;border-radius:999px;background:rgba(255,255,255,0.08);overflow:hidden">
              <div style="width:${c.pct}%;height:100%;background:${color}"></div>
            </div>
            <div style="font-family:ui-monospace,monospace;font-size:0.78rem;color:${color};min-width:60px;text-align:right">${c.n} / ${total}</div>
          </div>`;
      }).join("") +
      `</div>`;
    appendMsg(html, "bot", { html: true });
  })();
}

async function fetchStudentSkills(uid) {
  if (!uid) return [];
  try {
    const snap = await getDoc(doc(db, "students", uid));
    if (!snap.exists()) return [];
    const d = snap.data();
    return Array.isArray(d.skills) ? d.skills : [];
  } catch { return []; }
}

function actionInterviewNext() {
  const pending = apps.filter((a) => (a.status || "Pending") === "Pending");
  if (!pending.length) {
    appendMsg("No pending applications right now — all caught up.", "bot");
    return;
  }
  const sorted = pending.slice().sort((a, b) => {
    const da = humanDateFromApp(a) || 0;
    const db = humanDateFromApp(b) || 0;
    return da - db;
  }).slice(0, 3);

  const rows = sorted.map((a) => applicantCardHtml(a, {
    subtitle: `Pending · applied ${esc(a.appliedAt || "—")}`,
    badge: "Review next",
  })).join("");
  appendMsg(
    `<strong>Next 3 to review</strong> <span style="opacity:0.6">(oldest pending first)</span>` +
    `<div class="tars-card-list">${rows}</div>` +
    `<p style="font-size:0.78rem;opacity:0.65;margin:8px 0 0">Want AI ranking instead? Use <em>Find promising applicants</em> for a specific role.</p>`,
    "bot",
    { html: true },
  );
}

// promising applicants
const cvSummarySchema = {
  type: "object",
  properties: {
    name:     { type: "string" },
    headline: { type: "string", description: "One-line summary of candidate (role, year, college if visible)." },
    skills:   { type: "array", items: { type: "string" } },
    years:    { type: "integer", description: "Years of relevant experience inferable from CV, 0 for student-level." },
    projects: { type: "array", items: { type: "string" } },
    quality:  { type: "integer", minimum: 0, maximum: 100, description: "CV presentation quality (layout, clarity, specificity)." },
  },
  required: ["headline", "skills", "quality"],
};

async function cvToDataUrl(app) {
  if (app.cvData) return app.cvData;
  if (!app.cvUrl) return null;
  try {
    const res = await fetch(app.cvUrl);
    if (!res.ok) throw new Error("cv fetch " + res.status);
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn("[tars-company] cvToDataUrl:", e?.message);
    return null;
  }
}

async function summariseCv(app) {
  const dataUrl = await cvToDataUrl(app);
  if (!dataUrl) {
    return {
      name: app.name || (app.email || "").split("@")[0],
      headline: "No CV attached",
      skills: [],
      years: 0,
      projects: [],
      quality: 20,
    };
  }
  const cached = loadCvSummary(app.id, app.cvSize);
  if (cached) return cached;

  try {
    const summary = await analyzePdf(dataUrl, `Summarise this CV for a recruiter. Focus on skills, projects, and presentation quality. Return JSON only.`, {
      system: "You are a senior recruiter triaging student CVs. Be specific and terse.",
      schema: cvSummarySchema,
      temperature: 0.3,
      maxTokens: 2000,
    });
    saveCvSummary(app.id, app.cvSize, summary);
    return summary;
  } catch (e) {
    console.warn("[tars-company] summariseCv:", e?.message);
    return {
      name: app.name || (app.email || "").split("@")[0],
      headline: "CV could not be read",
      skills: [],
      years: 0,
      projects: [],
      quality: 30,
    };
  }
}

const rankingSchema = {
  type: "object",
  properties: {
    ranking: {
      type: "array",
      items: {
        type: "object",
        properties: {
          applicantId: { type: "string" },
          name:        { type: "string" },
          fitScore:    { type: "integer", minimum: 0, maximum: 100 },
          strengths:   { type: "array", items: { type: "string" } },
          gaps:        { type: "array", items: { type: "string" } },
          verdict:     { type: "string" },
        },
        required: ["applicantId", "fitScore", "verdict"],
      },
    },
    overview: { type: "string", description: "1-2 sentence summary of the pool." },
  },
  required: ["ranking"],
};

async function actionPromising(roleId) {
  const role = internships.find((r) => r.id === roleId);
  if (!role) return showError("Role not found.");
  const roleApps = apps.filter((a) => a.internshipId === roleId);
  if (!roleApps.length) {
    appendMsg(`No applications yet for <strong>${esc(role.title)}</strong>.`, "bot", { html: true });
    return;
  }

  const typing = appendTyping();
  const status = appendMsg(
    `<em>Reading ${roleApps.length} CV${roleApps.length === 1 ? "" : "s"} for <strong>${esc(role.title)}</strong>…</em>`,
    "bot",
    { html: true },
  );

  try {
    const CANDIDATE_CAP = 20;
    const sliced = roleApps.slice(0, CANDIDATE_CAP);

    const summaries = [];
    for (const app of sliced) {
      const s = await summariseCv(app);
      summaries.push({ ...s, applicantId: app.id, email: app.email, phone: app.phone, role: role.title });
    }
    typing?.remove();
    status?.remove();

    const roleBlock = [
      `Role: ${role.title}`,
      role.location && `Location: ${role.location}`,
      role.duration && `Duration: ${role.duration}`,
      role.skills && `Required skills: ${role.skills}`,
      role.desc && `Description: ${role.desc}`,
    ].filter(Boolean).join("\n");

    const candidateBlock = summaries.map((s) => {
      return `- applicantId=${s.applicantId} | name=${s.name || s.email || "(unknown)"} | headline=${s.headline} | skills=${(s.skills || []).join(", ")} | years=${s.years || 0} | quality=${s.quality || 0}`;
    }).join("\n");

    const data = await askGeminiJson({
      prompt: `Rank these candidates for the role. Fit score 0-100 = skills alignment × CV quality × relevance to role description. Give 2-4 concrete strengths and 1-3 gaps per candidate. Keep verdicts under 25 words. Return JSON only.\n\n--- ROLE ---\n${roleBlock}\n\n--- CANDIDATES ---\n${candidateBlock}`,
      system: "You are a senior recruiter ranking student interns. Be honest, specific, and concise. Note that this ranking is AI-suggested, not final.",
      schema: rankingSchema,
      temperature: 0.35,
      maxTokens: 4000,
    });

    renderRanking(role, data, roleApps.length);
  } catch (e) {
    typing?.remove();
    status?.remove();
    console.error("[tars-company] promising:", e);
    showError(friendlyGeminiError(e));
  }
}

function renderRanking(role, data, poolSize) {
  const ranked = (data.ranking || []).slice().sort((a, b) => (b.fitScore || 0) - (a.fitScore || 0));
  const cards = ranked.map((r) => {
    const app = apps.find((a) => a.id === r.applicantId);
    return rankedCardHtml(r, app);
  }).join("");
  const overview = data.overview
    ? `<p style="font-size:0.85rem;opacity:0.8;margin:0 0 10px">${esc(data.overview)}</p>`
    : "";
  appendMsg(
    `<strong>AI-suggested ranking · ${esc(role.title)}</strong> <span style="opacity:0.6">(${ranked.length} of ${poolSize})</span>` +
    `<div style="font-size:0.72rem;opacity:0.6;letter-spacing:0.06em;text-transform:uppercase;margin:4px 0 10px">Not authoritative — recruiter makes the final call</div>` +
    overview +
    `<div class="tars-card-list">${cards}</div>`,
    "bot",
    { html: true },
  );
}

function rankedCardHtml(rank, app) {
  const score = Math.max(0, Math.min(100, rank.fitScore || 0));
  const color = score >= 75 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";
  const bg = `${color}15`;
  const name = rank.name || app?.name || app?.email || "Applicant";
  const init = (name || "?").slice(0, 2).toUpperCase();
  return `
    <div class="tars-applicant-card">
      <div class="tars-applicant-head">
        <div class="tars-applicant-avatar" style="background:linear-gradient(135deg,#7c6bff,#a855f7)">${esc(init)}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:800;font-size:0.95rem">${esc(name)}</div>
          <div style="font-size:0.76rem;opacity:0.65;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(app?.email || "")}</div>
        </div>
        <div class="tars-applicant-score" style="background:${bg};color:${color};border-color:${color}55">
          ${score}<span style="opacity:0.6;font-weight:600">/100</span>
        </div>
      </div>
      ${rank.verdict ? `<p style="font-size:0.85rem;margin:8px 0 6px;line-height:1.5">${esc(rank.verdict)}</p>` : ""}
      ${listBlock("Strengths", rank.strengths, "#22c55e")}
      ${listBlock("Gaps", rank.gaps, "#f59e0b")}
      ${(app?.cvUrl || app?.cvData) ? `<a class="tars-applicant-cv" href="${esc(app.cvUrl || app.cvData)}" target="_blank" rel="noopener" download="${esc(app.cvName || "cv.pdf")}">📄 Download CV</a>` : ""}
    </div>`;
}

function listBlock(label, items, color) {
  if (!items?.length) return "";
  return `<div style="font-size:0.8rem;margin-top:6px">
    <div style="font-size:0.66rem;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:${color};margin-bottom:2px">${esc(label)}</div>
    <ul style="padding-left:18px;margin:0">${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
  </div>`;
}

function applicantCardHtml(app, opts = {}) {
  const name = app.name || app.email || "Applicant";
  const init = (name || "?").slice(0, 2).toUpperCase();
  const status = (app.status || "Pending");
  const color =
    status === "Approved" ? "#22c55e" :
    status === "Rejected" ? "#ef4444" :
    status === "Shortlisted" ? "#a855f7" : "#f59e0b";
  return `
    <div class="tars-applicant-card">
      <div class="tars-applicant-head">
        <div class="tars-applicant-avatar" style="background:linear-gradient(135deg,#7c6bff,#a855f7)">${esc(init)}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:800;font-size:0.9rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(name)}</div>
          <div style="font-size:0.74rem;opacity:0.65;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(app.role || "—")} · ${esc(opts.subtitle || status)}</div>
        </div>
        <span style="padding:3px 8px;border-radius:999px;background:${color}22;color:${color};border:1px solid ${color}55;font-size:0.7rem;font-weight:700">
          ${esc(opts.badge || status)}
        </span>
      </div>
      ${(app.cvUrl || app.cvData) ? `<a class="tars-applicant-cv" href="${esc(app.cvUrl || app.cvData)}" target="_blank" rel="noopener" download="${esc(app.cvName || "cv.pdf")}">📄 ${esc(app.cvName || "cv.pdf")}</a>` : ""}
    </div>`;
}

// freeform chat
async function sendFreeform(text) {
  appendMsg(text, "user");
  const typing = appendTyping();

  try {
    const reply = await askGemini({
      prompt: `User asked: ${text}\n\nContext about their hiring pool:\n` +
              `- Total applications: ${apps.length}\n` +
              `- Open roles: ${internships.filter((i) => (i.status || "Open") === "Open").map((i) => i.title).join(", ") || "none"}\n` +
              `- Pending applications: ${apps.filter((a) => (a.status || "Pending") === "Pending").length}\n` +
              `Answer concisely with useful hiring advice. If they're asking for data you don't have, tell them which dropdown action to pick.`,
      system: buildSystemPrompt(),
      history: loadHistory(currentUid).slice(-30),
      temperature: 0.6,
      maxTokens: 900,
    });
    typing?.remove();
    appendMsg(reply, "bot");
    const merged = loadHistory(currentUid).concat([
      { role: "user",  parts: [{ text }] },
      { role: "model", parts: [{ text: reply }] },
    ]);
    saveHistory(currentUid, merged);
  } catch (e) {
    typing?.remove();
    showError(friendlyGeminiError(e));
  }
}

// shared helpers
function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth() === b.getMonth() &&
         a.getDate() === b.getDate();
}

// wiring
function init() {
  $("coTarsOrb")?.addEventListener("click", () => {
    openChat();
    renderRootMenu();
  });
  $("coTarsChatClose")?.addEventListener("click", closeChat);
  $("coTarsModal")?.addEventListener("click", (e) => {
    if (e.target === $("coTarsModal")) closeChat();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $("coTarsModal")?.classList.contains("is-open")) closeChat();
  });

  const inputField = $("coTarsChatInput");
  const form = $("coTarsChatForm");
  let blurHideTimer = null;

  inputField?.addEventListener("focus", () => {
    clearTimeout(blurHideTimer);
    if (menuMode === "root") renderRootMenu();
    showSuggest();
  });
  inputField?.addEventListener("blur", () => {
    blurHideTimer = setTimeout(() => {
      const sugg = $("coTarsSuggest");
      if (!sugg || !sugg.contains(document.activeElement)) hideSuggest();
    }, 150);
  });

  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = inputField?.value?.trim();
    if (!v) return;
    inputField.value = "";
    hideSuggest();
    sendFreeform(v);
  });

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      if (currentUid) clearHistory(currentUid);
      currentUid = null;
      companyName = "";
      apps = [];
      internships = [];
      return;
    }
    currentUid = user.uid;
    try {
      const snap = await getDoc(doc(db, "companies", user.uid));
      if (snap.exists()) companyName = snap.data().companyName || snap.data().name || "";
    } catch {}
    await refreshData(user.uid);
    renderRootMenu();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
