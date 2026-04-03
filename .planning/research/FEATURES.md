# Feature Landscape: v4.0 Chat-First Dashboard

**Domain:** Chat-based project monitoring UI
**Researched:** 2026-04-03

## Table Stakes

Features users expect in a chat-first project dashboard. Missing = feels broken or incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Chat list with project rows | Primary navigation. WhatsApp/Telegram both have this. Without it, no way to select a project. | Medium | ConversationList from chatscope. Sort by recency (last message timestamp). |
| Per-project message thread | Core interaction model. Each project is a conversation with Claude/GSD. | Medium | ChatContainer + MessageList from chatscope. Messages from gsd_messages table. |
| Typed message rendering | Raw terminal output is unreadable as chat. Must distinguish stages, errors, completions. | High | Custom message renderers per type. Server classifier produces typed messages. |
| Send box that dispatches to tmux | User must be able to type commands / answers. Existing send-keys API already works. | Low | MessageInput from chatscope, wired to existing POST /api/gsd/terminal/send endpoint. |
| State-colored indicators | User needs at-a-glance project state (working/waiting/paused/archived). Exists in kanban. | Low | Colored border or avatar dot on ConversationList items. Reuse existing state detection. |
| Unread message badges | Without badges, user doesn't know which project has new activity. | Medium | Track last-read timestamp per project. Compare with latest message timestamp. |
| Real-time message streaming | Messages must appear as Claude works, not on manual refresh. | Medium | Extend existing WebSocket with chat:message events. Classifier runs on polling interval. |
| Dark mode support | Existing feature in v3.0. Must carry forward. | Medium | CSS overrides on chatscope .cs-* classes scoped to .dark parent. ~20-30 variables. |

## Differentiators

Features that set this apart from a basic chat wrapper.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Tappable command buttons | GSD commands (plan-phase, execute-phase, qa-run) rendered as tap targets, not typed text. Reduces errors for non-coder user. | Medium | Render input_request messages with button array. On tap, send command via send-keys API. |
| Multi-choice answer buttons | When Claude asks "Continue? (Y/n)" or presents numbered options, render as tappable choices instead of requiring typed response. | Medium | Classifier detects choice patterns in terminal output. Render as button group. |
| Working indicator with context gauge | Shows Claude is actively working + how much context is used. More informative than a generic spinner. | Low | Animated dots in message list + progress bar from existing token tracking. |
| Stage banner messages | Phase transitions (PLAN, EXECUTE, RESEARCH) rendered as full-width banners in chat timeline. Visual anchors for scrolling. | Low | Classifier detects stage patterns. Render as Message.CustomContent with distinct styling. |
| Chat header tap for project detail | Tap the project name/header to slide open a detail panel with all controls (autopilot, file tabs, raw terminal, settings). | Medium | Replaces the current drawer. All existing controls must be accessible. |
| Preserved history for paused/archived | Full conversation history visible even when project is paused. Sending a message triggers reopen confirmation. | Low | Messages persist in SQLite. Paused projects show history read-only with "Reopen?" prompt on send. |

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Full terminal emulation in chat | Mixing chat bubbles with raw terminal output creates visual chaos. Users cannot distinguish Claude's structured responses from noisy build output. | Keep raw terminal in a separate panel (accessible via header tap). Chat shows classified, readable messages only. |
| Editable/deletable messages | This is a monitoring dashboard, not a messaging app. Messages represent terminal history -- they cannot be edited or deleted. | Messages are append-only. Provide "clear history" as a project-level action if needed. |
| Threaded replies / reactions | Over-engineering a single-user dashboard to look like Slack. No second user to reply to or react for. | Flat message list. Chronological. Simple. |
| AI-generated message summaries | Summarizing Claude's output with another AI call adds latency, cost, and potential hallucination. | The classifier already extracts structured types (stage, completion, error). That IS the summary. |
| Notification sounds | Annoying for a monitoring dashboard that updates frequently. | Visual indicators (unread badges, colored borders) are sufficient. |
| Message search | Over-engineering for v4.0. Search across projects adds complexity for marginal value. | Defer. If needed later, SQLite FTS5 on gsd_messages is straightforward. |

## Feature Dependencies

```
Message Classifier (server)
    --> Typed Message Persistence (gsd_messages schema extension)
        --> Chat Message Rendering (client)
            --> Tappable Command Buttons
            --> Multi-choice Answer Buttons
            --> Stage Banner Messages

Chat List View
    --> Unread Badge Tracking
    --> State-colored Indicators (reuses existing state detection)

Real-time Streaming (WebSocket extension)
    --> Live Message Appearance
    --> Working Indicator
    --> Unread Count Updates

Project Detail Panel
    --> All Existing Controls (autopilot, file tabs, terminal, settings)
    --> Raw Terminal Access (existing xterm.js overlay)
```

## MVP Recommendation

Prioritize:
1. **Chat list with project rows** -- primary navigation, replaces kanban
2. **Per-project message thread with typed rendering** -- core value of the redesign
3. **Send box dispatching to tmux** -- basic interaction
4. **Unread badges + state indicators** -- at-a-glance awareness
5. **Tappable command buttons** -- key differentiator for non-coder user

Defer:
- **Working indicator with context gauge**: Nice visual but not blocking. Add after core chat works.
- **Chat header detail panel**: Can keep existing drawer temporarily. Migrate controls in a later phase.
- **Multi-choice answer buttons**: Requires robust choice detection in classifier. Start with text-based choices, add buttons after patterns are validated.

## Sources

- PROJECT.md active requirements for v4.0
- WhatsApp Web and Telegram Desktop UI patterns (industry standard chat layout)
- @chatscope/chat-ui-kit-react Storybook demos (component capabilities)
