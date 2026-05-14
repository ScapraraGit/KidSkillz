import { prisma } from "../db.js";
import { Prisma } from "@prisma/client";
import { hashPassword } from "../lib/auth.js";
import { HttpError } from "../errors.js";
import { getBalance } from "./ledger.js";
import type { AvatarConfig, ChildDTO } from "@chorechamps/shared";
import { ChildViewMode } from "@chorechamps/shared";

async function loadSavingsGoals(childId: string): Promise<string[]> {
  const rows = await prisma.childSavingsGoal.findMany({
    where: { childId },
    orderBy: { position: "asc" },
    select: { rewardId: true },
  });
  return rows.map((r) => r.rewardId);
}

async function toChildDTO(k: any): Promise<ChildDTO> {
  const goals = await loadSavingsGoals(k.id);
  return {
    id: k.id,
    familyId: k.familyId,
    name: k.name,
    avatarColor: k.avatarColor,
    avatarConfig: (k.avatarConfig as AvatarConfig | null) ?? null,
    redemptionPaused: k.childProfile?.redemptionPaused ?? false,
    earningPaused: k.childProfile?.earningPaused ?? false,
    proofRequirementOverride: k.childProfile?.proofRequirementOverride ?? null,
    soundEnabled: k.childProfile?.soundEnabled ?? false,
    viewMode: (k.childProfile?.viewMode ?? ChildViewMode.YOUNGER) as ChildDTO["viewMode"],
    savingsGoalRewardId: goals[0] ?? null,
    savingsGoalRewardIds: goals,
    streakGraceCount: k.childProfile?.streakGraceCount ?? 0,
    penaltiesExempt: k.childProfile?.penaltiesExempt ?? false,
    balance: await getBalance(k.id),
  };
}

export async function listChildren(familyId: string): Promise<ChildDTO[]> {
  const kids = await prisma.user.findMany({
    where: { familyId, role: "CHILD" },
    include: { childProfile: true },
    orderBy: { name: "asc" },
  });
  return Promise.all(kids.map(toChildDTO));
}

export async function getChild(familyId: string, childId: string): Promise<ChildDTO> {
  const k = await prisma.user.findFirst({
    where: { id: childId, familyId, role: "CHILD" },
    include: { childProfile: true },
  });
  if (!k) throw HttpError.notFound("Child not found");
  return toChildDTO(k);
}

export interface CreateChildInput {
  name: string;
  pin?: string | null;
  avatarColor?: string;
  avatarConfig?: AvatarConfig | null;
}

export async function createChild(familyId: string, input: CreateChildInput) {
  const child = await prisma.user.create({
    data: {
      familyId,
      role: "CHILD",
      name: input.name,
      avatarColor: input.avatarColor ?? "#22c55e",
      avatarConfig: (input.avatarConfig ?? undefined) as object | undefined,
      pin: input.pin ?? null,
      childProfile: { create: { familyId } },
    },
    include: { childProfile: true },
  });
  return getChild(familyId, child.id);
}

export interface UpdateChildInput {
  name?: string;
  avatarColor?: string;
  avatarConfig?: AvatarConfig | null;
  pin?: string | null;
  redemptionPaused?: boolean;
  earningPaused?: boolean;
  proofRequirementOverride?: ChildDTO["proofRequirementOverride"];
  soundEnabled?: boolean;
  viewMode?: ChildDTO["viewMode"];
  /** @deprecated supply savingsGoalRewardIds instead. Kept for back-compat. */
  savingsGoalRewardId?: string | null;
  /** Up to 3 reward IDs in display order. Pass [] to clear. */
  savingsGoalRewardIds?: string[];
  streakGraceCount?: number;
  penaltiesExempt?: boolean;
}

export async function updateChild(familyId: string, childId: string, input: UpdateChildInput) {
  await getChild(familyId, childId); // 404 guard

  // Resolve next savings-goal list: explicit array wins; otherwise legacy single-ID shim.
  let nextGoals: string[] | undefined;
  if (input.savingsGoalRewardIds !== undefined) {
    nextGoals = input.savingsGoalRewardIds.slice(0, 3);
  } else if (input.savingsGoalRewardId !== undefined) {
    nextGoals = input.savingsGoalRewardId ? [input.savingsGoalRewardId] : [];
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: childId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.avatarColor !== undefined && { avatarColor: input.avatarColor }),
        ...(input.avatarConfig !== undefined && {
          avatarConfig: input.avatarConfig === null ? Prisma.JsonNull : (input.avatarConfig as object),
        }),
        ...(input.pin !== undefined && { pin: input.pin }),
        childProfile: {
          update: {
            ...(input.redemptionPaused !== undefined && { redemptionPaused: input.redemptionPaused }),
            ...(input.earningPaused !== undefined && { earningPaused: input.earningPaused }),
            ...(input.proofRequirementOverride !== undefined && {
              proofRequirementOverride: input.proofRequirementOverride,
            }),
            ...(input.soundEnabled !== undefined && { soundEnabled: input.soundEnabled }),
            ...(input.viewMode !== undefined && { viewMode: input.viewMode }),
            ...(input.streakGraceCount !== undefined && {
              streakGraceCount: Math.max(0, input.streakGraceCount),
            }),
            ...(input.penaltiesExempt !== undefined && { penaltiesExempt: input.penaltiesExempt }),
            // Keep legacy column in sync with position 1 for any callers still reading it.
            ...(nextGoals !== undefined && { savingsGoalRewardId: nextGoals[0] ?? null }),
          },
        },
      },
    });

    if (nextGoals !== undefined) {
      const valid = await tx.reward.findMany({
        where: { familyId, id: { in: nextGoals } },
        select: { id: true },
      });
      const validIds = new Set(valid.map((r) => r.id));
      const filtered = nextGoals.filter((id) => validIds.has(id));
      await tx.childSavingsGoal.deleteMany({ where: { childId } });
      if (filtered.length > 0) {
        await tx.childSavingsGoal.createMany({
          data: filtered.map((rewardId, i) => ({
            familyId,
            childId,
            rewardId,
            position: i + 1,
          })),
        });
      }
    }
  });

  return getChild(familyId, childId);
}

export async function setChildPasswordPin(familyId: string, childId: string, pin: string) {
  const child = await prisma.user.findFirst({ where: { id: childId, familyId, role: "CHILD" } });
  if (!child) throw HttpError.notFound("Child not found");
  if (!/^\d{4,8}$/.test(pin)) throw HttpError.badRequest("PIN must be 4-8 digits");
  await prisma.user.update({ where: { id: childId }, data: { pin } });
}

export async function ensureChildInFamily(familyId: string, childId: string) {
  const child = await prisma.user.findFirst({ where: { id: childId, familyId, role: "CHILD" } });
  if (!child) throw HttpError.notFound("Child not found");
  return child;
}

export async function ensureChildCanEarn(childId: string) {
  const profile = await prisma.childProfile.findUnique({ where: { userId: childId } });
  if (profile?.earningPaused) {
    throw HttpError.forbidden("Earning is currently paused for this child");
  }
}

export async function ensureChildCanRedeem(childId: string) {
  const profile = await prisma.childProfile.findUnique({ where: { userId: childId } });
  if (profile?.redemptionPaused) {
    throw HttpError.forbidden("Redemption is paused for this child");
  }
}

// kept as a compatibility helper
export { hashPassword };
