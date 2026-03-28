# Milestones

## v2.1 Session Intelligence & Terminal UX (Shipped: 2026-03-28)

**Phases:** 12, 13, 13.1, 14, 16 (5 phases, 11 plans)
**Timeline:** 2026-03-26 → 2026-03-28 (3 days)

**Key accomplishments:**
- Session state detection (working/waiting/paused/archived) with colored card borders and labels
- Archive/unarchive projects in-app; summary stats row with state counts
- Terminal UX overhaul: send box moved into overlay, mobile keyboard-push fix, touch scroll
- Mobile terminal polish: special key bar, full-screen send input, message log with chat-style UI
- Telegram notifications on session state transitions with scroll-to-select detection
- OOM prevention: 1GB heap caps, memory watchdog, orphan process cleanup

---

## v2.0 Project Control Plane (Shipped: 2026-03-25)

**Phases:** 9-11 (3 phases, 6 plans)
**Timeline:** 2026-03-24 → 2026-03-25 (2 days)

**Key accomplishments:**
- Tmux backend wiring: session liveness detection, send-keys endpoint, tmuxActive field
- Smart send UI: next_action pre-fill from STATE.md, GSD command chips
- Full-screen xterm.js terminal overlay with node-pty WebSocket bridge and live I/O

---

## v1.2 GSD Stats & Live Data Pipeline (Shipped: 2026-03-23)

**Phases:** 7-8 (2 phases, 4 plans)
**Timeline:** 2026-03-22 → 2026-03-23 (2 days)

**Key accomplishments:**
- Agent data proxy through GSD_DATA_URL tunnel — Railway shows live local session data
- Server-side stats: next action, blockers, velocity, streak, estimated completion
- Blocked-first sort and blocked badge on project cards

---

## v1.1 File Viewer & Card Enhancements (Shipped: 2026-03-21)

**Phases:** 4-6 (3 phases, 7 plans)
**Timeline:** 2026-03-21 (1 day)

**Key accomplishments:**
- Version badge and live URL on project cards, parsed from PROJECT.md
- File content endpoints for planning files (state, roadmap, requirements, active plan)
- Side drawer with 4 file tabs and inline markdown rendering
- Full-screen markdown viewer with GFM tables and checkboxes

---

## v1.0 Foundation (Shipped: 2026-03-18)

**Phases:** 1-3 (3 phases, 9 plans)
**Timeline:** 2026-03-18 (1 day)

**Key accomplishments:**
- Forked Claude Code Agent Monitor; added GSD tab to React UI
- Backend readers for .planning/ files (ROADMAP, STATE, REQUIREMENTS, phases)
- /api/gsd/projects endpoint with configurable project list
- Frontend dashboard with project cards, phase progress, status badges
- Railway deployment with cloudflared tunnel for local GSD data

---
