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
  kind: "ONE_TIME" | "RECURRING";
  recurrence?: Recurrence | null;
  dueAt?: string | null;
  dueByTime?: string | null;
  proofRequirement?: import("@prisma/client").ProofRequirement;
  isActive?: boolean;
  assignedToId: string;
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
  return prisma.task.create({
    data: {
      familyId,
      title: input.title,
      description: input.description,
      creditValue: input.creditValue,
      category: input.category,
      kind: input.kind,
      recurrence: input.recurrence ? (input.recurrence as object) : undefined,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      dueByTime: input.dueByTime ?? null,
      proofRequirement: input.proofRequirement ?? "NOTES_OPTIONAL",
      isActive: input.isActive ?? true,
      assignedToId: input.assignedToId,
    },
  });
}

// Creates copies of an existing task for every other kid in the family that doesn't already have it.
// "Already have it" is determined by exact title match within the family — keeps the action idempotent
// so re-clicking won't pile up duplicates.
export async function duplicateAcrossKids(familyId: string, taskId: string) {
  const source = await getTask(familyId, taskId);
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
  await getTask(familyId, taskId);
  return prisma.task.update({
    where: { id: taskId },
    data: {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.creditValue !== undefined && { creditValue: input.creditValue }),
      ...(input.category !== undefined && { category: input.category }),
      ...(input.kind !== undefined && { kind: input.kind }),
      ...(input.recurrence !== undefined && {
        recurrence: input.recurrence === null ? Prisma.JsonNull : (input.recurrence as object),
      }),
      ...(input.dueAt !== undefined && { dueAt: input.dueAt ? new Date(input.dueAt) : null }),
      ...(input.dueByTime !== undefined && { dueByTime: input.dueByTime }),
      ...(input.proofRequirement !== undefined && { proofRequirement: input.proofRequirement }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      ...(input.assignedToId !== undefined && { assignedToId: input.assignedToId }),
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
export async function listTodayForChild(familyId: string, childId: string): Promise<TodayTaskOccurrenceDTO[]> {
  const settings = await getFamilySettings(familyId);
  const today = todayInTz(settings.timezone);
  const dow = dowSunFirst(settings.timezone);

  const tasks = await prisma.task.findMany({
    where: {
      familyId,
      isActive: true,
      assignedToId: childId,
    },
    orderBy: { createdAt: "asc" },
  });

  const completions = await prisma.taskCompletion.findMany({
    where: {
      childId,
      task: { familyId },
      OR: [
        { occurrenceDate: today },
        { occurrenceDate: null }, // ONE_TIME completions
      ],
    },
  });

  const compByKey = new Map<string, (typeof completions)[number]>();
  for (const c of completions) {
    const key = `${c.taskId}|${c.occurrenceDate ?? "ONE"}`;
    compByKey.set(key, c);
  }

  const out: TodayTaskOccurrenceDTO[] = [];
  for (const t of tasks) {
    if (t.kind === "ONE_TIME") {
      const c = compByKey.get(`${t.id}|ONE`);
      if (c && c.status !== "REJECTED") {
        // approved or pending — still show the row so child sees status; hide if approved & old?
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
    } else if (t.kind === "RECURRING" && t.recurrence) {
      const rec = t.recurrence as unknown as Recurrence;
      if (!recurrenceMatchesDate(rec, today, dow)) continue;
      const c = compByKey.get(`${t.id}|${today}`);
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
    kind: t.kind,
    recurrence: (t.recurrence as Recurrence | null) ?? null,
    dueAt: t.dueAt?.toISOString() ?? null,
    dueByTime: t.dueByTime ?? null,
    proofRequirement: t.proofRequirement,
    isActive: t.isActive,
    assignedToId: t.assignedToId,
  };
}
