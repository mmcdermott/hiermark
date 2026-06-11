import { useEffect, useMemo, useState } from "react";
import * as Y from "yjs";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness";
import {
  HiermarkEditor,
  type HiermarkCollaborationConfig,
  type HiermarkCollaborationProvider,
  type HiermarkCollaborationRuntime,
} from "@hiermark/editor";

import { DemoFrame } from "./DemoFrame";

// Origin tag so a relayed update isn't relayed back (avoids an echo loop).
const RELAY = "relay";

/**
 * Two in-memory "peers": separate Y.Docs and awareness instances with their
 * updates relayed between them — simulating two clients over a network without a
 * server. Separate docs ⇒ distinct clientIDs, so each editor sees the OTHER's
 * cursor (which a single shared Y.Doc couldn't show).
 */
function useCollabPeers() {
  // Created in an effect (not useMemo) so React StrictMode's dev double-mount
  // can't destroy the memoized docs in the first cleanup pass and then hand
  // the second render already-destroyed Y.Docs.
  const [peers, setPeers] = useState<ReturnType<typeof createPeers> | null>(null);
  useEffect(() => {
    const next = createPeers();
    setPeers(next);
    return () => next.cleanup();
  }, []);
  return peers;
}

function createPeers() {
  const docA = new Y.Doc();
  const docB = new Y.Doc();
  const awA = new Awareness(docA);
  const awB = new Awareness(docB);

  const relayDoc = (from: Y.Doc, to: Y.Doc) =>
    from.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin !== RELAY) Y.applyUpdate(to, update, RELAY);
    });
  const relayAwareness = (from: Awareness, to: Awareness) =>
    from.on(
      "update",
      (
        { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
        origin: unknown,
      ) => {
        if (origin === RELAY) return;
        const changed = [...added, ...updated, ...removed];
        applyAwarenessUpdate(to, encodeAwarenessUpdate(from, changed), RELAY);
      },
    );
  relayDoc(docA, docB);
  relayDoc(docB, docA);
  relayAwareness(awA, awB);
  relayAwareness(awB, awA);

  const provider = (awareness: Awareness): HiermarkCollaborationProvider => ({
    synced: true,
    hasUnsyncedChanges: false,
    awareness,
    on() {},
    off() {},
    destroy() {},
  });
  const runtime = (ydoc: Y.Doc, awareness: Awareness): HiermarkCollaborationRuntime => ({
    ydoc,
    connect: async () => provider(awareness),
  });

  return {
    runtimeA: runtime(docA, awA),
    runtimeB: runtime(docB, awB),
    docA,
    docB,
    cleanup: () => {
      awA.destroy();
      awB.destroy();
      docA.destroy();
      docB.destroy();
    },
  };
}

export function CollabDemo() {
  const peers = useCollabPeers();
  const configA = useMemo<HiermarkCollaborationConfig | null>(
    () =>
      peers && {
        enabled: true,
        documentName: "demo",
        ydoc: peers.docA,
        runtime: peers.runtimeA,
        user: { name: "Alice", color: "#6f5cff" },
      },
    [peers],
  );
  const configB = useMemo<HiermarkCollaborationConfig | null>(
    () =>
      peers && {
        enabled: true,
        documentName: "demo",
        ydoc: peers.docB,
        runtime: peers.runtimeB,
        user: { name: "Bob", color: "#0a7d4f" },
      },
    [peers],
  );
  if (!configA || !configB) return null;

  return (
    <DemoFrame title="Collaboration — two editors, one shared document (no server)" height="auto">
      <div className="demo-collab">
        <div className="demo-collab-pane">
          <h4>Alice&apos;s editor</h4>
          <HiermarkEditor
            surfaceId="collab-a"
            rootBlockId="blk_a"
            value={{ kind: "markdown", markdown: "# Shared notes\n\nType in either editor…" }}
            collaboration={configA}
          />
        </div>
        <div className="demo-collab-pane">
          <h4>Bob&apos;s editor</h4>
          <HiermarkEditor
            surfaceId="collab-b"
            rootBlockId="blk_b"
            value={{ kind: "markdown", markdown: "" }}
            collaboration={configB}
          />
        </div>
      </div>
      <p className="demo-hint">
        Edits converge instantly, and each editor shows the <strong>other&apos;s cursor</strong> (a
        colored caret with their name) so two people don&apos;t edit the same spot — click into one
        and watch the labeled caret appear in the other. Remote cursors are on by default whenever
        the provider has awareness; in a real app you swap the in-memory relay for{" "}
        <code>createHocuspocusCollab</code> against a Hocuspocus server.
      </p>
    </DemoFrame>
  );
}
