# Phase 33: Classifier Foundation - Research

**Researched:** 2026-04-03
**Domain:** Regex-based terminal output classification for tmux-captured Claude Code sessions
**Confidence:** HIGH

## Summary

Phase 33 addresses three specific, well-scoped problems in the classifier pipeline: (1) tmux line wrapping causes fragmented messages, (2) 10+ output types leak through as TEXT because patterns are missing, and (3) GSD banners using heavy horizontal rules are not recognized. All three are solved with targeted changes to two files (`tmux.js` and `classifierPatterns.js`) plus expanded test fixtures.

The `-J` flag fix in `tmux.js` is a one-line change but must be done FIRST because it changes the shape of classifier input -- all subsequent pattern work depends on receiving properly joined lines. The pattern additions are purely additive (new regex entries in existing pattern groups) with zero risk to existing classifications. The GSD banner fix requires new patterns for the `━━━` heavy rule lines and the `GSD ►` prefix line.

**Primary recommendation:** Fix `-J` flag first, then add missing HIDDEN patterns, then add STAGE_BANNER patterns. Test each step with expanded fixtures derived from FEATURES.md taxonomy.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CLS-01 | tmux capture-pane uses `-J` flag to join soft-wrapped lines | One-line fix in `capturePaneText()` at tmux.js:28 -- add `-J` to args array |
| CLS-02 | 10+ missing HIDDEN patterns added | FEATURES.md Category 1 has exact patterns for Update(), collapsed read summaries, task tree lines, selection UI chrome, session rating, diff summaries, listed directories |
| CLS-03 | GSD banner format correctly matched with heavy rules and GSD prefix | ui-brand.md defines exact format: `━━━` lines + `GSD ► STAGE` between them |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| strip-ansi | (already installed) | Remove ANSI escape codes before regex matching | Already in use, well-tested |
| node:test | built-in | Test runner | Already in use for all server tests |
| node:assert/strict | built-in | Test assertions | Already in use |

### Supporting
No new libraries needed. All changes are to existing regex patterns and a single tmux flag.

### Alternatives Considered
None -- this is purely a pattern expansion and flag fix in existing code.

## Architecture Patterns

### Current Classifier Architecture (DO NOT CHANGE)
```
tmux.js:capturePaneText()     -- captures raw pane text
  → classifier.js:poll()      -- diffs against previous snapshot
    → classifierPatterns.js:classifyChunks()  -- splits into lines, classifies each
      → classifierPatterns.js:classifyLine()  -- first-match-wins against PATTERNS array
    → classifier.js:groupConsecutiveText()    -- merges consecutive TEXT chunks
  → DB insert + WebSocket broadcast
```

### Pattern Group Structure (existing, extend it)
```javascript
// PATTERNS array in classifierPatterns.js -- priority-ordered, first match wins
// Group order: hidden tool calls > hidden tool output > hidden chrome > 
//              stage banners > errors > completions > checkpoints > hidden working
```

### Where Each Requirement Maps to Code

**CLS-01 (-J flag):**
- File: `server/gsd/tmux.js`, line 28
- Current: `['capture-pane', '-p', '-t', sessionName]`
- Change to: `['capture-pane', '-p', '-J', '-t', sessionName]`

**CLS-02 (missing HIDDEN patterns):**
- File: `server/gsd/classifierPatterns.js`
- Add to existing HIDDEN pattern groups (lines 23-54)

**CLS-03 (GSD banner patterns):**
- File: `server/gsd/classifierPatterns.js`
- Add to existing STAGE_BANNER group (lines 57-65)

### Anti-Patterns to Avoid
- **Do not restructure the PATTERNS array** -- just add entries to existing groups
- **Do not add new message types** -- NEXT_UP is Phase 36 scope (CLS-04)
- **Do not change classifyLine() logic** -- the first-match-wins engine works correctly
- **Do not add stateful/multi-line classification** -- keep it line-by-line for now

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ANSI stripping | Custom regex | strip-ansi (already used) | Edge cases with OSC sequences |
| Line joining | Custom buffer logic | tmux `-J` flag | tmux handles it natively, zero code |
| Unicode character matching | ASCII approximations | Direct Unicode chars in regex | The actual terminal output uses these exact chars |

## Common Pitfalls

### Pitfall 1: Adding -J Changes Existing Diff Behavior
**What goes wrong:** The `-J` flag joins wrapped lines, meaning the same pane content now has FEWER lines with LONGER content. The `diffLines()` overlap matching (last 3 lines of previous snapshot) may fail to match because line boundaries shifted.
**Why it happens:** Previous snapshot was captured without `-J`, new one with `-J`. The 3-line needle from the old format will not match in the new format.
**How to avoid:** After adding `-J`, clear all snapshots (restart the server). The `this.snapshots` Map in TmuxClassifier will naturally reset on restart. No code change needed -- just document that a server restart is required after deployment.
**Warning signs:** Burst of duplicate messages in chat right after deploy.

