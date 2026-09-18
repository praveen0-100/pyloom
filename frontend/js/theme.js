/**
 * PYLOOM color mode — light / dark (React Flow–style)
 */
(function () {
  const STORAGE_KEY = "pyloom-color-mode";

  function systemPrefersDark() {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function resolveMode(preference) {
    if (preference === "system") {
      return systemPrefersDark() ? "dark" : "light";
    }
    return preference === "dark" ? "dark" : "light";
  }

  function updateThemeColor(resolved) {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.content = resolved === "dark" ? "#08080a" : "#7700ff";
    }
  }

  function apply(resolved) {
    document.documentElement.setAttribute("data-color-mode", resolved);
    updateThemeColor(resolved);
  }

  function getPreference() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "light" || saved === "dark" || saved === "system") return saved;
    } catch (_) { /* ignore */ }
    return "system";
  }

  function setPreference(preference) {
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch (_) { /* ignore */ }
    apply(resolveMode(preference));
    document.documentElement.setAttribute("data-theme-preference", preference);
  }

  function toggle() {
    const current = document.documentElement.getAttribute("data-color-mode") || "light";
    setPreference(current === "dark" ? "light" : "dark");
  }

  const initialPref = getPreference();
  document.documentElement.setAttribute("data-theme-preference", initialPref);
  apply(resolveMode(initialPref));

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (getPreference() === "system") apply(resolveMode("system"));
  });

  window.PyloomTheme = {
    getPreference,
    setPreference,
    toggle,
    getResolved: () => document.documentElement.getAttribute("data-color-mode")
  };

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => toggle());
    });
  });
})();
