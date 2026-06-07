interface ApiEntry {
  name: string;
  kind: "component" | "function" | "type" | "hook";
  summary: string;
}

const EDITOR_API: ApiEntry[] = [
  {
    name: "HamEditor",
    kind: "component",
    summary: "One editable markdown surface; local or collaborative.",
  },
  {
    name: "createHamEditorExtensions",
    kind: "function",
    summary:
      "Build the standard Tiptap extension set (StarterKit, tasks, markdown, math, block-id, optional collab).",
  },
  {
    name: "getHamSurfaceSnapshot",
    kind: "function",
    summary: "Tree-shaped HamSurfaceSnapshot from a live editor (heading + list containment).",
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
    summary: "Bundled task / citation / mention / URL recognizers.",
  },
  {
    name: "HamEditorProps / HamEditorHandle / HamSurfaceSnapshot",
    kind: "type",
    summary: "The core editor types.",
  },
];

const CANVAS_API: ApiEntry[] = [
  {
    name: "HamCanvas",
    kind: "component",
    summary: "The 2D canvas of surfaces linked by branch edges.",
  },
  {
    name: "useHamCanvas",
    kind: "hook",
    summary: "Headless orchestrator: projection, active path, pessimistic topology ops.",
  },
  {
    name: "projectHamColumns",
    kind: "function",
    summary: "Pure BFS projecting surfaces + edges into depth-banded columns.",
  },
  {
    name: "getHamActivePath",
    kind: "function",
    summary: "Root → active branch-edge lineage (with cycle guard).",
  },
  {
    name: "reorderSiblingEdgesByIds / areSameAnchorSiblings",
    kind: "function",
    summary: "Same-anchor sibling reorder + its eligibility guard.",
  },
  {
    name: "HamCanvasProps / HamCanvasHandlers / HamSurface / HamBranchEdge",
    kind: "type",
    summary: "The core canvas types and the host handler contract.",
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
        The headline exports. Every function/component is fully typed; see the source and the{" "}
        <code>docs/design-spec.md</code> in the repository for the complete contract.
      </p>
      <ApiTable title="Editor —" pkg="@ham/editor" entries={EDITOR_API} />
      <ApiTable title="Canvas —" pkg="@ham/canvas" entries={CANVAS_API} />
    </section>
  );
}
