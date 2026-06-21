import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { HIERMARK_EDITOR_VERSION } from "../src/index.js";
import pkg from "../package.json" with { type: "json" };

describe("@hiermark/editor scaffold", () => {
  it("exposes the package.json version (injected at build, never drifts)", () => {
    expect(HIERMARK_EDITOR_VERSION).toBe(pkg.version);
  });

  it("can construct a Tiptap editor headlessly under jsdom", () => {
    const editor = new Editor({ extensions: [StarterKit], content: "<p>hello</p>" });
    expect(editor.getHTML()).toContain("hello");
    editor.destroy();
  });
});
