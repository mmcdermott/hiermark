import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as subpath from "../src/markdown";
import * as root from "../src/index";

/**
 * Guards the `@hiermark/editor/markdown` subpath (GitHub issue #50): a host server's
 * reconciler imports these pure helpers without dragging in React/Tiptap. Three
 * invariants are protected here:
 *   1. the subpath barrel exports every pure helper (and they actually work),
 *   2. the root barrel re-exports the *same* implementations (no definition drift),
 *   3. nothing under `src/markdown/` imports a browser dependency.
 * (3) is the load-bearing one: if a future edit pulls React/Tiptap into a markdown
 * helper, the subpath silently stops being server-safe — this test fails first.
 */

const EXPECTED = [
  "fnv1a64Hex",
  "normalizeForHash",
  "stripStableIds",
  "readStableId",
  "injectInlineId",
  "blockIdLine",
  "headingDepthOf",
  "inferBlockContainment",
  "inferContainmentFromMarkdown",
  "parseChecklist",
  "normalize",
  "taskKey",
  "injectTaskIds",
  "extractCitationKeys",
  "findCitations",
  "extractResourceLinks",
  "findResources",
  "detectResourceKind",
] as const;

describe("@hiermark/editor/markdown subpath", () => {
  it("exports every pure helper as a function", () => {
    for (const name of EXPECTED) {
      expect(typeof (subpath as Record<string, unknown>)[name], name).toBe("function");
    }
  });

  it("the helpers actually work without any editor context", () => {
    expect(subpath.fnv1a64Hex("hello")).toMatch(/^[0-9a-f]{16}$/);
    expect(subpath.stripStableIds("# Title <!-- hiermark:block=blk_1 -->")).toBe("# Title");
    expect(subpath.detectResourceKind("https://arxiv.org/abs/2401.00001")).toBe("arxiv");
    expect(subpath.inferContainmentFromMarkdown(["# A", "## B"])).toEqual([null, 0]);
  });

  it("the root barrel re-exports the SAME implementations (single source of truth)", () => {
    for (const name of EXPECTED) {
      expect((root as Record<string, unknown>)[name], name).toBe(
        (subpath as Record<string, unknown>)[name],
      );
    }
  });

  it("no file under src/markdown/ imports a browser dependency", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const dir = join(here, "..", "src", "markdown");
    const forbidden =
      /(["'])(react|react-dom|@tiptap\/|@floating-ui\/|katex|lowlight|yjs|y-prosemirror|@hocuspocus\/|nanoid|prosemirror-)/;
    const offenders: string[] = [];
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
      const src = readFileSync(join(dir, file), "utf8");
      for (const line of src.split("\n")) {
        // Only inspect static import/export-from statements, not prose in comments.
        if (/^\s*(import|export)\b.*\bfrom\b/.test(line) && forbidden.test(line)) {
          offenders.push(`${file}: ${line.trim()}`);
        }
      }
    }
    expect(offenders, `markdown helpers must stay browser-free:\n${offenders.join("\n")}`).toEqual(
      [],
    );
  });
});
