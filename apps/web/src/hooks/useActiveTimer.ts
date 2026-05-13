import { useCallback, useEffect, useRef, useState } from "react";
import { ActiveTimer, clearTimer, isExpired, loadTimer, saveTimer, timeLeftMs } from "../lib/activeTimer";

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
}

export function useActiveTimer({ childId, onExpire }: Opts): UseActiveTimer {
  const [timer, setTimer] = useState<ActiveTimer | null>(() => (childId ? loadTimer(childId) : null));
  const [now, setNow] = useState(() => Date.now());
  const firedExpireRef = useRef<string | null>(null);

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
