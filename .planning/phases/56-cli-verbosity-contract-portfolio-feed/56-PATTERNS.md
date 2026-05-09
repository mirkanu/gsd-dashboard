# Phase 56: CLI Verbosity Contract + Portfolio Feed - Pattern Map

**Mapped:** 2026-05-09
**Files analyzed:** 10 new/modified files
**Analogs found:** 10 / 10

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server/gsd/tmux.js` (extend) | utility | transform | self (existing `extractCurrentTask`) | exact |
| `server/gsd/stateBroadcaster.js` (extend) | service | event-driven | self (existing `_testPollOnce`) | exact |
| `server/gsd/proxyStateBroadcaster.js` (check) | service | event-driven | self (existing `_pollUpstreamOnce`) | exact |
| New: `server/gsd/feedStore.js` | service | event-driven | `server/gsd/stateBroadcaster.js` (in-memory Map pattern) | role-match |
| New: `server/routes/feed.js` | route | request-response | `server/routes/events.js` | exact |
| `client/src/pages/Dashboard.tsx` (extend) | component | request-response | self (existing "Recent Activity" section lines 273–317) | exact |
| `client/src/components/Sidebar.tsx` (extend) | component | request-response | self (existing `PRIMARY_ITEMS` array) | exact |
| `client/src/App.tsx` (extend) | config | request-response | self (existing route declarations lines 56–79) | exact |
| `client/src/pages/ConfigPage.tsx` (extend) | component | request-response | self (existing "Telegram Alerts" section lines 515–547) | exact |
| New: `client/src/components/EventTypeBadge.tsx` | component | transform | `client/src/components/StatusBadge.tsx` | exact |
| New: `client/src/pages/FeedPage.tsx` | component | request-response | `client/src/pages/UsagePage.tsx` + `client/src/pages/EnvEditorPage.tsx` | role-match |

---

## Pattern Assignments

### `server/gsd/tmux.js` — extend `extractCurrentTask()` with landmark detection

**Analog:** self — `server/gsd/tmux.js`

**Existing function signature to extend** (lines 396–455):
```javascript
function extractCurrentTask(rawText) {
  if (!rawText) return null;
  const lines = rawText.split('\n');
  // ... chromePatterns array, strategy 1 (user input box), strategy 2 (recent buffer)
  return null;
}
```

**New export to add** — peer function `extractLandmarkEvent(rawText, projectName)`:
- Same top-of-file module structure: `'use strict'`, `require('strip-ansi')`, no DB imports
- Return `null | { type: 'plan_complete'|'verify_passed'|'verify_failed'|'waiting_input'|'phase_complete', label: string, projectName: string, detectedAt: string }`
- Use `stripAnsi(line).trim()` on each line before regex matching (same as `extractCurrentTask`)

**Regex patterns to detect** (implement inside the new function scanning bottom-up like Strategy 2):
- `plan_complete`: `/SUMMARY\.md written/i` or `/plan\s+\d+\s+(complete|done)/i` or `/gsd-execute-phase.*done/i`
- `verify_passed`: `/verify.*passed/i` or `/all tests pass/i` or `/verification.*passed/i`
- `verify_failed`: `/verify.*failed/i` or `/tests.*failed/i` or `/verification.*failed/i`
- `phase_complete`: `/phase\s+\d+\s+(complete|done)/i` or `/all plans.*done/i`
- `waiting_input` is NOT regex-detected here — it is detected by state transition in `stateBroadcaster.js`

**Module exports pattern** (lines 186–191 of stateBroadcaster.js for reference shape):
```javascript
module.exports = {
  // ... existing exports ...
  extractLandmarkEvent,
};
```

---

### `server/gsd/feedStore.js` — new in-memory event store

**Analog:** `server/gsd/stateBroadcaster.js` (in-memory Map pattern)

**Module structure** (copy from stateBroadcaster.js lines 1–13):
```javascript
'use strict';

