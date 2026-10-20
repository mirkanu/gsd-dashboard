import { useEffect } from "react";

/**
 * iOS Safari-safe body scroll lock.
 *
 * The naive `document.body.style.overflow = "hidden"` is unreliable on iOS
 * Safari — the viewport can still rubber-band, and the address bar can
 * collapse/expand, exposing scroll behavior above/below the overlay. The
 * standard workaround is:
 *
 *   1. Pin both `html` and `body` with `overflow: hidden` and `height: 100%`
 *      so there's nothing to scroll.
 *   2. Park the scroll position via `position: fixed; top: -<scrollY>px`
 *      on the body so the visible content stays put.
 *   3. Add `touch-action: none` to both `html` and `body` — Safari's
 *      `touch-action` is required to suppress the rubber-band gesture on
 *      iOS 13+ even when overflow is hidden.
 *   4. Restore everything on cleanup, including the scroll offset.
 *
 * Pass `active = false` to skip locking (used when only desktop layouts run
 * the overlay as an inline grid panel — no body lock is wanted there).
 */
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;

    // Snapshot the original values so we can restore them 1:1.
    const scrollY = window.scrollY;
    const originalHtml = {
      overflow: document.documentElement.style.overflow,
      touchAction: document.documentElement.style.touchAction,
      height: document.documentElement.style.height,
    };
    const originalBody = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      width: document.body.style.width,
      top: document.body.style.top,
      touchAction: document.body.style.touchAction,
    };

    // Apply the lock to BOTH html and body — Safari will rubber-band if you
    // only lock one of them, especially in iOS 13+.
    document.documentElement.style.overflow = "hidden";
    document.documentElement.style.height = "100%";
    document.documentElement.style.touchAction = "none";
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.width = "100%";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.touchAction = "none";

    return () => {
      // Restore html + body styles
      document.documentElement.style.overflow = originalHtml.overflow;
      document.documentElement.style.touchAction = originalHtml.touchAction;
      document.documentElement.style.height = originalHtml.height;
      document.body.style.overflow = originalBody.overflow;
      document.body.style.position = originalBody.position;
      document.body.style.width = originalBody.width;
      document.body.style.top = originalBody.top;
      document.body.style.touchAction = originalBody.touchAction;
      // Restore scroll position the way the prior in-component body-lock did.
      window.scrollTo(0, scrollY);
    };
  }, [active]);
}
