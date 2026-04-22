// js/apply-ai.js

import { auth, db } from "../firebase/firebase.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { askGemini, askGeminiJson, analyzePdf, friendlyGeminiError } from "./gemini.js";

const $ = (id) => document.getElementById(id);

let currentUser = null;
let studentProfile = null;

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getInternshipCtx() {
  const base = window.__internship || {};
  return {
    id: base.id || "",
    title: base.title || "",
    companyName: base.companyName || "",
    description: document.querySelector(".hero-subtitle")?.textContent?.trim() || "",
    location: document.querySelectorAll(".hero-meta .meta-value")?.[1]?.textContent?.trim() || "",
    stipend: document.querySelectorAll(".hero-meta .meta-value")?.[2]?.textContent?.trim() || "",
    duration: document.querySelectorAll(".mini-grid .mini-value")?.[1]?.textContent?.trim() || "",
    department: document.querySelectorAll(".hero-meta .meta-value")?.[0]?.textContent?.trim() || "",
  };
}

function internshipContextBlock(ctx) {
  return [
    `Internship: ${ctx.title}`,
    `Company: ${ctx.companyName}`,
    ctx.department && `Department: ${ctx.department}`,
    ctx.location && `Location: ${ctx.location}`,
    ctx.duration && `Duration: ${ctx.duration}`,
    ctx.stipend && `Stipend: ${ctx.stipend}`,
    ctx.description && `Description: ${ctx.description}`,
  ].filter(Boolean).join("\n");
}

function studentContextBlock() {
  if (!studentProfile) return "";
  const p = studentProfile;
  return [
    p.name && `Name: ${p.name}`,
    p.college && `College: ${p.college}${p.graduationYear ? " ('" + String(p.graduationYear).slice(-2) + ")" : ""}`,
    p.major && `Major: ${p.major}`,
    p.location && `Location: ${p.location}`,
    p.bio && `Bio: ${p.bio}`,
    p.skills?.length && `Skills: ${p.skills.join(", ")}`,
    p.linkedin && `LinkedIn: ${p.linkedin}`,
    p.github && `GitHub: ${p.github}`,
  ].filter(Boolean).join("\n");
}

function showLoading(panel, text) {
  panel.style.display = "";
  panel.innerHTML = `<div class="ai-loading">${escapeHtml(text)}</div>`;
}
function showError(panel, msg) {
  panel.style.display = "";
  panel.innerHTML = `<div class="ai-panel-error">⚠ ${escapeHtml(msg)}</div>`;
}

// cv feedback
const cvSchema = {
  type: "object",
  properties: {
    fitScore: { type: "integer", minimum: 0, maximum: 100, description: "How well the CV matches this specific role." },
    verdict: { type: "string", description: "One-line overall verdict." },
    strengths: { type: "array", items: { type: "string" }, description: "2-3 things in the CV that are strong for this role." },
    gaps: { type: "array", items: { type: "string" }, description: "2-3 things missing or weak vs. this role." },
    tips: { type: "array", items: { type: "string" }, description: "2-3 concrete edits to make before submitting." },
  },
  required: ["fitScore", "verdict", "strengths", "gaps", "tips"],
};

