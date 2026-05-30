---
name: SEED-003-gsd-fork-ready-mode
description: A GSD pattern where STATE.md gets a scrubbed public version when a project is designated fork-ready for other vibe coders
metadata:
  type: seed
  trigger_condition: When a project is ready to go public on GitHub and the owner wants vibe coders to be able to fork and continue it
  planted_date: 2026-05-30
---

# Seed: GSD Fork-Ready Mode

## Idea

When a project is designated "fork-ready", generate a sanitized `FORK-README.md` or `CONTINUATION.md` that a new vibe coder (and their Claude Code) can use to pick up the project — without infra-specific details.

## What it would contain

- Plain-English summary of what was built and why (from PROJECT.md)
- Where the project stands (current milestone, % complete)
- What's next (next phase / next action — from STATE.md, stripped of VPS context)
- How to set up the project locally (env vars needed, no values)
- Link to ROADMAP.md for full phase history

## What it would NOT contain

- Hostnames, IPs, domain names
- Internal paths
- Deployment targets or credentials

## How it could work

`/gsd-fork-ready` command that:
1. Checks .gitignore has Tier 2 dirs covered
2. Generates `FORK-README.md` from PROJECT.md + STATE.md with infra refs stripped
3. Optionally runs a scan for remaining sensitive patterns in Tier 1 files and flags them

## Trigger

When any of these projects is about to go public, or when the user explicitly wants to make a project shareable.
