---
phase: quick-37
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - client/src/pages/UsagePage.tsx
  - client/src/components/Sidebar.tsx
  - client/src/App.tsx
autonomous: true
requirements: [QUICK-37]
must_haves:
  truths:
    - "Usage page accessible from sidebar nav at /usage"
    - "Weekly aggregate gauge shows spend vs $50 limit with color coding"
    - "Per-project cost breakdown table shows project name and cost"
    - "7-day trend bar chart shows daily costs with day labels"
    - "Total spend displayed prominently"
    - "Skeleton loading state shown while data fetches"
    - "Error state with retry button when API fails"
  artifacts:
    - path: "client/src/pages/UsagePage.tsx"
      provides: "Full usage page with gauge, table, chart"
      min_lines: 120
    - path: "client/src/components/Sidebar.tsx"
      provides: "Usage nav item in PRIMARY_ITEMS"
      contains: "Usage"
    - path: "client/src/App.tsx"
      provides: "Route for /usage"
      contains: "UsagePage"
  key_links:
    - from: "client/src/pages/UsagePage.tsx"
      to: "/api/pricing/window"
      via: "api.pricing.window()"
      pattern: "api\\.pricing\\.window"
    - from: "client/src/pages/UsagePage.tsx"
      to: "/api/pricing/usage-history"
      via: "api.pricing.usageHistory()"
      pattern: "api\\.pricing\\.usageHistory"
    - from: "client/src/components/Sidebar.tsx"
      to: "/usage"
      via: "PRIMARY_ITEMS entry"
      pattern: "to.*usage"
    - from: "client/src/App.tsx"
      to: "client/src/pages/UsagePage.tsx"
      via: "Route element"
      pattern: "Route.*usage.*UsagePage"
---

<objective>
Create a dedicated Usage page at /usage that summarises Claude token usage across all projects. The page includes a weekly aggregate gauge, per-project cost breakdown table, 7-day trend bar chart, and total spend. Add it to the sidebar navigation.

Purpose: Give the user a single place to see all cost/usage data at a glance, beyond the compact UsagePanel in the sidebar.
Output: UsagePage.tsx, updated Sidebar.tsx and App.tsx
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@client/src/pages/ServicesPage.tsx (template for page structure, loading/error states)
@client/src/components/UsagePanel.tsx (reuse formatCost, getGaugeColor, getGaugeTextColor, getDayLabel, isToday, WEEKLY_LIMIT patterns)
@client/src/components/Sidebar.tsx (PRIMARY_ITEMS array, lucide icon imports)
@client/src/App.tsx (route registration pattern)
@client/src/lib/api.ts (api.pricing.window, api.pricing.usageHistory)
@client/src/lib/types.ts (UsageWindow, UsageHistory, UsageDay)

<interfaces>
From client/src/lib/types.ts:
```typescript
export interface UsageDay {
  date: string;
  cost: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
}
export interface UsageHistory { days: UsageDay[]; }
export interface UsageWindow {
  daily: { cost: number; from: string; hours_until_reset: number };
  weekly: {
    cost: number; from: string; hours_until_reset: number;
    by_project?: Array<{ cwd: string; cost: number }>;
  };
}
```

From client/src/lib/api.ts:
```typescript
api.pricing.window() => Promise<UsageWindow>
api.pricing.usageHistory() => Promise<UsageHistory>
```

