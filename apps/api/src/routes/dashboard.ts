import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { prisma } from "../db.js";
import { listChildren, getChild } from "../services/children.js";
import {
  listCompletions,
  serializeCompletion,
  serializePendingCompletions,
} from "../services/completions.js";
import { listInitiative, serializeInitiative } from "../services/initiative.js";
import { listRedemptions, serializeRedemption } from "../services/redemptions.js";
import { listTodayForChild } from "../services/tasks.js";
import { childStats } from "../services/stats.js";
import { startOfWeekInTz } from "../lib/time.js";
import { getFamilySettings } from "../services/family.js";
import { HttpError } from "../errors.js";

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

dashboardRouter.get("/parent", async (req, res) => {
  if (req.auth!.role !== "PARENT") throw HttpError.forbidden();
  const familyId = req.auth!.fid;
  const [children, pendingCompletions, pendingInitiative, pendingRedemptions, recentLedger] =
    await Promise.all([
      listChildren(familyId),
      listCompletions(familyId, { status: "PENDING" }),
      listInitiative(familyId, { status: "PENDING" }),
      listRedemptions(familyId, { status: "PENDING" }),
      prisma.ledgerEntry.findMany({
        where: { familyId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

  const { timezone } = await getFamilySettings(familyId);
  const weekStart = startOfWeekInTz(timezone);
  const weekly = await prisma.ledgerEntry.groupBy({
    by: ["childId"],
    where: { familyId, createdAt: { gte: weekStart } },
    _sum: { amount: true },
  });
  const weeklyTotals = await Promise.all(
    children.map(async (c) => {
      const earned = await prisma.ledgerEntry.aggregate({
        _sum: { amount: true },
        where: { childId: c.id, amount: { gt: 0 }, createdAt: { gte: weekStart } },
      });
      const spent = await prisma.ledgerEntry.aggregate({
        _sum: { amount: true },
        where: { childId: c.id, amount: { lt: 0 }, createdAt: { gte: weekStart } },
      });
      return {
        childId: c.id,
        earned: earned._sum.amount ?? 0,
        spent: Math.abs(spent._sum.amount ?? 0),
      };
    }),
  );

  res.json({
    children,
    pendingCompletions: await serializePendingCompletions(familyId, pendingCompletions),
    pendingInitiative: pendingInitiative.map(serializeInitiative),
    pendingRedemptions: pendingRedemptions.map(serializeRedemption),
    recentLedger: recentLedger.map((e) => ({
      id: e.id,
      childId: e.childId,
      amount: e.amount,
      kind: e.kind,
      reason: e.reason,
      sourceType: e.sourceType,
      sourceId: e.sourceId,
      createdById: e.createdById,
      createdAt: e.createdAt.toISOString(),
    })),
    weeklyTotals,
    _: weekly, // unused, kept for future detail
  });
});

dashboardRouter.get("/child", async (req, res) => {
  if (req.auth!.role !== "CHILD") throw HttpError.forbidden();
  const familyId = req.auth!.fid;
  const childId = req.auth!.sub;

  const [child, stats, todayTasks, recentLedger, pendingCompletions, pendingRedemptions] = await Promise.all([
    getChild(familyId, childId),
    childStats(familyId, childId),
    listTodayForChild(familyId, childId),
    prisma.ledgerEntry.findMany({ where: { childId }, orderBy: { createdAt: "desc" }, take: 15 }),
    prisma.taskCompletion.count({ where: { childId, status: "PENDING" } }),
    prisma.redemption.count({ where: { childId, status: "PENDING" } }),
  ]);

  res.json({
    child,
    stats,
    todayTasks,
    recentLedger: recentLedger.map((e) => ({
      id: e.id,
      childId: e.childId,
      amount: e.amount,
      kind: e.kind,
      reason: e.reason,
      sourceType: e.sourceType,
      sourceId: e.sourceId,
      createdById: e.createdById,
      createdAt: e.createdAt.toISOString(),
    })),
    pendingCompletionCount: pendingCompletions,
    pendingRedemptionCount: pendingRedemptions,
  });
});
