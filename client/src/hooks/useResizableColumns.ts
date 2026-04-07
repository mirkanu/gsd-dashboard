import { useState, useEffect, useCallback, useRef } from "react";

const STORAGE_KEY = "gsd-column-widths";
const DEFAULT_WIDTHS = { left: 20, middle: 50, right: 30 };
const LEFT_MIN = 12;
const LEFT_MAX = 35;
const RIGHT_MIN = 15;
const RIGHT_MAX = 45;
const MIDDLE_MIN = 20;

export interface ColumnWidths {
  left: number;
  middle: number;
  right: number;
}

export interface UseResizableColumnsReturn {
  widths: ColumnWidths;
  startDragLeft: (e: React.MouseEvent) => void;
  startDragRight: (e: React.MouseEvent) => void;
  isDragging: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function loadWidths(): ColumnWidths {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_WIDTHS };
    const parsed = JSON.parse(raw) as unknown;
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 3 ||
      parsed.some((v) => typeof v !== "number" || isNaN(v))
    ) {
      return { ...DEFAULT_WIDTHS };
    }
    const [left, middle, right] = parsed as [number, number, number];
    const sum = left + middle + right;
    if (Math.abs(sum - 100) > 1) return { ...DEFAULT_WIDTHS };
    // Validate constraints
    if (
      left < LEFT_MIN ||
      left > LEFT_MAX ||
      right < RIGHT_MIN ||
      right > RIGHT_MAX ||
      middle < MIDDLE_MIN
    ) {
      return { ...DEFAULT_WIDTHS };
    }
    return { left, middle, right };
  } catch {
    return { ...DEFAULT_WIDTHS };
  }
}

function saveWidths(widths: ColumnWidths): void {
  const { left, middle, right } = widths;
  if (isNaN(left) || isNaN(middle) || isNaN(right)) return;
  if (Math.abs(left + middle + right - 100) > 1) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify([left, middle, right]));
}

export function useResizableColumns(): UseResizableColumnsReturn {
  const [widths, setWidths] = useState<ColumnWidths>(() => loadWidths());
  const [isDragging, setIsDragging] = useState(false);

  const dragStateRef = useRef<{
    side: "left" | "right";
    startX: number;
    startWidths: ColumnWidths;
  } | null>(null);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragStateRef.current) return;
    const { side, startX, startWidths } = dragStateRef.current;
    const containerWidth = document.documentElement.clientWidth;
    const deltaPct = ((e.clientX - startX) / containerWidth) * 100;

    if (side === "left") {
      let newLeft = clamp(startWidths.left + deltaPct, LEFT_MIN, LEFT_MAX);
      let newMiddle = startWidths.middle - (newLeft - startWidths.left);
      if (newMiddle < MIDDLE_MIN) {
        newMiddle = MIDDLE_MIN;
        newLeft = startWidths.left + (startWidths.middle - MIDDLE_MIN);
      }
      const newRight = 100 - newLeft - newMiddle;
      setWidths({ left: newLeft, middle: newMiddle, right: newRight });
    } else {
      let newRight = clamp(startWidths.right - deltaPct, RIGHT_MIN, RIGHT_MAX);
      let newMiddle = startWidths.middle + (startWidths.right - newRight);
      if (newMiddle < MIDDLE_MIN) {
        newMiddle = MIDDLE_MIN;
        newRight = startWidths.right + (startWidths.middle - MIDDLE_MIN);
      }
      const newLeft = 100 - newMiddle - newRight;
      setWidths({ left: newLeft, middle: newMiddle, right: newRight });
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    if (!dragStateRef.current) return;
    setWidths((current) => {
      saveWidths(current);
      return current;
    });
    setIsDragging(false);
    dragStateRef.current = null;
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  }, [handleMouseMove]);

  const startDragLeft = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragStateRef.current = {
        side: "left",
        startX: e.clientX,
        startWidths: widths,
      };
      setIsDragging(true);
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [widths, handleMouseMove, handleMouseUp]
  );

  const startDragRight = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragStateRef.current = {
        side: "right",
        startX: e.clientX,
        startWidths: widths,
      };
      setIsDragging(true);
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [widths, handleMouseMove, handleMouseUp]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  return { widths, startDragLeft, startDragRight, isDragging };
}
