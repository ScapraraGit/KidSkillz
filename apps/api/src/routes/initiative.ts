import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  approveInitiative,
  listInitiative,
  rejectInitiative,
  serializeInitiative,
  submitInitiative,
} from "../services/initiative.js";
import { HttpError } from "../errors.js";

export const initiativeRouter = Router();

initiativeRouter.use(requireAuth);

const submitSchema = z.object({
  kind: z.enum(["PLANNED", "WRITE_IN"]),
  title: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  suggestedCredits: z.number().int().min(0).max(1000),
  notes: z.string().max(2000).optional(),
  photoKey: z.string().optional(),
});

initiativeRouter.post("/", async (req, res) => {
  if (req.auth!.role !== "CHILD") throw HttpError.forbidden("Only children submit initiative");
  const input = submitSchema.parse(req.body);
  const ir = await submitInitiative(req.auth!.fid, { ...input, childId: req.auth!.sub });
  res.status(201).json({ initiative: serializeInitiative(ir) });
});

initiativeRouter.get("/", async (req, res) => {
  const status = req.query.status as "PENDING" | "APPROVED" | "REJECTED" | undefined;
  const childId = req.auth!.role === "CHILD" ? req.auth!.sub : (req.query.childId as string | undefined);
  const list = await listInitiative(req.auth!.fid, { status, childId });
  res.json({ initiative: list.map(serializeInitiative) });
});

const reviewSchema = z.object({
  creditOverride: z.number().int().min(0).optional(),
  reason: z.string().max(500).optional(),
});

initiativeRouter.post("/:id/approve", requireRole("PARENT"), async (req, res) => {
  const { creditOverride } = reviewSchema.parse(req.body ?? {});
  const ir = await approveInitiative(req.auth!.fid, req.params.id, req.auth!.sub, creditOverride);
  res.json({ initiative: serializeInitiative(ir) });
});

initiativeRouter.post("/:id/reject", requireRole("PARENT"), async (req, res) => {
  const { reason } = reviewSchema.parse(req.body ?? {});
  const ir = await rejectInitiative(req.auth!.fid, req.params.id, req.auth!.sub, reason);
  res.json({ initiative: serializeInitiative(ir) });
});
