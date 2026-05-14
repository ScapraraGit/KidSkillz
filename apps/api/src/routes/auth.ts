import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { comparePassword, hashPassword, signToken } from "../lib/auth.js";
import { HttpError } from "../errors.js";
import { requireAuth } from "../middleware/auth.js";
import { getFamilySettings } from "../services/family.js";
import { features } from "../lib/features.js";
import { seedDefaultChallenges } from "../services/challenges.js";
import { seedDefaultCategories } from "../services/task-categories.js";
import { seedDefaultRewards, seedDefaultTasks } from "../services/seed-defaults.js";
import {
  consumePasswordReset,
  consumeVerificationToken,
  issuePasswordReset,
  issueVerificationEmail,
} from "../services/auth-tokens.js";
import { avatarConfigSchema } from "./children.js";
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  DEFAULT_FAMILY_SETTINGS,
  type AvatarConfig,
} from "@chorechampz/shared";
import { clientIpFrom, recordLegalAcceptance, userAgentFrom } from "../services/legal-acceptance.js";

export const authRouter = Router();

const parentRegisterSchema = z.object({
  familyName: z.string().trim().min(2).max(80),
  parentName: z.string().trim().min(1).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  acceptedTermsVersion: z.number().int().positive(),
});

authRouter.post("/parent/register", async (req, res) => {
  const { familyName, parentName, email, password, acceptedTermsVersion } = parentRegisterSchema.parse(
    req.body,
  );
  if (acceptedTermsVersion < CURRENT_TERMS_VERSION) {
    throw HttpError.badRequest("Please accept the latest Terms of Service", "TERMS_OUTDATED");
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw HttpError.badRequest("Email already in use");
  const passwordHash = await hashPassword(password);
  const family = await prisma.family.create({
    data: {
      name: familyName,
      settings: { ...DEFAULT_FAMILY_SETTINGS } as object,
    },
  });
  await seedDefaultChallenges(family.id);
  await seedDefaultCategories(family.id);
  // Starter tasks reference category IDs, so they must run after categories seed.
  await seedDefaultTasks(family.id);
  await seedDefaultRewards(family.id);
  const user = await prisma.user.create({
    data: {
      familyId: family.id,
      role: "PARENT",
      name: parentName,
      email,
      passwordHash,
      avatarColor: "#2563eb",
      acceptedTermsVersion,
      acceptedTermsAt: new Date(),
    },
  });
  const ip = clientIpFrom(req);
  const ua = userAgentFrom(req);
  await recordLegalAcceptance({
    userId: user.id,
    familyId: family.id,
    kind: "TERMS",
    version: acceptedTermsVersion,
    ipAddress: ip,
    userAgent: ua,
    context: "signup",
  }).catch((e) => console.error("[legal:accept terms]", e));
  await recordLegalAcceptance({
    userId: user.id,
    familyId: family.id,
    kind: "PRIVACY",
    version: CURRENT_PRIVACY_VERSION,
    ipAddress: ip,
    userAgent: ua,
    context: "signup",
  }).catch((e) => console.error("[legal:accept privacy]", e));
  // Fire-and-forget verification email; failures don't block registration.
  await issueVerificationEmail(user.id).catch((e) => console.error("[verify:send]", e));
  const token = signToken({ sub: user.id, fid: user.familyId, role: user.role, adm: user.isAdmin });
  res.json({ token, user: serializeUser(user) });
});

const parentLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post("/parent/login", async (req, res) => {
  const { email, password } = parentLoginSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.role !== "PARENT" || !user.passwordHash)
    throw HttpError.unauthorized("Invalid credentials");
  if (!user.isActive) throw HttpError.forbidden("Account is inactive");
  const ok = await comparePassword(password, user.passwordHash);
  if (!ok) throw HttpError.unauthorized("Invalid credentials");
  const token = signToken({ sub: user.id, fid: user.familyId, role: user.role, adm: user.isAdmin });
  res.json({ token, user: serializeUser(user) });
});

