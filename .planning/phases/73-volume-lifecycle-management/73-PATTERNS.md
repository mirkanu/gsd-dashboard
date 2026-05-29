# Phase 73: Volume Lifecycle Management - Pattern Map

**Mapped:** 2026-05-29
**Files analyzed:** 4
**Analogs found:** 4 / 4

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `client/src/pages/ServerPage.tsx` | component | request-response | itself (modify in place) | exact |
| `server/routes/system.js` | route/controller | request-response | itself (modify in place) | exact |
| `client/src/lib/api.ts` | utility/api-client | request-response | `api.system` block (lines 337-345) | exact |
| `client/src/lib/types.ts` | types | — | `DiskDetailEntry`, `CronJobStatus` interfaces | exact |

---

## Pattern Assignments

### `server/routes/system.js` — two new GET endpoints

**Analog:** existing `GET /disk-detail` handler (lines 75-97) and `readSwap()` helper (lines 8-22).

**Imports / top-of-file pattern** (lines 1-6):
```js
const { Router } = require("express");
const os = require("os");
const { execSync, execFile } = require("child_process");
const fs = require("fs");

const router = Router();
```

**execSync helper pattern** — `readSwap()` (lines 8-22):
```js
function readSwap() {
  try {
    const meminfo = fs.readFileSync("/proc/meminfo", "utf8");
    // ... parse and return object
  } catch {
    return { swap_total_mb: 0, swap_used_mb: 0 };
  }
}
```
Use the same try/catch + fallback shape for `readDockerDf()` and `readOomStatus()`.

**Route handler pattern** — `GET /disk-detail` (lines 75-97):
```js
router.get("/disk-detail", (_req, res) => {
  try {
    // ... execSync calls
    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```
Copy this exact shape for `GET /docker-df` and `GET /oom-status`.

**execSync options pattern** (line 26):
```js
execSync("...", { timeout: 3000 })
```
Use `{ timeout: 5000 }` for `docker system df` (Docker can be slow).

**CRON_WHITELIST entry to update** (lines 99-107 — current, replace `args`):
```js
"docker-prune": {
  schedule: "Sun 4:00 AM",
  logFile: "/var/log/docker-prune.log",
  cmd: "docker",
  args: ["system", "prune", "-f"],   // <-- replace with two-step sequence
  useSudo: true,
},
```
D-04 requires replacing the single `args` entry with two sequential commands. Because `execFile` runs one command, the implementation must either:
- Change `args` to invoke `bash -c "docker builder prune --keep-storage 2gb -f && docker image prune -f"` with `cmd: "bash"` and `args: ["-c", "docker builder prune --keep-storage 2gb -f && docker image prune -f"]` and `useSudo: false` (runs as root via Docker socket already), OR
- Keep `cmd: "sudo"` and use `args: ["bash", "-c", "docker builder prune --keep-storage 2gb -f && docker image prune -f"]`.

The `run-cron` executor at lines 153-154 already handles the `useSudo` flag by prepending `sudo`.

---

### `client/src/lib/types.ts` — two new interfaces

**Analog:** `DiskDetailEntry` (lines 442-446) and `CronJobStatus` (lines 453-459) — same file.

**Pattern to copy** (lines 442-459):
```typescript
export interface DiskDetailEntry {
  dir: string;
  size: string | null;
  error: string | null;
}

export interface CronJobStatus {
  name: string;
  schedule: string;
  lastRun: string | null;
  lastOutput: string | null;
  running: boolean;
}
```

**New interfaces to add** (add below `RunCronResult`, around line 467):
```typescript
export interface DockerDfEntry {
  type: string;        // "Images" | "Containers" | "Local Volumes" | "Build Cache"
  size: string;        // e.g. "13.8GB"
  reclaimable: string; // e.g. "7.2GB"
}

export interface DockerDf {
  entries: DockerDfEntry[];
  error: string | null;
}

export interface OomStatus {
  earlyoom: "active" | "inactive";
}
```

---

### `client/src/lib/api.ts` — two new calls in `api.system`

**Analog:** existing `api.system` block (lines 337-345):
```typescript
system: {
  get: () => request<SystemStats>("/system"),
  diskDetail: () => request<DiskDetailEntry[]>("/system/disk-detail"),
  cronStatus: () => request<CronJobStatus[]>("/system/cron-status"),
  runCron: (name: string) =>
    request<RunCronResult>(`/system/run-cron/${encodeURIComponent(name)}`, {
      method: "POST",
    }),
},
```

**Pattern to extend** — add two lines inside the `system` object:
```typescript
dockerDf: () => request<DockerDf>("/system/docker-df"),
oomStatus: () => request<OomStatus>("/system/oom-status"),
```

Import `DockerDf` and `OomStatus` in the import block at lines 1-25 alongside the existing system types.

---

### `client/src/pages/ServerPage.tsx` — three additions

#### 1. New state variables (add alongside line 12-16 state block)

**Analog:** `diskDetail` state (line 12):
```typescript
const [diskDetail, setDiskDetail] = useState<DiskDetailEntry[]>([]);
```

**Pattern to copy** for the two new state vars:
```typescript
const [dockerDf, setDockerDf] = useState<DockerDf | null>(null);
const [oomStatus, setOomStatus] = useState<OomStatus | null>(null);
```

#### 2. useEffect fetch calls (add alongside lines 48-49)

