/**
 * Active focus-timer state. Single-instance per kid per browser, persisted to localStorage.
 * Survives reload; multi-tab uses last-write-wins via storage event broadcast.
 */
export interface ActiveTimer {
  taskId: string;
  taskTitle: string;
  startedAt: number; // ms epoch
  durationMs: number;
  childId: string;
}

const STORAGE_KEY = "cc:activeTimer";

export function loadTimer(childId: string): ActiveTimer | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveTimer;
    if (
      typeof parsed?.taskId !== "string" ||
      typeof parsed?.startedAt !== "number" ||
      typeof parsed?.durationMs !== "number" ||
      typeof parsed?.childId !== "string"
    )
      return null;
    if (parsed.childId !== childId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveTimer(t: ActiveTimer): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
  } catch {
    // Storage disabled or full — silent no-op.
  }
}

export function clearTimer(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function timeLeftMs(t: ActiveTimer, now: number = Date.now()): number {
  return Math.max(0, t.startedAt + t.durationMs - now);
}

export function isExpired(t: ActiveTimer, now: number = Date.now()): boolean {
  return timeLeftMs(t, now) <= 0;
}

export function formatMmSs(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
