// js/tars.js

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
import { createChat, friendlyGeminiError } from "./gemini.js";
import {
  composeSystemPrompt,
  loadHistory,
  saveHistory,
  clearHistory,
} from "./tars-core.js";

const $ = (id) => document.getElementById(id);

function buildSystemPrompt(ctx) {
  const now = new Date();

  // Resume analysis block — included when the student has uploaded a CV
  const raLines = [];
  if (typeof ctx.resumeAtsScore === "number") {
    raLines.push(`CV ATS score: ${ctx.resumeAtsScore}%`);
    if (ctx.resumeSkillsMatch !== null) raLines.push(`CV skills match: ${ctx.resumeSkillsMatch}%`);
    if (ctx.resumeSummary) raLines.push(`CV verdict: ${ctx.resumeSummary}`);
    if (ctx.detectedSkills?.length) raLines.push(`Skills on CV: ${ctx.detectedSkills.slice(0, 15).join(", ")}`);
    if (ctx.missingSkills?.length)  raLines.push(`Gap skills (not yet on CV): ${ctx.missingSkills.join(", ")}`);
    if (ctx.improvements?.length)   raLines.push(`Top CV improvements needed:\n${ctx.improvements.map((t, i) => `  ${i + 1}. ${t}`).join("\n")}`);
    if (ctx.strengths?.length)      raLines.push(`CV strengths: ${ctx.strengths.join("; ")}`);
    if (ctx.sectionScores) {
      const ss = ctx.sectionScores;
      const parts = Object.entries(ss).filter(([, v]) => typeof v === "number").map(([k, v]) => `${k} ${v}`);
      if (parts.length) raLines.push(`Section scores: ${parts.join(", ")}`);
    }
    if (ctx.lastAnalyzedRole) raLines.push(`Last analyzed against role: ${ctx.lastAnalyzedRole}`);
    if (ctx.analysisUploads > 1) raLines.push(`Resume uploads so far: ${ctx.analysisUploads}`);
  }

  const state = [
    `Today: ${now.toDateString()}`,
    ctx.applications !== undefined && `Applications submitted: ${ctx.applications}`,
    ctx.pending !== undefined && `Pending applications: ${ctx.pending}`,
    ctx.shortlisted !== undefined && ctx.shortlisted > 0 && `Shortlisted applications: ${ctx.shortlisted} (interview likely coming — check the dashboard)`,
    ctx.approved !== undefined && `Approved applications: ${ctx.approved}`,
    ctx.rejected !== undefined && ctx.rejected > 0 && `Rejected applications: ${ctx.rejected}`,
    ctx.activeInternship && `Active internship: ${ctx.activeInternship.title} at ${ctx.activeInternship.companyName}`,
    ctx.taskCount !== undefined && `Assigned tasks: ${ctx.taskCount} total (${ctx.tasksDone || 0} submitted, ${ctx.taskCount - (ctx.tasksDone || 0)} remaining)`,
    ctx.interviewDate && `Upcoming interview: ${ctx.interviewDate} — ${ctx.interviewLink ? "join link available" : "check dashboard for link"}`,
    ...(raLines.length ? ["--- Resume Analysis ---", ...raLines] : []),
  ].filter(Boolean).join("\n");

  return composeSystemPrompt({
    studentName: ctx.name,
    studentState: state,
    pageContext: "Student is on the Dashboard. Data above is live from the database. When the student asks questions about their CV, improvements, skills, or what to learn — use the Resume Analysis data above to give specific, personalised answers.",
  });
}

let chat = null;
let ctx = {};
let currentUid = null;

