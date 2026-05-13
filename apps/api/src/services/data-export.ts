import { prisma } from "../db.js";

/**
 * Dumps every table scoped by familyId into a single JSON blob.
 * Excludes password hashes, PIN, token hashes, and other secrets.
 */
export async function exportFamily(familyId: string) {
  const family = await prisma.family.findUnique({ where: { id: familyId } });
  if (!family) throw new Error("Family not found");

  const [
    users,
    childProfiles,
    tasks,
    completions,
    initiatives,
    rewards,
    redemptions,
    ledger,
    invitations,
    challenges,
    challengeProgress,
    notifications,
  ] = await Promise.all([
    prisma.user.findMany({ where: { familyId } }),
    prisma.childProfile.findMany({ where: { familyId } }),
    prisma.task.findMany({ where: { familyId } }),
    prisma.taskCompletion.findMany({ where: { task: { familyId } } }),
    prisma.initiativeRequest.findMany({ where: { familyId } }),
    prisma.reward.findMany({ where: { familyId } }),
    prisma.redemption.findMany({ where: { reward: { familyId } } }),
    prisma.ledgerEntry.findMany({ where: { familyId } }),
    prisma.invitation.findMany({ where: { familyId } }),
    prisma.challenge.findMany({ where: { familyId } }),
    prisma.challengeProgress.findMany({ where: { familyId } }),
    prisma.notification.findMany({ where: { familyId } }),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    family,
    users: users.map(({ passwordHash, pin, ...rest }) => rest),
    childProfiles,
    tasks,
    completions,
    initiatives,
    rewards,
    redemptions,
    ledger,
    invitations: invitations.map(({ tokenHash, ...rest }) => rest),
    challenges,
    challengeProgress,
    notifications,
  };
}

/**
 * Hard-delete a family and every cascading row. Requires confirmation text match.
 * Returns count of users deleted alongside family.
 */
export async function deleteFamily(opts: {
  familyId: string;
  parentUserId: string;
  confirmText: string;
}): Promise<{ deletedUsers: number }> {
  const family = await prisma.family.findUnique({
    where: { id: opts.familyId },
    include: { _count: { select: { users: true } } },
  });
  if (!family) throw new Error("Family not found");
  if (opts.confirmText !== family.name) {
    throw new Error("Confirmation text did not match family name");
  }
  // Belt-and-suspenders: confirm the caller is a parent in this family.
  const actor = await prisma.user.findUnique({ where: { id: opts.parentUserId } });
  if (!actor || actor.familyId !== family.id || actor.role !== "PARENT") {
    throw new Error("Only a parent in this family can delete it");
  }

  // Cascade is configured on every foreign key; one delete clears the world.
  await prisma.family.delete({ where: { id: opts.familyId } });
  return { deletedUsers: family._count.users };
}