// In-memory store: array of feed entries, newest first. Resets on server restart.
// Max MAX_EVENTS entries total across all projects.
const MAX_EVENTS = 200;
const events = [];
```

**Core push function** — modeled on how `snapshot.set()` is called inside `_testPollOnce`:
```javascript
/**
 * Push a landmark event to the in-memory feed store.
 * @param {{ type: string, projectName: string, projectDisplayName: string, label: string, detectedAt: string }} entry
 */
function pushEvent(entry) {
  events.unshift({ ...entry, id: crypto.randomUUID() });
  if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;
}

function getEvents() {
  return [...events];
}

function _resetEvents() {
  events.length = 0;
}

module.exports = { pushEvent, getEvents, _resetEvents };
```

**No DB, no file I/O** — pure in-memory, consistent with D-07.

---

### `server/gsd/stateBroadcaster.js` — add landmark event emission

**Analog:** self — `server/gsd/stateBroadcaster.js`

**Integration point** — inside `_testPollOnce`, after pane-state transition is detected (lines 116–134):
```javascript
// Pane-state transitioned — update snapshot and broadcast
const entry = { ... };
snapshot.set(project.name, entry);

broadcastFn('project_state_change', { ... });

// NEW: check for landmark events and push to feed
// 1. waiting_input detection — reuse the rawPaneState → 'waiting' transition
if (sessionState === 'waiting' && prevRaw !== 'waiting') {
  feedStore.pushEvent({
    type: 'waiting_input',
    projectName: project.name,
    projectDisplayName: project.display_name || project.name,
    label: `Waiting for input on ${project.display_name || project.name}`,
    detectedAt: nowIso,
  });
  broadcastFn('feed_event', feedStore.getEvents()[0]);
}

// 2. regex-based landmark detection on every poll (not just transitions)
const landmark = extractLandmarkEvent(paneText, project.name);
if (landmark) {
  feedStore.pushEvent({ ...landmark, projectDisplayName: project.display_name || project.name });
  broadcastFn('feed_event', feedStore.getEvents()[0]);
}
```

**Import additions at top of file**:
```javascript
const feedStore = require('./feedStore');
const { extractLandmarkEvent } = require('./tmux');
```

**Deduplication concern:** extractLandmarkEvent may fire on the same text multiple times during a stable pane. Track last-emitted event per project (add `lastLandmarkAt` to snapshot) and skip if < 30s since last landmark.

---

### `server/gsd/proxyStateBroadcaster.js` — check if landmark events flow through proxy

**Analog:** self — `server/gsd/proxyStateBroadcaster.js`

**Assessment:** Proxy mode polls upstream `/api/gsd/projects` — it does NOT receive tmux pane text. Landmark event detection (regex on pane text) cannot run in proxy mode. The proxy should instead poll a new upstream `/api/feed` endpoint and re-broadcast `feed_event` messages.

**New upstream poll** — add inside `_pollUpstreamOnce` or a parallel `_pollFeedOnce` function:
```javascript
// In proxy: poll upstream feed and re-broadcast new entries
async function _pollFeedOnce(fetchFeedFn, broadcastFn) {
  let payload;
  try {
    payload = await fetchFeedFn();
  } catch {
    return 0;
  }
  const entries = Array.isArray(payload?.events) ? payload.events : [];
  // Diff against last known entry id — broadcast only new ones
  // ... (track lastSeenId in module-level variable)
}
```

**If proxy mode is not a priority for Phase 56**, the proxy can simply pass through: when the upstream already emits `feed_event` via WebSocket, the proxy WS relay in `terminal.js`/`proxy.js` may already forward it. Confirm before adding complexity.

---

### New: `server/routes/feed.js` — GET /api/feed

**Analog:** `server/routes/events.js` (lines 1–18) — exact match: simple GET returning in-memory array

**Full file pattern** (copy events.js structure, replace DB call with feedStore):
```javascript
'use strict';

const { Router } = require('express');
const feedStore = require('../gsd/feedStore');

const router = Router();

// GET /api/feed — return in-memory landmark event feed
router.get('/', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 200, 200);
  const events = feedStore.getEvents().slice(0, limit);
  res.json({ events });
});

