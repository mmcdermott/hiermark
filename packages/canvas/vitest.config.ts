import { defineConfig } from "vitest/config";
import { readFileSync } from "node:fs";

// Mirror tsup's compile-time version injection so HIERMARK_CANVAS_VERSION
// resolves to the real package.json version under test too.
const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default defineConfig({
  define: { __HIERMARK_PKG_VERSION__: JSON.stringify(version) },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.{test,spec}.{ts,tsx}", "src/**/*.{test,spec}.{ts,tsx}"],
    css: false,
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.d.ts", "src/index.ts", "**/*.test.*"],
      thresholds: { statements: 80, branches: 69, functions: 73, lines: 83 },
    },
  },
});
