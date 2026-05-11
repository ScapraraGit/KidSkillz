import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getFamily, getFamilySettings, updateSettings } from "../services/family.js";

export const familyRouter = Router();

familyRouter.use(requireAuth);

familyRouter.get("/", async (req, res) => {
  const fam = await getFamily(req.auth!.fid);
  const settings = await getFamilySettings(fam.id);
  res.json({ id: fam.id, name: fam.name, settings });
});

const settingsSchema = z.object({
  childAuthMode: z.enum(["INDIVIDUAL", "SHARED_DEVICE"]).optional(),
  defaultProofRequirement: z
    .enum(["NONE", "NOTES_OPTIONAL", "NOTES_REQUIRED", "PHOTO_OPTIONAL", "PHOTO_REQUIRED", "PHOTO_AND_NOTES"])
    .optional(),
  allowNegativeBalance: z.boolean().optional(),
  initiativeBonus: z
    .object({
      enabled: z.boolean(),
      plannedFlatBonus: z.number().int().min(0),
      plannedMultiplier: z.number().min(1).max(3),
    })
    .optional(),
  screenTime: z
    .object({
      incrementMinutes: z.number().int().positive(),
      maxPerRedemptionMinutes: z.number().int().positive(),
    })
    .optional(),
  timezone: z.string().optional(),
});

familyRouter.patch("/settings", requireRole("PARENT"), async (req, res) => {
  const patch = settingsSchema.parse(req.body);
  await updateSettings(req.auth!.fid, patch);
  const settings = await getFamilySettings(req.auth!.fid);
  res.json({ settings });
});
