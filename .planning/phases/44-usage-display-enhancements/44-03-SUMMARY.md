---
phase: 44-usage-display-enhancements
plan: 03
subsystem: ui
tags: [react, typescript, usage, pricing, tokens, model-breakdown, railway]

# Dependency graph
requires:
  - phase: 44-usage-display-enhancements
    provides: Plan 01 extended /api/pricing/window (tokens + by_model) and Plan 02 PricingEditor component
provides:
  - UsagePage shows input/output/cache_read/cache_write token counts on both weekly and daily summary cards
  - Model Breakdown section with This Week / Today columns listing each model cost and token sub-counts
  - PricingEditor mounted on Usage page with onChange={fetchData} wiring so saving a rate triggers an immediate cost refetch
  - Extended UsageWindow TypeScript type + ModelBreakdownEntry interface matching the Plan 01 API shape
affects: [future-usage-features, cost-analytics]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Read-only render of pre-aggregated by_model + token totals — zero additional network calls for breakdown"
    - "Parent-owned refetch: PricingEditor calls props.onChange() after successful upsert; UsagePage passes fetchData directly"
    - "formatTokens helper colocated with formatCost in UsagePage for symmetric unit formatting (k / M suffixes)"

key-files:
  created: []
  modified:
    - client/src/lib/types.ts
    - client/src/pages/UsagePage.tsx

key-decisions:
  - "formatTokens helper kept local to UsagePage — only consumer so far; promote to shared lib only if a second caller appears"
  - "Model Breakdown uses 2-column md grid (This Week / Today) instead of stacked rows — mirrors the Weekly/Today summary cards above and keeps the page scannable on desktop"
  - "Empty state per-column ('No usage recorded') rather than hiding the whole section — keeps layout stable when one window has no traffic"
  - "PricingEditor mounted after Per-Project Breakdown at bottom of page — editing rates is a secondary flow; primary usage data stays above the fold"

patterns-established:
  - "UsagePage layout: summary cards → gauge → 7-day trend → Model Breakdown → Per-Project Breakdown → PricingEditor"
  - "Token row shape: `in {N} · out {N} · cache r {N} · cache w {N}` using formatTokens k/M abbreviations"

requirements-completed: [USG-01, USG-02, USG-03, USG-04]

# Metrics
duration: ~12min
completed: 2026-04-10
---

# Phase 44 Plan 03: Usage Page Integration Summary

**Wired Plan 01 (tokens + by_model API) and Plan 02 (PricingEditor component) into UsagePage — the Usage page now shows per-window token sub-counts, a Model Breakdown section, and an inline pricing editor that refetches costs on save.**

## Performance

- **Duration:** ~12 min
- **Tasks:** 3 (2 code tasks + 1 deploy/verify checkpoint)
- **Files modified:** 2
- **Checkpoint:** Human-verify approved on live Railway URL

## Accomplishments
- Extended `UsageWindow` TypeScript type with `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_write_tokens`, and `by_model` on both daily and weekly; exported new `ModelBreakdownEntry` interface.
- Weekly Spend and Today's Spend summary cards now render token sub-counts directly under the dollar amount.
- New **Model Breakdown** section with side-by-side This Week / Today columns listing each model's display name, cost, and token sub-counts.
- `PricingEditor` mounted at the bottom of the page with `onChange={fetchData}`, so saving any rate immediately re-runs `/api/pricing/window` and the entire page re-renders with updated costs.
- Deployed to Railway; live API confirmed to return the new shape; user visually verified all five UI acceptance criteria and approved.
- Closes all four USG-* requirements for Phase 44 (USG-01 tokens, USG-02 editor, USG-03 tips, USG-04 model breakdown).

## Task Commits

1. **Task 1: Extend UsageWindow type with tokens and by_model** — `17a8cd4` (feat)
2. **Task 2: Render tokens, model breakdown, and mount PricingEditor on UsagePage** — `429cc97` (feat)
3. **Task 3: Deploy to Railway and human-verify** — no code commit (deploy + checkpoint)

**Plan metadata:** follow-up docs commit includes this SUMMARY + STATE + ROADMAP updates.

