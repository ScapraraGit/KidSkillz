import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";
import type { LedgerKind, Prisma } from "@prisma/client";

const ALL_KINDS: LedgerKind[] = [
  "TASK",
  "INITIATIVE",
  "INITIATIVE_BONUS",
  "REDEMPTION",
  "ADJUSTMENT_POSITIVE",
  "ADJUSTMENT_NEGATIVE",
  "LEVEL_UP",
  "CHALLENGE_BONUS",
];

export const ledgerRouter = Router();

ledgerRouter.use(requireAuth);

ledgerRouter.get("/", async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const childId = req.auth!.role === "CHILD" ? req.auth!.sub : (req.query.childId as string | undefined);
  if (req.auth!.role === "CHILD" && req.query.childId && req.query.childId !== req.auth!.sub) {
    throw HttpError.forbidden();
  }

  // kind = comma-separated subset; unknown values dropped silently.
  const kindRaw = (req.query.kind as string | undefined) ?? "";
  const kinds = kindRaw
    .split(",")
    .map((k) => k.trim().toUpperCase())
    .filter((k): k is LedgerKind => (ALL_KINDS as string[]).includes(k));

  const fromRaw = req.query.from as string | undefined;
  const toRaw = req.query.to as string | undefined;
  const dateFilter: Prisma.DateTimeFilter = {};
  if (fromRaw && /^\d{4}-\d{2}-\d{2}$/.test(fromRaw)) {
    dateFilter.gte = new Date(`${fromRaw}T00:00:00.000Z`);
  }
  if (toRaw && /^\d{4}-\d{2}-\d{2}$/.test(toRaw)) {
    dateFilter.lt = new Date(`${toRaw}T23:59:59.999Z`);
  }

  const where: Prisma.LedgerEntryWhereInput = {
    familyId: req.auth!.fid,
    ...(childId && { childId }),
    ...(kinds.length > 0 && { kind: { in: kinds } }),
    ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter }),
  };
  const entries = await prisma.ledgerEntry.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  // Hydrate parentNote for TASK entries (kudos surfaces in kid activity feed).
  const taskSourceIds = entries
    .filter((e) => e.kind === "TASK" && e.sourceType === "TASK_COMPLETION" && e.sourceId)
    .map((e) => e.sourceId!) as string[];
  const noteByCompletion = new Map<string, string>();
  if (taskSourceIds.length > 0) {
    const completions = await prisma.taskCompletion.findMany({
      where: { id: { in: taskSourceIds }, task: { familyId: req.auth!.fid } },
      select: { id: true, parentNote: true },
    });
    for (const c of completions) if (c.parentNote) noteByCompletion.set(c.id, c.parentNote);
  }

  res.json({
    entries: entries.map((e) => ({
      id: e.id,
      childId: e.childId,
      amount: e.amount,
      kind: e.kind,
      reason: e.reason,
      sourceType: e.sourceType,
      sourceId: e.sourceId,
      createdById: e.createdById,
      createdAt: e.createdAt.toISOString(),
      parentNote: e.sourceId ? (noteByCompletion.get(e.sourceId) ?? null) : null,
    })),
  });
});
