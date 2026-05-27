---
phase: quick-260527-pfk
plan: 01
subsystem: upload
tags: [upload, sidebar, ios, multipart, busboy]
key-files:
  created:
    - server/routes/upload.js
    - client/src/components/UploadPanel.tsx
  modified:
    - server/index.js
    - client/src/components/Sidebar.tsx
    - package.json
decisions:
  - "busboy ^1.6.0 installed for multipart parsing (multer not in project)"
  - "Race-condition fix: defer HTTP response until both busboy finish AND WriteStream finish events have fired"
  - "handleCopy is synchronous — navigator.clipboard.writeText called directly in click handler, not in .then(), satisfying iOS clipboard security constraint"
  - "slim mode in UploadPanel returns null (Upload icon rendered directly by Sidebar for collapsed state)"
metrics:
  duration: ~45min
  completed: 2026-05-27
---

# Quick Task 260527-pfk: Add Upload Panel to Dashboard Sidebar

Upload panel added to the GSD Dashboard sidebar — paste, drag-drop, or file-picker to get a shareable localhost URL that Claude Code can reference.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Server — upload route + static serving | a5de052 | server/routes/upload.js, server/index.js, package.json |
| 2 | Client — UploadPanel component + Sidebar integration | a33b6d5 | client/src/components/UploadPanel.tsx, client/src/components/Sidebar.tsx |

## What Was Built

### server/routes/upload.js
- POST /api/upload: multipart parser using busboy v1.6.0
- 50MB file size cap (T-pfk-04 mitigation)
- 8-char hex slug + original extension for filename (T-pfk-02 mitigation — no path traversal)
- Writes to `/home/services/gsddashboard/uploads/` (fixed directory)
- Returns `{ url: "http://localhost:4820/uploads/{slug}.{ext}" }`

### server/index.js
- `uploadRouter` registered at `/api/upload`
- `/uploads` static serve mounted BEFORE `express.static(clientDist)` SPA catch-all

### client/src/components/UploadPanel.tsx
- States: idle / uploading / done / error
- Drop zone: accepts onDrop, onPaste (paste while focused), onClick (file picker)
- iOS-safe Copy URL: `navigator.clipboard.writeText()` called synchronously in click handler
- Fallback: textarea + `execCommand('copy')` for older iOS
- "Copied ✓" shown for 2s then resets
- slim prop: returns null (Sidebar renders icon directly in collapsed state)

### client/src/components/Sidebar.tsx
- Upload icon + UploadPanel import added
- Divider + UploadPanel mounted after Settings nav item
- Expanded: `<UploadPanel slim={false} />`; Collapsed: Upload icon div

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] busboy finish/WriteStream finish race condition**
- **Found during:** Task 1 smoke testing (curl returned 400 despite file being written to disk)
- **Issue:** `bb.on("finish")` fires before `ws.on("finish")` completes. Original code checked `fileWritten` flag in busboy finish handler — always false at that point, so response was always 400.
- **Fix:** Replaced single `fileWritten` flag with a two-gate pattern (`bbFinished` + `pendingWrite`). Response deferred via `sendResult()` which only fires when both gates are clear.
- **Files modified:** server/routes/upload.js
- **Commit:** a5de052

**2. [Rule 3 - Blocking] Worktree/main project path confusion**
- **Found during:** Both tasks
- **Issue:** Agent's Write tool uses absolute paths. `/home/services/gsddashboard/` paths go to the main project working tree; the worktree lives at `/home/services/gsddashboard/.claude/worktrees/agent-a11c1993df9057e90/`. Initial file writes landed in main project, not worktree. PM2 runs from main project so the fix was working live, but worktree commits needed the files written to worktree paths.
- **Fix:** Re-wrote all files to correct worktree-relative paths before committing to the worktree branch.

**3. [Rule 3 - Blocking] Playwright browser not installed**
- **Found during:** E2E test execution
- **Issue:** `/usr/lib/node_modules/playwright` had no downloaded browser. System chromium-browser exists but is not compatible with playwright's headless shell expectation.
- **Fix:** Downloaded playwright browsers to `/tmp/pw-browsers` via `PLAYWRIGHT_BROWSERS_PATH=/tmp/pw-browsers npx playwright@1.44.0 install chromium`.

## E2E Test Results (Playwright)

All 8 tests passed.

```
PASS: Dashboard loads (title: "Agent Dashboard - Claude Code Monitor")
PASS: Upload section label is visible in sidebar
PASS: Drop zone "Paste or drop file" is visible
PASS: Upload succeeded — Copy URL button appeared
PASS: URL displayed: http://localhost:4820/uploads/0d773f46.txt
PASS: Uploaded file is accessible at http://localhost:4820/uploads/0d773f46.txt
PASS: Copy URL button shows "Copied" feedback after click
PASS: "Upload another" resets panel to idle state

Passed: 8 / Failed: 0
```

## Server Tests

11 pre-existing failures (unchanged from baseline). No new failures introduced.

## Client Tests

64+9 pre-existing failures (unchanged from baseline). No new failures introduced.

## Known Stubs

None. Upload flow is fully wired: client → POST /api/upload → busboy → disk → URL returned → displayed → Copy URL works.

## Threat Surface Scan

No new threats beyond what was modeled in the plan's threat register:
- T-pfk-01: cookieAuth guards /api/upload on remote hosts (localhost exempt)
- T-pfk-02: Fixed upload dir + hex-only slug — no path traversal possible
- T-pfk-03: Ephemeral 8-char slug, localhost only, no directory listing
- T-pfk-04: 50MB busboy limit enforced

## Self-Check

Files created/modified:
- [x] /home/services/gsddashboard/server/routes/upload.js — exists
- [x] /home/services/gsddashboard/client/src/components/UploadPanel.tsx — exists
- [x] /home/services/gsddashboard/client/src/components/Sidebar.tsx — modified
- [x] /home/services/gsddashboard/server/index.js — modified

Worktree commits:
- a5de052 — feat(quick-260527-pfk): upload route
- a33b6d5 — feat(quick-260527-pfk): UploadPanel component + Sidebar integration

## Self-Check: PASSED
