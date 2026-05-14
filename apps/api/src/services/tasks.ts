import { prisma } from "../db.js";
import { Prisma } from "@prisma/client";
import type { Recurrence, TodayTaskOccurrenceDTO } from "@chorechamps/shared";
import { HttpError } from "../errors.js";
import { getFamilySettings } from "./family.js";
import { dowSunFirst, todayInTz } from "../lib/time.js";

export interface CreateTaskInput {
  title: string;
  description?: string;
  creditValue: number;
  category?: string;
  categoryId?: string | null;
  kind: "ONE_TIME" | "RECURRING";
  recurrence?: Recurrence | null;
  dueAt?: string | null;
  dueByTime?: string | null;
  defaultDurationMinutes?: number | null;
  proofRequirement?: import("@prisma/client").ProofRequirement;
  isActive?: boolean;
  assignmentMode?: "ASSIGNED" | "UP_FOR_GRABS" | "TEAM";
  teamSplit?: "EVEN" | "FULL";
  missedPenalty?: number;
  assignedToId?: string | null;
}

export async function listTasks(familyId: string, opts?: { activeOnly?: boolean; assignedTo?: string }) {
  return prisma.task.findMany({
    where: {
      familyId,
      ...(opts?.activeOnly && { isActive: true }),
      ...(opts?.assignedTo && { assignedToId: opts.assignedTo }),
    },
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
  });
}

export async function getTask(familyId: string, taskId: string) {
  const t = await prisma.task.findFirst({ where: { id: taskId, familyId } });
  if (!t) throw HttpError.notFound("Task not found");
  return t;
}

export async function createTask(familyId: string, input: CreateTaskInput) {
  if (input.kind === "RECURRING" && !input.recurrence) {
    throw HttpError.badRequest("Recurring task requires a recurrence rule");
  }
  const assignmentMode = input.assignmentMode ?? "ASSIGNED";
  if (assignmentMode === "ASSIGNED" && !input.assignedToId) {
    throw HttpError.badRequest("Assigned tasks require an assignee");
  }
  const poolMode = assignmentMode === "UP_FOR_GRABS" || assignmentMode === "TEAM";
  return prisma.task.create({
    data: {
      familyId,
      title: input.title,
      description: input.description,
      creditValue: input.creditValue,
      category: input.category,
      categoryId: input.categoryId ?? null,
      kind: input.kind,
      recurrence: input.recurrence ? (input.recurrence as object) : undefined,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      dueByTime: input.dueByTime ?? null,
      defaultDurationMinutes: input.defaultDurationMinutes ?? null,
      proofRequirement: input.proofRequirement ?? "NOTES_OPTIONAL",
      isActive: input.isActive ?? true,
      assignmentMode,
      teamSplit: input.teamSplit ?? "EVEN",
      missedPenalty: input.missedPenalty ?? 0,
      assignedToId: poolMode ? null : input.assignedToId!,
    },
  });
}

// Creates copies of an existing task for every other kid in the family that doesn't already have it.
// "Already have it" is determined by exact title match within the family — keeps the action idempotent
// so re-clicking won't pile up duplicates.
export async function duplicateAcrossKids(familyId: string, taskId: string) {
  const source = await getTask(familyId, taskId);
  if (source.assignmentMode === "UP_FOR_GRABS") {
    throw HttpError.badRequest("Up-for-grabs tasks are already available to every kid");
  }
  const kids = await prisma.user.findMany({
    where: { familyId, role: "CHILD", isActive: true },
    select: { id: true },
  });
  const targets = kids.filter((k) => k.id !== source.assignedToId);
  if (targets.length === 0) return { created: 0, tasks: [] };

  const existingByKid = await prisma.task.findMany({
    where: { familyId, title: source.title, assignedToId: { in: targets.map((t) => t.id) } },
    select: { assignedToId: true },
  });
  const alreadyHas = new Set(existingByKid.map((t) => t.assignedToId));

  const toCreate = targets.filter((t) => !alreadyHas.has(t.id));
  const tasks = await Promise.all(
    toCreate.map((t) =>
      prisma.task.create({
        data: {
          familyId,
          title: source.title,
          description: source.description,
          creditValue: source.creditValue,
          category: source.category,
          kind: source.kind,
          recurrence: (source.recurrence as object | null) ?? undefined,
          dueAt: source.dueAt,
          dueByTime: source.dueByTime,
          defaultDurationMinutes: source.defaultDurationMinutes,
          proofRequirement: source.proofRequirement,
          isActive: source.isActive,
          assignedToId: t.id,
        },
      }),
    ),
  );
  return { created: tasks.length, tasks };
}

