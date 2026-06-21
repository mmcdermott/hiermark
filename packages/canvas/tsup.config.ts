import { defineConfig } from "tsup";
import { copyFileSync, existsSync, readFileSync } from "node:fs";

// Single-source the published version from package.json so the exported
// HIERMARK_CANVAS_VERSION constant can never drift (see src/index.ts). Mirrored
// in vitest.config.ts for the test build.
const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  define: { __HIERMARK_PKG_VERSION__: JSON.stringify(version) },
  external: ["react", "react-dom", "react/jsx-runtime", "@hiermark/editor"],
  onSuccess: async () => {
    if (existsSync("src/styles.css")) {
      copyFileSync("src/styles.css", "dist/styles.css");
    }
  },
});
