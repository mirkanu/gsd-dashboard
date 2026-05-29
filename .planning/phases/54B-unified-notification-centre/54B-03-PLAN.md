---
phase: 54B
plan: 03
type: execute
wave: 2
depends_on:
  - 54B-01
files_modified:
  - client/src/components/NotificationPolicyPanel.tsx
  - client/src/lib/api.ts
  - client/src/pages/ConfigPage.tsx
autonomous: true
requirements:
  - NTF-03
  - NTF-04

must_haves:
  truths:
    - "ConfigPage has a Notifications tab containing global enable toggle, quiet hours inputs, rate limit input, per-event toggles, and action buttons"
    - "Notifications tab loads policy via GET /api/notifications/policy on mount"
    - "Saving policy calls PUT /api/notifications/policy with the full current state"
    - "Send Test button calls POST /api/notifications/test and shows success/error feedback"
    - "Event toggles match the 10 events from ROADMAP with correct defaults (on/off per NTF-02)"
    - "Quiet hours inputs are type=time (UTC); helper text says 'UTC'"
    - "Rate limit input is type=number min=1, shows 'Max N per hour'"
    - "All toggles use role=switch aria-checked for accessibility"
    - "api.notifications namespace added to client/src/lib/api.ts"
  artifacts:
    - path: "client/src/components/NotificationPolicyPanel.tsx"
      provides: "Full notifications settings panel component"
      exports: ["NotificationPolicyPanel"]
    - path: "client/src/lib/api.ts"
      provides: "api.notifications.getPolicy, api.notifications.savePolicy, api.notifications.sendTest"
      contains: "notifications:"
    - path: "client/src/pages/ConfigPage.tsx"
      provides: "Notifications tab wired to NotificationPolicyPanel"
      contains: "NotificationPolicyPanel"
  key_links:
    - from: "client/src/pages/ConfigPage.tsx"
      to: "client/src/components/NotificationPolicyPanel.tsx"
      via: "import + render in Notifications tab"
      pattern: "NotificationPolicyPanel"
    - from: "client/src/components/NotificationPolicyPanel.tsx"
      to: "client/src/lib/api.ts"
      via: "api.notifications.getPolicy / savePolicy / sendTest"
      pattern: "api.notifications"
---

<objective>
Build the Notifications tab UI in ConfigPage.

Purpose: Give users a single place to govern all notification policy: enable/disable, quiet hours, rate limit, and per-event toggles. Calls the API routes from Plan 02.
Output: NotificationPolicyPanel.tsx component, api.ts notifications namespace extension, ConfigPage.tsx Notifications tab wiring.
</objective>

<execution_context>
@/data/home/gsddashboard/.claude/get-shit-done/workflows/execute-plan.md
@/data/home/gsddashboard/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/phases/54B-unified-notification-centre/54B-UI-SPEC.md
@.planning/phases/54B-unified-notification-centre/54B-PATTERNS.md
@.planning/phases/54B-unified-notification-centre/54B-01-SUMMARY.md
@.planning/phases/54B-unified-notification-centre/54B-02-SUMMARY.md

<interfaces>
<!-- Key types and contracts extracted from codebase. -->

From client/src/lib/api.ts (namespace pattern to copy):
```ts
// existing namespace example:
config: {
  getProjectSettings: (project: string) =>
    request<ProjectSettings>(`/config/project-settings/${encodeURIComponent(project)}`),
  saveProjectSettings: (project: string, settings: Partial<ProjectSettings>) =>
    request<{ ok: boolean; settings: ProjectSettings }>(`/config/project-settings/${encodeURIComponent(project)}`, {
      method: "PUT",
      body: JSON.stringify(settings),
    }),
},
// request<T>() is the existing typed fetch helper already defined in api.ts
```

From client/src/pages/ConfigPage.tsx (Toggle component to copy verbatim, lines ~44-78):
```tsx
function Toggle({ checked, onChange, label, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean;
}) {
  return (
    <label className="flex items-center justify-between py-2 cursor-pointer group">
      <span className="text-sm text-gray-300 group-hover:text-gray-100 transition-colors">{label}</span>
      <button type="button" role="switch" aria-checked={checked} disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${checked ? "bg-accent" : "bg-surface-3"} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}>
        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform duration-200 ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
      </button>
    </label>
  );
}
```

CSS design tokens (from index.css and ConfigPage usage):
- Card: `bg-surface-2 border border-border rounded-xl p-4 space-y-3`
- Input: `bg-surface-1 border border-border rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-accent/50`
- Primary button: `bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium`
- Secondary button: `bg-surface-3 text-gray-300 hover:bg-surface-3/80 px-4 py-2 rounded-lg text-sm`
- Save feedback: `flex items-center gap-1 text-emerald-400 text-xs`
- Helper text: `text-xs text-gray-500 mt-1`

