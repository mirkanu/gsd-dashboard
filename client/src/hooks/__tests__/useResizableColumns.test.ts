import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useResizableColumns } from '../useResizableColumns';

const STORAGE_KEY = 'gsd-column-widths';

describe('useResizableColumns', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('Test 1: returns default widths [20, 50, 30] when localStorage has no saved value', () => {
    const { result } = renderHook(() => useResizableColumns());
    expect(result.current.widths.left).toBe(20);
    expect(result.current.widths.middle).toBe(50);
    expect(result.current.widths.right).toBe(30);
  });

  it('Test 2: returns saved widths from localStorage when key exists and values are valid', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([25, 45, 30]));
    const { result } = renderHook(() => useResizableColumns());
    expect(result.current.widths.left).toBe(25);
    expect(result.current.widths.middle).toBe(45);
    expect(result.current.widths.right).toBe(30);
  });

  it('Test 3: startDragLeft callback sets isDragging=true', () => {
    const { result } = renderHook(() => useResizableColumns());
    expect(result.current.isDragging).toBe(false);

    act(() => {
      result.current.startDragLeft({
        clientX: 300,
        preventDefault: vi.fn(),
      } as unknown as React.MouseEvent);
    });

    expect(result.current.isDragging).toBe(true);
  });

  it('Test 4: left column clamped to min 12% and max 35%; right column clamped to min 15% and max 45%', () => {
    // Verify the default widths respect constraints
    const { result } = renderHook(() => useResizableColumns());

    // Left: default 20 is within [12, 35]
    expect(result.current.widths.left).toBeGreaterThanOrEqual(12);
    expect(result.current.widths.left).toBeLessThanOrEqual(35);

    // Right: default 30 is within [15, 45]
    expect(result.current.widths.right).toBeGreaterThanOrEqual(15);
    expect(result.current.widths.right).toBeLessThanOrEqual(45);

    // Saved values outside constraints should fall back to defaults
    localStorage.setItem(STORAGE_KEY, JSON.stringify([5, 80, 15]));
    const { result: result2 } = renderHook(() => useResizableColumns());
    // left=5 is below min of 12, should be clamped or fall back to default
    expect(result2.current.widths.left).toBeGreaterThanOrEqual(12);
  });

  it('Test 5: widths always sum to 100 after drag operation', () => {
    const { result } = renderHook(() => useResizableColumns());

    // Initial widths sum to 100
    const initial = result.current.widths;
    expect(initial.left + initial.middle + initial.right).toBe(100);

    // Start drag
    act(() => {
      result.current.startDragLeft({
        clientX: 400,
        preventDefault: vi.fn(),
      } as unknown as React.MouseEvent);
    });

    // Simulate mousemove: move right by 100px on ~1200px viewport -> ~8.3%
    act(() => {
      const mouseMoveEvent = new MouseEvent('mousemove', {
        clientX: 500,
        bubbles: true,
      });
      document.dispatchEvent(mouseMoveEvent);
    });

    const afterDrag = result.current.widths;
    expect(afterDrag.left + afterDrag.middle + afterDrag.right).toBeCloseTo(100, 0);

    // End drag
    act(() => {
      const mouseUpEvent = new MouseEvent('mouseup', { bubbles: true });
      document.dispatchEvent(mouseUpEvent);
    });

    const afterEnd = result.current.widths;
    expect(afterEnd.left + afterEnd.middle + afterEnd.right).toBeCloseTo(100, 0);
  });
});
