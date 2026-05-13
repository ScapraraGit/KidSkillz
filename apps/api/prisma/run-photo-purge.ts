/**
 * Deletes proof photos beyond each family's configured retention window.
 * Schedule daily. Idempotent.
 * Run: pnpm -C apps/api jobs:photo-purge
 */
import { prisma } from "../src/db.js";
import { purgeExpiredPhotos } from "../src/services/photo-retention.js";

async function main() {
  const r = await purgeExpiredPhotos();
  console.log(`[photo-purge] processed ${r.familiesProcessed} families, deleted ${r.deleted} photos`);
}

main()
  .catch((err) => {
    console.error("[photo-purge] FAILED", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
