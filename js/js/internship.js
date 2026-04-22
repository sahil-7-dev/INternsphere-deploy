// js/internship.js

import { requireAuth } from "./guard.js";
requireAuth("login.html");

import { auth, db } from "../firebase/firebase.js";
import {
  collection,
  onSnapshot,
  query,
  where,
  doc,
  getDoc,
  setDoc,
  arrayUnion,
  arrayRemove,
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";

const myAppStatus = {};

const savedSet = new Set();
let showSavedOnly = false;
let currentUid = null;

const companyLogoCache = new Map();
const companyLogoInFlight = new Set();

import { rebuildUserSkillSet as _rebuildUserSkillSet, computeMatch as _computeMatch }
  from "./lib/match.js";

let userSkillSet = new Set();
// Generic CV-relevance score from resumeAnalysis.skillsMatch (0-100).
// Used as a fallback when we can't compute a precise per-internship match
// (e.g. the internship lists no skills, or the student has manual skills
// only and they don't intersect this particular role).
let resumeSkillsMatch = null;

let userTouchedSort = false;

function rebuildUserSkillSet(studentData) {
  userSkillSet = _rebuildUserSkillSet(studentData);
  const ra = studentData?.resumeAnalysis;
  resumeSkillsMatch = (ra && typeof ra.skillsMatch === "number")
    ? Math.max(0, Math.min(100, Math.round(ra.skillsMatch)))
    : null;
}

// Returns 0-100 (precise per-internship), the global resumeSkillsMatch as
// a fallback, or null if we genuinely have nothing to score against.
function computeMatch(jobSkills) {
  const precise = _computeMatch(jobSkills, userSkillSet);
  if (precise !== null) return precise;
  if (resumeSkillsMatch !== null) return resumeSkillsMatch;
  return null;
}

async function hydrateCompanyLogo(companyId) {
  if (!companyId) return;
  if (companyLogoCache.has(companyId)) {
    paintCompanyLogos(companyId, companyLogoCache.get(companyId).logo);
    return;
  }
  if (companyLogoInFlight.has(companyId)) return;
  companyLogoInFlight.add(companyId);
  try {
    const snap = await getDoc(doc(db, "companies", companyId));
    const logo = snap.exists() ? (snap.data().logo || "") : "";
    companyLogoCache.set(companyId, { logo });
    paintCompanyLogos(companyId, logo);
  } catch (e) {
    console.warn("[logo]", companyId, e?.message);
    companyLogoCache.set(companyId, { logo: "" });
  } finally {
    companyLogoInFlight.delete(companyId);
  }
}

function paintCompanyLogos(companyId, logoUrl) {
  if (!logoUrl) return;
  if (!/^(https?:|data:|\/|\.\/|\.\.\/)/i.test(String(logoUrl))) return;

  document.querySelectorAll(`.logo[data-company-id="${CSS.escape(companyId)}"]`).forEach((el) => {
    el.classList.add("has-logo");
    el.textContent = "";
    const img = document.createElement("img");
    img.src = logoUrl;
    img.alt = "";
    img.loading = "lazy";
    img.addEventListener("error", () => img.remove(), { once: true });
    el.appendChild(img);
  });
}

// stats header
function repaintStatsHeader(visibleJobs) {
  const savedEl = document.getElementById("savedCount");
  if (savedEl) savedEl.textContent = String(savedSet.size);

  const avgEl = document.getElementById("avgMatch");
  if (!avgEl) return;
  // Only count jobs that actually scored — null means we couldn't compute
  // a match, including it as 0 would skew the average.
  const withMatch = (visibleJobs || []).filter((j) => typeof j.match === "number");
  if (!withMatch.length) {
    avgEl.textContent = "—";
    return;
  }
  const avg = withMatch.reduce((sum, j) => sum + j.match, 0) / withMatch.length;
  avgEl.textContent = Math.round(avg) + "%";
}

const DYNAMIC_IMAGES = [
  "alex-kotliarskyi-QBpZGqEMsKg-unsplash.jpg",
  "ant-rozetsky-HXOllTSwrpM-unsplash.jpg",
  "austin-distel-mpN7xjKQ_Ns-unsplash.jpg",
  "austin-distel-wD1LRb9OeEo-unsplash.jpg",
  "campaign-creators-gMsnXqILjp4-unsplash.jpg",
  "campaign-creators-qCi_MzVODoU-unsplash.jpg",
  "charlesdeluvio-Lks7vei-eAg-unsplash.jpg",
  "christina-wocintechchat-com-m-faEfWCdOKIg-unsplash.jpg",
  "mario-gogh-VBLHICVh-lI-unsplash.jpg",
];

function pickDynamicImage(seed) {
  const s = String(seed || Math.random());
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  const idx = Math.abs(h) % DYNAMIC_IMAGES.length;
  return "assets/images/dynamic/" + DYNAMIC_IMAGES[idx];
}

document.addEventListener("DOMContentLoaded", () => {

  const searchInput = document.getElementById("searchInput");
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      searchInput?.focus();
    }
  });

  // ui elements
  const cards       = document.getElementById("cards");
  const resultCount = document.getElementById("resultCount");
  const keyword     = document.getElementById("keyword");
  const locationSel = document.getElementById("location");
  const sortBy      = document.getElementById("sortBy");
  const applyBtn    = document.getElementById("applyFilters");
  const resetBtn    = document.getElementById("resetFilters");
  const clearBtn    = document.getElementById("clearFilters");

  // url param
  const params      = new URLSearchParams(window.location.search);
  const searchQuery = (params.get("search") || "").trim();

  // state
  let jobs = [];

  let state = {
    keyword:  "",
    location: "",
    type:     "",
    duration: "",
    skills:   new Set(),
    sort:     "latest",
  };

  // helpers
  function safe(str) {
    return String(str ?? "").replace(/[<>&"]/g, (c) => ({
      "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;"
    }[c]));
  }

  function durationLabel(d) {
    if (d === "1-2") return "1–2 mo";
    if (d === "3-4") return "3–4 mo";
    if (d === "6+")  return "6+ mo";
    return d || "Any";
  }

  function mapDocToJob(id, d) {
    let skills = [];
    if (Array.isArray(d.skills)) {
      skills = d.skills;
    } else if (typeof d.skills === "string" && d.skills.trim()) {
      skills = d.skills.split(",").map((s) => s.trim()).filter(Boolean);
    }

    return {
      id,
      companyId:   d.companyId   || null,
      company:     d.companyName || d.company || "Unknown",
      role:        d.title       || "Intern",
      location:    d.location    || "Remote",
      type:        (d.type       || "remote").toLowerCase(),
      duration:    d.durationKey || d.duration || "3-4",
      // null = unknown (no CV analyzed and no manual skills) — render
      // hides the badge instead of lying with a 70% default.
      match:       null,
      desc:        d.desc        || d.description || "No description provided.",
      skills,
      status:      d.status      || "Open",
    };
  }

  // render
  function render(list) {
    if (!cards) return;

    cards.innerHTML = "";
    if (resultCount) resultCount.textContent = String(list.length);

    if (!list.length) return;

    list.forEach((j) => {
      const el = document.createElement("article");
      el.className = "job";

      const myStatus = myAppStatus[j.id];
      let statusTag = "";
      let ctaText = "View";
      let jobExtraClass = "";
      if (myStatus === "Approved") {
        statusTag = `<span class="tag status-tag status-joined">✓ Joined</span>`;
        ctaText = "Open";
        jobExtraClass = "is-joined";
      } else if (myStatus === "Shortlisted") {
        statusTag = `<span class="tag status-tag status-shortlisted">⭐ Shortlisted</span>`;
        ctaText = "View";
        jobExtraClass = "is-applied";
      } else if (myStatus === "Pending") {
        statusTag = `<span class="tag status-tag status-applied">✓ Applied</span>`;
        ctaText = "View";
        jobExtraClass = "is-applied";
      } else if (myStatus === "Rejected") {
        statusTag = `<span class="tag status-tag status-rejected">Not selected</span>`;
      }

      if (jobExtraClass) el.classList.add(jobExtraClass);

      const heroImg = j.heroImage && String(j.heroImage).trim()
        ? j.heroImage
        : pickDynamicImage(j.id || j.role || Math.random());

      el.innerHTML = `
        <div class="job-img-wrap" aria-hidden="true">
          <img class="job-img" src="${heroImg}" alt="" loading="lazy"
               onerror="this.parentElement.style.display='none'">
        </div>
        <div class="job-top">
          <div class="company">
            <div class="logo" data-company-id="${safe(j.companyId || "")}">${safe(j.company).slice(0, 1).toUpperCase()}</div>
            <div>
              <b>${safe(j.role)}</b>
              <small>${safe(j.company)} • ${safe(j.location)}</small>
            </div>
          </div>
          ${typeof j.match === "number"
            ? `<div class="match"><b>${j.match}%</b><div class="muted">match</div></div>`
            : `<div class="match match--unknown" title="Add your skills or analyze your CV to see a match score"><b>—</b><div class="muted">match</div></div>`
          }
        </div>

        <div class="tags">
          ${statusTag}
          <span class="tag ${j.type === "remote" ? "good" : j.type === "hybrid" ? "mid" : ""}">
            ${safe(j.type).toUpperCase()}
          </span>
          <span class="tag">${safe(durationLabel(j.duration))}</span>
          ${statusTag ? "" : `<span class="tag">Apply in 1 click</span>`}
        </div>

        <p class="desc">${safe(j.desc)}</p>

        <div class="job-foot">
          <div class="skills">
            ${j.skills.slice(0, 3).map((s) => `<span class="skill">${safe(s)}</span>`).join("")}
          </div>
          <div class="actions">
            <button class="icon report-link"
                    type="button"
                    data-report-id="${encodeURIComponent(j.id)}"
                    data-report-label="${safe((j.role || "") + " · " + (j.company || ""))}"
                    title="Report this internship"
                    aria-label="Report this internship">⚑</button>
            <button class="icon save-star ${savedSet.has(j.id) ? 'is-saved' : ''}"
                    type="button"
                    data-save-id="${encodeURIComponent(j.id)}"
                    title="${savedSet.has(j.id) ? 'Saved — click to remove' : 'Save for later'}"
                    aria-pressed="${savedSet.has(j.id) ? 'true' : 'false'}">
              ${savedSet.has(j.id) ? '★' : '☆'}
            </button>
            <a class="btn btn-primary"
               href="internship-detailss.html?id=${encodeURIComponent(j.id)}&companyId=${encodeURIComponent(j.companyId || '')}${j.heroImage ? `&hero=${encodeURIComponent(j.heroImage)}` : ''}">
              ${ctaText}
            </a>
          </div>
        </div>
      `;
      cards.appendChild(el);
    });

    const uniqueCompanyIds = new Set(list.map((j) => j.companyId).filter(Boolean));
    uniqueCompanyIds.forEach((id) => hydrateCompanyLogo(id));

    repaintStatsHeader(list);
  }

  // filtering
  function filterJobs() {
    let list = [...jobs];

    if (showSavedOnly) {
      list = list.filter((j) => savedSet.has(j.id));
    }

    const topSearch = (searchInput?.value || "").trim().toLowerCase();
    if (topSearch) {
      list = list.filter((j) =>
        `${j.role} ${j.company} ${j.location} ${j.desc} ${j.skills.join(" ")}`
          .toLowerCase()
          .includes(topSearch)
      );
    }

    if (state.keyword) {
      const k = state.keyword.toLowerCase();
      list = list.filter((j) =>
        `${j.role} ${j.company} ${j.desc} ${j.skills.join(" ")}`
          .toLowerCase()
          .includes(k)
      );
    }

    if (state.location) {
      list = list.filter((j) => j.location === state.location);
    }

    if (state.type) {
      list = list.filter((j) => j.type === state.type);
    }

    if (state.duration) {
      list = list.filter((j) => {
        const val = String(j.duration || "").toLowerCase();
        const num = parseInt(val.match(/\d+/)?.[0] || "0", 10);
        if (state.duration === "1-2") return num >= 1 && num <= 2;
        if (state.duration === "3-4") return num >= 3 && num <= 4;
        if (state.duration === "6+")  return num >= 6;
        return true;
      });
    }

    if (state.skills.size) {
      list = list.filter((j) => {
        const lower = j.skills.map((x) => String(x).toLowerCase());
        // state.skills may contain mixed-case entries from data-skill
        // attributes; compare lowercase-to-lowercase to avoid false misses.
        return [...state.skills].every((s) =>
          lower.includes(String(s).toLowerCase())
        );
      });
    }

    list.forEach((j) => {
      // Always overwrite — null clears any stale value when the student
      // hasn't analyzed their CV yet.
      j.match = computeMatch(j.skills);
    });

    if (state.sort === "match") {
      // null sorts last; same scores keep their order via stable sort.
      list.sort((a, b) => {
        const am = typeof a.match === "number" ? a.match : -1;
        const bm = typeof b.match === "number" ? b.match : -1;
        return bm - am;
      });
    }

    if (state.sort === "company") {
      list.sort((a, b) => a.company.localeCompare(b.company));
    }

    render(list);
  }

  // chip groups — each click also re-runs the filter so the list updates
  // immediately. Previous version mutated state but never triggered a
  // re-render, so chip filters silently did nothing.
  function setupChipGroup(selector, key, attr) {
    const chips = document.querySelectorAll(selector);
    chips.forEach((c) => {
      c.addEventListener("click", () => {
        chips.forEach((x) => x.classList.remove("active"));
        c.classList.add("active");
        state[key] = c.getAttribute(attr) || "";
        filterJobs();
      });
    });
  }

  setupChipGroup(".chip[data-type]",     "type",     "data-type");
  setupChipGroup(".chip[data-duration]", "duration", "data-duration");

  document.querySelectorAll(".chip[data-skill]").forEach((c) => {
    c.addEventListener("click", () => {
      const s = c.getAttribute("data-skill");
      if (!s) return;
      c.classList.toggle("active");
      if (state.skills.has(s)) state.skills.delete(s);
      else state.skills.add(s);
      filterJobs();
    });
  });

  sortBy?.addEventListener("change", () => {
    userTouchedSort = true;
    state.sort = sortBy.value || "latest";
    filterJobs();
  });

  // apply / reset
  applyBtn?.addEventListener("click", () => {
    state.keyword  = keyword?.value.trim() || "";
    state.location = locationSel?.value    || "";
    state.sort     = sortBy?.value         || "latest";
    userTouchedSort = true;
    filterJobs();
  });

  resetBtn?.addEventListener("click", () => {
    state = { keyword: "", location: "", type: "", duration: "", skills: new Set(), sort: "latest" };

    if (keyword)     keyword.value     = "";
    if (locationSel) locationSel.value = "";
    if (sortBy)      sortBy.value      = "latest";
    if (searchInput) searchInput.value = "";

    document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
    document.querySelectorAll('.chip[data-type=""], .chip[data-duration=""]')
      .forEach((c) => c.classList.add("active"));

    filterJobs();
  });

  clearBtn?.addEventListener("click", () => resetBtn?.click());

  searchInput?.addEventListener("input", filterJobs);

  // firestore
  const q = query(collection(db, "internships"));

  onSnapshot(q, (snap) => {
    jobs = snap.docs
      .map((d) => mapDocToJob(d.id, d.data()))
      .filter((j) => j.status === "Open");

    if (searchQuery && searchInput) {
      searchInput.value = searchQuery;
    }

    filterJobs();
  }, (err) => {
    console.error("Firestore error:", err);
    if (cards) {
      cards.innerHTML = `<div class="muted" style="padding:14px;">Error loading internships.</div>`;
    }
  });

  onAuthStateChanged(auth, (user) => {
    if (!user) return;
    currentUid = user.uid;

    const appsQ = query(
      collection(db, "applications"),
      where("studentId", "==", user.uid),
    );
    onSnapshot(appsQ, (snap) => {
      for (const k of Object.keys(myAppStatus)) delete myAppStatus[k];
      snap.forEach((d) => {
        const data = d.data();
        if (!data.internshipId) return;
        const prev = myAppStatus[data.internshipId];
        if (!prev || prev === "Rejected") {
          myAppStatus[data.internshipId] = data.status || "Pending";
        }
      });
      if (jobs.length) filterJobs();
    });

    onSnapshot(doc(db, "students", user.uid), (snap) => {
      const studentData = snap.exists() ? snap.data() : {};
      savedSet.clear();
      const saved = studentData.savedInternships || [];
      saved.forEach((id) => savedSet.add(id));
      updateSavedToggleLabel();

      const prevSize = userSkillSet.size;
      rebuildUserSkillSet(studentData);
      if (
        prevSize === 0 &&
        userSkillSet.size >= 3 &&
        !userTouchedSort &&
        sortBy &&
        sortBy.value === "latest"
      ) {
        sortBy.value = "match";
        state.sort = "match";
      }

      if (jobs.length) filterJobs();
    });
  });

  // report handler
  cards?.addEventListener("click", (e) => {
    const btn = e.target.closest?.(".report-link");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const id    = decodeURIComponent(btn.getAttribute("data-report-id") || "");
    const label = btn.getAttribute("data-report-label") || "";
    if (!id || !window.reportTarget) return;
    window.reportTarget("internship", id, label);
  });

  // save toggle
  cards?.addEventListener("click", async (e) => {
    const btn = e.target.closest?.(".save-star");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();

    if (!currentUid) {
      alert("Please log in to save this role.");
      return;
    }

    const id = decodeURIComponent(btn.getAttribute("data-save-id") || "");
    if (!id) return;

    const wasSaved = savedSet.has(id);
    btn.disabled = true;

    if (wasSaved) savedSet.delete(id); else savedSet.add(id);
    paintStar(btn, !wasSaved);
    updateSavedToggleLabel();

    try {
      await setDoc(
        doc(db, "students", currentUid),
        { savedInternships: wasSaved ? arrayRemove(id) : arrayUnion(id) },
        { merge: true },
      );
    } catch (err) {
      console.error("[save] write:", err);
      if (wasSaved) savedSet.add(id); else savedSet.delete(id);
      paintStar(btn, wasSaved);
      updateSavedToggleLabel();
      alert("Could not update your saved list. Try again.");
    } finally {
      btn.disabled = false;
    }
  });

  // saved-only toggle
  const savedToggleEl = document.getElementById("savedToggle");
  savedToggleEl?.addEventListener("click", () => {
    showSavedOnly = !showSavedOnly;
    savedToggleEl.setAttribute("aria-pressed", showSavedOnly ? "true" : "false");
    savedToggleEl.classList.toggle("is-active", showSavedOnly);
    updateSavedToggleLabel();
    filterJobs();
  });

  function paintStar(btn, isSaved) {
    btn.classList.toggle("is-saved", !!isSaved);
    btn.setAttribute("aria-pressed", isSaved ? "true" : "false");
    btn.title = isSaved ? "Saved — click to remove" : "Save for later";
    btn.textContent = isSaved ? "★" : "☆";
  }

  function updateSavedToggleLabel() {
    const lbl = document.getElementById("savedToggleLabel");
    if (!lbl) return;
    const icon = showSavedOnly ? "★" : "☆";
    lbl.textContent = `${icon} Saved (${savedSet.size})`;
  }

  render([]);
});

