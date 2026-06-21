import { defineConfig } from "tsup";
import { copyFileSync, existsSync, readFileSync } from "node:fs";

// Single-source the published version from package.json so the exported
// HIERMARK_EDITOR_VERSION constant can never drift (see src/index.ts). The same
// define is mirrored in vitest.config.ts for the test build.
const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default defineConfig({
  // Named entries → `dist/index.*` and `dist/markdown.*`. The `markdown` entry is the
  // pure, React-free subpath (`@hiermark/editor/markdown`) for server-side reconcilers.
  entry: { index: "src/index.ts", markdown: "src/markdown/index.ts" },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  define: { __HIERMARK_PKG_VERSION__: JSON.stringify(version) },
  // react / react-dom are peers; all `dependencies`/`peerDependencies` (incl.
  // @tiptap/pm and yjs) are auto-externalized by tsup.
  external: ["react", "react-dom", "react/jsx-runtime"],
  onSuccess: async () => {
    if (existsSync("src/styles.css")) {
      copyFileSync("src/styles.css", "dist/styles.css");
    }
  },
});
