import { useRef, useState } from "react";
import {
  HiermarkEditor,
  type HiermarkEditorHandle,
  type HiermarkEditorMode,
  type HiermarkImageUploadHandler,
} from "@hiermark/editor";

import { LiveExample } from "../demos/LiveExample";

// ---------------------------------------------------------------------------
// Code blocks — syntax highlighting + copy button + language picker
// ---------------------------------------------------------------------------

const CODE_MD = `# Code blocks

A fenced block with a language is syntax-highlighted (highlight.js via lowlight).
Each block has a **language picker** and a **copy** button in its header.

\`\`\`python
def fib(n: int) -> int:
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a
\`\`\`

\`\`\`ts
// The language is preserved on markdown round-trip.
export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
\`\`\`
`;

const CODE_SRC = `import { HiermarkEditor } from "@hiermark/editor";
import "@hiermark/editor/styles.css";

// Fenced code blocks with a language are highlighted automatically;
// the header adds a language picker + a copy-to-clipboard button.
<HiermarkEditor
  surfaceId="code"
  value={{ kind: "markdown", markdown: "\`\`\`python\\ndef f(): ...\\n\`\`\`" }}
/>;`;

// ---------------------------------------------------------------------------
// Math — inline + display
// ---------------------------------------------------------------------------

const MATH_MD = `# Math

Inline math flows with the text: the energy–mass relation is $E = mc^2$, and the
softmax is $\\sigma(z)_i = e^{z_i} / \\sum_j e^{z_j}$.

Display math sits on its own line (write it between \`$$\`):

$$\\int_0^\\infty e^{-x^2}\\,dx = \\tfrac{\\sqrt{\\pi}}{2}$$

A malformed expression like $\\frac{1}{$ renders as an error token rather than
crashing the editor.
`;

const MATH_MARKDOWN_LITERAL = [
  "Inline math: $E = mc^2$.",
  "",
  "Display math on its own line:",
  "",
  "$$\\int_0^1 x^2 \\, dx = \\tfrac{1}{3}$$",
].join("\n");

const MATH_SRC = `import { HiermarkEditor } from "@hiermark/editor";
import "@hiermark/editor/styles.css";

// Inline $…$ and display $$…$$ both render with KaTeX and round-trip through
// markdown. Type them live too — typing the closing $ converts as you go.
// (throwOnError:false renders malformed LaTeX as an error token, not a crash.)
const markdown = \`
${MATH_MARKDOWN_LITERAL}
\`;

<HiermarkEditor surfaceId="math" value={{ kind: "markdown", markdown }} />;`;

// ---------------------------------------------------------------------------
// Tables — edit as a table or as raw markdown (source mode)
// ---------------------------------------------------------------------------

const TABLE_MD = `# Tables

GFM tables written in markdown are recognized as editable tables. Use **Edit as
markdown** (top-right) to drop to the raw markdown and back.

| Model | AUROC | Calibrated? |
| --- | --- | --- |
| Baseline | 0.81 | no |
| EQ-forecast | 0.88 | yes |

Add or remove a column in either form — the two round-trip.
`;

const TABLE_SRC = `import { useRef, useState } from "react";
import { HiermarkEditor, type HiermarkEditorHandle, type HiermarkEditorMode } from "@hiermark/editor";

function TableExample() {
  const handle = useRef<HiermarkEditorHandle | null>(null);
  const [mode, setMode] = useState<HiermarkEditorMode>("rich");
  return (
    <>
      <button onClick={() => handle.current?.setMode(mode === "rich" ? "source" : "rich")}>
        {mode === "rich" ? "Edit as markdown" : "Back to table"}
      </button>
      <HiermarkEditor
        surfaceId="tbl"
        value={{ kind: "markdown", markdown: TABLE_MD }}
        onReady={(h) => (handle.current = h)}
        onModeChange={setMode}
      />
    </>
  );
}`;

function TableExample() {
  const handle = useRef<HiermarkEditorHandle | null>(null);
  const [mode, setMode] = useState<HiermarkEditorMode>("rich");
  return (
    <LiveExample
      title="Tables — edit as a table or as markdown"
      source={TABLE_SRC}
      controls={
        <button
          type="button"
          className="demo-btn"
          onClick={() => handle.current?.setMode(mode === "rich" ? "source" : "rich")}
        >
          {mode === "rich" ? "Edit as markdown" : "Back to table"}
        </button>
      }
    >
      <HiermarkEditor
        surfaceId="tbl-doc"
        rootBlockId="blk_tbl"
        branchPolicy="off"
        value={{ kind: "markdown", markdown: TABLE_MD }}
        onReady={(h) => {
          handle.current = h;
        }}
        onModeChange={setMode}
      />
    </LiveExample>
  );
}

// ---------------------------------------------------------------------------
// Figures — image upload routed through a host handler
// ---------------------------------------------------------------------------

