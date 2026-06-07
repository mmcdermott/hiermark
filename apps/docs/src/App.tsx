import { HAM_EDITOR_VERSION } from "@ham/editor";
import { HAM_CANVAS_VERSION } from "@ham/canvas";

// Phase-0 placeholder. This app consumes the packages as a real installed
// consumer (via their built dist + package exports), satisfying the Phase-0
// acceptance criterion. It is fleshed out into the full docs site in Phase 5.
export function App() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 720, margin: "4rem auto" }}>
      <h1>HAM — Hierarchical, Annotatable Markdown</h1>
      <p>
        A 2D canvas of linked, editable markdown surfaces with rich annotations and block-anchored
        branching.
      </p>
      <ul>
        <li>
          <code>@ham/editor</code> v{HAM_EDITOR_VERSION}
        </li>
        <li>
          <code>@ham/canvas</code> v{HAM_CANVAS_VERSION}
        </li>
      </ul>
      <p>The interactive documentation site is under construction.</p>
    </main>
  );
}
