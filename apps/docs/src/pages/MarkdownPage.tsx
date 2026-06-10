import { useMemo, useRef, useState } from "react";
import {
  HamEditor,
  createExampleAnnotationRegistry,
  type HamEditorHandle,
  type HamEditorMode,
  type HamEditorProps,
} from "@ham/editor";

import { LiveExample } from "../demos/LiveExample";
import { annotationContext } from "../lib/examples";

const SOURCE = `import { HamEditor, createExampleAnnotationRegistry } from "@ham/editor";
import "@ham/editor/styles.css";

// A surface is one markdown document — StarterKit marks, task lists, GFM
// tables, fenced code (highlighted), and inline/display KaTeX math all parse
// from markdown and round-trip back to it.
<HamEditor
  surfaceId="md-doc"
  rootBlockId="blk_md"
  value={{ kind: "markdown", markdown: SAMPLE }}
  annotations={createExampleAnnotationRegistry()}
  annotationContext={annotationContext}
/>;`;

type Registry = HamEditorProps["annotations"];

const SAMPLE = `# Markdown in HAM

A surface is **one markdown document**. Everything below is live — edit it.

## Inline marks

**bold**, *italic*, ~~strikethrough~~, \`inline code\`, and a [link](https://github.com/mmcdermott/ham).
Inline math renders with KaTeX: $E = mc^2$.

## Lists

- a bullet
- another, with a [nested]
  - sub-bullet
1. first
2. second

- [ ] an open task
- [x] a done task

## Block elements

> A blockquote — useful for callouts and quotes.

\`\`\`ts
// A fenced code block (language label is preserved).
function decompose(block: string) {
  return block.split(". ");
}
\`\`\`

Display math sits on its own line:

$$\\int_0^1 x^2 \\, dx = \\tfrac{1}{3}$$

| Feature | Syntax | Block? |
| --- | --- | --- |
| Heading | \`# … ###### \` | yes |
| Task | \`- [ ]\` / \`- [x]\` | yes |
| Table | \`\\| a \\| b \\|\` | yes |

---

The horizontal rule above separates sections.`;

const SYNTAX: { feature: string; syntax: string; renders: string }[] = [
  {
    feature: "Headings (1–6)",
    syntax: "# … ######",
    renders: "<h1>…<h6>; a heading is a HAM block and a decomposition anchor",
  },
  {
    feature: "Bold / italic / strike",
    syntax: "**b**  *i*  ~~s~~",
    renders: "<strong> / <em> / <s>",
  },
  { feature: "Inline code", syntax: "`code`", renders: "<code>" },
  {
    feature: "Link",
    syntax: "[text](url)",
    renders: "<a> (URLs are also recognized as annotations)",
  },
  {
    feature: "Inline / display math",
    syntax: "$a^2$  /  $$…$$",
    renders: "KaTeX (the Mathematics extension)",
  },
  {
    feature: "Bullet / ordered list",
    syntax: "- item   /   1. item",
    renders: "<ul>/<ol>; each item is a block (nesting preserved)",
  },
  {
    feature: "Task list",
    syntax: "- [ ]  /  - [x]",
    renders: "checkbox inline with its text; type [ ] to create one",
  },
  { feature: "Blockquote", syntax: "> quote", renders: "<blockquote>" },
  {
    feature: "Code block",
    syntax: "``` lang …  ```",
    renders: "<pre><code> — syntax-highlighted, with a language picker + copy button",
  },
  {
    feature: "Table",
    syntax: "| a | b | …",
    renders: "<table> (GFM; resizable; editable as a table or as markdown)",
  },
  {
    feature: "Image",
    syntax: "![alt](src)",
    renders: "<img> — paste/drop/upload via your onImageUpload handler",
  },
  { feature: "Horizontal rule", syntax: "---", renders: "<hr>" },
];

/**
 * Markdown reference: what the editor supports and how it renders. The example
 * is a live editor, so what you see IS what the package produces.
 */
export function MarkdownPage() {
  const registry = useMemo(() => createExampleAnnotationRegistry() as Registry, []);
  const [key, setKey] = useState(0);
  const handle = useRef<HamEditorHandle | null>(null);
  const [mode, setMode] = useState<HamEditorMode>("rich");
  return (
    <section className="page">
      <h2>Markdown &amp; rendering</h2>
      <p className="lede">
        Each <code>@ham/editor</code> surface is a single markdown document (Tiptap StarterKit +
        task lists, tables, and KaTeX math). Markdown is the import/export format; the structured
        block tree is derived by parsing and re-serialized on structured edits, and the two
        round-trip. The example below is a <strong>live editor</strong> — what you see is exactly
        what the package renders.
      </p>
      <p>
        <strong>Edit as markdown</strong> is a general capability of every surface (
        <code>handle.setMode(&quot;source&quot;)</code>) — toggle it below to edit the raw markdown
        and re-parse. It&apos;s the way to hand-edit content that has no inline affordance, such as
        a table&apos;s structure.
      </p>

      <LiveExample
        title="Live editor — edit me"
        source={SOURCE}
        controls={
          <>
            <button
              type="button"
              className="demo-btn"
              onClick={() => handle.current?.setMode(mode === "rich" ? "source" : "rich")}
            >
              {mode === "rich" ? "Edit as markdown" : "Back to rich"}
            </button>
            <button
              type="button"
              className="demo-btn"
              onClick={() => {
                setMode("rich");
                setKey((k) => k + 1);
              }}
            >
              Reset
            </button>
          </>
        }
      >
        <HamEditor
          key={key}
          surfaceId="md-doc"
          rootBlockId="blk_md"
          value={{ kind: "markdown", markdown: SAMPLE }}
          annotations={registry}
          annotationContext={annotationContext}
          branchPolicy="off"
          onReady={(h) => {
            handle.current = h;
          }}
          onModeChange={setMode}
        />
      </LiveExample>

      <h3>Supported syntax</h3>
      <table className="api-table">
        <thead>
          <tr>
            <th>Feature</th>
            <th>Syntax</th>
            <th>Renders as</th>
          </tr>
        </thead>
        <tbody>
          {SYNTAX.map((s) => (
            <tr key={s.feature}>
              <td>{s.feature}</td>
              <td>
                <code>{s.syntax}</code>
              </td>
              <td>{s.renders}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Round-trip fidelity</h3>
      <p>
        Everything in the table above survives a full <code>markdown → editor → getMarkdown</code>{" "}
        round-trip (a regression matrix guards this), so <strong>source mode</strong> and{" "}
        <strong>collaboration seeding</strong> never mangle your document. Tables come back with
        cells padded to the column width — still valid GFM. The constructs deliberately <em>not</em>{" "}
        modeled (no schema node, so they flatten to text): footnotes <code>[^1]</code>, definition
        lists, and raw inline HTML. Add them via custom extensions if your corpus needs them.
      </p>

      <h3>Block model</h3>
      <p>
        Structural blocks — headings, paragraphs, list/task items, blockquotes, code blocks, and
        tables — each get a <strong>stable id</strong> and become addressable: any block can be
        folded, annotated, or branched into its own surface. Paragraphs nested inside a list item or
        blockquote are that block&apos;s text rather than separate blocks, and top-level blocks are
        organized into a tree by heading containment (an <code>h2</code> owns the blocks under it
        until the next <code>h2</code>). That projection is what the canvas and the annotation layer
        read.
      </p>
    </section>
  );
}