async function runCvFeedback() {
  const panel = $("aiPanel");
  const btn = $("cvFeedbackBtn");
  const cvInput = $("cv");
  const file = cvInput?.files?.[0];
  if (!file) {
    showError(panel, "Attach a PDF CV first, then click this again.");
    return;
  }

  btn.disabled = true;
  showLoading(panel, "Reviewing your CV for this role…");

  try {
    const ctx = getInternshipCtx();
    const dataUrl = await readAsDataURL(file);

    const prompt = `You are reviewing a student's CV for this specific internship. Score the fit 0-100. Return structured feedback.\n\n${internshipContextBlock(ctx)}`;

    const data = await analyzePdf(dataUrl, prompt, {
      system: "You are a senior recruiter reviewing student CVs. Be direct, specific, and actionable. No fluff.",
      schema: cvSchema,
      temperature: 0.4,
    });

    const scoreColor = data.fitScore >= 75 ? "#22c55e" : data.fitScore >= 50 ? "#f59e0b" : "#ef4444";
    const scoreBg = data.fitScore >= 75 ? "rgba(34,197,94,0.15)" : data.fitScore >= 50 ? "rgba(245,158,11,0.15)" : "rgba(239,68,68,0.15)";

    panel.innerHTML = `
      <h5>✦ CV review
        <span class="ai-score" style="background:${scoreBg};color:${scoreColor};border-color:${scoreColor}55">${data.fitScore}/100</span>
      </h5>
      <p><strong>Verdict:</strong> ${escapeHtml(data.verdict)}</p>
      ${listBlock("Strengths", data.strengths)}
      ${listBlock("Gaps", data.gaps)}
      ${listBlock("Before you submit", data.tips)}
    `;
  } catch (e) {
    console.error("[apply-ai] cv feedback:", e);
    showError(panel, friendlyGeminiError(e));
  } finally {
    btn.disabled = false;
  }
}

function listBlock(label, items) {
  if (!items?.length) return "";
  return `<p style="margin:10px 0 2px"><strong>${escapeHtml(label)}</strong></p><ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;
}

// pitch
async function runPitch() {
  const panel = $("aiPanel");
  const btn = $("pitchBtn");
  btn.disabled = true;
  showLoading(panel, "Drafting your pitch…");

  try {
    const ctx = getInternshipCtx();
    const student = studentContextBlock();

    const prompt = `Draft a 2-sentence application pitch the student can use for this role. First-person ("I..."). Concrete, humble, role-specific. Max 55 words total. No greetings, no sign-off.\n\n${internshipContextBlock(ctx)}\n\n${student ? "Student profile:\n" + student : "Student profile: (none provided — write a strong generic pitch for a student applying to this role.)"}`;

    const text = await askGemini({
      prompt,
      system: "You write short, punchy application pitches for student interns. Specific, not generic. Emphasize fit and ability to contribute.",
      temperature: 0.8,
      maxTokens: 220,
    });

    panel.innerHTML = `
      <h5>✨ Suggested pitch</h5>
      <div class="ai-pitch">${escapeHtml(text)}</div>
      <div class="ai-actions-row">
        <button type="button" class="ai-mini" id="aiCopyBtn">Copy</button>
        <button type="button" class="ai-mini" id="aiRefreshBtn">Regenerate</button>
      </div>
      <p style="font-size:0.78rem;opacity:0.6;margin:6px 0 0">Tip: drop this into your message to the recruiter — tailor it further if needed.</p>
    `;

    $("aiCopyBtn")?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(text);
        $("aiCopyBtn").textContent = "Copied ✓";
        setTimeout(() => { const b = $("aiCopyBtn"); if (b) b.textContent = "Copy"; }, 1500);
      } catch {}
    });
    $("aiRefreshBtn")?.addEventListener("click", runPitch);
  } catch (e) {
    console.error("[apply-ai] pitch:", e);
    showError(panel, friendlyGeminiError(e));
  } finally {
    btn.disabled = false;
  }
}

// wiring
function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function showAiActions() {
  const row = $("aiActions");
  if (row) row.style.display = "flex";
}

function init() {
  $("cvFeedbackBtn")?.addEventListener("click", runCvFeedback);
  $("pitchBtn")?.addEventListener("click", runPitch);

  $("cv")?.addEventListener("change", () => {
    showAiActions();
  });

  showAiActions();

  onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    currentUser = user;
    try {
      const snap = await getDoc(doc(db, "students", user.uid));
      if (snap.exists()) studentProfile = snap.data();
    } catch (e) {
      console.warn("[apply-ai] could not load student profile:", e);
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
