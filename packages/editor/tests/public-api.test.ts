import { describe, it, expect, expectTypeOf } from "vitest";
import * as api from "../src/index";
import type { HiermarkEditorProps, HiermarkEditorHandle, HiermarkBranchPolicy } from "../src/index";

/**
 * Guards the public export surface: a missing/renamed export is a breaking change
 * and should fail here, not silently ship. (Values checked at runtime; a couple of
 * key types checked with expectTypeOf, enforced by `tsc`.)
 */
describe("public API surface", () => {
  it("exports the headline component + factory + version", () => {
    expect(typeof api.HiermarkEditor).toBe("function");
    expect(typeof api.createHiermarkEditorExtensions).toBe("function");
    expect(typeof api.HIERMARK_EDITOR_VERSION).toBe("string");
  });

  it("exports the extensions added during hardening", () => {
    for (const name of [
      "HiermarkCodeBlock",
      "HiermarkInlineMath",
      "HiermarkBlockMath",
      "Sanitize",
      "LinkEditor",
      "ImageUpload",
      "ImageEditor",
      "BlockId",
      "BlockGutter",
    ] as const) {
      expect(api[name], name).toBeTruthy();
    }
  });

  it("exports the pure helpers", () => {
    for (const name of [
      "isSafeUri",
      "isSafeImageSrc",
      "collectBlockIdentities",
      "planBlockIdRestore",
      "computeBranchPointSet",
      "branchModeFromSet",
      "resolveBranchMode",
      "uploadHiermarkImages",
      "generateBlockId",
    ] as const) {
      expect(typeof api[name], name).toBe("function");
    }
  });

  it("isSafeUri / isSafeImageSrc behave", () => {
    expect(api.isSafeUri("javascript:alert(1)")).toBe(false);
    expect(api.isSafeUri("https://x.com")).toBe(true);
    expect(api.isSafeImageSrc("data:image/png;base64,AAA")).toBe(true);
  });

  it("key public types are shaped as expected", () => {
    expectTypeOf<HiermarkEditorProps["surfaceId"]>().toEqualTypeOf<string>();
    expectTypeOf<HiermarkEditorHandle["getMode"]>().returns.toEqualTypeOf<"rich" | "source">();
    expectTypeOf<HiermarkBranchPolicy>().extract<"bubble-up">().toEqualTypeOf<"bubble-up">();
  });
});
