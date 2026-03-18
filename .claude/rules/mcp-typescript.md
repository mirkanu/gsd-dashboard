---
paths:
  - "mcp/src/**/*.ts"
  - "mcp/package.json"
  - "mcp/tsconfig.json"
  - "mcp/.env.example"
  - "mcp/README.md"
---

# MCP Server Rules

- Keep MCP tool names stable and descriptive.
- Keep destructive operations behind explicit guardrails.
- Route all logs to stderr only; never write protocol logs to stdout.
- Keep tool input schemas strict and bounded.
- Preserve loopback-only API target enforcement unless security posture changes by request.
- Verify MCP with `npm run mcp:typecheck` and `npm run mcp:build` after code edits.
