import { defineConfig } from "tsup";
import { copyFileSync, existsSync } from "node:fs";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ["react", "react-dom", "react/jsx-runtime", "@hiermark/editor"],
  onSuccess: async () => {
    if (existsSync("src/styles.css")) {
      copyFileSync("src/styles.css", "dist/styles.css");
    }
  },
});
