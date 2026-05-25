import { prisma } from "../db.js";
import { signToken } from "./auth.js";
import { HttpError } from "../errors.js";
import type { Role, User, FamilyMembership } from "@prisma/client";

export interface ActiveFamilyChoice {
  familyId: string;
  membershipId?: string;
}

export interface AuthFamilyEntry {
  id: string;
  name: string;
  membershipId: string | null;
  role: Role;
  isBillingOwner: boolean;
}

// CHILD users have one family (User.familyId). PARENT/CAREGIVER pick from
// active memberships. Returns the list the caller should present to the user.
export async function listAuthFamilies(user: {
  id: string;
  role: Role;
  familyId: string | null;
}): Promise<AuthFamilyEntry[]> {
  if (user.role === "CHILD") {
    if (!user.familyId) return [];
    const family = await prisma.family.findUnique({
      where: { id: user.familyId },
      select: { id: true, name: true },
    });
    return family ? [{ ...family, membershipId: null, role: "CHILD" as Role, isBillingOwner: false }] : [];
  }
  const memberships = await prisma.familyMembership.findMany({
    where: { userId: user.id, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    include: { family: { select: { id: true, name: true } } },
  });
  return memberships.map((m) => ({
    id: m.family.id,
    name: m.family.name,
    membershipId: m.id,
    role: m.role as Role,
    isBillingOwner: m.isBillingOwner,
  }));
}

// Resolves the active family + membership the caller should use for a fresh
// access token. CHILD short-circuits to User.familyId. Adults must have an
// active membership for the targetFamilyId (or for their single membership).
export async function resolveActiveFamily(
  user: { id: string; role: Role; familyId: string | null },
  targetFamilyId?: string,
): Promise<{ familyId: string; membership: FamilyMembership | null }> {
  if (user.role === "CHILD") {
    if (!user.familyId) throw HttpError.forbidden("Child has no family");
    return { familyId: user.familyId, membership: null };
  }
  const where = targetFamilyId
    ? { userId: user.id, familyId: targetFamilyId, status: "ACTIVE" as const }
    : { userId: user.id, status: "ACTIVE" as const };
  const m = await prisma.familyMembership.findFirst({
    where,
    orderBy: { createdAt: "asc" },
  });
  if (!m) throw HttpError.forbidden("No active family membership");
  return { familyId: m.familyId, membership: m };
}

export function mintAccessToken(opts: {
  user: Pick<User, "id" | "role" | "isAdmin" | "tokenVersion">;
  familyId: string;
  membershipId?: string | null;
}): string {
  return signToken({
    sub: opts.user.id,
    fid: opts.familyId,
    role: opts.user.role,
    ...(opts.membershipId ? { mid: opts.membershipId } : {}),
    adm: opts.user.isAdmin,
    tv: opts.user.tokenVersion,
  });
}
