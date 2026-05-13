import { prisma } from "../db.js";
import type { Prisma, ChallengeKind, ChallengeWindow } from "@prisma/client";
import { formatInTimeZone } from "date-fns-tz";
import type { ChallengeDTO, ChallengeProgressDTO } from "@chorechamps/shared";
import { postLedger } from "./ledger.js";
import { getFamilySettings } from "./family.js";
import { evaluateLevelUp } from "./levels.js";
import { createNotification } from "./notifications.js";

// periodKey: YYYY-MM-DD for DAY, YYYY-Www (ISO week) for WEEK, family TZ.
export function periodKeyFor(window: ChallengeWindow, tz: string, now = new Date()): string {
  if (window === "DAY") {
    return formatInTimeZone(now, tz, "yyyy-MM-dd");
  }
  // ISO week year + ISO week number — handles year-boundary edge cases.
  return formatInTimeZone(now, tz, "RRRR-'W'II");
}

interface EventContext {
  familyId: string;
  childId: string;
  parentUserId?: string | null;
  now?: Date;
  tx?: Prisma.TransactionClient;
}

interface TaskApprovedEvent {
  type: "TASK_APPROVED";
  credits: number;
  earlyBird: boolean; // true if approved task was submitted/completed before noon family TZ
}

interface InitiativeApprovedEvent {
  type: "INITIATIVE_APPROVED";
  credits: number; // base + bonus
}

interface AdjustmentEvent {
  type: "ADJUSTMENT";
  credits: number; // positive only matters here
}

export type ChallengeEvent = TaskApprovedEvent | InitiativeApprovedEvent | AdjustmentEvent;

const BONUS_REASON = (title: string) => `Challenge complete: ${title}`;

// Returns score delta a single event contributes to a given ChallengeKind.
function deltaFor(kind: ChallengeKind, event: ChallengeEvent): number {
  switch (kind) {
    case "COMPLETE_N_TASKS":
      return event.type === "TASK_APPROVED" ? 1 : 0;
    case "EARN_N_CREDITS":
      // Earn-based: count credits from tasks + initiative + positive adjustments.
      return event.credits > 0 ? event.credits : 0;
    case "INITIATIVE_N_TIMES":
      return event.type === "INITIATIVE_APPROVED" ? 1 : 0;
    case "EARLY_BIRD":
      return event.type === "TASK_APPROVED" && event.earlyBird ? 1 : 0;
    case "NO_MISSES":
      // Outcome-based — not increment-driven; resolved by a daily/weekly job (not yet built).
      return 0;
  }
}

export async function evaluateChallenges(
  ctx: EventContext,
  event: ChallengeEvent,
): Promise<{
  completed: { challengeId: string; title: string; bonusCredits: number }[];
}> {
  const client = ctx.tx ?? prisma;
  const settings = await getFamilySettings(ctx.familyId);
  const now = ctx.now ?? new Date();

  const active = await client.challenge.findMany({
    where: { familyId: ctx.familyId, isActive: true },
  });
  if (active.length === 0) return { completed: [] };

  const completed: { challengeId: string; title: string; bonusCredits: number }[] = [];

  for (const ch of active) {
    const delta = deltaFor(ch.kind, event);
    if (delta <= 0) continue;
    const key = periodKeyFor(ch.window, settings.timezone, now);

    const existing = await client.challengeProgress.findFirst({
      where: { familyId: ctx.familyId, challengeId: ch.id, childId: ctx.childId, periodKey: key },
    });

    // Skip if already completed in this period (idempotent re-evaluation).
    if (existing?.completedAt) continue;

    const nextValue = (existing?.value ?? 0) + delta;
    const justHit = nextValue >= ch.target;

    await client.challengeProgress.upsert({
      where: { challengeId_childId_periodKey: { challengeId: ch.id, childId: ctx.childId, periodKey: key } },
      create: {
        familyId: ctx.familyId,
        challengeId: ch.id,
        childId: ctx.childId,
        periodKey: key,
        value: nextValue,
        completedAt: justHit ? now : null,
      },
      update: {
        value: nextValue,
        ...(justHit ? { completedAt: now } : {}),
      },
    });

    if (justHit) {
      if (ch.rewardCredits > 0) {
        await postLedger({
          tx: ctx.tx,
          familyId: ctx.familyId,
          childId: ctx.childId,
          amount: ch.rewardCredits,
          kind: "CHALLENGE_BONUS",
          reason: BONUS_REASON(ch.title),
          sourceType: "CHALLENGE",
          sourceId: ch.id,
          createdById: ctx.parentUserId ?? null,
        });
      }
      await createNotification({
        tx: ctx.tx,
        familyId: ctx.familyId,
        userId: ctx.childId,
        kind: "CHALLENGE_COMPLETED",
        title: `Challenge complete: ${ch.title}`,
        body: ch.rewardCredits > 0 ? `+${ch.rewardCredits} 🪙` : undefined,
        payload: { challengeId: ch.id },
      });
      completed.push({ challengeId: ch.id, title: ch.title, bonusCredits: ch.rewardCredits });
    }
  }

  return { completed };
}

