import { describe, it, expect, afterEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";
import { HamEditor } from "../src/HamEditor";
import type { HamCollaborationConfig, HamEditorHandle, HamEditorProps } from "../src/types";

afterEach(() => cleanup());

/**
 * Every declared prop must do what it says — these tests pin the contracts
 * the 2026-06-10 audit found drifting (autofocus variants coerced to false,
 * highlightedBlockIds ignored, collab config demanding fake transport fields).
 */

async function mount(props: Partial<HamEditorProps> = {}) {
  let handle: HamEditorHandle | null = null;
  const utils = render(
    <HamEditor
      surfaceId="s1"
      rootBlockId="blk_root"
      value={{ kind: "markdown", markdown: "# Title\n\nFirst para.\n\nSecond para.\n" }}
      onReady={(h) => {
        handle = h;
      }}
      {...props}
    />,
  );
  await waitFor(() => expect(handle).not.toBeNull());
  return { ...utils, getHandle: () => handle! };
}

describe("autofocus contract", () => {
  it('autofocus="start" places the caret at the document start', async () => {
    const { getHandle } = await mount({ autofocus: "start" });
    const editor = getHandle().getUnsafeTiptapEditor() as {
      state: { selection: { from: number } };
    };
    await waitFor(() => expect(editor.state.selection.from).toBe(1));
  });

  it("autofocus={blockId} places the caret inside that block", async () => {
    const { getHandle } = await mount();
    const snap = getHandle().getSnapshot();
    const second = Object.values(snap.blocks).find((b) => b.textPreview.startsWith("Second para"))!;
    cleanup();

    // Remount with the same content + a block-id autofocus. Ids re-stamp on a
    // fresh mount, so resolve the target id from the new instance's snapshot
    // via the same text and assert the caret landed inside that block.
    let handle: HamEditorHandle | null = null;
    const { container } = render(
      <HamEditor
        surfaceId="s1"
        rootBlockId="blk_root"
        value={{ kind: "tiptap-json", json: tiptapDocWithIds() }}
        autofocus="blk_target"
        onReady={(h) => {
          handle = h;
        }}
      />,
    );
    await waitFor(() => expect(handle).not.toBeNull());
    const editor = handle!.getUnsafeTiptapEditor() as {
      state: {
        selection: { $from: { node: (depth?: number) => { attrs?: Record<string, unknown> } } };
      };
    };
    await waitFor(() => {
      const node = editor.state.selection.$from.node(1);
      expect(node.attrs?.dataBlockId).toBe("blk_target");
    });
    expect(container.querySelector(".tiptap")).not.toBeNull();
    expect(second).toBeTruthy(); // (sanity from the first mount)
  });

  it("a nonexistent autofocus block id fails gracefully", async () => {
    const { getHandle } = await mount({ autofocus: "blk_does_not_exist" });
    expect(getHandle().getMarkdown()).toContain("First para.");
  });
});

function tiptapDocWithIds() {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { dataBlockId: "blk_first" },
        content: [{ type: "text", text: "First." }],
      },
      {
        type: "paragraph",
        attrs: { dataBlockId: "blk_target" },
        content: [{ type: "text", text: "Target." }],
      },
    ],
  };
}

describe("highlightedBlockIds", () => {
  it("decorates exactly the listed blocks and re-decorates on prop change", async () => {
    let handle: HamEditorHandle | null = null;
    const view = render(
      <HamEditor
        surfaceId="s1"
        rootBlockId="blk_root"
        value={{ kind: "tiptap-json", json: tiptapDocWithIds() }}
        highlightedBlockIds={["blk_target"]}
        onReady={(h) => {
          handle = h;
        }}
      />,
    );
    await waitFor(() => expect(handle).not.toBeNull());
    await waitFor(() => {
      const hits = [...document.querySelectorAll(".ham-block-highlighted")];
      expect(hits).toHaveLength(1);
      expect(hits[0]!.getAttribute("data-block-id")).toBe("blk_target");
    });

    view.rerender(
      <HamEditor
        surfaceId="s1"
        rootBlockId="blk_root"
        value={{ kind: "tiptap-json", json: tiptapDocWithIds() }}
        highlightedBlockIds={["blk_first"]}
        onReady={(h) => {
          handle = h;
        }}
      />,
    );
    await waitFor(() => {
      const hits = [...document.querySelectorAll(".ham-block-highlighted")];
      expect(hits).toHaveLength(1);
      expect(hits[0]!.getAttribute("data-block-id")).toBe("blk_first");
    });
  });
});

describe("collaboration config union", () => {
  it("a custom runtime config type-checks without provider/url, and a hocuspocus config requires url", () => {
    const runtimeConfig: HamCollaborationConfig = {
      enabled: true,
      documentName: "doc",
      runtime: { ydoc: {}, connect: async () => ({ synced: true }) as never },
    };
    const hocuspocusConfig: HamCollaborationConfig = {
      enabled: true,
      documentName: "doc",
      provider: "hocuspocus",
      url: "wss://example",
    };
    // @ts-expect-error — hocuspocus transport without a url is invalid
    const missingUrl: HamCollaborationConfig = {
      enabled: true,
      documentName: "doc",
      provider: "hocuspocus",
    };
    // @ts-expect-error — neither runtime nor provider/url is invalid
    const neither: HamCollaborationConfig = { enabled: true, documentName: "doc" };
    expect([runtimeConfig, hocuspocusConfig, missingUrl, neither].length).toBe(4);
  });
});
