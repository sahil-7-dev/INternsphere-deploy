// js/theme.js

document.addEventListener("DOMContentLoaded", () => {
  const toggleBtn = document.getElementById("themeToggle");

  // apply theme
  function applyTheme(theme) {
    const isLight = theme === "light";

    document.body.classList.toggle("light", isLight);
    document.body.classList.toggle("theme-light", isLight);
    document.body.classList.toggle("theme-dark", !isLight);
    document.documentElement.classList.toggle("light", isLight);
    document.documentElement.classList.toggle("theme-light", isLight);
    document.documentElement.classList.toggle("theme-dark", !isLight);

    document.documentElement.style.colorScheme = isLight ? "light" : "dark";
    document.documentElement.style.backgroundColor = isLight ? "#f6f8fb" : "#111113";

    localStorage.setItem("theme", isLight ? "light" : "dark");

    if (toggleBtn) {
      const ico   = toggleBtn.querySelector(".toggle-ico");
      const label = toggleBtn.querySelector(".toggle-label");
      if (ico || label) {
        if (ico)   ico.textContent   = isLight ? "☀️" : "🌙";
        if (label) label.textContent = isLight ? "Light" : "Dark";
      } else {
        toggleBtn.textContent = isLight ? "☀️" : "🌙";
      }
    }
  }

  // load saved theme
  const savedTheme =
    localStorage.getItem("theme") ||
    localStorage.getItem("internsphere_theme") ||
    "dark";

  applyTheme(savedTheme);

  // toggle theme
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      const isLight = document.body.classList.contains("light");

      document.documentElement.classList.add("theme-transition");

      applyTheme(isLight ? "dark" : "light");

      setTimeout(() => {
        document.documentElement.classList.remove("theme-transition");
      }, 300);
    });
  }
});
