// js/internship-qa.js

import { createChat, friendlyGeminiError } from "./gemini.js";

const $ = (id) => document.getElementById(id);

function getInternshipSnapshot() {
  const base = window.__internship || {};
  const title = base.title || document.querySelector(".hero-title")?.textContent?.trim() || "";
  const company = base.companyName || "";
  const desc = document.querySelector(".hero-subtitle")?.textContent?.trim() || "";
  const meta = document.querySelectorAll(".hero-meta .meta-value") || [];
  const dept = meta[0]?.textContent?.trim() || "";
  const loc = meta[1]?.textContent?.trim() || "";
  const stipend = meta[2]?.textContent?.trim() || "";
  const mini = document.querySelectorAll(".mini-grid .mini-value") || [];
  const duration = mini[1]?.textContent?.trim() || "";

  const skillEls = document.querySelectorAll(".bullets li");
  const otherText = Array.from(skillEls).map((el) => el.textContent?.trim()).filter(Boolean).slice(0, 25).join(" · ");

  return { title, company, desc, dept, loc, stipend, duration, otherText };
}

function buildSystemPrompt() {
  const s = getInternshipSnapshot();
  return [
    `You are the InternSphere AI assistant helping a student decide whether to apply and how to prepare for a specific internship.`,
    `Ground all answers in the internship details below. If the student asks something not in the details, answer based on general industry knowledge, but first say "I don't have that in the listing — my best guess is…" Be concise (under 120 words unless asked otherwise). Never promise interview outcomes or guarantee acceptance.`,
    ``,
    `--- INTERNSHIP DETAILS ---`,
    s.title && `Role: ${s.title}`,
    s.company && `Company: ${s.company}`,
    s.dept && `Department: ${s.dept}`,
    s.loc && `Location: ${s.loc}`,
    s.duration && `Duration: ${s.duration}`,
    s.stipend && `Stipend: ${s.stipend}`,
    s.desc && `Description: ${s.desc}`,
    s.otherText && `Additional bullets: ${s.otherText}`,
  ].filter(Boolean).join("\n");
}

let chat = null;

function appendMessage(text, from = "bot") {
  const thread = $("qaThread");
  if (!thread) return null;
  const el = document.createElement("div");
  el.className = "tars-chat-msg tars-chat-msg-" + from;
  el.textContent = text;
  thread.appendChild(el);
  thread.scrollTop = thread.scrollHeight;
  const sugg = $("qaSuggestions");
  if (sugg) sugg.style.display = "none";
  return el;
}

function appendTyping() {
  const thread = $("qaThread");
  if (!thread) return null;
  const el = document.createElement("div");
  el.className = "tars-chat-msg tars-chat-msg-bot tars-chat-msg-typing";
  el.setAttribute("aria-live", "polite");
  thread.appendChild(el);
  thread.scrollTop = thread.scrollHeight;
  return el;
}

async function sendMessage(text) {
  const clean = (text || "").trim();
  if (!clean) return;
  if (!chat) {
    chat = createChat({
      system: buildSystemPrompt(),
      temperature: 0.7,
      maxTokens: 600,
    });
  }

  appendMessage(clean, "user");
  const typing = appendTyping();
  const sendBtn = document.querySelector(".tars-chat-send");
  if (sendBtn) sendBtn.disabled = true;

  try {
    const reply = await chat.send(clean);
    if (typing) typing.remove();
    appendMessage(reply, "bot");
  } catch (e) {
    console.error("[qa]", e);
    if (typing) typing.remove();
    const err = document.createElement("div");
    err.className = "tars-chat-msg tars-chat-msg-bot";
    err.style.borderColor = "rgba(239,68,68,0.35)";
    err.style.color = "#fca5a5";
    err.textContent = "⚠ " + friendlyGeminiError(e);
    $("qaThread").appendChild(err);
    $("qaThread").scrollTop = $("qaThread").scrollHeight;
  } finally {
    if (sendBtn) sendBtn.disabled = false;
  }
}

function openChat() {
  const m = $("qaModal");
  if (!m) return;
  m.classList.add("is-open");
  setTimeout(() => $("qaInput")?.focus(), 80);
}

function closeChat() {
  $("qaModal")?.classList.remove("is-open");
}

function init() {
  $("qaOrb")?.addEventListener("click", openChat);
  $("qaClose")?.addEventListener("click", closeChat);
  $("qaModal")?.addEventListener("click", (e) => {
    if (e.target === $("qaModal")) closeChat();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $("qaModal")?.classList.contains("is-open")) closeChat();
  });

  $("qaForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("qaInput");
    const v = input?.value;
    if (!v?.trim()) return;
    input.value = "";
    sendMessage(v);
  });

  document.querySelectorAll(".tars-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const q = btn.getAttribute("data-q");
      if (q) sendMessage(q);
    });
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
