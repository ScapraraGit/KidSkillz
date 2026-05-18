import { useCallback, useEffect, useRef, useState } from "react";
import type { ActiveTimer} from "../lib/activeTimer";
import { clearTimer, isExpired, loadTimer, saveTimer, timeLeftMs } from "../lib/activeTimer";
import { playTick } from "../lib/celebrate";
import { prefersReducedMotion } from "../lib/motion";

interface UseActiveTimer {
  timer: ActiveTimer | null;
  timeLeft: number;
  expired: boolean;
  start: (input: { taskId: string; taskTitle: string; durationMs: number }) => void;
  cancel: () => void;
}

interface Opts {
  childId: string | null | undefined;
  /** Fires once each time the active timer transitions from running to expired. */
  onExpire?: (t: ActiveTimer) => void;
  /** When true, plays a soft tick each second (rushed tick in the last 10s). */
  soundEnabled?: boolean;
}

export function useActiveTimer({ childId, onExpire, soundEnabled = false }: Opts): UseActiveTimer {
  const [timer, setTimer] = useState<ActiveTimer | null>(() => (childId ? loadTimer(childId) : null));
  const [now, setNow] = useState(() => Date.now());
  const firedExpireRef = useRef<string | null>(null);
  const lastTickSecRef = useRef<number | null>(null);

  // Reload when childId changes (e.g. login switch).
  useEffect(() => {
    setTimer(childId ? loadTimer(childId) : null);
    firedExpireRef.current = null;
  }, [childId]);

  // Tick once per second while a timer is active.
  useEffect(() => {
    if (!timer) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [timer]);

  // Sync across tabs.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== "cc:activeTimer") return;
      setTimer(childId ? loadTimer(childId) : null);
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [childId]);

  // Play a tick once per whole second of remaining time. Last 10s get a rushed
  // (higher, sharper) variant. Gated on soundEnabled + prefers-reduced-motion
  // since constant beeping is exactly what that preference asks us to avoid.
  // lastTickSecRef ensures we don't double-fire if the now state updates twice
  // within the same second (e.g. after a tab regains focus).
  useEffect(() => {
    if (!timer || !soundEnabled) return;
    if (prefersReducedMotion()) return;
    const remaining = timeLeftMs(timer, now);
    if (remaining <= 0) return;
    const secLeft = Math.ceil(remaining / 1000);
    if (lastTickSecRef.current === secLeft) return;
    lastTickSecRef.current = secLeft;
    playTick(secLeft <= 10 ? "rush" : "normal");
  }, [timer, now, soundEnabled]);

  // Reset the tick-second guard when the timer instance changes (new start,
  // cancel, etc) so a fresh 10:00 timer ticks at 600s rather than skipping.
  useEffect(() => {
    lastTickSecRef.current = null;
  }, [timer?.startedAt]);

  // Fire onExpire once per timer instance.
  useEffect(() => {
    if (!timer || !onExpire) return;
    if (!isExpired(timer, now)) return;
    const key = `${timer.taskId}:${timer.startedAt}`;
    if (firedExpireRef.current === key) return;
    firedExpireRef.current = key;
    onExpire(timer);
  }, [timer, now, onExpire]);

  const start = useCallback<UseActiveTimer["start"]>(
    (input) => {
      if (!childId) return;
      const next: ActiveTimer = {
        taskId: input.taskId,
        taskTitle: input.taskTitle,
        startedAt: Date.now(),
        durationMs: input.durationMs,
        childId,
      };
      saveTimer(next);
      setTimer(next);
      firedExpireRef.current = null;
    },
    [childId],
  );

  const cancel = useCallback(() => {
    clearTimer();
    setTimer(null);
    firedExpireRef.current = null;
  }, []);

  return {
    timer,
    timeLeft: timer ? timeLeftMs(timer, now) : 0,
    expired: timer ? isExpired(timer, now) : false,
    start,
    cancel,
  };
}
