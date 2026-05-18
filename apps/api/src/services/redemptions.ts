import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";
import { ensureChildCanRedeem, ensureChildInFamily } from "./children.js";
import { getReward } from "./rewards.js";
import { getBalance, postLedger } from "./ledger.js";
import { getFamilySettings } from "./family.js";
import { createNotification } from "./notifications.js";
import type { RewardMetadata } from "@chorechampz/shared";

export interface RequestRedemptionInput {
  childId: string;
  rewardId: string;
  quantity?: number;
  notes?: string;
}

export async function requestRedemption(familyId: string, input: RequestRedemptionInput) {
  await ensureChildInFamily(familyId, input.childId);
  await ensureChildCanRedeem(input.childId);
  const reward = await getReward(familyId, input.rewardId);
  if (!reward.isActive) throw HttpError.unprocessable("Reward is not active");

  if (reward.eligibleChildIds.length > 0 && !reward.eligibleChildIds.includes(input.childId)) {
    throw HttpError.forbidden("You are not eligible for this reward");
  }

  const quantity = Math.max(1, Math.floor(input.quantity ?? 1));
  const meta = (reward.metadata as RewardMetadata) ?? {};

  // Quantity-based rewards (screen/game time): enforce family + reward caps
  if (reward.type === "SCREEN_TIME" || reward.type === "GAME_TIME") {
    const settings = await getFamilySettings(familyId);
    const unit = meta.unitMinutes ?? settings.screenTime.incrementMinutes;
    const maxMinutes = meta.maxPerRedemption ?? settings.screenTime.maxPerRedemptionMinutes;
    const minutes = unit * quantity;
    if (minutes > maxMinutes) {
      throw HttpError.unprocessable(
        `Maximum ${maxMinutes} minutes per redemption (requested ${minutes})`,
        "OVER_LIMIT",
      );
    }
  }

  const totalCost = reward.creditCost * quantity;
  const balance = await getBalance(input.childId);
  if (balance < totalCost) {
    throw HttpError.unprocessable(
      `Not enough credits (have ${balance}, need ${totalCost})`,
      "INSUFFICIENT_CREDITS",
    );
  }

  // Daily / weekly limit check (count APPROVED redemptions of this reward by this child)
  if (reward.dailyLimit || reward.weeklyLimit) {
    const since = new Date();
    if (reward.weeklyLimit) since.setDate(since.getDate() - 7);
    if (reward.dailyLimit) since.setHours(0, 0, 0, 0);
    const count = await prisma.redemption.count({
      where: {
        rewardId: reward.id,
        childId: input.childId,
        status: "APPROVED",
        reviewedAt: { gte: since },
      },
    });
    const cap = reward.dailyLimit ?? reward.weeklyLimit ?? Number.POSITIVE_INFINITY;
    if (count >= cap) throw HttpError.unprocessable("Redemption limit reached", "LIMIT_REACHED");
  }

  return prisma.redemption.create({
    data: {
      rewardId: reward.id,
      childId: input.childId,
      creditCost: totalCost,
      quantity,
      notes: input.notes,
      status: reward.requiresApproval ? "PENDING" : "PENDING", // POC: always pending; auto-approval flow below if needed
    },
    include: {
      reward: true,
      child: { select: { id: true, name: true, avatarColor: true } },
    },
  });
}

export async function listRedemptions(
  familyId: string,
  opts: {
    status?: "PENDING" | "APPROVED" | "REJECTED";
    childId?: string;
    limit?: number;
    offset?: number;
  },
) {
  const limit = Math.min(Math.max(1, Math.floor(opts.limit ?? 50)), 200);
  const offset = Math.max(0, Math.floor(opts.offset ?? 0));
  return prisma.redemption.findMany({
    where: {
      reward: { familyId },
      ...(opts.status && { status: opts.status }),
      ...(opts.childId && { childId: opts.childId }),
    },
    include: { reward: true, child: { select: { id: true, name: true, avatarColor: true } } },
    orderBy: { requestedAt: "desc" },
    take: limit,
    skip: offset,
  });
}

