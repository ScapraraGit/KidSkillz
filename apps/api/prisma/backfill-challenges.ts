/**
 * Backfill: seed default challenge library for any family that has zero challenges.
 * Safe to re-run. Run with: pnpm -C apps/api backfill:challenges
 */
import { prisma } from "../src/db.js";
import { seedDefaultChallenges } from "../src/services/challenges.js";

async function main() {
  const families = await prisma.family.findMany({
    select: { id: true, name: true, _count: { select: { challenges: true } } },
  });

  const targets = families.filter((f) => f._count.challenges === 0);
  console.log(
    `[backfill-challenges] ${families.length} families total, ${targets.length} missing challenges`,
  );

  for (const f of targets) {
    await seedDefaultChallenges(f.id);
    console.log(`  + seeded family ${f.id} (${f.name})`);
  }
  console.log("[backfill-challenges] done");
}

main()
  .catch((err) => {
    console.error("[backfill-challenges] FAILED", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
