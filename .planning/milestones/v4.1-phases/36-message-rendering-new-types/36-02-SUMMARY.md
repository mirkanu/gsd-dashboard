---
phase: 36-message-rendering-new-types
plan: 02
subsystem: ui
tags: [react, markdown, react-markdown, remark-gfm, chat-rendering, command-chips]

requires:
  - phase: 36-message-rendering-new-types
    provides: NEXT_UP classifier type and TypeScript MessageType union
provides:
  - NextUpCard component with tappable /gsd: command chips
  - Markdown rendering for inbound TEXT messages via ReactMarkdown
  - Terminal content detection heuristic for monospace rendering
affects: [chat-ui, message-rendering]

tech-stack:
  added: []
  patterns: [terminal detection heuristic using box-drawing chars and indentation ratio]

key-files:
  created:
    - client/src/components/NextUpCard.tsx
  modified:
    - client/src/components/ChatMessageRenderer.tsx

key-decisions:
  - "Terminal detection checks box-drawing characters (>=2 lines) and indentation ratio (>60%) before falling back to markdown"
  - "Outbound (user) messages remain plain text; only inbound (Claude) messages get markdown rendering"

patterns-established:
  - "Content-aware rendering: terminal heuristic first, then markdown fallback for inbound messages"

requirements-completed: [CLS-04, REND-01, REND-02]

duration: 5min
completed: 2026-04-05
---

# Phase 36 Plan 02: Rich Message Rendering Summary

**NextUpCard with tappable command chips, ReactMarkdown for Claude messages, and terminal-detection heuristic for monospace content**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-05T00:26:51Z
- **Completed:** 2026-04-05T00:31:51Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- NextUpCard component extracts /gsd: commands and renders them as tappable CommandChips in a visually distinct card
- Inbound TEXT messages now render markdown formatting (headers, bold, lists, code blocks, tables) via ReactMarkdown with GFM
- Terminal-formatted content (box-drawing characters, heavy indentation) renders in monospace preserving alignment
- NEXT_UP messages integrated into ChatMessageRenderer switch statement

## Task Commits

Each task was committed atomically:

1. **Task 1: Create NextUpCard component** - `f4a3164` (feat)
2. **Task 2: Update ChatMessageRenderer for markdown TEXT, terminal detection, and NEXT_UP** - `4fd46c3` (feat)

## Files Created/Modified
- `client/src/components/NextUpCard.tsx` - Card component extracting /gsd: commands and rendering with CommandChips
- `client/src/components/ChatMessageRenderer.tsx` - Added markdown rendering, terminal detection, and NEXT_UP case

## Decisions Made
- Terminal detection uses box-drawing character count (>=2 lines) and indentation ratio (>60% of lines with 2+ leading spaces) as heuristics
- Outbound messages kept as plain text to avoid rendering user input as markdown

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All Phase 36 plans complete - message rendering with new types fully implemented
- Classifier detects NEXT_UP messages and UI renders them as actionable cards
- Markdown and terminal rendering active for all inbound TEXT messages

---
*Phase: 36-message-rendering-new-types*
*Completed: 2026-04-05*
