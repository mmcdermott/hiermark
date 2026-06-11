---
"@ham/editor": patch
"@ham/canvas": patch
---

Compatibility: React 18.3+ is now an accepted peer (`^18.3.0 || ^19`) — the
packages use no React-19-only APIs, and a dedicated CI leg builds and runs the
full suite with React 18 installed. The published manifests no longer pin
`engines.node` (the repo root keeps it for contributor tooling).
