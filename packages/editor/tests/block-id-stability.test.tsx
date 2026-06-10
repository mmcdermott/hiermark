import { describe, it, expect, afterEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { HamEditor } from "../src/HamEditor";
import type { HamEditorHandle } from "../src/types";

afterEach(() => cleanup());

/**
 * Block ids are the anchor for host-persisted branch edges and annotations, so
 * duplicate resolution must keep an id on the block the host *thinks* it
 * refers to — not whichever copy happens to appear first in document order.
 */

async function mount(markdown: string) {
  let handle: HamEditorHandle | null = null;
  render(
    <HamEditor
      surfaceId="s1"
      rootBlockId="blk_root"
      value={{ kind: "markdown", markdown }}
      onReady={(h) => {
        handle = h;
      }}
    />,
  );
  await waitFor(() => expect(handle).not.toBeNull());
  const editor = handle!.getUnsafeTiptapEditor() as Editor;
  const idsInOrder = () => {
    const out: { id: string; text: string; type: string }[] = [];
    editor.state.doc.descendants((node) => {
      const id = node.attrs?.dataBlockId as string | null;
      if (id) out.push({ id, text: node.textContent, type: node.type.name });
    });
    return out;
  };
  return { handle: handle!, editor, idsInOrder };
}

describe("block-id stability under paste and split", () => {
  it("a copy pasted ABOVE the original does not steal the original's id", async () => {
    const { editor, idsInOrder } = await mount("Hello world\n");
    const [orig] = idsInOrder();
    expect(orig).toBeTruthy();

    // Simulate pasting a clipboard copy (ids round-trip through the clipboard)
    // at the very top of the document, above its source block.
    editor.commands.insertContentAt(0, {
      type: "paragraph",
      attrs: { dataBlockId: orig!.id },
      content: [{ type: "text", text: "Hello world" }],
    });

    const after = idsInOrder().filter((b) => b.text === "Hello world");
    expect(after).toHaveLength(2);
    // The pasted copy (first in document order) gets a FRESH id; the original
    // (now second) keeps the id the host may have persisted.
    expect(after[0]!.id).not.toBe(orig!.id);
    expect(after[1]!.id).toBe(orig!.id);
  });

  it("a copy pasted BELOW the original still leaves the original's id in place", async () => {
    const { editor, idsInOrder } = await mount("Hello world\n");
    const [orig] = idsInOrder();

    editor.commands.insertContentAt(editor.state.doc.content.size, {
      type: "paragraph",
      attrs: { dataBlockId: orig!.id },
      content: [{ type: "text", text: "Hello world" }],
    });

    const after = idsInOrder().filter((b) => b.text === "Hello world");
    expect(after).toHaveLength(2);
    expect(after[0]!.id).toBe(orig!.id);
    expect(after[1]!.id).not.toBe(orig!.id);
  });

  it("Enter at the START of a block keeps the id on the content-bearing half", async () => {
    const { editor, idsInOrder } = await mount("Hello\n");
    const [orig] = idsInOrder();

    // Cursor at offset 0 inside the paragraph, then split — the common
    // "insert a line above" gesture.
    editor.chain().setTextSelection(1).splitBlock().run();

    const after = idsInOrder();
    const empty = after.find((b) => b.text === "");
    const content = after.find((b) => b.text === "Hello");
    expect(empty).toBeTruthy();
    expect(content).toBeTruthy();
    // Identity follows the content: the original id stays on "Hello", and the
    // new empty block above gets the fresh id.
    expect(content!.id).toBe(orig!.id);
    expect(empty!.id).not.toBe(orig!.id);
  });

  it("Enter MID-block keeps the id on the first half (the documented invariant)", async () => {
    const { editor, idsInOrder } = await mount("HelloWorld\n");
    const [orig] = idsInOrder();

    editor.chain().setTextSelection(6).splitBlock().run();

    const after = idsInOrder();
    const first = after.find((b) => b.text === "Hello");
    const second = after.find((b) => b.text === "World");
    expect(first!.id).toBe(orig!.id);
    expect(second!.id).not.toBe(orig!.id);
  });

  it("Enter at the END of a block keeps the id and gives the new empty block a fresh one", async () => {
    const { editor, idsInOrder } = await mount("Hello\n");
    const [orig] = idsInOrder();

    editor.chain().setTextSelection(6).splitBlock().run();

    const after = idsInOrder();
    const content = after.find((b) => b.text === "Hello");
    const empty = after.find((b) => b.text === "");
    expect(content!.id).toBe(orig!.id);
    expect(empty!.id).not.toBe(orig!.id);
    expect(empty!.id).toBeTruthy();
  });

  it("Enter at the start of a LIST ITEM keeps the id on the content-bearing item", async () => {
    const { editor, idsInOrder } = await mount("- Alpha\n- Beta\n");
    const alphaItem = idsInOrder().find((b) => b.type === "listItem" && b.text === "Alpha");
    expect(alphaItem).toBeTruthy();

    // Find the text position at the start of "Alpha" and split the item there.
    let alphaPos = -1;
    editor.state.doc.descendants((node, pos) => {
      if (node.isText && node.text === "Alpha") alphaPos = pos;
    });
    expect(alphaPos).toBeGreaterThan(-1);
    editor.chain().setTextSelection(alphaPos).splitListItem("listItem").run();

    const after = idsInOrder().filter((b) => b.type === "listItem");
    const content = after.find((b) => b.text === "Alpha");
    const empty = after.find((b) => b.text === "");
    expect(content).toBeTruthy();
    expect(empty).toBeTruthy();
    expect(content!.id).toBe(alphaItem!.id);
    expect(empty!.id).not.toBe(alphaItem!.id);
  });
});
