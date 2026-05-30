---
title: Audit and apply .planning/ gitignore rules to all projects before going public
date: 2026-05-30
priority: high
context: public-github-safety
---

# Audit .planning/ gitignore per project

Apply the [[planning-public-safety-tiers]] pattern to each project.

## Projects needing action

- [ ] **gsddashboard** — 604 .planning files tracked. Add gitignore, untrack phases/quick/debug/threads/config.json, scrub STATE.md and PROJECT.md of VPS IP (37.27.212.18) and gsdlabs.dev refs
- [ ] **ynab** — 272 .planning files tracked. Add gitignore, untrack. Review PROJECT.md (has Hetzner VPS paths and SSH commands)
- [ ] **KidAI** — 294 .planning files tracked. Add gitignore, untrack. STATE.md and debug/ have /home/services/hetzner-vps paths
- [ ] **reforma** — check if .planning exists and if tracked
- [ ] **zoho-todoist-sync** — already done (.planning fully gitignored)

## Per-project steps

1. Add Tier 2 block to `.gitignore`
2. `git rm -r --cached` the Tier 2 dirs
3. Review `STATE.md` and `PROJECT.md` for Tier 3 infra refs and strip them
4. Commit: `chore: gitignore .planning operational dirs for public safety`

## New projects

Add Tier 2 gitignore block before first `gsd-plan-phase` run. Consider adding to GSD project init template so it's automatic.
