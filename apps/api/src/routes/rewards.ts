import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  createReward,
  deleteReward,
  getReward,
  listRewards,
  serializeReward,
  updateReward,
} from "../services/rewards.js";

export const rewardsRouter = Router();

rewardsRouter.use(requireAuth);

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

rewardsRouter.get("/", async (req, res) => {
  const rewards = await listRewards(req.auth!.fid, {
    activeOnly: req.auth!.role === "CHILD" ? true : req.query.activeOnly === "true",
  });
  res.json({ rewards: rewards.map(serializeReward) });
});

rewardsRouter.get("/:id", async (req, res) => {
  res.json({ reward: serializeReward(await getReward(req.auth!.fid, req.params.id)) });
});

rewardsRouter.post("/", requireRole("PARENT"), async (req, res) => {
  const input = rewardSchema.parse(req.body);
  const r = await createReward(req.auth!.fid, input);
  res.status(201).json({ reward: serializeReward(r) });
});

rewardsRouter.patch("/:id", requireRole("PARENT"), async (req, res) => {
  const input = rewardSchema.partial().parse(req.body);
  const r = await updateReward(req.auth!.fid, req.params.id, input);
  res.json({ reward: serializeReward(r) });
});

rewardsRouter.delete("/:id", requireRole("PARENT"), async (req, res) => {
  await deleteReward(req.auth!.fid, req.params.id);
  res.status(204).end();
});
