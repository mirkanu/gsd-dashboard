---
phase: 66
name: dashboard-resilience
status: planned
created: 2026-05-04
---

# Phase 66 Context: Dashboard Resilience Hardening

## Problem

`dashboard.gsdlabs.dev` is unstable — Cloudflare errors, unexpected restarts, no clean recovery path.

## Root Cause Analysis

### Cause 1 — `gsd-healthcheck` has `max_restarts: 10`
PM2 allows the healthcheck process to restart 10 times before marking it errored and stopping it.
Once the healthchecker stops, there is zero auto-recovery if the dashboard enters a crash-loop or
hangs. This is the most dangerous gap in the current setup.

### Cause 2 — `scripts/named-tunnel.sh` exists on VPS but not in the repo
`ecosystem.config.cjs` references `scripts/named-tunnel.sh`. That file was created directly on the
VPS during Phase 62-02 (named Cloudflare tunnel setup) and was never committed. If the VPS is
reprovisioned or the file is accidentally deleted, the tunnel process fails to start and the
dashboard becomes unreachable with no recovery path.

### Cause 3 — No uncaughtException / unhandledRejection handlers
Any unhandled async error crashes the process immediately. PM2 restarts it but the crash is
often silent in logs (just a process exit with code 1) making root cause investigation hard.
PM2 doesn't capture the error context that killed the process.

### Cause 4 — No exp_backoff_restart_delay
Fixed 3s restart delay means rapid crash loops burn through the 50-restart budget in ~2.5 minutes,
after which PM2 stops restarting the dashboard entirely.

### Cause 5 — Cloudflare 502 window on restart
When dashboard crashes, cloudflared is still up but returns 502 for the entire restart window
(3s delay + ~3-5s startup + cache warm). Users see Cloudflare error pages for 6-10s per crash.

## Target State

- Dashboard auto-restarts cleanly on any crash with exponential backoff
- Healthchecker never permanently stops (no max_restarts limit)
- `named-tunnel.sh` is in the repo, version-controlled, and robust
- Unhandled exceptions are logged with full stack trace before exit
- Dashboard startup is fast enough that Cloudflare 502 windows are <5s

## Plans

1. **66-01** — PM2 ecosystem hardening + uncaught exception handlers
2. **66-02** — Bring `named-tunnel.sh` into the repo + tunnel crash hardening
