import { PrismaClient } from "@prisma/client";

// Backfill trialEndsAt for families created before billing shipped. Idempotent:
// only touches rows where trialEndsAt IS NULL. Skips families already on a paid
// subscription (ACTIVE/PAST_DUE/etc) or with an admin override.
//
// Usage:  pnpm tsx prisma/backfill-trials.ts [--days N]

const prisma = new PrismaClient();

async function main() {
  const arg = process.argv.find((a) => a.startsWith("--days="));
  const days = arg ? Number(arg.split("=")[1]) : 30;
  if (!Number.isFinite(days) || days < 1 || days > 365) {
    throw new Error(`--days must be 1..365 (got ${days})`);
  }
  const trialEndsAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const result = await prisma.family.updateMany({
    where: {
      trialEndsAt: null,
      subscriptionStatus: "TRIALING",
      billingOverride: "NONE",
    },
    data: { trialEndsAt },
  });

  console.log(`[backfill-trials] updated ${result.count} families. trialEndsAt=${trialEndsAt.toISOString()}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
