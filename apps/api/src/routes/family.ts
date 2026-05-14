import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getFamily, getFamilySettings, updateSettings } from "../services/family.js";
import { deleteFamily, exportFamily } from "../services/data-export.js";
import { HttpError } from "../errors.js";
import { prisma } from "../db.js";
import { recordAudit } from "../services/audit.js";
import { features, proofRequirementSchema } from "../lib/features.js";

export const familyRouter = Router();

familyRouter.use(requireAuth);

familyRouter.get("/", async (req, res) => {
  const fam = await getFamily(req.auth!.fid);
  const settings = await getFamilySettings(fam.id);
  res.json({ id: fam.id, name: fam.name, settings });
});

familyRouter.get("/members", requireRole("PARENT"), async (req, res) => {
  const users = await prisma.user.findMany({
    where: { familyId: req.auth!.fid, role: { in: ["PARENT", "CAREGIVER"] }, isActive: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, role: true, validUntil: true },
  });
  res.json({
    members: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      validUntil: u.validUntil?.toISOString() ?? null,
    })),
  });
});

const settingsSchema = z.object({
  childAuthMode: z.enum(["INDIVIDUAL", "SHARED_DEVICE"]).optional(),
  defaultProofRequirement: proofRequirementSchema.optional(),
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
  photoRetentionDays: z.number().int().min(0).max(3650).optional(),
  emailNotifications: z.boolean().optional(),
  vacationMode: z
    .object({
      active: z.boolean(),
      startsAt: z.string().datetime().nullable().optional(),
      endsAt: z.string().datetime().nullable().optional(),
      note: z.string().max(200).nullable().optional(),
    })
    .optional(),
  siblingPrivacy: z.boolean().optional(),
  penaltiesEnabled: z.boolean().optional(),
  missedOpportunityMode: z.enum(["OFF", "GENTLE", "SAVAGE"]).optional(),
  timezone: z.string().optional(),
});

familyRouter.patch("/settings", requireRole("PARENT"), async (req, res) => {
  const patch = settingsSchema.parse(req.body);
  await updateSettings(req.auth!.fid, patch);
  const settings = await getFamilySettings(req.auth!.fid);
  await recordAudit({
    familyId: req.auth!.fid,
    actorId: req.auth!.sub,
    kind: "FAMILY_SETTINGS_UPDATED",
    targetType: "Family",
    targetId: req.auth!.fid,
    payload: { keys: Object.keys(patch) },
  });
  res.json({ settings });
});

familyRouter.get("/export", requireRole("PARENT"), async (req, res) => {
  const data = await exportFamily(req.auth!.fid);
  const filename = `chorechampz-export-${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(JSON.stringify(data, null, 2));
});

const deleteSchema = z.object({ confirmText: z.string().min(1).max(200) });

familyRouter.delete("/", requireRole("PARENT"), async (req, res) => {
  const { confirmText } = deleteSchema.parse(req.body ?? {});
  try {
    const r = await deleteFamily({
      familyId: req.auth!.fid,
      parentUserId: req.auth!.sub,
      confirmText,
    });
    res.json({ ok: true, deletedUsers: r.deletedUsers });
  } catch (e) {
    throw HttpError.badRequest((e as Error).message);
  }
});