export function serializeChallenge(c: {
  id: string;
  familyId: string;
  kind: ChallengeKind;
  title: string;
  target: number;
  window: ChallengeWindow;
  rewardCredits: number;
  isActive: boolean;
  startsAt: Date;
  endsAt: Date | null;
}): ChallengeDTO {
  return {
    id: c.id,
    familyId: c.familyId,
    kind: c.kind,
    title: c.title,
    target: c.target,
    window: c.window,
    rewardCredits: c.rewardCredits,
    isActive: c.isActive,
    startsAt: c.startsAt.toISOString(),
    endsAt: c.endsAt?.toISOString() ?? null,
  };
}

export function serializeProgress(p: {
  id: string;
  challengeId: string;
  childId: string;
  periodKey: string;
  value: number;
  completedAt: Date | null;
}): ChallengeProgressDTO {
  return {
    id: p.id,
    challengeId: p.challengeId,
    childId: p.childId,
    periodKey: p.periodKey,
    value: p.value,
    completedAt: p.completedAt?.toISOString() ?? null,
  };
}

export interface ChildChallengeRow {
  challenge: ChallengeDTO;
  progress: ChallengeProgressDTO | null;
}

export async function listChildChallenges(
  familyId: string,
  childId: string,
  now = new Date(),
): Promise<ChildChallengeRow[]> {
  const settings = await getFamilySettings(familyId);
  const active = await prisma.challenge.findMany({
    where: { familyId, isActive: true },
    orderBy: [{ window: "asc" }, { target: "asc" }],
  });
  if (active.length === 0) return [];

  const keys = new Set<string>();
  const keyByChallenge = new Map<string, string>();
  for (const ch of active) {
    const key = periodKeyFor(ch.window, settings.timezone, now);
    keys.add(key);
    keyByChallenge.set(ch.id, key);
  }

  const progress = await prisma.challengeProgress.findMany({
    where: {
      familyId,
      childId,
      challengeId: { in: active.map((c) => c.id) },
      periodKey: { in: Array.from(keys) },
    },
  });
  const progByChallenge = new Map(progress.map((p) => [`${p.challengeId}:${p.periodKey}`, p]));

  return active.map((ch) => {
    const key = keyByChallenge.get(ch.id)!;
    const p = progByChallenge.get(`${ch.id}:${key}`);
    return {
      challenge: serializeChallenge(ch),
      progress: p ? serializeProgress(p) : null,
    };
  });
}

interface SeedDef {
  kind: ChallengeKind;
  title: string;
  target: number;
  window: ChallengeWindow;
  rewardCredits: number;
}

