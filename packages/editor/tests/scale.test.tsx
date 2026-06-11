import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { HiermarkEditor } from "../src/HiermarkEditor";
import type { HiermarkEditorHandle } from "../src/types";

afterEach(() => cleanup());
beforeAll(() => {
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
});

// A large document — guards that the per-keystroke optimizations (shared
// snapshot, block-id skip-on-text-edit) stay CORRECT at scale, not just fast.
const BIG = Array.from({ length: 300 }, (_, i) => `## Section ${i}\n\nBody paragraph ${i}.`).join(
  "\n\n",
);

async function mount() {
  let handle: HiermarkEditorHandle | null = null;
  const utils = render(
    <HiermarkEditor
      surfaceId="s1"
      rootBlockId="blk_root"
      value={{ kind: "markdown", markdown: BIG }}
      onReady={(h) => {
        handle = h;
      }}
    />,
  );
  await waitFor(() => expect(handle).not.toBeNull());
  return { ...utils, editor: handle!.getUnsafeTiptapEditor() as Editor, getHandle: () => handle! };
}

describe("HiermarkEditor at scale (300 sections)", () => {
  it("assigns unique block ids to a large document", async () => {
    const { container } = await mount();
    const ids = [...container.querySelectorAll("[data-block-id]")].map((el) =>
      el.getAttribute("data-block-id"),
    );
    expect(ids.length).toBeGreaterThanOrEqual(600); // 300 headings + 300 paragraphs
    expect(new Set(ids).size).toBe(ids.length); // all unique
  });

  it("keeps every block id stable across a plain text edit (skips the dedup walk)", async () => {
    const { container, editor } = await mount();
    const before = [...container.querySelectorAll("[data-block-id]")].map((el) =>
      el.getAttribute("data-block-id"),
    );
    // Type into the first block — a pure text edit must not renumber any block.
    editor.chain().focus("start").insertContent("X").run();
    await waitFor(() => {
      const after = [...container.querySelectorAll("[data-block-id]")].map((el) =>
        el.getAttribute("data-block-id"),
      );
      expect(after).toEqual(before);
    });
  });

  it("projects a correct tree snapshot for the large document", async () => {
    const { getHandle } = await mount();
    const snap = getHandle().getSnapshot();
    expect(snap.rootBlockId).toBe("blk_root");
    // root + 300 headings + 300 paragraphs (paragraphs nest under their heading).
    expect(Object.keys(snap.blocks).length).toBeGreaterThan(600);
    expect(new Set(snap.blockOrder).size).toBe(snap.blockOrder.length);
  });
});