### Pitfall 2: Heavy Rule Lines Match Too Broadly
**What goes wrong:** Pattern for `━━━` heavy horizontal rule matches lines in markdown content or other decorative output, false-positiving as STAGE_BANNER.
**Why it happens:** `━` (U+2501 BOX DRAWINGS HEAVY HORIZONTAL) is distinctive but could appear in other contexts.
**How to avoid:** Require the line to be PREDOMINANTLY heavy-rule characters. Pattern: `/^[━]{10,}$/` (10+ consecutive heavy-dash, nothing else on the line). This is safe because no prose line would be all `━`.
**Warning signs:** Non-banner lines classified as STAGE_BANNER.

### Pitfall 3: Unicode Characters Not Matching Due to Encoding
**What goes wrong:** Patterns like `/^●\s+Update/` fail because the `●` character arrives as a different byte sequence or is stripped by strip-ansi.
**Why it happens:** tmux locale mismatch (see PITFALLS.md Pitfall 9). Also, Claude Code may use different Unicode bullet variants.
**How to avoid:** Test with actual captured output. Include the exact Unicode characters from real captures in test fixtures. Add fallback ASCII-safe patterns for critical matches (e.g., also match `Update(` without requiring the bullet prefix).
**Warning signs:** Patterns that pass in tests but miss in production captures.

### Pitfall 4: Pattern Order Sensitivity for New Entries
**What goes wrong:** A new HIDDEN pattern accidentally matches content that should be TEXT or STAGE_BANNER, because HIDDEN groups are checked first.
**Why it happens:** First-match-wins with HIDDEN having highest priority means overly broad HIDDEN patterns swallow everything.
**How to avoid:** Every new HIDDEN pattern must be tested against the existing `textSamples` and `stageBannerSamples` fixtures to ensure no false positives. Add negative test cases.
**Warning signs:** Text samples suddenly classified as HIDDEN after pattern additions.

## Code Examples

### CLS-01: The -J Flag Fix
```javascript
// server/gsd/tmux.js line 28
// BEFORE:
execFileSync('tmux', ['capture-pane', '-p', '-t', sessionName], { encoding: 'utf8', timeout: 2000 });
// AFTER:
execFileSync('tmux', ['capture-pane', '-p', '-J', '-t', sessionName], { encoding: 'utf8', timeout: 2000 });
```

### CLS-02: Missing HIDDEN Patterns to Add

Based on FEATURES.md Category 1 gap analysis:

```javascript
// Add to the "bullet tool calls" hidden group:
/^●\s+Update\(/,                          // ● Update(.planning/PROJECT.md)

// Add new hidden group for collapsed summaries and chrome:
{
  type: MESSAGE_TYPES.HIDDEN,
  patterns: [
    /^Read \d+ files?\s/,                  // Read 3 files (ctrl+o to expand)
    /^Listed \d+ director/,                // Listed 1 directory (ctrl+o to expand)
    /^Added \d+ lines/,                    // Added 15 lines, removed 3 lines
    /^[├└]/,                               // Background task tree lines (box-drawing)
    /^Enter to select/,                    // Selection UI navigation hint
    /How is Claude doing/,                 // Session feedback prompt
    /ctrl\+o to expand/,                   // Any collapsed output with ctrl+o hint
    /^\s*\d+\.\s*\[[ x]\]/,              // Numbered checkbox items: 1. [ ] Option
    /^[◀◁←]\s.*[▶▷→]\s/,                 // Checkbox/submit navigation bar
  ],
}
```

### CLS-03: GSD Banner Patterns to Add

Based on ui-brand.md exact format:

```javascript
// Add to STAGE_BANNER group:
/^[━]{10,}$/,                              // Heavy horizontal rule line (━━━━━━━━━)
/GSD\s*[►▶]\s*\w/,                        // GSD ► RESEARCHING (the actual banner text)
/^●\s*Step\s+\d+/,                        // ● Step 7: Commit and Tag
/^[╔╚╗╝║═]{2,}/,                          // Checkpoint/error box borders
/^[─]{10,}$/,                              // Light horizontal rule (Next Up separator)
```

### Test Fixture Additions

