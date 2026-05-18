/**
 * Posts negative-credit ledger entries for yesterday's missed RECURRING tasks
 * (ASSIGNED-mode only). Honors family.penaltiesEnabled + child.penaltiesExempt.
 * Schedule daily after midnight in your busiest family TZ. Idempotent.
 * Run: pnpm -C apps/api jobs:penalty-sweep
 */
import { prisma } from "../src/db.js";
import { assertJobDatabaseHost } from "../src/lib/assert-job-db.js";
import { sweepMissedTaskPenalties } from "../src/services/penalties.js";

async function main() {
  assertJobDatabaseHost();
  const r = await sweepMissedTaskPenalties();
  console.log(`[penalty-sweep] processed ${r.familiesProcessed} families, posted ${r.posted} penalties`);
}

main()
  .catch((err) => {
    console.error("[penalty-sweep] FAILED", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
