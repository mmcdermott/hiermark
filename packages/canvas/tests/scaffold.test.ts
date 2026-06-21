import { describe, it, expect } from "vitest";
import { HIERMARK_CANVAS_VERSION } from "../src/index.js";
import pkg from "../package.json" with { type: "json" };

describe("@hiermark/canvas scaffold", () => {
  it("exposes the package.json version (injected at build, never drifts)", () => {
    expect(HIERMARK_CANVAS_VERSION).toBe(pkg.version);
  });
});
