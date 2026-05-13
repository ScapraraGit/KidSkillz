import { prisma } from "../db.js";
import { HttpError } from "../errors.js";
import { ensureChildCanEarn, ensureChildInFamily } from "./children.js";
import { postLedger } from "./ledger.js";
import { evaluateLevelUp } from "./levels.js";
import { evaluateChallenges } from "./challenges.js";
import { createNotification } from "./notifications.js";
import { getFamilySettings } from "./family.js";
import type { InitiativeKind } from "@prisma/client";

export interface SubmitInitiativeInput {
  childId: string;
  kind: InitiativeKind;
  title: string;
  description?: string;
  suggestedCredits: number;
  notes?: string;
  photoKey?: string;
}

export async function submitInitiative(familyId: string, input: SubmitInitiativeInput) {
  await ensureChildInFamily(familyId, input.childId);
  await ensureChildCanEarn(input.childId);
  if (input.suggestedCredits < 0) throw HttpError.badRequest("Suggested credits must be ≥ 0");

  return prisma.initiativeRequest.create({
    data: {
      familyId,
      childId: input.childId,
      kind: input.kind,
      title: input.title,
      description: input.description,
      suggestedCredits: input.suggestedCredits,
      notes: input.notes,
      photoKey: input.photoKey,
    },
    include: { child: { select: { id: true, name: true, avatarColor: true } } },
  });
}

export async function listInitiative(
  familyId: string,
  opts: { status?: "PENDING" | "APPROVED" | "REJECTED"; childId?: string },
) {
  return prisma.initiativeRequest.findMany({
    where: {
      familyId,
      ...(opts.status && { status: opts.status }),
      ...(opts.childId && { childId: opts.childId }),
    },
    include: { child: { select: { id: true, name: true, avatarColor: true } } },
    orderBy: { submittedAt: "desc" },
    take: 200,
  });
}

export async function approveInitiative(
  familyId: string,
  id: string,
  parentUserId: string,
  creditOverride?: number,
) {
  const ir = await prisma.initiativeRequest.findFirst({ where: { id, familyId } });
  if (!ir) throw HttpError.notFound("Initiative not found");
  if (ir.status !== "PENDING") throw HttpError.conflict("Already reviewed");

  const settings = await getFamilySettings(familyId);
  const baseCredits = creditOverride ?? ir.suggestedCredits;
  if (baseCredits < 0) throw HttpError.badRequest("Credit value cannot be negative");

  let bonus = 0;
  if (ir.kind === "PLANNED" && settings.initiativeBonus.enabled) {
    const flat = settings.initiativeBonus.plannedFlatBonus ?? 0;
    const mult = settings.initiativeBonus.plannedMultiplier ?? 1;
    bonus = Math.max(0, Math.round(baseCredits * (mult - 1)) + flat);
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.initiativeRequest.update({
      where: { id },
      data: {
        status: "APPROVED",
        reviewedAt: new Date(),
        reviewedById: parentUserId,
        creditAwarded: baseCredits,
        bonusApplied: bonus,
      },
      include: { child: { select: { id: true, name: true, avatarColor: true } } },
    });
    if (baseCredits > 0) {
      await postLedger({
        tx,
        familyId,
        childId: ir.childId,
        amount: baseCredits,
        kind: "INITIATIVE",
        reason: `Initiative: ${ir.title}`,
        sourceType: "INITIATIVE",
        sourceId: id,
        createdById: parentUserId,
      });
    }
    if (bonus > 0) {
      await postLedger({
        tx,
        familyId,
        childId: ir.childId,
        amount: bonus,
        kind: "INITIATIVE_BONUS",
        reason: `Planned-initiative bonus: ${ir.title}`,
        sourceType: "INITIATIVE",
        sourceId: id,
        createdById: parentUserId,
      });
    }
    if (baseCredits > 0 || bonus > 0) {
      await evaluateChallenges(
        { tx, familyId, childId: ir.childId, parentUserId },
        { type: "INITIATIVE_APPROVED", credits: baseCredits + bonus },
      );
      await evaluateLevelUp({ tx, familyId, childId: ir.childId, createdById: parentUserId });
    }
    await createNotification({
      tx,
      familyId,
      userId: ir.childId,
      kind: "INITIATIVE_APPROVED",
      title: `Initiative approved: ${ir.title}`,
      body: bonus > 0 ? `+${baseCredits + bonus} 🪙 (incl. +${bonus} bonus)` : `+${baseCredits} 🪙`,
      payload: { initiativeId: id },
    });
    return updated;
  });
}

export async function rejectInitiative(familyId: string, id: string, parentUserId: string, reason?: string) {
  const ir = await prisma.initiativeRequest.findFirst({ where: { id, familyId } });
  if (!ir) throw HttpError.notFound("Initiative not found");
  if (ir.status !== "PENDING") throw HttpError.conflict("Already reviewed");
  return prisma.initiativeRequest.update({
    where: { id },
    data: {
      status: "REJECTED",
      reviewedAt: new Date(),
      reviewedById: parentUserId,
      notes: reason ? `${ir.notes ?? ""}\n[Rejected] ${reason}`.trim() : ir.notes,
    },
    include: { child: { select: { id: true, name: true, avatarColor: true } } },
  });
}

export function serializeInitiative(ir: any) {
  return {
    id: ir.id,
    familyId: ir.familyId,
    childId: ir.childId,
    kind: ir.kind,
    title: ir.title,
    description: ir.description,
    suggestedCredits: ir.suggestedCredits,
    status: ir.status,
    notes: ir.notes,
    photoKey: ir.photoKey,
    submittedAt: ir.submittedAt.toISOString(),
    reviewedAt: ir.reviewedAt?.toISOString() ?? null,
    reviewedById: ir.reviewedById ?? null,
    creditAwarded: ir.creditAwarded ?? null,
    bonusApplied: ir.bonusApplied ?? null,
    child: ir.child ?? undefined,
  };
}
