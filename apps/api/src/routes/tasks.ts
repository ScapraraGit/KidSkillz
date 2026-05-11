import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  createTask,
  deleteTask,
  duplicateAcrossKids,
  getTask,
  listTasks,
  listTodayForChild,
  serializeTask,
  updateTask,
} from "../services/tasks.js";

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
  proofRequirement: z
    .enum(["NONE", "NOTES_OPTIONAL", "NOTES_REQUIRED", "PHOTO_OPTIONAL", "PHOTO_REQUIRED", "PHOTO_AND_NOTES"])
    .optional(),
  isActive: z.boolean().optional(),
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
  const childId =
    req.auth!.role === "CHILD"
      ? req.auth!.sub
      : (req.query.childId as string | undefined);
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
  res.status(204).end();
});

tasksRouter.get("/:id", async (req, res) => {
  res.json({ task: serializeTask(await getTask(req.auth!.fid, req.params.id)) });
});
