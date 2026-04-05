# Quick Task 27: Remove chat window, make terminal the primary view - Context

**Gathered:** 2026-04-05
**Status:** Ready for planning

<domain>
## Task Boundary

Remove the chat window entirely and make the terminal the primary/default center panel. Desktop layout becomes: project list | terminal (always on) | project info panel. Mobile defaults to terminal after project select.

</domain>

<decisions>
## Implementation Decisions

### Desktop Layout
- Auto-connect: selecting a project immediately opens its terminal — zero clicks to get working
- Terminal replaces ChatWindow as the center column content
- Project info panel stays on the right as-is

### Mobile Navigation
- Info button: small icon button in the terminal header that opens the existing GsdDrawer overlay
- Mobile defaults to terminal view after selecting a project (not chat)

### Send Bar
- Keep the send bar below terminal on mobile (typing into xterm is awkward on mobile)
- Desktop: no send bar needed, type directly into terminal

### Cleanup Scope
- Full removal: delete ChatWindow, ChatMessageRenderer, message classifier, and all chat-related API calls from the client
- Server-side message ingestion/storage stays (hooks still log to SQLite) — but client chat components go entirely

### Claude's Discretion
- Exact approach for auto-connecting terminal on project select (ref vs state management)
- How to handle the "Messages" tab in ProjectDetailsPanel — remove it since chat is gone, or keep as a read-only log

</decisions>

<specifics>
## Specific Ideas

- Current terminal overlay component (`TerminalOverlay` in GSD.tsx) already supports `inline={true}` mode — reuse this
- Current mobile send bar and key bar already exist in terminal overlay — just need to be visible by default
- The existing `GsdDrawer` component can be reused for the mobile info button

</specifics>
