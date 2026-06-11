import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { HiermarkCanvas } from "../src/HiermarkCanvas";
import type { HiermarkBranchEdge, HiermarkSurface } from "../src/types";

afterEach(() => cleanup());
beforeAll(() => {
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
});

const surface = (id: string, markdown: string, title?: string): HiermarkSurface => ({
  id,
  rootBlockId: `${id}_root`,
  ...(title ? { title } : {}),
  content: { kind: "markdown", markdown },
});

const TWO = {
  surfaces: {
    s_root: surface("s_root", "# Root\n\nRoot body.", "Root"),
    s_child: surface("s_child", "# Child\n\nChild body.", "Child"),
  },
  edges: [
    { id: "e1", fromSurfaceId: "s_root", fromBlockId: "blk_x", toSurfaceId: "s_child", order: 0 },
  ] as HiermarkBranchEdge[],
};

describe("keyboard focus management", () => {
  it("Alt+ArrowRight moves DOM focus to the activated treeitem (roving tabindex)", async () => {
    const { container } = render(
      <HiermarkCanvas
        rootSurfaceId="s_root"
        surfaces={TWO.surfaces}
        branchEdges={TWO.edges}
        handlers={{ createSurfaceFromBlock: vi.fn() }}
      />,
    );
    await waitFor(() => expect(container.querySelector(".tiptap")).not.toBeNull());

    const root = container.querySelector<HTMLElement>(".hiermark-canvas")!;
    root.focus();
    fireEvent.keyDown(root, { key: "ArrowRight", altKey: true });

    await waitFor(() => {
      const focused = document.activeElement as HTMLElement;
      expect(focused.getAttribute("data-surface-id")).toBe("s_child");
      expect(focused.getAttribute("role")).toBe("treeitem");
    });
    // Roving tabindex: the newly active treeitem is the tabbable one.
    await waitFor(() => {
      const child = container.querySelector('[data-surface-id="s_child"]');
      expect(child?.getAttribute("tabindex")).toBe("0");
    });
  });

  it("clicking Open hands focus into the activated surface's editor once it mounts", async () => {
    const { container } = render(
      <HiermarkCanvas
        rootSurfaceId="s_root"
        surfaces={TWO.surfaces}
        branchEdges={TWO.edges}
        handlers={{ createSurfaceFromBlock: vi.fn() }}
      />,
    );
    await waitFor(() => expect(container.querySelector(".tiptap")).not.toBeNull());

    const open = [...container.querySelectorAll<HTMLElement>(".hiermark-surface-open")].find((b) =>
      b.closest('[data-surface-id="s_child"]'),
    )!;
    fireEvent.click(open);

    // The child's editor mounts and receives focus (parked until onReady).
    await waitFor(() => {
      const childEditor = container.querySelector('[data-surface-id="s_child"] .tiptap');
      expect(childEditor).not.toBeNull();
      expect(document.activeElement).toBe(childEditor);
    });
  });

  it("branch-child chips render sorted by edge order regardless of input order", async () => {
    const surfaces = {
      // tiptap-json so the anchor block carries a STABLE id matching the edges.
      s_root: {
        id: "s_root",
        rootBlockId: "blk_root",
        title: "Root",
        content: {
          kind: "tiptap-json" as const,
          json: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                attrs: { dataBlockId: "blk_y" },
                content: [{ type: "text", text: "Anchor." }],
              },
            ],
          },
        },
      },
      s_a: surface("s_a", "# A", "Alpha"),
      s_b: surface("s_b", "# B", "Beta"),
    };
    // Shuffled input: order 1 listed before order 0.
    const edges: HiermarkBranchEdge[] = [
      { id: "e_b", fromSurfaceId: "s_root", fromBlockId: "blk_y", toSurfaceId: "s_b", order: 1 },
      { id: "e_a", fromSurfaceId: "s_root", fromBlockId: "blk_y", toSurfaceId: "s_a", order: 0 },
    ];
    const { container } = render(
      <HiermarkCanvas
        rootSurfaceId="s_root"
        surfaces={surfaces}
        branchEdges={edges}
        handlers={{ createSurfaceFromBlock: vi.fn() }}
      />,
    );
    await waitFor(() => expect(container.querySelector(".tiptap")).not.toBeNull());
    await waitFor(() => {
      const chips = [...container.querySelectorAll("[data-hiermark-branch-child]")];
      expect(chips.length).toBeGreaterThanOrEqual(2);
      const ids = chips.map((c) => c.getAttribute("data-hiermark-branch-child"));
      expect(ids.indexOf("s_a")).toBeLessThan(ids.indexOf("s_b"));
    });
  });
});
