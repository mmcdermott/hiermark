import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";
import * as Y from "yjs";
import { HamEditor } from "../src/HamEditor";
import { flushAndDestroy } from "../src/collab/hocuspocus";
import type {
  HamCollaborationProvider,
  HamCollaborationRuntime,
  HamCollaborationStatus,
  HamEditorHandle,
} from "../src/types";

afterEach(() => cleanup());
beforeAll(() => {
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
});

describe("collaboration robustness", () => {
  it("retries a failed connect with backoff, then connects + syncs", async () => {
    const ydoc = new Y.Doc();
    let attempts = 0;
    const provider: HamCollaborationProvider = {
      synced: true,
      hasUnsyncedChanges: false,
      on() {},
      off() {},
      destroy() {},
    };
    const runtime: HamCollaborationRuntime = {
      ydoc,
      connect: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("transient network");
        return provider;
      },
    };
    const statuses: HamCollaborationStatus[] = [];
    const retries: number[] = [];
    let handle: HamEditorHandle | null = null;
    render(
      <HamEditor
        surfaceId="c"
        rootBlockId="blk_c"
        value={{ kind: "markdown", markdown: "" }}
        collaboration={{
          enabled: true,
          documentName: "d",
          ydoc,
          runtime,
          onStatusChange: (s) => statuses.push(s),
          onRetry: (n) => retries.push(n),
        }}
        onReady={(h) => {
          handle = h;
        }}
      />,
    );
    // First attempt fails; the 1s backoff retry succeeds and the editor mounts.
    await waitFor(() => expect(handle).not.toBeNull(), { timeout: 3000 });
    expect(attempts).toBe(2);
    expect(retries).toEqual([1]);
    expect(statuses).toContain("connecting");
    expect(statuses).toContain("synced");
  });

  it("reports unsynced-change count and a flush result on unmount", async () => {
    const ydoc = new Y.Doc();
    let unsyncedHandler: ((e: { number: number }) => void) | null = null;
    let pending = true;
    const provider: HamCollaborationProvider = {
      synced: true,
      get hasUnsyncedChanges() {
        return pending;
      },
      on(event, handler) {
        if (event === "unsyncedChanges") unsyncedHandler = handler as typeof unsyncedHandler;
      },
      off() {},
      destroy() {},
    };
    const runtime: HamCollaborationRuntime = { ydoc, connect: async () => provider };
    const unsynced: number[] = [];
    let flushResult: unknown = null;
    let handle: HamEditorHandle | null = null;
    const { unmount } = render(
      <HamEditor
        surfaceId="c"
        rootBlockId="blk_c"
        value={{ kind: "markdown", markdown: "" }}
        collaboration={{
          enabled: true,
          documentName: "d",
          ydoc,
          runtime,
          onUnsyncedChangesChange: (n) => unsynced.push(n),
          onBeforeUnmount: (r) => {
            flushResult = r;
          },
        }}
        onReady={(h) => {
          handle = h;
        }}
      />,
    );
    await waitFor(() => expect(handle).not.toBeNull());
    unsyncedHandler!({ number: 3 });
    expect(unsynced).toContain(3);

    pending = false; // changes drained
    unmount();
    await waitFor(() => expect(flushResult).toEqual({ flushed: true }));
  });
});

describe("flushAndDestroy", () => {
  it("resolves flushed:true and destroys immediately when nothing is pending", async () => {
    let destroyed = false;
    const p: HamCollaborationProvider = {
      synced: true,
      hasUnsyncedChanges: false,
      on() {},
      off() {},
      destroy() {
        destroyed = true;
      },
    };
    expect(await flushAndDestroy(p)).toEqual({ flushed: true });
    expect(destroyed).toBe(true);
  });

  it("waits for pending changes to drain before destroying", async () => {
    let handler: ((e: { number: number }) => void) | null = null;
    let destroyed = false;
    const p: HamCollaborationProvider = {
      synced: true,
      hasUnsyncedChanges: true,
      on(event, h) {
        if (event === "unsyncedChanges") handler = h as typeof handler;
      },
      off() {},
      destroy() {
        destroyed = true;
      },
    };
    const promise = flushAndDestroy(p);
    handler!({ number: 2 }); // still pending → not yet destroyed
    expect(destroyed).toBe(false);
    handler!({ number: 0 }); // drained
    expect(await promise).toEqual({ flushed: true });
    expect(destroyed).toBe(true);
  });
});
