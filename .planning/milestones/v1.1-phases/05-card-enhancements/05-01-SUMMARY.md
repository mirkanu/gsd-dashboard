---
phase: 05-card-enhancements
plan: "01"
subsystem: client-ui
tags: [gsd, project-card, version-badge, live-url, types]
dependency_graph:
  requires: []
  provides: [GsdProject.version, GsdProject.liveUrl, ProjectCard.versionBadge, ProjectCard.liveUrlLink]
  affects: [client/src/lib/types.ts, client/src/pages/GSD.tsx]
tech_stack:
  added: []
  patterns: [conditional-render, stopPropagation-link, lucide-icon]
key_files:
  created:
    - client/src/components/__tests__/GsdProject.test.ts
  modified:
    - client/src/lib/types.ts
    - client/src/pages/GSD.tsx
decisions:
  - "Version badge uses flex-shrink-0 inside name row to prevent truncation issues"
  - "Live URL displays full href text alongside ExternalLink icon for clarity"
metrics:
  duration_seconds: 283
  completed_date: "2026-03-21"
  tasks_completed: 2
  files_changed: 3
---

# Phase 5 Plan 01: Version Badge and Live URL on Project Cards Summary

**One-liner:** Version badge (e.g. "v1") and clickable live URL link added to each ProjectCard using API fields already provided by Phase 4.

## What Was Built

- Extended `GsdProject` interface in `client/src/lib/types.ts` with `version: string | null` and `liveUrl: string | null` fields.
- Added `client/src/components/__tests__/GsdProject.test.ts` with 4 type-shape assertions covering both fields as string and null variants.
- In `ProjectCard` (`client/src/pages/GSD.tsx`):
  - Version badge renders as a muted `span` immediately after the project name `h3` when `project.version` is non-null.
  - Live URL renders as an `<a>` tag with `target="_blank"`, `rel="noopener noreferrer"`, `onClick stopPropagation`, and `ExternalLink` icon when `project.liveUrl` is non-null.
- Imported `ExternalLink` from lucide-react (added to existing import line).

## Verification

- `npm run test:client` — 82 tests pass across 8 test files.
- `npm run build` — TypeScript compiles clean, Vite builds to `dist/` (291.91 kB JS).

## Deviations from Plan

None — plan executed exactly as written.

## Commits

| Task | Commit  | Message                                                        |
| ---- | ------- | -------------------------------------------------------------- |
| 1    | c824ac3 | feat(05-01): extend GsdProject type with version and liveUrl fields |
| 2    | ee0c75e | feat(05-01): render version badge and live URL in ProjectCard  |

## Self-Check: PASSED

- `client/src/lib/types.ts` — FOUND (modified)
- `client/src/pages/GSD.tsx` — FOUND (modified)
- `client/src/components/__tests__/GsdProject.test.ts` — FOUND (created)
- Commit c824ac3 — FOUND
- Commit ee0c75e — FOUND
