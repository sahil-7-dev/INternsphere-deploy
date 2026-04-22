// js/resume-analyzer.js

import { analyzePdf, friendlyGeminiError } from "./gemini.js";
import { auth, db } from "../firebase/firebase.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";

const $ = (id) => document.getElementById(id);
const CACHE_KEY = "is.resumeAnalysis";

let currentUid = null;

const schema = {
  type: "object",
  properties: {
    atsScore: {
      type: "integer",
      description: "ATS-compatibility score from 0-100.",
      minimum: 0,
      maximum: 100,
    },
    skillsMatch: {
      type: "integer",
      description:
        "Overall relevance to general software/design/product internship roles, 0-100.",
      minimum: 0,
      maximum: 100,
    },
    summary: {
      type: "string",
      description: "One-sentence verdict on the resume overall.",
    },
    detectedSkills: {
      type: "array",
      description: "Concrete tools, languages, or methodologies found in the resume.",
      items: { type: "string" },
    },
    missingSkills: {
      type: "array",
      description:
        "2-4 high-leverage skills worth adding that would boost the candidate's match.",
      items: { type: "string" },
    },
    improvements: {
      type: "array",
      description: "3 specific, actionable improvement tips.",
      items: { type: "string" },
    },
    strengths: {
      type: "array",
      description: "2-3 things the resume does well.",
      items: { type: "string" },
    },
  },
  required: [
    "atsScore",
    "skillsMatch",
    "summary",
    "detectedSkills",
    "improvements",
  ],
};

const SYSTEM = `You are a senior technical recruiter and career coach reviewing student resumes for internship applications.
Rules:
• Be SPECIFIC — name concrete tools, frameworks, libraries, companies, actions. Never generic ("improve wording", "add more projects" is banned; say exactly what).
• Ground every recommendation in what the CV actually contains. If the resume shows a to-do app in React, say things like "add state management (Redux/Zustand)" — not "learn state management".
• Prefer named technologies and measurable outcomes. "Add Node.js + Express to show backend familiarity" beats "add backend skills".
• If something is missing, say what to do to add it credibly (a project idea, a concrete skill, an item to quantify).
• Tone: direct, constructive, no fluff.`;

const PROMPT = `Analyze the attached resume PDF for a student applying to tech / design / product internships.

Produce:
  atsScore       — 0-100 based on ATS-compatibility (clean formatting, scannable structure, bullet-first, proper headings, keyword density).
  skillsMatch    — 0-100 on how well the resume reads for student-level internship roles generally.
  summary        — 1 sentence verdict.
  detectedSkills — every concrete tool / language / framework / methodology you can find in the resume, verbatim or normalized (e.g. "JavaScript", "React", "Figma", "SQL", "Git").
  missingSkills  — 2-4 SPECIFIC named skills that would raise their fit for common internship pipelines. Each entry should be a concrete tech/skill (e.g. "Node.js", "TypeScript", "Tailwind CSS", "PostgreSQL", "REST APIs"), NOT a generic phrase.
  improvements   — 3 actionable edits the student can make TODAY. Each must reference something specific from their CV ("Quantify your 'built a portfolio' line with traffic or lighthouse score", "Add GitHub links under each project", "Group React / Next.js under a Frontend subsection instead of a flat list"). Avoid filler.
  strengths      — 2-3 things the resume does well, specifically (e.g. "Clear reverse-chronological experience", "Project descriptions lead with impact").

Return JSON only.`;

const STAGES = [
  { pct: 18, text: "Parsing PDF…" },
  { pct: 45, text: "Extracting skills & experience…" },
  { pct: 72, text: "Scoring against industry benchmarks…" },
  { pct: 92, text: "Writing personalised tips…" },
];

