import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Cpu, HardDrive, Activity, MemoryStick, Terminal } from "lucide-react";
import { api } from "../lib/api";
import { eventBus } from "../lib/eventBus";
import type { SystemStats, DiskDetailEntry, DiskWarningEvent, CronJobStatus, DockerDf, OomStatus } from "../lib/types";

export function ServerPage() {
  const [data, setData] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [diskDetail, setDiskDetail] = useState<DiskDetailEntry[]>([]);
  const [diskWarning, setDiskWarning] = useState<{ pct: number; level: string } | null>(null);
  const [cronJobs, setCronJobs] = useState<CronJobStatus[]>([]);
  const [cronRunning, setCronRunning] = useState<Record<string, boolean>>({});
  const [cronOutput, setCronOutput] = useState<Record<string, string | null>>({});
  const [cronExpanded, setCronExpanded] = useState<Record<string, boolean>>({});
  const [dockerDf, setDockerDf] = useState<DockerDf | null>(null);
  const [oomStatus, setOomStatus] = useState<OomStatus | null>(null);

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
    api.system.diskDetail().then(setDiskDetail).catch(() => {});
    api.system.cronStatus().then(setCronJobs).catch(() => {});
    api.system.dockerDf().then(setDockerDf).catch(() => {});
    api.system.oomStatus().then(setOomStatus).catch(() => {});
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
            {([["1m", data.cpu.load1], ["5m", data.cpu.load5], ["15m", data.cpu.load15]] as [string, number][]).map(([label, val]) => (
              <div key={label} className="space-y-1">
                <div className="text-2xl font-mono font-semibold">{val.toFixed(2)}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            ))}
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
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${ramPct}%` }} />
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b">
                <th className="text-left p-3 font-normal">Mount</th>
                <th className="text-right p-3 font-normal">Size</th>
                <th className="text-right p-3 font-normal">Used</th>
                <th className="text-right p-3 font-normal">Avail</th>
                <th className="text-right p-3 font-normal">Use%</th>
              </tr>
            </thead>
            <tbody>
              {data.disk.map((d, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-3 font-mono">{d.mount}</td>
                  <td className="p-3 text-right text-muted-foreground">{d.size}</td>
                  <td className="p-3 text-right">{d.used}</td>
                  <td className="p-3 text-right text-muted-foreground">{d.avail}</td>
                  <td className="p-3 text-right">
                    <span className={parseInt(d.pct) > 85 ? "text-destructive font-medium" : ""}>{d.pct}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
        <div className="flex items-center gap-2 p-4 font-medium border-b">
          <Activity className="h-4 w-4 text-muted-foreground" /> Top Processes (by Memory)
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
              {data.processes.map((p, i) => (
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

      {/* Directory breakdown */}
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
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground shrink-0">
                      {job.schedule}
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
