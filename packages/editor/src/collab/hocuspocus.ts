import { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";

import type {
  HamCollaborationFlushResult,
  HamCollaborationHocuspocusConfig,
  HamCollaborationProvider,
  HamCollaborationRuntime,
} from "../types";

/**
 * Build a Hocuspocus-backed collaboration runtime from a {@link HamCollaborationConfig}.
 * The editor owns the Y.Doc; `connect()` opens the transport against it. The
 * server side must persist/load **raw `Uint8Array`** Yjs state, never a `Y.Doc`
 * (under a duplicated-yjs runtime a returned `Y.Doc` fails Hocuspocus's
 * `instanceof Doc` check and silently loads empty).
 */
export function createHocuspocusCollab(
  config: HamCollaborationHocuspocusConfig,
  existingYdoc?: Y.Doc,
): HamCollaborationRuntime {
  const ydoc = existingYdoc ?? (config.ydoc as Y.Doc | undefined) ?? new Y.Doc();
  return {
    ydoc,
    async connect(): Promise<HamCollaborationProvider> {
      const provider = new HocuspocusProvider({
        url: config.url,
        name: config.documentName,
        document: ydoc,
        ...(config.token ? { token: config.token } : {}),
      });
      return provider as unknown as HamCollaborationProvider;
    },
  };
}

/**
 * Tear down a provider, flushing unsynced changes first. Destroys immediately if
 * nothing is pending; otherwise waits for the unsynced count to drain to 0, with
 * a hard 3s cap so a wedged transport can't leak the provider. Resolves with the
 * outcome: `{ flushed: true }` when everything drained, or `{ flushed: false,
 * pendingChanges }` on timeout — so a host can warn about potentially lost edits.
 */
export function flushAndDestroy(
  provider: HamCollaborationProvider,
): Promise<HamCollaborationFlushResult> {
  return new Promise((resolve) => {
    if (!provider.hasUnsyncedChanges) {
      provider.destroy();
      resolve({ flushed: true });
      return;
    }
    let done = false;
    let lastPending: number | undefined;
    const onChanges = ({ number }: { number: number }) => {
      lastPending = number;
      if (number === 0) finalize(true);
    };
    const finalize = (flushed: boolean) => {
      if (done) return;
      done = true;
      provider.off("unsyncedChanges", onChanges);
      clearTimeout(timer);
      provider.destroy();
      resolve(flushed ? { flushed: true } : { flushed: false, pendingChanges: lastPending });
    };
    const timer = setTimeout(() => finalize(false), 3000);
    provider.on("unsyncedChanges", onChanges);
  });
}
