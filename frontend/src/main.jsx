import { Component } from "react";
import { createRoot } from "react-dom/client";
import "./styles/style.css";
import "./styles/canvas.css";
import "./styles/app.css";
import { initTheme } from "./lib/theme";
import ParticipantPage from "./pages/ParticipantPage";
import AdminPage from "./pages/AdminPage";

initTheme();

// The app loaded, so the one-time "stale page" reload in index.html may run again after a future deploy.
try { sessionStorage.removeItem("pyloom-asset-reload"); } catch (_) { /* storage blocked */ }

// "/" is the participant console; "/admin" and "/admin.html" are the admin panel.
const isAdmin = /^\/admin(\.html)?\/?$/.test(window.location.pathname);

// A rendering error shows a reload card instead of a blank white page.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error("PYLOOM render error:", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="admin-login" role="alert">
        <div className="admin-login-card">
          <div className="brand-name">PYLOOM</div>
          <h1>Something went wrong</h1>
          <p>The page hit an unexpected error. Your data is safe on the server.</p>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>Reload</button>
        </div>
      </section>
    );
  }
}

// No StrictMode: the console owns timers, heartbeats and autosave that must start exactly once.
createRoot(document.getElementById("root")).render(
  <ErrorBoundary>{isAdmin ? <AdminPage /> : <ParticipantPage />}</ErrorBoundary>
);
