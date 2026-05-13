import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  approveCompletion,
  listCompletions,
  rejectCompletion,
  serializeCompletion,
  serializePendingCompletions,
  submitCompletion,
} from "../services/completions.js";
import { HttpError } from "../errors.js";

export const completionsRouter = Router();

completionsRouter.use(requireAuth);

const submitSchema = z.object({
  taskId: z.string().uuid(),
  notes: z.string().max(2000).nullable().optional(),
  photoKey: z.string().nullable().optional(),
  occurrenceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

completionsRouter.post("/", async (req, res) => {
  if (req.auth!.role !== "CHILD") throw HttpError.forbidden("Only children submit completions");
  const input = submitSchema.parse(req.body);
  const c = await submitCompletion(req.auth!.fid, { ...input, childId: req.auth!.sub });
  res.status(201).json({ completion: serializeCompletion(c) });
});

completionsRouter.get("/", async (req, res) => {
  const status = req.query.status as "PENDING" | "APPROVED" | "REJECTED" | undefined;
  const childId = req.auth!.role === "CHILD" ? req.auth!.sub : (req.query.childId as string | undefined);
  const list = await listCompletions(req.auth!.fid, { status, childId });
  const completions =
    status === "PENDING"
      ? await serializePendingCompletions(req.auth!.fid, list)
      : list.map((c) => serializeCompletion(c));
  res.json({ completions });
});

const reviewSchema = z.object({
  creditOverride: z.number().int().min(0).optional(),
  reason: z.string().max(500).optional(),
  parentNote: z.string().max(280).optional(),
});

completionsRouter.post("/:id/approve", requireRole("PARENT"), async (req, res) => {
  const { creditOverride, parentNote } = reviewSchema.parse(req.body ?? {});
  const c = await approveCompletion(req.auth!.fid, req.params.id, req.auth!.sub, creditOverride, parentNote);
  res.json({ completion: serializeCompletion(c) });
});

const bulkApproveSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(100) });

completionsRouter.post("/bulk-approve", requireRole("PARENT"), async (req, res) => {
  const { ids } = bulkApproveSchema.parse(req.body);
  const results = await Promise.allSettled(
    ids.map((id) => approveCompletion(req.auth!.fid, id, req.auth!.sub)),
  );
  const approved = results.filter((r) => r.status === "fulfilled").length;
  const failed = results
    .map((r, i) => ({
      id: ids[i],
      reason: r.status === "rejected" ? String((r.reason as Error)?.message ?? r.reason) : null,
    }))
    .filter((f) => f.reason !== null);
  res.json({ approved, failed });
});

completionsRouter.post("/:id/reject", requireRole("PARENT"), async (req, res) => {
  const { reason } = reviewSchema.parse(req.body ?? {});
  const c = await rejectCompletion(req.auth!.fid, req.params.id, req.auth!.sub, reason);
  res.json({ completion: serializeCompletion(c) });
});
