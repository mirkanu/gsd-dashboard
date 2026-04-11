# Deferred Items — Phase 44

## Pre-existing test failures (not caused by Phase 44 work)

### Sidebar.test.tsx — 2 failing tests
- **File:** `client/src/components/__tests__/Sidebar.test.tsx`
- **Failing assertions:** `screen.getByText("v1.0.0")` and related version-number lookups
- **Root cause:** Sidebar component likely no longer renders the static `v1.0.0` string (version display changed).
- **Scope:** Pre-existing on master before Plan 44-02 execution. Confirmed via `git stash` + rerun.
- **Recommendation:** Fix separately via `/gsd:quick` — update either the Sidebar component or the test to match current UI.
