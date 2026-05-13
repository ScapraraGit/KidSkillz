import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireParentOrCaregiver } from "../middleware/auth.js";
import {
  approveRedemption,
  listRedemptions,
  rejectRedemption,
  requestRedemption,
  serializeRedemption,
} from "../services/redemptions.js";
import { HttpError } from "../errors.js";

export const redemptionsRouter = Router();

redemptionsRouter.use(requireAuth);

const requestSchema = z.object({
  rewardId: z.string().uuid(),
  quantity: z.number().int().min(1).max(20).optional(),
  notes: z.string().max(500).optional(),
});

redemptionsRouter.post("/", async (req, res) => {
  if (req.auth!.role !== "CHILD") throw HttpError.forbidden("Only children request redemptions");
  const input = requestSchema.parse(req.body);
  const r = await requestRedemption(req.auth!.fid, { ...input, childId: req.auth!.sub });
  res.status(201).json({ redemption: serializeRedemption(r) });
});

redemptionsRouter.get("/", async (req, res) => {
  const status = req.query.status as "PENDING" | "APPROVED" | "REJECTED" | undefined;
  const childId = req.auth!.role === "CHILD" ? req.auth!.sub : (req.query.childId as string | undefined);
  const list = await listRedemptions(req.auth!.fid, { status, childId });
  res.json({ redemptions: list.map(serializeRedemption) });
});

const reviewSchema = z.object({ reason: z.string().max(500).optional() });

redemptionsRouter.post(
  "/:id/approve",
  requireParentOrCaregiver("canApproveRedemptions"),
  async (req, res) => {
    const r = await approveRedemption(req.auth!.fid, req.params.id, req.auth!.sub);
    res.json({ redemption: serializeRedemption(r) });
  },
);

redemptionsRouter.post("/:id/reject", requireParentOrCaregiver("canApproveRedemptions"), async (req, res) => {
  const { reason } = reviewSchema.parse(req.body ?? {});
  const r = await rejectRedemption(req.auth!.fid, req.params.id, req.auth!.sub, reason);
  res.json({ redemption: serializeRedemption(r) });
});