export async function updateTask(familyId: string, taskId: string, input: Partial<CreateTaskInput>) {
  const current = await getTask(familyId, taskId);
  const nextMode = input.assignmentMode ?? current.assignmentMode;
  const nextAssignee =
    input.assignedToId !== undefined ? input.assignedToId : current.assignedToId;
  if (nextMode === "ASSIGNED" && !nextAssignee) {
    throw HttpError.badRequest("Assigned tasks require an assignee");
  }
  return prisma.task.update({
    where: { id: taskId },
    data: {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.creditValue !== undefined && { creditValue: input.creditValue }),
      ...(input.category !== undefined && { category: input.category }),
      ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
      ...(input.kind !== undefined && { kind: input.kind }),
      ...(input.recurrence !== undefined && {
        recurrence: input.recurrence === null ? Prisma.JsonNull : (input.recurrence as object),
      }),
      ...(input.dueAt !== undefined && { dueAt: input.dueAt ? new Date(input.dueAt) : null }),
      ...(input.dueByTime !== undefined && { dueByTime: input.dueByTime }),
      ...(input.defaultDurationMinutes !== undefined && {
        defaultDurationMinutes: input.defaultDurationMinutes,
      }),
      ...(input.proofRequirement !== undefined && { proofRequirement: input.proofRequirement }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      ...(input.assignmentMode !== undefined && { assignmentMode: input.assignmentMode }),
      ...(input.teamSplit !== undefined && { teamSplit: input.teamSplit }),
      ...(input.missedPenalty !== undefined && { missedPenalty: Math.max(0, input.missedPenalty) }),
      assignedToId: nextMode === "UP_FOR_GRABS" || nextMode === "TEAM" ? null : nextAssignee!,
    },
  });
}

export async function deleteTask(familyId: string, taskId: string) {
  await getTask(familyId, taskId);
  await prisma.task.delete({ where: { id: taskId } });
}

function recurrenceMatchesDate(rec: Recurrence, dateStr: string, dow: number): boolean {
  if (rec.expiresAt && new Date(dateStr) > new Date(rec.expiresAt)) return false;
  if (rec.frequency === "DAILY") return true;
  if (rec.frequency === "WEEKLY" || rec.frequency === "CUSTOM") {
    return Array.isArray(rec.daysOfWeek) && rec.daysOfWeek.includes(dow);
  }
  return false;
}

/**
 * Today's task list for a child. Includes:
 *  - active ONE_TIME tasks assigned to this child (or unassigned), if no completion exists yet
 *  - RECURRING task occurrences for today (skipping if already completed-for-today)
 */
