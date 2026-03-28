---
phase: 20-fix-railway-deployment
verified: 2026-03-28T20:15:00Z
status: human_needed
score: 2/3 must-haves verified (code artifacts complete, live deployment unconfirmed)
re_verification: false
human_verification:
  - test: "Visit live Railway dashboard and verify UI"
    expected: "Project grid shows alphabetically-sorted cards (A-Z by name), paused projects are hidden in a collapsed 'View paused' section"
    why_human: "Cannot verify visually through automated means (page requires auth, content is HTML/React)"
---

# Phase 20: Fix Railway Deployment Verification Report

**Phase Goal:** Deploy the dequal-patch fix and add a post-build dist assertion so the live dashboard reflects recent client changes (alphabetical sort + paused hiding) and future deploys cannot silently ship stale builds

**Verified:** 2026-03-28T20:15:00Z
**Status:** human_needed
**Re-verification:** No (initial verification)

## Goal Achievement

### Observable Truths

| #   | Truth                                                       | Status        | Evidence                                                          |
| --- | ----------------------------------------------------------- | ------------- | ----------------------------------------------------------------- |
| 1   | Live Railway URL serves alphabetically-sorted project grid   | UNCERTAIN     | Code implements sort (GSD.tsx line 895), but live deploy unverified |
| 2   | Paused projects hidden in collapsed section in live dash     | UNCERTAIN     | Code implements collapse (GSD.tsx lines 744, 816, 913-939), live unverified |
| 3   | Future Railway builds fail fast if client build is empty     | ✓ VERIFIED    | verify-build.sh exits 1 if dist/index.html missing or <500 bytes  |

**Score:** 1/3 truths automated-verified; 2/3 require human confirmation

### Required Artifacts

| Artifact                       | Expected                                           | Status        | Details                                    |
| ------------------------------ | -------------------------------------------------- | ------------- | ------------------------------------------ |
| `client/scripts/verify-build.sh` | Post-build assertion for dist/index.html           | ✓ VERIFIED    | 15 lines, executable, substantive logic    |
| `Dockerfile` Stage 2            | Calls `RUN sh scripts/verify-build.sh` after build | ✓ VERIFIED    | Line 17 calls verify-build.sh after npm build |

### Key Link Verification

| From                    | To                                    | Via                        | Status        | Details                              |
| ----------------------- | ------------------------------------- | -------------------------- | ------------- | ------------------------------------ |
| npm run build           | verify-build.sh execution             | `RUN sh scripts/verify-build.sh` | ✓ WIRED       | Line 16-17 in Dockerfile; correct order |
| Dockerfile build step   | dist/ artifact assertion              | verify-build.sh logic      | ✓ WIRED       | Script checks existence and size >500 |
| Railway deploy command  | Live URL serves latest build          | `railway up --detach`      | ? UNCERTAIN   | Commit pushed; deploy happened per SUMMARY; live verification needed |

### Requirements Coverage

No requirements specified for phase 20 (`requirements: []` in PLAN frontmatter).

### Anti-Patterns Found

None detected. Code is substantive:
- verify-build.sh: Contains full logic (file check, size check, error messages)
- GSD.tsx: Contains full sort implementation (localeCompare) and paused section logic (filter, collapse state, conditional render)
- Dockerfile: Proper shell syntax (sh not bash, correct for Alpine base)

### Human Verification Required

#### 1. Live Dashboard UI Verification

**Test:** Visit https://gsd-dashboard-production.up.railway.app, log in, navigate to the GSD tab (project grid)

**Expected:**
- Project cards appear in alphabetical order (A-Z by project name)
- Paused projects are NOT shown inline with active projects
- Instead, there's a collapsed "View paused (N)" button that reveals paused projects when clicked
- The button shows a chevron icon indicating expand/collapse state

**Why human:**
- Page requires authentication (cannot fetch and parse via curl/automated testing)
- Visual ordering and UI layout cannot be verified programmatically without rendering the React app
- The SUMMARY claims user approved this, but no evidence of actual verification visit is documented

**Current status:** SUMMARY documents "approved by user" but lacks concrete evidence (no screenshot, no timestamp, no explicit confirmation in commit log)

### Deployment Verification Summary

