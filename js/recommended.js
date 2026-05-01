// js/recommended.js
// Powers the "Recommended for You" card on the student dashboard.
// Loads the student's skill profile (manual + CV-detected) from Firestore,
// scores all open internships via computeMatch, and surfaces the top 5.
// Also re-fires when the student uploads a new CV (onSnapshot on students doc).

import { auth, db } from "../firebase/firebase.js";
import {
  doc, collection, query, where, limit, getDocs, onSnapshot,
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { rebuildUserSkillSet, computeMatch } from "./lib/match.js";

const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const companyLogoCache = new Map();

async function fetchLogo(companyId) {
  if (!companyId) return "";
  if (companyLogoCache.has(companyId)) return companyLogoCache.get(companyId);
  try {
    const { getDoc } = await import("https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js");
    const snap = await getDoc(doc(db, "companies", companyId));
    const logo = snap.exists() ? (snap.data().logo || "") : "";
    companyLogoCache.set(companyId, logo);
    return logo;
  } catch { return ""; }
}

function matchColor(score) {
  if (score >= 75) return "#22c55e";
  if (score >= 50) return "#f59e0b";
  return "#94a3b8";
}

function renderCard(internship) {
  const { id, title, companyName, location, stipend, skills = [], _score } = internship;
  const scoreStr = _score !== null ? `${_score}%` : "—";
  const scoreCol = _score !== null ? matchColor(_score) : "#94a3b8";
  const skillTags = (skills || []).slice(0, 4).map((s) =>
    `<span style="font-size:10px;padding:2px 7px;border-radius:999px;background:color-mix(in srgb,var(--brand) 12%,transparent);color:var(--brand)">${esc(s)}</span>`
  ).join(" ");

  return `
    <a href="internshipdetails.html?id=${encodeURIComponent(id)}"
       style="display:block;text-decoration:none;padding:11px 13px;border-radius:12px;border:1px solid color-mix(in srgb,var(--text) 10%,transparent);transition:border-color .18s,background .18s"
       onmouseover="this.style.background='color-mix(in srgb,var(--brand) 5%,transparent)';this.style.borderColor='rgba(124,107,255,0.28)'"
       onmouseout="this.style.background='';this.style.borderColor=''">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
        <div style="min-width:0">
          <p style="margin:0;font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(title)}</p>
          <p style="margin:2px 0 0;font-size:11.5px;opacity:0.6">${esc(companyName)}${location ? ` · ${esc(location)}` : ""}</p>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <span style="font-size:13px;font-weight:800;color:${scoreCol}">${scoreStr}</span>
          <p style="margin:0;font-size:10px;opacity:0.45">match</p>
        </div>
      </div>
      ${skillTags ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:7px">${skillTags}</div>` : ""}
      ${stipend ? `<p style="margin:5px 0 0;font-size:11px;opacity:0.5">₹${esc(String(stipend))} / month</p>` : ""}
    </a>`;
}

async function loadRecommendations(uid) {
  const card = $("recommendedCard");
  const list = $("recommendedList");
  const foot = $("recommendedFoot");
  if (!card || !list) return;

  try {
    // 1. Load student skill profile
    const { getDoc } = await import("https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js");
    const sSnap = await getDoc(doc(db, "students", uid));
    if (!sSnap.exists()) return;
    const studentData = sSnap.data();
    const skillSet = rebuildUserSkillSet(studentData);

    // No skills at all — hide the panel
    if (!skillSet.size) { card.style.display = "none"; return; }

    // 2. Load open internships
    const snap = await getDocs(query(
      collection(db, "internships"),
      where("status", "==", "open"),
      limit(80),
    ));

    const scored = [];
    snap.forEach((d) => {
      const data = d.data();
      const jobSkills = data.skills || data.requiredSkills || [];
      const score = computeMatch(jobSkills, skillSet);
      // Only surface roles where we can actually compute a score (student has matching skill data)
      scored.push({
        id: d.id,
        title: data.title || "Internship",
        companyName: data.companyName || "",
        location: data.location || "",
        stipend: data.stipend || "",
        skills: jobSkills,
        _score: score,
      });
    });

    // Sort: scored first (desc), then unscored
    scored.sort((a, b) => {
      if (a._score === null && b._score === null) return 0;
      if (a._score === null) return 1;
      if (b._score === null) return -1;
      return b._score - a._score;
    });

    const top = scored.slice(0, 5);
    if (!top.length) { card.style.display = "none"; return; }

    list.innerHTML = top.map(renderCard).join("");
    card.style.display = "";
    if (foot) foot.style.display = "";

    // Chip: show best match %
    const chip = $("recommendedChip");
    const best = top[0]?._score;
    if (chip && best !== null) {
      chip.textContent = `${best}% top match`;
      chip.style.background = "rgba(124,107,255,0.14)";
      chip.style.color = "var(--brand)";
    }
  } catch (e) {
    console.warn("[recommended]", e?.message);
    const card = $("recommendedCard");
    if (card) card.style.display = "none";
  }
}

function init() {
  onAuthStateChanged(auth, (user) => {
    if (!user) return;

    // Initial load
    loadRecommendations(user.uid);

    // Re-fire whenever the student doc changes (new CV upload updates detectedSkills)
    onSnapshot(doc(db, "students", user.uid), () => {
      loadRecommendations(user.uid);
    }, () => { /* ignore errors — non-critical */ });
  });
}

document.readyState === "loading"
  ? document.addEventListener("DOMContentLoaded", init)
  : init();