## Files Created/Modified
- `client/src/lib/types.ts` — Extended `UsageWindow.daily` and `UsageWindow.weekly` with token fields + `by_model`; added exported `ModelBreakdownEntry` interface
- `client/src/pages/UsagePage.tsx` — Added `formatTokens` helper, token sub-count rows on both summary cards, Model Breakdown section, PricingEditor mount with fetchData wiring, and extended imports

## Decisions Made
- **Parent-owned refetch pattern:** PricingEditor stays pure; UsagePage passes `fetchData` as `onChange`, so the save flow triggers a single source-of-truth refetch rather than duplicating logic in the editor.
- **Side-by-side Model Breakdown columns:** `grid-cols-1 md:grid-cols-2` mirrors the summary cards above — visually consistent and responsive without extra layout complexity.
- **Token abbreviation threshold:** `>=1_000_000 → M`, `>=1_000 → k`, else raw. One decimal place preserves precision for sub-million values without cluttering the row.
- **Placement of PricingEditor at bottom:** Editing rates is a secondary/admin flow; keeping it below Per-Project Breakdown keeps the primary cost data above the fold.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Restarted local PM2 `gsd-dashboard` process to refresh proxy target**
- **Found during:** Task 3 (Deploy + verify checkpoint)
- **Issue:** After `git push && railway up --detach` succeeded on Railway (deployment `25b61804-788d-44c5-a149-d0b005734583` SUCCESS), the live API at `https://gsd-dashboard-production.up.railway.app/api/pricing/window` was still returning the **old shape** (no `by_model`, no token fields). Root cause: Railway runs in proxy mode via `GSD_DATA_URL`, forwarding requests to the local `gsd-dashboard` PM2 process on this host. That process was still running the pre-Plan-44-01 backend code — Railway itself was a thin proxy to stale code.
- **Fix:** Restarted the local PM2 `gsd-dashboard` process (new PID 93041). After restart, the proxied endpoint returned the new Plan 01 shape with `by_model` and token totals populated.
- **Files modified:** None (runtime/infra only)
- **Verification:** `curl -s https://gsd-dashboard-production.up.railway.app/api/pricing/window | jq '.daily.by_model'` returned the new array; follow-up `jq -e '.daily.by_model and .daily.input_tokens != null'` passed.
- **Committed in:** N/A (no code change, infra restart only)

---

**Total deviations:** 1 auto-fixed (1 blocking/infra)
**Impact on plan:** Zero scope creep — the fix was a required step to make the Plan 01 backend code actually reachable through the Railway proxy. Worth documenting because future Phase 44-style deploys that touch backend routes need the same PM2 restart when running in proxy mode.

## Issues Encountered

- **Railway proxy staleness (documented above under Deviations):** Worth calling out separately because it is a Phase-level gotcha. `GSD_DATA_URL` proxy mode means "deploy to Railway" is a two-step process: (1) Railway rebuild/push, (2) restart the local PM2 process that Railway proxies to. Any future backend-touching plan must perform both steps before the human-verify checkpoint.

## User Setup Required

None — no external service configuration. All acceptance criteria are visible on `https://gsd-dashboard-production.up.railway.app/usage`.

## Next Phase Readiness

- **Phase 44 complete.** All four USG-* requirements satisfied and visually verified.
- Usage page is now the canonical cost + breakdown surface; future optimization work (alerts, budgets, time-series) can build on the `/api/pricing/window` shape and the PricingEditor component without further integration work.
- Next roadmap item: Phase 45 (Services Cost Tracking Foundation) — orthogonal to Phase 44, no shared files.

## Self-Check: PASSED

- FOUND: client/src/lib/types.ts (modified — UsageWindow extended + ModelBreakdownEntry exported)
- FOUND: client/src/pages/UsagePage.tsx (modified — tokens, model breakdown, PricingEditor mount)
- FOUND: commit 17a8cd4 (Task 1 feat)
- FOUND: commit 429cc97 (Task 2 feat)
- FOUND: live Railway API returns new shape with `by_model` and token totals
- FOUND: user approval for human-verify checkpoint (5 acceptance criteria)

---
*Phase: 44-usage-display-enhancements*
*Completed: 2026-04-10*
