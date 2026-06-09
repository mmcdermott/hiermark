import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { render, waitFor, cleanup, fireEvent } from "@testing-library/react";
import * as Y from "yjs";
import { HamEditor } from "../src/HamEditor";
import type {
  HamCollaborationProvider,
  HamCollaborationRuntime,
  HamEditorHandle,
} from "../src/types";

afterEach(() => cleanup());
beforeAll(() => {
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
});

const TABLE_MD = "| A | B |\n| --- | --- |\n| 1 | 2 |\n";

async function mount(markdown: string, extra: Partial<Parameters<typeof HamEditor>[0]> = {}) {
  let handle: HamEditorHandle | null = null;
  const utils = render(
    <HamEditor
      surfaceId="s1"
      rootBlockId="blk_root"
      value={{ kind: "markdown", markdown }}
      onReady={(h) => {
        handle = h;
      }}
      {...extra}
    />,
  );
  await waitFor(() => expect(handle).not.toBeNull());
  return { ...utils, getHandle: () => handle! };
}

describe("source mode (edit as table or markdown)", () => {
  it("recognizes a markdown table as an editable table by default", async () => {
    const { container, getHandle } = await mount(TABLE_MD);
    await waitFor(() => expect(container.querySelector("table")).not.toBeNull());
    expect(getHandle().getMode()).toBe("rich");
    expect(container.querySelector(".ham-source-editor")).toBeNull();
  });

  it("toggles to a raw-markdown textarea exposing the table source", async () => {
    const { container, getHandle } = await mount(TABLE_MD);
    getHandle().setMode("source");
    const ta = await waitFor(() => {
      const el = container.querySelector<HTMLTextAreaElement>(".ham-source-editor");
      expect(el).not.toBeNull();
      return el!;
    });
    expect(getHandle().getMode()).toBe("source");
    expect(ta.value).toContain("| A");
    expect(ta.value).toContain("| --- |");
    // The rich editor's table is hidden while in source mode.
    expect(container.querySelector("[hidden] table")).not.toBeNull();
  });

  it("re-parses edited markdown back into a rich table", async () => {
    const { container, getHandle } = await mount(TABLE_MD);
    getHandle().setMode("source");
    const ta = await waitFor(() => {
      const el = container.querySelector<HTMLTextAreaElement>(".ham-source-editor");
      expect(el).not.toBeNull();
      return el!;
    });
    fireEvent.change(ta, {
      target: { value: "| A | B | C |\n| --- | --- | --- |\n| 1 | 2 | 3 |\n" },
    });
    getHandle().setMode("rich");
    await waitFor(() => {
      const headers = [...container.querySelectorAll("table th")].map((h) => h.textContent);
      expect(headers).toEqual(["A", "B", "C"]);
    });
    expect(getHandle().getMarkdown()).toContain("| C   |");
  });

  it("preserves block ids of unchanged AND edited-in-place blocks across a source edit", async () => {
    // root → "# Method" (heading), "We describe it." (para), "## Data" (heading),
    // "The dataset." (para). Edit ONLY the last paragraph in source mode; every
    // OTHER block must keep its id (so a branch/annotation anchored there survives)
    // and the edited paragraph keeps its id too (positional-by-type match).
    const { container, getHandle } = await mount(
      "# Method\n\nWe describe it.\n\n## Data\n\nThe dataset.\n",
    );
    const idOf = (preview: string) => {
      const snap = getHandle().getSnapshot();
      return Object.values(snap.blocks).find((x) => x.textPreview.startsWith(preview))?.id;
    };
    const methodId = idOf("Method");
    const dataHeadingId = idOf("Data");
    const describeId = idOf("We describe");
    const dataParaId = idOf("The dataset");
    expect([methodId, dataHeadingId, describeId, dataParaId].every(Boolean)).toBe(true);

    getHandle().setMode("source");
    const ta = await waitFor(() => {
      const el = container.querySelector<HTMLTextAreaElement>(".ham-source-editor");
      expect(el).not.toBeNull();
      return el!;
    });
    // Reword only the last paragraph.
    fireEvent.change(ta, {
      target: { value: "# Method\n\nWe describe it.\n\n## Data\n\nThe dataset is eICU.\n" },
    });
    getHandle().setMode("rich");

    await waitFor(() => expect(idOf("The dataset is eICU")).toBeTruthy());
    // Unchanged blocks keep their exact ids.
    expect(idOf("Method")).toBe(methodId);
    expect(idOf("We describe")).toBe(describeId);
    expect(idOf("Data")).toBe(dataHeadingId);
    // The edited-in-place paragraph keeps its id too (positional-by-type).
    expect(idOf("The dataset is eICU")).toBe(dataParaId);
  });

  it("fires onModeChange and preserves block ids on an unedited round-trip", async () => {
    const onModeChange = vi.fn();
    const { getHandle } = await mount("# Title\n\nA paragraph.\n", { onModeChange });
    const before = getHandle().getSnapshot().blockOrder;

    getHandle().setMode("source");
    getHandle().setMode("rich"); // no edits → must skip the re-parse
    await waitFor(() => expect(onModeChange).toHaveBeenCalledTimes(2));
    expect(onModeChange.mock.calls.map((c) => c[0])).toEqual(["source", "rich"]);
    // Same ids (no re-stamp) because the source text was untouched.
    expect(getHandle().getSnapshot().blockOrder).toEqual(before);
  });

  it("is unavailable under collaboration (setMode is a no-op)", async () => {
    const ydoc = new Y.Doc();
    const provider: HamCollaborationProvider = {
      synced: true,
      hasUnsyncedChanges: false,
      on() {},
      off() {},
      destroy() {},
    };
    const runtime: HamCollaborationRuntime = { ydoc, connect: async () => provider };
    let handle: HamEditorHandle | null = null;
    render(
      <HamEditor
        surfaceId="s1"
        rootBlockId="blk_root"
        value={{ kind: "markdown", markdown: "Hello collab.\n" }}
        collaboration={{
          enabled: true,
          provider: "hocuspocus",
          documentName: "doc",
          url: "",
          ydoc,
          runtime,
        }}
        onReady={(h) => {
          handle = h;
        }}
      />,
    );
    await waitFor(() => expect(handle).not.toBeNull());
    handle!.setMode("source");
    expect(handle!.getMode()).toBe("rich");
  });
});
