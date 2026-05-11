import { prisma } from "../db.js";
import { HttpError } from "../errors.js";
import { getFamilySettings } from "./family.js";
import { ensureChildCanEarn, ensureChildInFamily } from "./children.js";
import { postLedger } from "./ledger.js";
import { todayInTz } from "../lib/time.js";
import { serializeTask } from "./tasks.js";
import { computeSuggestedAward } from "./awards.js";
import type { ProofRequirement } from "@prisma/client";
import type { SuggestedAwardDTO } from "@chorechamps/shared";

function proofMet(req: ProofRequirement, hasNotes: boolean, hasPhoto: boolean) {
  switch (req) {
    case "NONE":
    case "NOTES_OPTIONAL":
    case "PHOTO_OPTIONAL":
      return true;
    case "NOTES_REQUIRED":
      return hasNotes;
    case "PHOTO_REQUIRED":
      return hasPhoto;
    case "PHOTO_AND_NOTES":
      return hasNotes && hasPhoto;
  }
}

export interface SubmitCompletionInput {
  taskId: string;
  childId: string;
  notes?: string | null;
  photoKey?: string | null;
  occurrenceDate?: string | null;
}

export async function submitCompletion(familyId: string, input: SubmitCompletionInput) {
  const child = await ensureChildInFamily(familyId, input.childId);
  await ensureChildCanEarn(child.id);

  const task = await prisma.task.findFirst({ where: { id: input.taskId, familyId, isActive: true } });
  if (!task) throw HttpError.notFound("Task not found");

  // Resolve effective proof requirement: child override > task setting
  const profile = await prisma.childProfile.findUnique({ where: { userId: child.id } });
  const required = profile?.proofRequirementOverride ?? task.proofRequirement;

  const hasNotes = !!input.notes && input.notes.trim().length > 0;
  const hasPhoto = !!input.photoKey;

  if (!proofMet(required, hasNotes, hasPhoto)) {
    throw HttpError.unprocessable(`Proof requirement not satisfied: ${required}`, "PROOF_REQUIRED");
  }

  const occurrenceDate =
    task.kind === "RECURRING"
      ? input.occurrenceDate ?? todayInTz((await getFamilySettings(familyId)).timezone)
      : null;

  // Reject duplicate active completion for this occurrence
  const existing = await prisma.taskCompletion.findFirst({
    where: {
      taskId: task.id,
      childId: child.id,
      occurrenceDate,
      status: { in: ["PENDING", "APPROVED"] },
    },
  });
  if (existing) throw HttpError.conflict("Already submitted for this occurrence");

  return prisma.taskCompletion.create({
    data: {
      taskId: task.id,
      childId: child.id,
      notes: input.notes ?? null,
      photoKey: input.photoKey ?? null,
      occurrenceDate,
    },
    include: { task: true, child: { select: { id: true, name: true, avatarColor: true } } },
  });
}

export async function listCompletions(familyId: string, opts: { status?: "PENDING" | "APPROVED" | "REJECTED"; childId?: string }) {
  return prisma.taskCompletion.findMany({
    where: {
      task: { familyId },
      ...(opts.status && { status: opts.status }),
      ...(opts.childId && { childId: opts.childId }),
    },
    include: { task: true, child: { select: { id: true, name: true, avatarColor: true } } },
    orderBy: { submittedAt: "desc" },
    take: 200,
  });
}

export async function approveCompletion(familyId: string, completionId: string, parentUserId: string, creditOverride?: number) {
  const c = await prisma.taskCompletion.findFirst({
    where: { id: completionId, task: { familyId } },
    include: { task: true },
  });
  if (!c) throw HttpError.notFound("Completion not found");
  if (c.status !== "PENDING") throw HttpError.conflict("Completion already reviewed");

  let credits: number;
  if (creditOverride !== undefined) {
    credits = creditOverride;
  } else {
    const settings = await getFamilySettings(familyId);
    credits = computeSuggestedAward({
      task: {
        kind: c.task.kind,
        creditValue: c.task.creditValue,
        dueAt: c.task.dueAt,
        dueByTime: c.task.dueByTime,
      },
      occurrenceDate: c.occurrenceDate,
      submittedAt: c.submittedAt,
      settings,
    }).credits;
  }
  if (credits < 0) throw HttpError.badRequest("Credit value cannot be negative");

  const updated = await prisma.$transaction(async (tx) => {
    const upd = await tx.taskCompletion.update({
      where: { id: completionId },
      data: {
        status: "APPROVED",
        reviewedAt: new Date(),
        reviewedById: parentUserId,
        creditAwarded: credits,
      },
      include: { task: true, child: { select: { id: true, name: true, avatarColor: true } } },
    });
    if (credits > 0) {
      await postLedger({
        tx,
        familyId,
        childId: c.childId,
        amount: credits,
        kind: "TASK",
        reason: `Task: ${c.task.title}`,
        sourceType: "TASK_COMPLETION",
        sourceId: completionId,
        createdById: parentUserId,
      });
    }
    return upd;
  });
  return updated;
}

export async function rejectCompletion(familyId: string, completionId: string, parentUserId: string, reason?: string) {
  const c = await prisma.taskCompletion.findFirst({ where: { id: completionId, task: { familyId } } });
  if (!c) throw HttpError.notFound("Completion not found");
  if (c.status !== "PENDING") throw HttpError.conflict("Completion already reviewed");
  return prisma.taskCompletion.update({
    where: { id: completionId },
    data: {
      status: "REJECTED",
      reviewedAt: new Date(),
      reviewedById: parentUserId,
      notes: reason ? `${c.notes ?? ""}\n[Rejected] ${reason}`.trim() : c.notes,
    },
    include: { task: true, child: { select: { id: true, name: true, avatarColor: true } } },
  });
}

export function serializeCompletion(c: any, suggested?: SuggestedAwardDTO | null) {
  return {
    id: c.id,
    taskId: c.taskId,
    childId: c.childId,
    status: c.status,
    notes: c.notes,
    photoKey: c.photoKey,
    occurrenceDate: c.occurrenceDate,
    submittedAt: c.submittedAt.toISOString(),
    reviewedAt: c.reviewedAt?.toISOString() ?? null,
    reviewedById: c.reviewedById ?? null,
    creditAwarded: c.creditAwarded ?? null,
    suggestedAward: suggested ?? null,
    task: c.task ? serializeTask(c.task) : undefined,
    child: c.child ?? undefined,
  };
}

// Computes and attaches `suggestedAward` to each pending completion using the family's settings.
export async function serializePendingCompletions(familyId: string, completions: any[]) {
  if (completions.length === 0) return [];
  const settings = await getFamilySettings(familyId);
  return completions.map((c) => {
    if (c.status !== "PENDING" || !c.task) return serializeCompletion(c);
    const suggested = computeSuggestedAward({
      task: {
        kind: c.task.kind,
        creditValue: c.task.creditValue,
        dueAt: c.task.dueAt,
        dueByTime: c.task.dueByTime,
      },
      occurrenceDate: c.occurrenceDate,
      submittedAt: c.submittedAt,
      settings,
    });
    return serializeCompletion(c, suggested);
  });
}
