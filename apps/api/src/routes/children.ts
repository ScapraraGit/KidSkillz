import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { createChild, getChild, listChildren, updateChild } from "../services/children.js";
import { childStats } from "../services/stats.js";
import { getChildLevel } from "../services/levels.js";
import { HttpError } from "../errors.js";

const stringArray = z.array(z.string().max(40)).max(40);

export const avatarConfigSchema = z
  .object({
    top: stringArray.optional(),
    topProbability: z.number().min(0).max(100).optional(),
    hairColor: stringArray.optional(),
    hatColor: stringArray.optional(),
    accessories: stringArray.optional(),
    accessoriesColor: stringArray.optional(),
    accessoriesProbability: z.number().min(0).max(100).optional(),
    facialHair: stringArray.optional(),
    facialHairColor: stringArray.optional(),
    facialHairProbability: z.number().min(0).max(100).optional(),
    clothing: stringArray.optional(),
    clothesColor: stringArray.optional(),
    clothingGraphic: stringArray.optional(),
    eyes: stringArray.optional(),
    eyebrows: stringArray.optional(),
    mouth: stringArray.optional(),
    skinColor: stringArray.optional(),
    backgroundColor: stringArray.optional(),
    pet: z.string().max(40).optional(),
  })
  .strict();

export const childrenRouter = Router();

childrenRouter.use(requireAuth);

childrenRouter.get("/", async (req, res) => {
  if (req.auth!.role === "CHILD") {
    const me = await getChild(req.auth!.fid, req.auth!.sub);
    return res.json({ children: [me] });
  }
  res.json({ children: await listChildren(req.auth!.fid) });
});

const createSchema = z.object({
  name: z.string().min(1).max(60),
  pin: z
    .string()
    .regex(/^\d{4,8}$/)
    .nullish(),
  avatarColor: z.string().optional(),
  avatarConfig: avatarConfigSchema.nullable().optional(),
});

childrenRouter.post("/", requireRole("PARENT"), async (req, res) => {
  const input = createSchema.parse(req.body);
  const child = await createChild(req.auth!.fid, input);
  res.status(201).json({ child });
});

const updateSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  pin: z
    .string()
    .regex(/^\d{4,8}$/)
    .nullable()
    .optional(),
  avatarColor: z.string().optional(),
  avatarConfig: avatarConfigSchema.nullable().optional(),
  redemptionPaused: z.boolean().optional(),
  earningPaused: z.boolean().optional(),
  proofRequirementOverride: z
    .enum(["NONE", "NOTES_OPTIONAL", "NOTES_REQUIRED", "PHOTO_OPTIONAL", "PHOTO_REQUIRED", "PHOTO_AND_NOTES"])
    .nullable()
    .optional(),
  soundEnabled: z.boolean().optional(),
  viewMode: z.enum(["YOUNGER", "OLDER"]).optional(),
  savingsGoalRewardId: z.string().uuid().nullable().optional(),
});

const preferencesSchema = z.object({
  soundEnabled: z.boolean().optional(),
  viewMode: z.enum(["YOUNGER", "OLDER"]).optional(),
  savingsGoalRewardId: z.string().uuid().nullable().optional(),
});

childrenRouter.patch("/preferences", requireRole("CHILD"), async (req, res) => {
  const input = preferencesSchema.parse(req.body);
  const child = await updateChild(req.auth!.fid, req.auth!.sub, input);
  res.json({ child });
});

childrenRouter.patch("/:id", requireRole("PARENT"), async (req, res) => {
  const input = updateSchema.parse(req.body);
  const child = await updateChild(req.auth!.fid, req.params.id, input);
  res.json({ child });
});

childrenRouter.get("/:id", async (req, res) => {
  if (req.auth!.role === "CHILD" && req.auth!.sub !== req.params.id) throw HttpError.forbidden();
  const child = await getChild(req.auth!.fid, req.params.id);
  res.json({ child });
});

childrenRouter.get("/:id/balance", async (req, res) => {
  if (req.auth!.role === "CHILD" && req.auth!.sub !== req.params.id) throw HttpError.forbidden();
  const child = await getChild(req.auth!.fid, req.params.id);
  res.json({ balance: child.balance });
});

childrenRouter.get("/:id/stats", async (req, res) => {
  if (req.auth!.role === "CHILD" && req.auth!.sub !== req.params.id) throw HttpError.forbidden();
  await getChild(req.auth!.fid, req.params.id); // family scope guard
  res.json({ stats: await childStats(req.auth!.fid, req.params.id) });
});

childrenRouter.get("/:id/level", async (req, res) => {
  if (req.auth!.role === "CHILD" && req.auth!.sub !== req.params.id) throw HttpError.forbidden();
  await getChild(req.auth!.fid, req.params.id); // family scope guard
  res.json({ level: await getChildLevel(req.auth!.fid, req.params.id) });
});