From client/src/components/Sidebar.tsx:
```typescript
const PRIMARY_ITEMS = [
  { to: "/gsd", icon: MapPin, label: "GSD Projects" },
  { to: "/services", icon: Server, label: "Services" },
] as const;
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create UsagePage component</name>
  <files>client/src/pages/UsagePage.tsx</files>
  <action>
Create `client/src/pages/UsagePage.tsx` following the ServicesPage pattern (header with refresh button, skeleton loading, error with retry, data display).

Data fetching: Use same pattern as UsagePanel — `Promise.all([api.pricing.window(), api.pricing.usageHistory()])` with loading/error states and a `fetchData` callback for refresh.

Page layout (`max-w-5xl mx-auto p-6`):

1. **Header row** — "Usage" title, "Claude token usage across all projects" subtitle, refresh button (same pattern as ServicesPage).

2. **Summary cards row** (grid grid-cols-1 md:grid-cols-3 gap-4 mb-6) — three `bg-surface-1 border border-border rounded-lg p-4` cards:
   - **Weekly Spend**: Large `formatCost(weekly.cost)` with ` / $50` suffix, smaller "Resets in Xh" below. Use `getGaugeTextColor(pct)` for the cost color.
   - **Today's Spend**: Large `formatCost(daily.cost)` in accent color.
   - **7-Day Total**: Sum `historyData.days.map(d => d.cost)`, display with formatCost.

3. **Weekly gauge** (full-width card, mb-6) — Same gauge bar as UsagePanel but larger: h-3 bar, label row above ("Weekly Usage" left, "XX% of $50 limit" right), color-coded per getGaugeColor.

4. **7-Day Trend chart** (full-width card, mb-6) — Larger bar chart than UsagePanel sparkline. Each day is a vertical bar inside a flex container with `h-40` height. Bar width `flex-1 max-w-16`. Below each bar: day label (getDayLabel) and cost. Today's bar uses `bg-accent`, others `bg-accent/60`. Tooltip via `title` attribute with full date + cost.

5. **Per-Project Breakdown table** (full-width card) — Header "Cost by Project". If `weekly.by_project` exists and has entries, render a table:
   - Columns: Project (extract last path segment from cwd as project name using `cwd.split('/').pop()`), Cost (formatCost), Share (percentage of weekly total).
   - Sorted descending by cost.
   - Row styling: `border-b border-border/50 last:border-0`.
   - Each row has a small colored bar showing relative share (similar to gauge bar, width proportional to max project cost).
   - If no by_project data: show "No per-project breakdown available" in gray text.

Reuse helpers from UsagePanel — copy `formatCost`, `getGaugeColor`, `getGaugeTextColor`, `getDayLabel`, `isToday`, and `WEEKLY_LIMIT` into UsagePage (don't import from UsagePanel since they're not exported; keep it self-contained).

Skeleton loading: Show 3 skeleton summary cards + skeleton gauge + skeleton chart (animate-pulse, matching real layout shapes). Follow ServicesPage SkeletonCard pattern.

Error state: Same pattern as ServicesPage — centered error message + "Try again" button.

Export as named export: `export function UsagePage()`.
  </action>
  <verify>
    <automated>cd /data/home/gsddashboard && npx tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>UsagePage renders weekly gauge, summary cards, 7-day trend chart, per-project table using existing API data. Skeleton and error states handled.</done>
</task>

<task type="auto">
  <name>Task 2: Wire UsagePage into sidebar nav and router</name>
  <files>client/src/components/Sidebar.tsx, client/src/App.tsx</files>
  <action>
**Sidebar.tsx:**
1. Add `Coins` to the lucide-react import (the coin/money icon — fits "Usage" well).
2. Add entry to `PRIMARY_ITEMS` array after "Services":
   `{ to: "/usage", icon: Coins, label: "Usage" }`

**App.tsx:**
1. Add import: `import { UsagePage } from "./pages/UsagePage";`
2. Add route inside the Layout routes, after the services route:
   `<Route path="usage" element={<UsagePage />} />`
  </action>
  <verify>
    <automated>cd /data/home/gsddashboard && npx tsc --noEmit 2>&1 | head -20 && npm run build 2>&1 | tail -5</automated>
  </verify>
  <done>Sidebar shows "Usage" nav item with Coins icon. Clicking navigates to /usage which renders UsagePage. Build succeeds with no errors.</done>
</task>

</tasks>

<verification>
1. `npm run build` completes without errors
2. Visit /usage — page loads with skeleton, then shows usage data
3. Sidebar shows Usage item between Services and Agents Dashboard divider
4. Refresh button re-fetches data with spinner animation
5. Per-project table shows breakdown when by_project data exists
</verification>

<success_criteria>
- /usage route renders a full Usage page with weekly gauge, summary cards, 7-day trend, per-project table
- Sidebar nav includes "Usage" with Coins icon, active state highlights correctly
- Loading shows skeleton placeholders matching layout shape
- Error shows retry button
- Build passes with zero TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/37-add-dedicated-usage-page-with-cross-proj/37-SUMMARY.md`
</output>
