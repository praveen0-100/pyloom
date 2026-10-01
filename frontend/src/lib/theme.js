/** PYLOOM colour mode - light / dark. Dark is the default; a light choice lasts for the session. */
const STORAGE_KEY = "pyloom-color-mode";

function apply(resolved) {
  document.documentElement.setAttribute("data-color-mode", resolved);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = resolved === "dark" ? "#08080a" : "#7700ff";
}

function getPreference() {
  try {
    if (sessionStorage.getItem(STORAGE_KEY) === "light") return "light";
  } catch (_) { /* ignore */ }
  return "dark";
}

export function initTheme() {
  const pref = getPreference();
  document.documentElement.setAttribute("data-theme-preference", pref);
  apply(pref);
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute("data-color-mode") || "light";
  const next = current === "dark" ? "light" : "dark";
  try { sessionStorage.setItem(STORAGE_KEY, next); } catch (_) { /* ignore */ }
  document.documentElement.setAttribute("data-theme-preference", next);
  apply(next);
}
