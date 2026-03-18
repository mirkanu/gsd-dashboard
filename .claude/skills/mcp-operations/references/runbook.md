# MCP Runbook

## Read-only daily mode
- Keep both mutation flags false.
- Use read tools for observability and reporting.

## Admin mode
- Set `MCP_DASHBOARD_ALLOW_MUTATIONS=true`.
- Run maintenance/pricing operations.
- Reset mutation flag to false after completion.

## Destructive mode
- Set both mutation and destructive flags true.
- Execute destructive command only with explicit confirmation token.
- Immediately disable destructive flag after operation.

## Verification commands
- `npm run mcp:typecheck`
- `npm run mcp:build`
