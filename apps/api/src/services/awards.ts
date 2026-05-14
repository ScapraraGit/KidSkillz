import { fromZonedTime } from "date-fns-tz";
import type { FamilySettings, LateTier, SuggestedAwardDTO } from "@chorechampz/shared";

export interface AwardInputs {
  task: { kind: "ONE_TIME" | "RECURRING"; creditValue: number; dueAt: Date | null; dueByTime: string | null };
  occurrenceDate: string | null; // YYYY-MM-DD for recurring; null for one-time
  submittedAt: Date;
  settings: FamilySettings;
}

export function computeDeadline(
  task: AwardInputs["task"],
  occurrenceDate: string | null,
  tz: string,
): Date | null {
  if (task.kind === "ONE_TIME") return task.dueAt ?? null;

  if (task.kind === "RECURRING" && task.dueByTime && occurrenceDate) {
    if (!/^\d{2}:\d{2}$/.test(task.dueByTime)) return null;
    const [hh, mm] = task.dueByTime.split(":").map(Number);
    if (hh > 23 || mm > 59) return null;
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(occurrenceDate);
    if (!dateMatch) return null;
    const [, y, mo, d] = dateMatch;
    // Construct a Date whose UTC fields encode the local-clock time, so fromZonedTime
    // can shift it to a real UTC instant for the family TZ regardless of server TZ.
    const local = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), hh, mm, 0));
    return fromZonedTime(local, tz);
  }
  return null;
}

export function computeSuggestedAward(inputs: AwardInputs): SuggestedAwardDTO {
  const { task, occurrenceDate, submittedAt, settings } = inputs;
  const deadline = computeDeadline(task, occurrenceDate, settings.timezone);

  // No deadline configured — full credit, no decay info.
  if (!deadline) {
    return { credits: task.creditValue, tier: "ON_TIME", lateMinutes: 0, deadline: null };
  }

  const lateMinutes = Math.max(0, Math.floor((submittedAt.getTime() - deadline.getTime()) / 60000));

  // Penalties disabled at the family level — keep the deadline visible but always award full credit.
  const lp = settings.latePenalty;
  if (!lp?.enabled) {
    return { credits: task.creditValue, tier: "ON_TIME", lateMinutes, deadline: deadline.toISOString() };
  }

  const lateZoneEnd = lp.graceMinutes * Math.max(1, lp.lateMultiplier);

  let tier: LateTier;
  let credits: number;
  if (lateMinutes <= lp.graceMinutes) {
    tier = "ON_TIME";
    credits = task.creditValue;
  } else if (lateMinutes <= lateZoneEnd) {
    tier = "LATE";
    credits = Math.max(lp.creditFloor, Math.floor(task.creditValue * lp.latePercent));
  } else {
    tier = "SEVERE";
    credits = lp.creditFloor;
  }

  return { credits, tier, lateMinutes, deadline: deadline.toISOString() };
}
