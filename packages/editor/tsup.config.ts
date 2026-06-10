import { defineConfig } from "tsup";
import { copyFileSync, existsSync } from "node:fs";

export default defineConfig({
  // Named entries → `dist/index.*` and `dist/markdown.*`. The `markdown` entry is the
  // pure, React-free subpath (`@ham/editor/markdown`) for server-side reconcilers.
  entry: { index: "src/index.ts", markdown: "src/markdown/index.ts" },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  // react / react-dom are peers; all `dependencies` are auto-externalized by tsup.
  external: ["react", "react-dom", "react/jsx-runtime"],
  onSuccess: async () => {
    if (existsSync("src/styles.css")) {
      copyFileSync("src/styles.css", "dist/styles.css");
    }
  },
});
