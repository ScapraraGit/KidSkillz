import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  createTask,
  deleteTask,
  duplicateAcrossKids,
  getTask,
  joinTeam,
  leaveTeam,
  listTasks,
  listTodayForChild,
  serializeTask,
  updateTask,
} from "../services/tasks.js";
import { claimMissedOpportunity } from "../services/missed-opportunities.js";
import { recordAudit } from "../services/audit.js";
import { proofRequirementSchema } from "../lib/features.js";

export const tasksRouter = Router();

tasksRouter.use(requireAuth);

const recurrenceSchema = z.object({
  frequency: z.enum(["DAILY", "WEEKLY", "CUSTOM"]),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

const createTaskSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  creditValue: z.number().int().min(0).max(10_000),
  category: z.string().max(60).optional(),
  kind: z.enum(["ONE_TIME", "RECURRING"]),
  recurrence: recurrenceSchema.nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  dueByTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24h)")
    .nullable()
    .optional(),
  defaultDurationMinutes: z.number().int().min(1).max(240).nullable().optional(),
  proofRequirement: proofRequirementSchema.optional(),
  isActive: z.boolean().optional(),
  assignmentMode: z.enum(["ASSIGNED", "UP_FOR_GRABS", "TEAM"]).optional(),
  teamSplit: z.enum(["EVEN", "FULL"]).optional(),
  missedPenalty: z.number().int().min(0).max(10_000).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  assignedToId: z.string().uuid().nullable().optional(),
});

tasksRouter.get("/", async (req, res) => {
  const tasks = await listTasks(req.auth!.fid, {
    activeOnly: req.query.activeOnly === "true",
    assignedTo: req.auth!.role === "CHILD" ? req.auth!.sub : (req.query.assignedTo as string | undefined),
  });
  res.json({ tasks: tasks.map(serializeTask) });
});

tasksRouter.get("/today", async (req, res) => {
  const childId = req.auth!.role === "CHILD" ? req.auth!.sub : (req.query.childId as string | undefined);
  if (!childId) return res.status(400).json({ error: "childId required" });
  res.json({ occurrences: await listTodayForChild(req.auth!.fid, childId) });
});

tasksRouter.post("/", requireRole("PARENT"), async (req, res) => {
  const input = createTaskSchema.parse(req.body);
  const task = await createTask(req.auth!.fid, input);
  res.status(201).json({ task: serializeTask(task) });
});

tasksRouter.patch("/:id", requireRole("PARENT"), async (req, res) => {
  const input = createTaskSchema.partial().parse(req.body);
  const task = await updateTask(req.auth!.fid, req.params.id, input);
  res.json({ task: serializeTask(task) });
});

tasksRouter.delete("/:id", requireRole("PARENT"), async (req, res) => {
  await deleteTask(req.auth!.fid, req.params.id);
  await recordAudit({
    familyId: req.auth!.fid,
    actorId: req.auth!.sub,
    kind: "TASK_DELETED",
    targetType: "Task",
    targetId: req.params.id,
  });
  res.status(204).end();
});

tasksRouter.post("/:id/duplicate-across-kids", requireRole("PARENT"), async (req, res) => {
  const result = await duplicateAcrossKids(req.auth!.fid, req.params.id);
  res.json({ created: result.created, tasks: result.tasks.map(serializeTask) });
});

tasksRouter.get("/:id", async (req, res) => {
  res.json({ task: serializeTask(await getTask(req.auth!.fid, req.params.id)) });
});

const joinSchema = z.object({
  occurrenceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

tasksRouter.post("/:id/join", async (req, res) => {
  if (req.auth!.role !== "CHILD") return res.status(403).json({ error: "FORBIDDEN" });
  const { occurrenceDate } = joinSchema.parse(req.body ?? {});
  const roster = await joinTeam(req.auth!.fid, req.params.id, req.auth!.sub, occurrenceDate ?? null);
  res.json({ joinerIds: roster.map((r) => r.childId) });
});

tasksRouter.post("/:id/leave", async (req, res) => {
  if (req.auth!.role !== "CHILD") return res.status(403).json({ error: "FORBIDDEN" });
  const { occurrenceDate } = joinSchema.parse(req.body ?? {});
  await leaveTeam(req.auth!.fid, req.params.id, req.auth!.sub, occurrenceDate ?? null);
  res.status(204).end();
});

const parentClaimSchema = z.object({
  occurrenceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

tasksRouter.post("/:id/parent-claim", requireRole("PARENT", "CAREGIVER"), async (req, res) => {
  const { occurrenceDate } = parentClaimSchema.parse(req.body ?? {});
  const mo = await claimMissedOpportunity(
    req.auth!.fid,
    req.params.id,
    req.auth!.sub,
    occurrenceDate ?? null,
  );
  res.status(201).json({ missedOpportunity: mo });
});
