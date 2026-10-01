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
      const saved = sessionStorage.getItem(STORAGE_KEY);
      // Dark is the default everywhere; only a light choice made with the toggle in this session overrides it
      if (saved === "light") return "light";
    } catch (_) { /* ignore */ }
    return "dark";
  }

  function setPreference(preference) {
    try {
      sessionStorage.setItem(STORAGE_KEY, preference);
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
