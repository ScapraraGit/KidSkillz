import { prisma } from "../db.js";
import { addDays, format, parseISO } from "date-fns";
import { todayInTz } from "../lib/time.js";
import { getFamilySettings } from "./family.js";
import { postLedger } from "./ledger.js";
import { createNotification } from "./notifications.js";
import type { Recurrence } from "@chorechampz/shared";

/**
 * Sweeps yesterday's RECURRING tasks for each family and posts negative-credit ledger
 * entries for kids who didn't complete a task with a configured `missedPenalty`. Honors
 * `family.penaltiesEnabled` master switch and per-kid `penaltiesExempt`. Idempotent —
 * checks for an existing PENALTY entry sourced at the same occurrence before posting.
 */
export async function sweepMissedTaskPenalties(
  now = new Date(),
): Promise<{ posted: number; familiesProcessed: number }> {
  const families = await prisma.family.findMany({ select: { id: true } });
  let posted = 0;
  let familiesProcessed = 0;

  for (const fam of families) {
    familiesProcessed++;
    const settings = await getFamilySettings(fam.id);
    if (!settings.penaltiesEnabled) continue;

    const tz = settings.timezone;
    const yesterday = format(addDays(parseISO(todayInTz(tz, now)), -1), "yyyy-MM-dd");
    const dow = parseISO(yesterday).getDay();

    const tasks = await prisma.task.findMany({
      where: {
        familyId: fam.id,
        isActive: true,
        kind: "RECURRING",
        missedPenalty: { gt: 0 },
      },
    });

    for (const t of tasks) {
      const rec = t.recurrence as unknown as Recurrence | null;
      if (!rec) continue;
      const hasDayList = Array.isArray(rec.daysOfWeek) && rec.daysOfWeek.length > 0;
      const matches =
        (rec.frequency === "DAILY" && (!hasDayList || rec.daysOfWeek!.includes(dow))) ||
        ((rec.frequency === "WEEKLY" || rec.frequency === "CUSTOM") &&
          hasDayList &&
          rec.daysOfWeek!.includes(dow));
      if (!matches) continue;
      if (rec.expiresAt && new Date(yesterday) > new Date(rec.expiresAt)) continue;

      // Determine which kids should have done this task yesterday.
      let candidateChildIds: string[] = [];
      if (t.assignmentMode === "ASSIGNED" && t.assignedToId) {
        candidateChildIds = [t.assignedToId];
      } else if (t.assignmentMode === "UP_FOR_GRABS" || t.assignmentMode === "TEAM") {
        // Pool/team tasks: penalty would be ambiguous (which kid "missed"?). Skip — pool
        // tasks only penalize the family collectively, which we don't model.
        continue;
      }
      if (candidateChildIds.length === 0) continue;

      const slotCount = Math.max(1, t.timesPerDay);
      // Fetch all APPROVED completions for this task+day so we can skip per-slot.
      const approvedRows = await prisma.taskCompletion.findMany({
        where: {
          taskId: t.id,
          occurrenceDate: yesterday,
          status: "APPROVED",
          task: { familyId: fam.id },
        },
        select: { slotIndex: true },
      });
      const approvedSlots = new Set(approvedRows.map((r) => r.slotIndex));

      for (let slot = 0; slot < slotCount; slot++) {
        if (approvedSlots.has(slot)) continue;

        for (const childId of candidateChildIds) {
          const profile = await prisma.childProfile.findUnique({
            where: { userId: childId },
            select: { penaltiesExempt: true },
          });
          if (profile?.penaltiesExempt) continue;

          const slotSourceId = slotCount > 1 ? `${t.id}:${yesterday}:${slot}` : `${t.id}:${yesterday}`;
          try {
            await prisma.$transaction(async (tx) => {
              const existingPenalty = await tx.ledgerEntry.findFirst({
                where: {
                  childId,
                  kind: "PENALTY",
                  sourceType: "TASK_MISSED",
                  sourceId: slotSourceId,
                },
              });
              if (existingPenalty) return;

              await postLedger({
                tx,
                familyId: fam.id,
                childId,
                amount: -t.missedPenalty,
                kind: "PENALTY",
                reason: `Missed: ${t.title}`,
                sourceType: "TASK_MISSED",
                sourceId: slotSourceId,
                createdById: null,
              });
              posted++;
            });

            await createNotification({
              familyId: fam.id,
              userId: childId,
              kind: "COMPLETION_REJECTED",
              title: `−${t.missedPenalty} 🪙 — missed "${t.title}"`,
              body: "Try not to miss it again!",
              payload: { taskId: t.id, occurrenceDate: yesterday, slotIndex: slot },
            });
          } catch (e: any) {
            if (e?.code === "INSUFFICIENT_CREDITS") {
              console.warn(`[penalty-sweep] skipped ${childId} for ${t.id}: insufficient credits`);
              continue;
            }
            throw e;
          }
        }
      }
    }
  }

  return { posted, familiesProcessed };
}
