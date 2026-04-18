# Quick Task 23: Working Indicator + Classifier Improvements - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Task Boundary

Two improvements to the chat experience:
1. Move working indicator to bottom of chat (typing indicator position) showing actual tmux status text
2. Improve classifier to correctly hide Claude Code tool output patterns

</domain>

<decisions>
## Implementation Decisions

### Working Indicator Position
- Move from TOP (below header) to BOTTOM (above send box)
- Like WhatsApp/Telegram typing indicator

### Working Indicator Content
- Show the ACTUAL status text from tmux (e.g. "✻ Dilly-dallying… 1m 17s · 304 tokens")
- Keep the pulsing animation and context gauge
- Read the status line from tmux capture-pane (last few lines contain the status)

### Tool Output
- Hide completely — tool calls and results don't appear in chat
- Patterns to add: `● Bash(...)`, `● Read(...)`, `● Edit(...)`, `● Skill(...)`, `⎿` continuation lines, `… +N lines` collapsed markers, JSON result blocks, `✻`/`✶` status lines

### Claude's Discretion
- Exact regex patterns for new classifier rules
- How to extract the live status line from tmux (poll capture-pane last lines?)
- Whether to broadcast status line changes via WebSocket

</decisions>

<specifics>
## Specific Ideas

Real tmux output patterns observed:
- `● Bash(command...)` — tool invocation with bullet
- `⎿  result text` — tool result continuation
- `… +N lines (ctrl+o to expand)` — collapsed output
- `✻ Working… (1m 17s · ↓ 304 tokens · thought for 3s)` — working status
- `✶ Cooked for 13m 35s` — completion status  
- `❯ user input` — user prompt line
- `Skill(/gsd:quick)` — skill invocation
- Multi-line JSON blocks starting with `{`

</specifics>
