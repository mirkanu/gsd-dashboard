# Domain Pitfalls: Classifier Accuracy & Feedback Auto-Fix

**Domain:** Adaptive text classifier with user feedback loop for tmux output
**Researched:** 2026-04-04
**Context:** GSD Dashboard v4.1 — improving tmux output classification accuracy via user corrections

---

## Critical Pitfalls

Mistakes that cause rewrites, data corruption, or broken user trust.

### Pitfall 1: Feedback Loop Positive Reinforcement Spiral

**What goes wrong:** User corrects a misclassified message (e.g., marks "text" as "hidden"). System adds a pattern to suppress that content. The new pattern is overly broad and starts hiding legitimate messages the user never sees — so they never correct it. False negatives accumulate silently.

**Why it happens:** The classifier only receives "this is wrong" feedback, never "this is right" confirmation. Hidden messages are invisible by definition, so false-hidden classifications create an unrecoverable blind spot.

**Consequences:** Chat window progressively loses content. User loses trust in the chat view. They fall back to the terminal, defeating the purpose of v4.0.

**Prevention:**
- Never auto-generate HIDDEN patterns from user feedback. Only allow reclassification between visible types (text, stage_banner, checkpoint, completion, error).
- If a user flags a message as "should be hidden," store it as a suppression rule keyed to the exact content string (not a regex). Require manual review before promoting to a regex pattern.
- Add a "recently hidden" debug view (admin-only) that shows what the classifier suppressed in the last N polls, so silent false negatives become visible.

**Detection:** Monitor the ratio of hidden-to-visible messages per project. If hidden ratio suddenly increases after a pattern update, flag it.

**Confidence:** HIGH — this is a well-documented problem in adaptive filtering systems.

### Pitfall 2: tmux capture-pane Line Wrapping Breaks Regex Anchors

**What goes wrong:** Current patterns use `^` anchors heavily (e.g., `^#{1,3}\s+Phase`, `^Error:`). When tmux wraps a long line at the pane width boundary (typically 80 or 120 columns), the continuation fragment starts on a new line without the expected prefix. The regex misses the match entirely, or worse, the fragment matches the wrong pattern.

**Why it happens:** `tmux capture-pane -p` wraps output at the pane width by default. Claude Code output lines (especially error messages, file paths, and tool invocations) frequently exceed 80 characters. The system currently does not use the `-J` flag to join wrapped lines.

**Consequences:** 
- Error messages split across lines: `"Error: ENOENT: no such file or directory, open '/very/long/path/to/some/deeply/nested/fi"` on line 1, `"le.js'"` on line 2. The second fragment becomes orphan "text."
- Tool calls like `Read(server/gsd/some-very-long-filename-that-wraps.js)` break mid-line, and the continuation is not caught by the hidden-tool-call pattern.
- Stage banners with long phase names get split.

**Prevention:**
- Use `tmux capture-pane -p -J` to join wrapped lines. The `-J` flag joins any line that was wrapped by the terminal width into a single logical line. This is the single highest-impact fix.
- Alternatively, increase the tmux pane width to a large value (e.g., 250 columns) when creating sessions, so wrapping rarely occurs.
- After adding `-J`, re-run classifier tests with samples > 120 chars to verify anchors still work.

**Detection:** Check if any captured lines end without a newline or are suspiciously short (< 10 chars) following a long line.

