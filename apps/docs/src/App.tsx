import { useEffect, useState, type ReactNode } from "react";

import { Overview } from "./pages/Overview";
import { GettingStarted } from "./pages/GettingStarted";
import { MarkdownPage } from "./pages/MarkdownPage";
import { RichContentPage } from "./pages/RichContentPage";
import { AnnotationsPage } from "./pages/AnnotationsPage";
import { ApiReference } from "./pages/ApiReference";
import { ProductionPage } from "./pages/ProductionPage";
import { EditorDemo } from "./demos/EditorDemo";
import { CanvasDemo } from "./demos/CanvasDemo";
import { CanvasStylesDemo } from "./demos/CanvasStylesDemo";
import { FocusSidebarDemo, FlatManuscriptDemo, TopologyMapDemo } from "./demos/StyledExamplesDemo";
import { PaperDemo } from "./demos/PaperDemo";
import { CollabDemo } from "./demos/CollabDemo";

interface Section {
  id: string;
  label: string;
  group: string;
  render: () => ReactNode;
}

const SECTIONS: Section[] = [
  { id: "overview", label: "What is HAM?", group: "Guide", render: () => <Overview /> },
  {
    id: "getting-started",
    label: "Getting started",
    group: "Guide",
    render: () => <GettingStarted />,
  },
  {
    id: "markdown",
    label: "Markdown & rendering",
    group: "Concepts",
    render: () => <MarkdownPage />,
  },
  {
    id: "rich-content",
    label: "Rich content",
    group: "Concepts",
    render: () => <RichContentPage />,
  },
  {
    id: "annotations",
    label: "Annotations",
    group: "Concepts",
    render: () => <AnnotationsPage />,
  },
  {
    id: "editor",
    label: "The editor",
    group: "Live demos",
    render: () => (
      <section className="page">
        <h2>The editor surface</h2>
        <p className="lede">
          <code>@ham/editor</code> renders one block-centric markdown document. Every structural
          block gets a stable id; a thin annotation layer recognizes tasks, citations, mentions, and
          URLs; headings fold; and a branch gutter lets you spin any block into its own surface.
        </p>
        <EditorDemo />
      </section>
    ),
  },
  {
    id: "canvas",
    label: "The canvas",
    group: "Live demos",
    render: () => (
      <section className="page">
        <h2>The canvas</h2>
        <p className="lede">
          Branch a block (hover it for the <strong>+</strong> button on its right) and it becomes a
          surface in the next column. Branch from a second block and it joins the same column;
          branch the same block twice for ordered siblings you can drag to reorder. Click a card to
          focus it, or navigate with Alt+Arrows (Alt+Right follows the focused block&apos;s own
          branch; Alt+C collapses the active surface). Tick <em>Keep columns expanded</em> so
          nothing collapses as you branch, and <strong>⛶ Expand</strong> to use the full screen.
        </p>
        <CanvasDemo />
      </section>
    ),
  },
  {
    id: "styling",
    label: "Styling & slots",
    group: "Live demos",
    render: () => (
      <section className="page">
        <h2>Styling &amp; slots</h2>
        <p className="lede">
          The same tree, re-themed live. Switch <strong>cards</strong> between separate cards, flat
          columns that read as one holistic editor, and unstyled plain; toggle the cross-column{" "}
          <strong>connector</strong> modes; swap the <strong>add-sibling button</strong> for a
          different component — it&apos;s passable just like the editor&apos;s branch button; turn
          on <strong>group headers</strong> (a breadcrumb to each group&apos;s parent) and{" "}
          <strong>column scroll</strong> (each level scrolls on its own, so selecting a surface
          reveals its children); and condense the <strong>inactive columns</strong> (Editor → Card →
          Outline → Rail) for a focus / sidebar view. Hover a column to reveal the{" "}
          <strong>+</strong> rail between siblings to insert a branch at that position; drag a card
          to reorder (then <kbd>Cmd/Ctrl+Z</kbd> to undo the reorder).
        </p>
        <CanvasStylesDemo />
      </section>
    ),
  },
  {
    id: "gallery",
    label: "Gallery of styles",
    group: "Live demos",
    render: () => (
      <section className="page">
        <h2>Gallery of styles</h2>
        <p className="lede">
          The <em>same</em> tree, three intentional looks — the layout/slot/theme knobs aren&apos;t
          just toggles, they compose into genuinely different tools. A{" "}
          <strong>focus / sidebar</strong> view that collapses the other documents to titles while
          you edit one; a warm, serif <strong>flat manuscript</strong> where the levels flow as one
          document; and a dark <strong>topology map</strong> of the whole tree with bold edges.
        </p>
        <FocusSidebarDemo />
        <FlatManuscriptDemo />
        <TopologyMapDemo />
      </section>
    ),
  },
  {
    id: "paper",
    label: "Decompose a paper",
    group: "Live demos",
    render: () => (
      <section className="page">
        <h2>Progressive decomposition</h2>
        <p className="lede">
          Start a paper as a single thesis paragraph, then branch it into Intro / Method / Results,
          and branch each of those again. The canvas reads as{" "}
          <em>levels left → right, sections top → down</em> — the whole argument at any altitude.
        </p>
        <PaperDemo />
      </section>
    ),
  },
  {
    id: "collaboration",
    label: "Collaboration",
    group: "Live demos",
    render: () => (
      <section className="page">
        <h2>Real-time collaboration</h2>
        <p className="lede">
          Each surface can be collaborative via Yjs. The editor owns the document and only binds
          after the provider syncs, so initial content is never duplicated — and{" "}
          <strong>remote cursors are shown by default</strong> (a colored, labeled caret per editor)
          so collaborators don&apos;t edit the same spot. Below, two peers relay edits and presence
          in-memory (no server needed for the demo).
        </p>
        <CollabDemo />
      </section>
    ),
  },
  {
    id: "production",
    label: "Production notes",
    group: "Reference",
    render: () => <ProductionPage />,
  },
  { id: "api", label: "API reference", group: "Reference", render: () => <ApiReference /> },
];

