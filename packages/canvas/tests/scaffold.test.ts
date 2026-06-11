import { describe, it, expect } from "vitest";
import { HIERMARK_CANVAS_VERSION } from "../src/index.js";

describe("@hiermark/canvas scaffold", () => {
  it("exposes a version", () => {
    expect(HIERMARK_CANVAS_VERSION).toBe("0.1.0");
  });
});
