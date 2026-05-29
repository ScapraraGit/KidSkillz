import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { ensureFamilyCode, getFamily, getFamilySettings, updateSettings } from "../services/family.js";
import { deleteFamily, exportFamily } from "../services/data-export.js";
import { HttpError } from "../errors.js";
import { prisma } from "../db.js";
import { recordAudit } from "../services/audit.js";
import { features, proofRequirementSchema } from "../lib/features.js";
import { hashPassword } from "../lib/auth.js";
import {
  formatPairingCode,
  issueEnrollment,
  listDevices,
  renameDevice,
  revokeDevice,
} from "../services/device-pairing.js";
import { env } from "../env.js";

export const familyRouter = Router();

familyRouter.use(requireAuth);

familyRouter.get("/", async (req, res) => {
  const fam = await getFamily(req.auth!.fid);
  const settings = await getFamilySettings(fam.id);
  // Lazily backfill familyCode for parents so the Settings page always has one
  // to show. Children/caregivers never see the code, so only auto-allocate for parents.
  const familyCode = req.auth!.role === "PARENT" ? await ensureFamilyCode(fam.id) : fam.familyCode;
  res.json({ id: fam.id, name: fam.name, familyCode: familyCode ?? null, settings });
});

familyRouter.get("/members", requireRole("PARENT"), async (req, res) => {
  // Adults belong to a family via FamilyMembership now, not User.familyId.
  // The membership owns the caregiver access window (`validUntil`), so we
  // surface that — not the long-defunct User.validUntil.
  const memberships = await prisma.familyMembership.findMany({
    where: { familyId: req.auth!.fid, status: "ACTIVE" },
    include: { user: { select: { id: true, name: true, email: true, isActive: true } } },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });
  res.json({
    members: memberships
      .filter((m) => m.user.isActive)
      .map((m) => ({
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
        validUntil: m.validUntil?.toISOString() ?? null,
        isBillingOwner: m.isBillingOwner,
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
  pushNotifications: z.boolean().optional(),
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

const devicePasswordSchema = z.object({ password: z.string().min(8).max(128) });

familyRouter.put("/device-password", requireRole("PARENT"), async (req, res) => {
  const { password } = devicePasswordSchema.parse(req.body);
  const hash = await hashPassword(password);
  await prisma.family.update({
    where: { id: req.auth!.fid },
    data: { devicePasswordHash: hash },
  });
  await recordAudit({
    familyId: req.auth!.fid,
    actorId: req.auth!.sub,
    kind: "DEVICE_PASSWORD_SET",
    targetType: "Family",
    targetId: req.auth!.fid,
  });
  res.json({ ok: true });
});

// --- Paired-device management (parent-only) -----------------------------

const enrollDeviceSchema = z.object({
  label: z.string().trim().min(1).max(80).optional(),
  // Beta-tester mode: extends pairing-code TTL from 10 minutes to 7 days so
  // testers swapping test devices over a sprint don't keep timing out the
  // redemption window. The minted EnrolledDevice itself has no expiry change.
  longLived: z.boolean().optional(),
});
const LONG_LIVED_TTL_MS = 7 * 24 * 60 * 60 * 1000;

familyRouter.post("/devices/enroll", requireRole("PARENT"), async (req, res) => {
  if (!env.DEVICE_PAIRING_ENABLED) throw HttpError.notFound("Feature disabled");
  const { label, longLived } = enrollDeviceSchema.parse(req.body ?? {});
  const r = await issueEnrollment({
    familyId: req.auth!.fid,
    createdById: req.auth!.sub,
    label,
    ttlMs: longLived ? LONG_LIVED_TTL_MS : undefined,
  });
  await recordAudit({
    familyId: req.auth!.fid,
    actorId: req.auth!.sub,
    kind: longLived ? "DEVICE_ENROLLED_LONG_LIVED" : "DEVICE_ENROLLED",
    targetType: "DeviceEnrollment",
    targetId: r.enrollmentId,
    payload: { label: label ?? null, longLived: longLived ?? false },
  });
  // QR URL points at the public web app /pair page; nonce JWT carries family scope.
  const qrUrl = `${env.APP_URL.replace(/\/$/, "")}/pair?nonce=${encodeURIComponent(r.qrNonce)}`;
  res.json({
    enrollmentId: r.enrollmentId,
    pairingCode: r.pairingCode,
    pairingCodeDisplay: formatPairingCode(r.pairingCode),
    qrUrl,
    expiresAt: r.expiresAt.toISOString(),
  });
});

familyRouter.get("/devices", requireRole("PARENT"), async (req, res) => {
  if (!env.DEVICE_PAIRING_ENABLED) throw HttpError.notFound("Feature disabled");
  res.json({ devices: await listDevices(req.auth!.fid) });
});

const renameDeviceSchema = z.object({ label: z.string().min(1).max(80) });

familyRouter.post("/devices/:id/rename", requireRole("PARENT"), async (req, res) => {
  if (!env.DEVICE_PAIRING_ENABLED) throw HttpError.notFound("Feature disabled");
  const { label } = renameDeviceSchema.parse(req.body);
  await renameDevice(req.auth!.fid, req.params.id, label);
  await recordAudit({
    familyId: req.auth!.fid,
    actorId: req.auth!.sub,
    kind: "DEVICE_RENAMED",
    targetType: "EnrolledDevice",
    targetId: req.params.id,
    payload: { label },
  });
  res.json({ ok: true });
});

familyRouter.post("/devices/:id/revoke", requireRole("PARENT"), async (req, res) => {
  if (!env.DEVICE_PAIRING_ENABLED) throw HttpError.notFound("Feature disabled");
  await revokeDevice(req.auth!.fid, req.params.id, req.auth!.sub);
  await recordAudit({
    familyId: req.auth!.fid,
    actorId: req.auth!.sub,
    kind: "DEVICE_REVOKED",
    targetType: "EnrolledDevice",
    targetId: req.params.id,
  });
  res.json({ ok: true });
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