// context loaders
async function loadContext(user) {
  ctx = { name: user.displayName || "" };

  try {
    const sSnap = await getDoc(doc(db, "students", user.uid));
    if (sSnap.exists()) {
      const d = sSnap.data();
      ctx.name = d.name || ctx.name;

      // Enrich TARS with full resume analysis so it can answer CV follow-up questions
      const ra = d.resumeAnalysis;
      if (ra && typeof ra.atsScore === "number") {
        ctx.resumeAtsScore    = Math.max(0, Math.min(100, Math.round(ra.atsScore)));
        ctx.resumeSkillsMatch = typeof ra.skillsMatch === "number" ? Math.max(0, Math.min(100, Math.round(ra.skillsMatch))) : null;
        ctx.resumeSummary     = ra.summary || null;
        ctx.detectedSkills    = Array.isArray(ra.detectedSkills) ? ra.detectedSkills : [];
        ctx.missingSkills     = Array.isArray(ra.missingSkills)  ? ra.missingSkills  : [];
        ctx.improvements      = Array.isArray(ra.improvements)   ? ra.improvements   : [];
        ctx.strengths         = Array.isArray(ra.strengths)       ? ra.strengths       : [];
        ctx.sectionScores     = ra.sectionScores || null;
        ctx.lastAnalyzedRole  = ra._role || null;
        // History length for context
        ctx.analysisUploads   = Array.isArray(d.resumeAnalysisHistory) ? d.resumeAnalysisHistory.length : 1;
      }
    }
  } catch {}

  try {
    const appsSnap = await getDocs(query(
      collection(db, "applications"),
      where("studentId", "==", user.uid),
    ));
    const apps = appsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    ctx.applications = apps.length;
    ctx.pending     = apps.filter((a) => (a.status || "Pending") === "Pending").length;
    ctx.shortlisted = apps.filter((a) => a.status === "Shortlisted").length;
    ctx.approved    = apps.filter((a) => a.status === "Approved").length;
    ctx.rejected    = apps.filter((a) => a.status === "Rejected").length;

    // Interview date from shortlisted app
    const shortlistedApp = apps.find((a) => a.status === "Shortlisted" && a.interviewDate);
    if (shortlistedApp) {
      ctx.interviewDate = shortlistedApp.interviewDate;
      ctx.interviewLink = shortlistedApp.interviewLink || "";
    }

    const approvedApp = apps.find((a) => a.status === "Approved");
    if (approvedApp?.internshipId) {
      try {
        const intSnap = await getDoc(doc(db, "internships", approvedApp.internshipId));
        if (intSnap.exists()) {
          const i = intSnap.data();
          ctx.activeInternship = {
            id: approvedApp.internshipId,
            title: i.title || "",
            companyName: i.companyName || "",
          };

          const tasksSnap = await getDocs(query(
            collection(db, "tasks"),
            where("internshipId", "==", approvedApp.internshipId),
          ));
          ctx.taskCount = tasksSnap.size;

          const subsSnap = await getDocs(query(
            collection(db, "taskSubmissions"),
            where("studentId", "==", user.uid),
            where("internshipId", "==", approvedApp.internshipId),
          ));
          ctx.tasksDone = subsSnap.docs.filter((d) => {
            const data = d.data();
            return data.feedback?.status !== "rejected";
          }).length;
        }
      } catch (e) { console.warn("[tars] context internship:", e); }
    }
  } catch (e) { console.warn("[tars] context apps:", e); }
}

// chat UI
function appendMsg(text, from = "bot") {
  const thread = $("tarsChatThread");
  if (!thread) return null;
  const el = document.createElement("div");
  el.className = "tars-chat-msg tars-chat-msg-" + from;
  el.textContent = text;
  thread.appendChild(el);
  thread.scrollTop = thread.scrollHeight;
  const sugg = $("tarsChatSuggestions");
  if (sugg) sugg.style.display = "none";
  return el;
}

function appendTyping() {
  const thread = $("tarsChatThread");
  if (!thread) return null;
  const el = document.createElement("div");
  el.className = "tars-chat-msg tars-chat-msg-bot tars-chat-msg-typing";
  thread.appendChild(el);
  thread.scrollTop = thread.scrollHeight;
  return el;
}

function ensureChat() {
  if (chat) return chat;
  chat = createChat({
    system: buildSystemPrompt(ctx),
    temperature: 0.6,
    maxTokens: 1800,
    history: loadHistory(currentUid),
    contextWindow: 40,
    onUpdate: (entries) => saveHistory(currentUid, entries),
  });
  return chat;
}

