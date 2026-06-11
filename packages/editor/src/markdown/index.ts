// @hiermark/editor/markdown — the pure markdown helpers, with **zero** React/Tiptap deps.
//
// This subpath exists so a host app's server-side reconciler, collab worker, or
// git-sync CLI can share the *exact same* grammar + stable-id/hash implementation
// the client editor uses, without pulling the React editor (`react`, `react-dom`,
// `@tiptap/*`, `yjs`, `katex`, `lowlight`) into its module graph. Definition drift
// between client and server here is a data-loss bug, so single-sourcing these
// helpers is a correctness requirement — see GitHub issue #50.
//
// Everything below imports only siblings in this directory; keep it that way. The
// package root (`@hiermark/editor`) re-exports this module, so these symbols are also
// reachable from the root barrel — but a server should import from here to avoid
// the browser stack entirely.

export { fnv1a64Hex, normalizeForHash } from "./hash";
export {
  stripStableIds,
  readStableId,
  injectInlineId,
  blockIdLine,
  type StableIdKind,
} from "./stable-id";
export {
  headingDepthOf,
  inferBlockContainment,
  inferContainmentFromMarkdown,
  type ContainmentBlock,
} from "./containment";
export { parseChecklist, normalize, taskKey, injectTaskIds, type ChecklistItem } from "./checklist";
export { extractCitationKeys, findCitations, type CitationKey } from "./citations";
export {
  extractResourceLinks,
  findResources,
  detectResourceKind,
  type ResourceRef,
  type ResourceKind,
} from "./resources";
