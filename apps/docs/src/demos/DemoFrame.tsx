import { useEffect, useState, type ReactNode } from "react";

export function DemoFrame({
  title,
  children,
  onReset,
  controls,
  height = 460,
}: {
  title: string;
  children: ReactNode;
  onReset?: () => void;
  /** Extra controls rendered in the caption (e.g. layout toggles). */
  controls?: ReactNode;
  height?: number | string;
}) {
  const [full, setFull] = useState(false);

  // Allow Escape to exit the expanded view.
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFull(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  return (
    <>
      {full && <div className="demo-backdrop" onClick={() => setFull(false)} />}
      <figure className={"demo" + (full ? " demo-full" : "")}>
        <figcaption className="demo-caption">
          <span className="demo-title">{title}</span>
          <span className="demo-actions">
            {controls}
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
        <div className="demo-stage" style={full ? undefined : { height }}>
          {children}
        </div>
      </figure>
    </>
  );
}
