export function Overview() {
  return (
    <section className="page">
      <h2>What is HAM?</h2>
      <p className="lede">
        HAM (<strong>Hierarchical, Annotatable Markdown</strong>) is two React + TypeScript packages
        for building a <strong>2D canvas of linked, editable markdown surfaces</strong>. Any block
        inside a surface — a paragraph, heading, or checklist item — can be <em>branched</em> into a
        child surface that elaborates it. Child surfaces lay out in the next column to the right,
        forming a navigable breadth × depth canvas.
      </p>

      <div className="cards">
        <div className="card">
          <h3>
            <code>@ham/editor</code>
          </h3>
          <p>
            One collaborative, block-centric markdown surface, built on Tiptap 3 / ProseMirror.
            Stable block ids, tree-shaped snapshots, a pluggable annotation layer, fold, and
            Yjs/Hocuspocus collaboration.
          </p>
        </div>
        <div className="card">
          <h3>
            <code>@ham/canvas</code>
          </h3>
          <p>
            A 2D canvas of surfaces connected by block-anchored branch edges. Column projection,
            active-path highlighting, sibling reorder, keyboard navigation, and compact display
            modes — all driven by host-supplied handlers.
          </p>
        </div>
      </div>

      <h3>The key architectural split</h3>
      <pre className="block">
        <code>{`@ham/editor owns the intra-surface block tree.
@ham/canvas owns the inter-surface 2D topology.`}</code>
      </pre>
      <p>
        A <strong>surface</strong> is the canvas unit: an editable block tree rooted at a stable
        block. A <strong>branch edge</strong> connects a source block in one surface to a target
        surface, usually one column to the right. The editor owns blocks; the canvas owns edges; the{" "}
        <strong>host app owns persistence</strong> — the packages call handlers, and the host stores
        or rejects the operation.
      </p>

      <h3>Why two views of one tree?</h3>
      <p>
        Because a child isn't merely a child of a document — it is a target surface reached through
        a specific source block. Two different blocks in one surface can branch to two different
        surfaces in the next column; the same block can spawn ordered siblings. A flat{" "}
        <code>branchEdges</code> list keyed by <code>(fromSurface, fromBlock)</code> is what makes
        that representable.
      </p>
    </section>
  );
}
