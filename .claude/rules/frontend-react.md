---
paths:
  - "client/src/**/*.{ts,tsx,css}"
  - "client/public/**/*.tsx"
---

# Frontend Rules

- Preserve existing UI information hierarchy unless redesign is requested.
- Keep component props and API typing explicit; avoid implicit `any`.
- Match existing page/component patterns for loading, empty, and error states.
- When adding UI behavior, ensure it degrades safely if websocket updates are delayed.
- Keep routes consistent with current navigation model.
- Prefer focused UI diffs over broad stylistic rewrites.
