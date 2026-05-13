import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";

export const ledgerRouter = Router();

ledgerRouter.use(requireAuth);

ledgerRouter.get("/", async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const childId = req.auth!.role === "CHILD" ? req.auth!.sub : (req.query.childId as string | undefined);
  if (req.auth!.role === "CHILD" && req.query.childId && req.query.childId !== req.auth!.sub) {
    throw HttpError.forbidden();
  }
  const where = {
    familyId: req.auth!.fid,
    ...(childId && { childId }),
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
      parentNote: e.sourceId ? noteByCompletion.get(e.sourceId) ?? null : null,
    })),
  });
});
