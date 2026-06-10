---
"@ham/editor": minor
---

Add a pure `@ham/editor/markdown` subpath export for server-side consumers
(issue #50). The markdown grammar helpers — `stripStableIds`, `readStableId`,
`injectInlineId`, `inferContainmentFromMarkdown`, `parseChecklist`,
`extractCitationKeys`, `extractResourceLinks`, `fnv1a64Hex`, and friends — are
import-pure (no React, Tiptap, or DOM), so a host app's save-time reconciler,
collab worker, or git-sync CLI can now `import { parseChecklist } from
"@ham/editor/markdown"` without dragging the browser editor into its module
graph. The package root (`@ham/editor`) re-exports the same module, so the
client editor and the server share one grammar implementation — avoiding the
definition drift that would otherwise be a silent data-loss bug. No runtime or
API change to existing root-barrel imports.
