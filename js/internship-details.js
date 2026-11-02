// js/internship-details.js
import { requireAuth } from "./guard.js";
requireAuth();

import { auth, db } from "../firebase/firebase.js";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  arrayUnion,
  arrayRemove,
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";

// helpers
const $ = (sel) => document.querySelector(sel);

function safeText(str) {
  return String(str ?? "");
}

function escapeHTML(str) {
  return String(str ?? "").replace(/[&<>"']/g, (ch) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return map[ch];
  });
}

function setText(sel, text) {
  const el = $(sel);
  if (el) el.textContent = safeText(text);
}

const params = new URLSearchParams(window.location.search);
const rawId = (params.get("id") || "").trim();
// Firestore doc ids can't contain "/" (doc() throws) and are capped at
// 1500 bytes — treat anything else as a missing id.
const id = rawId && !rawId.includes("/") && rawId !== "." && rawId !== ".." && rawId.length <= 1500
  ? rawId
  : null;

if (!id) {
  window.location.href = "internshipdetails.html";
} else {
  loadInternship().catch((e) => {
    console.error(e);
    alert(e.message || "Failed to load internship details.");
  });
}

// load internship
async function loadInternship() {
  const ref = doc(db, "internships", id);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    alert("Internship not found.");
    window.location.href = "internshipdetails.html";
    return;
  }

  const d = snap.data();

  const title      = d.title || "Internship";
  const companyNm  = d.companyName || d.company || "Company";
  const location   = d.location || "Remote";
  const duration   = d.duration || d.durationKey || "—";
  const desc       = d.desc || d.description || "No description provided.";
  const department = d.dept || d.department || "Internship";
  const stipend    = d.stipend || d.salary || "—";
  const mission    = d.mission || "";
  const responsibilities = Array.isArray(d.responsibilities) ? d.responsibilities : [];
  const requirements     = Array.isArray(d.requirements)     ? d.requirements     : [];
  const deadline   = d.deadline || "";
  const openings   = typeof d.openings === "number" ? d.openings : null;
  const heroImage  = d.heroImage || "";

  if (heroImage) {
    const imgEl = document.getElementById("heroImg");
    if (imgEl) imgEl.src = heroImage;
  }

  window.__internship = {
    id, title, companyName: companyNm,
    location, duration, department, stipend, description: desc,
  };

  const skills = Array.isArray(d.skills)
    ? d.skills
    : typeof d.skills === "string"
      ? d.skills.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

  // tab title
  try { document.title = `${title} · ${companyNm}`; } catch {}

  // hero
  const type = (d.type || d.mode || "").toLowerCase();

  const companyEl  = document.getElementById("heroCompany");
  const openingsEl = document.getElementById("heroOpenings");
  const typeEl     = document.getElementById("heroType");
  const titleEl    = document.getElementById("heroTitle");
  const subEl      = document.getElementById("heroSubtitle");
  const deadlineEl = document.getElementById("heroDeadline");
  const durationEl = document.getElementById("heroDuration");
  const skillsEl   = document.getElementById("heroSkills");

  if (companyEl)  companyEl.textContent  = companyNm;
  if (titleEl)    titleEl.textContent    = title;
  if (subEl)      subEl.textContent      = desc;

  if (openingsEl) {
    const n = openings && openings > 0 ? openings : 1;
    openingsEl.textContent = `${n} opening${n === 1 ? "" : "s"}`;
  }

  if (typeEl) {
    if (type === "remote" || type === "hybrid" || type === "onsite") {
      typeEl.textContent = type.toUpperCase();
      typeEl.hidden = false;
    } else {
      typeEl.hidden = true;
    }
  }

  if (deadlineEl) {
    if (deadline) {
      const d2 = new Date(deadline + "T23:59:59");
      if (!isNaN(d2.getTime())) {
        const when = d2.toLocaleDateString(undefined, { month: "short", day: "numeric" });
        const now = Date.now();
        const msLeft = d2.getTime() - now;
        const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
        if (msLeft > 0) {
          deadlineEl.textContent = daysLeft <= 3
            ? `⏰ Apply by ${when} (${daysLeft} day${daysLeft === 1 ? "" : "s"} left)`
            : `⏰ Apply by ${when}`;
          deadlineEl.hidden = false;
        } else {
          deadlineEl.textContent = "⏰ Applications closed";
          deadlineEl.hidden = false;
        }
      } else {
        deadlineEl.hidden = true;
      }
    } else {
      deadlineEl.hidden = true;
    }
  }

  if (durationEl) durationEl.hidden = true;

  if (skillsEl) {
    skillsEl.innerHTML = skills.slice(0, 4).map((s) =>
      `<span class="hero-skill">${escapeHTML(s)}</span>`,
    ).join("");
  }

  const metaValues = document.querySelectorAll(".hero-meta .meta-value");
  if (metaValues[0]) metaValues[0].textContent = location;
  if (metaValues[1]) metaValues[1].textContent = duration;
  if (metaValues[2]) metaValues[2].textContent = stipend;

  // middle
  const miniValues = document.querySelectorAll(".mini-grid .mini-value");
  if (miniValues[0]) miniValues[0].textContent = title;
  if (miniValues[1]) miniValues[1].textContent = duration;

  // apply card header
  const applyTitle = document.querySelector(".apply-title");
  const applySub   = document.querySelector(".apply-sub");
  if (applyTitle) applyTitle.textContent = `Apply to ${title}`;
  if (applySub) {
    applySub.innerHTML =
      `You're applying to <strong>${escapeHTML(companyNm)}</strong>` +
      (location ? ` · ${escapeHTML(location)}` : "") +
      (duration && duration !== "—" ? ` · ${escapeHTML(duration)}` : "");
  }

  const form = document.getElementById("applyForm");
  if (form && !document.getElementById("applyRolePill")) {
    const pill = document.createElement("div");
    pill.id = "applyRolePill";
    pill.className = "apply-role-pill";
    pill.innerHTML =
      `<div class="apply-role-pill-logo" id="applyRolePillLogo">${escapeHTML(companyNm.slice(0, 2).toUpperCase())}</div>` +
      `<div class="apply-role-pill-text">` +
      `  <strong>${escapeHTML(title)}</strong>` +
      `  <span>at ${escapeHTML(companyNm)}</span>` +
      `</div>`;
    form.parentNode.insertBefore(pill, form);
  }

  if (d.companyId) {
    getDoc(doc(db, "companies", d.companyId))
      .then((snap) => {
        const logo = snap.exists() ? (snap.data().logo || "") : "";
        if (!logo) return;
        const logoEl = document.getElementById("applyRolePillLogo");
        if (!logoEl) return;
        logoEl.classList.add("has-logo");
        logoEl.innerHTML = `<img src="${escapeHTML(logo)}" alt="" onerror="this.parentElement.classList.remove('has-logo'); this.remove();">`;
      })
      .catch(() => {});
  }

  // mission / responsibilities / requirements
  const missionEl = document.getElementById("jobMission");
  if (missionEl) {
    missionEl.textContent = mission || desc || "Details coming soon — the company hasn't filled this in yet.";
  }

  const respHeading = document.getElementById("jobRespHeading");
  const respList    = document.getElementById("jobResponsibilities");
  if (respList) {
    if (responsibilities.length) {
      respList.innerHTML = responsibilities.map((r) => `<li>${escapeHTML(r)}</li>`).join("");
      if (respHeading) respHeading.style.display = "";
      respList.style.display = "";
    } else {
      if (respHeading) respHeading.style.display = "none";
      respList.style.display = "none";
    }
  }

  const reqHeading = document.getElementById("jobReqHeading");
  const reqList    = document.getElementById("jobRequirements");
  if (reqList) {
    if (requirements.length) {
      reqList.innerHTML = requirements.map((r) => `<li>${escapeHTML(r)}</li>`).join("");
      if (reqHeading) reqHeading.style.display = "";
      reqList.style.display = "";
    } else {
      if (reqHeading) reqHeading.style.display = "none";
      reqList.style.display = "none";
    }
  }

  // skills
  if (reqList && skills.length) {
    reqList.insertAdjacentHTML(
      "afterend",
      `
        <h4 class="h4">Skills</h4>
        <ul class="bullets">
          ${skills.map((s) => `<li>${escapeHTML(s)}</li>`).join("")}
        </ul>
      `
    );
  }

  // deadline + openings
  const extras = [];
  if (deadline) {
    try {
      const d2 = new Date(deadline + "T00:00:00");
      if (!isNaN(d2.getTime())) {
        extras.push(`Deadline · ${d2.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`);
      }
    } catch {}
  }
  if (openings && openings > 0) {
    extras.push(`${openings} opening${openings === 1 ? "" : "s"}`);
  }
  if (applySub && extras.length) {
    applySub.innerHTML += `<br><span style="opacity:0.72;font-size:0.88rem">${extras.map(escapeHTML).join(" · ")}</span>`;
  }
}