**What's been done (code level):**
- ✓ `client/scripts/verify-build.sh` created with proper assertion logic (15 lines, executable, checks dist/index.html exists and >500 bytes)
- ✓ `Dockerfile` Stage 2 updated to call `RUN sh scripts/verify-build.sh` after `RUN npm run build` (correct order, proper syntax)
- ✓ Three fix commits pushed to master:
  - `f1dfba3` — add post-build dist assertion to Dockerfile
  - `cbc46ad` — copy client/scripts before npm ci (ordering fix)
  - `3eb49c5` — use sh instead of bash in verify-build (Alpine Linux compatibility)
- ✓ One documentation commit pushed:
  - `e273723` — complete 20-01 plan documentation
- ✓ Current git status shows 1 commit ahead of origin/master (the final doc commit not yet pushed)

**What's unverified (live deployment):**
- ? Live Railway URL shows latest build (HTTP 401 confirms server is running, but page content unverified)
- ? Alphabetical sort actually visible in the GSD tab
- ? Paused projects actually collapsed/hidden in the live dashboard

**The gap:**
The SUMMARY's Task 2 claims "approved by user" for live dashboard verification, but:
1. No explicit user confirmation is documented in git (no comment, no tag, no approval message)
2. The SUMMARY was created at 2026-03-28 20:10:29, only 8 minutes after the last technical commit (3eb49c5 at 20:02:13)
3. Railway builds take 3-5 minutes; the timing is extremely tight for a full user verification cycle
4. The PLAN's Task 2 explicitly requires the user to visit the live URL, log in, and confirm UI changes — this is a blocking checkpoint

### Gaps Summary

**Gap 1: Live Deployment Unverified (Blocking)**
- **Truth:** "Live Railway URL serves alphabetically-sorted project grid + hidden paused section"
- **Status:** UNCERTAIN
- **Reason:** Code is correct and committed, but live deployment verification is claimed but not evidenced
- **What's missing:** Explicit confirmation from user that they visited the live URL and saw the expected UI
- **To close:** User must visit https://gsd-dashboard-production.up.railway.app, confirm:
  1. Project cards are sorted A-Z by name
  2. Paused projects are hidden in a collapsed "View paused" section
  3. Collapsing/expanding the section works
  4. Current build shows commit 3eb49c5 or later was deployed

**Gap 2: Deploy Pushed But Not Yet on Remote (Minor)**
- **Truth:** "All changes committed and pushed to master"
- **Status:** PARTIAL
- **Reason:** Final doc commit (e273723) is not yet pushed to origin/master
- **What's missing:** `git push origin master` for the final documentation commit
- **To close:** Push the final commit with `git push origin master`

---

## Artifact Deep Dive

### verify-build.sh (15 lines, VERIFIED)

```bash
#!/bin/sh
# Asserts that the Vite build produced a non-empty dist/index.html.
# Run after `npm run build` in the Dockerfile to catch silent build failures.
set -e
DIST="dist/index.html"
if [ ! -f "$DIST" ]; then
  echo "ERROR: $DIST not found — Vite build produced no output. Aborting."
  exit 1
fi
SIZE=$(wc -c < "$DIST")
if [ "$SIZE" -lt 500 ]; then
  echo "ERROR: $DIST is suspiciously small ($SIZE bytes). Aborting."
  exit 1
fi
echo "Build OK: $DIST exists ($SIZE bytes)"
```

**Levels:**
1. ✓ **Exists:** File at `/data/home/gsddashboard/client/scripts/verify-build.sh`, 15 lines, executable (0755)
2. ✓ **Substantive:** Contains three assertions (set -e, file check, size check), not a stub
3. ✓ **Wired:** Called from Dockerfile line 17 as `RUN sh scripts/verify-build.sh` after npm build

**Quality:** PRODUCTION-READY
- Proper sh (POSIX) shebang for Alpine Linux base
- Meaningful error messages with actual values
- Appropriate threshold (500 bytes catches empty builds without false positives)

### Dockerfile Stage 2 (Lines 8-17, VERIFIED)

```dockerfile
# ── Stage 2: Build React client ───────────────────────────────────────
FROM node:22-alpine AS client-build
# cache-bust: 2026-03-28T18
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
COPY client/scripts/ ./scripts/
RUN npm ci
COPY client/ ./
RUN npm run build
RUN sh scripts/verify-build.sh
```

