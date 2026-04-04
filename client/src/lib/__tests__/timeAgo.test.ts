import { describe, it, expect, vi, afterEach } from 'vitest';
import { timeAgo } from '../timeAgo';

describe('timeAgo', () => {
  const NOW = new Date('2026-04-03T12:00:00Z').getTime();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockNow() {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
  }

  it('returns empty string for null', () => {
    expect(timeAgo(null)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(timeAgo('')).toBe('');
  });

  it('returns "just now" for 30 seconds ago', () => {
    mockNow();
    const date = new Date(NOW - 30 * 1000).toISOString();
    expect(timeAgo(date)).toBe('just now');
  });

  it('returns "5m" for 5 minutes ago', () => {
    mockNow();
    const date = new Date(NOW - 5 * 60 * 1000).toISOString();
    expect(timeAgo(date)).toBe('5m');
  });

  it('returns "3h" for 3 hours ago', () => {
    mockNow();
    const date = new Date(NOW - 3 * 60 * 60 * 1000).toISOString();
    expect(timeAgo(date)).toBe('3h');
  });

  it('returns "Yesterday" for 30 hours ago', () => {
    mockNow();
    const date = new Date(NOW - 30 * 60 * 60 * 1000).toISOString();
    expect(timeAgo(date)).toBe('Yesterday');
  });

  it('returns short date for 5 days ago', () => {
    mockNow();
    const date = new Date(NOW - 5 * 24 * 60 * 60 * 1000).toISOString();
    const result = timeAgo(date);
    // Should be something like "Mar 29"
    expect(result).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
  });
});
