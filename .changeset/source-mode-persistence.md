---
"@hiermark/editor": minor
---

Source mode is no longer an invisible draft buffer. While the raw-markdown
textarea is active: typing emits `onChange` with `{ kind: "markdown" }`
content, and every handle read (`save()`, `getMarkdown()`, `getJSON()`,
`getSnapshot()`, and a branch event's `save`) first commits the edited source
into the editor — preserving block ids — so the text the user sees is always
the text that saves. Previously, source-mode edits were silently dropped if
the surface saved or unmounted (e.g. canvas autosave/flush) before switching
back to rich mode.
