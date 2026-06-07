import { useEffect, useState, type ReactNode } from "react";

import { Overview } from "./pages/Overview";
import { GettingStarted } from "./pages/GettingStarted";
import { ApiReference } from "./pages/ApiReference";
import { EditorDemo } from "./demos/EditorDemo";
import { CanvasDemo } from "./demos/CanvasDemo";
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
          Branch a block (hover for the ↳ button) and it becomes a surface in the next column.
          Branch from a second block and it joins the same column; branch the same block twice for
          ordered siblings you can drag to reorder. Click a card to focus it, or navigate with
          Alt+Arrows.
        </p>
        <CanvasDemo />
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
          after the provider syncs, so initial content is never duplicated. Below, two editors share
          one in-memory Yjs document (no server needed for the demo).
        </p>
        <CollabDemo />
      </section>
    ),
  },
  { id: "api", label: "API reference", group: "Reference", render: () => <ApiReference /> },
];

function sectionFromHash(): string {
  const id = window.location.hash.replace(/^#/, "");
  return SECTIONS.some((s) => s.id === id) ? id : SECTIONS[0]!.id;
}

export function App() {
  const [active, setActive] = useState<string>(sectionFromHash);

  useEffect(() => {
    const onHash = () => setActive(sectionFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const section = SECTIONS.find((s) => s.id === active) ?? SECTIONS[0]!;
  const groups = [...new Set(SECTIONS.map((s) => s.group))];

  return (
    <div className="layout">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
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
