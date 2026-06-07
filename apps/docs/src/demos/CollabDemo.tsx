import { useMemo } from "react";
import * as Y from "yjs";
import {
  HamEditor,
  type HamCollaborationConfig,
  type HamCollaborationProvider,
  type HamCollaborationRuntime,
} from "@ham/editor";

import { DemoFrame } from "./DemoFrame";

/** A no-server runtime: an always-synced provider over a shared in-memory Y.Doc. */
function localRuntime(ydoc: Y.Doc): HamCollaborationRuntime {
  const provider: HamCollaborationProvider = {
    synced: true,
    hasUnsyncedChanges: false,
    on() {},
    off() {},
    destroy() {},
  };
  return { ydoc, connect: async () => provider };
}

export function CollabDemo() {
  const ydoc = useMemo(() => new Y.Doc(), []);
  const runtime = useMemo(() => localRuntime(ydoc), [ydoc]);
  const configA = useMemo<HamCollaborationConfig>(
    () => ({
      enabled: true,
      provider: "hocuspocus",
      documentName: "demo",
      url: "",
      ydoc,
      runtime,
      user: { name: "Alice", color: "#6f5cff" },
    }),
    [ydoc, runtime],
  );
  const configB = useMemo<HamCollaborationConfig>(
    () => ({ ...configA, user: { name: "Bob", color: "#0a7d4f" } }),
    [configA],
  );

  return (
    <DemoFrame title="Collaboration — two editors, one shared document (no server)" height="auto">
      <div className="demo-collab">
        <div className="demo-collab-pane">
          <h4>Alice's editor</h4>
          <HamEditor
            surfaceId="collab-a"
            rootBlockId="blk_a"
            value={{ kind: "markdown", markdown: "# Shared notes\n\nType in either editor…" }}
            collaboration={configA}
          />
        </div>
        <div className="demo-collab-pane">
          <h4>Bob's editor</h4>
          <HamEditor
            surfaceId="collab-b"
            rootBlockId="blk_b"
            value={{ kind: "markdown", markdown: "" }}
            collaboration={configB}
          />
        </div>
      </div>
      <p className="demo-hint">
        Both editors bind to the same Yjs document, so edits converge instantly. In a real app you
        swap the in-memory runtime for <code>createHocuspocusCollab</code> against a Hocuspocus
        server.
      </p>
    </DemoFrame>
  );
}
