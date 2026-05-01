// js/resume-analyzer.js  — upgraded AI Resume Analyzer
//
// Enhancements vs original:
//  1. Role-targeted analysis  — optional internship role dropdown
//  2. Section-by-section scores — Experience, Education, Skills, Projects, Formatting
//  3. Before/after rewrite suggestions — concrete diff pairs
//  4. Score history tracking  — sparkline across re-uploads
//  5. Gap-to-opportunity      — missing skills cross-referenced vs live listings
//  (TARS context enrichment is in tars.js via the shared Firestore student doc)

import { analyzePdf, friendlyGeminiError } from "./gemini.js";
import { auth, db } from "../firebase/firebase.js";
import {
  doc, getDoc, setDoc, collection, query, where, limit, getDocs, arrayUnion,
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";

const $ = (id) => document.getElementById(id);
const CACHE_KEY = "is.resumeAnalysis";

let currentUid  = null;
let selectedRole = null; // { id, title, skills[], description }

// ── Schema ───────────────────────────────────────────────────────────────────

const schema = {
  type: "object",
  properties: {
    atsScore:    { type: "integer", minimum: 0, maximum: 100 },
    skillsMatch: { type: "integer", minimum: 0, maximum: 100 },
    summary:     { type: "string" },
    detectedSkills: { type: "array", items: { type: "string" } },
    missingSkills:  { type: "array", items: { type: "string" } },
    improvements:   { type: "array", items: { type: "string" } },
    strengths:      { type: "array", items: { type: "string" } },
    sectionScores: {
      type: "object",
      properties: {
        experience:  { type: "integer", minimum: 0, maximum: 100 },
        education:   { type: "integer", minimum: 0, maximum: 100 },
        skills:      { type: "integer", minimum: 0, maximum: 100 },
        projects:    { type: "integer", minimum: 0, maximum: 100 },
        formatting:  { type: "integer", minimum: 0, maximum: 100 },
      },
    },
    rewrites: {
      type: "array",
      items: {
        type: "object",
        properties: {
          section: { type: "string" },
          before:  { type: "string" },
          after:   { type: "string" },
        },
      },
    },
    roleScore:    { type: "integer", minimum: 0, maximum: 100 },
    roleFeedback: { type: "string" },
  },
  required: ["atsScore", "skillsMatch", "summary", "detectedSkills", "improvements"],
};

// ── Prompts ──────────────────────────────────────────────────────────────────

const SYSTEM = `You are a senior technical recruiter and career coach reviewing student resumes for internship applications.
Rules:
• Be SPECIFIC — name concrete tools, frameworks, libraries, companies, actions. Never generic.
• Ground every recommendation in what the CV actually contains.
• For rewrites: "before" must be an exact line quoted from the CV; "after" must be the improved version.
• Tone: direct, constructive, no fluff.`;

function buildPrompt(role) {
  const roleBlock = role ? `
Target role (student is applying for this specific position):
  Title: ${role.title}
  Required skills: ${(role.skills || []).join(", ") || "not specified"}
  Description: ${(role.description || "").slice(0, 400)}
→ Score "roleScore" 0-100 for fit to THIS role.
→ Fill "roleFeedback" with 2-3 sentences on strengths/gaps vs this role.
` : "";

  return `Analyze the attached resume PDF for a student applying to tech / design / product internships.
${roleBlock}
Return JSON with:
  atsScore       — 0-100 ATS-compatibility (clean formatting, scannable, keyword-dense).
  skillsMatch    — 0-100 general internship relevance.
  summary        — 1 sentence verdict.
  detectedSkills — every concrete tool/language/framework (normalized: "JavaScript", "React", "Figma", "SQL").
  missingSkills  — 2-4 NAMED skills that would boost match (e.g. "Node.js", "TypeScript", "PostgreSQL").
  improvements   — 3 actionable edits referencing specific CV content. No filler.
  strengths      — 2-3 specific things done well.
  sectionScores  — { experience, education, skills, projects, formatting } each 0-100.
  rewrites       — 2-3 objects: { section, before (exact weak CV line), after (improved) }.
  ${role ? "roleScore    — fit vs the target role above.\n  roleFeedback  — 2-3 sentences on role-specific fit.\n" : ""}
Return JSON only.`;
}

// ── Loading stages ───────────────────────────────────────────────────────────

const STAGES = [
  { pct: 15, text: "Parsing PDF…" },
  { pct: 38, text: "Extracting skills & experience…" },
  { pct: 62, text: "Scoring sections…" },
  { pct: 84, text: "Writing personalised tips…" },
  { pct: 94, text: "Checking role fit…" },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function fmtList(arr) {
  return (arr || []).map((s) => `<li>${esc(s)}</li>`).join("");
}
function sectionColor(v) {
  return v >= 75 ? "#22c55e" : v >= 50 ? "#f59e0b" : "#ef4444";
}
function animateNumber(el, target, suffix = "") {
  if (!el) return;
  const start = parseInt(el.textContent, 10) || 0;
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / 900);
    el.textContent = Math.round(start + (target - start) * (1 - Math.pow(1 - k, 3))) + suffix;
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ── State ────────────────────────────────────────────────────────────────────

function setState(state) {
  $("raIdle").style.display    = state === "idle"    ? "" : "none";
  $("raLoading").style.display = state === "loading" ? "" : "none";
  $("raResult").style.display  = state === "result"  ? "" : "none";
  $("raError").style.display   = state === "error"   ? "" : "none";

  const chip = $("raChip");
  if (chip) {
    const map = {
      loading: ["ANALYZING", "rgba(245,158,11,0.18)", "#f59e0b"],
      result:  ["COMPLETE",  "rgba(34,197,94,0.18)",  "#22c55e"],
      error:   ["ERROR",     "rgba(239,68,68,0.18)",  "#ef4444"],
      idle:    ["READY",     "",                       ""],
    };
    const [txt, bg, col] = map[state] || map.idle;
    chip.textContent = txt;
    chip.style.background = bg;
    chip.style.color = col;
  }

  $("raClearBtn").style.display = (state === "result" || state === "error") ? "" : "none";
  $("raAnalyzeBtn").textContent = state === "idle" ? "Analyze resume" : "Re-analyze";
}

function animateLoading() {
  let i = 0;
  const bar = $("raLoadBar"), pct = $("raLoadPct"), step = $("raLoadStep");
  const tick = () => {
    if (!bar || i >= STAGES.length) return;
    const s = STAGES[i++];
    bar.style.width  = s.pct + "%";
    pct.textContent  = s.pct + "%";
    step.textContent = s.text;
  };
  tick();
  const timer = setInterval(() => { if (i >= STAGES.length) { clearInterval(timer); return; } tick(); }, 900);
  return timer;
}

// ── Render ───────────────────────────────────────────────────────────────────

function renderResult(data) {
  setState("result");

  const ats    = Math.max(0, Math.min(100, Number(data.atsScore)    || 0));
  const skills = Math.max(0, Math.min(100, Number(data.skillsMatch) || 0));

  // Sync KPI card + profile meta
  const atsPct  = Math.round(ats);
  const tarsAts = document.getElementById("tarsAtsScore");
  if (tarsAts) tarsAts.textContent = atsPct + "%";
  const userMeta = document.getElementById("userMeta");
  if (userMeta) userMeta.textContent = userMeta.textContent.replace(/\d+%\s*ATS/i, `${atsPct}% ATS`);

  animateNumber($("raAtsValBig"),    ats,    "%");
  animateNumber($("raSkillsValBig"), skills, "%");
  requestAnimationFrame(() => {
    $("raAtsBar").style.width    = ats    + "%";
    $("raSkillsBar").style.width = skills + "%";
  });

  const kpiCards = document.querySelectorAll(".kpi");
  const atsCard  = kpiCards[3];
  const tag = atsCard?.querySelector(".kpi-tag");
  if (tag && /ATS/i.test(tag.textContent || "")) {
    const valEl = atsCard.querySelector(".kpi-val");
    const subEl = atsCard.querySelector(".kpi-sub");
    if (valEl) { valEl.removeAttribute("data-value"); animateNumber(valEl, ats, ""); }
    if (subEl) subEl.textContent = `Skills match ${skills}%`;
  }

  // Role-fit bar
  const roleSection = $("raRoleSection");
  if (roleSection) {
    if (typeof data.roleScore === "number" && selectedRole) {
      const rs = Math.max(0, Math.min(100, Number(data.roleScore) || 0));
      roleSection.style.display = "";
      requestAnimationFrame(() => { const b = $("raRoleBar"); if (b) b.style.width = rs + "%"; });
      animateNumber($("raRoleVal"), rs, "%");
      const rn = $("raRoleName"); if (rn) rn.textContent = `Role Fit: ${esc(selectedRole.title)}`;
      const rf = $("raRoleFeedback"); if (rf && data.roleFeedback) rf.textContent = data.roleFeedback;
    } else {
      roleSection.style.display = "none";
    }
  }

  // Tip
  const missing = (data.missingSkills || []).slice(0, 3);
  $("raTip").innerHTML = missing.length
    ? `<span style="opacity:0.8">Boost your match by adding:</span> ` + missing.map((m) => `<b>${esc(m)}</b>`).join(" · ")
    : esc(data.summary || "Great resume overall.");

  // Section scores
  const ss = data.sectionScores || {};
  const SECTIONS = [["experience","Experience"],["education","Education"],["skills","Skills"],["projects","Projects"],["formatting","Formatting"]];
  const sectionHtml = SECTIONS.map(([key, label]) => {
    const val = typeof ss[key] === "number" ? Math.max(0, Math.min(100, ss[key])) : null;
    if (val === null) return "";
    const col = sectionColor(val);
    return `<div style="display:grid;grid-template-columns:90px minmax(0,1fr) 36px;gap:8px;align-items:center;font-size:12px;padding:4px 0;color:color-mix(in srgb,var(--text) 72%,transparent)">
      <span>${label}</span>
      <div style="height:7px;border-radius:999px;background:color-mix(in srgb,var(--text) 12%,transparent);overflow:hidden">
        <i style="display:block;height:100%;border-radius:999px;background:${col};width:${val}%;transition:width 1s cubic-bezier(0.16,1,0.3,1)"></i>
      </div>
      <b style="color:${col};font-family:ui-monospace,monospace">${val}</b>
    </div>`;
  }).join("");

  // Before/after rewrites
  const rewrites = Array.isArray(data.rewrites) ? data.rewrites.slice(0, 3) : [];
  const rewriteHtml = rewrites.length ? `
    <p style="margin:14px 0 6px;font-weight:700">Rewrite suggestions</p>
    ${rewrites.map((r) => `
      <div style="margin-bottom:10px;border-radius:10px;overflow:hidden;border:1px solid color-mix(in srgb,var(--text) 10%,transparent)">
        <div style="font-size:10px;font-weight:700;padding:3px 10px;background:color-mix(in srgb,var(--text) 6%,transparent);opacity:0.65;text-transform:uppercase;letter-spacing:.04em">${esc(r.section || "")}</div>
        <div style="padding:7px 10px;font-size:12px;border-bottom:1px solid color-mix(in srgb,var(--text) 8%,transparent)">
          <span style="font-size:9px;font-weight:700;opacity:0.45;display:block;margin-bottom:2px;text-transform:uppercase;letter-spacing:.06em">Before</span>
          <span style="color:#fca5a5">${esc(r.before || "")}</span>
        </div>
        <div style="padding:7px 10px;font-size:12px">
          <span style="font-size:9px;font-weight:700;opacity:0.45;display:block;margin-bottom:2px;text-transform:uppercase;letter-spacing:.06em">After</span>
          <span style="color:#86efac">${esc(r.after || "")}</span>
        </div>
      </div>`).join("")}` : "";

  // Score history sparkline
  const history = Array.isArray(data._history) ? data._history : [];
  const historyHtml = history.length >= 2 ? buildSparkline(history) : "";

  $("raDetailsBody").innerHTML = `
    ${data.summary ? `<p style="margin:0 0 10px"><strong>Verdict:</strong> ${esc(data.summary)}</p>` : ""}
    ${sectionHtml ? `<p style="margin:10px 0 4px;font-weight:700">Section breakdown</p><div style="margin-bottom:6px">${sectionHtml}</div>` : ""}
    ${data.strengths?.length ? `<p style="margin:10px 0 4px;font-weight:700">Strengths</p><ul style="padding-left:18px;margin:0 0 8px">${fmtList(data.strengths)}</ul>` : ""}
    ${data.improvements?.length ? `<p style="margin:10px 0 4px;font-weight:700">Improvements</p><ul style="padding-left:18px;margin:0 0 8px">${fmtList(data.improvements)}</ul>` : ""}
    ${rewriteHtml}
    ${data.detectedSkills?.length ? `<p style="margin:10px 0 4px;font-weight:700">Skills spotted</p><p style="margin:0;font-size:0.82rem;opacity:0.75">${data.detectedSkills.map(esc).join(" · ")}</p>` : ""}
    ${historyHtml}`;

  // Gap-to-opportunity (async, non-blocking)
  if (currentUid && (data.missingSkills || []).length) loadGapOpportunities(data.missingSkills);
  else { const g = $("raGapOpp"); if (g) g.style.display = "none"; }

  // Strong-fit roles (always try; hides itself if no qualifying matches)
  if (currentUid) loadStrongFits(data.detectedSkills || []);
}

// ── Sparkline ────────────────────────────────────────────────────────────────

function buildSparkline(history) {
  const scores = history.slice(-10).map((h) => Math.max(0, Math.min(100, Number(h.atsScore) || 0)));
  if (scores.length < 2) return "";
  const W = 200, H = 38, P = 4;
  const pts = scores.map((s, i) => {
    const x = P + (i / (scores.length - 1)) * (W - P * 2);
    const y = P + (H - P * 2) - (s / 100) * (H - P * 2);
    return `${x},${y}`;
  }).join(" ");
  const latest = scores[scores.length - 1];
  const delta  = latest - scores[scores.length - 2];
  const col    = delta > 0 ? "#22c55e" : delta < 0 ? "#ef4444" : "#94a3b8";
  return `
    <div style="margin-top:14px;padding-top:12px;border-top:1px solid color-mix(in srgb,var(--text) 10%,transparent)">
      <p style="margin:0 0 6px;font-weight:700;font-size:12px">ATS score history (${history.length} upload${history.length !== 1 ? "s" : ""})</p>
      <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="display:block;overflow:visible">
        <defs><linearGradient id="sparkGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="var(--brand)"/>
          <stop offset="100%" stop-color="var(--accent,#7c6bff)"/>
        </linearGradient></defs>
        <polyline points="${pts}" fill="none" stroke="url(#sparkGrad)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      </svg>
      <p style="margin:4px 0 0;font-size:11px;opacity:0.6">Latest: <b>${latest}</b> &nbsp;<span style="color:${col}">${delta > 0 ? "+" : ""}${delta}</span> from previous</p>
    </div>`;
}

// ── Gap-to-opportunity ────────────────────────────────────────────────────────

async function loadGapOpportunities(missingSkills) {
  const container = $("raGapOpp");
  if (!container) return;
  try {
    const norm = missingSkills.map((s) => String(s).trim().toLowerCase()).filter(Boolean);
    if (!norm.length) { container.style.display = "none"; return; }

    const snap = await getDocs(query(collection(db, "internships"), where("status", "==", "Open"), limit(60)));
    const matches = [];
    snap.forEach((d) => {
      const data = d.data();
      const required = parseSkills(data.skills || data.requiredSkills).map(s => s.toLowerCase());
      const overlap = norm.filter((s) => required.includes(s));
      if (overlap.length) matches.push({ id: d.id, title: data.title || "Internship", companyName: data.companyName || "", skills: overlap });
    });

    if (!matches.length) { container.style.display = "none"; return; }
    const top = matches.slice(0, 3);
    const skillsParam = encodeURIComponent(norm.slice(0, 5).join(","));
    const listingsHref = `internshipdetails.html?skills=${skillsParam}`;

    container.style.display = "";
    container.innerHTML = `
      <div style="margin-top:14px;padding:12px 14px;border-radius:12px;background:rgba(124,107,255,0.07);border:1px solid rgba(124,107,255,0.18)">
        <p style="margin:0 0 8px;font-size:12.5px;font-weight:700;color:var(--brand)">🎯 ${matches.length} open role${matches.length !== 1 ? "s" : ""} you'd unlock by closing your skill gaps</p>
        ${top.map((m) => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid color-mix(in srgb,var(--text) 8%,transparent)">
            <div>
              <span style="font-size:12.5px;font-weight:600">${esc(m.title)}</span>
              ${m.companyName ? `<span style="font-size:11px;opacity:0.55;margin-left:6px">${esc(m.companyName)}</span>` : ""}
              <div style="font-size:11px;opacity:0.5;margin-top:1px">Needs: ${m.skills.map(esc).join(", ")}</div>
            </div>
            <a href="internship-detailss.html?id=${encodeURIComponent(m.id)}" style="font-size:11px;color:var(--brand);text-decoration:none;flex-shrink:0;margin-left:10px">View →</a>
          </div>`).join("")}
        <p style="margin:10px 0 0;font-size:11px;opacity:0.6">${matches.length > 3 ? `+${matches.length - 3} more — ` : ""}<a href="${listingsHref}" style="color:var(--brand);font-weight:600">Browse all roles needing these skills →</a></p>
      </div>`;
  } catch (e) {
    console.warn("[resume] gap opportunities:", e?.message);
    container.style.display = "none";
  }
}


// ── Strong-fit roles ─────────────────────────────────────────────────────────

async function loadStrongFits(detectedSkills) {
  const container = $("raStrongFit");
  if (!container) return;
  if (!Array.isArray(detectedSkills) || !detectedSkills.length) {
    container.style.display = "none"; return;
  }
  try {
    const haveSet = new Set(detectedSkills.map((s) => String(s).trim().toLowerCase()).filter(Boolean));
    if (!haveSet.size) { container.style.display = "none"; return; }

    const snap = await getDocs(query(collection(db, "internships"), where("status", "==", "Open"), limit(60)));
    const matches = [];
    snap.forEach((d) => {
      const data = d.data();
      const required = parseSkills(data.skills || data.requiredSkills).map((s) => s.toLowerCase());
      if (!required.length) return;
      const matched = required.filter((s) => haveSet.has(s));
      if (matched.length < 2) return;
      const coverage = matched.length / required.length;
      if (coverage < 0.75) return;
      matches.push({
        id: d.id,
        title: data.title || "Internship",
        companyName: data.companyName || "",
        matched,
        coveragePct: Math.round(coverage * 100),
        requiredCount: required.length,
      });
    });

    if (!matches.length) { container.style.display = "none"; return; }
    matches.sort((a, b) => b.coveragePct - a.coveragePct || b.matched.length - a.matched.length);
    const top = matches.slice(0, 3);
    container.style.display = "";
    container.innerHTML = `
      <div style="padding:12px 14px;border-radius:12px;background:rgba(34,197,94,0.07);border:1px solid rgba(34,197,94,0.2)">
        <p style="margin:0 0 8px;font-size:12.5px;font-weight:700;color:#22c55e">✦ ${matches.length} role${matches.length !== 1 ? "s" : ""} you're a strong fit for</p>
        ${top.map((m) => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid color-mix(in srgb,var(--text) 8%,transparent)">
            <div style="min-width:0">
              <span style="font-size:12.5px;font-weight:600">${esc(m.title)}</span>
              ${m.companyName ? `<span style="font-size:11px;opacity:0.55;margin-left:6px">${esc(m.companyName)}</span>` : ""}
              <div style="font-size:11px;opacity:0.55;margin-top:1px">${m.coveragePct}% skill coverage · ${m.matched.length}/${m.requiredCount} skills</div>
            </div>
            <a href="internship-detailss.html?id=${encodeURIComponent(m.id)}" style="font-size:11px;color:#22c55e;text-decoration:none;flex-shrink:0;margin-left:10px;font-weight:600">View →</a>
          </div>`).join("")}
      </div>`;
  } catch (e) {
    console.warn("[resume] strong fits:", e?.message);
    container.style.display = "none";
  }
}

// Normalize skills — Firestore stores as comma string or array
function parseSkills(raw) {
  if (Array.isArray(raw)) return raw.map(s => String(s).trim()).filter(Boolean);
  if (typeof raw === "string") return raw.split(",").map(s => s.trim()).filter(Boolean);
  return [];
}

// ── Role selector ─────────────────────────────────────────────────────────────

async function loadRoleSelector() {
  const wrap = $("raRoleWrap");
  const btn  = $("raRoleBtn");
  const list = $("raRoleList");
  const text = btn?.querySelector(".ra-combo-text");
  const hint = $("raRoleHint");
  if (!wrap || !btn || !list || !text) return;

  const PLACEHOLDER = "— General analysis (no specific role) —";
  let roles = [];
  let items = [];           // [{ id, title, skills }] including the placeholder at index 0
  let activeIndex = 0;

  function setButtonLabel(label, isPlaceholder) {
    text.textContent = label;
    text.classList.toggle("is-placeholder", !!isPlaceholder);
  }

  function renderOptions() {
    list.innerHTML = items.map((r, i) => {
      const skillsLine = r.skills?.length ? `<span class="ra-combo-opt-skills">${esc(r.skills.slice(0, 3).join(", "))}</span>` : "";
      const sel = (selectedRole?.id || "") === r.id;
      return `<li role="option" data-index="${i}" data-value="${esc(r.id)}" class="ra-combo-opt" aria-selected="${sel}">
        <span>${esc(r.title)}</span>${skillsLine}
      </li>`;
    }).join("");
  }

  function updateActive() {
    const opts = list.children;
    for (let i = 0; i < opts.length; i++) opts[i].setAttribute("data-active", String(i === activeIndex));
    const opt = opts[activeIndex];
    if (opt) opt.scrollIntoView({ block: "nearest" });
  }

  function openList() {
    btn.setAttribute("aria-expanded", "true");
    list.dataset.open = "true";
    const selIdx = items.findIndex((r) => (selectedRole?.id || "") === r.id);
    activeIndex = selIdx >= 0 ? selIdx : 0;
    updateActive();
  }

  function closeList() {
    btn.setAttribute("aria-expanded", "false");
    list.dataset.open = "false";
  }

  function pick(idx) {
    const r = items[idx];
    if (!r) return;
    selectedRole = r.id ? roles.find((x) => x.id === r.id) || null : null;
    setButtonLabel(r.title, !r.id);
    Array.from(list.children).forEach((li) => li.setAttribute("aria-selected", String(li.dataset.value === r.id)));
    if (hint) hint.textContent = selectedRole ? `Will score against: ${selectedRole.title}` : "";
    closeList();
    btn.focus();
  }

  try {
    const snap = await getDocs(query(collection(db, "internships"), where("status", "==", "Open"), limit(40)));
    snap.forEach((d) => {
      const data = d.data();
      roles.push({ id: d.id, title: data.title || "Internship", skills: parseSkills(data.skills || data.requiredSkills), description: data.description || "" });
    });
    roles.sort((a, b) => a.title.localeCompare(b.title));
    items = [{ id: "", title: PLACEHOLDER, skills: [] }, ...roles];
    renderOptions();
    setButtonLabel(PLACEHOLDER, true);
  } catch (e) {
    console.warn("[resume] role selector:", e?.message);
    wrap.style.display = "none";
    return;
  }

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    if (btn.getAttribute("aria-expanded") === "true") closeList();
    else openList();
  });

  list.addEventListener("click", (e) => {
    const li = e.target.closest(".ra-combo-opt");
    if (!li) return;
    pick(parseInt(li.dataset.index, 10));
  });

  btn.addEventListener("keydown", (e) => {
    const open = btn.getAttribute("aria-expanded") === "true";
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      openList();
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = Math.min(items.length - 1, activeIndex + 1);
      updateActive();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = Math.max(0, activeIndex - 1);
      updateActive();
    } else if (e.key === "Home") {
      e.preventDefault();
      activeIndex = 0;
      updateActive();
    } else if (e.key === "End") {
      e.preventDefault();
      activeIndex = items.length - 1;
      updateActive();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(activeIndex);
    } else if (e.key === "Escape" || e.key === "Tab") {
      closeList();
    }
  });

  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target)) closeList();
  });
}

