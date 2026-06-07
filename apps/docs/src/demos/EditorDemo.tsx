import { useMemo, useState } from "react";
import { HamEditor, createExampleAnnotationRegistry, type HamEditorProps } from "@ham/editor";

import { DemoFrame } from "./DemoFrame";
import { annotatedMarkdown, annotationContext } from "../lib/examples";

type Registry = HamEditorProps["annotations"];

export function EditorDemo() {
  const registry = useMemo(() => createExampleAnnotationRegistry() as Registry, []);
  const [log, setLog] = useState<string[]>([]);
  const [key, setKey] = useState(0);

  return (
    <DemoFrame
      title="@ham/editor — one annotated surface"
      onReset={() => setKey((k) => k + 1)}
      height="auto"
    >
      <div className="demo-editor-wrap">
        <HamEditor
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
          Hover a block for the ↳ branch button, click a heading's ▾ to fold, and click the{" "}
          <code>@vaswani2017</code> citation or <code>@alice</code> mention to open its popover.
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
