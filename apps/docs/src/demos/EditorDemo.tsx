import { useMemo, useState } from "react";
import { HiermarkEditor, createExampleAnnotationRegistry, type HiermarkEditorProps } from "@hiermark/editor";

import { DemoFrame } from "./DemoFrame";
import { annotatedMarkdown, annotationContext } from "../lib/examples";

type Registry = HiermarkEditorProps["annotations"];

const SOURCE = `import { HiermarkEditor, createExampleAnnotationRegistry } from "@hiermark/editor";
import "@hiermark/editor/styles.css";

// One surface = one annotated markdown document. The annotation registry
// recognizes @citations, @mentions, URLs, and tasks; onBranchRequest fires
// when a block's "+" gutter button is clicked.
<HiermarkEditor
  surfaceId="demo-editor"
  rootBlockId="blk_root"
  title="Related work"
  value={{ kind: "markdown", markdown: annotatedMarkdown }}
  annotations={createExampleAnnotationRegistry()}
  annotationContext={annotationContext}
  onBranchRequest={(e) => console.log("branch", e.blockId, e.textPreview)}
/>;`;

export function EditorDemo() {
  const registry = useMemo(() => createExampleAnnotationRegistry() as Registry, []);
  const [log, setLog] = useState<string[]>([]);
  const [key, setKey] = useState(0);

  return (
    <DemoFrame
      title="@hiermark/editor — one annotated surface"
      onReset={() => setKey((k) => k + 1)}
      source={SOURCE}
      height="auto"
    >
      <div className="demo-editor-wrap">
        <HiermarkEditor
          key={key}
          surfaceId="demo-editor"
          rootBlockId="blk_root"
          title="Related work"
          value={{ kind: "markdown", markdown: annotatedMarkdown }}
          annotations={registry}
          annotationContext={annotationContext}
          onBranchRequest={(e) =>
            setLog((l) =>
              [`Branch requested from block "${e.textPreview}" (${e.blockId})`, ...l].slice(0, 4),
            )
          }
        />
        <p className="demo-hint">
          Type <code>@</code> anywhere to <strong>search references &amp; people</strong> and insert
          a citation/mention (↑/↓ to move, Enter to pick, Esc to dismiss). Hover a block for the{" "}
          <strong>+</strong> branch button on its right, click a heading's ▾ (left) to fold, and
          click an inserted <code>@vaswani2017</code> citation or <code>@alice</code> mention to
          open its popover. Type <code>[ ]</code> or <code>- [ ]</code> to make a checklist.
        </p>
        {log.length > 0 && (
          <ul className="demo-log">
            {log.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        )}
      </div>
    </DemoFrame>
  );
}
