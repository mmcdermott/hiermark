import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Deployed to GitHub Pages under https://mmcdermott.github.io/ham/, so assets
// must be served from the "/ham/" base. Override with HAM_DOCS_BASE for local
// preview at the root.
const base = process.env.HAM_DOCS_BASE ?? "/ham/";

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
