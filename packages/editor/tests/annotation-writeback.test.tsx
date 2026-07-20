import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { HiermarkEditor } from "../src/HiermarkEditor";
import type { HiermarkAnnotationType, HiermarkEditorHandle } from "../src/types";
import { createExampleAnnotationRegistry } from "../src/annotations/recognizers";

afterEach(() => cleanup());
beforeAll(() => {
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
});

async function mount(markdown: string, annotations?: { types: HiermarkAnnotationType<any>[] }) {
  let handle: HiermarkEditorHandle | null = null;
  const utils = render(
    <HiermarkEditor
      surfaceId="s1"
      rootBlockId="blk_root"
      value={{ kind: "markdown", markdown }}
      {...(annotations ? { annotations } : {})}
      annotationContext={{}}
      onReady={(h) => {
        handle = h;
      }}
    />,
  );
  await waitFor(() => expect(handle).not.toBeNull());
  return { ...utils, handle: handle! };
}

const taskBlockId = (h: HiermarkEditorHandle) => {
  const snap = h.getSnapshot();
  return snap.blockOrder.find((id) => snap.blocks[id]!.type === "taskItem")!;
};

describe("block write-back — handle.updateBlock", () => {
  it("setAttrs flips a taskItem's canonical checked state (→ '- [x]')", async () => {
    const { handle } = await mount("- [ ] summarize the paper\n");
    const id = taskBlockId(handle);
    expect(handle.getMarkdown()).toContain("- [ ]");

    expect(handle.updateBlock(id, { setAttrs: { checked: true } })).toBe(true);
    await waitFor(() => expect(handle.getMarkdown()).toContain("- [x]"));
  });

  it("returns false for an unknown block id (no throw)", async () => {
    const { handle } = await mount("- [ ] a task\n");
    expect(handle.updateBlock("blk_does_not_exist", { setAttrs: { checked: true } })).toBe(false);
  });

  it("protects dataBlockId — a write can't change a block's identity", async () => {
    const { handle } = await mount("- [ ] a task\n");
    const id = taskBlockId(handle);
    // Attempt to hijack the id alongside a real attr change.
    expect(handle.updateBlock(id, { setAttrs: { dataBlockId: "blk_evil", checked: true } })).toBe(
      true,
    );
    await waitFor(() => expect(handle.getMarkdown()).toContain("- [x]"));
    const snap = handle.getSnapshot();
    expect(snap.blockOrder).toContain(id); // original id survives
    expect(snap.blockOrder).not.toContain("blk_evil");
  });
});

describe("annotation write-back — render `update`", () => {
  it("the example task chip's Done checkbox flips the source checkbox", async () => {
    const { container, handle } = await mount(
      "- [ ] summarize the paper\n",
      createExampleAnnotationRegistry(),
    );
    // The block chip renders inline; clicking it opens the popover with the render.
    const chip = await waitFor(() => {
      const el = container.querySelector<HTMLElement>(".hiermark-annotation-chip-task");
      expect(el).not.toBeNull();
      return el!;
    });
    fireEvent.click(chip);

    // Popover portals to document.body; find its Done checkbox and toggle it.
    const checkbox = await waitFor(() => {
      const el = document.querySelector<HTMLInputElement>(
        ".hiermark-annotation-popover input[type='checkbox']",
      );
      expect(el).not.toBeNull();
      return el!;
    });
    expect(checkbox.checked).toBe(false);
    fireEvent.click(checkbox);

    await waitFor(() => expect(handle.getMarkdown()).toContain("- [x]"));
  });

  it("replaceText rewrites an inline hit's range through a transaction", async () => {
    // A custom inline annotation over the word "TODO" whose popover renames it.
    const renameType: HiermarkAnnotationType = {
      name: "rename",
      placement: "inline",
      recognize: ({ block, text }) => {
        const i = text.indexOf("TODO");
        return i < 0 ? [] : [{ id: "r1", type: "rename", blockId: block.id, from: i, to: i + 4 }];
      },
      render: ({ update, close }) => (
        <button
          className="do-rename"
          onClick={() => {
            update({ replaceText: "DONE" });
            close?.();
          }}
        >
          rename
        </button>
      ),
    };
    const { container, handle } = await mount("A TODO here\n", { types: [renameType] });

    const anno = await waitFor(() => {
      const el = container.querySelector<HTMLElement>('[data-annotation-type="rename"]');
      expect(el).not.toBeNull();
      return el!;
    });
    fireEvent.click(anno);
    const btn = await waitFor(() => {
      const el = document.querySelector<HTMLButtonElement>(".do-rename");
      expect(el).not.toBeNull();
      return el!;
    });
    fireEvent.click(btn);

    await waitFor(() => expect(handle.getMarkdown()).toContain("A DONE here"));
    expect(handle.getMarkdown()).not.toContain("TODO");
  });
});