**Analog:** `diskDetail` fetch (line 48):
```typescript
api.system.diskDetail().then(setDiskDetail).catch(() => {});
```

**Pattern to copy** (add on new lines after line 49):
```typescript
api.system.dockerDf().then(setDockerDf).catch(() => {});
api.system.oomStatus().then(setOomStatus).catch(() => {});
```
Note: these do NOT go inside the `setInterval` — they are one-shot on mount, same as `diskDetail`.

#### 3. Docker sub-section JSX (add inside the Disk Usage card, after the `</table>` closing tag at line 178)

**Analog:** Directory Breakdown section (lines 213-229):
```tsx
{diskDetail.length > 0 && (
  <div className="rounded-lg border bg-card">
    <div className="flex items-center gap-2 p-4 font-medium border-b">
      <HardDrive className="h-4 w-4 text-muted-foreground" /> Directory Breakdown
    </div>
    <div className="divide-y">
      {diskDetail.map((d) => (
        <div key={d.dir} className="flex items-center justify-between px-4 py-2 text-sm">
          <span className="font-mono text-muted-foreground truncate">{d.dir}</span>
          <span className={d.error ? "text-muted-foreground italic" : "font-medium tabular-nums"}>
            {d.error ? "unavailable" : d.size}
          </span>
        </div>
      ))}
    </div>
  </div>
)}
```

For the Docker sub-section, the pattern is a divider row inside the existing Disk card — NOT a new `rounded-lg border bg-card` wrapper. Use `<div className="border-t">` to separate from the mount table, then a `<div className="p-3 font-medium text-sm">Docker</div>` label, then a 2-column grid of 4 data points.

**Error/unavailable pattern** — copy from `diskDetail` rendering:
```tsx
{d.error ? "unavailable" : d.size}
// className: d.error ? "text-muted-foreground italic" : "font-medium tabular-nums"
```

**Amber highlight pattern** — copy from `diskWarning` banner (line 94):
```tsx
className={`... ${diskWarning.level === "critical" ? "... text-destructive" : "... text-orange-400"}`}
```
For build cache: `reclaimableMb > 5120 ? "text-amber-400" : "text-muted-foreground"`.

#### 4. OOM Protection sub-section JSX (add inside Memory card, after swap progress bar block ending around line 143)

**Analog:** swap sub-section inside Memory card (lines 131-143):
```tsx
{data.memory.swap_total_mb > 0 && (
  <>
    <div className="flex justify-between text-sm">
      <span>Swap</span>
      <span className="text-muted-foreground">
        {data.memory.swap_used_mb} / {data.memory.swap_total_mb} MB ({swapPct}%)
      </span>
    </div>
    <div className="h-2 rounded-full bg-muted overflow-hidden">
      <div className="h-full bg-orange-500 rounded-full transition-all" style={{ width: `${swapPct}%` }} />
    </div>
  </>
)}
```

**OOM section pattern** — add after the swap block, separated by `<div className="border-t pt-2 mt-1">`:
```tsx
<div className="border-t pt-2 mt-1 space-y-1.5">
  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">OOM Protection</div>
  <div className="flex justify-between text-sm">
    <span>earlyoom</span>
    <span className={oomStatus?.earlyoom === "active" ? "text-emerald-400" : "text-destructive"}>
      {oomStatus == null ? "—" : oomStatus.earlyoom === "active" ? "● active" : "● inactive"}
    </span>
  </div>
  <div className="flex justify-between text-sm">
    <span>Claude cap</span>
    <span className="text-muted-foreground">2.4 GB cgroup</span>
  </div>
</div>
```

**Green/red dot color pattern** — matches `STATUS_CONFIG` in `types.ts` (lines 484-518):
- Active/green: `text-emerald-400`
- Inactive/error: `text-destructive`

---

## Shared Patterns

### Silent error suppression
**Source:** `ServerPage.tsx` line 48
**Apply to:** all three new `api.system.*` fetch calls
```typescript
api.system.diskDetail().then(setDiskDetail).catch(() => {});
```

### "unavailable" fallback text
**Source:** `ServerPage.tsx` lines 222-225
**Apply to:** dockerDf fetch failure (show "unavailable" in muted italic for each Docker row)
```tsx
<span className={d.error ? "text-muted-foreground italic" : "font-medium tabular-nums"}>
  {d.error ? "unavailable" : d.size}
</span>
```

### execSync with timeout + try/catch fallback
**Source:** `server/routes/system.js` lines 26-27, 86-88
**Apply to:** `readDockerDf()` and `readOomStatus()` helpers
```js
const out = execSync("...", { timeout: 5000 }).toString();
// ...
} catch {
  return { entries: [], error: "unavailable" };
}
```

### Card structure
**Source:** `ServerPage.tsx` lines 117-145 (Memory card), 149-179 (Disk card)
**Apply to:** both new sub-sections (Docker inside Disk card, OOM inside Memory card)
```tsx
<div className="rounded-lg border bg-card p-4 space-y-3">
  <div className="flex items-center gap-2 font-medium">
    <Icon className="h-4 w-4 text-muted-foreground" /> Card Title
  </div>
  {/* content */}
</div>
```
Both new sub-sections are inserted INSIDE existing cards, not as new top-level cards.

---

## No Analog Found

None. All four files have exact analogs in the codebase.

---

## Metadata

**Analog search scope:** `client/src/`, `server/routes/`
**Files scanned:** 4 canonical files read in full
**Pattern extraction date:** 2026-05-29