const IMG_MD = `# Figures

Paste or drop an image, or use **Insert image…** above. Every image file is
routed through your \`onImageUpload\` handler, so *you* decide where the bytes go
(server upload, S3, an object URL, base64). The editor only inserts the \`src\`
you return — and \`![alt](src)\` round-trips through markdown.

**Click any image** to edit its alt text (for accessibility) and title; the
edit writes straight back to the \`![alt](src "title")\` markdown. **Select an
image and drag its handles** to resize it — the width is kept in the document
(markdown export stays size-agnostic).
`;

const IMG_SRC = `import { useRef } from "react";
import { HiermarkEditor, type HiermarkEditorHandle, type HiermarkImageUploadHandler } from "@hiermark/editor";

// You own storage. Here we keep it client-side with an object URL; a real app
// would POST the file and return the stored URL.
const onImageUpload: HiermarkImageUploadHandler = async (file, { surfaceId }) => {
  // const { url } = await api.upload(file, surfaceId);
  return { src: URL.createObjectURL(file), alt: file.name };
};

function ImageExample() {
  const handle = useRef<HiermarkEditorHandle | null>(null);
  const picker = useRef<HTMLInputElement | null>(null);
  return (
    <>
      <button onClick={() => picker.current?.click()}>Insert image…</button>
      <input
        ref={picker}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) handle.current?.uploadImages(e.target.files);
          e.target.value = "";
        }}
      />
      <HiermarkEditor
        surfaceId="img"
        value={{ kind: "markdown", markdown: IMG_MD }}
        onImageUpload={onImageUpload}
        onReady={(h) => (handle.current = h)}
      />
    </>
  );
}`;

const onImageUpload: HiermarkImageUploadHandler = async (file) => ({
  src: URL.createObjectURL(file),
  alt: file.name,
});

function ImageExample() {
  const handle = useRef<HiermarkEditorHandle | null>(null);
  const picker = useRef<HTMLInputElement | null>(null);
  return (
    <LiveExample
      title="Figures — image upload via your handler"
      source={IMG_SRC}
      controls={
        <>
          <button type="button" className="demo-btn" onClick={() => picker.current?.click()}>
            Insert image…
          </button>
          <input
            ref={picker}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) void handle.current?.uploadImages(e.target.files);
              e.target.value = "";
            }}
          />
        </>
      }
    >
      <HiermarkEditor
        surfaceId="img-doc"
        rootBlockId="blk_img"
        branchPolicy="off"
        value={{ kind: "markdown", markdown: IMG_MD }}
        onImageUpload={onImageUpload}
        onReady={(h) => {
          handle.current = h;
        }}
      />
    </LiveExample>
  );
}

/**
 * Rich content reference: the four interactive content features (code, math,
 * tables, figures), each a live editor with a "</> Source" toggle that reveals
 * the React that produced it.
 */
export function RichContentPage() {
  return (
    <section className="page">
      <h2>Rich content</h2>
      <p className="lede">
        Beyond prose, a surface renders highlighted code, math, tables, and figures — all written as
        markdown, all round-tripping back to it. Each example below is a{" "}
        <strong>live editor</strong>; hit <code>&lt;/&gt; Source</code> in any caption to see the
        exact React that produced it.
      </p>

      <h3>Code blocks</h3>
      <p>
        Fenced blocks annotated with a language are syntax-highlighted (highlight.js via lowlight).
        The header carries a language picker (which rewrites the fence) and a copy-to-clipboard
        button; the language is preserved on markdown round-trip.
      </p>
      <LiveExample title="Syntax highlighting + copy + language picker" source={CODE_SRC}>
        <HiermarkEditor
          surfaceId="code-doc"
          rootBlockId="blk_code"
          branchPolicy="off"
          value={{ kind: "markdown", markdown: CODE_MD }}
        />
      </LiveExample>

      <h3>Math</h3>
      <p>
        Inline <code>$…$</code> and display <code>$$…$$</code> math both render with KaTeX and
        round-trip through markdown. Malformed LaTeX renders as an error token instead of throwing.
      </p>
      <LiveExample title="Inline + display math (KaTeX)" source={MATH_SRC}>
        <HiermarkEditor
          surfaceId="math-doc"
          rootBlockId="blk_math"
          branchPolicy="off"
          value={{ kind: "markdown", markdown: MATH_MD }}
        />
      </LiveExample>

      <h3>Tables</h3>
      <p>
        GFM tables are recognized as editable tables. The <code>setMode</code> handle toggles a
        surface between the rich table and a raw-markdown <code>&lt;textarea&gt;</code> — so you can
        hand-edit the markdown and re-parse. (An unedited round-trip preserves block ids.)
      </p>
      <TableExample />

      <h3>Figures</h3>
      <p>
        Images upload through a host <code>onImageUpload</code> handler — from paste, drag-drop, or
        the <code>uploadImages</code> picker — so storage stays your decision. The editor inserts
        the returned <code>src</code> and <code>![alt](src)</code> round-trips through markdown.
      </p>
      <ImageExample />
    </section>
  );
}
