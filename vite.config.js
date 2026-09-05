import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages served von https://<user>.github.io/<repo>/ braucht einen
// Base-Pfad, der dem Repo-Namen entspricht. Die GitHub-Actions-Pipeline
// (.github/workflows/deploy.yml) setzt VITE_BASE_PATH automatisch anhand
// des Repo-Namens. Für lokale Entwicklung (npm run dev) bleibt es "/".
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || "/",
  build: {
    outDir: "dist",
    sourcemap: false
  }
});
