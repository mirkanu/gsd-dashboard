---
plan: 66-02
phase: 66
status: complete
completed: 2026-05-07
---

# Plan 66-02 Summary: Tunnel Hardening + Railway Independence Audit

## Outcome

All tasks complete. scripts/named-tunnel.sh was already committed to the repo (commit `1b759e2`).
Railway independence confirmed — no live Railway dependencies on Hetzner.

## Verification

| Check | Result |
|---|---|
| `scripts/named-tunnel.sh` in repo | ✅ committed, uses `cloudflared --config /home/claude/.cloudflare-tunnel/config.yml tunnel run` |
| Tunnel type in PM2 logs | ✅ Named tunnel — gsdlabs.dev ingress rules in logs, no trycloudflare.com |
| `GSD_DATA_URL` in `.env` | ✅ Not set — dashboard is in local mode |
| `GSD_DATA_URL` in PM2 env | ✅ Not set |
| Railway refs in `.env` | ✅ None |
| `curl https://dashboard.gsdlabs.dev/api/health` | ✅ {"status":"ok","buildDate":"07May2026"} |

## Railway Audit Result

No live Railway dependencies. All Railway-touching code paths in server/ are behind
`if (GSD_DATA_URL)` guards — dead code on Hetzner. Railway env var references in client
config are vestigial UI fields that store nothing without a Railway PAT.
