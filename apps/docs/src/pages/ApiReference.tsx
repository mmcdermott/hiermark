interface ApiEntry {
  name: string;
  kind: "component" | "function" | "type" | "hook";
  summary: string;
}

const EDITOR_API: ApiEntry[] = [
  {
    name: "HiermarkEditor",
    kind: "component",
    summary: "One editable markdown surface; local or collaborative.",
  },
  {
    name: "createHiermarkEditorExtensions",
    kind: "function",
    summary:
      "Build the standard Tiptap extension set (StarterKit, tasks, markdown, math, block-id, optional collab).",
  },
  {
    name: "getHiermarkSurfaceSnapshot",
    kind: "function",
    summary: "Tree-shaped HiermarkSurfaceSnapshot from a live editor (heading + list containment).",
  },
  {
    name: "createHocuspocusCollab",
    kind: "function",
    summary: "Build a { ydoc, connect() } collaboration runtime; flushAndDestroy tears it down.",
  },
  {
    name: "BlockId / BlockGutter / BlockFold / AnnotationLayer",
    kind: "type",
    summary:
      "The Tiptap extensions powering ids, the branch gutter, heading fold, and annotation decorations.",
  },
  {
    name: "recognizeAnnotations / resolveHits",
    kind: "function",
    summary: "Pure annotation recognition + deterministic conflict resolution.",
  },
  {
    name: "createExampleAnnotationRegistry",
    kind: "function",
    summary:
      "Bundled task / citation / mention / URL recognizers (citation & mention support @-search).",
  },
  {
    name: "AnnotationSuggest / collectSuggestions",
    kind: "function",
    summary:
      "Type-ahead: an annotation type's suggest {trigger, search} opens a searchable popover; choosing a candidate inserts its token, which the recognizers pick up.",
  },
  {
    name: "resolveBranchMode / isBranchable",
    kind: "function",
    summary:
      'Snapshot-driven branchability: "branch" | "add-sibling" | "none". The "smart" default branches leaves and real forks, suppressing redundant single-child intermediates.',
  },
  {
    name: "HiermarkEditorProps / HiermarkEditorHandle / HiermarkSurfaceSnapshot",
    kind: "type",
    summary: "The core editor types.",
  },
  {
    name: "HiermarkBranchPolicy / HiermarkBranchabilityRules / HiermarkBranchMode",
    kind: "type",
    summary:
      'Branch policy: "smart" (default), the legacy string policies, a declarative rules object, or a custom predicate.',
  },
];

const CANVAS_API: ApiEntry[] = [
  {
    name: "HiermarkCanvas",
    kind: "component",
    summary: "The 2D canvas of surfaces linked by branch edges.",
  },
  {
    name: "useHiermarkCanvas",
    kind: "hook",
    summary: "Headless orchestrator: projection, active path, pessimistic topology ops.",
  },
  {
    name: "projectHiermarkColumns",
    kind: "function",
    summary: "Pure BFS projecting surfaces + edges into depth-banded columns.",
  },
  {
    name: "getHiermarkActivePath",
    kind: "function",
    summary: "Root → active branch-edge lineage (with cycle guard).",
  },
  {
    name: "reorderSiblingEdgesByIds / areSameAnchorSiblings",
    kind: "function",
    summary: "Same-anchor sibling reorder + its eligibility guard.",
  },
  {
    name: "HiermarkConnectorsOverlay / visibleEdges / geometryFor",
    kind: "function",
    summary:
      "Cross-column connector overlay + its pure helpers (mode filter, active-path state, block→card bezier geometry).",
  },
  {
    name: "computeSiblingInsert",
    kind: "function",
    summary:
      "Resolve a positioned sibling insert into a dense group: the new edge's order + the displaced siblings' renumber.",
  },
  {
    name: "validateHiermarkTopology",
    kind: "function",
    summary:
      "Pure validator: reports missing/duplicate-incoming/cyclic/unreachable surfaces so a host can catch invalid topology the tolerant projection hides.",
  },
  {
    name: "HiermarkCanvasProps / HiermarkCanvasHandlers / HiermarkSurface / HiermarkBranchEdge",
    kind: "type",
    summary: "The core canvas types and the host handler contract.",
  },
  {
    name: "HiermarkCanvasLayoutConfig",
    kind: "type",
    summary:
      'Layout: appearance ("card" | "flat" | "plain"), showConnectors, column/surface sizing, inactiveColumnMode, columnScroll (per-column vertical scroll), and showGroupHeaders.',
  },
  {
    name: "HiermarkCanvasSlots",
    kind: "type",
    summary:
      "Replaceable chrome: SurfaceFrame / SurfaceHeader / SurfacePreview / ColumnHeader / EmptyColumn / GroupHeader / Connector / AddSiblingButton.",
  },
  {
    name: "HiermarkCanvasHandle (onReady)",
    kind: "type",
    summary:
      "Imperative canvas API: focusSurface / focusBlock / scrollSurfaceIntoView / revealChildren / getActivePath / getColumns.",
  },
];

function ApiTable({ title, pkg, entries }: { title: string; pkg: string; entries: ApiEntry[] }) {
  return (
    <div className="api-group">
      <h3>
        {title} <code>{pkg}</code>
      </h3>
      <table className="api-table">
        <tbody>
          {entries.map((e) => (
            <tr key={e.name}>
              <td>
                <code>{e.name}</code>
                <span className={`api-kind api-kind-${e.kind}`}>{e.kind}</span>
              </td>
              <td>{e.summary}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ApiReference() {
  return (
    <section className="page">
      <h2>API reference</h2>
      <p>
        The headline exports below are a curated overview. For the{" "}
        <strong>complete, always-accurate generated reference</strong> — every export, type, and
        signature — see the{" "}
        <a href={`${import.meta.env.BASE_URL}api/`} target="_blank" rel="noreferrer">
          TypeDoc API reference ↗
        </a>
        . The full contract also lives in <code>docs/design-spec.md</code> in the repository.
      </p>
      <ApiTable title="Editor —" pkg="@hiermark/editor" entries={EDITOR_API} />
      <ApiTable title="Canvas —" pkg="@hiermark/canvas" entries={CANVAS_API} />
    </section>
  );
}