export async function listTodayForChild(
  familyId: string,
  childId: string,
): Promise<TodayTaskOccurrenceDTO[]> {
  const settings = await getFamilySettings(familyId);
  const today = todayInTz(settings.timezone);
  const dow = dowSunFirst(settings.timezone);

  const tasks = await prisma.task.findMany({
    where: {
      familyId,
      isActive: true,
      OR: [
        { assignedToId: childId },
        { assignmentMode: "UP_FOR_GRABS" },
        { assignmentMode: "TEAM" },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  const taskIds = tasks.map((t) => t.id);
  const teamJoins =
    taskIds.length > 0
      ? await prisma.taskJoin.findMany({
          where: {
            taskId: { in: taskIds },
            OR: [{ occurrenceDate: today }, { occurrenceDate: null }],
          },
        })
      : [];
  const teamByOcc = new Map<string, typeof teamJoins>();
  for (const j of teamJoins) {
    const k = `${j.taskId}|${j.occurrenceDate ?? "ONE"}`;
    const arr = teamByOcc.get(k) ?? [];
    arr.push(j);
    teamByOcc.set(k, arr);
  }

  // For UP_FOR_GRABS tasks we need to see ANY child's claim for the occurrence,
  // not just this child's, so we can hide already-claimed pool tasks.
  const completions = await prisma.taskCompletion.findMany({
    where: {
      taskId: { in: taskIds },
      OR: [
        { occurrenceDate: today },
        { occurrenceDate: null }, // ONE_TIME completions
      ],
    },
  });

  // Per-(taskId, childId) lookup for this child's own row.
  const ownByKey = new Map<string, (typeof completions)[number]>();
  // Per-(taskId, occurrenceDate) "claimed by anyone" lookup for pool tasks.
  const claimedByOcc = new Map<string, (typeof completions)[number]>();
  for (const c of completions) {
    const occKey = `${c.taskId}|${c.occurrenceDate ?? "ONE"}`;
    if (c.childId === childId) ownByKey.set(occKey, c);
    if (c.status === "PENDING" || c.status === "APPROVED") {
      const prior = claimedByOcc.get(occKey);
      // Earliest live claim wins; rejected entries never block.
      if (!prior) claimedByOcc.set(occKey, c);
    }
  }

  const out: TodayTaskOccurrenceDTO[] = [];
  for (const t of tasks) {
    const occDate = t.kind === "RECURRING" ? today : null;
    const occKey = `${t.id}|${occDate ?? "ONE"}`;
    const isPool = t.assignmentMode === "UP_FOR_GRABS";

    if (t.kind === "RECURRING" && t.recurrence) {
      const rec = t.recurrence as unknown as Recurrence;
      if (!recurrenceMatchesDate(rec, today, dow)) continue;
    } else if (t.kind !== "ONE_TIME") {
      continue;
    }

    if (t.assignmentMode === "TEAM") {
      // Team tasks are visible to every kid until submitted-and-approved-or-pending.
      // After submission, every joiner sees the pending/approved row.
      const submission = claimedByOcc.get(occKey);
      const roster = teamByOcc.get(occKey) ?? [];
      out.push({
        task: serializeTask(t),
        occurrenceDate: today,
        completionId: submission?.id ?? null,
        completionStatus: submission?.status ?? null,
        joined: roster.some((j) => j.childId === childId),
        teamJoinerIds: roster.map((j) => j.childId),
      });
      continue;
    }

    if (isPool) {
      const claim = claimedByOcc.get(occKey);
      if (claim && claim.childId !== childId) continue; // someone else grabbed it
      out.push({
        task: serializeTask(t),
        occurrenceDate: today,
        completionId: claim?.id ?? null,
        completionStatus: claim?.status ?? null,
      });
      continue;
    }

    const c = ownByKey.get(occKey);
    if (t.kind === "ONE_TIME") {
      if (c && c.status !== "REJECTED") {
        out.push({
          task: serializeTask(t),
          occurrenceDate: today,
          completionId: c.id,
          completionStatus: c.status,
        });
      } else {
        out.push({
          task: serializeTask(t),
          occurrenceDate: today,
          completionId: null,
          completionStatus: null,
        });
      }
    } else {
      out.push({
        task: serializeTask(t),
        occurrenceDate: today,
        completionId: c?.id ?? null,
        completionStatus: c?.status ?? null,
      });
    }
  }
  return out;
}

export function serializeTask(t: import("@prisma/client").Task) {
  return {
    id: t.id,
    familyId: t.familyId,
    title: t.title,
    description: t.description,
    creditValue: t.creditValue,
    category: t.category,
    categoryId: t.categoryId ?? null,
    kind: t.kind,
    recurrence: (t.recurrence as Recurrence | null) ?? null,
    dueAt: t.dueAt?.toISOString() ?? null,
    dueByTime: t.dueByTime ?? null,
    defaultDurationMinutes: t.defaultDurationMinutes ?? null,
    proofRequirement: t.proofRequirement,
    isActive: t.isActive,
    assignmentMode: t.assignmentMode,
    teamSplit: t.teamSplit,
    missedPenalty: t.missedPenalty,
    assignedToId: t.assignedToId,
  };
}

export async function joinTeam(
  familyId: string,
  taskId: string,
  childId: string,
  occurrenceDate: string | null,
) {
  const task = await prisma.task.findFirst({ where: { id: taskId, familyId, isActive: true } });
  if (!task) throw HttpError.notFound("Task not found");
  if (task.assignmentMode !== "TEAM") throw HttpError.badRequest("Task is not a team task");
  const occ = task.kind === "RECURRING" ? occurrenceDate : null;
  // Block joining after team submission already pending/approved.
  const existingSubmission = await prisma.taskCompletion.findFirst({
    where: { taskId, occurrenceDate: occ, status: { in: ["PENDING", "APPROVED"] } },
  });
  if (existingSubmission) throw HttpError.conflict("Team already submitted for this occurrence");
  const existing = await prisma.taskJoin.findFirst({
    where: { taskId, childId, occurrenceDate: occ },
  });
  if (!existing) {
    await prisma.taskJoin.create({
      data: { familyId, taskId, childId, occurrenceDate: occ },
    });
  }
  return prisma.taskJoin.findMany({
    where: { taskId, occurrenceDate: occ },
    orderBy: { createdAt: "asc" },
  });
}

export async function leaveTeam(
  familyId: string,
  taskId: string,
  childId: string,
  occurrenceDate: string | null,
) {
  const task = await prisma.task.findFirst({ where: { id: taskId, familyId } });
  if (!task) throw HttpError.notFound("Task not found");
  const occ = task.kind === "RECURRING" ? occurrenceDate : null;
  const submission = await prisma.taskCompletion.findFirst({
    where: { taskId, occurrenceDate: occ, status: { in: ["PENDING", "APPROVED"] } },
  });
  if (submission) throw HttpError.conflict("Cannot leave after team submitted");
  await prisma.taskJoin.deleteMany({ where: { taskId, childId, occurrenceDate: occ } });
}
