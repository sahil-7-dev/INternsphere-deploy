// js/theme.js

// Halloween window used for the seasonal DEFAULT only. This never
// overrides a theme the user picked explicitly — see loadInitialTheme().
// Adjust the month/day pair as needed (months are 0-indexed: 9 = Oct).
function isHalloweenSeason(d = new Date()) {
  const start = new Date(d.getFullYear(), 9, 15);  // Oct 15
  const end   = new Date(d.getFullYear(), 10, 2);  // Nov 2 (inclusive)
  end.setHours(23, 59, 59, 999);
  return d >= start && d <= end;
}

const THEME_ORDER = ["light", "dark", "halloween"];
const THEME_META = {
  light:     { icon: "☀️", label: "Light" },
  dark:      { icon: "🌙", label: "Dark" },
  halloween: { icon: "🎃", label: "Halloween" },
};

function applyTheme(theme) {
  if (!THEME_ORDER.includes(theme)) theme = "dark";

  document.body.classList.toggle("light", theme === "light");
  document.body.classList.toggle("theme-light", theme === "light");
  document.body.classList.toggle("theme-dark", theme === "dark");
  document.body.classList.toggle("theme-halloween", theme === "halloween");
  document.documentElement.classList.toggle("light", theme === "light");
  document.documentElement.classList.toggle("theme-light", theme === "light");
  document.documentElement.classList.toggle("theme-dark", theme === "dark");
  document.documentElement.classList.toggle("theme-halloween", theme === "halloween");

  document.documentElement.style.colorScheme = theme === "light" ? "light" : "dark";
  document.documentElement.style.backgroundColor =
    theme === "light" ? "#f6f8fb" : theme === "halloween" ? "#0d0710" : "#111113";

  localStorage.setItem("theme", theme);

  const toggleBtn = document.getElementById("themeToggle");
  if (toggleBtn) {
    const meta  = THEME_META[theme];
    const ico   = toggleBtn.querySelector(".toggle-ico");
    const label = toggleBtn.querySelector(".toggle-label");
    if (ico || label) {
      if (ico)   ico.textContent   = meta.icon;
      if (label) label.textContent = meta.label;
    } else {
      toggleBtn.textContent = meta.icon;
    }
    toggleBtn.setAttribute("aria-label", `Theme: ${meta.label} (click to change)`);
  }

  // Lazily bring in the Halloween effects module only when that theme is
  // actually selected — everyone else never fetches it.
  if (theme === "halloween" && typeof window.__loadHalloweenFX === "function") {
    window.__loadHalloweenFX();
  }

  // Let internal-analytics.js (if already loaded) know the theme changed,
  // so it can start/stop its scene rotator and clean up any active
  // vignette/audio when the user switches away from Halloween.
  document.dispatchEvent(new CustomEvent("internsphere:themechange", { detail: { theme } }));
}

// Decide the theme to show on a fresh page load.
//   1. An explicit prior choice always wins, in or out of season.
//   2. No saved choice yet -> default to Halloween during the seasonal
//      window, otherwise fall back to dark (previous default).
function loadInitialTheme() {
  const saved =
    localStorage.getItem("theme") ||
    localStorage.getItem("internsphere_theme");

  if (saved && THEME_ORDER.includes(saved)) return saved;

  return isHalloweenSeason() ? "halloween" : "dark";
}

document.addEventListener("DOMContentLoaded", () => {
  const toggleBtn = document.getElementById("themeToggle");

  applyTheme(loadInitialTheme());

  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      const current = THEME_ORDER.find((t) =>
        document.body.classList.contains(t === "light" ? "light" : `theme-${t}`)
      ) || "dark";
      const next = THEME_ORDER[(THEME_ORDER.indexOf(current) + 1) % THEME_ORDER.length];

      document.documentElement.classList.add("theme-transition");
      applyTheme(next);
      setTimeout(() => {
        document.documentElement.classList.remove("theme-transition");
      }, 300);
    });
  }
});
