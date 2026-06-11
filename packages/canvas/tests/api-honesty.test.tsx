import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";
import { HiermarkCanvas } from "../src/HiermarkCanvas";
import type { HiermarkCanvasEditorDefaults, HiermarkCanvasHandle, HiermarkSurface } from "../src/types";

afterEach(() => cleanup());
beforeAll(() => {
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
});

const surface = (id: string, markdown: string): HiermarkSurface => ({
  id,
  rootBlockId: `${id}_root`,
  content: { kind: "markdown", markdown },
});

describe("read-only canvas (no create handler)", () => {
  it("mounts without createSurfaceFromBlock and shows no branch affordances", async () => {
    const { container } = render(
      <HiermarkCanvas
        rootSurfaceId="s_root"
        surfaces={{ s_root: surface("s_root", "# Root\n\nA paragraph.\n\n## Section\n\nMore.") }}
        branchEdges={[]}
        behavior={{ enableBranchCreation: false }}
        handlers={{}}
      />,
    );
    await waitFor(() => expect(container.querySelector(".tiptap")).not.toBeNull());
    expect(container.querySelector(".hiermark-branch-button")).toBeNull();
  });
});

describe("editorDefaults is curated", () => {
  it("rejects canvas-owned props at the type level and passes real defaults through", async () => {
    const defaults: HiermarkCanvasEditorDefaults = {
      ariaLabel: "Custom label",
      bubbleMenu: false,
    };
    // @ts-expect-error — `value` is canvas-owned (content comes from `surfaces`)
    const bad1: HiermarkCanvasEditorDefaults = { value: { kind: "markdown", markdown: "x" } };
    // @ts-expect-error — `onChange` is canvas-owned (wired to autosave)
    const bad2: HiermarkCanvasEditorDefaults = { onChange: () => {} };
    // @ts-expect-error — `onReady` is canvas-owned (handle registry)
    const bad3: HiermarkCanvasEditorDefaults = { onReady: () => {} };
    void bad1;
    void bad2;
    void bad3;

    const { container } = render(
      <HiermarkCanvas
        rootSurfaceId="s_root"
        surfaces={{ s_root: surface("s_root", "# Root") }}
        branchEdges={[]}
        editorDefaults={defaults}
        handlers={{}}
        behavior={{ enableBranchCreation: false }}
      />,
    );
    await waitFor(() =>
      expect(container.querySelector('[aria-label="Custom label"]')).not.toBeNull(),
    );
  });
});

describe("HiermarkCanvasHandle.focusBlock", () => {
  it("moves the caret into the requested block of the active surface", async () => {
    let handle: HiermarkCanvasHandle | null = null;
    const json = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { dataBlockId: "blk_a" },
          content: [{ type: "text", text: "Alpha." }],
        },
        {
          type: "paragraph",
          attrs: { dataBlockId: "blk_b" },
          content: [{ type: "text", text: "Bravo." }],
        },
      ],
    };
    const { container } = render(
      <HiermarkCanvas
        rootSurfaceId="s_root"
        surfaces={{
          s_root: {
            id: "s_root",
            rootBlockId: "blk_root",
            content: { kind: "tiptap-json", json },
          },
        }}
        branchEdges={[]}
        handlers={{ createSurfaceFromBlock: vi.fn() }}
        onReady={(h) => {
          handle = h;
        }}
      />,
    );
    await waitFor(() => expect(container.querySelector(".tiptap")).not.toBeNull());
    await waitFor(() => expect(handle).not.toBeNull());

    handle!.focusBlock("s_root", "blk_b");
    await waitFor(() => {
      // The caret block gets the active styling via the gutter decoration.
      const active = container.querySelector(".hiermark-block-active");
      expect(active?.getAttribute("data-block-id")).toBe("blk_b");
    });
  });
});
