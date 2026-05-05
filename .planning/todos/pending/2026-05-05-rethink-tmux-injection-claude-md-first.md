---
created: 2026-05-05T11:00:00Z
title: Rethink tmux-injection approach — CLAUDE.md-first patterns
area: planning
files:
  - server/gsd/verifyOrchestrator.js
  - server/gsd/stateBroadcaster.js
  - .planning/ROADMAP.md
---

## Problem

Phase 53 built a server-side verifyOrchestrator that injects `/gsd-verify-work` into live tmux sessions on working→waiting transitions. Two problems:

1. **Context limit risk**: fires into the same Claude session that just finished executing — potentially already near context limit after a heavy phase, leading to poor-quality or failed verification.
2. **Redundancy**: the GSD execute-phase workflow already spawns a fresh gsd-verifier subagent at the end of every phase. That subagent runs in a clean 200k context window and does the same job better.

The same tmux-injection pattern may exist in other phases in the current milestone. Anything that automates Claude behavior server-side (injecting slash commands, sending keys, orchestrating sessions) should be audited — most of these can be handled more cleanly via CLAUDE.md instructions or GSD workflow hooks.

The UI layer (VerifyBadge, WebSocket broadcasting of verifyState) is genuinely valuable and should be kept.

## Solution

1. Audit all phases in current milestone for tmux-injection / server-side Claude automation patterns
2. For each: determine if CLAUDE.md instruction or GSD workflow step handles it better
3. Refactor Phase 53: remove the working→waiting trigger in stateBroadcaster; keep VerifyBadge + WebSocket broadcast wired to the GSD verifier subagent result instead of the orchestrator
4. Update CLAUDE.md (project-level or global) with any behavioral rules that replace the removed automation
5. Confirm no context-limit risk path remains