const childLoginSchema = z.object({
  childId: z.string().uuid(),
  pin: z
    .string()
    .regex(/^\d{4,8}$/)
    .optional(),
  familyPassword: z.string().optional(),
});

authRouter.post("/child/login", async (req, res) => {
  const { childId, pin, familyPassword } = childLoginSchema.parse(req.body);
  const child = await prisma.user.findUnique({ where: { id: childId }, include: { family: true } });
  if (!child || child.role !== "CHILD" || !child.isActive)
    throw HttpError.unauthorized("Invalid credentials");
  const settings = await getFamilySettings(child.familyId);

  if (settings.childAuthMode === "INDIVIDUAL") {
    if (!pin || child.pin !== pin) throw HttpError.unauthorized("Invalid PIN");
  } else {
    // SHARED_DEVICE: any parent's password unlocks the device + child profile pick
    if (!familyPassword) throw HttpError.unauthorized("Family password required");
    const parents = await prisma.user.findMany({
      where: { familyId: child.familyId, role: "PARENT", isActive: true },
    });
    let ok = false;
    for (const p of parents) {
      if (p.passwordHash && (await comparePassword(familyPassword, p.passwordHash))) {
        ok = true;
        break;
      }
    }
    if (!ok) throw HttpError.unauthorized("Invalid family password");
  }

  const token = signToken({ sub: child.id, fid: child.familyId, role: child.role });
  res.json({ token, user: serializeUser(child) });
});

authRouter.get("/families/lookup", async (req, res) => {
  // For shared-device login screen: list children for a known family.
  // In a real app this would be gated by the device having been unlocked.
  // POC: list non-sensitive child profiles by family name for the demo seed.
  const name = (req.query.name as string | undefined)?.trim();
  if (!name) return res.json({ families: [] });
  const families = await prisma.family.findMany({
    where: { name: { contains: name, mode: "insensitive" } },
    select: {
      id: true,
      name: true,
      settings: true,
      users: {
        where: { role: "CHILD", isActive: true },
        select: { id: true, name: true, avatarColor: true, avatarConfig: true },
      },
    },
  });
  res.json({ families });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.auth!.sub } });
  if (!user) throw HttpError.unauthorized();
  const settings = await getFamilySettings(user.familyId);
  res.json({
    user: serializeUser(user),
    settings,
    needsOnboarding: user.onboardedAt == null,
    features: { photoProof: features.photoProof },
  });
});

authRouter.post("/onboarded", requireAuth, async (req, res) => {
  const user = await prisma.user.update({
    where: { id: req.auth!.sub },
    data: { onboardedAt: new Date() },
  });
  res.json({ user: serializeUser(user) });
});

const updateAvatarSchema = z.object({
  avatarColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  avatarConfig: avatarConfigSchema.nullable().optional(),
});

authRouter.patch("/me/avatar", requireAuth, async (req, res) => {
  const input = updateAvatarSchema.parse(req.body);
  if (input.avatarColor === undefined && input.avatarConfig === undefined) {
    throw HttpError.badRequest("Nothing to update");
  }
  const user = await prisma.user.update({
    where: { id: req.auth!.sub },
    data: {
      ...(input.avatarColor !== undefined && { avatarColor: input.avatarColor }),
      ...(input.avatarConfig !== undefined && {
        avatarConfig: input.avatarConfig === null ? Prisma.JsonNull : (input.avatarConfig as object),
      }),
    },
  });
  res.json({ user: serializeUser(user) });
});

// --- Email verification + password reset ---

const verifySchema = z.object({ token: z.string().min(10).max(512) });

authRouter.post("/verify-email", async (req, res) => {
  const { token } = verifySchema.parse(req.body);
  await consumeVerificationToken(token);
  res.json({ ok: true });
});

