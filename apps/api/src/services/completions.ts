import { prisma } from "../db.js";
import { HttpError } from "../errors.js";
import { getFamilySettings, isVacationActive } from "./family.js";
import { ensureChildCanEarn, ensureChildInFamily } from "./children.js";
import { postLedger } from "./ledger.js";
import { evaluateLevelUp } from "./levels.js";
import { evaluateChallenges } from "./challenges.js";
import { createNotification } from "./notifications.js";
import { formatInTimeZone } from "date-fns-tz";
import { todayInTz } from "../lib/time.js";
import { serializeTask } from "./tasks.js";
import { computeSuggestedAward } from "./awards.js";
import type { ProofRequirement } from "@prisma/client";
import type { SuggestedAwardDTO } from "@chorechampz/shared";

import { computeTeamSplit } from "../lib/team-split.js";
import { effectiveProofRequirement, features } from "../lib/features.js";

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
  const settings = await getFamilySettings(familyId);
  if (isVacationActive(settings)) {
    throw HttpError.forbidden("Vacation mode is on — enjoy the break!");
  }

  const task = await prisma.task.findFirst({ where: { id: input.taskId, familyId, isActive: true } });
  if (!task) throw HttpError.notFound("Task not found");

  // Resolve effective proof requirement: child override > task setting. Downgrade
  // PHOTO_* values when the feature flag is off so legacy data doesn't brick kids.
  const profile = await prisma.childProfile.findUnique({ where: { userId: child.id } });
  const required = effectiveProofRequirement(profile?.proofRequirementOverride ?? task.proofRequirement);

  const hasNotes = !!input.notes && input.notes.trim().length > 0;
  // Ignore any client-supplied photoKey when photo proof is disabled. Belt-and-
  // suspenders next to the uploads route returning 503.
  const hasPhoto = features.photoProof && !!input.photoKey;

  if (!proofMet(required, hasNotes, hasPhoto)) {
    throw HttpError.unprocessable(`Proof requirement not satisfied: ${required}`, "PROOF_REQUIRED");
  }

  const occurrenceDate =
    task.kind === "RECURRING"
      ? (input.occurrenceDate ?? todayInTz((await getFamilySettings(familyId)).timezone))
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

  // Block submission if a parent already self-claimed this occurrence (Missed Opportunity).
  const missed = await prisma.missedOpportunity.findFirst({
    where: { taskId: task.id, occurrenceDate },
  });
  if (missed) throw HttpError.conflict("A grown-up already claimed this one!");

  if (task.assignmentMode === "UP_FOR_GRABS") {
    // Pool tasks: first kid to submit claims it. Block if anyone else has a live claim.
    const claimed = await prisma.taskCompletion.findFirst({
      where: {
        taskId: task.id,
        occurrenceDate,
        status: { in: ["PENDING", "APPROVED"] },
        NOT: { childId: child.id },
      },
    });
    if (claimed) throw HttpError.conflict("Another kid already grabbed this one");
  } else if (task.assignmentMode === "TEAM") {
    // Team: only one submission per occurrence (whoever submits represents the team).
    // Auto-join submitter so they appear on the roster at approval time.
    const otherSubmission = await prisma.taskCompletion.findFirst({
      where: {
        taskId: task.id,
        occurrenceDate,
        status: { in: ["PENDING", "APPROVED"] },
      },
    });
    if (otherSubmission) throw HttpError.conflict("Team already submitted for this occurrence");
    const existingJoin = await prisma.taskJoin.findFirst({
      where: { taskId: task.id, childId: child.id, occurrenceDate },
    });
    if (!existingJoin) {
      await prisma.taskJoin.create({
        data: { familyId, taskId: task.id, childId: child.id, occurrenceDate },
      });
    }
  } else if (task.assignedToId !== child.id) {
    throw HttpError.forbidden("This task is assigned to a different kid");
  }

  return prisma.taskCompletion.create({
    data: {
      taskId: task.id,
      childId: child.id,
      notes: input.notes ?? null,
      photoKey: features.photoProof ? (input.photoKey ?? null) : null,
      occurrenceDate,
    },
    include: { task: true, child: { select: { id: true, name: true, avatarColor: true } } },
  });
}