// tabs
document.addEventListener("click", (e) => {
  const target = e.target;
  if (!(target instanceof Element)) return;

  const btn = target.closest(".tab");
  if (!btn) return;

  const tabsBar = btn.closest(".tabs");
  if (!tabsBar) return;

  tabsBar.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  btn.classList.add("active");
});

// apply now
document.getElementById("applyBtnHero")?.addEventListener("click", () => {
  const form = document.getElementById("applyForm")
    || document.querySelector(".apply-card");
  if (form) form.scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => form?.querySelector("input, textarea, select")?.focus(), 380);
});

// save for later
const saveBtn = document.getElementById("saveBtn");
if (saveBtn) {
  const labelEl = saveBtn.querySelector(".hero-save-label");
  const icoEl   = saveBtn.querySelector(".hero-save-ico");

  const paintState = (isSaved) => {
    saveBtn.classList.toggle("is-saved", !!isSaved);
    saveBtn.setAttribute("aria-pressed", isSaved ? "true" : "false");
    if (icoEl)   icoEl.textContent   = isSaved ? "★" : "☆";
    if (labelEl) labelEl.textContent = isSaved ? "Saved" : "Save";
  };

  onAuthStateChanged(auth, async (user) => {
    if (!user || !id) return;
    try {
      const snap = await getDoc(doc(db, "students", user.uid));
      const saved = snap.exists() ? (snap.data().savedInternships || []) : [];
      paintState(saved.includes(id));
    } catch (e) {
      console.error("[save] load:", e);
    }
  });

  saveBtn.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) { alert("Please log in to save this role."); return; }
    if (!id)   return;

    saveBtn.disabled = true;
    const wasSaved = saveBtn.classList.contains("is-saved");
    paintState(!wasSaved);

    try {
      const ref = doc(db, "students", user.uid);
      await setDoc(
        ref,
        { savedInternships: wasSaved ? arrayRemove(id) : arrayUnion(id) },
        { merge: true },
      );
    } catch (e) {
      console.error("[save] write:", e);
      paintState(wasSaved);
      alert("Could not update your saved list. Try again.");
    } finally {
      saveBtn.disabled = false;
    }
  });
}

