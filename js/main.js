// js/main.js

document.addEventListener("DOMContentLoaded", () => {

  // NAV

  const hamburger  = document.getElementById("hamburger");
  const navLinksUL = document.getElementById("navLinks");
  const navLinks   = document.querySelectorAll(".nav-link");
  const sections   = document.querySelectorAll("section[id]");

  // MOBILE MENU

  hamburger?.addEventListener("click", () => navLinksUL?.classList.toggle("active"));
  navLinks.forEach((link) => link.addEventListener("click", () => navLinksUL?.classList.remove("active")));

  // PHONE THEME TOGGLE PLACEMENT
  const PHONE_BREAKPOINT = 480;
  const themeToggle = document.getElementById("themeToggle");
  if (themeToggle && navLinksUL) {
    const originalParent  = themeToggle.parentNode;
    const originalSibling = themeToggle.nextSibling;
    let   isInsideMenu    = false;

    function placeThemeToggle() {
      const narrow = window.innerWidth <= PHONE_BREAKPOINT;
      if (narrow && !isInsideMenu) {
        const li = document.createElement("li");
        li.className = "nav-link-item nav-link-item--theme";
        li.appendChild(themeToggle);
        navLinksUL.appendChild(li);
        isInsideMenu = true;
      } else if (!narrow && isInsideMenu) {
        const li = themeToggle.parentNode;
        originalParent.insertBefore(themeToggle, originalSibling);
        li?.remove();
        isInsideMenu = false;
      }
    }
    placeThemeToggle();
    let rT;
    window.addEventListener("resize", () => {
      clearTimeout(rT);
      rT = setTimeout(placeThemeToggle, 100);
    });
  }

  // NAV INDICATOR

  function updateActiveLink() {
    let current = "hero";
    sections.forEach((section) => {
      if (window.scrollY >= section.offsetTop - 140) current = section.id;
    });
    navLinks.forEach((link) =>
      link.classList.toggle("active", link.getAttribute("href") === `#${current}`)
    );
  }

  let activeLinkPending = false;
  window.addEventListener("scroll", () => {
    if (activeLinkPending) return;
    activeLinkPending = true;
    requestAnimationFrame(() => {
      updateActiveLink();
      activeLinkPending = false;
    });
  }, { passive: true });
  updateActiveLink();

  document.querySelectorAll(".rotator[data-words]").forEach((el) => {
    let words;
    try   { words = JSON.parse(el.dataset.words); }
    catch { words = [el.textContent]; }
    if (words.length < 2) return;

    let i = 0;
    setInterval(() => {
      el.classList.add("is-out");
      setTimeout(() => {
        i = (i + 1) % words.length;
        el.textContent = words[i];
        el.classList.remove("is-out");
      }, 320);
    }, 4200);
  });

  // AI TEXT ROTATION

  const aiRotate = document.querySelector(".ai-rotate");
  if (aiRotate) {
    const words = ["AI Mentor", "Smart Workroom", "Resume Analyzer", "Progress Tracker"];
    let i = 0;
    setInterval(() => {
      aiRotate.classList.add("is-fade");
      setTimeout(() => {
        i = (i + 1) % words.length;
        aiRotate.textContent = words[i];
        aiRotate.classList.remove("is-fade");
      }, 180);
    }, 2400);
  }

});

const brand = document.querySelector(".brand");
const brandName = document.querySelector(".brand-name");
const logo = document.querySelector(".brand-logo");

let lastScroll = 0;
let typingActive = false;

// SCROLL BEHAVIOR
if (brand) {
  let brandScrollPending = false;
  window.addEventListener("scroll", () => {
    if (brandScrollPending) return;
    brandScrollPending = true;
    requestAnimationFrame(() => {
      const currentScroll = window.scrollY;
      if (currentScroll > lastScroll + 10) {
        brand.classList.add("compact");
      } else if (currentScroll < lastScroll - 10) {
        brand.classList.remove("compact");
      }
      lastScroll = currentScroll;
      brandScrollPending = false;
    });
  }, { passive: true });
}

// NATURAL TYPING EFFECT
function typeText(el, text, speed = 60) {
  el.textContent = "";
  let i = 0;

  function type() {
    if (i < text.length) {
      el.textContent += text.charAt(i);
      i++;

      const randomDelay = speed + Math.random() * 80;
      setTimeout(type, randomDelay);
    } else {
      typingActive = false;
    }
  }

  type();
}

// LOGO CLICK INTERACTION
if (logo) {
  logo.addEventListener("click", () => {
    if (typingActive) return;

    typingActive = true;

    logo.classList.add("glow-active");

    if (brandName) brandName.style.opacity = "1";
    if (brand) brand.classList.remove("compact");

    if (brandName) typeText(brandName, "InternSphere", 70);

    setTimeout(() => {
      logo.classList.remove("glow-active");
    }, 800);
  });
}
