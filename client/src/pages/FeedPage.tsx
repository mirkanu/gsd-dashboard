import { useState, useEffect, useCallback } from 'react';
import { Rss, AlertCircle } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';
import { EventTypeBadge } from '../components/EventTypeBadge';
import { eventBus } from '../lib/eventBus';
import type { FeedEntry, WSMessage } from '../lib/types';

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function FeedPage() {
  const [events, setEvents] = useState<FeedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/feed');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEvents(data.events ?? []);
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Live WS updates — prepend new feed_event entries
  useEffect(() => {
    return eventBus.subscribe((msg: WSMessage) => {
      if (msg.type === 'feed_event') {
        setEvents(prev => [msg.data as FeedEntry, ...prev]);
      }
    });
  }, []);

  return (
    <div className="space-y-6 p-6 max-w-4xl mx-auto">
      {/* Page header */}
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center flex-shrink-0">
          <Rss className="w-5 h-5 text-accent" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Portfolio Feed</h1>
          <p className="text-sm text-gray-500 mt-1">
            Landmark events across all GSD projects. Resets on server restart.
          </p>
        </div>
      </div>

      {/* Error state */}
      {loadError && (
        <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <p>Could not load feed. Check server connection.</p>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !loadError && (
        <div className="card p-4 text-sm text-gray-500">Loading feed…</div>
      )}

      {/* Empty state */}
      {!loading && !loadError && events.length === 0 && (
        <EmptyState
          icon={Rss}
          title="No events yet"
          description="Landmark events from GSD sessions will appear here."
        />
      )}

      {/* Feed rows */}
      {!loading && !loadError && events.length > 0 && (
        <div className="card divide-y divide-border">
          {events.map((event) => (
            <div key={event.id} className="px-4 py-3 flex items-center gap-3 hover:bg-surface-4 transition-colors">
              <EventTypeBadge type={event.type} />
              <span className="text-sm text-gray-300 truncate flex-1">{event.label}</span>
              <span className="text-xs text-gray-500 font-mono flex-shrink-0">{event.projectName}</span>
              <span className="text-[11px] text-gray-600 flex-shrink-0">{timeAgo(event.detectedAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