module.exports = router;
```

**Registration** — in `server/app.js` (or wherever routes are mounted), add:
```javascript
app.use('/api/feed', require('./routes/feed'));
```

---

### `client/src/App.tsx` — add `/feed` route, replace `/activity` redirect

**Analog:** self — `client/src/App.tsx` lines 56–79

**Current `/activity` line** (line 66):
```tsx
<Route path="activity" element={<Navigate to="/" replace />} />
```

**Replace with** (follow pattern of other route declarations):
```tsx
import { FeedPage } from './pages/FeedPage';
// ...
<Route path="feed" element={<FeedPage />} />
// Remove or redirect /activity to /feed:
<Route path="activity" element={<Navigate to="/feed" replace />} />
```

**Import addition** follows the existing import block (lines 1–17) — add `FeedPage` import in alphabetical order.

---

### `client/src/components/Sidebar.tsx` — add `/feed` nav entry

**Analog:** self — `client/src/components/Sidebar.tsx`

**Existing `PRIMARY_ITEMS` array** (lines 28–35):
```tsx
const PRIMARY_ITEMS = [
  { to: "/gsd", icon: MapPin, label: "GSD Projects" },
  { to: "/services", icon: Server, label: "Services" },
  { to: "/usage", icon: Coins, label: "Usage" },
  { to: "/config", icon: Wrench, label: "Config" },
  { to: "/env", icon: FileKey, label: "Environment" },
  { to: "/server", icon: Monitor, label: "Server" },
] as const;
```

**New entry** — insert after `/gsd`, before `/services`, per D-04:
```tsx
{ to: "/feed", icon: Rss, label: "Feed" },
```

**Import addition** — add `Rss` to the lucide-react import block (line 2–23). `Rss` is already a lucide-react export (no new dependency).

**No other changes required** — `NavItem` component and map loop already handle the new entry.

---

### `client/src/pages/Dashboard.tsx` — replace "Recent Activity" with Portfolio Feed preview

**Analog:** self — `client/src/pages/Dashboard.tsx` lines 273–317

**Current "Recent Activity" section** (lines 273–317) to replace wholesale:
```tsx
{/* Recent activity */}
<div>
  <div className="flex items-center justify-between mb-4">
    <h3 className="text-sm font-medium text-gray-300">Recent Activity</h3>
    <button onClick={() => navigate("/activity")} className="btn-ghost text-xs">
      View All <ArrowRight className="w-3 h-3" />
    </button>
  </div>
  {recentEvents.length === 0 ? (
    <EmptyState icon={Activity} title="No activity yet" description="..." />
  ) : (
    <div className="card divide-y divide-border">
      {recentEvents.slice(0, 8).map((event, i) => (
        <div key={event.id ?? i} className="px-4 py-3 flex items-center gap-3 hover:bg-surface-4 transition-colors cursor-pointer" onClick={...}>
          <AgentStatusBadge status={...} />
          <span className="text-sm text-gray-300 truncate flex-1">...</span>
          <span className="text-[11px] text-gray-600 flex-shrink-0">...</span>
        </div>
      ))}
    </div>
  )}
</div>
```

**New Portfolio Feed preview** — follow exact same shell, swap internals:
```tsx
{/* Portfolio Feed preview */}
<div>
  <div className="flex items-center justify-between mb-4">
    <h3 className="text-sm font-semibold text-gray-300">Portfolio Feed</h3>
    <button onClick={() => navigate("/feed")} className="btn-ghost text-xs flex items-center gap-1">
      View All <ArrowRight className="w-3 h-3" />
    </button>
  </div>
  {feedEvents.length === 0 ? (
    <EmptyState icon={Activity} title="No events yet" description="Landmark events from GSD sessions will appear here." />
  ) : (
    <div className="card divide-y divide-border">
      {feedEvents.slice(0, 5).map((event) => (
        <div key={event.id} className="px-4 py-3 flex items-center gap-3 hover:bg-surface-4 transition-colors">
          <EventTypeBadge type={event.type} />
          <span className="text-sm text-gray-300 truncate flex-1">{event.label}</span>
          <span className="text-[11px] text-gray-600 flex-shrink-0">{timeAgo(event.detectedAt)}</span>
        </div>
      ))}
    </div>
  )}
