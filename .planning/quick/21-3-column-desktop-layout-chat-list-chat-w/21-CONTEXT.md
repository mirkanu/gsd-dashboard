# Quick Task 21: 3-Column Desktop Layout - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Task Boundary

Add a 3-column layout for desktop/wide screens only. Mobile stays as-is (single view switching).

</domain>

<decisions>
## Implementation Decisions

### Empty State
- Show 3 columns immediately: chat list left, "Select a project" middle, empty right
- Chat list does NOT expand to fill — columns always visible

### Right Panel
- Always visible when a project is selected — no toggle needed
- Shows Project Details (Tasks, Plan, Roadmap, etc.) using existing GsdDrawer content

### Terminal
- On desktop: replaces chat in middle column temporarily, chat returns on close
- On mobile: unchanged (opens in new tab)
- Only for wide screens

### Column Widths
- 20% left (chat list) / 50% middle (chat) / 30% right (details)

### Breakpoint
- Claude's Discretion — use Tailwind `md:` or `lg:` breakpoint for 3-column activation

### Mobile Behavior
- Unchanged — single-column view switching (list → chat → back) as currently implemented

</decisions>

<specifics>
## Specific Ideas

- Telegram Desktop is the reference UI
- Chat list should show filter tabs and project rows in narrow 20% column
- Right panel reuses GsdDrawer content but rendered inline (not as overlay)

</specifics>