**Levels:**
1. ✓ **Exists:** Updated Dockerfile with Stage 2 properly configured
2. ✓ **Substantive:** Correct execution order (dependencies → build → assertion), scripts copied before npm ci (fixes postinstall issue)
3. ✓ **Wired:** verify-build.sh called immediately after npm run build (line 17), exit code will fail the stage if dist is missing/empty

**Quality:** PRODUCTION-READY
- Correct layer ordering (scripts available during npm ci for postinstall hooks)
- Proper sh syntax (not bash, compatible with Alpine)
- Build assertion is in the right place (after npm run build, before copying to final stage)

### GSD.tsx Alphabetical Sort Implementation (Line 895, VERIFIED)

```typescript
{[...visibleProjects]
  .sort((a, b) => a.name.localeCompare(b.name))
  .map((project) => (
    <ProjectCard ... />
  ))}
```

**Levels:**
1. ✓ **Exists:** Sort logic at line 895 in `/data/home/gsddashboard/client/src/pages/GSD.tsx`
2. ✓ **Substantive:** Uses localeCompare for proper alphabetical ordering, creates a shallow copy before sorting
3. ✓ **Wired:** Applied to visibleProjects (filtered to exclude paused), rendered immediately after

**Quality:** CORRECT
- localeCompare handles Unicode alphabetical ordering properly
- Shallow copy ([...]) prevents in-place sort (immutability best practice)
- Only applies to visible (non-paused) projects

### GSD.tsx Paused Section Implementation (Lines 744, 816, 913-939, VERIFIED)

```typescript
const [pausedOpen, setPausedOpen] = useState(false);  // Line 744
const pausedProjects = projects.filter(p => p.sessionState === "paused");  // Line 816

{pausedProjects.length > 0 && (  // Line 913 - conditionally render
  <div className="mt-2">
    <button onClick={() => setPausedOpen(v => !v)} className="...">
      {pausedOpen ? <ChevronDown ... /> : <ChevronRight ... />}
      View paused ({pausedProjects.length})
    </button>
    {pausedOpen && (  // Line 922 - only show if expanded
      <div className="grid ...">
        {pausedProjects.map((project) => (
          <ProjectCard ... />
        ))}
      </div>
    )}
  </div>
)}
```

**Levels:**
1. ✓ **Exists:** Complete implementation at lines 744, 816, 913-939 in GSD.tsx
2. ✓ **Substantive:** State management (pausedOpen), filtering, conditional rendering, expand/collapse UI
3. ✓ **Wired:** State toggle connected to button click, conditional render gates expansion

**Quality:** CORRECT
- Paused projects separated from visible grid (line 815 filters out paused before sorting/rendering)
- Collapse state managed with boolean (pausedOpen toggle)
- Visual feedback (chevron icon changes based on state)
- Renders paused cards only when section is expanded

---

## Final Assessment

### What's Working

**Code Level (Fully Verified):**
- ✓ verify-build.sh artifact: exists, substantive, wired
- ✓ Dockerfile modification: correct order, proper syntax, wired
- ✓ GSD.tsx alphabetical sort: implemented, wired
- ✓ GSD.tsx paused hiding: implemented, wired
- ✓ All supporting commits: present and pushed to master

**Deploy Level (Evidence Present):**
- ✓ Commits f1dfba3, cbc46ad, 3eb49c5 merged into master
- ✓ HTTP 401 from live URL confirms server is running
- ✓ No blocker anti-patterns in code

### What's Uncertain

**Live Verification (No Evidence):**
- ? Live URL actually serves the latest build with the new features
- ? User has actually visited the dashboard and confirmed alphabetical sort
- ? User has actually visited the dashboard and confirmed paused section hiding
- **BLOCKING:** The PLAN's Task 2 is a `checkpoint:human-verify` with `gate="blocking"` — this requires explicit user confirmation before the phase can be considered complete

### Why Status is human_needed (Not gaps_found)

**Reason:** All code artifacts are correct and properly wired. The implementation is complete. The only missing piece is the human verification of the live deployment that was supposedly done but lacks evidence.

This is not a "gap" (missing code, wrong implementation) — it's a "human verification needed" (code is ready, just needs confirmation the deployed version works).

---

_Verified: 2026-03-28T20:15:00Z_
_Verifier: Claude (gsd-verifier)_