</div>
```

**State to add** — feed events sourced from WebSocket `feed_event` messages OR initial fetch of `/api/feed`:
```tsx
const [feedEvents, setFeedEvents] = useState<FeedEntry[]>([]);
// On mount: fetch('/api/feed').then(d => setFeedEvents(d.events))
// On WS message type 'feed_event': setFeedEvents(prev => [msg.data, ...prev].slice(0, 5))
```

**`timeAgo` function** — already exists in Dashboard.tsx (used for existing activity timestamps).

---

### New: `client/src/components/EventTypeBadge.tsx`

**Analog:** `client/src/components/StatusBadge.tsx` (lines 1–32) — exact pattern match

**Copy structure from StatusBadge.tsx** (lines 9–23):
```tsx
export function AgentStatusBadge({ status, pulse }: AgentStatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  const shouldPulse = pulse ?? (status === "working" || status === "connected");
  return (
    <span className={`badge ${config.bg} ${config.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot} ${shouldPulse ? "animate-pulse-dot" : ""}`} />
      {config.label}
    </span>
  );
}
```

**New component** — same shape, no dot/pulse (historical events):
```tsx
export type LandmarkEventType = 'plan_complete' | 'verify_passed' | 'verify_failed' | 'waiting_input' | 'phase_complete';

