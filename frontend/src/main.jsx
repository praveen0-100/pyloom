import { createRoot } from "react-dom/client";
import "./styles/style.css";
import "./styles/canvas.css";
import "./styles/app.css";
import { initTheme } from "./lib/theme";
import ParticipantPage from "./pages/ParticipantPage";
import AdminPage from "./pages/AdminPage";

initTheme();

// "/" is the participant console; "/admin" and "/admin.html" are the admin panel.
const isAdmin = /^\/admin(\.html)?\/?$/.test(window.location.pathname);

// No StrictMode: the console owns timers, heartbeats and autosave that must start exactly once.
createRoot(document.getElementById("root")).render(isAdmin ? <AdminPage /> : <ParticipantPage />);
