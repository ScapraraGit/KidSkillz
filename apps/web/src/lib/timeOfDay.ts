/** Milliseconds until 24:00 in the given IANA timezone. */
export function msUntilEndOfDay(tz: string, now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const h = get("hour") % 24; // "24" → 0 on some impls
  const m = get("minute");
  const s = get("second");
  return ((24 - h) * 3600 - m * 60 - s) * 1000;
}

export function formatHoursMinutes(ms: number): string {
  if (ms <= 0) return "0m";
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}
