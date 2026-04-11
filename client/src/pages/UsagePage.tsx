import { useState, useEffect, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { api } from "../lib/api";
import type { UsageWindow, UsageHistory } from "../lib/types";
import { PricingEditor } from "../components/PricingEditor";

const WEEKLY_LIMIT = 50;

function formatCost(cost: number): string {
  if (cost < 0.01) return "< $0.01";
  return `$${cost.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
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

function SkeletonCard() {
  return (
    <div className="bg-surface-1 border border-border rounded-lg p-4 animate-pulse">
      <div className="h-3 bg-surface-2 rounded w-20 mb-2" />
      <div className="h-7 bg-surface-2 rounded w-28 mb-1" />
      <div className="h-3 bg-surface-2 rounded w-16" />
    </div>
  );
}

function SkeletonGauge() {
  return (
    <div className="bg-surface-1 border border-border rounded-lg p-4 animate-pulse">
      <div className="flex justify-between mb-2">
        <div className="h-3 bg-surface-2 rounded w-24" />
        <div className="h-3 bg-surface-2 rounded w-32" />
      </div>
      <div className="h-3 bg-surface-2 rounded-full w-full" />
    </div>
  );
}

function SkeletonChart() {
  return (
    <div className="bg-surface-1 border border-border rounded-lg p-4 animate-pulse">
      <div className="h-4 bg-surface-2 rounded w-28 mb-4" />
      <div className="flex gap-2 items-end h-40">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 max-w-16 bg-surface-2 rounded-t"
            style={{ height: `${30 + Math.random() * 70}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export function UsagePage() {
  const [windowData, setWindowData] = useState<UsageWindow | null>(null);
  const [historyData, setHistoryData] = useState<UsageHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [win, hist] = await Promise.all([
        api.pricing.window(),
        api.pricing.usageHistory(),
      ]);
      setWindowData(win);
      setHistoryData(hist);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch usage data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const weeklyPct = windowData
    ? Math.min(windowData.weekly.cost / WEEKLY_LIMIT, 1)
    : 0;
  const maxDayCost = historyData
    ? Math.max(...historyData.days.map((d) => d.cost), 0.01)
    : 1;
  const sevenDayTotal = historyData
    ? historyData.days.reduce((sum, d) => sum + d.cost, 0)
    : 0;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-100">Usage</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Claude token usage across all projects
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-200 hover:bg-surface-3 border border-border transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Refresh usage data"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
          <SkeletonGauge />
          <SkeletonChart />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-red-400 text-sm mb-4">{error}</p>
          <button
            onClick={fetchData}
            className="px-4 py-2 rounded-lg text-sm bg-surface-2 text-gray-300 hover:bg-surface-3 border border-border transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {/* Data display */}
      {!loading && !error && windowData && (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Weekly Spend */}
            <div className="bg-surface-1 border border-border rounded-lg p-4">
              <div className="text-xs text-gray-500 mb-1">Weekly Spend</div>
              <div className="flex items-baseline gap-1">
                <span className={`text-2xl font-semibold ${getGaugeTextColor(weeklyPct)}`}>
                  {formatCost(windowData.weekly.cost)}
                </span>
                <span className="text-sm text-gray-500">/ ${WEEKLY_LIMIT}</span>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Resets in {Math.round(windowData.weekly.hours_until_reset)}h
              </div>
              <div className="text-[10px] text-gray-500 mt-1 space-x-2">
                <span>in {formatTokens(windowData.weekly.input_tokens)}</span>
                <span>out {formatTokens(windowData.weekly.output_tokens)}</span>
                <span>cache r {formatTokens(windowData.weekly.cache_read_tokens)}</span>
                <span>cache w {formatTokens(windowData.weekly.cache_write_tokens)}</span>
              </div>
            </div>

            {/* Today's Spend */}
            <div className="bg-surface-1 border border-border rounded-lg p-4">
              <div className="text-xs text-gray-500 mb-1">Today's Spend</div>
              <div className="text-2xl font-semibold text-accent">
                {formatCost(windowData.daily.cost)}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Resets in {Math.round(windowData.daily.hours_until_reset)}h
              </div>
              <div className="text-[10px] text-gray-500 mt-1 space-x-2">
                <span>in {formatTokens(windowData.daily.input_tokens)}</span>
                <span>out {formatTokens(windowData.daily.output_tokens)}</span>
                <span>cache r {formatTokens(windowData.daily.cache_read_tokens)}</span>
                <span>cache w {formatTokens(windowData.daily.cache_write_tokens)}</span>
              </div>
            </div>

            {/* 7-Day Total */}
            <div className="bg-surface-1 border border-border rounded-lg p-4">
              <div className="text-xs text-gray-500 mb-1">7-Day Total</div>
              <div className="text-2xl font-semibold text-gray-100">
                {formatCost(sevenDayTotal)}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {historyData?.days.length ?? 0} days tracked
              </div>
            </div>
          </div>

          {/* Weekly gauge */}
          <div className="bg-surface-1 border border-border rounded-lg p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-300">Weekly Usage</span>
              <span className={`text-sm ${getGaugeTextColor(weeklyPct)}`}>
                {Math.round(weeklyPct * 100)}% of ${WEEKLY_LIMIT} limit
              </span>
            </div>
            <div className="w-full h-3 rounded-full bg-surface-3 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${getGaugeColor(weeklyPct)}`}
                style={{ width: `${weeklyPct * 100}%` }}
              />
            </div>
          </div>

          {/* 7-Day Trend chart */}
          {historyData && historyData.days.length > 0 && (
            <div className="bg-surface-1 border border-border rounded-lg p-4">
              <h2 className="text-sm font-medium text-gray-300 mb-4">7-Day Trend</h2>
              <div className="flex gap-2 items-end" style={{ height: 160 }}>
                {historyData.days.map((day) => {
                  const barPct = Math.max((day.cost / maxDayCost) * 100, 2);
                  const today = isToday(day.date);
                  return (
                    <div
                      key={day.date}
                      className="flex-1 max-w-16 flex flex-col items-center justify-end h-full"
                    >
                      <div
                        className={`w-full rounded-t ${today ? "bg-accent" : "bg-accent/60"}`}
                        style={{ height: `${barPct}%` }}
                        title={`${day.date}: ${formatCost(day.cost)}`}
                      />
                      <span className="text-[10px] text-gray-500 mt-1">{getDayLabel(day.date)}</span>
                      <span className="text-[10px] text-gray-600">{formatCost(day.cost)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Model Breakdown */}
          <div className="bg-surface-1 border border-border rounded-lg p-4">
            <h2 className="text-sm font-medium text-gray-300 mb-3">Model Breakdown</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(["weekly", "daily"] as const).map((scope) => {
                const models = windowData[scope].by_model;
                const label = scope === "weekly" ? "This Week" : "Today";
                return (
                  <div key={scope}>
                    <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">
                      {label}
                    </div>
                    {models.length === 0 ? (
                      <p className="text-sm text-gray-500">No usage recorded</p>
                    ) : (
                      <ul className="space-y-2">
                        {models.map((m) => (
                          <li
                            key={m.model}
                            className="border-b border-border/50 pb-2 last:border-0"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-200 truncate">
                                {m.display_name}
                              </span>
                              <span className="text-sm text-gray-300">
                                {formatCost(m.cost)}
                              </span>
                            </div>
                            <div className="text-[10px] text-gray-500 space-x-2 mt-0.5">
                              <span>in {formatTokens(m.input_tokens)}</span>
                              <span>out {formatTokens(m.output_tokens)}</span>
                              <span>cache r {formatTokens(m.cache_read_tokens)}</span>
                              <span>cache w {formatTokens(m.cache_write_tokens)}</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Per-Project Breakdown */}
          <div className="bg-surface-1 border border-border rounded-lg p-4">
            <h2 className="text-sm font-medium text-gray-300 mb-3">Cost by Project</h2>
            {windowData.weekly.by_project && windowData.weekly.by_project.length > 0 ? (
              <div>
                {[...windowData.weekly.by_project]
                  .sort((a, b) => b.cost - a.cost)
                  .map((proj, idx, arr) => {
                    const maxCost = (arr[0]?.cost) || 1;
                    const sharePct =
                      windowData.weekly.cost > 0
                        ? (proj.cost / windowData.weekly.cost) * 100
                        : 0;
                    const barWidthPct = (proj.cost / maxCost) * 100;
                    const projectName = proj.cwd.split("/").pop() || proj.cwd;

                    return (
                      <div
                        key={proj.cwd}
                        className={`py-2.5 ${
                          idx < arr.length - 1 ? "border-b border-border/50" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-gray-200">{projectName}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-sm text-gray-300">
                              {formatCost(proj.cost)}
                            </span>
                            <span className="text-xs text-gray-500 w-12 text-right">
                              {sharePct.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-surface-3 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-accent/60 transition-all duration-300"
                            style={{ width: `${barWidthPct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                No per-project breakdown available
              </p>
            )}
          </div>

          {/* Pricing Editor */}
          <PricingEditor onChange={fetchData} />
        </div>
      )}
    </div>
  );
}
