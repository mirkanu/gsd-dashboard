import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

// ── Color palette ─────────────────────────────────────────────────────────────

const SERIES_COLORS = [
  "#6366f1", "#10b981", "#f59e0b", "#3b82f6", "#ec4899",
  "#8b5cf6", "#14b8a6", "#f97316", "#84cc16", "#06b6d4",
  "#a855f7", "#ef4444",
];

function hashColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return SERIES_COLORS[h % SERIES_COLORS.length] as string;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface UmamiWebsite { id: string; name: string; domain: string; }
interface DataPoint { x: string; y: number; }
interface SeriesData { website: UmamiWebsite; pageviews: DataPoint[]; sessions: DataPoint[]; color: string; }
type TimeRange = "7d" | "30d" | "all";
type ChartMode = "pageviews" | "sessions";

// ── Time range helpers ────────────────────────────────────────────────────────

function getTimeRange(range: TimeRange): { startAt: number; endAt: number } {
  const now = Date.now();
  const endAt = now;
  if (range === "7d") return { startAt: now - 7 * 86400000, endAt };
  if (range === "30d") return { startAt: now - 30 * 86400000, endAt };
  return { startAt: new Date("2020-01-01").getTime(), endAt };
}

function rangeLabel(range: TimeRange): string {
  if (range === "7d") return "last 7 days";
  if (range === "30d") return "last 30 days";
  return "all time";
}

// Normalize Umami date strings to YYYY-MM-DD (Umami may return full datetimes)
function normalizeDate(x: string): string {
  return x.substring(0, 10);
}

// ── SVG multi-line chart ──────────────────────────────────────────────────────

const SVG_H = 220;
const PAD = { left: 52, right: 12, top: 12, bottom: 36 };

interface TooltipState {
  x: number;
  y: number;
  date: string;
  values: { name: string; color: string; value: number }[];
}

