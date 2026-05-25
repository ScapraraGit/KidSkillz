import { prisma } from "../db.js";
import { hashPassword } from "../lib/auth.js";
import { HttpError } from "../errors.js";

export async function listFamiliesWithOwner() {
  const families = await prisma.family.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      // PARENT/CAREGIVER are linked via FamilyMembership now. `users` on
      // Family only returns CHILD rows so we get child-count separately.
      memberships: {
        where: { role: "PARENT", status: "ACTIVE" },
        orderBy: { createdAt: "asc" },
        include: {
          user: { select: { id: true, name: true, email: true, isActive: true } },
        },
      },
      _count: {
        select: { users: true, tasks: true, rewards: true, memberships: true },
      },
    },
  });
  return families.map((f) => {
    const parents = f.memberships.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      isActive: m.user.isActive,
    }));
    const owner = f.memberships.find((m) => m.isBillingOwner) ?? f.memberships[0] ?? null;
    return {
      id: f.id,
      name: f.name,
      createdAt: f.createdAt.toISOString(),
      owner: owner
        ? {
            id: owner.user.id,
            name: owner.user.name,
            email: owner.user.email,
            isActive: owner.user.isActive,
          }
        : null,
      parents,
      // `users` count is now child-only; total people = children + adult memberships.
      counts: {
        users: f._count.users + f._count.memberships,
        tasks: f._count.tasks,
        rewards: f._count.rewards,
      },
    };
  });
}

export async function getFamilyDetail(familyId: string) {
  const family = await prisma.family.findUnique({
    where: { id: familyId },
    include: {
      // CHILD users — adults attach via memberships.
      users: {
        where: { role: "CHILD" },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          role: true,
          name: true,
          email: true,
          isActive: true,
          isAdmin: true,
          createdAt: true,
        },
      },
      memberships: {
        where: { status: "ACTIVE" },
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              isActive: true,
              isAdmin: true,
            },
          },
        },
      },
    },
  });
  if (!family) throw HttpError.notFound("Family not found");
  const adultMembers = family.memberships.map((m) => ({
    id: m.user.id,
    role: m.role,
    name: m.user.name,
    email: m.user.email,
    isActive: m.user.isActive,
    isAdmin: m.user.isAdmin,
  }));
  const childMembers = family.users.map((u) => ({
    id: u.id,
    role: u.role,
    name: u.name,
    email: u.email,
    isActive: u.isActive,
    isAdmin: u.isAdmin,
  }));
  return {
    id: family.id,
    name: family.name,
    isBeta: family.isBeta,
    createdAt: family.createdAt.toISOString(),
    members: [...adultMembers, ...childMembers],
  };
}

export async function renameFamily(familyId: string, name: string) {
  const family = await prisma.family.findUnique({ where: { id: familyId } });
  if (!family) throw HttpError.notFound("Family not found");
  return prisma.family.update({ where: { id: familyId }, data: { name } });
}

export async function setFamilyBeta(familyId: string, isBeta: boolean) {
  const family = await prisma.family.findUnique({ where: { id: familyId } });
  if (!family) throw HttpError.notFound("Family not found");
  return prisma.family.update({ where: { id: familyId }, data: { isBeta } });
}

export async function adminResetPassword(userId: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw HttpError.notFound("User not found");
  if (user.role === "CHILD") throw HttpError.badRequest("Children use PIN, not password");
  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  // Invalidate any outstanding reset tokens so old links can't be used.
  await prisma.passwordReset.updateMany({
    where: { userId, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  return { ok: true, familyId: user.familyId };
}