/** The section id in the hash, or null for a non-section hash (e.g. the
 * skip-link's `#main`, which must focus the content — not navigate). */
function sectionFromHash(): string | null {
  const id = window.location.hash.replace(/^#/, "");
  return SECTIONS.some((s) => s.id === id) ? id : null;
}

export function App() {
  const [active, setActive] = useState<string>(() => sectionFromHash() ?? SECTIONS[0]!.id);
  const [dark, setDark] = useState(
    () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false,
  );

  useEffect(() => {
    const onHash = () => {
      // Unknown hashes are NOT navigation: the skip link (#main) used to
      // resolve to the first section and silently swap the page (destroying
      // demo state) instead of just moving focus.
      const id = sectionFromHash();
      if (id) setActive(id);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // A page switch is a navigation: start the new page at the top (the swap
  // used to inherit the previous page's scroll position, so a new page could
  // open scrolled past its own content).
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [active]);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);

  const section = SECTIONS.find((s) => s.id === active) ?? SECTIONS[0]!;
  const groups = [...new Set(SECTIONS.map((s) => s.group))];

  return (
    <div className="layout">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <button
          type="button"
          className="theme-toggle"
          aria-pressed={dark}
          title="Toggle dark mode"
          onClick={() => setDark((d) => !d)}
        >
          {dark ? "☀︎ Light" : "☾ Dark"}
        </button>
        <a className="brand" href="#overview">
          <span className="brand-mark">▦</span>
          <span>
            HAM
            <small>Hierarchical, Annotatable Markdown</small>
          </span>
        </a>
        <nav aria-label="Primary">
          {groups.map((group) => (
            <div key={group} className="nav-group">
              <div className="nav-group-label">{group}</div>
              {SECTIONS.filter((s) => s.group === group).map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className={s.id === active ? "nav-link nav-link-active" : "nav-link"}
                  aria-current={s.id === active ? "page" : undefined}
                >
                  {s.label}
                </a>
              ))}
            </div>
          ))}
        </nav>
        <a
          className="repo-link"
          href="https://github.com/mmcdermott/ham"
          target="_blank"
          rel="noreferrer"
        >
          GitHub ↗
        </a>
      </aside>
      <main className="content" id="main" tabIndex={-1} key={section.id}>
        <h1 className="visually-hidden">{section.label}</h1>
        {section.render()}
      </main>
    </div>
  );
}