function fmtList(arr) {
  if (!arr || !arr.length) return "";
  return arr.map((s) => `<li>${escapeHtml(s)}</li>`).join("");
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setState(state) {
  $("raIdle").style.display     = state === "idle"    ? "" : "none";
  $("raLoading").style.display  = state === "loading" ? "" : "none";
  $("raResult").style.display   = state === "result"  ? "" : "none";
  $("raError").style.display    = state === "error"   ? "" : "none";

  const chip = $("raChip");
  if (chip) {
    if (state === "loading") { chip.textContent = "ANALYZING"; chip.style.background = "rgba(245,158,11,0.18)"; chip.style.color = "#f59e0b"; }
    else if (state === "result") { chip.textContent = "COMPLETE"; chip.style.background = "rgba(34,197,94,0.18)"; chip.style.color = "#22c55e"; }
    else if (state === "error") { chip.textContent = "ERROR"; chip.style.background = "rgba(239,68,68,0.18)"; chip.style.color = "#ef4444"; }
    else { chip.textContent = "READY"; chip.style.background = ""; chip.style.color = ""; }
  }

  $("raClearBtn").style.display = state === "result" || state === "error" ? "" : "none";
  $("raAnalyzeBtn").textContent = state === "idle" ? "Analyze resume" : "Re-analyze";
}

function animateLoading() {
  let i = 0;
  const bar = $("raLoadBar");
  const pct = $("raLoadPct");
  const step = $("raLoadStep");
  const tick = () => {
    if (!bar || i >= STAGES.length) return;
    const s = STAGES[i++];
    bar.style.width = s.pct + "%";
    pct.textContent = s.pct + "%";
    step.textContent = s.text;
  };
  tick();
  const timer = setInterval(() => {
    if (i >= STAGES.length) { clearInterval(timer); return; }
    tick();
  }, 900);
  return timer;
}

function renderResult(data) {
  setState("result");

  const ats = Math.max(0, Math.min(100, Number(data.atsScore) || 0));
  const skills = Math.max(0, Math.min(100, Number(data.skillsMatch) || 0));

  const atsPct = Math.round(ats);
  const tarsAts = document.getElementById("tarsAtsScore");
  if (tarsAts) tarsAts.textContent = atsPct + "%";
  const userMeta = document.getElementById("userMeta");
  if (userMeta) {
    userMeta.textContent = userMeta.textContent.replace(/\d+%\s*ATS/i, `${atsPct}% ATS`);
  }

  animateNumber($("raAtsVal"), ats, "%");
  animateNumber($("raSkillsVal"), skills, "%");
  requestAnimationFrame(() => {
    $("raAtsBar").style.width = ats + "%";
    $("raSkillsBar").style.width = skills + "%";
  });

  const kpiCards = document.querySelectorAll(".kpi");
  const atsCard = kpiCards[3];
  const tag = atsCard?.querySelector(".kpi-tag");
  if (tag && /ATS/i.test(tag.textContent || "")) {
    const valEl = atsCard.querySelector(".kpi-val");
    const subEl = atsCard.querySelector(".kpi-sub");
    if (valEl) {
      valEl.removeAttribute("data-value");
      animateNumber(valEl, ats, "");
    }
    if (subEl) {
      subEl.textContent = `Skills match ${skills}%`;
    }
  }

  const missing = (data.missingSkills || []).slice(0, 3);
  if (missing.length) {
    $("raTip").innerHTML =
      `<span style="opacity:0.8">Boost your match by adding:</span> ` +
      missing.map((m) => `<b>${escapeHtml(m)}</b>`).join(" · ");
  } else {
    $("raTip").textContent = data.summary || "Great resume overall.";
  }

  const body = $("raDetailsBody");
  body.innerHTML = `
    ${data.summary ? `<p style="margin:0 0 10px"><strong>Verdict:</strong> ${escapeHtml(data.summary)}</p>` : ""}
    ${data.strengths?.length ? `<p style="margin:10px 0 4px"><strong>Strengths</strong></p><ul style="padding-left:18px;margin:0 0 8px">${fmtList(data.strengths)}</ul>` : ""}
    ${data.improvements?.length ? `<p style="margin:10px 0 4px"><strong>Improvements</strong></p><ul style="padding-left:18px;margin:0 0 8px">${fmtList(data.improvements)}</ul>` : ""}
    ${data.detectedSkills?.length ? `<p style="margin:10px 0 4px"><strong>Skills we spotted</strong></p><p style="margin:0;font-size:0.82rem;opacity:0.75">${data.detectedSkills.map(escapeHtml).join(" · ")}</p>` : ""}
  `;
}

function animateNumber(el, target, suffix = "") {
  if (!el) return;
  const start = parseInt(el.textContent, 10) || 0;
  const dur = 900;
  const t0 = performance.now();
  function step(t) {
    const k = Math.min(1, (t - t0) / dur);
    const eased = 1 - Math.pow(1 - k, 3);
    const cur = Math.round(start + (target - start) * eased);
    el.textContent = cur + suffix;
    if (k < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function showError(msg) {
  setState("error");
  $("raError").textContent = msg;
}

async function runAnalysis(dataUrl, fileName) {
  setState("loading");
  $("raFileName").style.display = "";
  $("raFileName").textContent = "Analyzing: " + fileName;
  const timer = animateLoading();
  try {
    const data = await analyzePdf(dataUrl, PROMPT, {
      system: SYSTEM,
      schema,
      temperature: 0.45,
      maxTokens: 1800,
    });
    clearInterval(timer);
    $("raLoadBar").style.width = "100%";
    $("raLoadPct").textContent = "100%";
    await new Promise((r) => setTimeout(r, 280));

    const incoming = { ...data, _fileName: fileName, _ts: Date.now() };
    renderResult(incoming);
    cacheResult(incoming);
    saveAnalysis(currentUid, incoming);
  } catch (e) {
    clearInterval(timer);
    console.error("[resume-analyzer]", e);
    showError(friendlyGeminiError(e));
  }
}

function cacheResult(obj) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(obj)); } catch {}
}
function loadCachedResult() {
  try {
    const s = sessionStorage.getItem(CACHE_KEY);
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

// persistence

async function loadSavedAnalysis(uid) {
  if (!uid) return null;
  try {
    const snap = await getDoc(doc(db, "students", uid));
    if (!snap.exists()) return null;
    const d = snap.data();
    return d.resumeAnalysis || null;
  } catch (e) {
    console.warn("[resume] load saved:", e?.message);
    return null;
  }
}

async function saveAnalysis(uid, analysis) {
  if (!uid || !analysis) return;
  try {
    await setDoc(
      doc(db, "students", uid),
      { resumeAnalysis: analysis },
      { merge: true },
    );
  } catch (e) {
    console.warn("[resume] save:", e?.message);
  }
}

function init() {
  const btn = $("raAnalyzeBtn");
  const fileInput = $("raFileInput");
  const clearBtn = $("raClearBtn");
  const uploadBtn = $("uploadResumeBtn");
  const card = $("resumeAnalyzerCard");
  if (!btn || !fileInput) return;

  btn.addEventListener("click", () => fileInput.click());
  clearBtn.addEventListener("click", () => {
    setState("idle");
    $("raFileName").style.display = "none";
    try { sessionStorage.removeItem(CACHE_KEY); } catch {}
  });

  const triggerAnalyzer = (e) => {
    e?.preventDefault?.();
    if (card) {
      card.scrollIntoView({ behavior: "smooth", block: "center" });
      card.classList.add("ra-flash");
      setTimeout(() => card.classList.remove("ra-flash"), 1200);
    }
    fileInput.click();
  };

  uploadBtn?.addEventListener("click", triggerAnalyzer);
  document.getElementById("aiAnalyzerLink")?.addEventListener("click", triggerAnalyzer);

  fileInput.addEventListener("change", async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    fileInput.value = "";
    if (!/pdf/i.test(f.type) && !/\.pdf$/i.test(f.name)) {
      showError("Please upload a PDF file.");
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      showError("PDF is too large. Please keep it under 5 MB.");
      return;
    }
    try {
      const dataUrl = await readAsDataURL(f);
      await runAnalysis(dataUrl, f.name);
    } catch (e) {
      showError("Could not read the PDF. Try a different file.");
    }
  });

  const cached = loadCachedResult();
  if (cached) {
    renderResult(cached);
    if (cached._fileName) {
      $("raFileName").style.display = "";
      $("raFileName").textContent = "Last analysis: " + cached._fileName;
    }
  } else {
    const kpiCards = document.querySelectorAll(".kpi");
    const atsCard = kpiCards[3];
    const tag = atsCard?.querySelector(".kpi-tag");
    if (tag && /ATS/i.test(tag.textContent || "")) {
      const valEl = atsCard.querySelector(".kpi-val");
      const subEl = atsCard.querySelector(".kpi-sub");
      if (valEl) valEl.textContent = "0%";
      if (subEl) subEl.textContent = "Upload a resume to see your score";
    }
  }

  onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    currentUid = user.uid;
    const remote = await loadSavedAnalysis(user.uid);
    if (!remote) return;
    renderResult(remote);
    cacheResult(remote);
    if (remote._fileName) {
      $("raFileName").style.display = "";
      $("raFileName").textContent = "Saved analysis: " + remote._fileName;
    }
  });
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
