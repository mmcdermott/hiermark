import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { HamCanvas } from "../src/HamCanvas";
import type { HamCanvasHandlers, HamSurface } from "../src/types";

afterEach(() => cleanup());
beforeAll(() => {
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
});

const surface = (id: string, markdown: string, title?: string): HamSurface => ({
  id,
  rootBlockId: `${id}_root`,
  ...(title ? { title } : {}),
  content: { kind: "markdown", markdown },
});

describe("canvas failure modes", () => {
  it("reports a rejected createSurfaceFromBlock via onOperationError and clears pending", async () => {
    const error = new Error("server 500");
    const handlers: HamCanvasHandlers = {
      createSurfaceFromBlock: vi.fn(async () => {
        throw error;
      }),
    };
    const onOperationError = vi.fn();
    const { container } = render(
      <HamCanvas
        rootSurfaceId="s_root"
        surfaces={{ s_root: surface("s_root", "# Root\n\nBranch me.", "Root") }}
        branchEdges={[]}
        activeSurfaceId="s_root"
        handlers={handlers}
        onOperationError={onOperationError}
      />,
    );
    const btn = await waitFor(() => {
      const el = container.querySelector<HTMLElement>(".ham-branch-button");
      expect(el).not.toBeNull();
      return el!;
    });
    fireEvent.click(btn);

    await waitFor(() => expect(onOperationError).toHaveBeenCalled());
    const call = onOperationError.mock.calls[0]![0];
    expect(call.type).toBe("create-branch");
    expect(call.surfaceId).toBe("s_root");
    expect(call.error).toBe(error);
    // No surface should remain stuck in the pending (opacity-dimmed) state.
    await waitFor(() => {
      expect(container.querySelector(".ham-surface-pending")).toBeNull();
    });
  });
});
