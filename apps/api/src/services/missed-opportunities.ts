import { prisma } from "../db.js";
import { HttpError } from "../errors.js";
import { getFamilySettings } from "./family.js";
import type { MissedOpportunityDTO } from "@chorechampz/shared";

export async function claimMissedOpportunity(
  familyId: string,
  taskId: string,
  claimedByUserId: string,
  occurrenceDate: string | null,
  slotIndex: number = 0,
): Promise<MissedOpportunityDTO> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, familyId, isActive: true },
  });
  if (!task) throw HttpError.notFound("Task not found");
  const settings = await getFamilySettings(familyId);
  if (settings.missedOpportunityMode === "OFF") {
    throw HttpError.badRequest("Missed Opportunity mode is off for this family");
  }

  const occ = task.kind === "RECURRING" ? occurrenceDate : null;
  let slot = 0;
  if (task.kind === "RECURRING") {
    const n = Math.max(1, task.timesPerDay);
    slot = Math.max(0, Math.floor(slotIndex));
    if (slot >= n) throw HttpError.badRequest(`slotIndex ${slot} out of range for task with ${n} slots`);
  }

  // Block if a kid has already submitted (or had it approved) for this occurrence + slot.
  const existingCompletion = await prisma.taskCompletion.findFirst({
    where: { taskId, occurrenceDate: occ, slotIndex: slot, status: { in: ["PENDING", "APPROVED"] } },
  });
  if (existingCompletion) throw HttpError.conflict("A kid already submitted this one");

  try {
    const row = await prisma.missedOpportunity.create({
      data: { familyId, taskId, claimedByUserId, occurrenceDate: occ, slotIndex: slot },
    });
    return serializeMO(row, { taskTitle: task.title });
  } catch (e: any) {
    if (e?.code === "P2002") throw HttpError.conflict("Already claimed");
    throw e;
  }
}

export async function listRecentMissedOpportunities(
  familyId: string,
  sinceDays = 7,
): Promise<MissedOpportunityDTO[]> {
  const since = new Date(Date.now() - sinceDays * 86_400_000);
  const rows = await prisma.missedOpportunity.findMany({
    where: { familyId, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      task: { select: { title: true } },
    },
  });
  // Fetch claimer names in one query.
  const ids = Array.from(new Set(rows.map((r) => r.claimedByUserId)));
  const users = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((r) =>
    serializeMO(r, { taskTitle: r.task.title, claimedByName: nameById.get(r.claimedByUserId) }),
  );
}

function serializeMO(
  r: {
    id: string;
    taskId: string;
    occurrenceDate: string | null;
    slotIndex?: number;
    claimedByUserId: string;
    createdAt: Date;
  },
  extras: { taskTitle?: string; claimedByName?: string } = {},
): MissedOpportunityDTO {
  return {
    id: r.id,
    taskId: r.taskId,
    occurrenceDate: r.occurrenceDate,
    slotIndex: r.slotIndex ?? 0,
    claimedByUserId: r.claimedByUserId,
    claimedByName: extras.claimedByName,
    taskTitle: extras.taskTitle,
    createdAt: r.createdAt.toISOString(),
  };
}
