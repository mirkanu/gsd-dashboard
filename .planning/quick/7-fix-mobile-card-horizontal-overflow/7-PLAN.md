---
phase: quick-7
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - client/src/pages/GSD.tsx
autonomous: true
requirements:
  - QUICK-7
must_haves:
  truths:
    - "ProjectCard components do not overflow horizontally inside Kanban columns on mobile"
    - "Cards render fully within the column width on narrow viewports"
  artifacts:
    - path: "client/src/pages/GSD.tsx"
      provides: "Defensive width-constraining classes on card root, card container, and status badge row"
  key_links:
    - from: "ProjectCard root div (line 456)"
      to: "column card container (line 729)"
      via: "w-full constrains card to column width"
---

<objective>
Fix mobile horizontal overflow on Kanban column cards. ProjectCard components break out of their column bounds on narrow viewports because the card root div lacks explicit width constraints and the column card container has no overflow-x guard.

Purpose: Cards should never overflow the column; mobile users should see clean, contained cards.
Output: Three targeted Tailwind class additions in GSD.tsx that eliminate horizontal overflow.
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
  <name>Task 1: Add defensive width constraints to ProjectCard and its column container</name>
  <files>client/src/pages/GSD.tsx</files>
  <action>
Make three targeted class additions (minimal diff, no structural changes):

1. **Card root div (line 456):** Add `w-full` and `min-w-0` to the existing className string.
   Before: `className={\`card flex flex-col gap-0 overflow-hidden cursor-pointer ${stateConf.border}\`}`
   After:  `className={\`card flex flex-col gap-0 overflow-hidden cursor-pointer w-full min-w-0 ${stateConf.border}\`}`

2. **Status badge row (line 469):** Already has `min-w-0 flex-shrink overflow-hidden` — confirm these are present and add `overflow-hidden` if missing. No change needed if already correct.

3. **Column card container (line 729):** Add `overflow-x-hidden min-w-0` to the existing className.
   Before: `className="flex-1 space-y-2.5 overflow-y-auto max-h-[70vh]"`
   After:  `className="flex-1 space-y-2.5 overflow-y-auto overflow-x-hidden min-w-0 max-h-[70vh]"`

Do NOT change any other classes, layout structure, or logic. Preserve existing behavior.
  </action>
  <verify>
    <automated>cd /data/home/gsddashboard && npm run test:client 2>&1 | tail -20</automated>
  </verify>
  <done>
    - `w-full min-w-0` present on ProjectCard root div
    - `overflow-x-hidden min-w-0` present on column card container div
    - `npm run test:client` passes with no new failures
  </done>
</task>

</tasks>

<verification>
After the fix:
- Load the GSD page in a browser at a narrow viewport (e.g. 375px wide)
- Scroll to the Kanban board
- Each card must render fully within its column — no horizontal scrollbar appears within a column, no card content bleeds past the column edge
- Run `npm run test:client` — all tests pass
</verification>

<success_criteria>
Cards are contained within column width on mobile viewports. No horizontal overflow. Tests pass.
</success_criteria>

<output>
After completion, create `.planning/quick/7-fix-mobile-card-horizontal-overflow/7-SUMMARY.md`
</output>
