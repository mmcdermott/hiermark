import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";
import * as Y from "yjs";
import { HamEditor } from "../src/HamEditor";
import type {
  HamCollaborationConfig,
  HamCollaborationProvider,
  HamCollaborationRuntime,
  HamEditorHandle,
} from "../src/types";

afterEach(() => cleanup());
beforeAll(() => {
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
});

/** An always-synced, no-network provider/runtime sharing a given Y.Doc. */
function fakeRuntime(ydoc: Y.Doc): HamCollaborationRuntime {
  const provider: HamCollaborationProvider = {
    synced: true,
    hasUnsyncedChanges: false,
    on() {},
    off() {},
    destroy() {},
  };
  return { ydoc, connect: async () => provider };
}

function collabConfig(ydoc: Y.Doc, runtime: HamCollaborationRuntime): HamCollaborationConfig {
  return { enabled: true, provider: "hocuspocus", documentName: "doc", url: "", ydoc, runtime };
}

async function mountCollab(
  ydoc: Y.Doc,
  runtime: HamCollaborationRuntime,
  surfaceId: string,
  markdown: string,
) {
  let handle: HamEditorHandle | null = null;
  const utils = render(
    <HamEditor
      surfaceId={surfaceId}
      rootBlockId={`blk_root_${surfaceId}`}
      value={{ kind: "markdown", markdown }}
      collaboration={collabConfig(ydoc, runtime)}
      onReady={(h) => {
        handle = h;
      }}
    />,
  );
  await waitFor(() => expect(handle).not.toBeNull());
  return { ...utils, getHandle: () => handle! };
}

describe("collaboration", () => {
  it("two editors sharing a Y.Doc converge on the same content", async () => {
    const shared = new Y.Doc();
    const rt = fakeRuntime(shared);

    const a = await mountCollab(shared, rt, "a", "# Hello world\n\nShared body.");
    await waitFor(() => expect(a.getHandle().getMarkdown()).toContain("Hello world"));

    // Second editor on the same doc with *different* seed markdown.
    const b = await mountCollab(shared, rt, "b", "# Totally different");
    // It converges to the shared content and does NOT seed its own markdown.
    await waitFor(() => expect(b.getHandle().getMarkdown()).toContain("Hello world"));
    expect(b.getHandle().getMarkdown()).not.toContain("Totally different");
  });

  it("does not duplicate initial content when a second editor seeds the same markdown", async () => {
    const shared = new Y.Doc();
    const rt = fakeRuntime(shared);

    const a = await mountCollab(shared, rt, "a", "# Title\n\nBody.");
    await waitFor(() => expect(a.getHandle().getMarkdown()).toContain("Title"));

    const b = await mountCollab(shared, rt, "b", "# Title\n\nBody.");
    await waitFor(() => expect(b.getHandle().getMarkdown()).toContain("Title"));
    // Pre-sync seeding must not append a second copy of the content.
    const md = b.getHandle().getMarkdown();
    expect((md.match(/Title/g) ?? []).length).toBe(1);
    expect((md.match(/Body\./g) ?? []).length).toBe(1);
  });

  it("keeps block ids unique after collaborative edits", async () => {
    const shared = new Y.Doc();
    const rt = fakeRuntime(shared);
    const a = await mountCollab(shared, rt, "a", "# One\n\nTwo\n\nThree");
    await waitFor(() => expect(a.getHandle().getMarkdown()).toContain("One"));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const editor = a.getHandle().getUnsafeTiptapEditor() as any;
    editor.chain().focus().insertContentAt(1, "Edited ").run();

    await waitFor(() => {
      const ids: string[] = [];
      editor.state.doc.descendants((n: any) => {
        if (n.attrs?.dataBlockId) ids.push(n.attrs.dataBlockId);
      });
      expect(ids.length).toBeGreaterThan(1);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });
});
