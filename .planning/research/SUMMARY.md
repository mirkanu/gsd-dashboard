# Research Summary: v4.1 Chat Polish

**Domain:** Classifier accuracy, feedback UI, Claude Code + GSD output taxonomy
**Researched:** 2026-04-04
**Overall confidence:** HIGH

## Executive Summary

The v4.1 milestone goal is making the chat experience reliable enough that the terminal is rarely needed. Research identified the complete taxonomy of Claude Code terminal output (8 categories, 50+ sub-types) by examining live tmux captures, all GSD workflow source files, and Claude Code CLI behavior. The current classifier covers about 60% of output patterns -- 10+ sub-types currently leak through as visible TEXT when they should be HIDDEN, and the GSD banner/Next Up formats are not matched against their actual rendered forms.

The feedback loop design is straightforward: right-click/long-press on a message, select the correct type, persist the correction in a new `gsd_message_feedback` SQLite table, and immediately re-render. Corrections accumulate as evidence for pattern improvements. Rather than auto-generating regex patterns from feedback (complex and error-prone), the recommended approach keeps patterns in `classifierPatterns.js` and uses feedback data as input for manual or Claude-assisted pattern updates via `/gsd:quick`.

A quick win with high impact: adding `-J` to the existing `tmux capture-pane` call joins soft-wrapped lines. This single flag eliminates frequent duplicate/fragmented text messages caused by long Claude output lines split at terminal width. Combined with the 10+ missing HIDDEN patterns identified in the taxonomy, these two improvements alone will dramatically reduce chat noise.

The sole new client dependency is `@radix-ui/react-context-menu` (~8KB gzipped) for the feedback UI. Radix handles desktop right-click and mobile long-press natively.

## Key Findings

**Taxonomy:** 8 categories of terminal output identified: HIDDEN (Claude Code chrome -- 18 sub-types), STAGE_BANNER (GSD workflow markers -- 11 sub-types), CHECKPOINT (user action required -- 5 sub-types), COMPLETION (4 sub-types), ERROR (5 sub-types), TEXT (Claude's prose -- 10 sub-types), NEXT_UP (continuation blocks -- 6 sub-types, currently unrecognized), INTERACTIVE (selection UIs -- 5 sub-types, currently unrecognized).

**Critical classifier gaps:** `Update()` tool calls not matched. `Read N files (ctrl+o to expand)` not matched. Background task tree lines not matched. Selection UI chrome not matched. GSD banner format (`GSD right-triangle STAGE` with heavy horizontal rules) not matched. `Next Up` blocks not recognized as a distinct type.

**Stack:** One new client dep: `@radix-ui/react-context-menu`. Zero new server deps. One tmux flag (`-J`).

**Architecture:** Feedback table + expanded patterns in classifierPatterns.js. No PatternManager abstraction needed -- keep patterns in code, use feedback as evidence for updates.

**Critical pitfall:** Over-engineering the feedback-to-pattern pipeline. Keep it simple: store corrections, review manually, update patterns in code.

## Implications for Roadmap

Based on research, suggested phase structure:

1. **Foundation: tmux -J + Expand HIDDEN Patterns + Fix Banners** - One-line tmux fix, add 10+ missing HIDDEN patterns, fix GSD banner matching
   - Addresses: 80% of visible noise in chat
   - Avoids: Building feedback UI before baseline accuracy improves

2. **Feedback Pipeline: DB Schema + API + Auto-Reclassify** - New `gsd_message_feedback` table, POST/GET endpoints, PATCH reclassify endpoint
   - Addresses: Persistence for corrections, API contract for UI
   - Avoids: Building UI before backend exists

3. **Feedback UI: Context Menu + Send Confirmation** - Radix context menu on messages, type correction flow, optimistic send echo, instant Working status
   - Addresses: User-facing correction flow, send confirmation
   - Avoids: Building UI without working backend

4. **New Message Types + Pattern Refinement** - Add NEXT_UP type with tappable rendering, refine patterns using accumulated feedback data
   - Addresses: Actionable content rendering, evidence-based improvements
   - Avoids: Adding types before core accuracy is solid

**Phase ordering rationale:**
- Expanding HIDDEN patterns is the highest-impact, lowest-risk change -- ship first
- tmux `-J` is a zero-risk 1-line fix that compounds with pattern improvements
- Feedback backend must exist before UI is built
- New message types (NEXT_UP) are additive and can ship after core accuracy is solid
- Pattern refinement is last because it benefits from real feedback data

**Research flags for phases:**
- Phase 1: Standard patterns, unlikely to need research. Full pattern list in FEATURES.md taxonomy.
- Phase 2: Standard CRUD API, no research needed
- Phase 3: Radix context menu well-documented, low research risk
- Phase 4: Needs real feedback data to drive pattern improvements

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Taxonomy | HIGH | Verified against live tmux captures + all GSD source files |
| Stack | HIGH | Single new dep (Radix), proven ecosystem |
| Features | HIGH | Feedback loop is well-understood UX pattern |
| Architecture | HIGH | Extends existing db.js and classifierPatterns.js |
| Pitfalls | MEDIUM | Some edge cases in pattern matching (false positives on prose) |

## Gaps to Address

- Exact behavior of `-J` flag with diffLines() overlap matching (test before shipping)
- Whether multi-line grouped messages (consecutive TEXT) interact poorly with new patterns
- How to handle the interactive selection UI in chat (hide entirely? or render as a special type?)
- Checkpoint box parsing: currently only `YOUR ACTION:` line matched, not the full multi-line box
- Whether `bullet Step N:` should be STAGE_BANNER or remain TEXT (user preference question)
