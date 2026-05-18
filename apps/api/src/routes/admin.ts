import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import {
  adminResetPassword,
  getFamilyDetail,
  listFamiliesWithOwner,
  renameFamily,
} from "../services/admin.js";
import { recordAudit } from "../services/audit.js";
import { createTask, deleteTask, listTasks, serializeTask, updateTask } from "../services/tasks.js";
import {
  createReward,
  deleteReward,
  listRewards,
  serializeReward,
  updateReward,
} from "../services/rewards.js";
import { proofRequirementSchema } from "../lib/features.js";

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

adminRouter.get("/families", async (_req, res) => {
  res.json({ families: await listFamiliesWithOwner() });
});

adminRouter.get("/families/:familyId", async (req, res) => {
  res.json({ family: await getFamilyDetail(req.params.familyId) });
});

const renameSchema = z.object({ name: z.string().trim().min(2).max(80) });

adminRouter.patch("/families/:familyId", async (req, res) => {
  const { name } = renameSchema.parse(req.body);
  const family = await renameFamily(req.params.familyId, name);
  await recordAudit({
    familyId: family.id,
    actorId: req.auth!.sub,
    kind: "ADMIN_FAMILY_RENAMED",
    targetType: "Family",
    targetId: family.id,
    payload: { name },
  });
  res.json({ family: { id: family.id, name: family.name } });
});

const resetPwSchema = z.object({ password: z.string().min(8).max(128) });

adminRouter.post("/users/:userId/reset-password", async (req, res) => {
  const { password } = resetPwSchema.parse(req.body);
  const result = await adminResetPassword(req.params.userId, password);
  await recordAudit({
    familyId: result.familyId,
    actorId: req.auth!.sub,
    kind: "ADMIN_PASSWORD_RESET",
    targetType: "User",
    targetId: req.params.userId,
  });
  res.json({ ok: true });
});

// Tasks/rewards proxy — admin acts on a specific family by id.

adminRouter.get("/families/:familyId/tasks", async (req, res) => {
  const tasks = await listTasks(req.params.familyId);
  res.json({ tasks: tasks.map(serializeTask) });
});

const recurrenceSchema = z.object({
  frequency: z.enum(["DAILY", "WEEKLY", "CUSTOM"]),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

const taskSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  creditValue: z.number().int().min(0).max(10_000),
  category: z.string().max(60).optional(),
  kind: z.enum(["ONE_TIME", "RECURRING"]),
  recurrence: recurrenceSchema.nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  dueByTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
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

adminRouter.post("/families/:familyId/tasks", async (req, res) => {
  const input = taskSchema.parse(req.body);
  const task = await createTask(req.params.familyId, input);
  await recordAudit({
    familyId: req.params.familyId,
    actorId: req.auth!.sub,
    kind: "ADMIN_TASK_CREATED",
    targetType: "Task",
    targetId: task.id,
  });
  res.status(201).json({ task: serializeTask(task) });
});

adminRouter.patch("/families/:familyId/tasks/:taskId", async (req, res) => {
  const input = taskSchema.partial().parse(req.body);
  const task = await updateTask(req.params.familyId, req.params.taskId, input);
  await recordAudit({
    familyId: req.params.familyId,
    actorId: req.auth!.sub,
    kind: "ADMIN_TASK_UPDATED",
    targetType: "Task",
    targetId: task.id,
  });
  res.json({ task: serializeTask(task) });
});

adminRouter.delete("/families/:familyId/tasks/:taskId", async (req, res) => {
  await deleteTask(req.params.familyId, req.params.taskId);
  await recordAudit({
    familyId: req.params.familyId,
    actorId: req.auth!.sub,
    kind: "ADMIN_TASK_DELETED",
    targetType: "Task",
    targetId: req.params.taskId,
  });
  res.status(204).end();
});

adminRouter.get("/families/:familyId/rewards", async (req, res) => {
  const rewards = await listRewards(req.params.familyId);
  res.json({ rewards: rewards.map(serializeReward) });
});

const rewardSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  creditCost: z.number().int().min(0).max(1_000_000),
  type: z.enum(["SCREEN_TIME", "GAME_TIME", "MOVIE_NIGHT", "MONEY", "TREAT", "ACTIVITY", "CUSTOM"]),
  requiresApproval: z.boolean().optional(),
  isActive: z.boolean().optional(),
  weeklyLimit: z.number().int().min(0).nullable().optional(),
  dailyLimit: z.number().int().min(0).nullable().optional(),
  metadata: z
    .object({
      unitMinutes: z.number().int().positive().optional(),
      maxPerRedemption: z.number().int().positive().optional(),
      currency: z.string().optional(),
      amountPerCredit: z.number().nonnegative().optional(),
      notes: z.string().optional(),
    })
    .optional(),
  eligibleChildIds: z.array(z.string().uuid()).optional(),
});

adminRouter.post("/families/:familyId/rewards", async (req, res) => {
  const input = rewardSchema.parse(req.body);
  const r = await createReward(req.params.familyId, input);
  await recordAudit({
    familyId: req.params.familyId,
    actorId: req.auth!.sub,
    kind: "ADMIN_REWARD_CREATED",
    targetType: "Reward",
    targetId: r.id,
  });
  res.status(201).json({ reward: serializeReward(r) });
});

adminRouter.patch("/families/:familyId/rewards/:rewardId", async (req, res) => {
  const input = rewardSchema.partial().parse(req.body);
  const r = await updateReward(req.params.familyId, req.params.rewardId, input);
  await recordAudit({
    familyId: req.params.familyId,
    actorId: req.auth!.sub,
    kind: "ADMIN_REWARD_UPDATED",
    targetType: "Reward",
    targetId: r.id,
  });
  res.json({ reward: serializeReward(r) });
});

adminRouter.delete("/families/:familyId/rewards/:rewardId", async (req, res) => {
  await deleteReward(req.params.familyId, req.params.rewardId);
  await recordAudit({
    familyId: req.params.familyId,
    actorId: req.auth!.sub,
    kind: "ADMIN_REWARD_DELETED",
    targetType: "Reward",
    targetId: req.params.rewardId,
  });
  res.status(204).end();
});
