---
phase: 36-message-rendering-new-types
plan: 01
subsystem: api
tags: [classifier, regex, typescript, message-types]

requires:
  - phase: 33-classifier-fixes
    provides: classifier pattern infrastructure and priority ordering
provides:
  - NEXT_UP message type in classifier (MESSAGE_TYPES.NEXT_UP)
  - next_up in TypeScript MessageType union
  - 6 regex patterns for Next Up block detection
  - 8 classifier tests for NEXT_UP
affects: [36-02, message-rendering, chat-ui]

tech-stack:
  added: []
  patterns: [classifier priority ordering - specific patterns before generic ones]

key-files:
  created: []
  modified:
    - server/gsd/classifierPatterns.js
    - client/src/lib/types.ts
    - client/src/components/ChatMessageRenderer.tsx
    - server/__tests__/classifier.test.js

key-decisions:
  - "NEXT_UP patterns placed before STAGE_BANNER for correct priority (Execute: `/gsd:...` must match next_up not stage_banner)"
  - "Backtick-wrapped /gsd pattern uses [^`]+ instead of \\S+ to handle commands with arguments containing spaces"

patterns-established:
  - "Classifier priority: more-specific message types before broader ones"

requirements-completed: [CLS-04]

duration: 10min
completed: 2026-04-05
---

# Phase 36 Plan 01: NEXT_UP Classifier Type Summary

**Added NEXT_UP classifier type with 6 regex patterns for detecting Next Up command blocks, GSD suggestions, and Also Available sections**

## Performance

- **Duration:** 10 min
- **Started:** 2026-04-05T00:12:14Z
- **Completed:** 2026-04-05T00:22:14Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- NEXT_UP added as recognized classifier type with 6 patterns covering headers, commands, bullets, and Also Available blocks
- TypeScript MessageType union updated with 'next_up' and label map extended
- 8 new tests covering all NEXT_UP classification behaviors with zero regressions (36 total tests pass)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add NEXT_UP classifier patterns and TypeScript type** - `879658d` (feat)
2. **Task 2: Add NEXT_UP classifier tests** - `71ec033` (test)

## Files Created/Modified
- `server/gsd/classifierPatterns.js` - Added NEXT_UP to MESSAGE_TYPES, 6 patterns in PATTERNS array, reordered priority
- `client/src/lib/types.ts` - Added 'next_up' to MessageType union
- `client/src/components/ChatMessageRenderer.tsx` - Added 'Next Up' to MESSAGE_TYPE_LABELS
- `server/__tests__/classifier.test.js` - Added 8 NEXT_UP classification tests

## Decisions Made
- Moved NEXT_UP group before STAGE_BANNER in priority ordering so `Execute: \`/gsd:...\`` matches next_up instead of stage_banner's generic `EXECUTE:` pattern
- Used `[^`]+ ` instead of `\S+` in backtick-wrapped /gsd pattern to handle commands with space-separated arguments

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed backtick-wrapped /gsd pattern and priority ordering**
- **Found during:** Task 2 (NEXT_UP classifier tests)
- **Issue:** `\S+` in backtick pattern stopped at spaces, failing to match `/gsd:execute-phase 36`. Also, STAGE_BANNER's `EXECUTE:` pattern caught `Execute: \`/gsd:...\`` before NEXT_UP could match.
- **Fix:** Changed pattern to `[^`]+` and moved NEXT_UP group before STAGE_BANNER in PATTERNS array.
- **Files modified:** server/gsd/classifierPatterns.js
- **Verification:** All 36 tests pass
- **Committed in:** 71ec033 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Fix was necessary for correct classification. No scope creep.

## Issues Encountered
None beyond the pattern fix documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- NEXT_UP type is ready for Phase 36 Plan 02 to build the UI rendering component
- Classifier correctly identifies all Next Up block patterns
- TypeScript types are in place for frontend consumption

---
*Phase: 36-message-rendering-new-types*
*Completed: 2026-04-05*
