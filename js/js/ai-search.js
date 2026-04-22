// js/ai-search.js

import { db } from "../firebase/firebase.js";
import {
  collection,
  getDocs,
  query,
  limit,
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { esc } from "./lib/escape.js";

const SEARCH_LIMIT = 100;

const orbBtn = document.getElementById("aiSearchOrb");
const profileBtn = document.getElementById("openAiSearchFromProfile");
const modal = document.getElementById("aiSearchModal");
const input = document.getElementById("aiSearchInput");
const results = document.getElementById("aiSearchResults");
const closeBtn = document.getElementById("aiSearchClose");

if (!orbBtn || !modal) {
} else {
  let all = [];
  let loaded = false;
  let activeIdx = -1;

  async function ensureLoaded() {
    if (loaded) return;
    const snap = await getDocs(query(collection(db, "internships"), limit(SEARCH_LIMIT)));
    all = [];
    snap.forEach((d) => {
      const data = d.data();
      if (data && (data.status || "Open") === "Open") {
        all.push({ id: d.id, ...data });
      }
    });
    loaded = true;
  }

  function render(list) {
    if (!results) return;
    if (!list.length) {
      results.innerHTML = `<p style="padding:24px;text-align:center;color:rgba(255,255,255,0.55)">No internships match that search.</p>`;
      return;
    }
    results.innerHTML = list
      .slice(0, 20)
      .map((i, idx) => {
        const skills = (i.skills || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 3)
          .join(" · ");
        return `
          <div class="ai-search-result" data-idx="${idx}" data-id="${i.id}">
            <strong>${esc(i.title || "Untitled")}</strong>
            <span>${esc(i.companyName || "Company")} · ${esc(i.location || "—")} · ${esc(i.duration || "")} ${skills ? "· " + esc(skills) : ""}</span>
          </div>`;
      })
      .join("");

    results.querySelectorAll(".ai-search-result").forEach((el) => {
      el.addEventListener("click", () => openInternship(el.getAttribute("data-id")));
    });
  }

  function openInternship(id) {
    if (!id) return;
    window.location.href = `internship-detailss.html?id=${encodeURIComponent(id)}`;
  }

  function filter() {
    const q = (input.value || "").trim().toLowerCase();
    if (!q) {
      render(all);
      return;
    }
    const matched = all.filter((i) => {
      const blob = [i.title, i.companyName, i.location, i.duration, i.skills, i.desc]
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
    render(matched);
  }

  async function open() {
    modal.classList.add("is-open");
    document.body.style.overflow = "hidden";
    setTimeout(() => input?.focus(), 50);
    try {
      await ensureLoaded();
      render(all);
    } catch (e) {
      console.error("Internship fetch failed:", e);
      if (results)
        results.innerHTML = `<p style="padding:24px;text-align:center;color:rgba(255,100,100,0.75)">Could not load internships.</p>`;
    }
  }

  function close() {
    modal.classList.remove("is-open");
    document.body.style.overflow = "";
    if (input) input.value = "";
    activeIdx = -1;
  }

  orbBtn.addEventListener("click", open);
  profileBtn?.addEventListener("click", open);
  closeBtn?.addEventListener("click", close);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });

  input?.addEventListener("input", filter);
  input?.addEventListener("keydown", (e) => {
    const rows = results?.querySelectorAll(".ai-search-result") || [];
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIdx = Math.min(rows.length - 1, activeIdx + 1);
      updateActive(rows);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIdx = Math.max(0, activeIdx - 1);
      updateActive(rows);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[activeIdx] || rows[0];
      if (row) openInternship(row.getAttribute("data-id"));
    }
  });

  function updateActive(rows) {
    rows.forEach((r, i) => {
      r.style.background = i === activeIdx ? "rgba(124, 107, 255, 0.18)" : "";
      if (i === activeIdx) r.scrollIntoView({ block: "nearest" });
    });
  }

  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      modal.classList.contains("is-open") ? close() : open();
    }
  });
}
