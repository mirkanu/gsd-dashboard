# Phase 73: Volume Lifecycle Management - Context

**Gathered:** 2026-05-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Prevent Hetzner volume crises through automated Docker cleanup and dashboard visibility. Deliver: (1) Docker space breakdown folded into the existing Disk Usage section on `/server`, (2) fixed weekly prune cron using `--keep-storage 2gb`, (3) OOM protection status folded into the Memory card. No new pages, no schema changes, no deletion of services.bak.

</domain>

<decisions>
## Implementation Decisions

### Docker Space UI
- **D-01:** Fold Docker breakdown into the existing Disk Usage card on `/server` — do NOT create a separate card. Add a divider row below the disk mount table labelled "Docker" with 4 data points: Images, Containers, Volumes, Build Cache (size + reclaimable).
- **D-02:** New API endpoint `GET /system/docker-df` returns parsed output of `docker system df --format json`. Add to `server/routes/system.js` and `client/src/lib/api.ts`.
- **D-03:** Reclaimable amounts shown in muted text next to each size. Build Cache row gets a highlight (e.g. amber) when reclaimable > 5 GB.

### Prune Cron Policy
- **D-04:** Update `docker-prune` entry in `CRON_WHITELIST` (in `server/routes/system.js`) to run:
  1. `docker builder prune --keep-storage 2gb -f` (keep 2 GB of recent cache)
  2. `docker image prune -f` (dangling images only — NOT `-a`)
  Keep schedule: Sunday 4:00 AM. Update the actual `crontab -e` entry to match.
- **D-05:** Do NOT run `docker image prune -a` — that removes all unused images, which breaks cold restarts of services.

### OOM Protection Status
- **D-06:** Add an "OOM Protection" sub-section at the bottom of the existing Memory card, separated by a thin divider. Show two status rows:
  - `earlyoom` — check `systemctl is-active earlyoom`, show green dot if active / red if not
  - `Claude cap` — show "2.4 GB cgroup" as a static label (cap is always set; no live check needed)
- **D-07:** New API endpoint `GET /system/oom-status` returns `{ earlyoom: "active"|"inactive" }`. Backend runs `systemctl is-active earlyoom` via `execSync`.

### services.bak
- **D-08:** Do not delete `services.bak/` in this phase. Do not build UI for it. Leave as-is.

### Claude's Discretion
- Exact column widths, spacing, and color tokens for the Docker sub-section follow existing ServerPage patterns (use `text-muted-foreground`, `text-destructive`, amber = `text-amber-400`).
- Error states: if `docker system df` fails (Docker not reachable), show "unavailable" in muted italic — same pattern as `diskDetail`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing server page
- `client/src/pages/ServerPage.tsx` — current 298-line implementation; all new UI goes here
- `server/routes/system.js` — all system endpoints + CRON_WHITELIST; new endpoints go here
- `client/src/lib/api.ts` — API client; add `dockerDf` and `oomStatus` calls here
- `client/src/lib/types.ts` — TypeScript types; add `DockerDf` and `OomStatus` interfaces here

### Phase 72 disk work (prior art)
- `.planning/phases/72-disk-full-prevention/` — disk monitoring, prune-old-data, WAL checkpoint context

### OOM protection (added this session)
- `/etc/systemd/system/user-1000.slice.d/memory.conf` — cgroup cap (2.4 GB) for claude user
- `/home/services/hetzner-vps/systemd/user-1000.slice.d/memory.conf` — repo mirror of above

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `diskDetail` fetch pattern in `ServerPage.tsx` (lines ~52-53): `api.system.diskDetail().then(setDiskDetail).catch(() => {})` — use same pattern for `dockerDf` and `oomStatus`
- `diskWarning` conditional rendering: amber/red banner pattern reusable for high build cache warning
- Cron card `run-cron` flow: existing `runCron()`, `cronRunning`, `cronOutput` state — no changes needed, just update the CRON_WHITELIST entry

### Established Patterns
- New API data: fetch in `useEffect` alongside `refresh()`, store in `useState`, render inline
- Error handling: `.catch(() => {})` silently suppresses — same as `diskDetail`
- Styling: `rounded-lg border bg-card` cards, `divide-y` for rows, `text-muted-foreground` for secondary values

### Integration Points
- `server/routes/system.js` exports router mounted at `/system` in `server/index.js`
- `CRON_WHITELIST` object in `system.js` controls what `/run-cron/:name` can execute — update `docker-prune` entry here
- `client/src/lib/types.ts` needs new interfaces before `api.ts` can be typed

</code_context>

<specifics>
## Specific Ideas

- Docker sub-section layout chosen by user (from mockup): 2-column grid inside the Disk card — Images + Containers on one row, Build Cache + Volumes on the next, each with size and reclaimable.
- Build Cache reclaimable highlighted in amber when large (user saw the 13.8 GB number and wants it visible).
- OOM Protection: earlyoom active state shown as a green/red dot (`●`), claude cap shown as static text — no polling needed for the cap.

</specifics>

<deferred>
## Deferred Ideas

- **services.bak deletion** — 647 MB. User chose not to handle in this phase. Revisit when confident the backup is no longer needed.
- **Alert history** — disk warning banners are real-time only; a log of past disk alerts was not in scope.
- **Swap size increase** — discussed and rejected: earlyoom + cgroup cap provide sufficient protection without more swap.

</deferred>

---

*Phase: 73-Volume Lifecycle Management*
*Context gathered: 2026-05-29*
