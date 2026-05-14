import { prisma } from "../db.js";
import { addDays, format, parseISO } from "date-fns";
import { todayInTz } from "../lib/time.js";
import { getFamilySettings } from "./family.js";
import { postLedger } from "./ledger.js";
import { createNotification } from "./notifications.js";
import type { Recurrence } from "@chorechamps/shared";

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
      const matches =
        rec.frequency === "DAILY" ||
        ((rec.frequency === "WEEKLY" || rec.frequency === "CUSTOM") &&
          Array.isArray(rec.daysOfWeek) &&
          rec.daysOfWeek.includes(dow));
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

      // Skip if any APPROVED completion exists for this occurrence. Scope by familyId
      // through the task relation so this is explicit even though taskId is globally
      // unique.
      const approved = await prisma.taskCompletion.findFirst({
        where: {
          taskId: t.id,
          occurrenceDate: yesterday,
          status: "APPROVED",
          task: { familyId: fam.id },
        },
      });
      if (approved) continue;

      for (const childId of candidateChildIds) {
        const profile = await prisma.childProfile.findUnique({
          where: { userId: childId },
          select: { penaltiesExempt: true },
        });
        if (profile?.penaltiesExempt) continue;

        // Wrap idempotency check + ledger post + notification in one transaction so
        // concurrent sweep invocations can't race past the existence check and
        // double-post. Also makes the negative-balance guard inside postLedger atomic
        // with the write.
        try {
          await prisma.$transaction(async (tx) => {
            const existingPenalty = await tx.ledgerEntry.findFirst({
              where: {
                childId,
                kind: "PENALTY",
                sourceType: "TASK_MISSED",
                sourceId: `${t.id}:${yesterday}`,
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
              sourceId: `${t.id}:${yesterday}`,
              // Null createdById = system-posted. LedgerEntry.createdById is nullable
              // with onDelete:SetNull; UI renders null actors as "System" implicitly
              // (no name lookup performed in ledger views). Avoiding a real sentinel
              // user keeps auth, audit, and tenant-isolation models simpler.
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
            payload: { taskId: t.id, occurrenceDate: yesterday },
          });
        } catch (e: any) {
          // INSUFFICIENT_CREDITS when allowNegativeBalance=false is expected and not
          // fatal — the kid simply isn't penalized further this round. Log and continue.
          if (e?.code === "INSUFFICIENT_CREDITS") {
            console.warn(`[penalty-sweep] skipped ${childId} for ${t.id}: insufficient credits`);
            continue;
          }
          throw e;
        }
      }
    }
  }

  return { posted, familiesProcessed };
}