const DEFAULT_LIBRARY: SeedDef[] = [
  { kind: "COMPLETE_N_TASKS", title: "Finish 3 chores today", target: 3, window: "DAY", rewardCredits: 3 },
  { kind: "EARLY_BIRD", title: "Early bird (before noon)", target: 1, window: "DAY", rewardCredits: 2 },
  {
    kind: "COMPLETE_N_TASKS",
    title: "Finish 10 chores this week",
    target: 10,
    window: "WEEK",
    rewardCredits: 10,
  },
  {
    kind: "EARN_N_CREDITS",
    title: "Earn 30 credits this week",
    target: 30,
    window: "WEEK",
    rewardCredits: 8,
  },
  { kind: "INITIATIVE_N_TIMES", title: "Show initiative twice", target: 2, window: "WEEK", rewardCredits: 6 },
];

export async function seedDefaultChallenges(familyId: string, tx?: Prisma.TransactionClient): Promise<void> {
  const client = tx ?? prisma;
  await client.challenge.createMany({
    data: DEFAULT_LIBRARY.map((d) => ({ familyId, ...d })),
  });
}

export async function listFamilyChallenges(familyId: string): Promise<ChallengeDTO[]> {
  const list = await prisma.challenge.findMany({
    where: { familyId },
    orderBy: [{ isActive: "desc" }, { window: "asc" }, { target: "asc" }],
  });
  return list.map(serializeChallenge);
}

export interface ChallengeWriteInput {
  kind: ChallengeKind;
  title: string;
  target: number;
  window: ChallengeWindow;
  rewardCredits: number;
  isActive?: boolean;
}

export async function createChallenge(familyId: string, input: ChallengeWriteInput): Promise<ChallengeDTO> {
  const ch = await prisma.challenge.create({
    data: {
      familyId,
      kind: input.kind,
      title: input.title.trim(),
      target: input.target,
      window: input.window,
      rewardCredits: input.rewardCredits,
      isActive: input.isActive ?? true,
    },
  });
  return serializeChallenge(ch);
}

