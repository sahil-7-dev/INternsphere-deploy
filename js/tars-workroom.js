// js/tars-workroom.js

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
  askGeminiJson,
  friendlyGeminiError,
} from "./gemini.js";
import {
  composeSystemPrompt,
  loadHistory,
  saveHistory,
  clearHistory,
} from "./tars-core.js";

const $ = (id) => document.getElementById(id);

// state
let currentUid = null;
let ctx = {};

// system prompt
function buildSystemPrompt() {
  const state = [
    ctx.internshipTitle && `Active internship: ${ctx.internshipTitle} at ${ctx.companyName || "company"}`,
    ctx.taskCount !== undefined && `Total tasks: ${ctx.taskCount}`,
    ctx.tasksDone !== undefined && `Tasks submitted (not rejected): ${ctx.tasksDone}`,
    ctx.finalTaskTitle && `Final task: "${ctx.finalTaskTitle}" — internship completes when this is submitted.`,
  ].filter(Boolean).join("\n");

  const pageLines = [
    "Student is inside the Virtual Workroom, a focused workspace to write and submit task responses.",
    ctx.activeTaskTitle && `Currently viewing task: "${ctx.activeTaskTitle}"`,
    ctx.activeTaskDescription && `Task brief: ${ctx.activeTaskDescription}`,
    ctx.activeTaskRequiresPdf && "This task requires a PDF attachment.",
    ctx.activeTaskStatus && `Submission status: ${ctx.activeTaskStatus}`,
    "",
    "EDITING CAPABILITY: when the student asks you to edit the document (e.g. 'fix grammar', 'make it formal', 'improve wording', 'rewrite this', 'draft a starter', 'create a document based on the task'), use `action: \"edit\"` and return the full new document HTML in `editedContent`. Preserve the student's voice where possible; only change what they asked you to change.",
    "EDITOR STATE: current editor content (HTML) is provided as {{EDITOR_CONTENT}}.",
  ].filter(Boolean).join("\n");

  return composeSystemPrompt({
    studentName: ctx.studentName,
    studentState: state,
    pageContext: pageLines,
  });
}

// router schema
const routerSchema = {
  type: "object",
  properties: {
    action: {
      type: "string",
      description:
        "'edit' if the user asked you to modify the editor content (grammar, rewording, reformatting, creating/drafting a new document). 'chat' if it's a regular question or conversation.",
      enum: ["edit", "chat"],
    },
    reply: {
      type: "string",
      description:
        "Short 1-2 sentence message to show the student in the chat. If editing, describe what you changed.",
    },
    editedContent: {
      type: "string",
      description:
        "When action=edit: the FULL new editor HTML. Preserve formatting where possible (<p>, <strong>, <em>, <u>, <ul><li>). Otherwise leave empty.",
    },
  },
  required: ["action", "reply"],
};

// context loader
async function loadContext(user) {
  ctx = { studentName: user.displayName || "" };

  try {
    const sSnap = await getDoc(doc(db, "students", user.uid));
    if (sSnap.exists()) ctx.studentName = sSnap.data().name || ctx.studentName;
  } catch {}

  try {
    const appsSnap = await getDocs(query(
      collection(db, "applications"),
      where("studentId", "==", user.uid),
      where("status", "==", "Approved"),
    ));
    if (appsSnap.empty) return;

    const app = appsSnap.docs[0].data();
    ctx.internshipId = app.internshipId;

    const intSnap = await getDoc(doc(db, "internships", app.internshipId));
    if (intSnap.exists()) {
      ctx.internshipTitle = intSnap.data().title;
      ctx.companyName = intSnap.data().companyName || "";
    }

    const tasksSnap = await getDocs(query(
      collection(db, "tasks"),
      where("internshipId", "==", app.internshipId),
    ));
    ctx.taskCount = tasksSnap.size;

    const tasks = tasksSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const finalTask = tasks.find((t) => t.isFinal);
    if (finalTask) ctx.finalTaskTitle = finalTask.title;

    const subsSnap = await getDocs(query(
      collection(db, "taskSubmissions"),
      where("studentId", "==", user.uid),
      where("internshipId", "==", app.internshipId),
    ));
    ctx.tasksDone = subsSnap.docs.filter((d) => {
      return d.data().feedback?.status !== "rejected";
    }).length;

    const subsByTask = {};
    subsSnap.forEach((d) => { subsByTask[d.data().taskId] = d.data(); });
    tasks.sort((a, b) => (a.order || 0) - (b.order || 0));
    const active = tasks.find((t) => {
      const s = subsByTask[t.id];
      return !s || s.feedback?.status === "rejected";
    }) || tasks[0];

    if (active) {
      ctx.activeTaskTitle = active.title;
      ctx.activeTaskDescription = active.description;
      ctx.activeTaskRequiresPdf = !!active.requirePdf;
      const s = subsByTask[active.id];
      if (!s) ctx.activeTaskStatus = "not yet submitted";
      else if (s.feedback?.status === "rejected") ctx.activeTaskStatus = "rejected — awaiting revision";
      else if (s.feedback?.score != null) ctx.activeTaskStatus = `approved (score ${s.feedback.score}/100)`;
      else ctx.activeTaskStatus = "submitted, awaiting review";
    }
  } catch (e) {
    console.warn("[tars-workroom] loadContext:", e);
  }
}