// ── Run analysis ──────────────────────────────────────────────────────────────

async function runAnalysis(dataUrl, fileName) {
  setState("loading");
  $("raFileName").style.display = "";
  $("raFileName").textContent = "Analyzing: " + fileName;
  const timer = animateLoading();
  try {
    const data = await analyzePdf(dataUrl, buildPrompt(selectedRole), {
      system: SYSTEM,
      schema,
      temperature: 0.4,
      maxTokens: 2400,
    });
    clearInterval(timer);
    $("raLoadBar").style.width = "100%";
    $("raLoadPct").textContent = "100%";
    await new Promise((r) => setTimeout(r, 280));

    // Load existing history before saving
    const existingHistory = await loadAnalysisHistory(currentUid);
    const histEntry = { atsScore: data.atsScore, skillsMatch: data.skillsMatch, _ts: Date.now(), _fileName: fileName };
    const incoming  = { ...data, _fileName: fileName, _ts: Date.now(), _role: selectedRole?.title || null, _history: [...existingHistory, histEntry], _uid: currentUid };

    renderResult(incoming);
    renderHistory(incoming._history);
    cacheResult(incoming);
    await saveAnalysis(currentUid, incoming, histEntry);
  } catch (e) {
    clearInterval(timer);
    console.error("[resume-analyzer]", e);
    showError(friendlyGeminiError(e));
  }
}

