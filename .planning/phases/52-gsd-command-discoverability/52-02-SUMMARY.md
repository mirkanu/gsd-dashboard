---
phase: 52
plan: "02"
subsystem: client/ui
tags: [mobile, chips, discoverability, terminal-overlay]
dependency_graph:
  requires: []
  provides: [CommandChips wired in TerminalOverlay mobile section, /gsd-next chip as first shortcut]
  affects: [client/src/pages/GSD.tsx]
tech_stack:
  added: []
  patterns: [fire-and-forget chip onSelect, readonly const spread to mutable array prop]
key_files:
  modified:
    - client/src/pages/GSD.tsx
decisions:
  - CommandChips renders unconditionally inside isMobile gate (not behind !terminalFocused) so chips remain tappable even when terminal has focus
  - Spread GSD_CHIPS into plain string[] via [...GSD_CHIPS] to satisfy commands: string[] prop (const array is readonly)
  - aria-label on wrapping div, not on CommandChips itself (CommandChips owns the inner div)
  - onSelect is fire-and-forget — no loading/sent/error state added per UI-SPEC
metrics:
  duration: "~5 minutes"
  completed: "2026-05-09T08:26:46Z"
  tasks_completed: 1
  files_modified: 1
---

# Phase 52 Plan 02: Wire CommandChips into TerminalOverlay Summary

**One-liner:** Wire pre-built CommandChips component into the mobile TerminalOverlay with /gsd-next as the first chip, enabling one-tap GSD command shortcuts above the tmux send input.

## What Was Done

Added the CommandChips shortcut button row to the mobile section of TerminalOverlay in `client/src/pages/GSD.tsx`. Three targeted edits were made:

1. **Import added** — `CommandChips` imported from `../components/CommandChips` (after existing imports on line 28).
2. **GSD_CHIPS updated** — `/gsd-next` prepended as index 0 of the existing four-command array, giving it maximum discoverability on mobile.
3. **JSX wired** — `CommandChips` rendered unconditionally inside the `isMobile` gate (not behind `!terminalFocused`), wrapped in a `div` with `aria-label="GSD command shortcuts"`. The `onSelect` callback fires `api.gsd.send(projectName, cmd)` — same send path as SendBox.

## Commits

| Task | Description | Hash | Files |
|------|-------------|------|-------|
| 1 | Add /gsd-next chip and wire CommandChips in TerminalOverlay | e2c3f4d | client/src/pages/GSD.tsx |

## Verification

- `grep -n "gsd-next" GSD.tsx` — line 100: "/gsd-next" as first array element ✓
- `grep -n 'import.*CommandChips' GSD.tsx` — exactly one import line ✓
- `grep -n 'CommandChips' GSD.tsx` — import + JSX render both present ✓
- `grep -n 'aria-label="GSD command shortcuts"' GSD.tsx` — exactly one match ✓
- `grep -n 'api.gsd.send(projectName, cmd)' GSD.tsx` — one match ✓
- `npm run test:client` — 144 tests, 18 test files, all passed ✓
- `npm run build` — exits 0 ✓

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — CommandChips is fully wired to `api.gsd.send`; no placeholder data.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. The chip click path uses the same `api.gsd.send` trust boundary as the existing SendBox — already accepted as T-52-04 in the plan's threat model.

## Self-Check: PASSED

- File exists: `client/src/pages/GSD.tsx` — FOUND
- Commit e2c3f4d exists — FOUND
- All acceptance criteria verified via grep output above