authRouter.post("/verify-email/resend", requireAuth, async (req, res) => {
  await issueVerificationEmail(req.auth!.sub);
  res.json({ ok: true });
});

const forgotSchema = z.object({ email: z.string().email() });

authRouter.post("/forgot-password", async (req, res) => {
  const { email } = forgotSchema.parse(req.body);
  await issuePasswordReset(email);
  // Always 200, no enumeration leak.
  res.json({ ok: true });
});

const resetSchema = z.object({
  token: z.string().min(10).max(512),
  password: z.string().min(8).max(128),
});

authRouter.post("/reset-password", async (req, res) => {
  const { token, password } = resetSchema.parse(req.body);
  await consumePasswordReset(token, password);
  res.json({ ok: true });
});

// --- Terms acceptance for existing accounts whose accepted version is stale ---

const acceptTermsSchema = z.object({ version: z.number().int().positive() });

authRouter.post("/accept-terms", requireAuth, async (req, res) => {
  const { version } = acceptTermsSchema.parse(req.body);
  if (version < CURRENT_TERMS_VERSION) {
    throw HttpError.badRequest("Outdated terms version", "TERMS_OUTDATED");
  }
  const user = await prisma.user.update({
    where: { id: req.auth!.sub },
    data: { acceptedTermsVersion: version, acceptedTermsAt: new Date() },
  });
  const ip = clientIpFrom(req);
  const ua = userAgentFrom(req);
  await recordLegalAcceptance({
    userId: user.id,
    familyId: user.familyId,
    kind: "TERMS",
    version,
    ipAddress: ip,
    userAgent: ua,
    context: "re-accept",
  }).catch((e) => console.error("[legal:accept terms re]", e));
  await recordLegalAcceptance({
    userId: user.id,
    familyId: user.familyId,
    kind: "PRIVACY",
    version: CURRENT_PRIVACY_VERSION,
    ipAddress: ip,
    userAgent: ua,
    context: "re-accept",
  }).catch((e) => console.error("[legal:accept privacy re]", e));
  res.json({ user: serializeUser(user) });
});

const legalAcceptSchema = z.object({
  kind: z.enum(["TERMS", "PRIVACY", "CHILD_PROFILE_CONSENT", "UPLOAD_ACK"]),
  version: z.number().int().positive(),
  subjectChildId: z.string().uuid().nullable().optional(),
  context: z.string().max(120).nullable().optional(),
});

authRouter.post("/legal/accept", requireAuth, async (req, res) => {
  const input = legalAcceptSchema.parse(req.body);
  if (req.auth!.role !== "PARENT" && req.auth!.role !== "CAREGIVER") {
    throw HttpError.forbidden("Only parents can record legal acceptance");
  }
  const event = await recordLegalAcceptance({
    userId: req.auth!.sub,
    familyId: req.auth!.fid,
    kind: input.kind,
    version: input.version,
    subjectChildId: input.subjectChildId ?? null,
    ipAddress: clientIpFrom(req),
    userAgent: userAgentFrom(req),
    context: input.context ?? null,
  });
  res.json({ id: event.id, createdAt: event.createdAt.toISOString() });
});

export function serializeUser(u: import("@prisma/client").User) {
  return {
    id: u.id,
    familyId: u.familyId,
    role: u.role,
    name: u.name,
    email: u.email,
    avatarColor: u.avatarColor,
    avatarConfig: (u.avatarConfig as AvatarConfig | null) ?? null,
    onboardedAt: u.onboardedAt?.toISOString() ?? null,
    validUntil: u.validUntil?.toISOString() ?? null,
    emailVerifiedAt: u.emailVerifiedAt?.toISOString() ?? null,
    acceptedTermsVersion: u.acceptedTermsVersion ?? null,
    acceptedTermsAt: u.acceptedTermsAt?.toISOString() ?? null,
    isAdmin: u.isAdmin,
  };
}
