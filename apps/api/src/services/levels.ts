import { prisma } from "../db.js";
import type { Prisma } from "@prisma/client";
import type { LevelDTO } from "@chorechampz/shared";
import { postLedger } from "./ledger.js";
import { createNotification } from "./notifications.js";

// Quadratic curve. Cumulative XP required to *reach* level L = 25 * L * (L - 1).
// L1=0, L2=50, L3=150, L4=300, L5=500, L10=2250, L20=9500.
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return 25 * level * (level - 1);
}

export function levelForXp(xp: number): number {
  if (xp < 50) return 1;
  // Invert quadratic: L = floor((1 + sqrt(1 + xp/6.25)) / 2). Use search for safety.
  let lo = 1;
  let hi = 1;
  while (xpForLevel(hi + 1) <= xp) {
    hi = hi === 1 ? 8 : hi * 2;
    if (hi > 1_000_000) break;
  }
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (xpForLevel(mid) <= xp) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function computeLevel(xp: number): LevelDTO {
  const level = levelForXp(xp);
  const floor = xpForLevel(level);
  const ceil = xpForLevel(level + 1);
  return {
    level,
    xp,
    xpInLevel: xp - floor,
    xpToNext: ceil - floor,
  };
}

// XP = lifetime positive ledger sum, excluding LEVEL_UP itself (prevents recursion).
async function getXp(familyId: string, childId: string, tx?: Prisma.TransactionClient): Promise<number> {
  const client = tx ?? prisma;
  const r = await client.ledgerEntry.aggregate({
    _sum: { amount: true },
    where: { familyId, childId, amount: { gt: 0 }, kind: { not: "LEVEL_UP" } },
  });
  return r._sum.amount ?? 0;
}

async function acknowledgedLevel(
  familyId: string,
  childId: string,
  tx?: Prisma.TransactionClient,
): Promise<number> {
  const client = tx ?? prisma;
  const count = await client.ledgerEntry.count({
    where: { familyId, childId, kind: "LEVEL_UP" },
  });
  return 1 + count;
}

export async function getChildLevel(familyId: string, childId: string): Promise<LevelDTO> {
  const xp = await getXp(familyId, childId);
  return computeLevel(xp);
}

export const LEVEL_UP_BONUS = 5;

/**
 * Compare computed level vs acknowledged (= 1 + count of LEVEL_UP entries).
 * Posts a LEVEL_UP entry per missing level. Idempotent across crashes:
 * a redo will find acknowledged level caught up and post nothing.
 */
export async function evaluateLevelUp(opts: {
  familyId: string;
  childId: string;
  createdById?: string | null;
  tx?: Prisma.TransactionClient;
}): Promise<{ leveledUp: boolean; newLevel: number; jumps: number }> {
  const xp = await getXp(opts.familyId, opts.childId, opts.tx);
  const computed = levelForXp(xp);
  let ack = await acknowledgedLevel(opts.familyId, opts.childId, opts.tx);
  if (ack >= computed) return { leveledUp: false, newLevel: ack, jumps: 0 };

  let jumps = 0;
  while (ack < computed) {
    const nextLevel = ack + 1;
    await postLedger({
      tx: opts.tx,
      familyId: opts.familyId,
      childId: opts.childId,
      amount: LEVEL_UP_BONUS,
      kind: "LEVEL_UP",
      reason: `Level up to L${nextLevel}`,
      sourceType: "level",
      sourceId: String(nextLevel),
      createdById: opts.createdById ?? null,
    });
    await createNotification({
      tx: opts.tx,
      familyId: opts.familyId,
      userId: opts.childId,
      kind: "LEVEL_UP",
      title: `Level up! You reached Lvl ${nextLevel}`,
      body: `+${LEVEL_UP_BONUS} 🪙 bonus credits`,
      payload: { level: nextLevel },
    });
    ack = nextLevel;
    jumps++;
  }
  return { leveledUp: true, newLevel: ack, jumps };
}
