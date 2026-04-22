// company-onboarding.js — handles company profile bootstrap & gating.

import { auth, db } from "../firebase/firebase.js";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { esc } from "./lib/escape.js";

const $ = (id) => document.getElementById(id);

let companyData = null;
let currentUid = null;

// Header greeting + sidebar population
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function initials(name) {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function applyIdentity(data) {
  const name = (data?.companyName || data?.name || "").trim();
  const complete = !!name;
  const logo = data?.logo || "";

  const sideName = $("sidebar-company-name");
  const sideAvatar = $("sidebar-avatar");
  if (sideName) sideName.textContent = complete ? name : "Complete profile";
  if (sideAvatar) {
    sideAvatar.style.backgroundImage = "";
    sideAvatar.innerHTML = "";
    if (logo) {
      const img = document.createElement("img");
      img.src = logo;
      img.alt = name || "";
      img.decoding = "async";
      sideAvatar.appendChild(img);
    } else {
      sideAvatar.textContent = complete ? initials(name) : "+";
    }
  }

  const welcomeCompany = $("welcomeCompany");
  const welcomeTo = $("welcomeTo");
  const welcomeKicker = $("welcomeKicker");
  const greet = $("greeting");

  if (welcomeKicker) welcomeKicker.textContent = greeting();
  if (welcomeCompany) {
    welcomeCompany.textContent = complete ? name : "Your Company";
    welcomeCompany.classList.toggle("loading", !complete);
  }
  if (welcomeTo) welcomeTo.textContent = "Welcome back,";
  if (greet) greet.textContent = "Here's your hiring snapshot.";

  const chip = $("profileChip");
  if (chip) chip.style.display = "none";

  if (complete) localStorage.setItem("companyName", name);
  else localStorage.removeItem("companyName");
}

// Onboarding modal
function openModal() {
  const m = $("onboardingModal");
  if (!m) return;
  m.classList.add("is-open");
  document.body.style.overflow = "hidden";
  // Prefill whatever we already have
  if (companyData) {
    $("onbName").value = companyData.companyName || companyData.name || "";
    $("onbIndustry").value = companyData.industry || "";
    $("onbSize").value = companyData.teamSize || "";
    $("onbLocation").value = companyData.location || "";
    $("onbWebsite").value = companyData.website || "";
    $("onbAbout").value = companyData.about || "";
  }
  setTimeout(() => $("onbName")?.focus(), 80);
}

function closeModal() {
  $("onboardingModal")?.classList.remove("is-open");
  document.body.style.overflow = "";
}

async function saveOnboarding() {
  if (!currentUid) return;
  const name = $("onbName").value.trim();
  if (!name) {
    setStatus("Company name is required.", "err");
    $("onbName").focus();
    return;
  }

  const payload = {
    companyName: name,
    name,
    industry: $("onbIndustry").value,
    teamSize: $("onbSize").value,
    location: $("onbLocation").value.trim(),
    website: $("onbWebsite").value.trim(),
    about: $("onbAbout").value.trim().slice(0, 220),
    updatedAt: serverTimestamp(),
  };

  if (!companyData || (!companyData.createdAt && !companyData.companyName)) {
    payload.createdAt = serverTimestamp();
    payload.role = "company";
    payload.email = auth.currentUser?.email || "";
  }

  const btn = $("onbSave");
  if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
  setStatus("");

  try {
    await setDoc(doc(db, "companies", currentUid), payload, { merge: true });
    // Mirror to users collection too
    await setDoc(doc(db, "users", currentUid), { name, role: "company" }, { merge: true });
    companyData = { ...(companyData || {}), ...payload };
    applyIdentity(companyData);
    setStatus("Saved ✓", "ok");
    setTimeout(closeModal, 500);
  } catch (e) {
    console.error("[company-onboarding] save:", e);
    setStatus(
      "Failed: " + (e?.code || "") + " " + (e?.message || "unknown"),
      "err",
    );
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Save & continue"; }
  }
}

function setStatus(msg, kind) {
  const el = $("onbStatus");
  if (!el) return;
  el.textContent = msg || "";
  el.className = "onb-status" + (kind === "ok" ? " ok" : "");
}

function isProfileComplete() {
  const name = (companyData?.companyName || companyData?.name || "").trim();
  return name.length > 0;
}

function gateToast() {
  const t = $("gateToast");
  if (!t) return;
  t.classList.add("is-open");
  clearTimeout(gateToast._t);
  gateToast._t = setTimeout(() => t.classList.remove("is-open"), 3600);
}

function wireGate() {
  const addInternship = $("add-internship-btn");
  const openTaskBtn = $("open-task-modal-btn");

  addInternship?.addEventListener(
    "click",
    (e) => {
      if (!isProfileComplete()) {
        e.preventDefault();
        e.stopImmediatePropagation();
        openModal();
        gateToast();
      }
    },
    true,
  );

  $("modal-save")?.addEventListener(
    "click",
    (e) => {
      if (!isProfileComplete()) {
        e.preventDefault();
        e.stopImmediatePropagation();
        openModal();
        gateToast();
      }
    },
    true,
  );

  // Task modal
  $("open-task-modal-btn")?.addEventListener(
    "click",
    (e) => {
      if (!isProfileComplete()) {
        e.preventDefault();
        e.stopImmediatePropagation();
        openModal();
        gateToast();
      }
    },
    true,
  );

  $("task-modal-save")?.addEventListener(
    "click",
    (e) => {
      if (!isProfileComplete()) {
        e.preventDefault();
        e.stopImmediatePropagation();
        openModal();
        gateToast();
      }
    },
    true,
  );
}

function tickClock() {
  const el = $("last-updated");
  if (!el) return;
  const d = new Date();
  el.textContent = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Boot
document.addEventListener("DOMContentLoaded", () => {
  const modalSelectors = [
    ".modal-backdrop",      // Post Role / Edit Role / Task / Submissions / Review / Settings
    ".onboarding-modal",    // Onboarding
    ".gate-toast",          // Gate warning toast
    ".cp-modal",            // Company Profile modal
  ];
  document.querySelectorAll(modalSelectors.join(",")).forEach((el) => {
    if (el.parentElement !== document.body) {
      document.body.appendChild(el);
    }
  });

  // Wire the onboarding modal controls
  $("onbSave")?.addEventListener("click", saveOnboarding);
  $("onbLater")?.addEventListener("click", closeModal);
  $("gateOpen")?.addEventListener("click", () => {
    $("gateToast")?.classList.remove("is-open");
    openModal();
  });

  wireGate();
  tickClock();
  setInterval(tickClock, 60_000);

  // Company profile modal wiring
  wireProfileModal();

  onAuthStateChanged(auth, async (user) => {
    if (!user) return; // auth redirect handled elsewhere
    currentUid = user.uid;

    try {
      const snap = await getDoc(doc(db, "companies", user.uid));
      if (snap.exists()) {
        companyData = snap.data();
      } else {
        companyData = {
          email: user.email || "",
          companyName: "",
        };
      }

      applyIdentity(companyData);

      if (!isProfileComplete()) {
        setTimeout(openModal, 500);
      }
    } catch (e) {
      console.error("[company-onboarding] load:", e);
      applyIdentity({});
      setTimeout(openModal, 500);
    }
  });
});

let cpPendingLogo = null; // data URL string or "" to remove

function wireProfileModal() {
  // Open on sidebar company-card click
  document.querySelector(".company-card")?.addEventListener("click", openProfileModal);
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === ",") {
      e.preventDefault();
      openProfileModal();
    }
  });

  $("cpClose")?.addEventListener("click", closeProfileModal);
  $("cpCancel")?.addEventListener("click", closeProfileModal);
  $("cpSave")?.addEventListener("click", saveProfileModal);

  // Close on backdrop
  $("companyProfileModal")?.addEventListener("click", (e) => {
    if (e.target === $("companyProfileModal")) closeProfileModal();
  });

  // Hiring toggle label
  $("cpHiring")?.addEventListener("change", (e) => {
    const lbl = $("cpHiringLabel");
    if (lbl) lbl.textContent = e.target.checked ? "Open" : "Paused";
  });

  // About counter
  const aboutEl = $("cpAbout");
  const aboutCount = $("cpAboutCount");
  aboutEl?.addEventListener("input", () => {
    if (aboutCount) aboutCount.textContent = `${aboutEl.value.length} / 400`;
  });

  // Logo picker
  $("cpLogoInput")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const LOGO_MAX = 5 * 1024 * 1024; // 5 MB
    if (file.size > LOGO_MAX) {
      alert(`Logo too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Please pick one under 5 MB.`);
      e.target.value = "";
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      cpPendingLogo = dataUrl;
      renderLogoPreview(dataUrl, $("cpName").value || companyData?.companyName || "");
    } catch (err) {
      console.error(err);
      alert("Failed to read logo file.");
    } finally {
      e.target.value = "";
    }
  });
  $("cpLogoRemove")?.addEventListener("click", () => {
    cpPendingLogo = ""; // empty string = remove on save
    renderLogoPreview(null, $("cpName").value || companyData?.companyName || "");
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function renderLogoPreview(dataUrl, name) {
  const img = $("cpLogoImg");
  const ini = $("cpLogoInitials");
  const remove = $("cpLogoRemove");
  const wrap = $("cpLogoWrap");
  if (dataUrl) {
    img.src = dataUrl;
    img.style.display = "";
    ini.style.display = "none";
    if (remove) remove.style.display = "";
    if (wrap) wrap.setAttribute("data-zoomable", "1");
  } else {
    img.removeAttribute("src");
    img.style.display = "none";
    ini.style.display = "";
    ini.textContent = initials(name || "—");
    if (remove) remove.style.display = "none";
    if (wrap) wrap.removeAttribute("data-zoomable");
  }
}

(function wireCompanyLogoZoom() {
  const wrap = document.getElementById("cpLogoWrap");
  if (!wrap || wrap.__zoomWired) return;
  wrap.__zoomWired = true;
  wrap.addEventListener("click", () => {
    if (wrap.getAttribute("data-zoomable") !== "1") return;
    const src = document.getElementById("cpLogoImg")?.src;
    if (src) window.InternSphereLightbox?.open(src, "Company logo");
  });
})();

async function openProfileModal() {
  if (!currentUid) return;

  try {
    const snap = await getDoc(doc(db, "companies", currentUid));
    if (snap.exists()) companyData = snap.data();
  } catch {}

  const d = companyData || {};

  $("cpName").value = d.companyName || d.name || "";
  $("cpTagline").value = d.tagline || "";
  $("cpIndustry").value = d.industry || "";
  $("cpSize").value = d.teamSize || "";
  $("cpFounded").value = d.foundedYear || "";
  $("cpLocation").value = d.location || "";
  $("cpEmail").value = auth.currentUser?.email || d.email || "";
  $("cpPhone").value = d.phone || "";
  $("cpWebsite").value = d.website || "";
  $("cpLinkedIn").value = d.linkedin || "";
  $("cpTwitter").value = d.twitter || "";
  $("cpSite2").value = d.careersUrl || "";
  $("cpAbout").value = d.about || "";
  $("cpAboutCount").textContent = `${($("cpAbout").value || "").length} / 400`;

  const hiring = d.hiring !== false;
  $("cpHiring").checked = hiring;
  $("cpHiringLabel").textContent = hiring ? "Open" : "Paused";

  // Logo preview
  cpPendingLogo = null;
  renderLogoPreview(d.logo || null, d.companyName || d.name || "");

  // Meta footer
  const created = auth.currentUser?.metadata?.creationTime;
  $("cpMemberSince").textContent = created
    ? new Date(created).toLocaleDateString(undefined, { month: "short", year: "numeric" })
    : "—";
  $("cpUid").textContent = currentUid;
  $("cpStatus").textContent = isProfileComplete() ? "✓ Verified profile" : "Incomplete";
  $("cpStatus").style.color = isProfileComplete() ? "#22c55e" : "#f59e0b";

  loadQuickStats().catch(() => {});

  $("companyProfileModal").classList.add("is-open");
  document.body.style.overflow = "hidden";
  setTimeout(() => $("cpName")?.focus(), 80);
}

function closeProfileModal() {
  $("companyProfileModal")?.classList.remove("is-open");
  document.body.style.overflow = "";
}

async function loadQuickStats() {
  if (!currentUid) return;
  try {
    const intsSnap = await getDocs(
      query(collection(db, "internships"), where("companyId", "==", currentUid)),
    );
    const roles = intsSnap.size;
    const openRoles = intsSnap.docs.filter((d) => (d.data().status || "Open") === "Open").length;

    const appsSnap = await getDocs(
      query(collection(db, "applications"), where("companyId", "==", currentUid)),
    );
    const apps = appsSnap.size;

    $("cpStatRoles").textContent = openRoles;
    $("cpStatApps").textContent = apps;
  } catch (e) {
    console.warn("[company-profile] quickstats:", e);
  }
}

async function saveProfileModal() {
  if (!currentUid) return;
  const name = $("cpName").value.trim();
  if (!name) {
    setCpStatus("Company name is required.", "err");
    $("cpName").focus();
    return;
  }

  const payload = {
    companyName: name,
    name,
    tagline: $("cpTagline").value.trim().slice(0, 90),
    industry: $("cpIndustry").value,
    teamSize: $("cpSize").value,
    foundedYear: parseInt($("cpFounded").value, 10) || null,
    location: $("cpLocation").value.trim(),
    phone: $("cpPhone").value.trim(),
    website: $("cpWebsite").value.trim(),
    linkedin: $("cpLinkedIn").value.trim(),
    twitter: $("cpTwitter").value.trim(),
    careersUrl: $("cpSite2").value.trim(),
    about: $("cpAbout").value.trim().slice(0, 400),
    hiring: !!$("cpHiring").checked,
    updatedAt: serverTimestamp(),
  };

  if (cpPendingLogo !== null) {
    payload.logo = cpPendingLogo; // may be "" to clear
  }

  const btn = $("cpSave");
  if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
  setCpStatus("");

  try {
    await setDoc(doc(db, "companies", currentUid), payload, { merge: true });
    await setDoc(doc(db, "users", currentUid), { name }, { merge: true });
    companyData = { ...(companyData || {}), ...payload };
    applyIdentity(companyData);
    setCpStatus("Saved ✓", "ok");
    setTimeout(closeProfileModal, 600);
  } catch (e) {
    console.error("[company-profile] save:", e);
    setCpStatus(
      "Failed: " + (e?.code || "") + " " + (e?.message || "unknown"),
      "err",
    );
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Save Profile"; }
  }
}

function setCpStatus(msg, kind) {
  const el = $("cpStatusMsg");
  if (!el) return;
  el.textContent = msg || "";
  el.className = "cp-status" + (kind === "err" ? " err" : "");
}
