import { prisma } from "../db.js";
import { storage } from "../lib/storage.js";
import { getFamilySettings } from "./family.js";

/**
 * For each family, purges proof photos older than the family-configured retention window.
 * Sets `photoKey` to null on both TaskCompletion and InitiativeRequest after the
 * underlying file is deleted. Idempotent; safe to re-run.
 */
export async function purgeExpiredPhotos(
  now = new Date(),
): Promise<{ deleted: number; familiesProcessed: number }> {
  const families = await prisma.family.findMany({ select: { id: true } });
  let deleted = 0;
  let familiesProcessed = 0;

  for (const f of families) {
    const settings = await getFamilySettings(f.id);
    const days = settings.photoRetentionDays ?? 90;
    familiesProcessed++;
    if (!days || days <= 0) continue; // 0 = keep forever
    const cutoff = new Date(now.getTime() - days * 24 * 3600_000);

    const completions = await prisma.taskCompletion.findMany({
      where: {
        photoKey: { not: null },
        submittedAt: { lt: cutoff },
        task: { familyId: f.id },
      },
      select: { id: true, photoKey: true },
    });
    for (const c of completions) {
      if (c.photoKey) {
        try {
          await storage.delete(c.photoKey);
        } catch (e) {
          console.error("[purge] storage.delete", c.photoKey, e);
        }
        await prisma.taskCompletion.update({ where: { id: c.id }, data: { photoKey: null } });
        deleted++;
      }
    }

    const initiatives = await prisma.initiativeRequest.findMany({
      where: {
        familyId: f.id,
        photoKey: { not: null },
        submittedAt: { lt: cutoff },
      },
      select: { id: true, photoKey: true },
    });
    for (const ir of initiatives) {
      if (ir.photoKey) {
        try {
          await storage.delete(ir.photoKey);
        } catch (e) {
          console.error("[purge] storage.delete", ir.photoKey, e);
        }
        await prisma.initiativeRequest.update({ where: { id: ir.id }, data: { photoKey: null } });
        deleted++;
      }
    }
  }

  return { deleted, familiesProcessed };
}
