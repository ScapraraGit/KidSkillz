import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  listChildChallenges,
  listFamilyChallenges,
  createChallenge,
  updateChallenge,
  deleteChallenge,
} from "../services/challenges.js";
import { ensureChildInFamily } from "../services/children.js";
import { HttpError } from "../errors.js";

export const challengesRouter = Router();

challengesRouter.use(requireAuth);

// Kid: GET /challenges/me — active challenges + current-period progress for self.
challengesRouter.get("/me", async (req, res) => {
  if (req.auth!.role !== "CHILD") throw HttpError.forbidden();
  const rows = await listChildChallenges(req.auth!.fid, req.auth!.sub);
  res.json({ challenges: rows });
});

// Parent: GET /challenges/child/:id — same view for a specific child in the family.
challengesRouter.get("/child/:id", async (req, res) => {
  if (req.auth!.role === "CHILD") throw HttpError.forbidden();
  await ensureChildInFamily(req.auth!.fid, req.params.id);
  const rows = await listChildChallenges(req.auth!.fid, req.params.id);
  res.json({ challenges: rows });
});

// Parent admin: list, create, update, delete.
const kindEnum = z.enum([
  "COMPLETE_N_TASKS",
  "EARN_N_CREDITS",
  "INITIATIVE_N_TIMES",
  "NO_MISSES",
  "EARLY_BIRD",
]);
const windowEnum = z.enum(["DAY", "WEEK"]);

const createSchema = z.object({
  kind: kindEnum,
  title: z.string().min(1).max(80),
  target: z.number().int().positive().max(1000),
  window: windowEnum,
  rewardCredits: z.number().int().min(0).max(1000),
  isActive: z.boolean().optional(),
});

const updateSchema = z.object({
  kind: kindEnum.optional(),
  title: z.string().min(1).max(80).optional(),
  target: z.number().int().positive().max(1000).optional(),
  window: windowEnum.optional(),
  rewardCredits: z.number().int().min(0).max(1000).optional(),
  isActive: z.boolean().optional(),
});

challengesRouter.get("/", requireRole("PARENT"), async (req, res) => {
  const challenges = await listFamilyChallenges(req.auth!.fid);
  res.json({ challenges });
});

challengesRouter.post("/", requireRole("PARENT"), async (req, res) => {
  const input = createSchema.parse(req.body);
  const challenge = await createChallenge(req.auth!.fid, input);
  res.status(201).json({ challenge });
});

challengesRouter.patch("/:id", requireRole("PARENT"), async (req, res) => {
  const input = updateSchema.parse(req.body);
  const challenge = await updateChallenge(req.auth!.fid, req.params.id, input);
  res.json({ challenge });
});

challengesRouter.delete("/:id", requireRole("PARENT"), async (req, res) => {
  await deleteChallenge(req.auth!.fid, req.params.id);
  res.status(204).end();
});