// apply form
const applyForm = document.getElementById("applyForm");
const cvInput = document.getElementById("cv");
const uploadBox = document.getElementById("uploadBox");
const cvMain = document.getElementById("cvMain");
const cvSub = document.getElementById("cvSub");

// The CV is stored inline as a base64 data URL on the application doc.
// Base64 inflates by 4/3 and Firestore caps a document at 1 MiB, so
// anything much over ~750 KB fails on write. 700 KB leaves headroom for
// the other fields.
const CV_MAX_BYTES = 700 * 1024;
const CV_MAX_LABEL = "700 KB";

if (uploadBox && cvInput) {
  const pickFile = () => cvInput.click();
  uploadBox.addEventListener("click", pickFile);
  uploadBox.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pickFile();
    }
  });

  const validateAndShow = (file) => {
    if (!file) return false;
    const isPdf =
      file.type === "application/pdf" ||
      /\.pdf$/i.test(file.name);
    if (!isPdf) {
      alert("Please upload a PDF file only.");
      cvInput.value = "";
      return false;
    }
    if (file.size > CV_MAX_BYTES) {
      alert(
        `That PDF is too large (${(file.size / 1024).toFixed(0)} KB). Max is ${CV_MAX_LABEL}. Try compressing it.`,
      );
      cvInput.value = "";
      return false;
    }
    if (cvMain) cvMain.textContent = `📄 ${file.name}`;
    const sizeLabel = file.size > 1024 * 1024
      ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
      : `${(file.size / 1024).toFixed(0)} KB`;
    if (cvSub) cvSub.textContent = `${sizeLabel} · ready to submit`;
    uploadBox.classList.add("has-file");
    return true;
  };

  cvInput.addEventListener("change", () => {
    const f = cvInput.files?.[0];
    if (f) validateAndShow(f);
  });

  uploadBox.addEventListener("dragover", (e) => {
    e.preventDefault();
    uploadBox.classList.add("dragging");
  });
  uploadBox.addEventListener("dragleave", () => uploadBox.classList.remove("dragging"));
  uploadBox.addEventListener("drop", (e) => {
    e.preventDefault();
    uploadBox.classList.remove("dragging");
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    const dt = new DataTransfer();
    dt.items.add(f);
    cvInput.files = dt.files;
    validateAndShow(f);
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

let applySubmitting = false;

if (applyForm) {
  applyForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (applySubmitting) return;

    const user = auth.currentUser;
    if (!user) {
      alert("Please log in first.");
      return;
    }

    const internshipId = id;
    if (!internshipId) {
      alert("Internship ID missing.");
      return;
    }

    const nameVal  = (document.getElementById("name")?.value  || "").trim();
    const emailVal = (document.getElementById("email")?.value || "").trim();
    const phoneVal = (document.getElementById("phone")?.value || "").trim();
    if (!nameVal || !emailVal || !phoneVal) {
      alert("Please fill in your name, email and phone.");
      return;
    }

    const file = cvInput?.files?.[0];
    if (!file) {
      alert("Please attach your CV as a PDF before submitting.");
      uploadBox?.classList.add("error");
      setTimeout(() => uploadBox?.classList.remove("error"), 1400);
      return;
    }
    const isPdf =
      file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (!isPdf) {
      alert("Only PDF files are accepted for CV.");
      return;
    }
    if (file.size > CV_MAX_BYTES) {
      alert(`CV too large. Max ${CV_MAX_LABEL}.`);
      return;
    }

    const submitBtn = applyForm.querySelector("[type='submit']");
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.dataset._label = submitBtn.textContent;
      submitBtn.textContent = "Submitting…";
    }

    applySubmitting = true;
    let submitted = false;
    try {
      const intSnap = await getDoc(doc(db, "internships", internshipId));
      if (!intSnap.exists()) {
        alert("Internship not found");
        return;
      }
      const internship = intSnap.data();

      if (internship.status && internship.status !== "Open") {
        alert("This internship is no longer accepting applications.");
        return;
      }
      if (internship.deadline) {
        const dl = new Date(internship.deadline + "T23:59:59");
        if (!isNaN(dl.getTime()) && dl.getTime() < Date.now()) {
          alert("Applications for this internship have closed.");
          return;
        }
      }

      // Server-side duplicate check — the live status listener may not have
      // fired yet (slow network / second tab), so don't rely on UI state alone.
      const existingSnap = await getDocs(query(
        collection(db, "applications"),
        where("studentId", "==", user.uid),
        where("internshipId", "==", internshipId),
      ));
      const active = existingSnap.docs.find((d) => (d.data().status || "Pending") !== "Rejected");
      if (active) {
        alert("You've already applied to this internship.");
        return;
      }

      if (submitBtn) submitBtn.textContent = "Reading CV…";
      const cvDataUrl = await readAsDataURL(file);
      if (submitBtn) submitBtn.textContent = "Submitting…";
      const cvUrl = cvDataUrl;
      const cvPath = `base64:${user.uid}/${Date.now()}`;

      const applicantNote = (document.getElementById("applicantNote")?.value || "").trim();

      await addDoc(collection(db, "applications"), {
        studentId: user.uid,
        internshipId: internshipId,
        companyId: internship.companyId || "",
        role: internship.title || "",
        name: nameVal,
        email: emailVal,
        phone: phoneVal,
        cvName: file.name,
        cvSize: file.size,
        cvUrl,
        cvPath,
        applicantNote,
        status: "Pending",
        appliedAt: new Date().toLocaleString(),
        appliedAtMs: Date.now(),
      });
      submitted = true;

      applyForm.reset();
      if (cvMain) cvMain.textContent = "Click or drop your PDF CV";
      if (cvSub) cvSub.textContent = `PDF up to ${CV_MAX_LABEL}`;
      uploadBox?.classList.remove("has-file");

      if (typeof window.playSubmitChime === "function") window.playSubmitChime();
      openApplySuccessModal();
    } catch (err) {
      console.error(err);
      alert("Application failed: " + (err?.message || err));
    } finally {
      applySubmitting = false;
      // On success the status listener has already locked the form and set
      // the button to "Already applied" — don't clobber that.
      if (submitBtn && !submitted) {
        submitBtn.disabled = false;
        submitBtn.textContent = submitBtn.dataset._label || "Submit";
      } else if (submitBtn && submitBtn.textContent === "Submitting…") {
        submitBtn.textContent = "Already applied";
      }
    }
  });
}

