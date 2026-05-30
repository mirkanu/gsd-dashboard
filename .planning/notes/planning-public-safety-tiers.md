---
name: planning-public-safety-tiers
description: Three-tier classification of .planning/ files for safe public GitHub repos — what to keep, gitignore, and scrub
metadata:
  type: note
  date: 2026-05-30
  context: Making GSD projects public on GitHub while keeping planning docs useful for vibe coders
---

# .planning/ Public Safety Tiers

When publishing a GSD project repo publicly, .planning/ content falls into three tiers.

## Tier 1 — Safe to keep public (keep in git)

Navigation and vision files. No infra-specific content. Useful for vibe coders to understand and continue the project.

- `ROADMAP.md`
- `PROJECT.md` *(review first — see Tier 3)*
- `REQUIREMENTS.md`
- `MILESTONES.md`
- `milestones/` directory
- `seeds/`
- `notes/`
- `research/`
- `todos/`

## Tier 2 — Gitignore entirely (risky operational history)

Contains VPS IPs, SSH commands, internal paths, infra-specific details accumulated during execution. Historical — not needed for a vibe coder to continue.

```gitignore
.planning/phases/
.planning/quick/
.planning/debug/
.planning/threads/
.planning/config.json
```

## Tier 3 — Review and scrub before committing (current-state files)

These contain useful continuation context BUT accumulate infra-specific details over time.

- `STATE.md` — has "next action" (gold for vibe coders) but also VPS-specific architectural decisions. Review and strip infra refs before making public.
- `PROJECT.md` — often mentions deployment hostnames, domain names, internal paths. Strip or genericize before making public.

## Applying to existing projects

```bash
# Add to .gitignore
echo '.planning/phases/
.planning/quick/
.planning/debug/
.planning/threads/
.planning/config.json' >> .gitignore

# Untrack already-committed files (removes from future commits, not history)
git rm -r --cached .planning/phases/ .planning/quick/ .planning/debug/ .planning/threads/ .planning/config.json 2>/dev/null || true
git commit -m "chore: gitignore .planning operational dirs for public safety"
```

## History note

If only paths/hostnames (not credentials) were committed, "clean from here forward" is sufficient. Only run `git filter-repo` if actual secrets (API keys, passwords) were committed to history.

## New projects

Add the Tier 2 gitignore block to `.gitignore` before the first `gsd-plan-phase` run, so phases/ never accumulates in git history.
