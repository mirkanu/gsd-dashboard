import { useState, useEffect } from "react";

const SIDEBAR_PRICING_KEY = "showSidebarPricing";

export function getShowSidebarPricing(): boolean {
  try { return localStorage.getItem(SIDEBAR_PRICING_KEY) === "true"; }
  catch { return false; }
}

export function setShowSidebarPricing(v: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_PRICING_KEY, v ? "true" : "false");
    window.dispatchEvent(new StorageEvent("storage", { key: SIDEBAR_PRICING_KEY, newValue: v ? "true" : "false" }));
  } catch {}
}

export function useShowSidebarPricing(): [boolean, (v: boolean) => void] {
  const [val, setVal] = useState(getShowSidebarPricing);
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === SIDEBAR_PRICING_KEY) setVal(e.newValue === "true");
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);
  return [val, setShowSidebarPricing];
}
