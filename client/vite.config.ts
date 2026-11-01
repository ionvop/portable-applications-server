import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    // The client's local Flask API. Vite serves the UI on 5173 and proxies
    // /api here, so the frontend calls /api/... on its own origin in both
    // development and production.
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8757",
        changeOrigin: true,
      },
    },
  },
});