// chat UI helpers
function hideEmptyState() {
  const empty = $("console")?.querySelector(".console-empty");
  if (empty) empty.remove();
}
function showEmptyStateIfNeeded() {
  const consoleBox = $("console");
  if (!consoleBox) return;
  if (consoleBox.querySelectorAll(".msg").length > 0) return;

  const TEXT = "Ask TARS anything — or try 'fix grammar', 'make this formal', 'draft a starter'.";
  let empty = consoleBox.querySelector(".console-empty");
  if (empty) {
    // Existing empty-state was created by virtualworkroom.js — update its text
    // instead of appending a duplicate.
    empty.textContent = TEXT;
    return;
  }
  empty = document.createElement("div");
  empty.className = "console-empty";
  empty.textContent = TEXT;
  consoleBox.appendChild(empty);
}

function appendMsg(text, from = "bot", { typed = false } = {}) {
  const consoleBox = $("console");
  if (!consoleBox) return null;
  hideEmptyState();
  const el = document.createElement("div");
  el.className = "msg " + from;
  consoleBox.appendChild(el);
  if (typed) {
    el.classList.add("typing");
    let i = 0;
    (function type() {
      if (i < text.length) {
        el.textContent += text[i++];
        setTimeout(type, 10);
      } else {
        el.classList.remove("typing");
      }
    })();
  } else {
    el.textContent = text;
  }
  consoleBox.scrollTop = consoleBox.scrollHeight;
  return el;
}

function appendEditNotice(reply) {
  const consoleBox = $("console");
  if (!consoleBox) return;
  hideEmptyState();
  const el = document.createElement("div");
  el.className = "msg bot tars-edit-notice";
  el.innerHTML =
    '<span style="display:inline-flex;align-items:center;gap:6px;font-weight:700;color:#a855f7;margin-right:6px">✦ Edited your document</span>' +
    escapeHtml(reply);
  consoleBox.appendChild(el);
  consoleBox.scrollTop = consoleBox.scrollHeight;
}

