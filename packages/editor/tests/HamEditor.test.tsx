import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { afterEach } from "vitest";
import { HamEditor } from "../src/HamEditor";
import type { HamBranchRequestEvent, HamEditorHandle } from "../src/types";

afterEach(() => cleanup());

beforeAll(() => {
  // jsdom lacks scrollIntoView; HamEditor's handle may call it.
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
});

const MD = "# Method\n\nWe describe it.\n\n## Data\n\nThe dataset is eICU.\n\n- [ ] pull cohort\n";

async function mountEditor(extra: Partial<Parameters<typeof HamEditor>[0]> = {}) {
  let handle: HamEditorHandle | null = null;
  const utils = render(
    <HamEditor
      surfaceId="s1"
      rootBlockId="blk_root"
      title="Method"
      value={{ kind: "markdown", markdown: MD }}
      onReady={(h) => {
        handle = h;
      }}
      {...extra}
    />,
  );
  await waitFor(() => expect(handle).not.toBeNull());
  return { ...utils, getHandle: () => handle! };
}

describe("HamEditor", () => {
  it("assigns a unique data-block-id to every block (no duplicates)", async () => {
    const { container } = await mountEditor();
    await waitFor(() => {
      const ids = [...container.querySelectorAll("[data-block-id]")].map((el) =>
        el.getAttribute("data-block-id"),
      );
      expect(ids.length).toBeGreaterThanOrEqual(4); // 2 headings, a para, a task
      ids.forEach((id) => expect(id).toMatch(/^blk_/));
      expect(new Set(ids).size).toBe(ids.length); // all unique
    });
  });

  it("preserves explicit dataBlockId attrs from seeded tiptap-json", async () => {
    // The canvas seeds anchor blocks with stable ids so branch edges / connectors
    // resolve to real blocks — that relies on BlockId keeping explicit unique ids.
    const { getHandle } = await mountEditor({
      value: {
        kind: "tiptap-json",
        json: {
          type: "doc",
          content: [
            {
              type: "heading",
              attrs: { level: 2, dataBlockId: "blk_anchor" },
              content: [{ type: "text", text: "Q1 goals" }],
            },
            { type: "paragraph", content: [{ type: "text", text: "body" }] },
          ],
        },
      },
    });
    const snap = getHandle().getSnapshot();
    expect(snap.blocks["blk_anchor"]).toBeDefined();
    expect(snap.blocks["blk_anchor"]!.textPreview).toContain("Q1 goals");
  });

  it("emits a tree-shaped snapshot with heading containment", async () => {
    const { getHandle } = await mountEditor();
    const snap = getHandle().getSnapshot();
    expect(snap.rootBlockId).toBe("blk_root");
    expect(snap.blockOrder[0]).toBe("blk_root");

    const byPreview = (p: string) =>
      Object.values(snap.blocks).find(
        (b) => b.id !== snap.rootBlockId && b.textPreview.startsWith(p),
      );
    const method = byPreview("Method")!;
    const data = byPreview("The dataset")!;
    const dataHeading = byPreview("Data")!;
    const task = byPreview("pull cohort")!;

    // "Data" heading is under "Method" heading; its body under "Data"; task under "Data".
    expect(snap.blocks[dataHeading.parentId!]!.textPreview).toBe("Method");
    expect(data.parentId).toBe(dataHeading.id);
    expect(task.parentId).toBe(dataHeading.id);
    expect(method.type).toBe("heading");
    expect(task.type).toBe("taskItem");
  });

  it("round-trips markdown through the editor", async () => {
    const { getHandle } = await mountEditor();
    const md = getHandle().getMarkdown();
    expect(md).toContain("# Method");
    expect(md).toContain("## Data");
    expect(md).toContain("pull cohort");
  });

  it("emits a branch request with the source block id and surface snapshot", async () => {
    const onBranchRequest = vi.fn<(e: HamBranchRequestEvent) => void>();
    const { container } = await mountEditor({ onBranchRequest });

    // Branch buttons render after the gutter context effect runs.
    let button: HTMLElement | null = null;
    await waitFor(() => {
      button = container.querySelector<HTMLElement>(".ham-branch-button");
      expect(button).not.toBeNull();
    });
    const blockId = button!.getAttribute("data-ham-branch-for");
    fireEvent.click(button!);

    expect(onBranchRequest).toHaveBeenCalledOnce();
    const event = onBranchRequest.mock.calls[0]![0];
    expect(event.surfaceId).toBe("s1");
    expect(event.blockId).toBe(blockId);
    expect(event.blockSnapshot.id).toBe(blockId);
    expect(event.surfaceSnapshot.blocks[event.blockId]).toBeDefined();
    expect(typeof event.save).toBe("function");
  });

  it("repairs duplicate block ids introduced by paste/import", async () => {
    const { getHandle, container } = await mountEditor();
    const editor = getHandle().getUnsafeTiptapEditor() as any;

    // Force a collision: stamp the same id onto the first two blocks in one
    // transaction. The dedup appendTransaction then runs (as it would after a
    // paste) and must repair the duplicate.
    editor
      .chain()
      .command(({ tr, state }: any) => {
        const ps: number[] = [];
        state.doc.descendants((n: any, p: number) => {
          if (n.attrs?.dataBlockId) ps.push(p);
        });
        if (ps.length >= 2) {
          tr.setNodeAttribute(ps[0], "dataBlockId", "blk_collide");
          tr.setNodeAttribute(ps[1], "dataBlockId", "blk_collide");
        }
        return true;
      })
      .run();

    await waitFor(() => {
      const ids = [...container.querySelectorAll("[data-block-id]")].map((el) =>
        el.getAttribute("data-block-id"),
      );
      expect(ids.length).toBeGreaterThan(1);
      expect(new Set(ids).size).toBe(ids.length); // all unique again
    });
  });

  it("invokes the current onBranchRequest after a re-render (no stale handler)", async () => {
    const fn1 = vi.fn<(e: HamBranchRequestEvent) => void>();
    const fn2 = vi.fn<(e: HamBranchRequestEvent) => void>();
    let handle: HamEditorHandle | null = null;
    const view = (cb: (e: HamBranchRequestEvent) => void) => (
      <HamEditor
        surfaceId="s1"
        rootBlockId="blk_root"
        title="Method"
        value={{ kind: "markdown", markdown: MD }}
        onBranchRequest={cb}
        onReady={(h) => {
          handle = h;
        }}
      />
    );
    const { container, rerender } = render(view(fn1));
    await waitFor(() => expect(handle).not.toBeNull());

    let button: HTMLElement | null = null;
    await waitFor(() => {
      button = container.querySelector<HTMLElement>(".ham-branch-button");
      expect(button).not.toBeNull();
    });

    // Swap the handler; the gutter widget DOM is reused (same key), so the click
    // must resolve fn2 from the live context — not the captured fn1.
    rerender(view(fn2));
    fireEvent.click(button!);

    expect(fn1).not.toHaveBeenCalled();
    expect(fn2).toHaveBeenCalledOnce();
  });

  it("save() yields markdown, tiptap json, and a snapshot", async () => {
    const { getHandle } = await mountEditor();
    const payload = await getHandle().save();
    expect(payload.surfaceId).toBe("s1");
    expect(payload.content.markdown).toContain("# Method");
    expect(payload.content.tiptapJson).toBeTruthy();
    expect(payload.snapshot.rootBlockId).toBe("blk_root");
  });
});
