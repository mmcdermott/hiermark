import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";
import { HiermarkEditor } from "../src/HiermarkEditor";
import { createExampleAnnotationRegistry } from "../src/annotations/recognizers";
import type { HiermarkEditorHandle } from "../src/types";

afterEach(() => cleanup());
beforeAll(() => {
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
});

const para = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const li = (text: string, extra: unknown[] = []) => ({
  type: "listItem",
  content: [para(text), ...extra],
});

async function mountJson(json: unknown, extra: Record<string, unknown> = {}) {
  let handle: HiermarkEditorHandle | null = null;
  const utils = render(
    <HiermarkEditor
      surfaceId="s1"
      rootBlockId="blk_root"
      value={{ kind: "tiptap-json", json }}
      onReady={(h) => {
        handle = h;
      }}
      {...extra}
    />,
  );
  await waitFor(() => expect(handle).not.toBeNull());
  return { ...utils, getHandle: () => handle! };
}

describe("snapshot structure (regressions)", () => {
  it("surfaces list items nested inside a blockquote (not just the quote)", async () => {
    const json = {
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [{ type: "bulletList", content: [li("alpha"), li("beta")] }],
        },
      ],
    };
    const { getHandle } = await mountJson(json);
    const snap = getHandle().getSnapshot();
    const items = Object.values(snap.blocks).filter((b) => b.type === "listItem");
    const quote = Object.values(snap.blocks).find((b) => b.type === "blockquote")!;
    expect(items.map((i) => i.textPreview).sort()).toEqual(["alpha", "beta"]);
    expect(items.every((i) => i.parentId === quote.id)).toBe(true);
    expect(snap.blockOrder).toContain(items[0]!.id);
  });

  it("uses only a list item's own text (excludes nested sublist) for its preview", async () => {
    const json = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [li("parent", [{ type: "bulletList", content: [li("child")] }])],
        },
      ],
    };
    const { getHandle } = await mountJson(json);
    const snap = getHandle().getSnapshot();
    const parent = Object.values(snap.blocks).find((b) => b.textPreview === "parent")!;
    const child = Object.values(snap.blocks).find((b) => b.textPreview === "child")!;
    expect(parent).toBeDefined();
    expect(child.parentId).toBe(parent.id); // nested item is a child block
  });

  it("maps inline annotation offsets correctly across a hard break (inline atom)", async () => {
    const json = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "before" },
            { type: "hardBreak" },
            { type: "text", text: " @vaswani2017 tail" },
          ],
        },
      ],
    };
    const { container } = await mountJson(json, {
      annotations: createExampleAnnotationRegistry(),
      annotationContext: { references: { vaswani2017: { title: "Attention" } } },
    });
    let cite: Element | null = null;
    await waitFor(() => {
      cite = container.querySelector('[data-annotation-type="citation"]');
      expect(cite).not.toBeNull();
    });
    // The decoration must land exactly on "@vaswani2017" despite the hardBreak
    // shifting PM positions relative to the textContent offset.
    expect(cite!.textContent).toBe("@vaswani2017");
  });
});
