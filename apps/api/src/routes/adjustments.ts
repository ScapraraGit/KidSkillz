import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { idempotency } from "../middleware/idempotency.js";
import { postAdjustment } from "../services/adjustments.js";
import { recordAudit } from "../services/audit.js";

export const adjustmentsRouter = Router();

adjustmentsRouter.use(requireAuth, requireRole("PARENT"));

const schema = z.object({
  childId: z.string().uuid(),
  amount: z
    .number()
    .int()
    .refine((n) => n !== 0, "Amount cannot be zero"),
  reason: z.string().min(1).max(500),
});

adjustmentsRouter.post("/", idempotency, async (req, res) => {
  const input = schema.parse(req.body);
  const entry = await postAdjustment({
    familyId: req.auth!.fid,
    parentUserId: req.auth!.sub,
    childId: input.childId,
    amount: input.amount,
    reason: input.reason,
  });
  await recordAudit({
    familyId: req.auth!.fid,
    actorId: req.auth!.sub,
    kind: "ADJUSTMENT_POSTED",
    targetType: "User",
    targetId: input.childId,
    payload: { amount: input.amount, reason: input.reason, ledgerEntryId: entry.id },
  });
  res.status(201).json({ entry });
});