// ── Past uploads panel ───────────────────────────────────────────────────────

function fmtHistDate(ts) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch { return "—"; }
}

function renderHistory(history) {
  const panel = $("raHistoryPanel");
  const list  = $("raHistoryList");
  if (!panel || !list) return;
  if (!Array.isArray(history) || !history.length) {
    panel.style.display = "none";
    list.innerHTML = "";
    return;
  }
  const sorted = [...history].sort((a, b) => (b._ts || 0) - (a._ts || 0));
  list.innerHTML = sorted.map((h) => {
    const ats    = Math.max(0, Math.min(100, Number(h.atsScore)    || 0));
    const skills = Math.max(0, Math.min(100, Number(h.skillsMatch) || 0));
    const name   = esc(h._fileName || "Resume");
    const ts     = h._ts || 0;
    return `<li data-ts="${ts}" style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 4px;border-bottom:1px solid color-mix(in srgb,var(--text) 6%,transparent)">
      <div style="min-width:0;flex:1">
        <div style="font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</div>
        <div style="font-size:11px;opacity:0.55">${fmtHistDate(ts)}</div>
      </div>
      <div style="display:flex;gap:10px;align-items:center;font-size:11.5px;flex-shrink:0">
        <span style="opacity:0.7">ATS <b style="font-family:ui-monospace,monospace">${ats}%</b></span>
        <span style="opacity:0.7">Skills <b style="font-family:ui-monospace,monospace">${skills}%</b></span>
        <button type="button" class="ra-hist-del" data-ts="${ts}" aria-label="Remove this entry"
                style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:14px;padding:2px 6px;border-radius:4px;line-height:1">×</button>
      </div>
    </li>`;
  }).join("");
  panel.style.display = "";
}

