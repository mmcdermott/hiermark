import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";
import { App } from "../src/App";
import { EditorDemo } from "../src/demos/EditorDemo";
import { CanvasDemo } from "../src/demos/CanvasDemo";
import { PaperDemo } from "../src/demos/PaperDemo";
import { CollabDemo } from "../src/demos/CollabDemo";

afterEach(() => cleanup());
beforeAll(() => {
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
});

describe("docs site", () => {
  it("renders the shell with navigation", () => {
    const { container, getAllByText } = render(<App />);
    expect(container.querySelector(".sidebar")).not.toBeNull();
    expect(getAllByText("What is Hiermark?").length).toBeGreaterThan(0);
    expect(container.querySelector(".content")).not.toBeNull();
  });

  it("mounts the editor demo", async () => {
    const { container } = render(<EditorDemo />);
    await waitFor(() => expect(container.querySelector(".hiermark-editor")).not.toBeNull());
    // annotation decorations render against the seeded content
    await waitFor(() =>
      expect(container.querySelector('[data-annotation-type="citation"]')).not.toBeNull(),
    );
  });

  it("mounts the canvas demo with an editable root surface", async () => {
    const { container } = render(<CanvasDemo />);
    await waitFor(() => expect(container.querySelector(".hiermark-canvas")).not.toBeNull());
    await waitFor(() => expect(container.querySelector(".hiermark-editor")).not.toBeNull());
  });

  it("mounts the paper-decomposition demo", async () => {
    const { container } = render(<PaperDemo />);
    await waitFor(() => expect(container.querySelector(".hiermark-canvas")).not.toBeNull());
  });

  it("mounts two converging collaborative editors", async () => {
    const { container } = render(<CollabDemo />);
    await waitFor(() => {
      const editors = container.querySelectorAll(".hiermark-editor");
      expect(editors.length).toBe(2);
    });
    // Both bind to the same Y.Doc, so the second pane shows the seeded content.
    await waitFor(() => {
      const panes = container.querySelectorAll(".demo-collab-pane .hiermark-editor");
      expect(panes[1]?.textContent).toContain("Shared notes");
    });
  });
});
