function Code({ children }: { children: string }) {
  return (
    <pre className="block">
      <code>{children}</code>
    </pre>
  );
}

export function GettingStarted() {
  return (
    <section className="page">
      <h2>Getting started</h2>

      <h3>Install</h3>
      <Code>{`pnpm add @ham/editor @ham/canvas react react-dom`}</Code>
      <p>Import each package's stylesheet once (they ship CSS variables you can override):</p>
      <Code>{`import "@ham/editor/styles.css";
import "@ham/canvas/styles.css";`}</Code>

      <h3>A single editable surface</h3>
      <Code>{`import { HamEditor, createExampleAnnotationRegistry } from "@ham/editor";

export function MySurface() {
  return (
    <HamEditor
      surfaceId="s1"
      rootBlockId="blk_root"
      branchPolicy="off"
      value={{ kind: "markdown", markdown: "# Hello\\n\\nStart writing…" }}
      annotations={createExampleAnnotationRegistry()}
      annotationContext={{ references: { vaswani2017: { title: "Attention" } } }}
      onSnapshotChange={(snap) => console.log(snap.blockOrder)}
    />
  );
}`}</Code>

      <h3>A canvas of surfaces</h3>
      <p>
        The canvas is controlled: you own <code>surfaces</code> and <code>branchEdges</code>, and
        you implement handlers that create/reorder/delete them. The packages never persist for you.
      </p>
      <Code>{`import { HamCanvas } from "@ham/canvas";

function App() {
  const [surfaces, setSurfaces] = useState(initialSurfaces);
  const [edges, setEdges] = useState([]);

  return (
    <HamCanvas
      rootSurfaceId="s_root"
      surfaces={surfaces}
      branchEdges={edges}
      handlers={{
        async createSurfaceFromBlock(event) {
          const surface = makeSurface(event.suggestedTitle);
          const edge = makeEdge(event.sourceSurfaceId, event.sourceBlockId, surface.id);
          setSurfaces((s) => ({ ...s, [surface.id]: surface }));
          setEdges((e) => [...e, edge]);
          return { surface, edge, activate: true };
        },
        async saveSurface(payload) {
          setSurfaces((s) => ({ ...s, [payload.surfaceId]: {
            ...s[payload.surfaceId],
            content: { kind: "tiptap-json", json: payload.content.tiptapJson },
          }}));
        },
      }}
    />
  );
}`}</Code>

      <h3>Customizing the branch affordance</h3>
      <p>
        The branch button (a full-height <code>+</code> on each block's right) and the branch-child
        chips are replaceable via <code>HamEditorSlots</code> — pass any component you like.
      </p>
      <Code>{`<HamEditor
  surfaceId="s1"
  value={{ kind: "markdown", markdown }}
  slots={{
    BlockBranchButton: ({ blockId, onBranch }) => (
      <button className="my-branch" onClick={onBranch} aria-label="Branch">＋</button>
    ),
    BranchChildChip: ({ child, onOpen }) => (
      <button onClick={onOpen}>{child.title}</button>
    ),
  }}
/>`}</Code>

      <h3>Collaboration</h3>
      <p>
        Pass a <code>collaboration</code> config to <code>HamEditor</code>. The editor owns the
        Y.Doc and only mounts after the provider syncs, so it never duplicates initial content.
      </p>
      <Code>{`<HamEditor
  surfaceId="s1"
  value={{ kind: "markdown", markdown }}
  collaboration={{
    enabled: true,
    provider: "hocuspocus",
    documentName: "s1",
    url: "wss://collab.example.com",
    user: { name, color },
  }}
/>`}</Code>
    </section>
  );
}