// tap highlight
document.addEventListener("click", (e) => {
  const card = e.target.closest?.(".job");
  if (!card) return;
  card.classList.add("tap-highlight");
  clearTimeout(card.__tapT);
  card.__tapT = setTimeout(() => card.classList.remove("tap-highlight"), 1800);
});

// profile dropdown
document.addEventListener("DOMContentLoaded", () => {
  const profileBtn = document.querySelector(".profile");
  const dropdown   = document.querySelector(".profile-dropdown");

  if (!profileBtn || !dropdown) return;

  profileBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.classList.toggle("hidden");
  });

  document.addEventListener("click", (e) => {
    if (!dropdown.contains(e.target) && !profileBtn.contains(e.target)) {
      dropdown.classList.add("hidden");
    }
  });

  document.getElementById("goProfile")?.addEventListener("click", () => {
    window.location.href = "/profile.html";
  });

  document.getElementById("goSettings")?.addEventListener("click", () => {
    document.getElementById("settingsModal")?.classList.add("show");
  });

  document.getElementById("logoutBtn")?.addEventListener("click", async () => {
    const { signOut } = await import("https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js");
    const { auth }    = await import("../firebase/firebase.js");
    await signOut(auth);
    localStorage.removeItem("currentUser");
    window.location.href = "./login.html";
  });
});