export async function approveRedemption(familyId: string, id: string, parentUserId: string) {
  const r = await prisma.redemption.findFirst({
    where: { id, reward: { familyId } },
    include: { reward: true },
  });
  if (!r) throw HttpError.notFound("Redemption not found");
  if (r.status !== "PENDING") throw HttpError.conflict("Already reviewed");

  // Re-check earning pause / redeem permission at approval time. Balance is
  // re-checked INSIDE the transaction below so concurrent approvals cannot
  // both see a stale "sufficient credits" snapshot and double-spend.
  await ensureChildCanRedeem(r.childId);

  const updated = await prisma.$transaction(
    async (tx) => {
      // Atomic guard against double-approval: updateMany filtered on PENDING.
      // If zero rows changed, another parent already approved/rejected.
      const guard = await tx.redemption.updateMany({
        where: { id, status: "PENDING" },
        data: { status: "APPROVED", reviewedAt: new Date(), reviewedById: parentUserId },
      });
      if (guard.count === 0) {
        throw HttpError.conflict("Already reviewed");
      }
      // Balance check inside TX so SERIALIZABLE isolation can detect concurrent
      // overdraft. postLedger will also re-check when amount<0, but doing it
      // explicitly here surfaces a clearer error before the ledger insert.
      const sum = await tx.ledgerEntry.aggregate({
        _sum: { amount: true },
        where: { childId: r.childId },
      });
      const balance = sum._sum.amount ?? 0;
      if (balance < r.creditCost) {
        throw HttpError.unprocessable(
          `Not enough credits (have ${balance}, need ${r.creditCost})`,
          "INSUFFICIENT_CREDITS",
        );
      }
      await postLedger({
        tx,
        familyId,
        childId: r.childId,
        amount: -r.creditCost,
        kind: "REDEMPTION",
        reason: `Redeemed: ${r.reward.name}${r.quantity > 1 ? ` ×${r.quantity}` : ""}`,
        sourceType: "REDEMPTION",
        sourceId: id,
        createdById: parentUserId,
      });
      return tx.redemption.findUniqueOrThrow({
        where: { id },
        include: { reward: true, child: { select: { id: true, name: true, avatarColor: true } } },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
  await createNotification({
    familyId,
    userId: r.childId,
    kind: "REDEMPTION_APPROVED",
    title: `Reward approved: ${r.reward.name}${r.quantity > 1 ? ` ×${r.quantity}` : ""}`,
    payload: { redemptionId: id },
  });
  return updated;
}

export async function rejectRedemption(familyId: string, id: string, parentUserId: string, reason?: string) {
  const r = await prisma.redemption.findFirst({
    where: { id, reward: { familyId } },
    include: { reward: true },
  });
  if (!r) throw HttpError.notFound("Redemption not found");
  if (r.status !== "PENDING") throw HttpError.conflict("Already reviewed");
  const updated = await prisma.redemption.update({
    where: { id },
    data: {
      status: "REJECTED",
      reviewedAt: new Date(),
      reviewedById: parentUserId,
      notes: reason ? `${r.notes ?? ""}\n[Rejected] ${reason}`.trim() : r.notes,
    },
    include: { reward: true, child: { select: { id: true, name: true, avatarColor: true } } },
  });
  await createNotification({
    familyId,
    userId: r.childId,
    kind: "REDEMPTION_REJECTED",
    title: `Reward request declined: ${r.reward.name}`,
    body: reason || undefined,
    payload: { redemptionId: id },
  });
  return updated;
}

export function serializeRedemption(r: any) {
  return {
    id: r.id,
    rewardId: r.rewardId,
    childId: r.childId,
    status: r.status,
    creditCost: r.creditCost,
    quantity: r.quantity,
    notes: r.notes,
    requestedAt: r.requestedAt.toISOString(),
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    reviewedById: r.reviewedById ?? null,
    reward: r.reward
      ? {
          id: r.reward.id,
          familyId: r.reward.familyId,
          name: r.reward.name,
          description: r.reward.description,
          creditCost: r.reward.creditCost,
          type: r.reward.type,
          requiresApproval: r.reward.requiresApproval,
          isActive: r.reward.isActive,
          weeklyLimit: r.reward.weeklyLimit,
          dailyLimit: r.reward.dailyLimit,
          metadata: r.reward.metadata ?? {},
          eligibleChildIds: r.reward.eligibleChildIds ?? [],
        }
      : undefined,
    child: r.child ?? undefined,
  };
}