async function deleteHistoryEntry(uid, ts) {
  if (!uid || !ts) return [];
  const snap = await getDoc(doc(db, "students", uid));
  const cur  = snap.exists() && Array.isArray(snap.data().resumeAnalysisHistory) ? snap.data().resumeAnalysisHistory : [];
  const next = cur.filter((h) => Number(h._ts || 0) !== Number(ts));
  await setDoc(doc(db, "students", uid), { resumeAnalysisHistory: next }, { merge: true });
  return next;
}

async function clearAllHistory(uid) {
  if (!uid) return;
  await setDoc(doc(db, "students", uid), { resumeAnalysisHistory: [] }, { merge: true });
}

// ── Persistence ───────────────────────────────────────────────────────────────

function cacheResult(obj) { try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(obj)); } catch {} }
function loadCachedResult() { try { const s = sessionStorage.getItem(CACHE_KEY); return s ? JSON.parse(s) : null; } catch { return null; } }
function clearCachedResult() { try { sessionStorage.removeItem(CACHE_KEY); } catch {} }

function resetUiToIdle() {
  clearCachedResult();
  setState("idle");
  const fileName = $("raFileName"); if (fileName) { fileName.style.display = "none"; fileName.textContent = ""; }
  const gap = $("raGapOpp"); if (gap) { gap.style.display = "none"; gap.innerHTML = ""; }
  const fit = $("raStrongFit"); if (fit) { fit.style.display = "none"; fit.innerHTML = ""; }
  const detailsBody = $("raDetailsBody"); if (detailsBody) detailsBody.innerHTML = "";
  const tip = $("raTip"); if (tip) tip.textContent = "—";
  const roleSection = $("raRoleSection"); if (roleSection) roleSection.style.display = "none";
  renderHistory([]);

  // Reset KPI ATS card on the dashboard if visible.
  const kpiCards = document.querySelectorAll(".kpi");
  const atsCard  = kpiCards[3];
  const tag = atsCard?.querySelector(".kpi-tag");
  if (tag && /ATS/i.test(tag.textContent || "")) {
    const valEl = atsCard.querySelector(".kpi-val"); if (valEl) valEl.textContent = "0%";
    const subEl = atsCard.querySelector(".kpi-sub"); if (subEl) subEl.textContent = "Upload a resume to see your score";
  }
}

