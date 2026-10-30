import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Relative asset URLs so the built bundle works regardless of how it is served.
  base: "./",
  plugins: [tailwindcss(), react()],
});