export async function updateChallenge(
  familyId: string,
  id: string,
  input: Partial<ChallengeWriteInput>,
): Promise<ChallengeDTO> {
  const existing = await prisma.challenge.findFirst({ where: { id, familyId } });
  if (!existing) throw new Error("Challenge not found");
  const ch = await prisma.challenge.update({
    where: { id },
    data: {
      ...(input.title !== undefined && { title: input.title.trim() }),
      ...(input.target !== undefined && { target: input.target }),
      ...(input.kind !== undefined && { kind: input.kind }),
      ...(input.window !== undefined && { window: input.window }),
      ...(input.rewardCredits !== undefined && { rewardCredits: input.rewardCredits }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
  });
  return serializeChallenge(ch);
}

export async function deleteChallenge(familyId: string, id: string): Promise<void> {
  const existing = await prisma.challenge.findFirst({ where: { id, familyId } });
  if (!existing) throw new Error("Challenge not found");
  await prisma.challenge.delete({ where: { id } });
}

/**
 * Resolve NO_MISSES challenges for completed days/weeks. Idempotent.
 * Definition: a child qualifies if, during the period, they had >=1 APPROVED completion
 * AND zero REJECTED completions. Run by nightly job after local midnight.
 */
export async function resolveNoMisses(now = new Date()): Promise<{ resolved: number }> {
  const families = await prisma.family.findMany({
    include: { challenges: { where: { isActive: true, kind: "NO_MISSES" } } },
  });
  let resolved = 0;

  for (const fam of families) {
    if (fam.challenges.length === 0) continue;
    const settings = await getFamilySettings(fam.id);
    const tz = settings.timezone;

    const kids = await prisma.user.findMany({
      where: { familyId: fam.id, role: "CHILD", isActive: true },
      select: { id: true },
    });
    if (kids.length === 0) continue;

    for (const ch of fam.challenges) {
      const { startUtc, endUtc, periodKey } = previousCompletedPeriod(ch.window, tz, now);

      for (const kid of kids) {
        const existing = await prisma.challengeProgress.findFirst({
          where: { familyId: fam.id, challengeId: ch.id, childId: kid.id, periodKey },
        });
        if (existing?.completedAt) continue;

        const [approved, rejected] = await Promise.all([
          prisma.taskCompletion.count({
            where: {
              childId: kid.id,
              task: { familyId: fam.id },
              status: "APPROVED",
              submittedAt: { gte: startUtc, lt: endUtc },
            },
          }),
          prisma.taskCompletion.count({
            where: {
              childId: kid.id,
              task: { familyId: fam.id },
              status: "REJECTED",
              submittedAt: { gte: startUtc, lt: endUtc },
            },
          }),
        ]);
        if (approved < 1 || rejected > 0) continue;

        await prisma.challengeProgress.upsert({
          where: { challengeId_childId_periodKey: { challengeId: ch.id, childId: kid.id, periodKey } },
          create: {
            familyId: fam.id,
            challengeId: ch.id,
            childId: kid.id,
            periodKey,
            value: ch.target,
            completedAt: now,
          },
          update: { value: ch.target, completedAt: now },
        });
        if (ch.rewardCredits > 0) {
          await postLedger({
            familyId: fam.id,
            childId: kid.id,
            amount: ch.rewardCredits,
            kind: "CHALLENGE_BONUS",
            reason: `Challenge complete: ${ch.title}`,
            sourceType: "CHALLENGE",
            sourceId: ch.id,
          });
          await evaluateLevelUp({ familyId: fam.id, childId: kid.id });
        }
        resolved++;
      }
    }
  }

  return { resolved };
}

interface PreviousPeriod {
  startUtc: Date;
  endUtc: Date;
  periodKey: string;
}

function previousCompletedPeriod(window: ChallengeWindow, tz: string, now: Date): PreviousPeriod {
  if (window === "DAY") {
    // "Yesterday" in family TZ: midnight..midnight local.
    const yesterdayLocal = new Date(now.getTime() - 24 * 3600_000);
    const periodKey = formatInTimeZone(yesterdayLocal, tz, "yyyy-MM-dd");
    const startUtc = zonedDateBoundary(periodKey, tz, false);
    const endUtc = zonedDateBoundary(periodKey, tz, true);
    return { startUtc, endUtc, periodKey };
  }
  // Previous ISO week.
  const lastWeekLocal = new Date(now.getTime() - 7 * 24 * 3600_000);
  const periodKey = formatInTimeZone(lastWeekLocal, tz, "RRRR-'W'II");
  // Compute week-start by stepping back to ISO Monday.
  const weekStartDateKey = isoWeekStartDateKey(lastWeekLocal, tz);
  const startUtc = zonedDateBoundary(weekStartDateKey, tz, false);
  const endUtc = new Date(startUtc.getTime() + 7 * 24 * 3600_000);
  return { startUtc, endUtc, periodKey };
}

function zonedDateBoundary(dateKey: string, tz: string, endOfDay: boolean): Date {
  // Approximate: build an ISO string assumed to be in tz, then offset.
  // For correctness use a temporary Date and adjust via TZ offset diff.
  const probe = new Date(`${dateKey}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  const tzPart = formatInTimeZone(probe, tz, "xxx"); // e.g. -07:00
  const sign = tzPart.startsWith("-") ? -1 : 1;
  const [hh, mm] = tzPart.slice(1).split(":").map(Number);
  const offsetMs = sign * (hh * 3600 + mm * 60) * 1000;
  // Local midnight of dateKey in tz = UTC(dateKey 00:00) - offset
  const utcMidnight = new Date(probe.getTime() - offsetMs);
  return endOfDay ? new Date(utcMidnight.getTime() + 24 * 3600_000) : utcMidnight;
}

function isoWeekStartDateKey(d: Date, tz: string): string {
  // ISO week starts Monday. date-fns-tz format 'i' returns 1..7 (Mon=1, Sun=7).
  const dow = Number(formatInTimeZone(d, tz, "i"));
  const mondayLocal = new Date(d.getTime() - (dow - 1) * 24 * 3600_000);
  return formatInTimeZone(mondayLocal, tz, "yyyy-MM-dd");
}
