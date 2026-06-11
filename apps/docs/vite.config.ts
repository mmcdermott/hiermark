import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Deployed to GitHub Pages under https://mmcdermott.github.io/hiermark/, so assets
// must be served from the "/hiermark/" base. Override with HIERMARK_DOCS_BASE for local
// preview at the root.
const base = process.env.HIERMARK_DOCS_BASE ?? "/hiermark/";

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
