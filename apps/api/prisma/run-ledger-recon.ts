/**
 * Nightly ledger reconciliation. For every child:
 *   - assert SUM(LedgerEntry.amount) >= 0, unless family.allowNegativeBalance is on.
 * Drift is reported via Sentry captureMessage so it pages ops without
 * blocking the rest of the nightly batch.
 *
 * Run: pnpm -C apps/api jobs:ledger-recon
 */
import { prisma } from "../src/db.js";
import { readSettings } from "../src/services/family.js";
import { initSentry, Sentry } from "../src/lib/sentry.js";

interface Drift {
  familyId: string;
  childId: string;
  childName: string;
  balance: number;
}

async function main() {
  initSentry();

  const families = await prisma.family.findMany({ select: { id: true, settings: true } });
  const drifts: Drift[] = [];
  let childrenChecked = 0;

  for (const fam of families) {
    const settings = readSettings(fam.settings);
    if (settings.allowNegativeBalance) continue;

    const children = await prisma.user.findMany({
      where: { familyId: fam.id, role: "CHILD" },
      select: { id: true, name: true },
    });

    for (const child of children) {
      childrenChecked++;
      const r = await prisma.ledgerEntry.aggregate({
        _sum: { amount: true },
        where: { childId: child.id },
      });
      const balance = r._sum.amount ?? 0;
      if (balance < 0) {
        drifts.push({ familyId: fam.id, childId: child.id, childName: child.name, balance });
      }
    }
  }

  console.log(
    `[ledger-recon] checked ${childrenChecked} children across ${families.length} families; ${drifts.length} drift(s)`,
  );

  if (drifts.length > 0) {
    for (const d of drifts) {
      console.error(
        `[ledger-recon] DRIFT family=${d.familyId} child=${d.childId} (${d.childName}) balance=${d.balance}`,
      );
    }
    Sentry.captureMessage(
      `Ledger reconciliation drift: ${drifts.length} child balance(s) below zero without allowNegativeBalance`,
      {
        level: "error",
        extra: { drifts },
      },
    );
    // Flush events synchronously before process exit; otherwise the alert can be lost.
    await Sentry.flush(5_000).catch(() => undefined);
    process.exitCode = 1;
  }
}

main()
  .catch(async (err) => {
    console.error("[ledger-recon] FAILED", err);
    Sentry.captureException(err);
    await Sentry.flush(5_000).catch(() => undefined);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
