---
"@hiermark/editor": minor
---

URI sanitizer hardening: the link/image policy is now a normalization-first
ALLOWLIST instead of a scheme denylist. Hrefs allow http/https/mailto plus
relative URLs; image srcs (not a navigation context) block the script-capable
set — javascript:/vbscript:/file: and non-image `data:` payloads — while
custom inert schemes (e.g. an upload handler's `stored://`) stay allowed. URLs are normalized the way browsers do (tab/CR/LF stripped
anywhere, control chars trimmed) before scheme detection, closing the
`java\tscript:` obfuscation bypass for content that arrives without
browser-side validation (tiptap-json seeds, collab updates). New
`isAllowedLinkHref` prop (symmetric to `isAllowedImageSrc`) lets hosts widen
or tighten the policy, and the link popover's "Open" affordance respects it.
