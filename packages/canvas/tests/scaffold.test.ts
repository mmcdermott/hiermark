import { describe, it, expect } from "vitest";
import { HAM_CANVAS_VERSION } from "../src/index.js";

describe("@ham/canvas scaffold", () => {
  it("exposes a version", () => {
    expect(HAM_CANVAS_VERSION).toBe("0.1.0");
  });
});
