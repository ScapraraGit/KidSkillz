import { addDays, format, parseISO } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "../db.js";
import { startOfWeekInTz, todayInTz } from "../lib/time.js";
import type { ChildStatsDTO } from "@chorechamps/shared";
import { getBalance } from "./ledger.js";
import { getFamilySettings } from "./family.js";

export async function childStats(familyId: string, childId: string): Promise<ChildStatsDTO> {
  const { timezone: tz } = await getFamilySettings(familyId);
  const balance = await getBalance(childId);
  const weekStart = startOfWeekInTz(tz);

  const [earnedAgg, spentAgg, initiativeCount, weekLedger] = await Promise.all([
    prisma.ledgerEntry.aggregate({
      _sum: { amount: true },
      where: {
        childId,
        amount: { gt: 0 },
        createdAt: { gte: weekStart },
      },
    }),
    prisma.ledgerEntry.aggregate({
      _sum: { amount: true },
      where: {
        childId,
        amount: { lt: 0 },
        createdAt: { gte: weekStart },
      },
    }),
    prisma.initiativeRequest.count({
      where: {
        childId,
        status: "APPROVED",
        reviewedAt: { gte: new Date(Date.now() - 30 * 86400000) },
      },
    }),
    prisma.ledgerEntry.findMany({
      where: { childId, kind: "TASK" },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  // Streak: consecutive days (going back from today, in family TZ) with at least one TASK ledger entry
  const days = new Set<string>();
  for (const e of weekLedger) {
    days.add(formatInTimeZone(e.createdAt, tz, "yyyy-MM-dd"));
  }
  const todayCal = parseISO(todayInTz(tz));
  let streak = 0;
  for (let i = 0; i < 60; i++) {
    const d = format(addDays(todayCal, -i), "yyyy-MM-dd");
    if (days.has(d)) streak++;
    else if (i === 0)
      continue; // grace for today not done yet
    else break;
  }

  const aboveAndBeyond = await prisma.initiativeRequest.count({
    where: { childId, status: "APPROVED" },
  });

  const badges: string[] = [];
  if (balance >= 50) badges.push("Saver");
  if (initiativeCount >= 3) badges.push("Initiative Star");
  if (streak >= 3) badges.push("On a Roll");
  if (aboveAndBeyond >= 5) badges.push("Above & Beyond");

  return {
    balance,
    weekEarned: earnedAgg._sum.amount ?? 0,
    weekSpent: Math.abs(spentAgg._sum.amount ?? 0),
    streakDays: streak,
    initiativeScore: initiativeCount * 5,
    aboveAndBeyondCount: aboveAndBeyond,
    badges,
  };
}
