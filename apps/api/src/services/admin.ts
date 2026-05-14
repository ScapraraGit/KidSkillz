import { prisma } from "../db.js";
import { hashPassword } from "../lib/auth.js";
import { HttpError } from "../errors.js";

export async function listFamiliesWithOwner() {
  const families = await prisma.family.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      users: {
        where: { role: "PARENT" },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, email: true, isActive: true, createdAt: true },
      },
      _count: {
        select: { users: true, tasks: true, rewards: true },
      },
    },
  });
  return families.map((f) => ({
    id: f.id,
    name: f.name,
    createdAt: f.createdAt.toISOString(),
    owner: f.users[0]
      ? {
          id: f.users[0].id,
          name: f.users[0].name,
          email: f.users[0].email,
          isActive: f.users[0].isActive,
        }
      : null,
    parents: f.users.map((u) => ({ id: u.id, name: u.name, email: u.email, isActive: u.isActive })),
    counts: { users: f._count.users, tasks: f._count.tasks, rewards: f._count.rewards },
  }));
}

export async function getFamilyDetail(familyId: string) {
  const family = await prisma.family.findUnique({
    where: { id: familyId },
    include: {
      users: {
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
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
    },
  });
  if (!family) throw HttpError.notFound("Family not found");
  return {
    id: family.id,
    name: family.name,
    createdAt: family.createdAt.toISOString(),
    members: family.users.map((u) => ({
      id: u.id,
      role: u.role,
      name: u.name,
      email: u.email,
      isActive: u.isActive,
      isAdmin: u.isAdmin,
    })),
  };
}

export async function renameFamily(familyId: string, name: string) {
  const family = await prisma.family.findUnique({ where: { id: familyId } });
  if (!family) throw HttpError.notFound("Family not found");
  return prisma.family.update({ where: { id: familyId }, data: { name } });
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
