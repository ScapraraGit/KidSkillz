import { prisma } from "../db.js";
import { hashPassword } from "../lib/auth.js";
import { HttpError } from "../errors.js";
import { getBalance } from "./ledger.js";
import type { ChildDTO } from "@chorechamps/shared";

export async function listChildren(familyId: string): Promise<ChildDTO[]> {
  const kids = await prisma.user.findMany({
    where: { familyId, role: "CHILD" },
    include: { childProfile: true },
    orderBy: { name: "asc" },
  });

  return Promise.all(
    kids.map(async (k) => ({
      id: k.id,
      familyId: k.familyId,
      name: k.name,
      avatarColor: k.avatarColor,
      redemptionPaused: k.childProfile?.redemptionPaused ?? false,
      earningPaused: k.childProfile?.earningPaused ?? false,
      proofRequirementOverride: k.childProfile?.proofRequirementOverride ?? null,
      balance: await getBalance(k.id),
    })),
  );
}

export async function getChild(familyId: string, childId: string): Promise<ChildDTO> {
  const k = await prisma.user.findFirst({
    where: { id: childId, familyId, role: "CHILD" },
    include: { childProfile: true },
  });
  if (!k) throw HttpError.notFound("Child not found");
  return {
    id: k.id,
    familyId: k.familyId,
    name: k.name,
    avatarColor: k.avatarColor,
    redemptionPaused: k.childProfile?.redemptionPaused ?? false,
    earningPaused: k.childProfile?.earningPaused ?? false,
    proofRequirementOverride: k.childProfile?.proofRequirementOverride ?? null,
    balance: await getBalance(k.id),
  };
}

export interface CreateChildInput {
  name: string;
  pin?: string | null;
  avatarColor?: string;
}

export async function createChild(familyId: string, input: CreateChildInput) {
  const child = await prisma.user.create({
    data: {
      familyId,
      role: "CHILD",
      name: input.name,
      avatarColor: input.avatarColor ?? "#22c55e",
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
  pin?: string | null;
  redemptionPaused?: boolean;
  earningPaused?: boolean;
  proofRequirementOverride?: ChildDTO["proofRequirementOverride"];
}

export async function updateChild(familyId: string, childId: string, input: UpdateChildInput) {
  await getChild(familyId, childId); // 404 guard
  await prisma.user.update({
    where: { id: childId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.avatarColor !== undefined && { avatarColor: input.avatarColor }),
      ...(input.pin !== undefined && { pin: input.pin }),
      childProfile: {
        update: {
          ...(input.redemptionPaused !== undefined && { redemptionPaused: input.redemptionPaused }),
          ...(input.earningPaused !== undefined && { earningPaused: input.earningPaused }),
          ...(input.proofRequirementOverride !== undefined && {
            proofRequirementOverride: input.proofRequirementOverride,
          }),
        },
      },
    },
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
