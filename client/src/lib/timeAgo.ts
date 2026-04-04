/**
 * Convert an ISO timestamp to a relative time string.
 * Returns: "", "just now", "5m", "3h", "Yesterday", or "Mar 29"
 */
export function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '';

  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);

  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
  if (diffSec < 172800) return 'Yesterday';

  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}
