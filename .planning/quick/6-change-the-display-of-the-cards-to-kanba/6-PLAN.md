---
phase: quick-6
plan: 6
type: execute
wave: 1
depends_on: []
files_modified:
  - client/src/pages/GSD.tsx
autonomous: true
requirements: []

must_haves:
  truths:
    - "All four project states are visible — Waiting, Working, Paused, Archived — without clicking a filter"
    - "On desktop, all 4 columns sit side by side with equal width"
    - "On mobile, one column fills the viewport at a time and the user swipes left/right to move between columns"
    - "Each column header shows the state name and a count badge"
    - "Cards in each column scroll vertically when there are many"
  artifacts:
    - path: "client/src/pages/GSD.tsx"
      provides: "Kanban layout replacing the filtered single-grid view"
  key_links:
    - from: "client/src/pages/GSD.tsx"
      to: "SESSION_STATE_CONFIG"
      via: "column header color/label"
      pattern: "SESSION_STATE_CONFIG\\[.*\\]"
---

<objective>
Replace the current single-column filtered grid in GSD.tsx with a 4-column Kanban board.
Column order: Waiting, Working, Paused, Archived.

On desktop (md+): all 4 columns display side by side.
On mobile (narrow): CSS scroll-snap makes one column fill the viewport at a time; the user swipes left/right to navigate.

Purpose: Let the user see all project states at a glance on desktop, and navigate them naturally by swiping on mobile.
Output: GSD page renders 4 Kanban columns driven entirely by sessionState — no filter buttons needed.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@client/src/pages/GSD.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace filtered grid with Kanban layout (desktop side-by-side, mobile scroll-snap)</name>
  <files>client/src/pages/GSD.tsx</files>
  <action>
    In the GSD function component make these changes:

    1. Remove `activeFilter` state (line 577) and the `displayedProjects` derived value (lines 648-650).

    2. Remove the `workingCount`, `waitingCount`, `pausedCount`, `archivedCount` variables (lines 652-655).

    3. Remove the entire "Summary stats — clickable filter boxes" block (lines 688-731): the `{!loading && !error && projects.length > 0 && (...)}` section containing the 4-button grid and the Show All button.

    4. Replace the "Project cards grid" section (the `{!loading && !error && (...)}` block, lines 747-771) with a Kanban container that uses CSS scroll-snap on mobile and flex side-by-side on desktop:

    ```tsx
    {!loading && !error && (
      /* Kanban board
         Mobile:  scroll-snap-x, each column is min-w-full so it fills viewport, user swipes.
         Desktop: flex row, each column takes equal width (flex-1, min-w-0). */
      <div className="flex overflow-x-auto snap-x snap-mandatory gap-4 pb-4 -mx-4 px-4 md:-mx-8 md:px-8">
        {(["waiting", "working", "paused", "archived"] as import("../lib/types").SessionState[]).map((state) => {
          const conf = SESSION_STATE_CONFIG[state];
          const columnProjects = [...projects.filter(p => p.sessionState === state)]
            .sort((a, b) => a.name.localeCompare(b.name));
          return (
            <div
              key={state}
              /* Mobile: min-w-full snaps to center one column at a time.
                 Desktop (md+): flex-1 + min-w-0 shares space equally across all 4 columns. */
              className="bg-surface-1 rounded-xl border border-border p-3 flex flex-col flex-shrink-0 snap-center min-w-full md:min-w-0 md:flex-1"
            >
              {/* Column header */}
              <div className="flex items-center gap-2 mb-4 px-1">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  state === "waiting"  ? "bg-amber-400" :
                  state === "working"  ? "bg-emerald-500 animate-pulse" :
                  state === "paused"   ? "bg-red-500" :
                                         "bg-gray-600"
                }`} />
                <span className={`text-xs font-semibold uppercase tracking-wider ${conf.labelCls}`}>
                  {conf.label}
                </span>
                <span className="ml-auto text-[11px] text-gray-600 bg-surface-3 px-2 py-0.5 rounded-full">
                  {columnProjects.length}
                </span>
              </div>

              {/* Cards */}
              <div className="flex-1 space-y-2.5 overflow-y-auto max-h-[70vh]">
                {columnProjects.length > 0 ? (
                  columnProjects.map((project) => (
                    <ProjectCard
                      key={project.name}
                      project={project}
                      onSelect={setSelectedProject}
                      onOpenTerminal={(initialValue) => {
                        setTerminalProject(project.name);
                        setTerminalInitialValue(initialValue);
                      }}
                      onArchive={() => archiveProject(project.name)}
                      onUnarchive={() => unarchiveProject(project.name)}
                      onReopenTmux={() => load()}
                    />
                  ))
                ) : (
                  <div className="flex items-center justify-center h-24 text-xs text-gray-600">
                    No projects
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    )}
    ```

    Key implementation notes:
    - `snap-x snap-mandatory` on the container enables CSS scroll-snap; no JS library needed.
    - `snap-center min-w-full` on each column makes exactly one column visible per swipe on mobile.
    - `md:min-w-0 md:flex-1` overrides the mobile full-width so all 4 columns share space equally on desktop.
    - `animate-pulse` is a standard Tailwind utility; `animate-pulse-dot` from the old plan is non-standard, use the standard one.
    - `SESSION_STATE_CONFIG` at the top of the file already has the correct `label` and `labelCls` — use them.
    - Keep the `space-y-6` wrapper, header, rate-limit banner, loading state, error state, and all overlay components (GsdDrawer, MarkdownViewer, TerminalOverlay) exactly as-is.
  </action>
  <verify>
    <automated>cd /data/home/gsddashboard && npm run test:client -- --run 2>&1 | tail -20</automated>
  </verify>
  <done>
    GSD page shows 4 Kanban columns in order: Waiting, Working, Paused, Archived.
    On a wide viewport, all 4 columns are visible side by side.
    On a narrow viewport, one column fills the width; horizontal swiping snaps to the next column.
    Each column has a colored dot, label, and count badge.
    No filter buttons or Show All toggle remain.
    `npm run build` exits 0.
  </done>
</task>

</tasks>

<verification>
Run client tests: `cd /data/home/gsddashboard && npm run test:client -- --run`
Verify build: `cd /data/home/gsddashboard && npm run build`
</verification>

<success_criteria>
- GSD page renders 4 Kanban columns (Waiting, Working, Paused, Archived) simultaneously on desktop
- On mobile, CSS scroll-snap presents one column at a time; swiping moves between columns
- Column count badges reflect actual project counts per state
- No filter interaction required to see states
- `npm run build` exits 0
</success_criteria>

<output>
After completion, create `.planning/quick/6-change-the-display-of-the-cards-to-kanba/6-SUMMARY.md`
</output>
