import { useCallback, useEffect, useRef, useState } from "react";
import { isNative } from "../lib/native";

const PULL_THRESHOLD = 64; // px of resistance-adjusted drag to trigger refresh
const MAX_PULL = 80; // max visual travel (px)

export interface PullToRefreshState {
  refreshing: boolean;
  pullDistance: number; // 0..MAX_PULL, resistance-adjusted
}

// Native-only. Detects pull-down-at-scroll-top gestures on `window` and fires
// `onRefresh` when the user releases after exceeding PULL_THRESHOLD. No-op on web.
export function usePullToRefresh(onRefresh: () => Promise<void>): PullToRefreshState {
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);

  const startY = useRef(0);
  const active = useRef(false);
  const pullDistRef = useRef(0); // mirrors state for use in touch-end without stale closure
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const onTouchStart = useCallback((e: TouchEvent) => {
    if (window.scrollY > 2) return; // not at top — ignore
    startY.current = e.touches[0].clientY;
    active.current = true;
  }, []);

  const onTouchMove = useCallback((e: TouchEvent) => {
    if (!active.current) return;
    if (window.scrollY > 2) {
      active.current = false;
      setPullDistance(0);
      pullDistRef.current = 0;
      return;
    }
    const dy = e.touches[0].clientY - startY.current;
    if (dy <= 0) {
      setPullDistance(0);
      pullDistRef.current = 0;
      return;
    }
    // Apply rubber-band resistance: sqrt curve so it feels springy
    const clamped = Math.min(Math.sqrt(dy) * 5, MAX_PULL);
    setPullDistance(clamped);
    pullDistRef.current = clamped;
  }, []);

  const onTouchEnd = useCallback(async () => {
    if (!active.current) return;
    active.current = false;
    const dist = pullDistRef.current;
    setPullDistance(0);
    pullDistRef.current = 0;
    if (dist >= PULL_THRESHOLD) {
      setRefreshing(true);
      try {
        await onRefreshRef.current();
      } finally {
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!isNative()) return;
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [onTouchStart, onTouchMove, onTouchEnd]);

  return { refreshing, pullDistance };
}

export { PULL_THRESHOLD, MAX_PULL };
