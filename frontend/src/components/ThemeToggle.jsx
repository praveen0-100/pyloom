import { toggleTheme } from "../lib/theme";

export default function ThemeToggle() {
  return (
    <button type="button" className="theme-toggle" data-theme-toggle aria-label="Toggle dark mode" title="Toggle theme" onClick={toggleTheme}>
      <svg className="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <path d="M12 3a7 7 0 1 0 7 7 5 5 0 0 1-7-7z" />
      </svg>
      <svg className="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    </button>
  );
}
