---
id: SEED-001
idea: AI-Guided CLAUDE.md Editor
planted_during: v4.3 milestone close → v5.0
planted_on: 2026-04-18
trigger_when: A v5.x milestone needs user-visible CLAUDE.md editing surface that doesn't violate v5.0's "user never edits files directly" principle
status: parked
---

# SEED-001: AI-Guided CLAUDE.md Editor

Originally Phase 47 in v4.3 (never executed). Parked during v5.0 milestone
planning because Phase 56B (Non-Programmer Behavioural Contract) makes it
redundant for the v5.0 ethos — Claude edits CLAUDE.md itself, the user
describes desired outcomes in plain English, no editor UI needed.

## Original concept (v4.3)
- Chat pane where user types what they want to change ("make Claude ask fewer questions about testing")
- Claude proposes diffs against the project's CLAUDE.md
- User approves / rejects / tweaks each diff individually
- Separate "Review my CLAUDE.md" button asks Claude for unsolicited improvements

## When to Surface
- A v5.1+ milestone adds explicit CLAUDE.md self-reflection flows (e.g. "retrospective → update CLAUDE.md")
- User feedback that plain-English-only is too lossy — they want to see the actual rules document
- Expert mode gains a "show me the rules" panel and it proves useful enough to productise
- A non-programmer user specifically asks "where are my settings stored / how do I change X permanently"

## Why This Matters
The v5.0 bet is that the user never sees code, including CLAUDE.md. If that
bet fails and users want transparency into "what Claude knows about my
project", this seed is the answer — but it must be framed as a
conversation-first surface (chat + plain-English summary of the changes),
never a raw markdown editor.

## Notes from v4.3 planning
- Original requirement IDs were CFG-04..08 (5 reqs)
- Phase 47 was estimated as medium-sized — chat UI + diff approval + AI suggestion loop
- The "Review my CLAUDE.md" button was explicitly to prompt Claude *without* user typing anything
