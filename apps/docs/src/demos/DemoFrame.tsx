import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import { SourcePanel } from "./ShowSource";

export function DemoFrame({
  title,
  children,
  onReset,
  controls,
  source,
  height = 460,
  fillWidth = false,
}: {
  title: string;
  children: ReactNode;
  onReset?: () => void;
  /** Extra controls rendered in the caption (e.g. layout toggles). */
  controls?: ReactNode;
  /** When given, adds a "</> Source" toggle revealing this React snippet. */
  source?: string;
  height?: number | string;
  /**
   * Fill the available content width instead of the default ~900px stage. Use
   * for control-heavy demos whose caption is wider than the stage — otherwise
   * the figure grows to the caption and the stage leaves a blank panel beside
   * it.
   */
  fillWidth?: boolean;
}) {
  const [full, setFull] = useState(false);
  const [showSource, setShowSource] = useState(false);

  // Allow Escape to exit the expanded view — but never steal an Escape an
  // inner popover (link/math/image editor) already handled to dismiss itself.
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === "Escape") setFull(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  return (
    <>
      {full && <div className="demo-backdrop" onClick={() => setFull(false)} />}
      <figure
        className={"demo" + (full ? " demo-full" : "") + (fillWidth ? " demo-fill-width" : "")}
      >
        <figcaption className="demo-caption">
          <span className="demo-title">{title}</span>
          <span className="demo-actions">
            {controls}
            {source && (
              <button
                type="button"
                className="demo-btn"
                aria-pressed={showSource}
                onClick={() => setShowSource((s) => !s)}
              >
                {showSource ? "Hide source" : "</> Source"}
              </button>
            )}
            {onReset && (
              <button type="button" className="demo-btn" onClick={onReset}>
                Reset
              </button>
            )}
            <button
              type="button"
              className="demo-btn"
              aria-pressed={full}
              onClick={() => setFull((f) => !f)}
            >
              {full ? "✕ Close" : "⛶ Expand"}
            </button>
          </span>
        </figcaption>
        <div
          className="demo-stage"
          // The DEFAULT height flows through a CSS variable instead of an
          // inline `height`: the browser's native corner-resize writes inline
          // width/height directly on the element, and a React-managed height
          // would overwrite the user's drag on the next style write (toggling
          // Expand/Close used to snap the height back while the width stuck).
          style={
            {
              "--demo-stage-height": typeof height === "number" ? `${height}px` : height,
            } as CSSProperties
          }
        >
          {children}
        </div>
        {source && showSource && <SourcePanel source={source} />}
      </figure>
    </>
  );
}