const EVENT_CONFIG: Record<LandmarkEventType, { label: string; className: string }> = {
  plan_complete:   { label: 'Plan done',     className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  verify_passed:   { label: 'Verify passed', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  verify_failed:   { label: 'Verify failed', className: 'bg-red-500/10 text-red-400 border-red-500/20' },
  waiting_input:   { label: 'Waiting',       className: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  phase_complete:  { label: 'Phase done',    className: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
};

interface EventTypeBadgeProps {
  type: LandmarkEventType;
}

export function EventTypeBadge({ type }: EventTypeBadgeProps) {
  const config = EVENT_CONFIG[type] ?? EVENT_CONFIG.plan_complete;
  return (
    <span className={`badge ${config.className}`}>
      {config.label}
    </span>
  );
}
```

**`badge` CSS class** — from `client/src/index.css`: `inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full border`. No inline styles needed.

---

### New: `client/src/pages/FeedPage.tsx`

**Analog:** `client/src/pages/UsagePage.tsx` (page header + card layout) + `client/src/pages/EnvEditorPage.tsx` (load-on-mount + error state pattern)

**Page header pattern** (from EnvEditorPage.tsx lines 94–108):
```tsx
<div className="space-y-6 p-6 max-w-4xl mx-auto">
  <div className="flex items-start gap-4">
    <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center flex-shrink-0">
      <Rss className="w-5 h-5 text-accent" />
    </div>
    <div>
      <h1 className="text-2xl font-semibold text-gray-100">Portfolio Feed</h1>
      <p className="text-sm text-gray-500 mt-1">
        Landmark events across all GSD projects. Resets on server restart.
      </p>
    </div>
  </div>
```

**Load-on-mount pattern** (from EnvEditorPage.tsx lines 37–56):
```tsx
const [events, setEvents] = useState<FeedEntry[]>([]);
const [loading, setLoading] = useState(true);
const [loadError, setLoadError] = useState<string | null>(null);

const load = useCallback(async () => {
  setLoading(true);
  setLoadError(null);
  try {
    const res = await fetch('/api/feed');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    setEvents(data.events ?? []);
  } catch (e: unknown) {
    setLoadError(e instanceof Error ? e.message : 'Network error');
  } finally {
    setLoading(false);
  }
}, []);

useEffect(() => { load(); }, [load]);
```

**Error state pattern** (from EnvEditorPage.tsx lines 140–154):
```tsx
{loadError && (
  <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
    <p>Could not load feed. Check server connection.</p>
  </div>
)}
```

**Feed card body** — follow Dashboard "Recent Activity" card pattern (lines 288–315), but with project badge column:
```tsx
<div className="card divide-y divide-border">
  {events.map((event) => (
    <div key={event.id} className="px-4 py-3 flex items-center gap-3 hover:bg-surface-4 transition-colors">
      <EventTypeBadge type={event.type} />
      <span className="text-sm text-gray-300 truncate flex-1">{event.label}</span>
      <span className="text-xs text-gray-500 font-mono flex-shrink-0">{event.projectName}</span>
      <span className="text-[11px] text-gray-600 flex-shrink-0">{timeAgo(event.detectedAt)}</span>
    </div>
  ))}
</div>
```

**Empty state pattern** (from Dashboard.tsx lines 281–287 using EmptyState component):
```tsx
<EmptyState
  icon={Rss}
  title="No events yet"
  description="Landmark events from GSD sessions will appear here."
/>
```

**WS live update** — subscribe to `feed_event` messages via `eventBus` (same pattern used in Dashboard.tsx for `project_state_change`). Prepend new event to `events` state.

---

### `client/src/pages/ConfigPage.tsx` — add GSD Verbosity Overrides section

**Analog:** self — `client/src/pages/ConfigPage.tsx` "Telegram Alerts" section (lines 515–547) + "Claude Session Verbosity" saved-indicator pattern (lines 482–493)

**New section card** — insert between "Claude Session Verbosity" and "Telegram Alerts" sections. Copy section card shell from "Telegram Alerts" (lines 516–547):
```tsx
{/* GSD Verbosity Overrides */}
<div className="bg-surface-2 border border-border rounded-xl p-4 space-y-3">
  <div className="flex items-center gap-2 mb-1">
    <Wrench className="w-4 h-4 text-gray-400" />
    <h2 className="text-sm font-semibold text-gray-200">GSD Verbosity Overrides</h2>
    {(settingsSaved === 'suppress_context_reask' || settingsSaved === 'suppress_plan_ceremony') && (
      <span className="flex items-center gap-1 text-emerald-400 text-xs ml-auto">
        <Check className="w-3 h-3" /> Saved
      </span>
    )}
  </div>
  <p className="text-xs text-gray-500">Per-project only. Has no effect on the Global tab.</p>

  {isGlobal ? (
    <p className="text-sm text-gray-500 italic">Select a project to configure GSD verbosity overrides.</p>
  ) : settingsLoading ? (
    <SettingsSkeleton />
  ) : (
    <div className="space-y-3">
      <div className="space-y-1">
        <Toggle
          checked={settings?.suppress_context_reask ?? false}
          onChange={(v) => handleGsdToggle('suppress_context_reask', v)}
          label="Skip CONTEXT.md re-asking when file already exists"
        />
        <p className="text-xs text-gray-600">When on, GSD skips the discuss-phase interview if CONTEXT.md is already present.</p>
      </div>
      <div className="space-y-1">
        <Toggle
          checked={settings?.suppress_plan_ceremony ?? false}
          onChange={(v) => handleGsdToggle('suppress_plan_ceremony', v)}
          label="Suppress plan preamble and postamble narration"
        />
        <p className="text-xs text-gray-600">When on, GSD omits the opening and closing narration around each plan execution.</p>
      </div>
    </div>
  )}
</div>
```

**Handler** — follow `handleAlertToggle` pattern (lines 337–342):
```tsx
const handleGsdToggle = (key: 'suppress_context_reask' | 'suppress_plan_ceremony', value: boolean) => {
  if (!settings) return;
  setSettings({ ...settings, [key]: value });
  saveSettings({ [key]: value }, key);
};
```

**`ProjectSettings` type extension** — add to `client/src/lib/types.ts`:
```tsx
export interface ProjectSettings {
  // ... existing fields ...
  suppress_context_reask?: boolean;
  suppress_plan_ceremony?: boolean;
}
```

**Server-side storage** — the two boolean fields must be persisted. Options:
1. Extend the existing `project_settings` DB table with two new columns (requires migration) — follow `config.js` PUT handler (lines 213–240) which already uses an UPSERT pattern
2. Store in `.planning/config.json` per-project (as mentioned in D-11) — requires a new file-based API route separate from DB

D-11 says "writes to `.planning/config.json`" — this suggests a separate route/store from the existing SQLite-backed `project-settings`. Check if a `/api/config/gsd-settings` endpoint is cleaner. For now, **the safest path is extending the existing `project_settings` DB table** (new nullable boolean columns, no breaking changes to existing rows).

---

## Shared Patterns

### In-memory Map pattern (server)
**Source:** `server/gsd/stateBroadcaster.js` lines 11–13
**Apply to:** `server/gsd/feedStore.js`
```javascript
// In-memory snapshot: key -> value
const snapshot = new Map();
```

### WebSocket broadcast shape
**Source:** `server/gsd/stateBroadcaster.js` lines 126–133
**Apply to:** `server/gsd/stateBroadcaster.js` landmark emission, `server/gsd/proxyStateBroadcaster.js`
```javascript
broadcastFn('project_state_change', {
  project: project.name,
  sessionState: effectiveState,
  // ...
});
// New landmark shape:
broadcastFn('feed_event', {
  id: string,
  type: 'plan_complete' | 'verify_passed' | 'verify_failed' | 'waiting_input' | 'phase_complete',
  projectName: string,
  projectDisplayName: string,
  label: string,
  detectedAt: string, // ISO
});
```

### Toggle + auto-save pattern (frontend)
**Source:** `client/src/pages/ConfigPage.tsx` lines 337–342 (`handleAlertToggle`) + lines 259–288 (`saveSettings`)
**Apply to:** `ConfigPage.tsx` new GSD Verbosity Overrides toggles
```tsx
const handleAlertToggle = (key: string, value: boolean) => {
  if (!settings) return;
  const newAlerts = { ...settings.telegram_alerts, [key]: value };
  setSettings({ ...settings, telegram_alerts: newAlerts });
  saveSettings({ telegram_alerts: newAlerts }, key);
};
// Saved feedback:
setSettingsSaved(feedbackKey);
setTimeout(() => setSettingsSaved(null), 2000);
```

### Saved indicator pattern (frontend)
**Source:** `client/src/pages/ConfigPage.tsx` lines 488–493
**Apply to:** new ConfigPage section, FeedPage save actions
```tsx
{settingsSaved === 'key' && (
  <span className="flex items-center gap-1 text-emerald-400 text-xs ml-auto">
    <Check className="w-3 h-3" /> Saved
  </span>
)}
```

### `badge` CSS class
**Source:** `client/src/index.css` `.badge` definition — `inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full border`
**Apply to:** `EventTypeBadge.tsx`
```tsx
<span className={`badge ${colorClasses}`}>{label}</span>
```

### Page load error pattern (frontend)
**Source:** `client/src/pages/EnvEditorPage.tsx` lines 140–154
**Apply to:** `FeedPage.tsx`
```tsx
{loadError && (
  <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
    <p>Could not load feed. Check server connection.</p>
  </div>
)}
```

### Route + sidebar entry pattern
**Source:** `client/src/App.tsx` lines 56–79 + `client/src/components/Sidebar.tsx` lines 28–35
**Apply to:** `/feed` route and sidebar entry
- Route: `<Route path="feed" element={<FeedPage />} />`
- Sidebar entry: `{ to: "/feed", icon: Rss, label: "Feed" }` in `PRIMARY_ITEMS`

---

## No Analog Found

All files have analogs. No entries.

---

## Metadata

**Analog search scope:** `server/gsd/`, `server/routes/`, `client/src/pages/`, `client/src/components/`, `client/src/lib/`
**Files scanned:** 14 files read directly
**Pattern extraction date:** 2026-05-09
