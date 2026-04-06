# Quick Task 32: Proxy-side cache for /api/gsd/projects — Summary

**One-liner:** Stale-while-revalidate proxy cache eliminates 4-8s tunnel latency — all responses now <250ms.

## Root Cause

On Railway (production), `/api/gsd/projects` proxies through a cloudflared tunnel to the local machine. Every request paid the tunnel roundtrip (4-8s). The existing 5s cache was only in the local code path, not the proxy path.

## What Was Done

1. **Proxy-side caching** — The `GSD_DATA_URL` proxy branch now caches upstream responses (was pass-through)
2. **Stale-while-revalidate** — Always serve from cache if available (instant). Trigger background refresh when data is >5s old. 30s TTL so cache outlives the 10-60s poll interval.
3. **Cache warm on startup** — Server self-fetches `/api/gsd/projects` on boot so first user request hits warm cache
4. **Stale fallback** — If tunnel is down, serve last known data instead of 502

## Key Changes

| File | Change |
|------|--------|
| `server/routes/gsd.js:14-17` | Added `projectsCacheRefreshing` flag, increased TTL to 30s, added 5s stale threshold |
| `server/routes/gsd.js:54-82` | Stale-while-revalidate proxy logic |
| `server/index.js:120-125` | Self-fetch cache warm on startup |

## Verification

Measured from external curl to Railway:
- First request after deploy: 0.24s (warm cache)
- 15s later: 0.09s (cached)
- 35s later: 0.10s (stale-while-revalidate)
- Previous: 4-8s on every request