async function sendMessage(text) {
  const clean = (text || "").trim();
  if (!clean) return;

  // Refresh context before every message so TARS always has live data
  if (auth.currentUser) {
    await loadContext(auth.currentUser).catch(() => {});
    // Rebuild chat with fresh system prompt (keeps history intact)
    const history = chat ? chat.history : loadHistory(currentUid);
    chat = createChat({
      system: buildSystemPrompt(ctx),
      temperature: 0.6,
      maxTokens: 1800,
      history,
      contextWindow: 40,
      onUpdate: (entries) => saveHistory(currentUid, entries),
    });
  }

  const c = ensureChat();
  appendMsg(clean, "user");
  const typing = appendTyping();
  const sendBtn = document.querySelector(".tars-chat-send");
  if (sendBtn) sendBtn.disabled = true;

  try {
    const reply = await c.send(clean);
    typing?.remove();
    appendMsg(reply, "bot");
  } catch (e) {
    console.error("[tars]", e);
    typing?.remove();
    const err = document.createElement("div");
    err.className = "tars-chat-msg tars-chat-msg-bot";
    err.style.borderColor = "rgba(239,68,68,0.35)";
    err.style.color = "#fca5a5";
    err.textContent = "⚠ " + friendlyGeminiError(e);
    $("tarsChatThread").appendChild(err);
  } finally {
    if (sendBtn) sendBtn.disabled = false;
  }
}

function rehydrateThreadFromHistory(entries) {
  const thread = $("tarsChatThread");
  if (!thread || !entries?.length) return;
  if (thread.querySelector(".tars-chat-msg-user")) return;

  thread.innerHTML = "";

  for (const e of entries) {
    const text = e.parts?.map((p) => p.text || "").join("").trim();
    if (!text) continue;
    appendMsg(text, e.role === "user" ? "user" : "bot");
  }
}

