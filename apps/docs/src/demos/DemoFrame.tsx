import type { ReactNode } from "react";

export function DemoFrame({
  title,
  children,
  onReset,
  height = 460,
}: {
  title: string;
  children: ReactNode;
  onReset?: () => void;
  height?: number | string;
}) {
  return (
    <figure className="demo">
      <figcaption className="demo-caption">
        <span>{title}</span>
        {onReset && (
          <button type="button" className="demo-reset" onClick={onReset}>
            Reset
          </button>
        )}
      </figcaption>
      <div className="demo-stage" style={{ height }}>
        {children}
      </div>
    </figure>
  );
}
