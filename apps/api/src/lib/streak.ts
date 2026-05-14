import { addDays, format } from "date-fns";

/**
 * Pure helper: walks backward from `todayCal` counting consecutive days that exist in
 * `taskDays`. The streak does not reset on:
 *   - The most-recent day (today) — kid still has time to complete.
 *   - Days flagged as vacation via `isVacationDay`.
 *   - Up to `graceCount` other missed days, each consumed in order encountered.
 *
 * Exported so it can be unit-tested without a DB.
 */
export function computeStreakWithGrace(opts: {
  taskDays: Set<string>;
  todayCal: Date;
  isVacationDay: (d: string) => boolean;
  graceCount: number;
  maxLookback?: number;
}): number {
  const { taskDays, todayCal, isVacationDay, graceCount, maxLookback = 60 } = opts;
  let gracesLeft = graceCount;
  let streak = 0;
  for (let i = 0; i < maxLookback; i++) {
    const d = format(addDays(todayCal, -i), "yyyy-MM-dd");
    if (taskDays.has(d)) {
      streak++;
      continue;
    }
    if (i === 0) continue; // today not done yet
    if (isVacationDay(d)) continue;
    if (gracesLeft > 0) {
      gracesLeft--;
      streak++;
      continue;
    }
    break;
  }
  return streak;
}
