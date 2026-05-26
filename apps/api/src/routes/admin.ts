import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import {
  adminResetPassword,
  getFamilyDetail,
  listFamiliesWithOwner,
  renameFamily,
  setFamilyBeta,
} from "../services/admin.js";
import { recordAudit } from "../services/audit.js";
import { prisma } from "../db.js";
import { createTask, deleteTask, listTasks, serializeTask, updateTask } from "../services/tasks.js";
import {
  createReward,
  deleteReward,
  listRewards,
  serializeReward,
  updateReward,
} from "../services/rewards.js";
import { proofRequirementSchema } from "../lib/features.js";
import { sendBetaInviteEmail } from "../lib/email.js";
import { adminListFeedback, adminListChecklistProgress } from "../services/beta.js";
import { env } from "../env.js";
import {
  clearBillingOverride,
  getEntitlement,
  listOverrideLog,
  setBillingOverride,
} from "../services/billing.js";

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

const setBetaSchema = z.object({ isBeta: z.boolean() });

adminRouter.patch("/families/:familyId/beta", async (req, res) => {
  const { isBeta } = setBetaSchema.parse(req.body);
  const family = await setFamilyBeta(req.params.familyId, isBeta);
  await recordAudit({
    familyId: family.id,
    actorId: req.auth!.sub,
    kind: isBeta ? "ADMIN_FAMILY_BETA_ENABLED" : "ADMIN_FAMILY_BETA_DISABLED",
    targetType: "Family",
    targetId: family.id,
  });
  res.json({ family: { id: family.id, isBeta: family.isBeta } });
});

const resetPwSchema = z.object({ password: z.string().min(8).max(128) });

adminRouter.post("/users/:userId/reset-password", async (req, res) => {
  const { password } = resetPwSchema.parse(req.body);
  const result = await adminResetPassword(req.params.userId, password);
  // Phase 2 multi-family: a PARENT/CAREGIVER user may have no User.familyId
  // (their families come from FamilyMembership). Audit per-membership rather
  // than against a single familyId. CHILD users keep User.familyId.
  if (result.familyId) {
    await recordAudit({
      familyId: result.familyId,
      actorId: req.auth!.sub,
      kind: "ADMIN_PASSWORD_RESET",
      targetType: "User",
      targetId: req.params.userId,
    });
  } else {
    const memberships = await prisma.familyMembership.findMany({
      where: { userId: req.params.userId, status: "ACTIVE" },
      select: { familyId: true },
    });
    for (const m of memberships) {
      await recordAudit({
        familyId: m.familyId,
        actorId: req.auth!.sub,
        kind: "ADMIN_PASSWORD_RESET",
        targetType: "User",
        targetId: req.params.userId,
      });
    }
  }
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

// --- Billing override (admin "mark as Free") ---

adminRouter.get("/families/:familyId/billing", async (req, res) => {
  const entitlement = await getEntitlement(req.params.familyId);
  res.json({ entitlement });
});

const setOverrideSchema = z
  .object({
    type: z.enum(["FREE_FOREVER", "FREE_UNTIL", "COMPED_PREMIUM"]),
    reason: z.string().trim().min(1).max(500),
    until: z.string().datetime().optional(),
  })
  .refine((v) => (v.type === "FREE_UNTIL" ? !!v.until : !v.until), {
    message: "FREE_UNTIL requires `until`; other types must omit it",
  });

adminRouter.post("/families/:familyId/billing-override", async (req, res) => {
  const input = setOverrideSchema.parse(req.body);
  await setBillingOverride(req.params.familyId, req.auth!.sub, {
    type: input.type,
    reason: input.reason,
    until: input.until ? new Date(input.until) : null,
  });
  await recordAudit({
    familyId: req.params.familyId,
    actorId: req.auth!.sub,
    kind: "ADMIN_BILLING_OVERRIDE_SET",
    targetType: "Family",
    targetId: req.params.familyId,
    payload: { type: input.type, until: input.until, reason: input.reason },
  });
  const entitlement = await getEntitlement(req.params.familyId);
  res.json({ entitlement });
});

const clearOverrideSchema = z.object({ reason: z.string().trim().min(1).max(500) });

adminRouter.delete("/families/:familyId/billing-override", async (req, res) => {
  const { reason } = clearOverrideSchema.parse(req.body);
  await clearBillingOverride(req.params.familyId, req.auth!.sub, reason);
  await recordAudit({
    familyId: req.params.familyId,
    actorId: req.auth!.sub,
    kind: "ADMIN_BILLING_OVERRIDE_CLEARED",
    targetType: "Family",
    targetId: req.params.familyId,
    payload: { reason },
  });
  const entitlement = await getEntitlement(req.params.familyId);
  res.json({ entitlement });
});

adminRouter.get("/families/:familyId/billing-override/log", async (req, res) => {
  const log = await listOverrideLog(req.params.familyId);
  res.json({ log });
});

// Beta invite blast. Admin-only. Sends the beta-invite template to each address.
// Rate-limit comes from the email provider — we cap batch size at 50 to keep
// any single click bounded; bigger sends should script against the same endpoint.
const betaInviteSchema = z.object({
  emails: z.array(z.string().trim().email().max(200)).min(1).max(50),
  recipientName: z.string().trim().max(80).optional(),
});

adminRouter.post("/beta/invite", async (req, res) => {
  const { emails, recipientName } = betaInviteSchema.parse(req.body);
  const dedup = Array.from(new Set(emails.map((e) => e.toLowerCase())));
  const base = env.APP_URL.replace(/\/$/, "");
  const checklistUrl = `${base}/beta/checklist`;
  const feedbackUrl = `${base}/beta/feedback`;

  const results = await Promise.all(
    dedup.map(async (to) => {
      try {
        await sendBetaInviteEmail({ to, recipientName: recipientName ?? null, checklistUrl, feedbackUrl });
        return { to, ok: true as const };
      } catch (e) {
        return { to, ok: false as const, error: (e as Error).message };
      }
    }),
  );

  const sent = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  res.json({ sent, failed });
});

adminRouter.get("/beta/feedback", async (_req, res) => {
  const feedback = await adminListFeedback();
  res.json({ feedback });
});

adminRouter.get("/beta/checklist-progress", async (_req, res) => {
  const progress = await adminListChecklistProgress();
  res.json({ progress });
});
