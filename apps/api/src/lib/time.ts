import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import { startOfWeek } from "date-fns";

export function todayInTz(tz: string, now = new Date()): string {
  return formatInTimeZone(now, tz, "yyyy-MM-dd");
}

export function dayOfWeekInTz(tz: string, dateStr?: string, now = new Date()): number {
  const d = dateStr ? new Date(`${dateStr}T12:00:00Z`) : now;
  return Number(formatInTimeZone(d, tz, "i")) % 7; // 1..7 -> 1..6,0  ISO; we want 0..6 Sun..Sat
  // Note: 'i' returns 1=Mon..7=Sun. Convert to 0=Sun..6=Sat below in helper if needed.
}

// 0=Sun..6=Sat in family TZ
export function dowSunFirst(tz: string, dateStr?: string, now = new Date()): number {
  const d = dateStr ? new Date(`${dateStr}T12:00:00Z`) : now;
  const iso = Number(formatInTimeZone(d, tz, "i")); // 1..7 (Mon..Sun)
  return iso === 7 ? 0 : iso;
}

// UTC instant corresponding to Sunday 00:00 of the current week in the given TZ.
export function startOfWeekInTz(tz: string, now = new Date()): Date {
  const zoned = toZonedTime(now, tz);
  const localStart = startOfWeek(zoned, { weekStartsOn: 0 });
  return fromZonedTime(localStart, tz);
}

export function dateRangeForTodayPlus(tz: string, days: number, now = new Date()): string[] {
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getTime() + i * 86400000);
    out.push(formatInTimeZone(d, tz, "yyyy-MM-dd"));
  }
  return out;
}

export { toZonedTime };
