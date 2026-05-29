---
phase: 73-volume-lifecycle-management
reviewed: 2026-05-29T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - server/routes/system.js
  - client/src/lib/types.ts
  - client/src/lib/api.ts
  - client/src/pages/ServerPage.tsx
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 73: Code Review Report

**Reviewed:** 2026-05-29
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Four files were reviewed covering the new system-monitoring endpoints (`server/routes/system.js`), their TypeScript types (`client/src/lib/types.ts`), the API client (`client/src/lib/api.ts`), and the frontend page (`client/src/pages/ServerPage.tsx`).

The implementation is broadly sound. The `CRON_WHITELIST` approach correctly prevents arbitrary command injection, and the shell commands used are reasonable for the task. Three warnings were identified — two correctness issues in the server and one in the client — plus three info-level items.

## Warnings

### WR-01: `readDisk` column mapping is order-dependent and breaks if `df` column order shifts

**File:** `server/routes/system.js:33-36`
**Issue:** `df -h --output=target,size,used,avail,pcent` requests five named columns in a fixed order. The parser then accesses them by positional index (`parts[0]` … `parts[4]`). This is fine today, but the column name used for the mount point (`target`) can produce a different number of fields on some Linux builds when paths contain spaces, causing columns to shift. More importantly: `parts[0]` is unconditionally assigned to `mount`, but `df --output` on some distributions may reorder output or insert extra header lines on very narrow terminals. A more defensive parse would match the named header rather than relying on the fixed offset.

The immediate practical risk is low given the controlled VPS environment, but the filter check `r.mount.startsWith(...)` silently passes garbage rows if parsing silently shifts.

**Fix:** After splitting, also validate that `parts[4]` looks like a percentage before including the row:
```js
.map((line) => {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 5) return null;
  // Reject rows where the last field doesn't look like a percentage
  if (!/^\d+%$/.test(parts[4])) return null;
  return { mount: parts[0], size: parts[1], used: parts[2], avail: parts[3], pct: parts[4] };
})
```

---

### WR-02: `readDisk` filter string `/dev/loop` matches wrong paths

**File:** `server/routes/system.js:43`
**Issue:** The filter `!r.mount.startsWith("/dev/loop")` tests the *mount point* (e.g. `/snap/core/…`), not the device path. Loop-back devices are mounted under `/snap/…`, not `/dev/loop`. The correct test for snap mounts is `!r.mount.startsWith("/snap")` (which is already present on line 44). The `/dev/loop` guard is therefore dead — no mount point ever starts with `/dev/loop`.

This is harmless in practice because the snap filter catches the same rows, but the dead guard is misleading.

**Fix:** Remove the redundant check:
```js
.filter(
  (r) =>
    !r.mount.startsWith("/sys") &&
    !r.mount.startsWith("/proc") &&
    !r.mount.startsWith("/snap")
)
```

---

### WR-03: `runCron` response may be sent twice when `execFile` errors after `child.on("error")` fires

**File:** `server/routes/system.js:201-213`
**Issue:** Two response paths exist for process spawn failure:
1. `child.on("error", ...)` — fires for spawn-level errors (binary not found, permission denied).
2. The `execFile` callback `(err, stdout, stderr)` — also fires when the process cannot start, immediately after the `error` event.

When a spawn-level error occurs, both handlers can fire in the same tick. The `error` handler guards with `!res.headersSent`, which should prevent a double-send. However, the `execFile` callback runs synchronously after `error` in the Node.js event queue and also tries to call `res.json(...)` without checking `res.headersSent`. If the `error` handler fires first and sends a 500, the callback will then attempt to call `res.json` on an already-closed response, producing an `ERR_HTTP_HEADERS_SENT` error that propagates as an unhandled exception.

**Fix:** Guard the callback's `res.json` call the same way:
```js
const child = execFile(cmd, args, { timeout: 60000 }, (err, stdout, stderr) => {
  if (res.headersSent) return;   // ← add this guard
  const output = (stdout || "") + (stderr || "");
  try { fs.appendFileSync(cfg.logFile, output); } catch { /* non-fatal */ }
  if (err && err.killed) {
    return res.status(504).json({ ok: false, output, error: "Timed out after 60s" });
  }
  res.json({ ok: !err || err.code === 0, output, exitCode: err ? err.code : 0 });
});
```

---

## Info

### IN-01: `ServerPage` silently drops `dockerDf` and `oomStatus` refresh on the 30-second interval

**File:** `client/src/pages/ServerPage.tsx:54-57`
**Issue:** The `setInterval` callback on line 54 refreshes `systemStats` and `cronStatus` every 30 seconds, but does not refresh `dockerDf` or `oomStatus`. These are fetched once on mount and then never updated. For a monitoring page, stale docker disk and OOM status data could mislead the operator.

**Fix:** Either add the two refreshes to the interval or document that these are intentionally polled infrequently. If low-cost refreshes are acceptable:
```js
const id = setInterval(() => {
  refresh();
  api.system.cronStatus().then(setCronJobs).catch(() => {});
  api.system.dockerDf().then(setDockerDf).catch(() => {});
  api.system.oomStatus().then(setOomStatus).catch(() => {});
}, 30_000);
```

---

### IN-02: `parseInt(d.pct)` called without a radix on user-controlled data

**File:** `client/src/pages/ServerPage.tsx:196`
**Issue:** `parseInt(d.pct)` is called on data from `df` output. While `df` always produces well-formed percentage strings, omitting the radix is a code-quality issue (`eslint/radix`). More importantly, if `d.pct` ever contains a value like `"08%"`, legacy JS engines may misparse it as octal (though modern engines do not). Passing `10` as the second argument is the safer and conventional form.

**Fix:**
```tsx
<span className={parseInt(d.pct, 10) > 85 ? "text-destructive font-medium" : ""}>{d.pct}</span>
```

---

### IN-03: `readDockerDf` silently swallows JSON parse errors and returns a partial result set

**File:** `server/routes/system.js:80-87`
**Issue:** `lines.map((line) => JSON.parse(line))` has no per-line error handling. If `docker system df --format '{{json .}}'` emits a non-JSON warning line (e.g. a deprecation notice prepended to stdout), `JSON.parse` throws and the entire outer `try/catch` swallows it, returning `{ entries: [], error: "unavailable" }`. This makes it look like Docker is unreachable rather than that one line was unparseable.

**Fix:** Wrap the per-line parse in a try/catch and skip bad lines:
```js
const entries = lines.flatMap((line) => {
  try {
    const obj = JSON.parse(line);
    return [{ type: obj.Type, size: obj.Size, reclaimable: obj.Reclaimable }];
  } catch {
    return [];
  }
});
```

---

_Reviewed: 2026-05-29_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
