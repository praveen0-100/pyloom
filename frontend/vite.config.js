import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development the Flask API (python backend/app.py, port 5000) is proxied so the
// React app uses the same relative /api URLs as in production.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": "http://127.0.0.1:5000", "/avatar": "http://127.0.0.1:5000" }
  },
  build: { outDir: "dist", emptyOutDir: true }
});