export async function listCompletions(
  familyId: string,
  opts: { status?: "PENDING" | "APPROVED" | "REJECTED"; childId?: string },
) {
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

export async function approveCompletion(
  familyId: string,
  completionId: string,
  parentUserId: string,
  creditOverride?: number,
  parentNote?: string,
) {
  const c = await prisma.taskCompletion.findFirst({
    where: { id: completionId, task: { familyId } },
    include: { task: true },
  });
  if (!c) throw HttpError.notFound("Completion not found");
  if (c.status !== "PENDING") throw HttpError.conflict("Completion already reviewed");

  // Hoist settings fetch out of the transaction so credit math + early-bird detection
  // see a consistent snapshot, and to keep the JSON read off the tx connection.
  const settings = await getFamilySettings(familyId);

  let credits: number;
  if (creditOverride !== undefined) {
    credits = creditOverride;
  } else {
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

  const submittedHour = Number(formatInTimeZone(c.submittedAt, settings.timezone, "H"));

  const updated = await prisma.$transaction(async (tx) => {
    const trimmedNote = parentNote?.trim() || null;
    // Atomic guard against double-approval: updateMany with a PENDING filter; if zero
    // rows changed someone else already approved or rejected this completion.
    const guard = await tx.taskCompletion.updateMany({
      where: { id: completionId, status: "PENDING" },
      data: {
        status: "APPROVED",
        reviewedAt: new Date(),
        reviewedById: parentUserId,
        creditAwarded: credits,
        parentNote: trimmedNote,
      },
    });
    if (guard.count === 0) {
      throw HttpError.conflict("Completion already reviewed");
    }
    const upd = await tx.taskCompletion.findUniqueOrThrow({
      where: { id: completionId },
      include: { task: true, child: { select: { id: true, name: true, avatarColor: true } } },
    });
    if (credits > 0) {
      // Determine credit recipients. Default: just the submitting child. For TEAM tasks,
      // the credit either splits across joiners (EVEN) or each joiner receives the full
      // amount (FULL). Only joiners present at submission time qualify, so late joiners
      // can't game the split after the parent opens approval.
      let recipients: { childId: string; amount: number }[];
      if (c.task.assignmentMode === "TEAM") {
        const joins = await tx.taskJoin.findMany({
          where: {
            taskId: c.taskId,
            occurrenceDate: c.occurrenceDate,
            createdAt: { lte: c.submittedAt },
          },
          select: { childId: true },
        });
        const ids = Array.from(new Set([c.childId, ...joins.map((j) => j.childId)]));
        recipients = computeTeamSplit(credits, ids, c.task.teamSplit);
      } else {
        recipients = [{ childId: c.childId, amount: credits }];
      }

      for (const r of recipients) {
        await postLedger({
          tx,
          familyId,
          childId: r.childId,
          amount: r.amount,
          kind: "TASK",
          reason: c.task.assignmentMode === "TEAM" ? `Team task: ${c.task.title}` : `Task: ${c.task.title}`,
          sourceType: "TASK_COMPLETION",
          // Per-recipient sourceId so the entry is uniquely identifiable in the audit
          // log and a partial retry can be detected without double-posting.
          sourceId: `${completionId}:${r.childId}`,
          createdById: parentUserId,
        });
        await evaluateChallenges(
          { tx, familyId, childId: r.childId, parentUserId },
          { type: "TASK_APPROVED", credits: r.amount, earlyBird: submittedHour < 12 },
        );
        await evaluateLevelUp({ tx, familyId, childId: r.childId, createdById: parentUserId });
      }
    }
    return upd;
  });

  await createNotification({
    familyId,
    userId: c.childId,
    kind: "COMPLETION_APPROVED",
    title: `+${updated.creditAwarded ?? 0} 🪙 for "${c.task.title}"`,
    body: parentNote?.trim() || undefined,
    payload: { completionId, taskId: c.taskId },
  });
  if (parentNote?.trim()) {
    await createNotification({
      familyId,
      userId: c.childId,
      kind: "KUDOS",
      title: `Kudos from a grown-up!`,
      body: parentNote.trim(),
    });
  }

  return updated;
}

export async function rejectCompletion(
  familyId: string,
  completionId: string,
  parentUserId: string,
  reason?: string,
) {
  const c = await prisma.taskCompletion.findFirst({
    where: { id: completionId, task: { familyId } },
    include: { task: true },
  });
  if (!c) throw HttpError.notFound("Completion not found");
  if (c.status !== "PENDING") throw HttpError.conflict("Completion already reviewed");
  const updated = await prisma.taskCompletion.update({
    where: { id: completionId },
    data: {
      status: "REJECTED",
      reviewedAt: new Date(),
      reviewedById: parentUserId,
      notes: reason ? `${c.notes ?? ""}\n[Rejected] ${reason}`.trim() : c.notes,
    },
    include: { task: true, child: { select: { id: true, name: true, avatarColor: true } } },
  });
  await createNotification({
    familyId,
    userId: c.childId,
    kind: "COMPLETION_REJECTED",
    title: `"${c.task.title}" needs another try`,
    body: reason || undefined,
    payload: { completionId },
  });
  return updated;
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
    parentNote: c.parentNote ?? null,
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
