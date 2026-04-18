---
id: SEED-002
idea: White/day theme contrast bug (Task #82)
planted_during: v4.3 milestone close → v5.0
planted_on: 2026-04-18
trigger_when: Dashboard theme gets audited (Phase 50 copywriting pass, Phase 58 stage-specific UI variations, or direct user complaint about readability)
status: parked
---

# SEED-002: Theme Contrast Bug

Task #82 from the pre-v5.0 backlog. Light/day theme has poor contrast in
several places — was not prioritised before v5.0 kickoff (user said
"no track for future" during milestone planning, i.e. don't schedule it
but don't lose it).

## When to Surface
- Phase 50 (Non-Programmer Mode Foundation) does copywriting changes that
  may overlap with visual polish — natural moment to sweep light-mode contrast
- Phase 58 (Project Maturity Stages) adds stage-varying card UI — good
  opportunity to audit colour tokens across all stages in light mode
- Any dedicated UI audit quick task
- User hits a specific contrast issue and it becomes unavoidable

## Why This Matters
Minor UX papercut that accumulates trust debt. Non-critical but shows up
visibly when a non-programmer (Phase 56B user-testing checkpoint) uses
the Dashboard in daylight on a laptop.

## Notes
- v4.3-era — original theme refactor was Phase 38. Issue specifically in
  light (non-dark) mode. Likely a few tailwind token swaps + a once-over of
  status colours.
- Small quick task scope when surfaced.