// apply success modal
function openApplySuccessModal() {
  const modal = document.getElementById("applySuccessModal");
  if (!modal) return;
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}
function closeApplySuccessModal() {
  const modal = document.getElementById("applySuccessModal");
  if (!modal) return;
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}
document.getElementById("applySuccessModal")?.addEventListener("click", (e) => {
  if (e.target?.hasAttribute?.("data-close")) closeApplySuccessModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeApplySuccessModal();
});

// already-applied detection

(function setupApplicationStatusCheck() {
  const internshipId = id;
  if (!internshipId) return;

  const banner = document.getElementById("applyStatusBanner");
  const form = document.getElementById("applyForm");
  const applyBtn = document.getElementById("applyBtn");

  if (!banner || !form) return;

  function setFormDisabled(disabled) {
    form.querySelectorAll("input, textarea, select, button").forEach((el) => {
      el.disabled = disabled;
    });
  }

  function renderStatus(status, appliedAt) {
    if (!status) {
      banner.style.display = "none";
      banner.className = "apply-status-banner";
      setFormDisabled(false);
      if (applyBtn) {
        applyBtn.disabled = false;
        applyBtn.textContent = "Apply now";
      }
      return;
    }

    const when = appliedAt
      ? `<span class="apply-status-when">Applied ${escapeHTML(String(appliedAt))}</span>`
      : "";

    let iconHtml, title, msg, variant;
    switch (status) {
      case "Approved":
        variant = "joined";
        iconHtml = "🎉";
        title = "You've joined this internship";
        msg = "Head to your workroom to start on your assigned tasks.";
        break;
      case "Shortlisted":
        variant = "shortlisted";
        iconHtml = "⭐";
        title = "You've been shortlisted";
        msg = "The company is finalising candidates — you'll hear back soon.";
        break;
      case "Rejected":
        variant = "rejected";
        iconHtml = "✕";
        title = "Application not selected";
        msg = "This application wasn't selected. You may apply to other roles.";
        break;
      case "Pending":
      default:
        variant = "applied";
        iconHtml = "✓";
        title = "You've already applied";
        msg = "Your application is under review. We'll notify you when the status changes.";
        break;
    }

    banner.className = "apply-status-banner show variant-" + variant;
    banner.innerHTML =
      `<div class="apply-status-ico">${iconHtml}</div>` +
      `<div class="apply-status-text">` +
      `  <strong>${title}</strong>` +
      `  <span>${msg}</span>` +
      (when ? `  ${when}` : "") +
      `</div>`;
    banner.style.display = "flex";

    if (status === "Rejected") {
      setFormDisabled(false);
      if (applyBtn) {
        applyBtn.disabled = false;
        applyBtn.textContent = "Apply again";
      }
    } else {
      setFormDisabled(true);
      if (applyBtn) {
        applyBtn.disabled = true;
        applyBtn.textContent =
          status === "Approved" ? "Already joined" : "Already applied";
      }
    }
  }

  let unsubStatus = null;
  onAuthStateChanged(auth, (user) => {
    if (unsubStatus) { unsubStatus(); unsubStatus = null; }
    if (!user) {
      renderStatus(null);
      return;
    }
    const q = query(
      collection(db, "applications"),
      where("studentId", "==", user.uid),
      where("internshipId", "==", internshipId),
    );
    unsubStatus = onSnapshot(
      q,
      (snap) => {
        if (snap.empty) {
          renderStatus(null);
          return;
        }
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const nonRejected = docs.find((d) => d.status && d.status !== "Rejected");
        const pick = nonRejected || docs[0];
        renderStatus(pick.status || "Pending", pick.appliedAt);
      },
      (err) => {
        console.warn("application-status listener:", err);
      },
    );
  });
})();
