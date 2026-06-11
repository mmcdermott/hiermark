---
"@hiermark/editor": patch
---

Editor correctness batch: the bubble toolbar's text-selection check no longer
relies on `constructor.name` (minifiers rename classes, which silently
disabled the toolbar in every production bundle — now `isTextSelection`);
math/link/image popovers close on any document change so a concurrent edit
(remote collab, upload resolving, host `setContent`) can't make them commit at
stale positions; the snapshot cache is evicted when
surfaceId/rootBlockId/title change; a `revision` swap while source mode is
open resyncs the textarea (previously the stale text silently overwrote the
new revision on save); and an already-synced collaboration provider no longer
schedules the initial-sync timeout (which delivered a spurious "timedout"
status after "synced").