// quick actions
const QUICK_ACTIONS = {
  workroom: () => { window.location.href = "virtualworkroom.html"; },
  applications: () => {
    closeChat();
    document.getElementById("applicationsSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
  },
  profile: () => {
    closeChat();
    document.getElementById("profileModal")?.classList.add("is-open");
  },
  search: () => {
    closeChat();
    const sm = document.getElementById("aiSearchModal");
    if (sm) {
      sm.classList.add("is-open");
      document.body.style.overflow = "hidden";
      setTimeout(() => document.getElementById("aiSearchInput")?.focus(), 80);
    } else {
      window.location.href = "internshipdetails.html";
    }
  },
};

// scroll lock
function lockBodyScroll() {
  const scrollbar = window.innerWidth - document.documentElement.clientWidth;
  const body = document.body;
  const html = document.documentElement;

  body.dataset._tarsPrevOverflow     = body.style.overflow || "";
  body.dataset._tarsPrevPaddingRight = body.style.paddingRight || "";
  html.dataset._tarsPrevOverflow     = html.style.overflow || "";

  body.style.overflow = "hidden";
  html.style.overflow = "hidden";
  if (scrollbar > 0) body.style.paddingRight = scrollbar + "px";
}

function unlockBodyScroll() {
  const body = document.body;
  const html = document.documentElement;
  body.style.overflow     = body.dataset._tarsPrevOverflow     || "";
  body.style.paddingRight = body.dataset._tarsPrevPaddingRight || "";
  html.style.overflow     = html.dataset._tarsPrevOverflow     || "";
  delete body.dataset._tarsPrevOverflow;
  delete body.dataset._tarsPrevPaddingRight;
  delete html.dataset._tarsPrevOverflow;
}

// scroll trap
let _tarsScrollTrap = null;
function attachScrollTrap() {
  const modal = document.getElementById("tarsModal");
  if (!modal || _tarsScrollTrap) return;
  _tarsScrollTrap = (e) => {
    const insideScrollable = e.target && (
      e.target.closest?.(".tars-suggest") ||
      e.target.closest?.(".tars-chat-thread")
    );
    if (insideScrollable) return;
    e.preventDefault();
  };
  modal.addEventListener("wheel", _tarsScrollTrap, { passive: false });
  modal.addEventListener("touchmove", _tarsScrollTrap, { passive: false });
}
function detachScrollTrap() {
  const modal = document.getElementById("tarsModal");
  if (!modal || !_tarsScrollTrap) return;
  modal.removeEventListener("wheel", _tarsScrollTrap);
  modal.removeEventListener("touchmove", _tarsScrollTrap);
  _tarsScrollTrap = null;
}

function openChat() {
  const m = $("tarsModal");
  if (!m) return;
  m.classList.add("is-open");
  lockBodyScroll();
  attachScrollTrap();
  try { window.lenis?.stop?.(); } catch {}
  setTimeout(() => $("tarsChatInput")?.focus(), 80);
}

function closeChat() {
  $("tarsModal")?.classList.remove("is-open");
  unlockBodyScroll();
  detachScrollTrap();
  try { window.lenis?.start?.(); } catch {}
}

// boot
function init() {
  $("tarsOrb")?.addEventListener("click", openChat);
  $("tarsChatClose")?.addEventListener("click", closeChat);
  $("tarsModal")?.addEventListener("click", (e) => {
    if (e.target === $("tarsModal")) closeChat();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $("tarsModal")?.classList.contains("is-open")) closeChat();
  });

  $("tarsChatForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("tarsChatInput");
    const v = input?.value;
    if (!v?.trim()) return;
    input.value = "";
    hideSuggest();
    sendMessage(v);
  });

  document.querySelectorAll(".tars-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const q = btn.getAttribute("data-q");
      if (q) sendMessage(q);
    });
  });

  // topic dropdown
  const suggestEl = $("tarsSuggest");
  const inputEl   = $("tarsChatInput");
  const customBtn = $("tarsCustomBtn");

  const showSuggest = () => suggestEl?.classList.remove("is-hidden");
  const hideSuggest = () => suggestEl?.classList.add("is-hidden");

  suggestEl?.querySelectorAll(".tars-suggest-item:not(.tars-suggest-custom)").forEach((btn) => {
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", () => {
      const prompt = btn.getAttribute("data-prompt") || btn.textContent.trim();
      if (!prompt) return;
      if (inputEl) inputEl.value = "";
      hideSuggest();
      sendMessage(prompt);
    });
  });

  customBtn?.addEventListener("mousedown", (e) => e.preventDefault());
  customBtn?.addEventListener("click", () => {
    hideSuggest();
    inputEl?.focus();
  });

  let blurTimer = null;
  inputEl?.addEventListener("focus", () => {
    clearTimeout(blurTimer);
    showSuggest();
  });
  inputEl?.addEventListener("blur", () => {
    blurTimer = setTimeout(() => {
      if (!suggestEl || !suggestEl.contains(document.activeElement)) hideSuggest();
    }, 160);
  });

  // scroll isolation
  function trapScroll(el) {
    if (!el) return;
    el.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const max = el.scrollHeight - el.clientHeight;
        if (max <= 0) return;
        const next = Math.max(0, Math.min(max, el.scrollTop + e.deltaY));
        if (next !== el.scrollTop) el.scrollTop = next;
      },
      { passive: false },
    );
  }
  trapScroll(suggestEl);
  trapScroll($("tarsChatThread"));

  document.querySelectorAll(".tars-quick").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-go");
      QUICK_ACTIONS[key]?.();
    });
  });

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      if (currentUid) clearHistory(currentUid);
      currentUid = null;
      chat = null;
      ctx = {};
      return;
    }

    const prevUid = currentUid;
    currentUid = user.uid;
    await loadContext(user).catch((e) => console.warn("[tars] loadContext:", e));
    chat = null;
    ensureChat();

    const saved = loadHistory(currentUid);
    if (saved.length) rehydrateThreadFromHistory(saved);

    void prevUid;
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
