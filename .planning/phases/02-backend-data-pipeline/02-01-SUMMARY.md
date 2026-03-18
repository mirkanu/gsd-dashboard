---
phase: 02-backend-data-pipeline
plan: 01
status: complete
completed: "2026-03-18"
---

# Summary: Phase 2, Plan 1 — GSD File Readers

## Outcome

`server/gsd/readers.js` parses all three planning file types for any configured project.

## Parsers Built

- **readState(root)** — handles both YAML frontmatter format (josie/debates/reforma) and pure markdown format (gsddashboard). Extracts: milestone, status, current_phase, last_activity, progress percentages, blockers.
- **readRoadmap(root)** — parses the progress table from ROADMAP.md. Extracts phase name, plans_done/total, and normalized status per phase. Falls back to checkbox list parsing.
- **readRequirements(root)** — counts `[x]` vs `[ ]` requirement lines matching REQ-ID pattern. Returns total, checked, percent.

## Verified output (all 4 projects)

- josie: in-progress, 50%, 11 reqs (36% done)
- gsddashboard: 37%, 17 reqs
- debates: verifying, 100%, 38 reqs (89% done)
- reforma: planning, 97%, 17 reqs (53% done)