function appendTyping() {
  const consoleBox = $("console");
  if (!consoleBox) return null;
  hideEmptyState();
  const el = document.createElement("div");
  el.className = "msg bot tars-typing";
  el.textContent = "•••";
  consoleBox.appendChild(el);
  consoleBox.scrollTop = consoleBox.scrollHeight;
  return el;
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function rehydrateThread(entries) {
  const consoleBox = $("console");
  if (!consoleBox || !entries?.length) {
    showEmptyStateIfNeeded();
    return;
  }
  if (consoleBox.querySelector(".msg.user")) return;

  consoleBox.innerHTML = "";
  for (const e of entries) {
    const text = e.parts?.map((p) => p.text || "").join("").trim();
    if (!text) continue;
    appendMsg(text, e.role === "user" ? "user" : "bot");
  }
}

// send flow
async function sendMessage(text) {
  const clean = (text || "").trim();
  if (!clean) return;
  const sendBtn = $("send");

  appendMsg(clean, "user");
  const typing = appendTyping();
  if (sendBtn) sendBtn.disabled = true;

  try {
    const editorHtml = window.WorkroomEditor?.getContent() || "";
    const editorIsEmpty = window.WorkroomEditor?.isEmpty() ?? true;

    const system = buildSystemPrompt().replace(
      "{{EDITOR_CONTENT}}",
      editorHtml || "(empty — student hasn't written anything yet)",
    );

    const userPrompt = [
      clean,
      "",
      "--- CURRENT EDITOR HTML ---",
      editorHtml || "(empty)",
      editorIsEmpty
        ? "\n(Editor is empty. If asked to draft/create a starter, populate it with action=edit and rich HTML.)"
        : "",
    ].filter(Boolean).join("\n");

    const prior = loadHistory(currentUid).slice(-40);

    const data = await askGeminiJson({
      prompt: userPrompt,
      system,
      schema: routerSchema,
      history: prior,
      temperature: 0.55,
      maxTokens: 8000,
    });

    typing?.remove();

    if (
      data.action === "edit" &&
      data.editedContent &&
      window.WorkroomEditor?.isEditable()
    ) {
      const applyFn =
        window.WorkroomEditor.replaceContentAnimated ||
        window.WorkroomEditor.replaceContent;
      applyFn.call(window.WorkroomEditor, data.editedContent);
      appendEditNotice(data.reply || "I updated the document.");
    } else if (data.action === "edit" && !window.WorkroomEditor?.isEditable()) {
      appendMsg(
        "(This task is locked — it's already submitted, so I can't edit. " +
          (data.reply || "") +
          ")",
        "bot",
      );
    } else {
      appendMsg(data.reply || "(no response)", "bot", { typed: true });
    }

    const merged = prior.concat([
      { role: "user",  parts: [{ text: clean }] },
      { role: "model", parts: [{ text: data.reply || "" }] },
    ]);
    saveHistory(currentUid, merged);
  } catch (e) {
    console.error("[tars-workroom]", e);
    typing?.remove();

    if (e.partialReply) {
      appendMsg(e.partialReply, "bot");
      appendMsg(
        "(The full edit got cut off — ask me again and I'll continue.)",
        "bot",
      );
    } else {
      const err = document.createElement("div");
      err.className = "msg bot";
      err.style.color = "#fca5a5";
      err.textContent = friendlyGeminiError(e);
      $("console")?.appendChild(err);
    }
  } finally {
    if (sendBtn) sendBtn.disabled = false;
  }
}

// wiring
function init() {
  const consoleBox = $("console");
  const inputField = $("input");
  const sendBtn = $("send");
  const suggest = $("tarsSuggest");
  const customBtn = $("tarsCustomBtn");
  if (!consoleBox || !inputField || !sendBtn) return;

  consoleBox.querySelectorAll(".msg.bot").forEach((el) => {
    if (/system initialized/i.test(el.textContent || "")) el.remove();
  });
  showEmptyStateIfNeeded();

  // suggestion panel
  let blurHideTimer = null;

  const showSuggest = () => suggest?.classList.remove("is-hidden");
  const hideSuggest = () => suggest?.classList.add("is-hidden");

  suggest?.querySelectorAll(".tars-suggest-item:not(.tars-suggest-custom)").forEach((btn) => {
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", () => {
      const prompt = btn.getAttribute("data-prompt") || btn.textContent.trim();
      if (!prompt) return;
      inputField.value = "";
      hideSuggest();
      sendMessage(prompt);
    });
  });

  customBtn?.addEventListener("mousedown", (e) => e.preventDefault());
  customBtn?.addEventListener("click", () => {
    hideSuggest();
    inputField.focus();
  });

  inputField.addEventListener("focus", () => {
    clearTimeout(blurHideTimer);
    showSuggest();
  });

  inputField.addEventListener("blur", () => {
    blurHideTimer = setTimeout(() => {
      if (!suggest || !suggest.contains(document.activeElement)) {
        hideSuggest();
      }
    }, 150);
  });

  const handleSend = () => {
    const v = inputField.value?.trim();
    if (!v) return;
    inputField.value = "";
    hideSuggest();
    sendMessage(v);
  };

  sendBtn.addEventListener("click", handleSend);
  inputField.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  $("clearChat")?.addEventListener("click", () => {
    consoleBox.style.opacity = "0";
    setTimeout(() => {
      consoleBox.innerHTML = "";
      consoleBox.style.opacity = "1";
      showEmptyStateIfNeeded();
      clearHistory(currentUid);
      hideSuggest();
    }, 200);
  });

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      if (currentUid) clearHistory(currentUid);
      currentUid = null;
      ctx = {};
      return;
    }
    currentUid = user.uid;
    await loadContext(user);
    rehydrateThread(loadHistory(currentUid));
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