async function loadAnalysisHistory(uid) {
  if (!uid) return [];
  try {
    const snap = await getDoc(doc(db, "students", uid));
    return snap.exists() && Array.isArray(snap.data().resumeAnalysisHistory) ? snap.data().resumeAnalysisHistory : [];
  } catch { return []; }
}

async function loadStudentData(uid) {
  if (!uid) return null;
  try {
    const snap = await getDoc(doc(db, "students", uid));
    return snap.exists() ? snap.data() : null;
  } catch (e) { console.warn("[resume] load:", e?.message); return null; }
}

function updateTopbarIdentity(name, profilePic) {
  const userName = $("userName");
  const avatar = document.querySelector(".topbar .avatar");
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

function clearTopbarIdentity() {
  const userName = $("userName"); if (userName) userName.textContent = "User";
  const avatar = document.querySelector(".topbar .avatar");
  if (avatar) { avatar.style.backgroundImage = ""; avatar.textContent = "S"; }
}

async function saveAnalysis(uid, analysis, histEntry) {
  if (!uid || !analysis) return;
  try {
    await setDoc(doc(db, "students", uid), {
      resumeAnalysis: analysis,
      resumeAnalysisHistory: arrayUnion(histEntry),
    }, { merge: true });
  } catch (e) { console.warn("[resume] save:", e?.message); }
}

function showError(msg) { setState("error"); $("raError").textContent = msg; }

// ── Init ──────────────────────────────────────────────────────────────────────

function init() {
  const btn       = $("raAnalyzeBtn");
  const fileInput = $("raFileInput");
  if (!btn || !fileInput) return;

  loadRoleSelector();

  btn.addEventListener("click", () => fileInput.click());
  $("raClearBtn")?.addEventListener("click", () => {
    setState("idle");
    $("raFileName").style.display = "none";
    const gap = $("raGapOpp"); if (gap) gap.style.display = "none";
    clearCachedResult();
  });

  const triggerAnalyzer = (e) => {
    e?.preventDefault?.();
    const card = $("resumeAnalyzerCard");
    if (card) { card.scrollIntoView({ behavior: "smooth", block: "center" }); card.classList.add("ra-flash"); setTimeout(() => card.classList.remove("ra-flash"), 1200); }
    fileInput.click();
  };
  $("uploadResumeBtn")?.addEventListener("click", triggerAnalyzer);
  document.getElementById("aiAnalyzerLink")?.addEventListener("click", triggerAnalyzer);

  async function handlePdfFile(f) {
    if (!f) return;
    if (!/pdf/i.test(f.type) && !/\.pdf$/i.test(f.name)) { showError("Please upload a PDF file."); return; }
    if (f.size > 10 * 1024 * 1024) { showError("PDF is too large. Keep it under 10 MB."); return; }
    try { await runAnalysis(await readAsDataURL(f), f.name); }
    catch { showError("Could not read the PDF. Try a different file."); }
  }

  fileInput.addEventListener("change", async () => {
    const f = fileInput.files?.[0];
    fileInput.value = "";
    await handlePdfFile(f);
  });

  // Drop zone: click to open picker, drag-and-drop to upload.
  const dropZone = $("raDropZone");
  if (dropZone) {
    dropZone.addEventListener("click", () => fileInput.click());
    dropZone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); }
    });
    dropZone.setAttribute("role", "button");
    dropZone.setAttribute("tabindex", "0");
    dropZone.setAttribute("aria-label", "Upload resume PDF");

    ["dragenter", "dragover"].forEach((evt) => {
      dropZone.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add("drag-over");
      });
    });
    ["dragleave", "dragend"].forEach((evt) => {
      dropZone.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove("drag-over");
      });
    });
    dropZone.addEventListener("drop", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove("drag-over");
      const f = e.dataTransfer?.files?.[0];
      await handlePdfFile(f);
    });
  }

  // History panel — per-row delete + clear-all
  $("raHistoryList")?.addEventListener("click", async (e) => {
    const btn = e.target.closest(".ra-hist-del");
    if (!btn || !currentUid) return;
    if (!confirm("Remove this past analysis from your history?")) return;
    try {
      const next = await deleteHistoryEntry(currentUid, btn.dataset.ts);
      renderHistory(next);
      const cached = loadCachedResult();
      if (cached) { cached._history = next; cacheResult(cached); renderResult(cached); }
    } catch (err) {
      console.warn("[resume] delete history:", err?.message);
      showError("Could not remove that entry. Please try again.");
    }
  });
  $("raClearHistoryBtn")?.addEventListener("click", async () => {
    if (!currentUid) return;
    if (!confirm("Clear all past analyses? This cannot be undone.")) return;
    try {
      await clearAllHistory(currentUid);
      renderHistory([]);
      const cached = loadCachedResult();
      if (cached) { cached._history = []; cacheResult(cached); renderResult(cached); }
    } catch (err) {
      console.warn("[resume] clear history:", err?.message);
      showError("Could not clear history. Please try again.");
    }
  });

  // Default the UI to idle until auth resolves — prevents leaking a stale
  // cache from a previously logged-in user in this tab.
  resetUiToIdle();

  // Profile chip on this sub-page acts as a shortcut back to the dashboard
  // (which owns the full profile / logout / TARS menu).
  document.querySelector(".topbar .profile")?.addEventListener("click", () => {
    window.location.href = "dashboard.html";
  });

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      currentUid = null;
      clearTopbarIdentity();
      resetUiToIdle();
      return;
    }

    currentUid = user.uid;

    const cached  = loadCachedResult();
    const stuData = await loadStudentData(user.uid);

    updateTopbarIdentity(stuData?.name || user.displayName || user.email, stuData?.profilePic);

    const remote = stuData?.resumeAnalysis || null;
    if (remote) remote._history = Array.isArray(stuData.resumeAnalysisHistory) ? stuData.resumeAnalysisHistory : [];

    if (remote) {
      const stamped = { ...remote, _uid: user.uid };
      renderResult(stamped);
      renderHistory(stamped._history);
      cacheResult(stamped);
      if (remote._fileName) { $("raFileName").style.display = ""; $("raFileName").textContent = "Saved analysis: " + remote._fileName; }
      return;
    }

    // No remote analysis for this user. If the cached entry belongs to this
    // same user (e.g. a refresh during analysis), keep it; otherwise reset.
    if (cached && cached._uid === user.uid) {
      renderResult(cached);
      renderHistory(cached._history);
      if (cached._fileName) { $("raFileName").style.display = ""; $("raFileName").textContent = "Last analysis: " + cached._fileName; }
      return;
    }

    resetUiToIdle();
  });
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

document.readyState === "loading"
  ? document.addEventListener("DOMContentLoaded", init)
  : init();
