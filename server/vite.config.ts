import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Relative asset URLs so the built bundle works regardless of how it is served.
  base: "./",
  plugins: [tailwindcss(), react()],
  server: {
    // Fixed port so the documented dev URL (http://localhost:5173) is stable.
    port: 5173,
    strictPort: true,
    proxy: {
      // Forward API calls to the Flask backend started by `npm run dev:api`.
      "/api": {
        target: "http://127.0.0.1:8756",
        changeOrigin: true,
      },
    },
  },
});