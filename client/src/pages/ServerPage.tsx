import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Cpu, HardDrive, Activity, MemoryStick } from "lucide-react";
import { api } from "../lib/api";

interface CpuStats { load1: number; load5: number; load15: number; }
interface MemStats { total_mb: number; used_mb: number; free_mb: number; swap_total_mb: number; swap_used_mb: number; }
interface DiskEntry { mount: string; size: string; used: string; avail: string; pct: string; }
interface ProcessEntry { user: string; pid: string; cpu: string; mem: string; command: string; }
interface SystemStats { cpu: CpuStats; memory: MemStats; disk: DiskEntry[]; processes: ProcessEntry[]; }

export function ServerPage() {
  const [data, setData] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get<SystemStats>("/api/system");
      setData(res);
      setLastUpdated(new Date());
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load system stats");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
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
    </div>
  );
}