```javascript
// New samples to add to tmux-samples.js

const hiddenChromeSamples = [
  '● Update(.planning/PROJECT.md)',
  'Read 3 files (ctrl+o to expand)',
  'Listed 1 directory (ctrl+o to expand)',
  'Added 15 lines, removed 3 lines',
  '├ Stack research v4.1',
  '└ Pitfalls research v4.1',
  'Enter to select · up/down to navigate · Esc to cancel',
  'How is Claude doing this session? (optional)',
  '1. [ ] Trust all tools',
  '2. [x] Selected option',
];

const gsdBannerSamples = [
  '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  'GSD ► RESEARCHING',
  'GSD ► EXECUTING WAVE 1',
  'GSD ► PHASE 33 COMPLETE ✓',
  '● Step 7: Commit and Tag',
  '╔══════════════════════════════════════════════════════════════╗',
  '╚══════════════════════════════════════════════════════════════╝',
  '──────────────────────────────────────────────────────────────',
];
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No `-J` flag | Add `-J` to join wrapped lines | This phase | Eliminates fragmented messages from line wrapping |
| ~12 HIDDEN patterns | ~22+ HIDDEN patterns | This phase | Catches 10+ leaking sub-types |
| No GSD banner recognition | Match `━━━` rules + `GSD ►` prefix | This phase | Banners render as section headers, not plain text |

## Open Questions

1. **Box-drawing characters for checkpoint borders**
   - What we know: Checkpoints use `╔═╗║╚═╝` double-line box characters per ui-brand.md
   - What's unclear: Should checkpoint box BORDERS be classified as CHECKPOINT or HIDDEN? Currently only `YOUR ACTION:` line triggers CHECKPOINT.
   - Recommendation: Classify box border lines as HIDDEN (they are chrome), keep only content lines as CHECKPOINT. This is consistent with how we treat other chrome.

2. **`GSD ►` line classification scope**
   - What we know: The `GSD ► STAGE` line appears between two `━━━` heavy rule lines
   - What's unclear: Should the heavy rule lines be STAGE_BANNER (rendered) or HIDDEN (suppressed)?
   - Recommendation: Classify heavy rule lines as STAGE_BANNER so they can be rendered as visual separators in the chat UI. The renderer can choose how to display them.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (built-in, Node.js) |
| Config file | None needed -- uses `node --test` |
| Quick run command | `node --test server/__tests__/classifier.test.js` |
| Full suite command | `npm run test:server` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CLS-01 | `-J` flag added to capture-pane call | unit | `node --test server/__tests__/tmux.test.js` | Partial (tmux.test.js exists but tests mock tmux) |
| CLS-02 | 10+ new HIDDEN patterns classify correctly | unit | `node --test server/__tests__/classifier.test.js` | Yes -- extend fixture validation |
| CLS-03 | GSD banner patterns classify as STAGE_BANNER | unit | `node --test server/__tests__/classifier.test.js` | Yes -- extend fixture validation |

### Sampling Rate
- **Per task commit:** `node --test server/__tests__/classifier.test.js`
- **Per wave merge:** `npm run test:server`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] Add `hiddenChromeSamples` array to `server/__tests__/fixtures/tmux-samples.js`
- [ ] Add `gsdBannerSamples` array to `server/__tests__/fixtures/tmux-samples.js`
- [ ] Add fixture validation tests for new sample arrays in `classifier.test.js`
- [ ] Add negative test cases (text samples that should NOT match new HIDDEN patterns)

## Sources

### Primary (HIGH confidence)
- `server/gsd/classifierPatterns.js` -- current PATTERNS array, exact gap analysis
- `server/gsd/tmux.js` -- current `capturePaneText()` without `-J` flag
- `server/gsd/classifier.js` -- TmuxClassifier diff/group/persist logic
- `.planning/research/FEATURES.md` -- complete taxonomy of 50+ output types with exact patterns
- `.planning/research/PITFALLS.md` -- tmux `-J` flag details, pattern pitfalls
- `/data/home/.claude/get-shit-done/references/ui-brand.md` -- exact GSD banner format specification
- `server/__tests__/classifier.test.js` -- existing test structure
- `server/__tests__/fixtures/tmux-samples.js` -- existing fixture samples

### Secondary (MEDIUM confidence)
- tmux man page documentation of `-J` flag behavior
- [tmux issue #2688](https://github.com/tmux/tmux/issues/2688) -- `-J` flag line joining behavior

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new libraries, purely extending existing code
- Architecture: HIGH - no structural changes, only additive pattern entries + one flag
- Pitfalls: HIGH - verified against real captures and existing PITFALLS.md research

**Research date:** 2026-04-03
**Valid until:** 2026-05-03 (stable domain -- regex patterns and tmux flags do not change rapidly)