Event type list (NTF-02 defaults from ROADMAP):
```ts
const EVENT_TYPES = [
  { key: 'waiting_input',       label: 'Session waiting for user input',         defaultOn: true  },
  { key: 'plan_complete',       label: 'Plan/phase completed',                   defaultOn: true  },
  { key: 'verify_failed',       label: 'Verify-work failed',                     defaultOn: true  },
  { key: 'verify_passed',       label: 'Verify-work passed (after retry)',        defaultOn: false },
  { key: 'idle_session_closed', label: 'Idle session auto-closed',               defaultOn: true  },
  { key: 'cost_anomaly',        label: 'External service cost anomaly',           defaultOn: true  },
  { key: 'github_issue_filed',  label: 'New GitHub Issue filed (Launched only)', defaultOn: false },
  { key: 'session_started',     label: 'Session started',                        defaultOn: false },
  { key: 'tool_use',            label: 'Individual tool-use events',              defaultOn: false },
  { key: 'turn_complete',       label: 'Claude finished responding (per turn)',   defaultOn: false },
];
```

NotificationPolicy type (to define in api.ts):
```ts
export interface NotificationPolicy {
  enabled: boolean;
  quiet_hours_from: string | null;
  quiet_hours_to: string | null;
  rate_limit_per_hour: number;
  event_toggles: Record<string, boolean>;
}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add api.notifications namespace to api.ts + NotificationPolicy type</name>
  <files>client/src/lib/api.ts</files>

  <read_first>
    - client/src/lib/api.ts — read the full file to find where to add the new namespace (after `config:` block) and where types are declared
  </read_first>

  <action>
1. Add `NotificationPolicy` interface to the types section of api.ts (alongside other exported interfaces):
```ts
export interface NotificationPolicy {
  enabled: boolean;
  quiet_hours_from: string | null;
  quiet_hours_to: string | null;
  rate_limit_per_hour: number;
  event_toggles: Record<string, boolean>;
}
```

2. Add `notifications` namespace to the `api` object (after the `config` namespace):
```ts
notifications: {
  getPolicy: () =>
    request<{ policy: NotificationPolicy }>('/notifications/policy'),
  savePolicy: (policy: Partial<NotificationPolicy>) =>
    request<{ ok: boolean; policy: NotificationPolicy }>('/notifications/policy', {
      method: 'PUT',
      body: JSON.stringify(policy),
    }),
  sendTest: () =>
    request<{ ok: boolean }>('/notifications/test', { method: 'POST' }),
},
```

Do not change any existing namespace.
  </action>

  <verify>
    <automated>npm run test:client</automated>
  </verify>

  <acceptance_criteria>
    - grep "notifications:" /home/services/gsddashboard/client/src/lib/api.ts
    - grep "getPolicy" /home/services/gsddashboard/client/src/lib/api.ts
    - grep "NotificationPolicy" /home/services/gsddashboard/client/src/lib/api.ts
    - npm run test:client exits 0
  </acceptance_criteria>

  <done>api.notifications namespace with getPolicy, savePolicy, sendTest defined. NotificationPolicy interface exported. Tests pass.</done>
</task>

<task type="auto">
  <name>Task 2: Create NotificationPolicyPanel.tsx and wire into ConfigPage Notifications tab</name>
  <files>client/src/components/NotificationPolicyPanel.tsx, client/src/pages/ConfigPage.tsx</files>

  <read_first>
    - client/src/pages/ConfigPage.tsx — read the full file to understand: (a) existing tab structure to add Notifications tab, (b) Toggle component to import or co-locate, (c) section card pattern, (d) load/save hooks pattern, (e) where to add the new tab button in the tab bar
    - client/src/lib/api.ts — confirm api.notifications.getPolicy, savePolicy, sendTest signatures (just added in Task 1)
  </read_first>

  <action>
**Create client/src/components/NotificationPolicyPanel.tsx:**

The component receives no props (it is self-fetching, same as UsagePanel). Full structure:

```tsx
import { useState, useEffect, useCallback } from "react";
import { Bell, BellOff, Check, Clock, Loader2, AlertCircle } from "lucide-react";
import { api } from "../lib/api";
import type { NotificationPolicy } from "../lib/api";

// Copy Toggle verbatim from ConfigPage.tsx (do not import from ConfigPage — co-locate here)
function Toggle({ checked, onChange, label, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean;
}) {
  return (
    <label className="flex items-center justify-between py-2 cursor-pointer group">
      <span className="text-sm text-gray-300 group-hover:text-gray-100 transition-colors">{label}</span>
      <button type="button" role="switch" aria-checked={checked} disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${checked ? "bg-accent" : "bg-surface-3"} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}>
        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform duration-200 ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
      </button>
    </label>
  );
}

