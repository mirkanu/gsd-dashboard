import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Cpu, HardDrive, Activity, MemoryStick, Terminal } from "lucide-react";
import { api } from "../lib/api";
import { eventBus } from "../lib/eventBus";
import type { SystemStats, DiskWarningEvent, CronJobStatus, DockerDf, OomStatus, ZramStats, DiskAttribution } from "../lib/types";

export function ServerPage() {
  const [data, setData] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [diskWarning, setDiskWarning] = useState<{ pct: number; level: string } | null>(null);
  const [cronJobs, setCronJobs] = useState<CronJobStatus[]>([]);
  const [cronRunning, setCronRunning] = useState<Record<string, boolean>>({});
  const [cronOutput, setCronOutput] = useState<Record<string, string | null>>({});
  const [cronExpanded, setCronExpanded] = useState<Record<string, boolean>>({});
  const [dockerDf, setDockerDf] = useState<DockerDf | null>(null);
  const [oomStatus, setOomStatus] = useState<OomStatus | null>(null);
  const [zramStats, setZramStats] = useState<ZramStats | null>(null);
  const [diskAttribution, setDiskAttribution] = useState<DiskAttribution | null>(null);
  const [sortMode, setSortMode] = useState<"cpu" | "mem">("cpu");

  const refresh = useCallback(async () => {
    try {
      const res = await api.system.get();
      setData(res);
      setLastUpdated(new Date());
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load system stats");
    } finally {
      setLoading(false);
    }
  }, []);

  const runCron = useCallback(async (name: string) => {
    setCronRunning(prev => ({ ...prev, [name]: true }));
    setCronOutput(prev => ({ ...prev, [name]: null }));
    try {
      const result = await api.system.runCron(name);
      setCronOutput(prev => ({ ...prev, [name]: result.output || "(no output)" }));
      api.system.cronStatus().then(setCronJobs).catch(() => {});
    } catch (e) {
      setCronOutput(prev => ({ ...prev, [name]: e instanceof Error ? e.message : "Error" }));
    } finally {
      setCronRunning(prev => ({ ...prev, [name]: false }));
    }
  }, []);

  useEffect(() => {
    refresh();
    api.system.cronStatus().then(setCronJobs).catch(() => {});
    api.system.dockerDf().then(setDockerDf).catch(() => {});
    api.system.oomStatus().then(setOomStatus).catch(() => {});
    api.system.zram().then(setZramStats).catch(() => {});
    api.system.diskAttribution().then(setDiskAttribution).catch(() => {});
    const id = setInterval(() => {
      refresh();
      api.system.cronStatus().then(setCronJobs).catch(() => {});
    }, 30_000);
    const unsub = eventBus.subscribe((msg) => {
      if (msg.type === "system:disk-warning") {
        const d = msg.data as DiskWarningEvent;
        setDiskWarning(d.level === "clear" ? null : { pct: d.pct, level: d.level });
      }
    });
    return () => {
      clearInterval(id);
      unsub();
    };
  }, [refresh]);

  const pct = (used: number, total: number) =>
    total > 0 ? Math.round((used / total) * 100) : 0;

  if (loading) return <div className="p-6 text-muted-foreground">Loading system stats...</div>;
  if (error) return <div className="p-6 text-destructive">{error}</div>;
  if (!data) return null;

  const ramPct = pct(data.memory.used_mb, data.memory.total_mb);
  const swapPct = pct(data.memory.swap_used_mb, data.memory.swap_total_mb);

  const sortedProcesses = [...(data?.processes ?? [])].sort((a, b) => {
    if (sortMode === "cpu") return parseFloat(b.cpu) - parseFloat(a.cpu);
    return parseFloat(b.mem) - parseFloat(a.mem);
  });

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Activity className="h-6 w-6" /> Server
        </h1>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          {lastUpdated && <span>Updated {lastUpdated.toLocaleTimeString()}</span>}
          <button
            onClick={refresh}
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>
      </div>

      {diskWarning && (
        <div className={`rounded-lg border p-3 text-sm flex items-center gap-2 ${diskWarning.level === "critical" ? "border-destructive bg-destructive/10 text-destructive" : "border-orange-500/50 bg-orange-500/10 text-orange-400"}`}>
          <HardDrive className="h-4 w-4 shrink-0" />
          Disk usage at {diskWarning.pct}% — {diskWarning.level === "critical" ? "critical: SQLite write failures imminent" : "warning: approaching full"}.
          Run <code className="font-mono">node scripts/prune-old-data.js</code> to free space.
        </div>
      )}

      {/* CPU + RAM cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2 font-medium">
            <Cpu className="h-4 w-4 text-muted-foreground" /> CPU Load Average
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {([
              ["1m", data.cpu.load1],
              ["5m", data.cpu.load5],
              ["15m", data.cpu.load15],
            ] as [string, number][]).map(([label, val]) => {
              const numCpus = data.cpu.num_cpus ?? 2;
              const pct = Math.min(Math.round((val / numCpus) * 100), 999);
              const color =
                pct > 80 ? "text-indigo-500" :
                pct > 60 ? "text-orange-500" :
                "text-emerald-500";
              return (
                <div key={label} className="space-y-1">
                  <div className="text-xs text-muted-foreground mb-1">{label}</div>
                  <div className={`text-xl font-mono font-semibold ${color}`}>{pct}%</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2 font-medium">
            <MemoryStick className="h-4 w-4 text-muted-foreground" /> Memory
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>RAM</span>
              <span className="text-muted-foreground">
                {data.memory.used_mb} / {data.memory.total_mb} MB ({ramPct}%)
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${ramPct}%` }} />
            </div>
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
                {zramStats?.available && (
                  <div className="text-xs text-muted-foreground">
                    zram: {(zramStats.compressed_bytes / 1048576).toFixed(0)} MB compressed
                    {" → "}{(zramStats.original_bytes / 1048576).toFixed(0)} MB original
                    {" ("}{"saves "}{zramStats.savings_pct}%{")"}
                  </div>
                )}
              </>
            )}
            {/* OOM Protection status — D-06, D-07 */}
            <div className="border-t pt-2 mt-1 space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                OOM Protection
              </div>
              <div className="flex justify-between text-sm">
                <span>earlyoom</span>
                <span className={oomStatus?.earlyoom === "active" ? "text-emerald-400" : "text-destructive"}>
                  {oomStatus == null
                    ? "—"
                    : oomStatus.earlyoom === "active"
                    ? "● active"
                    : "● inactive"}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Claude cap</span>
                <span className="text-muted-foreground">2.4 GB cgroup</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Disk usage */}
      <div className="rounded-lg border bg-card">
        <div className="flex items-center gap-2 p-4 font-medium border-b">
          <HardDrive className="h-4 w-4 text-muted-foreground" /> Disk Usage
        </div>

        {/* Total disk line — from df data (first non-loop mount) */}
        {data.disk.length > 0 && (
          <div className="px-4 py-2 text-sm font-medium border-b">
            Total: {data.disk[0]?.used} used of {data.disk[0]?.size} ({data.disk[0]?.pct})
          </div>
        )}

        {/* Per-project attribution rows */}
        {diskAttribution == null || diskAttribution.rows.length === 0 ? (
          <div className="px-4 py-3 text-sm text-muted-foreground">Loading attribution…</div>
        ) : (
          <div className="divide-y">
            {diskAttribution.rows.map((row, i) => (
              <div key={i} className="px-4 py-2">
                <div className="flex items-center justify-between text-sm">
                  <span className={`font-mono truncate ${row.project ? "" : "text-muted-foreground"}`}>
                    {row.dir}
                  </span>
                  <span className={`tabular-nums shrink-0 ml-3 ${row.dir_error ? "text-muted-foreground italic" : "font-medium"}`}>
                    {row.dir_error ? "unavailable" : (row.dir_size ?? "—")}
                  </span>
                </div>
                {row.docker_size && (
                  <div className="flex items-center justify-between text-xs text-muted-foreground mt-0.5 pl-4">
                    <span>└─ Docker</span>
                    <span className="tabular-nums">{row.docker_size}</span>
                  </div>
                )}
              </div>
            ))}
            {/* Other: unattributed — shown as note */}
            <div className="px-4 py-2 text-xs text-muted-foreground italic">
              Other: see Docker subsection below for unattributed build cache / images
            </div>
          </div>
        )}

        {/* Docker space breakdown — D-01, D-03 */}
        <div className="border-t">
          <div className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Docker
          </div>
          {dockerDf === null ? (
            <div className="px-4 py-2 text-sm text-muted-foreground italic">Loading...</div>
          ) : dockerDf.error ? (
            <div className="px-4 py-2 text-sm text-muted-foreground italic">unavailable</div>
          ) : (
            <div className="grid grid-cols-2 gap-x-4 px-4 pb-3">
              {dockerDf.entries.map((entry) => {
                const reclaimStr = entry.reclaimable ?? "";
                const gbMatch = reclaimStr.match(/([\d.]+)\s*GB/i);
                const mbMatch = reclaimStr.match(/([\d.]+)\s*MB/i);
                const reclaimMb = gbMatch
                  ? parseFloat(gbMatch[1]) * 1024
                  : mbMatch
                  ? parseFloat(mbMatch[1])
                  : 0;
                const isBuildCache = entry.type === "Build Cache";
                const isAmber = isBuildCache && reclaimMb > 5120;
                return (
                  <div key={entry.type} className="py-1.5">
                    <div className="text-xs text-muted-foreground">{entry.type}</div>
                    <div className="text-sm font-medium tabular-nums">{entry.size}</div>
                    <div className={`text-xs tabular-nums ${isAmber ? "text-amber-400" : "text-muted-foreground"}`}>
                      {entry.reclaimable} reclaimable
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Top processes */}
      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2 font-medium">
            <Activity className="h-4 w-4 text-muted-foreground" />
            Top Processes — sorted by {sortMode === "cpu" ? "CPU" : "RAM"} (refreshes every 30 seconds)
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setSortMode("cpu")}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                sortMode === "cpu"
                  ? "bg-indigo-500 text-white"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              CPU
            </button>
            <button
              onClick={() => setSortMode("mem")}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                sortMode === "mem"
                  ? "bg-indigo-500 text-white"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              RAM
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b">
                <th className="text-left p-3 font-normal">PID</th>
                <th className="text-left p-3 font-normal">User</th>
                <th className="text-right p-3 font-normal">CPU%</th>
                <th className="text-right p-3 font-normal">MEM%</th>
                <th className="text-left p-3 font-normal">Command</th>
              </tr>
            </thead>
            <tbody>
              {sortedProcesses.map((p, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-3 font-mono text-muted-foreground">{p.pid}</td>
                  <td className="p-3">{p.user}</td>
                  <td className="p-3 text-right">{p.cpu}</td>
                  <td className="p-3 text-right font-medium">{p.mem}</td>
                  <td className="p-3 font-mono text-xs text-muted-foreground max-w-xs truncate">{p.command}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Maintenance — Cron Jobs */}
      <div className="rounded-lg border bg-card">
        <div className="flex items-center gap-2 p-4 font-medium border-b">
          <Terminal className="h-4 w-4 text-muted-foreground" /> Maintenance
        </div>
        <div className="divide-y">
          {cronJobs.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground">Loading cron status...</div>
          )}
          {cronJobs.map((job) => {
            const isRunning = cronRunning[job.name] ?? false;
            const output = cronOutput[job.name] ?? null;
            const expanded = cronExpanded[job.name] ?? false;
            const displayOutput = output ?? job.lastOutput;
            return (
              <div key={job.name} className="p-4 space-y-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-sm font-medium">{job.name}</span>
                    <span className="text-xs text-muted-foreground font-mono shrink-0">
                      Schedule: {job.schedule}
                    </span>
                    {job.lastRun && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        Last run: {new Date(job.lastRun).toLocaleString()}
                      </span>
                    )}
                    {!job.lastRun && (
                      <span className="text-xs text-muted-foreground italic shrink-0">Never run</span>
                    )}
                  </div>
                  <button
                    onClick={() => runCron(job.name)}
                    disabled={isRunning}
                    className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                  >
                    {isRunning ? (
                      <>
                        <RefreshCw className="h-3 w-3 animate-spin" /> Running...
                      </>
                    ) : (
                      "Run Now"
                    )}
                  </button>
                </div>
                {displayOutput && (
                  <div className="space-y-1">
                    <button
                      onClick={() => setCronExpanded(prev => ({ ...prev, [job.name]: !expanded }))}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {expanded ? "Hide output" : "Show output"}
                    </button>
                    {expanded && (
                      <pre className="rounded bg-muted px-3 py-2 text-xs font-mono overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto">
                        {displayOutput}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
