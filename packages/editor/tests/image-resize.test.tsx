import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { HiermarkEditor } from "../src/HiermarkEditor";
import type { HiermarkEditorHandle } from "../src/types";

afterEach(() => cleanup());
beforeAll(() => {
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
});

async function mount(markdown: string) {
  let handle: HiermarkEditorHandle | null = null;
  render(
    <HiermarkEditor
      surfaceId="s1"
      rootBlockId="blk_root"
      value={{ kind: "markdown", markdown }}
      onReady={(h) => {
        handle = h;
      }}
    />,
  );
  await waitFor(() => expect(handle).not.toBeNull());
  return handle!.getUnsafeTiptapEditor() as Editor;
}

describe("image resize", () => {
  it("renders the image via the resize node view, alt intact", async () => {
    await mount("Here is ![a photo](https://example.com/p.png) in text.");
    // The resize-enabled Image extension installs a node view that renders an
    // <img> (so click-to-edit alt and the gutter still resolve the node).
    await waitFor(() => {
      const img = document.querySelector<HTMLImageElement>(".ProseMirror img");
      expect(img).not.toBeNull();
      expect(img!.getAttribute("alt")).toBe("a photo");
    });
  });

  it("exposes width/height as schema attrs so a resize can persist them", async () => {
    const editor = await mount("See ![x](https://example.com/p.png) here.");
    const attrs = editor.schema.nodes.image!.spec.attrs ?? {};
    expect(attrs).toHaveProperty("width");
    expect(attrs).toHaveProperty("height");
  });
});
