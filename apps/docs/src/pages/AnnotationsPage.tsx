import { useMemo, useState } from "react";
import { HamEditor, createExampleAnnotationRegistry, type HamEditorProps } from "@ham/editor";

import { annotationContext, annotatedMarkdown } from "../lib/examples";

type Registry = HamEditorProps["annotations"];

const PLACEMENTS: { name: string; what: string }[] = [
  {
    name: "inline",
    what: "Highlight a span of text in place (e.g. a citation pill, a colored URL).",
  },
  { name: "decoration", what: "Like inline, but a non-interactive visual marker." },
  {
    name: "popover",
    what: "Inline + clickable: clicking opens the type's render component in a popover.",
  },
  {
    name: "block-chip",
    what: "A chip rendered at the end of a block (e.g. a task badge carrying its record).",
  },
  { name: "gutter", what: "A block-level marker (reserved; renders like a chip today)." },
];

const CUSTOM = `// A custom recognizer: turn #tags into clickable chips.
import type { HamAnnotationType } from "@ham/editor";

interface TagCtx { tags?: Record<string, { count: number }> }

const tagAnnotation: HamAnnotationType<TagCtx> = {
  name: "tag",
  priority: 80,
  placement: "popover",                 // clickable → opens render()
  recognize({ block, text }) {
    const hits = [];
    for (const m of text.matchAll(/(?:^|\\s)#([a-z0-9_-]+)/gi)) {
      const from = m.index! + m[0].indexOf("#");
      hits.push({
        id: \`tag:\${block.id}:\${from}\`,
        type: "tag", blockId: block.id,
        from, to: from + m[1].length + 1,   // block-relative char offsets
        label: m[1],
        data: { tag: m[1] },
      });
    }
    return hits;
  },
  inlineClass: () => "my-tag",
  render: ({ hit, context }) => (
    <span>#{hit.label} · used {context.tags?.[hit.label!]?.count ?? 0}×</span>
  ),
  // Optional type-ahead: type "#" to search and insert a tag.
  suggest: {
    trigger: "#",
    search: (q, ctx) =>
      Object.keys(ctx.tags ?? {})
        .filter((t) => t.includes(q.toLowerCase()))
        .map((t) => ({ id: t, label: \`#\${t}\`, insert: \`#\${t} \` })),
  },
};

const registry = { types: [tagAnnotation] };
`;

/** Guide to the annotation recognition system. */
export function AnnotationsPage() {
  const registry = useMemo(() => createExampleAnnotationRegistry() as Registry, []);
  const [key, setKey] = useState(0);
  return (
    <section className="page">
      <h2>Annotations</h2>
      <p className="lede">
        Annotations are a layer <em>over</em> the markdown: a set of recognizers scan each
        block&apos;s text and emit typed <strong>hits</strong> that render as inline highlights,
        clickable pills, block chips, or a type-ahead — without ever changing the source markdown.
        The framework owns recognition, conflict resolution, and rendering; <em>you</em> own the
        recognizers and the domain data they read.
      </p>

      <h3>The model</h3>
      <p>
        A <code>HamAnnotationType</code> has a <code>recognize(block, text, context)</code> function
        — pure over the block&apos;s text and a host-supplied <code>context</code> the framework
        never interprets — returning hits with block-relative <code>from</code>/<code>to</code>{" "}
        offsets and arbitrary <code>data</code>. A registry is just{" "}
        <code>{`{ types: [...] }`}</code>. The bundled example registry recognizes{" "}
        <strong>tasks</strong>, <strong>@citations</strong> (resolved against a <code>.bib</code>),{" "}
        <strong>@mentions</strong> (people), and <strong>URLs</strong>. Edit the live document — the
        annotations recompute as you type, and{" "}
        <strong>
          typing <code>@</code> searches
        </strong>{" "}
        references &amp; people:
      </p>

      <div className="doc-live">
        <div className="doc-live-head">
          <span>Live editor — try @ and the inline pills</span>
          <button type="button" className="demo-btn" onClick={() => setKey((k) => k + 1)}>
            Reset
          </button>
        </div>
        <div className="doc-live-body">
          <HamEditor
            key={key}
            surfaceId="anno-doc"
            rootBlockId="blk_anno"
            branchPolicy="off"
            value={{ kind: "markdown", markdown: annotatedMarkdown }}
            annotations={registry}
            annotationContext={annotationContext}
          />
        </div>
      </div>

      <h3>Placements</h3>
      <table className="api-table">
        <thead>
          <tr>
            <th>placement</th>
            <th>what it does</th>
          </tr>
        </thead>
        <tbody>
          {PLACEMENTS.map((p) => (
            <tr key={p.name}>
              <td>
                <code>{p.name}</code>
              </td>
              <td>{p.what}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Conflict resolution</h3>
      <p>
        Recognizers run independently, so two types can claim the same span (a token that&apos;s
        both a known person and a citation key). Overlaps are resolved deterministically by{" "}
        <code>priority</code> — higher wins — so the example keeps the <em>mention</em> over the{" "}
        <em>citation</em> for a known person. A type marked <code>opaqueBlock</code> suppresses
        other block-level hits on the same block.
      </p>

      <h3>Type-ahead (search → insert → recognize)</h3>
      <p>
        A type can add a <code>suggest: {`{ trigger, search }`}</code>. Typing the trigger opens a
        searchable popover (↑/↓, Enter, Esc); choosing a candidate inserts its <code>insert</code>{" "}
        text, which the recognizers then pick up as an annotation. This is generic — the editor
        never interprets the domain; you supply the search over your own bib / people / tags.
      </p>

      <h3>A custom recognizer</h3>
      <p>
        Writing one is small — a recognize function, an optional render component, and (optionally)
        a suggest config:
      </p>
      <pre className="doc-code">
        <code>{CUSTOM}</code>
      </pre>
    </section>
  );
}
