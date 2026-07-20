import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";
import { HiermarkCanvas } from "../src/HiermarkCanvas";
import type { HiermarkCanvasHandle, HiermarkSurface } from "../src/types";

afterEach(() => cleanup());
beforeAll(() => {
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
});

const surfaces: Record<string, HiermarkSurface> = {
  s_root: {
    id: "s_root",
    rootBlockId: "s_root_root",
    title: "Root",
    content: { kind: "markdown", markdown: "# Root\n\n- [ ] do the thing\n" },
  },
};

describe("canvas → surface editor handle (getSurfaceEditor)", () => {
  it("exposes the live editor handle for a mounted surface and null otherwise", async () => {
    let canvasHandle: HiermarkCanvasHandle | null = null;
    const { container } = render(
      <HiermarkCanvas
        rootSurfaceId="s_root"
        surfaces={surfaces}
        branchEdges={[]}
        handlers={{ saveSurface: vi.fn() }}
        onReady={(h) => {
          canvasHandle = h;
        }}
      />,
    );
    await waitFor(() => expect(container.querySelector(".tiptap")).not.toBeNull());
    await waitFor(() => expect(canvasHandle).not.toBeNull());

    // The root surface is on the active path, so its editor is mounted.
    const editor = await waitFor(() => {
      const e = canvasHandle!.getSurfaceEditor("s_root");
      expect(e).not.toBeNull();
      return e!;
    });
    expect(canvasHandle!.getSurfaceEditor("s_missing")).toBeNull();

    // Host-driven write: a panel outside the canvas toggles the task via the
    // surfaced handle — the exact case A/B alone couldn't reach under the canvas.
    const snap = editor.getSnapshot();
    const taskId = snap.blockOrder.find((id) => snap.blocks[id]!.type === "taskItem")!;
    expect(editor.updateBlock(taskId, { setAttrs: { checked: true } })).toBe(true);
    await waitFor(() => expect(editor.getMarkdown()).toContain("- [x]"));
  });
});
