import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { HIERMARK_EDITOR_VERSION } from "../src/index.js";

describe("@hiermark/editor scaffold", () => {
  it("exposes a version", () => {
    expect(HIERMARK_EDITOR_VERSION).toBe("0.1.0");
  });

  it("can construct a Tiptap editor headlessly under jsdom", () => {
    const editor = new Editor({ extensions: [StarterKit], content: "<p>hello</p>" });
    expect(editor.getHTML()).toContain("hello");
    editor.destroy();
  });
});
