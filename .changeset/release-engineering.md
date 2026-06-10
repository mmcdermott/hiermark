---
"@ham/editor": patch
"@ham/canvas": patch
---

Packaging fixes: `@ham/editor`'s exports map no longer carries redundant
top-level `types` keys that resolved ESM-flavored declarations under the
`require` condition (CJS TypeScript consumers now get `index.d.cts`), and
`@ham/canvas` declares its `@ham/editor` peer as an explicit `>=0.1.0 <1.0.0`
range instead of `workspace:^` (which made changesets major-bump the canvas on
every editor minor).
