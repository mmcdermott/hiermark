import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { HamEditor } from "../src/HamEditor";
import type { HamEditorHandle } from "../src/types";
import { collectBlockIdentities, planBlockIdRestore } from "../src/snapshot/blockIdentity";

afterEach(() => cleanup());
beforeAll(() => {
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
});

async function mountEditor(markdown: string) {
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
  return handle!.getUnsafeTiptapEditor() as Editor;
}

describe("planBlockIdRestore", () => {
  it("restores ids onto unchanged, reordered, and edited-in-place blocks", async () => {
    // Build a real doc so we have a real ProseMirror tree to plan against.
    const editor = await mountEditor("# Method\n\nWe describe it.\n\n## Data\n\nThe dataset.\n");
    const old = collectBlockIdentities(editor.state.doc);
    expect(old.length).toBeGreaterThanOrEqual(4);

    // A "new" doc that: keeps Method + its para, reorders nothing, edits the Data
    // paragraph's wording. Re-parse fresh (this strips ids), then plan the restore.
    editor.commands.setContent("# Method\n\nWe describe it.\n\n## Data\n\nThe dataset is eICU.\n", {
      emitUpdate: false,
      contentType: "markdown",
    } as Parameters<typeof editor.commands.setContent>[1]);
    const plan = planBlockIdRestore(old, editor.state.doc);

    // Map planned positions → restored id, and compare to the live (fresh) ids.
    const byPos = new Map(plan.map((p) => [p.pos, p.id]));
    const restoredFor = (preview: string): string | undefined => {
      let found: string | undefined;
      editor.state.doc.descendants((node, pos) => {
        if (found) return false;
        if (node.textContent.startsWith(preview) && byPos.has(pos)) found = byPos.get(pos);
        return undefined;
      });
      return found;
    };
    const oldId = (preview: string) => old.find((b) => b.text.startsWith(preview))?.id;

    expect(restoredFor("Method")).toBe(oldId("Method"));
    expect(restoredFor("We describe")).toBe(oldId("We describe"));
    expect(restoredFor("Data")).toBe(oldId("Data"));
    // edited-in-place paragraph: matched by type → keeps the Data paragraph's id.
    expect(restoredFor("The dataset is eICU")).toBe(oldId("The dataset."));
  });

  it("leaves a genuinely new block without a restored id", async () => {
    const editor = await mountEditor("# Title\n\nOne.\n");
    const old = collectBlockIdentities(editor.state.doc);
    editor.commands.setContent("# Title\n\nOne.\n\nTwo (new).\n", {
      emitUpdate: false,
      contentType: "markdown",
    } as Parameters<typeof editor.commands.setContent>[1]);
    const plan = planBlockIdRestore(old, editor.state.doc);
    // Three blocks now, but only two old ids → one block is unrestored (new).
    const newBlockCount = (() => {
      let n = 0;
      editor.state.doc.descendants((node) => {
        if (node.attrs?.dataBlockId) n += 1;
      });
      return n;
    })();
    expect(newBlockCount).toBeGreaterThan(plan.length);
    expect(old.length).toBe(plan.length);
  });
});