const EVENT_TYPES = [
  { key: 'waiting_input',       label: 'Session waiting for user input',         defaultOn: true  },
  { key: 'plan_complete',       label: 'Plan/phase completed',                   defaultOn: true  },
  { key: 'verify_failed',       label: 'Verify-work failed',                     defaultOn: true  },
  { key: 'verify_passed',       label: 'Verify-work passed (after retry)',        defaultOn: false },
  { key: 'idle_session_closed', label: 'Idle session auto-closed',               defaultOn: true  },
  { key: 'cost_anomaly',        label: 'External service cost anomaly',           defaultOn: true  },
  { key: 'github_issue_filed',  label: 'New GitHub Issue filed (Launched only)', defaultOn: false },
  { key: 'session_started',     label: 'Session started',                        defaultOn: false },
  { key: 'tool_use',            label: 'Individual tool-use events',             defaultOn: false },
  { key: 'turn_complete',       label: 'Claude finished responding (per turn)',  defaultOn: false },
];

const DEFAULT_POLICY: NotificationPolicy = {
  enabled: true,
  quiet_hours_from: null,
  quiet_hours_to: null,
  rate_limit_per_hour: 5,
  event_toggles: {},
};

export function NotificationPolicyPanel() {
  const [policy, setPolicy] = useState<NotificationPolicy>(DEFAULT_POLICY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testState, setTestState] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const loadPolicy = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.notifications.getPolicy();
      setPolicy(data.policy);
    } catch {
      setPolicy(DEFAULT_POLICY);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPolicy(); }, [loadPolicy]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.notifications.savePolicy(policy);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTestState('sending');
    try {
      await api.notifications.sendTest();
      setTestState('ok');
      setTimeout(() => setTestState('idle'), 3000);
    } catch {
      setTestState('error');
      setTimeout(() => setTestState('idle'), 3000);
    }
  };

  const getToggle = (key: string) =>
    key in policy.event_toggles
      ? policy.event_toggles[key]
      : (EVENT_TYPES.find(e => e.key === key)?.defaultOn ?? false);

  const setToggle = (key: string, value: boolean) =>
    setPolicy(p => ({ ...p, event_toggles: { ...p.event_toggles, [key]: value } }));

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-4 w-32 bg-surface-3 rounded" />
        <div className="h-10 w-full bg-surface-3 rounded-lg" />
      </div>
    );
  }

  const allDisabled = !policy.enabled;

  return (
    <div className="space-y-4">
      {/* Global enable */}
      <div className="bg-surface-2 border border-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          {policy.enabled ? <Bell className="w-4 h-4 text-gray-400" /> : <BellOff className="w-4 h-4 text-gray-400" />}
          <h2 className="text-sm font-semibold text-gray-200">Notifications</h2>
        </div>
        <Toggle
          checked={policy.enabled}
          onChange={(v) => setPolicy(p => ({ ...p, enabled: v }))}
          label="Enable Telegram notifications"
        />
        <p className="text-xs text-gray-500 mt-1">Receive filtered Telegram messages for selected events.</p>
      </div>

      {/* Quiet hours */}
      <div className={`bg-surface-2 border border-border rounded-xl p-4 space-y-3 ${allDisabled ? "opacity-50 pointer-events-none" : ""}`}>
        <div className="flex items-center gap-2 mb-1">
          <Clock className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-200">Quiet Hours</h2>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400">From</label>
            <input
              type="time"
              value={policy.quiet_hours_from || ""}
              onChange={(e) => setPolicy(p => ({ ...p, quiet_hours_from: e.target.value || null }))}
              className="bg-surface-1 border border-border rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-accent/50"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400">To</label>
            <input
              type="time"
              value={policy.quiet_hours_to || ""}
              onChange={(e) => setPolicy(p => ({ ...p, quiet_hours_to: e.target.value || null }))}
              className="bg-surface-1 border border-border rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-accent/50"
            />
          </div>
        </div>
        <p className="text-xs text-gray-500">No notifications outside this window except high-priority. Times are UTC.</p>
      </div>

      {/* Rate limit */}
      <div className={`bg-surface-2 border border-border rounded-xl p-4 space-y-2 ${allDisabled ? "opacity-50 pointer-events-none" : ""}`}>
        <h2 className="text-sm font-semibold text-gray-200">Rate Limit</h2>
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-300">Max</label>
          <input
            type="number"
            min={1}
            max={100}
            value={policy.rate_limit_per_hour}
            onChange={(e) => setPolicy(p => ({ ...p, rate_limit_per_hour: Math.max(1, Math.min(100, Number(e.target.value))) }))}
            className="w-20 bg-surface-1 border border-border rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-accent/50"
          />
          <span className="text-sm text-gray-300">notifications per hour</span>
        </div>
        <p className="text-xs text-gray-500">Excess events are deduplicated or queued for later delivery.</p>
      </div>

      {/* Event toggles */}
      <div className={`bg-surface-2 border border-border rounded-xl p-4 space-y-1 ${allDisabled ? "opacity-50 pointer-events-none" : ""}`}>
        <h2 className="text-sm font-semibold text-gray-200 mb-2">Event Types</h2>
        {EVENT_TYPES.map(({ key, label }) => (
          <Toggle
            key={key}
            checked={getToggle(key)}
            onChange={(v) => setToggle(key, v)}
            label={label}
            disabled={allDisabled}
          />
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Action row */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={handleTest}
          disabled={testState === 'sending'}
          className="bg-surface-3 text-gray-300 hover:bg-surface-3/80 px-4 py-2 rounded-lg text-sm flex items-center gap-2 disabled:opacity-50"
        >
          {testState === 'sending' && <Loader2 className="w-3 h-3 animate-spin" />}
          {testState === 'ok' && <Check className="w-3 h-3 text-emerald-400" />}
          {testState === 'error' ? 'Send failed' : testState === 'ok' ? 'Sent!' : 'Send Test'}
        </button>

        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : saved ? <Check className="w-3 h-3" /> : null}
          {saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
```

**Modify client/src/pages/ConfigPage.tsx:**

Add a Notifications tab to the existing tab bar. The exact location depends on what tabs already exist — read the file first to find the tab bar JSX. Add a tab button for "Notifications" and render `<NotificationPolicyPanel />` when that tab is active.

Steps:
1. Add import at top: `import { NotificationPolicyPanel } from "../components/NotificationPolicyPanel";`
2. Add "notifications" to the tab state type/options (e.g., alongside "global", "project", or whatever tabs exist)
3. Add a tab button: 
```tsx
<button onClick={() => setActiveTab("notifications")}
  className={activeTab === "notifications" ? "... active styles ..." : "... inactive styles ..."}>
  Notifications
</button>
```
4. Add a conditional render in the tab content area:
```tsx
{activeTab === "notifications" && <NotificationPolicyPanel />}
```

Match the exact tab button className pattern used by existing tabs — do not invent new styles.

Also add a deprecation notice in the existing Telegram Alerts section (if present) pointing to the Notifications tab:
```tsx
<p className="text-xs text-gray-500 mt-2">
  Notification settings have moved to the <strong>Notifications</strong> tab. 
  Your existing preferences were preserved.
</p>
```
  </action>

  <verify>
    <automated>npm run test:client</automated>
  </verify>

  <acceptance_criteria>
    - test -f /home/services/gsddashboard/client/src/components/NotificationPolicyPanel.tsx
    - grep "export function NotificationPolicyPanel" /home/services/gsddashboard/client/src/components/NotificationPolicyPanel.tsx
    - grep "role=\"switch\"" /home/services/gsddashboard/client/src/components/NotificationPolicyPanel.tsx
    - grep "type=\"time\"" /home/services/gsddashboard/client/src/components/NotificationPolicyPanel.tsx
    - grep "UTC" /home/services/gsddashboard/client/src/components/NotificationPolicyPanel.tsx (helper text)
    - grep "api.notifications" /home/services/gsddashboard/client/src/components/NotificationPolicyPanel.tsx
    - grep "NotificationPolicyPanel" /home/services/gsddashboard/client/src/pages/ConfigPage.tsx
    - npm run test:client exits 0
  </acceptance_criteria>

  <done>NotificationPolicyPanel.tsx created with 10-event toggle list, quiet hours, rate limit, test button, save button. Wired into ConfigPage Notifications tab. Tests pass.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Browser → PUT /api/notifications/policy | User-controlled values; validated server-side in Plan 02 |
| Browser → POST /api/notifications/test | No user input; fires test message to user's own Telegram |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-54B-03-A | Tampering | NotificationPolicyPanel rate_limit_per_hour input | mitigate | Client clamps value to 1–100 on onChange; server validates independently |
| T-54B-03-B | Information Disclosure | event_toggles state in React | accept | Client-side only; no secrets stored in toggle state |
</threat_model>

<verification>
npm run build exits 0 (Vite build clean, no TypeScript errors).
npm run test:client exits 0.
Dashboard renders ConfigPage with a Notifications tab that loads and saves policy without console errors.
</verification>

<success_criteria>
- NotificationPolicyPanel.tsx exists and exports NotificationPolicyPanel
- ConfigPage has a Notifications tab that renders the panel
- api.notifications namespace present with getPolicy, savePolicy, sendTest
- All event types from ROADMAP present as toggles
- Quiet hours inputs with UTC helper text
- npm run test:client passes
</success_criteria>

<output>
After completion, create `.planning/phases/54B-unified-notification-centre/54B-03-SUMMARY.md`
</output>
