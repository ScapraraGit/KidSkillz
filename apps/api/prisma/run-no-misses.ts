/**
 * Resolves NO_MISSES challenges for the previously-completed day/week per family TZ.
 * Idempotent. Schedule via cron (e.g. Railway cron) hourly — it only resolves
 * periods that have ended and are not yet completed in any family.
 * Run: pnpm -C apps/api jobs:no-misses
 */
import { prisma } from "../src/db.js";
import { assertJobDatabaseHost } from "../src/lib/assert-job-db.js";
import { resolveNoMisses } from "../src/services/challenges.js";

async function main() {
  assertJobDatabaseHost();
  const { resolved } = await resolveNoMisses();
  console.log(`[no-misses] resolved ${resolved} child-period rows`);
}

main()
  .catch((err) => {
    console.error("[no-misses] FAILED", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
