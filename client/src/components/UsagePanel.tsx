import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { UsageWindow, UsageHistory } from "../lib/types";

const WEEKLY_LIMIT = 50; // Approximate USD weekly limit for Claude Max

function formatCost(cost: number): string {
  if (cost < 0.01) return "< $0.01";
  if (cost < 1) return `$${cost.toFixed(2)}`;
  return `$${cost.toFixed(2)}`;
}

function getGaugeColor(pct: number): string {
  if (pct < 0.5) return "bg-emerald-500";
  if (pct < 0.8) return "bg-yellow-500";
  return "bg-red-500";
}

function getGaugeTextColor(pct: number): string {
  if (pct < 0.5) return "text-emerald-400";
  if (pct < 0.8) return "text-yellow-400";
  return "text-red-400";
}

function getDayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()] ?? "";
}

function isToday(dateStr: string): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return dateStr === today;
}

function SkeletonLoader() {
  return (
    <div className="space-y-2 animate-pulse">
      <div className="h-3 w-24 rounded bg-surface-3" />
      <div className="h-1.5 w-full rounded bg-surface-3" />
      <div className="flex gap-1 items-end h-10">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="w-3 rounded-t bg-surface-3" style={{ height: `${10 + Math.random() * 30}px` }} />
        ))}
      </div>
    </div>
  );
}

export function UsagePanel() {
  const [windowData, setWindowData] = useState<UsageWindow | null>(null);
  const [historyData, setHistoryData] = useState<UsageHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        const [win, hist] = await Promise.all([
          api.pricing.window(),
          api.pricing.usageHistory(),
        ]);
        if (!cancelled) {
          setWindowData(win);
          setHistoryData(hist);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      }
    }

    fetchData();

    // Re-fetch window data every 60s
    const interval = setInterval(async () => {
      try {
        const win = await api.pricing.window();
        if (!cancelled) setWindowData(win);
      } catch {
        // Silently ignore refresh errors
      }
    }, 60_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Error state: don't render (usage is supplementary info)
  if (error) return null;

  if (loading) return <SkeletonLoader />;

  if (!windowData) return null;

  const weeklyPct = Math.min(windowData.weekly.cost / WEEKLY_LIMIT, 1);
  const maxDayCost = historyData
    ? Math.max(...historyData.days.map((d) => d.cost), 0.01)
    : 1;

  return (
    <div className="space-y-2">
      {/* Weekly usage gauge */}
      <div>
        <div className="flex justify-between items-center mb-0.5">
          <span className="text-[10px] text-gray-500">Week</span>
          <span className={`text-[10px] ${getGaugeTextColor(weeklyPct)}`}>
            {formatCost(windowData.weekly.cost)} / ${WEEKLY_LIMIT}
          </span>
        </div>
        <div className="w-full h-1 rounded-full bg-surface-3 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${getGaugeColor(weeklyPct)}`}
            style={{ width: `${weeklyPct * 100}%` }}
          />
        </div>
        <div className="text-[10px] text-gray-500 mt-0.5">
          Resets in {Math.round(windowData.weekly.hours_until_reset)}h
        </div>
      </div>

      {/* 7-day sparkline + today's cost */}
      <div className="flex items-end gap-2">
        {historyData && historyData.days.length > 0 && (
          <div className="flex gap-0.5 items-end" style={{ height: 40 }}>
            {historyData.days.map((day) => {
              const barH = Math.max((day.cost / maxDayCost) * 36, 2);
              const today = isToday(day.date);
              return (
                <div key={day.date} className="flex flex-col items-center">
                  <div
                    className={`w-3 rounded-t ${today ? "bg-accent" : "bg-accent/60"}`}
                    style={{ height: barH }}
                    title={`${day.date}: ${formatCost(day.cost)}`}
                  />
                  <span className="text-[8px] text-gray-600 mt-0.5">{getDayLabel(day.date)}</span>
                </div>
              );
            })}
          </div>
        )}
        <div className="text-[10px] text-gray-400 ml-auto">
          Today: {formatCost(windowData.daily.cost)}
        </div>
      </div>
    </div>
  );
}
