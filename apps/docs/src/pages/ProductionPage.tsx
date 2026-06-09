const TOKENS: { name: string; what: string }[] = [
  { name: "--ham-accent", what: "Primary accent (active surface, links, focus)." },
  { name: "--ham-accent-soft", what: "Soft accent fill (hover, selection)." },
  { name: "--ham-text / --ham-muted", what: "Body and secondary text." },
  { name: "--ham-surface-bg / --ham-surface-border", what: "Card background + border." },
  { name: "--ham-canvas-bg", what: "Canvas backdrop (@ham/canvas)." },
  { name: "--ham-inline-code-bg / --ham-th-bg", what: "Inline code + table header fills." },
  { name: "--ham-radius", what: "Corner radius for cards / popovers." },
];

const COLLAB_SERVER = `// server.ts — a minimal Hocuspocus server (host-deployed).
import { Server } from "@hocuspocus/server";
import { Database } from "@hocuspocus/extension-database";

const server = Server.configure({
  port: 1234,
  extensions: [
    new Database({
      // Return raw Uint8Array — NEVER a reconstructed Y.Doc (a duplicated yjs
      // runtime fails Hocuspocus's instanceof Doc check and loads empty).
      fetch: async ({ documentName }) => loadBytes(documentName), // Uint8Array | null
      store: async ({ documentName, state }) => saveBytes(documentName, state),
    }),
  ],
  // The WS can't carry your session cookie — verify a short-lived per-doc JWT.
  onAuthenticate: async ({ token, documentName }) => {
    const claims = verifyJwt(token);
    if (!canAccess(claims.userId, documentName)) throw new Error("forbidden");
    return { user: { id: claims.userId } };
  },
});
server.listen();`;

const COLLAB_CLIENT = `import { HamEditor } from "@ham/editor";

<HamEditor
  surfaceId="doc-1"
  value={{ kind: "markdown", markdown: "" }}
  collaboration={{
    enabled: true,
    provider: "hocuspocus",
    url: "wss://collab.example.com",
    documentName: "doc-1",
    token: await mintDocToken("doc-1"), // short-lived JWT from your API
    user: { name: "Ada", color: "#6f5cff" },
    onStatusChange: (s) => console.log("collab:", s),
    onUnsyncedChangesChange: (n) => setDirty(n > 0),
  }}
/>;`;

export function ProductionPage() {
  return (
    <section className="page">
      <h2>Production notes</h2>
      <p className="lede">
        What to know before adopting HAM in a real app: current limitations, the theming tokens
        (including dark mode), and how to stand up a real collaboration server.
      </p>

      <h3>Theming &amp; dark mode</h3>
      <p>
        Every visual reads from CSS variables you can override. A <strong>dark theme</strong> ships
        out of the box: it follows the OS <code>prefers-color-scheme</code>, or you can force it
        with <code>data-theme=&quot;dark&quot;</code> (or pin light with{" "}
        <code>data-theme=&quot;light&quot;</code>) on any ancestor. Toggle the switch in the top bar
        to see it live.
      </p>
      <table className="api-table">
        <thead>
          <tr>
            <th>Token</th>
            <th>Controls</th>
          </tr>
        </thead>
        <tbody>
          {TOKENS.map((t) => (
            <tr key={t.name}>
              <td>
                <code>{t.name}</code>
              </td>
              <td>{t.what}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Collaboration server recipe</h3>
      <p>
        The editor connects via <code>createHocuspocusCollab</code>; you run the server. The two
        contracts that matter:{" "}
        <strong>
          load/store raw <code>Uint8Array</code>
        </strong>{" "}
        Yjs state (never a reconstructed <code>Y.Doc</code>), and authenticate with a short-lived
        per-document JWT (the WebSocket can&apos;t carry your session cookie).
      </p>
      <pre className="doc-code">
        <code>{COLLAB_SERVER}</code>
      </pre>
      <p>Client side:</p>
      <pre className="doc-code">
        <code>{COLLAB_CLIENT}</code>
      </pre>

      <h3>Known limitations</h3>
      <ul className="prose-list">
        <li>
          <strong>SSR</strong> — the editor renders client-only; it auto-defers during SSR
          (Next.js/Remix), then mounts on hydration.
        </li>
        <li>
          <strong>No bundled collab server</strong> — you deploy Hocuspocus (recipe above).
        </li>
        <li>
          <strong>Images</strong> are inline nodes (not yet first-class branchable blocks); storage
          is entirely your <code>onImageUpload</code> handler.
        </li>
        <li>
          <strong>Source mode</strong> is disabled under collaboration (a full re-parse would
          clobber the shared doc); use it on non-collab surfaces.
        </li>
        <li>
          <strong>Large trees</strong> aren&apos;t virtualized yet — hundreds of surfaces mount real
          editors. Connector measurement is linear per pass.
        </li>
        <li>
          <strong>Markdown fidelity</strong> — footnotes / definition lists / raw HTML blocks
          aren&apos;t modeled and may not round-trip.
        </li>
      </ul>
      <p>
        Security: pasted / imported markdown is sanitized — <code>javascript:</code>/
        <code>data:text/html</code>
        link hrefs and image srcs are stripped from every path. Override the image policy with
        <code>isAllowedImageSrc</code>.
      </p>
    </section>
  );
}
