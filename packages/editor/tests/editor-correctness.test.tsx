import { describe, it, expect, afterEach, vi } from "vitest";
import { render, waitFor, cleanup, act, fireEvent } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import * as Y from "yjs";
import { HamEditor } from "../src/HamEditor";
import type {
  HamCollaborationProvider,
  HamCollaborationRuntime,
  HamEditorHandle,
  HamEditorProps,
} from "../src/types";

afterEach(() => cleanup());

async function mount(props: Partial<HamEditorProps> = {}) {
  let handle: HamEditorHandle | null = null;
  const utils = render(
    <HamEditor
      surfaceId="s1"
      rootBlockId="blk_root"
      value={{ kind: "markdown", markdown: "Hello world.\n" }}
      onReady={(h) => {
        handle = h;
      }}
      {...props}
    />,
  );
  await waitFor(() => expect(handle).not.toBeNull());
  return { ...utils, getHandle: () => handle! };
}

describe("popovers close on document change (stale-position protection)", () => {
  it("closes an open math popover when the document changes", async () => {
    const { container, getHandle } = await mount({
      value: { kind: "markdown", markdown: "Formula $a+b$ here.\n" },
    });
    const editor = getHandle().getUnsafeTiptapEditor() as Editor;
    const mathEl = await waitFor(() => {
      const el = container.querySelector<HTMLElement>('[data-type="inline-math"]');
      expect(el).not.toBeNull();
      return el!;
    });
    fireEvent.click(mathEl);
    await waitFor(() => expect(document.querySelector(".ham-math-popover")).not.toBeNull());

    // Any doc change (here: a programmatic insert standing in for a remote
    // collab edit or an upload resolving) must close the popover — its captured
    // position may no longer point at the same node.
    act(() => {
      editor.commands.insertContentAt(1, "X");
    });
    await waitFor(() => expect(document.querySelector(".ham-math-popover")).toBeNull());
  });
});

describe("snapshot cache invalidation", () => {
  it("does not serve a stale snapshot after surfaceId changes for the same doc", async () => {
    let handle: HamEditorHandle | null = null;
    const view = render(
      <HamEditor
        surfaceId="s1"
        rootBlockId="blk_root"
        value={{ kind: "markdown", markdown: "Same doc.\n" }}
        onReady={(h) => {
          handle = h;
        }}
      />,
    );
    await waitFor(() => expect(handle).not.toBeNull());
    expect(handle!.getSnapshot().surfaceId).toBe("s1");

    view.rerender(
      <HamEditor
        surfaceId="s2"
        rootBlockId="blk_root"
        value={{ kind: "markdown", markdown: "Same doc.\n" }}
        onReady={(h) => {
          handle = h;
        }}
      />,
    );
    // The doc is unchanged (same PM doc identity) — only the cache eviction
    // makes the snapshot pick up the new surface identity.
    await waitFor(() => expect(handle!.getSnapshot().surfaceId).toBe("s2"));
  });
});

describe("revision swap while in source mode", () => {
  it("resyncs the source textarea to the new revision", async () => {
    let handle: HamEditorHandle | null = null;
    const view = render(
      <HamEditor
        surfaceId="s1"
        rootBlockId="blk_root"
        value={{ kind: "markdown", markdown: "Version one.\n" }}
        revision={1}
        onReady={(h) => {
          handle = h;
        }}
      />,
    );
    await waitFor(() => expect(handle).not.toBeNull());
    act(() => {
      handle!.setMode("source");
    });
    const ta = await waitFor(() => {
      const el = document.querySelector<HTMLTextAreaElement>(".ham-source-editor");
      expect(el).not.toBeNull();
      return el!;
    });
    expect(ta.value).toContain("Version one.");

    view.rerender(
      <HamEditor
        surfaceId="s1"
        rootBlockId="blk_root"
        value={{ kind: "markdown", markdown: "Version two.\n" }}
        revision={2}
        onReady={(h) => {
          handle = h;
        }}
      />,
    );
    await waitFor(() => expect(ta.value).toContain("Version two."));
    // And a save from source mode persists the new revision, not stale text.
    const payload = await handle!.save();
    expect(payload.content.markdown).toContain("Version two.");
  });
});

describe("collab gate timeout", () => {
  it("never reports 'timedout' after an already-synced provider reported 'synced'", async () => {
    vi.useFakeTimers();
    try {
      const ydoc = new Y.Doc();
      const provider: HamCollaborationProvider = {
        synced: true, // pre-synced (e.g. a custom runtime reusing a live socket)
        hasUnsyncedChanges: false,
        on() {},
        off() {},
        destroy() {},
      };
      const runtime: HamCollaborationRuntime = { ydoc, connect: async () => provider };
      const statuses: string[] = [];
      render(
        <HamEditor
          surfaceId="s1"
          rootBlockId="blk_root"
          value={{ kind: "markdown", markdown: "Hi.\n" }}
          collaboration={{
            enabled: true,
            documentName: "doc",
            ydoc,
            runtime,
            initialSyncTimeoutMs: 50,
            onStatusChange: (s) => statuses.push(s),
          }}
        />,
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });
      expect(statuses).toContain("synced");
      expect(statuses).not.toContain("timedout");
    } finally {
      vi.useRealTimers();
    }
  });
});