**Confidence:** HIGH — verified via [tmux issue #2688](https://github.com/tmux/tmux/issues/2688) and tmux man page documentation of `-J` flag.

### Pitfall 3: Diff Algorithm Misses Content on Fast Scroll

**What goes wrong:** The `diffLines()` method in `classifier.js` finds new content by matching the last 3 lines of the previous snapshot against the current capture. When Claude produces output faster than the polling interval, the entire previous snapshot scrolls off-screen. The method falls back to returning ALL current lines, causing duplicate messages in the chat.

**Why it happens:** `tmux capture-pane -p` only returns the visible pane (typically ~50 lines). During tool-heavy phases, Claude can produce hundreds of lines between polls. The overlap needle is gone.

**Consequences:** 
- Duplicate messages appear in chat when the "no overlap found" fallback fires.
- The same error or stage banner shows up 2-3 times.
- Users lose trust in message deduplication.

**Prevention:**
- Use `tmux capture-pane -p -S -500` (or similar) to capture scrollback history, not just the visible pane. This increases the overlap search space.
- Add content-hash deduplication: before inserting a classified message, check if a message with identical `project + content + message_type` was inserted in the last N seconds. Skip if duplicate.
- Track a monotonic sequence number or timestamp watermark per project rather than relying on line-content matching.

**Detection:** Query `gsd_messages` for consecutive rows with identical content within 5 seconds.

**Confidence:** HIGH — directly visible in current code at `classifier.js:100-103`.

### Pitfall 4: Race Condition in Pattern Updates from Feedback

**What goes wrong:** User submits a correction while the classifier is mid-poll. If patterns are stored in a mutable shared object (like the current `PATTERNS` array), a mid-iteration modification causes unpredictable behavior — skipped patterns, double-matches, or crashes.

**Why it happens:** Node.js is single-threaded but the event loop interleaves I/O callbacks. A feedback API handler modifying the patterns array between `for...of` iterations in `classifyLine()` can corrupt iteration state.

**Consequences:** Intermittent misclassifications that are impossible to reproduce. In the worst case, an exception in the classifier loop stops all message processing for all projects.

**Prevention:**
- Store user patterns in SQLite, not in the in-memory `PATTERNS` array.
- Load user patterns at the START of each poll cycle (snapshot), not on every line. This gives atomic reads.
- The built-in `PATTERNS` array stays immutable (hardcoded defaults). User overrides are a separate layer checked after defaults.
- Use a "generation" counter: bump on every pattern update, and each poll cycle locks to a generation.

**Detection:** Add a try-catch around the classify loop (already somewhat present) and log pattern-count mismatches.

**Confidence:** HIGH — standard concurrent-modification issue in event-loop systems.

---

## Moderate Pitfalls

### Pitfall 5: ANSI Escape Code Residue After strip-ansi

**What goes wrong:** `strip-ansi` handles standard SGR sequences (colors, bold, etc.) but can fail on:
- OSC (Operating System Command) sequences used by modern terminals for hyperlinks (`\x1b]8;;url\x07text\x1b]8;;\x07`)
- Incomplete escape sequences from tmux line-wrap truncation
- Bracketed paste mode markers (`\x1b[200~` / `\x1b[201~`)
- sixel graphics data
- tmux's own control sequences when running in control mode

**Prevention:**
- Run a secondary cleanup regex after `strip-ansi`: `/\x1b(?:\][^\x07]*\x07|\[[\x20-\x3f]*[\x40-\x7e])/g` to catch OSC and remaining CSI sequences.
- Add a test case with real captured output from Claude Code sessions containing hyperlinks (Claude sometimes outputs clickable file paths).
- Test with `tmux capture-pane -e` output (which explicitly includes escapes) to verify stripping handles everything.

**Confidence:** MEDIUM — `strip-ansi` handles the majority of cases. Edge cases are real but infrequent.

### Pitfall 6: Mobile Long-Press Conflicts with Text Selection and Native Menu

**What goes wrong:** On iOS Safari, long-press triggers BOTH the custom context menu AND the native text selection / callout menu. The user sees their selection handles plus the custom menu overlapping, or the native "Copy/Look Up/Share" menu covers the custom one.

**Why it happens:** iOS Safari fires `contextmenu` event inconsistently. On some versions it fires, on others it does not. The native callout (`-webkit-touch-callout`) and text selection (`user-select`) behaviors are separate from the JS event system.

**Consequences:** Broken UX on mobile — the primary platform for this user (accesses via Railway URL on phone).

**Prevention:**
- Apply CSS to chat message elements: `-webkit-touch-callout: none; -webkit-user-select: none; user-select: none;` on the message bubble wrapper.
- Use `touchstart`/`touchend` timer (300-500ms threshold) instead of relying on the `contextmenu` event for mobile detection.
- Show a bottom sheet / action sheet pattern on mobile instead of a positioned dropdown. This avoids edge-positioning issues and feels native on mobile.
- Detect touch vs. mouse via `window.matchMedia('(pointer: coarse)')` and render different UI accordingly.
- IMPORTANT: Only apply `user-select: none` to the message wrapper during long-press detection. After the context menu appears, re-enable selection so users can still copy message text via the custom menu's "Copy" action.

**Detection:** Test on actual iOS Safari (not just Chrome DevTools mobile emulation). The behavior differs significantly.

**Confidence:** HIGH — verified via [Radix UI discussion #930](https://github.com/radix-ui/primitives/discussions/930) and [iOS-specific long-press issues](https://github.com/minwork/use-long-press/issues/7).

### Pitfall 7: Context Menu Positioning at Screen Edges

**What goes wrong:** Right-click near the bottom or right edge of the viewport places the context menu partially off-screen. On mobile, if the menu appears at the long-press coordinates, it can overflow the viewport entirely.

**Prevention:**
- Calculate menu dimensions and flip direction when near edges (standard tooltip/popover logic).
- On mobile: use a fixed-position bottom sheet instead of a positioned dropdown. Avoids the problem entirely.
- Use `position: fixed` with viewport bounds clamping, not `position: absolute` relative to the message.

**Confidence:** HIGH — standard UI pattern, well-documented.

### Pitfall 8: Overfitting User Corrections to Transient Patterns

**What goes wrong:** User corrects a message that contained a one-time unusual format (e.g., Claude wrote "ERROR: let me fix that" as conversational text, not an actual error). The system learns a pattern that suppresses future real errors matching a similar substring.

**Why it happens:** Single corrections are treated as universal rules. No frequency threshold or scope restriction.

**Prevention:**
- Require N corrections (e.g., 3) of the same reclassification before auto-generating a pattern. Store individual corrections as pending until threshold is met.
- Scope corrections: a correction on project X does not automatically apply to project Y. Allow manual promotion to global.
- Store corrections as exact-match overrides first. Only graduate to regex patterns via manual review.
- Add an "undo" action on corrections with a visible history.

**Confidence:** HIGH — fundamental machine learning principle (don't overfit to single examples).

### Pitfall 9: UTF-8 / Wide Character Corruption in capture-pane

**What goes wrong:** tmux's capture-pane can output garbled characters when the session was started without UTF-8 support, or when the locale doesn't match between the tmux server and the capture client.

**Why it happens:** tmux uses the locale of the process that started the server, not the client. If the server started with `LANG=C` and the client uses `LANG=en_US.UTF-8`, character encoding mismatches occur. Claude Code output includes Unicode symbols (checkmarks, arrows, bullet points) that are essential for pattern matching.

**Consequences:** Patterns like `/^[✻✶]/` (for status lines) and `/^●\s+/` (for tool calls) fail because the Unicode characters arrive garbled. The classifier misses hidden-tool-call patterns, flooding the chat with tool invocation noise.

**Prevention:**
- Ensure tmux sessions are started with `LANG=en_US.UTF-8` and `tmux -u` flag.
- Add a validation step in `capturePaneText()`: if the output contains replacement characters (`\uFFFD`) or unexpected byte sequences, log a warning and skip classification for that cycle.
- Have fallback ASCII-safe patterns for critical classifications (e.g., match `Read(` without requiring the `●` prefix).

**Confidence:** MEDIUM — verified via [tmux issue #4065](https://github.com/tmux/tmux/issues/4065). The current deployment environment likely has correct locale, but it's fragile.

---

## Minor Pitfalls

### Pitfall 10: Feedback UI Blocks Message Interaction

**What goes wrong:** The context menu / feedback UI covers adjacent messages, preventing the user from scrolling or interacting with nearby content.

**Prevention:**
- Dismiss context menu on any scroll event.
- Keep the menu compact (3-4 options max): "Reclassify as..." with type options, "Copy text", "Report issue."
- Auto-dismiss after 5 seconds of inactivity.

### Pitfall 11: Pattern Order Sensitivity

**What goes wrong:** The current classifier uses first-match-wins priority ordering. Adding user patterns without understanding the priority chain causes them to be shadowed by higher-priority built-in patterns, or vice versa.

**Prevention:**
- User patterns should be evaluated BEFORE built-in patterns (override semantics). This matches user expectation: "I told you this is X, so treat it as X."
- Document the priority chain clearly: exact-match overrides > user regex patterns > built-in PATTERNS array.
- Provide visibility: when showing a classified message, optionally show which pattern matched (debug mode).

### Pitfall 12: Stale Corrections After Claude Code Updates

**What goes wrong:** Claude Code updates its output format (new tool names, new status indicators, changed prompt styles). User corrections based on the old format become irrelevant or harmful when applied to the new format.

**Prevention:**
- Timestamp all corrections. Auto-expire corrections older than 30 days unless manually confirmed.
- When Claude Code version changes (detectable from tmux output), flag all existing user patterns for review.
- Keep correction count visible in admin UI so stale patterns can be identified and cleaned up.

### Pitfall 13: Multiline Messages Split Across Poll Cycles

**What goes wrong:** Claude outputs a multi-line message (e.g., a paragraph of explanation). The first half arrives in poll cycle N, the second half in poll cycle N+1. They become two separate chat messages instead of one coherent message.

**Prevention:**
- The `groupConsecutiveText()` method already groups consecutive text lines within a single poll. Extend this across polls: if the last message in the DB is "text" type and the first chunk of the new poll is also "text" with no other types between them, append rather than create a new message.
- Add a short debounce (500ms) after detecting new content before classifying — allows fast-arriving content to accumulate.
- Cap the append window: if the previous text message is older than 3 seconds, start a new message regardless.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Pattern improvements (regex overhaul) | Line wrapping breaks anchors (#2) | Add `-J` flag to capture-pane FIRST, before touching patterns |
| Feedback storage schema | Race conditions (#4) | SQLite storage + per-poll snapshot, never mutate PATTERNS in-place |
| Feedback UI (context menu) | Mobile long-press conflicts (#6) | Bottom sheet on mobile, right-click dropdown on desktop |
| Auto-reclassify from corrections | Positive reinforcement spiral (#1) | Never auto-generate HIDDEN patterns; require threshold for regex promotion |
| Content deduplication | Fast-scroll duplicates (#3) | Content-hash dedup with time window before any new patterns |
| Cross-poll message grouping | Split messages (#13) | Debounce + append logic before feedback UI, so users see coherent messages to correct |

---

## Implementation Order Recommendation

Based on pitfall severity and dependency:

1. **Fix capture-pane flags first** (-J for line joining, -S for scrollback) — resolves #2 and #3 partially, and makes all subsequent pattern work more reliable.
2. **Add content-hash dedup** — resolves #3 completely, prevents false feedback on duplicate messages.
3. **Build feedback storage in SQLite** — resolves #4, creates foundation for corrections.
4. **Implement context menu with mobile/desktop split** — addresses #6 and #7 proactively.
5. **Add correction threshold before pattern promotion** — prevents #1 and #8.
6. **Cross-poll text grouping** — improves message quality (#13) so feedback is on coherent messages.

---

## Sources

- [tmux capture-pane line wrapping — Issue #2688](https://github.com/tmux/tmux/issues/2688)
- [tmux UTF-8 encoding in capture-pane — Issue #4065](https://github.com/tmux/tmux/issues/4065)
- [tmux hanging on invalid ANSI sequences — Issue #3317](https://github.com/tmux/tmux/issues/3317)
- [tmux man page — capture-pane flags](https://man7.org/linux/man-pages/man1/tmux.1.html)
- [Radix UI context menu iOS improvements — Discussion #930](https://github.com/radix-ui/primitives/discussions/930)
- [use-long-press iOS text selection — Issue #7](https://github.com/minwork/use-long-press/issues/7)
- [iOS Safari long-press preventDefault techniques](https://additionalknowledge.com/2024/08/02/how-to-prevent-the-default-context-menu-live-preview-on-long-press-in-mobile-safari-chrome/)
- [shadcn/ui context menu mobile fix — PR #166](https://github.com/shadcn-ui/ui/pull/166)
- [False positives in regex-based detection — Secrets in Source Code paper](https://www.secpriv.wien/fulltext/publik_302294.pdf)
- [ML practitioner perception of false positives](https://gangw.cs.illinois.edu/Security_ML-user.pdf)