function UmamiMultiLineChart({
  series,
  hiddenIds,
  chartMode,
  chartLoading,
  timeRange,
  containerWidth,
  onTooltip,
  onTooltipClear,
}: {
  series: SeriesData[];
  hiddenIds: Set<string>;
  chartMode: ChartMode;
  chartLoading: boolean;
  timeRange: TimeRange;
  containerWidth: number;
  onTooltip: (t: TooltipState) => void;
  onTooltipClear: () => void;
}) {
  const PLOT_W = containerWidth - PAD.left - PAD.right;
  const PLOT_H = SVG_H - PAD.top - PAD.bottom;

  const visibleSeries = series.filter(s => !hiddenIds.has(s.website.id));

  const allDatesRaw = Array.from(
    new Set(
      visibleSeries.flatMap(s =>
        (chartMode === "pageviews" ? s.pageviews : s.sessions).map(p => p.x)
      )
    )
  ).sort();

  // Build a lookup of total value per date across all visible series
  const dateTotals = new Map<string, number>();
  for (const d of allDatesRaw) {
    const total = visibleSeries.reduce((sum, s) => {
      const pt = (chartMode === "pageviews" ? s.pageviews : s.sessions).find(p => p.x === d);
      return sum + (pt?.y ?? 0);
    }, 0);
    dateTotals.set(d, total);
  }
  // Trim leading dates where all series have zero traffic
  const firstNonZero = allDatesRaw.findIndex(d => (dateTotals.get(d) ?? 0) > 0);
  const allDates = firstNonZero <= 0 ? allDatesRaw : allDatesRaw.slice(firstNonZero);

  const globalMax = Math.max(
    1,
    ...visibleSeries.flatMap(s =>
      (chartMode === "pageviews" ? s.pageviews : s.sessions).map(p => p.y)
    )
  );

  const slotW = PLOT_W / Math.max(1, allDates.length);

  function toX(dateIndex: number): number {
    if (isMonthly) return PAD.left + dateIndex * slotW + slotW / 2;
    if (allDates.length <= 1) return PAD.left + PLOT_W / 2;
    return PAD.left + (dateIndex / (allDates.length - 1)) * PLOT_W;
  }

  function toY(value: number): number {
    return PAD.top + PLOT_H - (value / globalMax) * PLOT_H;
  }

  const dateIndexMap = new Map<string, number>(allDates.map((d, i) => [d, i]));

  const yTicks = [0, 0.5, 1].map(frac => ({
    y: PAD.top + PLOT_H - frac * PLOT_H,
    label: frac === 0 ? "0" : Math.round(frac * globalMax).toLocaleString(),
  }));

  // Detect monthly granularity (all dates land on the 1st of the month)
  const isMonthly = allDates.length > 0 && allDates.every(d => d.endsWith("-01"));
  const spansMultipleYears = allDates.length > 1 &&
    allDates[0]!.slice(0, 4) !== allDates[allDates.length - 1]!.slice(0, 4);
  const MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  function formatXLabel(date: string): string {
    if (isMonthly) {
      const month = parseInt(date.slice(5, 7), 10) - 1;
      const year = date.slice(2, 4);
      return spansMultipleYears ? `${MONTH_ABBR[month]} '${year}` : (MONTH_ABBR[month] ?? date.slice(5));
    }
    return date.slice(5);
  }

  // Limit x-axis ticks based on available pixel width (~1 per 60px, max 8)
  const maxTicks = Math.max(2, Math.min(8, Math.floor(PLOT_W / 60)));
  const xTickStep = Math.max(1, Math.ceil(allDates.length / maxTicks));
  const xTicks = allDates
    .filter((_, i) => i % xTickStep === 0 || i === allDates.length - 1)
    .map(d => ({ date: d, x: toX(dateIndexMap.get(d) ?? 0) }));

  function handleMouseMove(e: React.MouseEvent<SVGRectElement>) {
    if (allDates.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const frac = Math.max(0, Math.min(1, relX / rect.width));
    const idx = Math.round(frac * (allDates.length - 1));
    const date = allDates[idx];
    if (!date) return;

    const values = visibleSeries.map(s => {
      const points = chartMode === "pageviews" ? s.pageviews : s.sessions;
      const pt = points.find(p => p.x === date);
      return { name: s.website.name, color: s.color, value: pt?.y ?? 0 };
    }).sort((a, b) => b.value - a.value);

    const svgEl = e.currentTarget.closest("svg");
    let clientX = e.clientX;
    let clientY = e.clientY;
    if (svgEl) {
      const svgRect = svgEl.getBoundingClientRect();
      // crosshair snaps to nearest date index
      const crosshairFrac = allDates.length <= 1 ? 0.5 : idx / (allDates.length - 1);
      clientX = svgRect.left + PAD.left / containerWidth * svgRect.width + crosshairFrac * (PLOT_W / containerWidth) * svgRect.width;
      clientY = svgRect.top + PAD.top;
    }

    const dateObj = new Date(date + "T12:00:00");
    const displayDate = dateObj.toLocaleDateString(undefined, { month: "short", day: "numeric" });

    onTooltip({ x: clientX, y: clientY, date: displayDate, values });
  }

  if (chartLoading) {
    return <div className="animate-pulse bg-surface-2 rounded" style={{ height: SVG_H }} />;
  }

  if (allDates.length === 0) {
    return (
      <svg width="100%" height={SVG_H} viewBox={`0 0 ${containerWidth} ${SVG_H}`} role="img" aria-label={`Multi-line chart of ${chartMode} over ${rangeLabel(timeRange)}`}>
        <text x={containerWidth / 2} y={SVG_H / 2} textAnchor="middle" dominantBaseline="middle" fill="#6b7280" fontSize={14}>
          No data
        </text>
      </svg>
    );
  }

  return (
    <svg
      width="100%"
      height={SVG_H}
      viewBox={`0 0 ${containerWidth} ${SVG_H}`}
      role="img"
      aria-label={`Multi-line chart of ${chartMode} over ${rangeLabel(timeRange)}`}
    >
      {/* Y gridlines + labels */}
      {yTicks.map(tick => (
        <g key={tick.y}>
          <line x1={PAD.left} x2={PAD.left + PLOT_W} y1={tick.y} y2={tick.y} stroke="#2a2a3d" strokeWidth={1} />
          <text
            x={PAD.left - 6}
            y={tick.y}
            textAnchor="end"
            dominantBaseline="middle"
            fill="#6b7280"
            fontSize={11}
            fontFamily="monospace"
          >
            {tick.label}
          </text>
        </g>
      ))}

      {/* X-axis ticks */}
      {xTicks.map(tick => (
        <text
          key={tick.date}
          x={tick.x}
          y={SVG_H - 8}
          textAnchor="middle"
          fill="#6b7280"
          fontSize={11}
          fontFamily="monospace"
        >
          {formatXLabel(tick.date)}
        </text>
      ))}

      {/* Series bars (monthly) or polylines (daily) */}
      {isMonthly ? (() => {
        const numVisible = visibleSeries.length;
        const groupGap = Math.max(2, slotW * 0.15);
        const groupW = slotW - groupGap;
        const barW = Math.max(1, groupW / Math.max(1, numVisible));
        return visibleSeries.flatMap((s, si) =>
          (chartMode === "pageviews" ? s.pageviews : s.sessions)
            .filter(p => dateIndexMap.has(p.x))
            .map(p => {
              const di = dateIndexMap.get(p.x) as number;
              const barH = (p.y / globalMax) * PLOT_H;
              return (
                <rect
                  key={`${s.website.id}-${p.x}`}
                  x={PAD.left + di * slotW + groupGap / 2 + si * barW}
                  y={PAD.top + PLOT_H - barH}
                  width={Math.max(1, barW - 1)}
                  height={barH}
                  fill={s.color}
                  opacity={0.85}
                  rx={2}
                />
              );
            })
        );
      })() : visibleSeries.map(s => {
        const points = (chartMode === "pageviews" ? s.pageviews : s.sessions)
          .filter(p => dateIndexMap.has(p.x))
          .map(p => `${toX(dateIndexMap.get(p.x) as number)},${toY(p.y)}`);
        if (points.length === 0) return null;
        return (
          <polyline
            key={s.website.id}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            points={points.join(" ")}
          />
        );
      })}

      {/* Mouse capture overlay */}
      <rect
        x={PAD.left}
        y={PAD.top}
        width={PLOT_W}
        height={PLOT_H}
        fill="transparent"
        onMouseMove={handleMouseMove}
        onMouseLeave={onTooltipClear}
        style={{ cursor: "crosshair" }}
      />
    </svg>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────────

function UmamiLegend({
  series,
  hiddenIds,
  onToggle,
}: {
  series: SeriesData[];
  hiddenIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3 px-4 py-3">
      {series.map(s => (
        <button
          key={s.website.id}
          className={`flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none transition-opacity ${hiddenIds.has(s.website.id) ? "opacity-40" : ""}`}
          onClick={() => onToggle(s.website.id)}
          tabIndex={0}
          title="Click to show/hide this project"
          onKeyDown={e => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onToggle(s.website.id);
            }
          }}
        >
          <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: s.color }} />
          <span title={s.website.name}>
            {s.website.name.slice(0, 18)}{s.website.name.length > 18 ? "…" : ""}
          </span>
        </button>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function UmamiPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>("7d");
  const [chartMode, setChartMode] = useState<ChartMode>("pageviews");
  const [series, setSeries] = useState<SeriesData[]>([]);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedCount, setLoadedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  // Measure chart container width for responsive SVG
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(760);
  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => setChartWidth(Math.floor(entries[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  async function fetchAll(range: TimeRange, isInitial: boolean) {
    if (isInitial) setLoading(true); else setChartLoading(true);
    setError(null);
    try {
      const wRes = await fetch("/api/umami/websites");
      if (wRes.status === 503) {
        setError("credentials-missing");
        return;
      }
      if (!wRes.ok) throw new Error("unreachable");
      const websites: UmamiWebsite[] = await wRes.json();
      setTotalCount(websites.length);
      const { startAt, endAt } = getTimeRange(range);
      const results = await Promise.allSettled(
        websites.map(async (w) => {
          const r = await fetch(`/api/umami/stats?websiteId=${encodeURIComponent(w.id)}&startAt=${startAt}&endAt=${endAt}`);
          if (!r.ok) throw new Error(`Failed for ${w.id}`);
          const data = await r.json();
          return {
            website: w,
            // Normalize date strings to YYYY-MM-DD (Umami may return full datetimes)
            pageviews: (data.pageviews ?? []).map((p: DataPoint) => ({ x: normalizeDate(p.x), y: p.y })),
            sessions: (data.sessions ?? []).map((p: DataPoint) => ({ x: normalizeDate(p.x), y: p.y })),
            color: hashColor(w.id),
          } as SeriesData;
        })
      );
      const loaded = results
        .filter((r): r is PromiseFulfilledResult<SeriesData> => r.status === "fulfilled")
        .map(r => r.value);
      setLoadedCount(loaded.length);
      setSeries(loaded);
      setLastFetched(new Date());
    } catch {
      setError("unreachable");
    } finally {
      if (isInitial) setLoading(false); else setChartLoading(false);
    }
  }

  useEffect(() => {
    fetchAll(timeRange, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleRangeChange(r: TimeRange) {
    setTimeRange(r);
    fetchAll(r, false);
  }

  function toggleHidden(id: string) {
    setHiddenIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // ── Loading skeleton ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-4 p-4 sm:p-6" aria-label="Loading web analytics data">
        <div className="h-9 bg-surface-2 rounded-lg w-56 animate-pulse" />
        <div className="h-10 bg-surface-2 rounded-lg animate-pulse" />
        <div className="h-64 bg-surface-2 rounded-lg animate-pulse" />
        <div className="h-16 bg-surface-2 rounded-lg animate-pulse" />
      </div>
    );
  }

  // ── Credentials error ──────────────────────────────────────────────────────

  if (error === "credentials-missing") {
    return (
      <div className="m-4 sm:m-6 p-6 bg-surface-1 border border-border rounded-lg">
        <h2 className="text-base font-semibold text-gray-100 mb-1">Web analytics not configured</h2>
        <p className="text-sm text-gray-400 mb-4">
          Add <code className="text-gray-300 bg-surface-2 px-1 rounded">UMAMI_ADMIN_PASSWORD</code> to the Environment settings, then reload.
        </p>
        <a href="/env" className="text-sm text-accent hover:underline">Go to Environment settings</a>
      </div>
    );
  }

  // ── Main layout ────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4 sm:gap-6 p-4 sm:p-6">
      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 px-2 py-2 text-xs bg-[#12121f] border border-[#2a2a4a] rounded shadow-xl text-gray-200 pointer-events-none whitespace-nowrap"
          style={{ top: Math.min(tooltip.y + 12, window.innerHeight - 120), left: Math.min(tooltip.x + 12, window.innerWidth - 180) }}
        >
          <div className="font-semibold mb-1 text-gray-400">{tooltip.date}</div>
          {tooltip.values.map(v => (
            <div key={v.name} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: v.color }} />
              <span>
                {v.name}: {v.value} {chartMode === "pageviews" ? "pageviews" : "visitors"}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Header row — stacks on mobile */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-100">Web Analytics</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Pageviews and visitors across all projects — {rangeLabel(timeRange)}
          </p>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-auto">
          {lastFetched && (
            <span className="text-xs text-gray-500">
              Updated {lastFetched.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button
            onClick={() => fetchAll(timeRange, false)}
            className="px-3 py-1.5 text-xs font-semibold bg-surface-2 hover:bg-surface-3 text-gray-300 rounded-md border border-border transition-colors flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            Refresh
          </button>
        </div>
      </div>

      {/* Controls row — wraps on mobile */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 sm:justify-between">
        <div role="group" aria-label="Time range" className="flex bg-surface-2 rounded-lg p-1 gap-0.5">
          {(["7d", "30d", "all"] as TimeRange[]).map(r => (
            <button
              key={r}
              onClick={() => handleRangeChange(r)}
              aria-pressed={timeRange === r}
              className={`px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                timeRange === r ? "bg-surface-4 text-gray-200" : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {r === "7d" ? "7d" : r === "30d" ? "30d" : "All"}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Chart mode" className="flex bg-surface-2 rounded-lg p-1 gap-0.5">
          {(["pageviews", "sessions"] as ChartMode[]).map(m => (
            <button
              key={m}
              onClick={() => setChartMode(m)}
              aria-pressed={chartMode === m}
              className={`px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                chartMode === m ? "bg-surface-4 text-gray-200" : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {m === "pageviews" ? "Pageviews" : "Visitors"}
            </button>
          ))}
        </div>
      </div>

      {/* Unreachable error banner */}
      {error === "unreachable" && (
        <div className="px-4 py-3 text-xs text-amber-400 bg-amber-950/30 border border-amber-900/40 rounded-lg">
          Could not reach Umami — verify it is running and the server can connect to it.
        </div>
      )}

      {/* Chart card */}
      <div className="bg-surface-1 border border-border rounded-lg p-3 sm:p-6 overflow-hidden">
        <div ref={chartContainerRef} style={{ width: "100%" }}>
          <UmamiMultiLineChart
            series={series}
            hiddenIds={hiddenIds}
            chartMode={chartMode}
            chartLoading={chartLoading}
            timeRange={timeRange}
            containerWidth={chartWidth}
            onTooltip={setTooltip}
            onTooltipClear={() => setTooltip(null)}
          />
        </div>
      </div>

      {/* Legend card */}
      <div className="bg-surface-1 border border-border rounded-lg">
        {loadedCount < totalCount && totalCount > 0 && (
          <p className="text-xs text-gray-500 px-4 pt-3">
            {loadedCount} of {totalCount} projects loaded
          </p>
        )}
        <UmamiLegend
          series={series}
          hiddenIds={hiddenIds}
          onToggle={toggleHidden}
        />
      </div>
    </div>
  );
}
