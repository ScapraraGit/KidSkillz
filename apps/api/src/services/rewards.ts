import { prisma } from "../db.js";
import { HttpError } from "../errors.js";
import type { RewardMetadata, RewardDTO } from "@chorechamps/shared";
import type { RewardType } from "@prisma/client";

export interface UpsertRewardInput {
  name: string;
  description?: string;
  creditCost: number;
  type: RewardType;
  requiresApproval?: boolean;
  isActive?: boolean;
  weeklyLimit?: number | null;
  dailyLimit?: number | null;
  metadata?: RewardMetadata;
  eligibleChildIds?: string[];
}

export async function listRewards(familyId: string, opts?: { activeOnly?: boolean }) {
  return prisma.reward.findMany({
    where: { familyId, ...(opts?.activeOnly && { isActive: true }) },
    orderBy: [{ isActive: "desc" }, { creditCost: "asc" }],
  });
}

export async function getReward(familyId: string, id: string) {
  const r = await prisma.reward.findFirst({ where: { id, familyId } });
  if (!r) throw HttpError.notFound("Reward not found");
  return r;
}

export async function createReward(familyId: string, input: UpsertRewardInput) {
  if (input.creditCost < 0) throw HttpError.badRequest("Credit cost must be ≥ 0");
  return prisma.reward.create({
    data: {
      familyId,
      name: input.name,
      description: input.description,
      creditCost: input.creditCost,
      type: input.type,
      requiresApproval: input.requiresApproval ?? true,
      isActive: input.isActive ?? true,
      weeklyLimit: input.weeklyLimit ?? null,
      dailyLimit: input.dailyLimit ?? null,
      metadata: (input.metadata ?? {}) as object,
      eligibleChildIds: input.eligibleChildIds ?? [],
    },
  });
}

export async function updateReward(familyId: string, id: string, input: Partial<UpsertRewardInput>) {
  await getReward(familyId, id);
  return prisma.reward.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.creditCost !== undefined && { creditCost: input.creditCost }),
      ...(input.type !== undefined && { type: input.type }),
      ...(input.requiresApproval !== undefined && { requiresApproval: input.requiresApproval }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      ...(input.weeklyLimit !== undefined && { weeklyLimit: input.weeklyLimit }),
      ...(input.dailyLimit !== undefined && { dailyLimit: input.dailyLimit }),
      ...(input.metadata !== undefined && { metadata: input.metadata as object }),
      ...(input.eligibleChildIds !== undefined && { eligibleChildIds: input.eligibleChildIds }),
    },
  });
}

export async function deleteReward(familyId: string, id: string) {
  await getReward(familyId, id);
  await prisma.reward.delete({ where: { id } });
}

export function serializeReward(r: import("@prisma/client").Reward): RewardDTO {
  return {
    id: r.id,
    familyId: r.familyId,
    name: r.name,
    description: r.description,
    creditCost: r.creditCost,
    type: r.type,
    requiresApproval: r.requiresApproval,
    isActive: r.isActive,
    weeklyLimit: r.weeklyLimit ?? null,
    dailyLimit: r.dailyLimit ?? null,
    metadata: (r.metadata as RewardMetadata) ?? {},
    eligibleChildIds: r.eligibleChildIds ?? [],
  };
}
