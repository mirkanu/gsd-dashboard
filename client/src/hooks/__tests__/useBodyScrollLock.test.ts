import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBodyScrollLock } from '../useBodyScrollLock';

describe('useBodyScrollLock', () => {
  beforeEach(() => {
    // Reset body + html between tests
    document.documentElement.style.overflow = '';
    document.documentElement.style.touchAction = '';
    document.documentElement.style.height = '';
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.width = '';
    document.body.style.top = '';
    document.body.style.touchAction = '';
    // jsdom starts at scrollY 0; set explicitly so the snapshot is captured
    Object.defineProperty(window, 'scrollY', { value: 240, configurable: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('L1: when active=false, no styles are applied', () => {
    renderHook(() => useBodyScrollLock(false));
    expect(document.documentElement.style.overflow).toBe('');
    expect(document.body.style.overflow).toBe('');
  });

  it('L2: when active=true, both html and body get overflow:hidden + touch-action:none', () => {
    renderHook(() => useBodyScrollLock(true));
    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(document.documentElement.style.touchAction).toBe('none');
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.body.style.touchAction).toBe('none');
    expect(document.body.style.position).toBe('fixed');
    expect(document.body.style.width).toBe('100%');
    expect(document.body.style.top).toBe('-240px');
  });

  it('L3: cleanup restores all six html+body inline styles 1:1', () => {
    // Pre-set some unrelated inline styles so we can confirm they're preserved.
    document.documentElement.style.overflow = 'scroll';
    document.body.style.color = 'red'; // unrelated property — should be untouched

    const { unmount } = renderHook(() => useBodyScrollLock(true));
    expect(document.documentElement.style.overflow).toBe('hidden');

    unmount();

    // Restored:
    expect(document.documentElement.style.overflow).toBe('scroll');
    expect(document.documentElement.style.touchAction).toBe('');
    expect(document.documentElement.style.height).toBe('');
    expect(document.body.style.overflow).toBe('');
    expect(document.body.style.position).toBe('');
    expect(document.body.style.width).toBe('');
    expect(document.body.style.top).toBe('');
    expect(document.body.style.touchAction).toBe('');
    // Untouched unrelated property:
    expect(document.body.style.color).toBe('red');
  });

  it('L4: scroll position is captured at mount and restored on unmount', () => {
    Object.defineProperty(window, 'scrollY', { value: 480, configurable: true });
    const scrollSpy = vi.spyOn(window, 'scrollTo');
    const { unmount } = renderHook(() => useBodyScrollLock(true));
    expect(document.body.style.top).toBe('-480px');
    unmount();
    expect(scrollSpy).toHaveBeenCalledWith(0, 480);
  });

  it('L5: toggling active true → false applies then removes the lock', () => {
    const { rerender } = renderHook(
      ({ active }: { active: boolean }) => useBodyScrollLock(active),
      { initialProps: { active: false } }
    );
    expect(document.body.style.overflow).toBe('');
    rerender({ active: true });
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.documentElement.style.overflow).toBe('hidden');
    rerender({ active: false });
    // Cleanup ran on the prior render; styles back to defaults.
    expect(document.body.style.overflow).toBe('');
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('L6: re-mount after unmount re-applies the lock cleanly', () => {
    const { unmount } = renderHook(() => useBodyScrollLock(true));
    unmount();
    const { unmount: unmount2 } = renderHook(() => useBodyScrollLock(true));
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.documentElement.style.touchAction).toBe('none');
    unmount2();
    expect(document.body.style.overflow).toBe('');
  });

  it('L7: iOS Safari relies on touch-action:none on BOTH html and body — guard double application', () => {
    // This guards the documented gotcha: only locking body is the most common
    // cause of "rubber-band still happens in Safari" bug reports.
    const { unmount } = renderHook(() => useBodyScrollLock(true));
    expect(document.documentElement.style.touchAction).toBe('none');
    expect(document.body.style.touchAction).toBe('none');
    unmount();
    expect(document.documentElement.style.touchAction).toBe('');
    expect(document.body.style.touchAction).toBe('');
  });
});
