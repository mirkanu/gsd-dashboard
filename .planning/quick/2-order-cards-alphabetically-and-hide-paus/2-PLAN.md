---
phase: quick
plan: 2
type: execute
wave: 1
depends_on: []
files_modified:
  - client/src/pages/GSD.tsx
autonomous: true
requirements: [QUICK-2]

must_haves:
  truths:
    - "Active (working + waiting) project cards are sorted A-Z by name"
    - "Paused projects are hidden from the main grid"
    - "Paused projects are accessible in a collapsed section, like archived ones"
    - "Archived projects continue to work as before"
  artifacts:
    - path: "client/src/pages/GSD.tsx"
      provides: "Updated project card grid with alphabetical sort and paused section"
  key_links:
    - from: "GSD component activeProjects"
      to: "project grid render"
      via: "sort comparator on name"
      pattern: "sort.*a\\.name.*b\\.name"
---

<objective>
Sort the active GSD project cards alphabetically by name and move paused projects into a collapsed section (mirroring how archived projects are handled).

Purpose: Makes it easy to find a specific project at a glance and reduces noise from paused work.
Output: Updated GSD.tsx with alphabetical sorting and paused-project collapsible section.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Alphabetical sort + paused section in GSD.tsx</name>
  <files>client/src/pages/GSD.tsx</files>
  <action>
In `client/src/pages/GSD.tsx`, make two changes inside the `GSD()` component:

**1. Split activeProjects into visible and paused**

Replace the existing split at line ~814:
```ts
const activeProjects = projects.filter(p => p.sessionState !== "archived");
```
with:
```ts
const visibleProjects = projects.filter(p => p.sessionState !== "archived" && p.sessionState !== "paused");
const pausedProjects  = projects.filter(p => p.sessionState === "paused");
const archivedProjects = projects.filter(p => p.sessionState === "archived");
```

Update the `pausedCount` stat badge — it already works from the raw `projects` array so no change needed there.

**2. Sort visibleProjects alphabetically by name**

Where the active grid is rendered (~line 892), change:
```ts
{[...activeProjects]
  .sort((a, b) => {
    const stateOrder: Record<string, number> = { waiting: 0, working: 1, paused: 2 };
    ...
  })
```
to:
```ts
{[...visibleProjects]
  .sort((a, b) => a.name.localeCompare(b.name))
```

**3. Add a paused collapsible section**

Add a new `[pausedOpen, setPausedOpen]` state variable (default `false`) alongside the existing `archivedOpen` state.

After the active grid closing `</div>` and before the archived section, insert a paused section that mirrors the archived section exactly but uses `pausedProjects` and `pausedOpen`/`setPausedOpen`. Label: "View paused ({pausedProjects.length})".

Do NOT change the archived section.
  </action>
  <verify>
    <automated>cd /data/home/gsddashboard && npm run test:client 2>&1 | tail -20</automated>
  </verify>
  <done>
    - visibleProjects excludes paused and archived
    - Cards in the main grid sort A-Z by project name
    - A "View paused (N)" collapsible appears below the main grid when pausedProjects.length > 0
    - Archived section unchanged
    - npm run test:client passes
  </done>
</task>

</tasks>

<verification>
After the task completes:
1. `npm run test:client` passes with no new failures
2. Inspect GSD.tsx: main grid uses `visibleProjects` sorted by `localeCompare`, paused section present
</verification>

<success_criteria>
- Project cards in the main grid are ordered A-Z by project name
- Paused projects do not appear in the main grid
- Paused projects are accessible via a collapsed "View paused (N)" toggle
- Archived behavior is unchanged
- No test regressions
</success_criteria>

<output>
After completion, create `.planning/quick/2-order-cards-alphabetically-and-hide-paus/2-SUMMARY.md`
</output>
