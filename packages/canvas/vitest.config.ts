import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      // Resolve the sibling package to source for fast dev/test without a build.
      // Real consumers resolve "@ham/editor" to its built dist via package exports.
      "@ham/editor": fileURLToPath(new URL("../editor/src/index.ts", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.{test,spec}.{ts,tsx}", "src/**/*.{test,spec}.{ts,tsx}"],
    css: false,
  },
});
