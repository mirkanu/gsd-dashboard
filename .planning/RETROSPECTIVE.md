# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v2.1 — Session Intelligence & Terminal UX

**Shipped:** 2026-03-28
**Phases:** 5 | **Plans:** 11

### What Was Built
- Session state detection with colored card borders (working/waiting/paused/archived)
- Terminal UX overhaul: send box in overlay, mobile special keys, message log
- Telegram notifications on state transitions and scroll-to-select prompts
- OOM prevention: heap caps, memory watchdog, orphan cleanup

### What Worked
- Parallel phase execution (Phase 13 + 14 ran independently after Phase 12)
- Decimal phase insertion (13.1) for discovered mobile UX needs without disrupting numbering
- Pattern matching for session state (tmux capture-pane + regex) — simple and reliable

### What Was Inefficient
- REQUIREMENTS.md traceability table wasn't updated as phases completed (TUIX/TG still "Pending" despite shipped code)
- OOM phase (16) was inserted out of order — should have been 14.1 or similar

### Patterns Established
- Session state detection via tmux capture-pane is the canonical approach for all future state work
- Telegram bot runs in-process (no separate repo/process); env var no-op pattern
- visualViewport API for mobile keyboard handling

### Key Lessons
1. Keep traceability table in sync with phase completion — automate or check at phase end
2. Infrastructure phases (like OOM) should be inserted as decimal phases near related work, not appended

---

## Milestone: v2.0 — Project Control Plane

**Shipped:** 2026-03-25
**Phases:** 3 | **Plans:** 6

### What Was Built
- Tmux session liveness detection and send-keys API
- Smart send UI with next_action pre-fill and GSD command chips
- Full-screen xterm.js terminal overlay with node-pty WebSocket bridge

### What Worked
- node-pty as optional dependency — Railway-safe, doesn't crash on import failure
- noServer:true WebSocket pattern for dynamic path routing alongside existing WS
- Clean phase sequencing: backend wiring → send UI → terminal overlay

### What Was Inefficient
- Initial WS base URL logic was tricky for Railway mode (tunnel URL vs localhost) — required iteration

### Key Lessons
1. Optional dependencies (try/catch require) keep deployment-incompatible native modules safe
2. noServer:true WS with upgrade event routing is the pattern for multiple WS endpoints

---

## Milestone: v1.2 — GSD Stats & Live Data Pipeline

**Shipped:** 2026-03-23
**Phases:** 2 | **Plans:** 4

### What Was Built
- Agent data proxy through GSD_DATA_URL tunnel (Railway shows live local data)
- Server-side stats: next action, blockers, velocity, streak, estimated completion

### What Worked
- Proxy middleware pattern — clean, testable, transparent fallthrough to local DB
- TDD for proxy behavior tests caught GSD_DATA_URL module-level constant bug early

### Key Lessons
1. Move env var reads into createApp() (not module-level) for testability
2. Blocked-first sort is more useful than date sort for a developer dashboard

---

## Milestone: v1.1 — File Viewer & Card Enhancements

**Shipped:** 2026-03-21
**Phases:** 3 | **Plans:** 7

### What Was Built
- Version badge and live URL from PROJECT.md parsing
- File content endpoints for planning files
- Side drawer with 4 file tabs, full-screen markdown viewer

### What Worked
- react-markdown + remark-gfm + @tailwindcss/typography — zero custom markdown parsing
- File endpoint whitelist validation before resolution — clean error semantics

### Key Lessons
1. Parse metadata from existing files (PROJECT.md) instead of duplicating in config
2. requestText() vs request<T>() — keep text/plain and JSON fetch paths explicit

---

## Milestone: v1.0 — Foundation

**Shipped:** 2026-03-18
**Phases:** 3 | **Plans:** 9

### What Was Built
- Forked Claude Code Agent Monitor with GSD tab
- Backend readers for .planning/ files
- Frontend dashboard with project cards
- Railway deployment with cloudflared tunnel

### What Worked
- Fork approach — built complete v1.0 in one day by reusing existing boilerplate
- Configurable project list — scaled cleanly from day one

### Key Lessons
1. Fork + add tab is faster than standalone app for this kind of extension
2. Cloudflared tunnel with self-healing script is production-ready for local data exposure

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Timeline | Key Change |
|-----------|--------|-------|----------|------------|
| v1.0 | 3 | 9 | 1 day | Initial build |
| v1.1 | 3 | 7 | 1 day | File viewer layer |
| v1.2 | 2 | 4 | 2 days | Data pipeline + stats |
| v2.0 | 3 | 6 | 2 days | Terminal + tmux control |
| v2.1 | 5 | 11 | 3 days | Session intelligence + mobile + Telegram |

### Top Lessons (Verified Across Milestones)

1. Fork + extend is dramatically faster than greenfield for dashboard tools
2. Optional dependencies and env var no-op patterns keep deployments safe
3. Decimal phase insertion handles urgent/discovered work without disrupting roadmap
4. TDD catches env/config bugs that manual testing misses
5. Keep traceability tables in sync — they drift when phases ship fast
