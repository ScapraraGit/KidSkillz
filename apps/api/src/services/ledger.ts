import { prisma } from "../db.js";
import type { LedgerKind, Prisma } from "@prisma/client";
import { HttpError } from "../errors.js";
import { getFamilySettings } from "./family.js";

export async function getBalance(childId: string): Promise<number> {
  const r = await prisma.ledgerEntry.aggregate({
    _sum: { amount: true },
    where: { childId },
  });
  return r._sum.amount ?? 0;
}

interface PostOpts {
  tx?: Prisma.TransactionClient;
  familyId: string;
  childId: string;
  amount: number;
  kind: LedgerKind;
  reason: string;
  sourceType?: string;
  sourceId?: string;
  createdById?: string | null;
}

export async function postLedger(opts: PostOpts) {
  const client = opts.tx ?? prisma;
  if (opts.amount === 0) throw HttpError.badRequest("Ledger amount cannot be zero");

  if (opts.amount < 0) {
    const settings = await getFamilySettings(opts.familyId);
    if (!settings.allowNegativeBalance) {
      const current = await client.ledgerEntry.aggregate({
        _sum: { amount: true },
        where: { childId: opts.childId },
      });
      const balance = current._sum.amount ?? 0;
      if (balance + opts.amount < 0) {
        throw HttpError.unprocessable(
          `Insufficient credits (balance ${balance}, requested ${Math.abs(opts.amount)})`,
          "INSUFFICIENT_CREDITS",
        );
      }
    }
  }

  return client.ledgerEntry.create({
    data: {
      familyId: opts.familyId,
      childId: opts.childId,
      amount: opts.amount,
      kind: opts.kind,
      reason: opts.reason,
      sourceType: opts.sourceType,
      sourceId: opts.sourceId,
      createdById: opts.createdById ?? null,
    },
  });
}
