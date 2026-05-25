import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { comparePassword, hashPassword, signToken, verifyToken } from "../lib/auth.js";
import { listAuthFamilies, mintAccessToken, resolveActiveFamily } from "../lib/active-family.js";
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
import { assertPinNotLocked, recordPinAttempt } from "../services/child-auth.js";
import { recordAudit } from "../services/audit.js";
import { lookupRateLimiter } from "../middleware/lookup-rate-limit.js";
import { requireTurnstile } from "../middleware/turnstile.js";
import { requireDeviceToken } from "../middleware/device.js";
import { findActiveDeviceByToken, redeemEnrollment } from "../services/device-pairing.js";
import { env } from "../env.js";
import { checkPassword } from "../lib/password-policy.js";
import { redeemCaregiverPin } from "../services/caregiver-pin.js";
import {
  bumpTokenVersionAndRevokeAll,
  clientIpFromReq,
  issueRefreshToken,
  revokeRefreshToken,
  rotateRefreshToken,
} from "../services/refresh-tokens.js";
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  DEFAULT_FAMILY_SETTINGS,
  type AvatarConfig,
} from "@chorechampz/shared";
import { clientIpFrom, recordLegalAcceptance, userAgentFrom } from "../services/legal-acceptance.js";
import { startTrial } from "../services/billing.js";

export const authRouter = Router();

const parentRegisterSchema = z.object({
  familyName: z.string().trim().min(2).max(80),
  parentName: z.string().trim().min(1).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  acceptedTermsVersion: z.number().int().positive(),
});

authRouter.post("/parent/register", requireTurnstile, async (req, res) => {
  const { familyName, parentName, email, password, acceptedTermsVersion } = parentRegisterSchema.parse(
    req.body,
  );
  if (acceptedTermsVersion < CURRENT_TERMS_VERSION) {
    throw HttpError.badRequest("Please accept the latest Terms of Service", "TERMS_OUTDATED");
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw HttpError.badRequest("Email already in use");
  const pw = checkPassword(password, [email, parentName, familyName]);
  if (!pw.ok) throw HttpError.badRequest(pw.reason ?? "Weak password", "WEAK_PASSWORD");
  const passwordHash = await hashPassword(password);
  const family = await prisma.family.create({
    data: {
      name: familyName,
      settings: { ...DEFAULT_FAMILY_SETTINGS } as object,
    },
  });
  // Initialize trial window. No Stripe API call — customer created lazily on
  // first checkout. Safe to run unconditionally; respects BILLING_TRIAL_DAYS.
  await startTrial(family.id).catch((e) => console.error("[billing:startTrial]", e));
  await seedDefaultChallenges(family.id);
  await seedDefaultCategories(family.id);
  // Starter tasks reference category IDs, so they must run after categories seed.
  await seedDefaultTasks(family.id);
  await seedDefaultRewards(family.id);
  const user = await prisma.user.create({
    data: {
      // PARENT identity rows no longer carry a familyId; their tenant link is
      // FamilyMembership (created immediately below).
      role: "PARENT",
      name: parentName,
      email,
      passwordHash,
      avatarColor: "#2563eb",
      acceptedTermsVersion,
      acceptedTermsAt: new Date(),
    },
  });
  // Founding parent of the family becomes the billing-owner membership. All
  // new flows (PARENT/CAREGIVER) require a FamilyMembership row; legacy
  // single-family code keeps working via the back-compat path in requireAuth.
  const membership = await prisma.familyMembership.create({
    data: {
      userId: user.id,
      familyId: family.id,
      role: "PARENT",
      isBillingOwner: true,
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
  const token = mintAccessToken({ user, familyId: family.id, membershipId: membership.id });
  const refresh = await issueRefreshToken({
    userId: user.id,
    familyMembershipId: membership.id,
    userAgent: req.header("user-agent") ?? null,
    ip: clientIpFromReq(req),
  });
  res.json({
    token,
    refreshToken: refresh.refreshToken,
    refreshExpiresAt: refresh.expiresAt.toISOString(),
    user: serializeUser(user),
  });
});

const parentLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post("/parent/login", async (req, res) => {
  const { email, password } = parentLoginSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  // The role gate (PARENT or CAREGIVER) is intentionally loose so co-parents
  // who hold both PARENT and CAREGIVER memberships across families can sign in
  // through the same form. The active role/family is decided by the chosen
  // membership at select-family time.
  if (!user || !user.passwordHash || (user.role !== "PARENT" && user.role !== "CAREGIVER"))
    throw HttpError.unauthorized("Invalid credentials");
  if (!user.isActive) throw HttpError.forbidden("Account is inactive");
  const ok = await comparePassword(password, user.passwordHash);
  if (!ok) throw HttpError.unauthorized("Invalid credentials");

  const families = await listAuthFamilies(user);
  if (families.length === 0) throw HttpError.forbidden("No active family membership");

  if (families.length > 1) {
    // Issue a single-purpose select token. No fid/mid yet — the caller picks.
    const selectToken = signToken({
      sub: user.id,
      fid: "",
      role: user.role,
      adm: user.isAdmin,
      tv: user.tokenVersion,
      scope: "family-select",
    });
    return res.json({
      needsFamilySelect: true,
      selectToken,
      families: families.map((f) => ({
        familyId: f.id,
        familyName: f.name,
        membershipId: f.membershipId,
        role: f.role,
        isBillingOwner: f.isBillingOwner ?? false,
      })),
    });
  }

  const only = families[0];
  const token = mintAccessToken({
    user,
    familyId: only.id,
    membershipId: only.membershipId ?? undefined,
  });
  const refresh = await issueRefreshToken({
    userId: user.id,
    familyMembershipId: only.membershipId,
    userAgent: req.header("user-agent") ?? null,
    ip: clientIpFromReq(req),
  });
  res.json({
    token,
    refreshToken: refresh.refreshToken,
    refreshExpiresAt: refresh.expiresAt.toISOString(),
    user: serializeUser(user),
  });
});

const selectFamilySchema = z.object({
  selectToken: z.string().min(10).max(4096),
  familyId: z.string().uuid(),
});

authRouter.post("/select-family", async (req, res) => {
  const { selectToken, familyId } = selectFamilySchema.parse(req.body);
  let payload;
  try {
    payload = verifyToken(selectToken);
  } catch {
    throw HttpError.unauthorized("Invalid or expired select token");
  }
  if (payload.scope !== "family-select") throw HttpError.unauthorized("Wrong token scope");
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive) throw HttpError.unauthorized();
  if (payload.tv !== undefined && user.tokenVersion !== payload.tv) {
    throw HttpError.unauthorized("Session ended");
  }
  const { membership, familyId: resolvedFid } = await resolveActiveFamily(user, familyId);
  const token = mintAccessToken({
    user,
    familyId: resolvedFid,
    membershipId: membership?.id,
  });
  const refresh = await issueRefreshToken({
    userId: user.id,
    familyMembershipId: membership?.id,
    userAgent: req.header("user-agent") ?? null,
    ip: clientIpFromReq(req),
  });
  res.json({
    token,
    refreshToken: refresh.refreshToken,
    refreshExpiresAt: refresh.expiresAt.toISOString(),
    user: serializeUser(user),
  });
});

const switchFamilySchema = z.object({
  familyId: z.string().uuid(),
  refreshToken: z.string().min(16).max(1024).optional(),
});

// Authenticated. Revokes the supplied refresh, mints a fresh access + refresh
// pair scoped to the target membership. Frontend should clear its query cache
// after this call.
authRouter.post("/switch-family", requireAuth, async (req, res) => {
  const { familyId, refreshToken } = switchFamilySchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { id: req.auth!.sub } });
  if (!user || !user.isActive) throw HttpError.unauthorized();
  if (user.role === "CHILD") throw HttpError.forbidden("Children cannot switch families");
  const { membership, familyId: resolvedFid } = await resolveActiveFamily(user, familyId);
  if (refreshToken) await revokeRefreshToken(refreshToken);
  const token = mintAccessToken({
    user,
    familyId: resolvedFid,
    membershipId: membership?.id,
  });
  const refresh = await issueRefreshToken({
    userId: user.id,
    familyMembershipId: membership?.id,
    userAgent: req.header("user-agent") ?? null,
    ip: clientIpFromReq(req),
  });
  res.json({
    token,
    refreshToken: refresh.refreshToken,
    refreshExpiresAt: refresh.expiresAt.toISOString(),
    user: serializeUser(user),
  });
});

authRouter.get("/me/families", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.auth!.sub } });
  if (!user) throw HttpError.unauthorized();
  const families = await listAuthFamilies(user);
  res.json({
    activeFamilyId: req.auth!.fid,
    activeMembershipId: req.membership?.id ?? null,
    families: families.map((f) => ({
      familyId: f.id,
      familyName: f.name,
      membershipId: f.membershipId,
      role: f.role,
      isBillingOwner: f.isBillingOwner ?? false,
    })),
  });
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
  if (!child || child.role !== "CHILD" || !child.isActive || !child.familyId || !child.family)
    throw HttpError.unauthorized("Invalid credentials");
  const settings = await getFamilySettings(child.familyId);

  // When device pairing is enabled, every kid login MUST come from a paired
  // device. The device's family must match the child's family so a stolen
  // device token from family A can never authenticate a kid in family B. The
  // legacy `familyPassword` SHARED_DEVICE branch is dead under the flag.
  if (env.DEVICE_PAIRING_ENABLED) {
    const raw = req.header("x-device-token")?.trim();
    if (!raw) throw HttpError.unauthorized("Device not paired");
    const device = await findActiveDeviceByToken(raw);
    if (!device || device.familyId !== child.familyId) {
      throw HttpError.unauthorized("Device not paired");
    }
    if (familyPassword) {
      throw HttpError.badRequest(
        "Legacy familyPassword not accepted on paired devices",
        "LEGACY_AUTH_DISABLED",
      );
    }
  }

  if (settings.childAuthMode === "INDIVIDUAL") {
    await assertPinNotLocked(child.id);
    const ok = !!pin && child.pin === pin;
    const next = await recordPinAttempt(child.id, ok);
    if (!ok) {
      if (next.locked) {
        const seconds = Math.ceil(((next.pinLockedUntil?.getTime() ?? 0) - Date.now()) / 1000);
        throw HttpError.unauthorized(`Too many attempts. Locked for ${seconds}s.`);
      }
      throw HttpError.unauthorized("Invalid PIN");
    }
  } else if (env.DEVICE_PAIRING_ENABLED) {
    // SHARED_DEVICE on a paired device: device token already proved family scope.
    // Per plan, profile selection alone is sufficient (auto-login). The PIN-required
    // path is INDIVIDUAL mode above. Future per-family opt-out (require PIN even
    // in SHARED_DEVICE) lands as a Family.settings flag.
  } else {
    // SHARED_DEVICE: single device-password hash on the family. Constant bcrypt
    // cost regardless of parent count, no parent-count timing leak.
    if (!familyPassword) throw HttpError.unauthorized("Family password required");
    let deviceHash = child.family.devicePasswordHash;
    if (!deviceHash) {
      // Migration: fall back to any parent password ONCE so existing families don't
      // brick at boot. On the first successful match we copy the hash up to
      // Family.devicePasswordHash and prompt parents to set an explicit one.
      // PARENT users no longer carry User.familyId — find them via
      // FamilyMembership scoped to this child's family.
      const parentMemberships = await prisma.familyMembership.findMany({
        where: { familyId: child.familyId, role: "PARENT", status: "ACTIVE" },
        select: { user: { select: { passwordHash: true, isActive: true } } },
      });
      const parents = parentMemberships
        .filter((m) => m.user.isActive)
        .map((m) => ({ passwordHash: m.user.passwordHash }));
      let migrated: string | null = null;
      for (const p of parents) {
        if (p.passwordHash && (await comparePassword(familyPassword, p.passwordHash))) {
          migrated = p.passwordHash;
          break;
        }
      }
      if (!migrated) throw HttpError.unauthorized("Invalid family password");
      await prisma.family.update({
        where: { id: child.familyId },
        data: { devicePasswordHash: migrated },
      });
      deviceHash = migrated;
    } else {
      const ok = await comparePassword(familyPassword, deviceHash);
      if (!ok) throw HttpError.unauthorized("Invalid family password");
    }
  }

  if (!child.familyId) throw HttpError.forbidden("Child has no family");
  const token = mintAccessToken({ user: child, familyId: child.familyId });
  const refresh = await issueRefreshToken({
    userId: child.id,
    userAgent: req.header("user-agent") ?? null,
    ip: clientIpFromReq(req),
  });
  res.json({
    token,
    refreshToken: refresh.refreshToken,
    refreshExpiresAt: refresh.expiresAt.toISOString(),
    user: serializeUser(child),
  });
});

// --- Caregiver PIN login (device-scoped) -------------------------------

const caregiverPinSchema = z.object({
  pin: z.string().regex(/^\d{4,8}$/),
  name: z.string().trim().min(1).max(80).optional(),
});

// Device-scoped caregiver login. The device token supplies the family scope
// (no client-supplied familyId, no /families/lookup), the PIN authenticates.
authRouter.post("/caregiver/pin-login", requireDeviceToken, async (req, res) => {
  if (!env.DEVICE_PAIRING_ENABLED) throw HttpError.notFound("Feature disabled");
  const input = caregiverPinSchema.parse(req.body);
  const { user, membership } = await redeemCaregiverPin({
    familyId: req.device!.familyId,
    pin: input.pin,
    name: input.name,
  });
  const token = mintAccessToken({
    user,
    familyId: membership.familyId,
    membershipId: membership.id,
  });
  const refresh = await issueRefreshToken({
    userId: user.id,
    familyMembershipId: membership.id,
    userAgent: req.header("user-agent") ?? null,
    ip: clientIpFromReq(req),
  });
  res.json({
    token,
    refreshToken: refresh.refreshToken,
    refreshExpiresAt: refresh.expiresAt.toISOString(),
    user: serializeUser(user),
  });
});

// --- Refresh / logout --------------------------------------------------

const refreshSchema = z.object({ refreshToken: z.string().min(16).max(1024) });

authRouter.post("/refresh", async (req, res) => {
  const { refreshToken } = refreshSchema.parse(req.body);
  const r = await rotateRefreshToken(refreshToken, {
    userAgent: req.header("user-agent") ?? null,
    ip: clientIpFromReq(req),
  });
  res.json({
    token: r.accessToken,
    refreshToken: r.refreshToken,
    refreshExpiresAt: r.expiresAt.toISOString(),
  });
});

const logoutSchema = z.object({ refreshToken: z.string().min(1).max(1024).optional() });

authRouter.post("/logout", async (req, res) => {
  const { refreshToken } = logoutSchema.parse(req.body ?? {});
  if (refreshToken) await revokeRefreshToken(refreshToken);
  res.json({ ok: true });
});

authRouter.post("/logout-all", requireAuth, async (req, res) => {
  await bumpTokenVersionAndRevokeAll(req.auth!.sub);
  await recordAudit({
    familyId: req.auth!.fid,
    actorId: req.auth!.sub,
    kind: "LOGOUT_ALL",
    targetType: "User",
    targetId: req.auth!.sub,
  });
  res.json({ ok: true });
});

// --- Device pairing ----------------------------------------------------

const redeemSchema = z
  .object({
    pairingCode: z.string().trim().min(1).max(20).optional(),
    qrNonce: z.string().min(20).max(2000).optional(),
  })
  .refine((v) => v.pairingCode || v.qrNonce, {
    message: "Provide pairingCode or qrNonce",
  });

// Unauth — rate-limited + Turnstile-gated. Returns the raw deviceToken once.
authRouter.post("/devices/redeem", lookupRateLimiter, requireTurnstile, async (req, res) => {
  if (!env.DEVICE_PAIRING_ENABLED) throw HttpError.notFound("Feature disabled");
  const input = redeemSchema.parse(req.body);
  const r = await redeemEnrollment(input);
  await recordAudit({
    familyId: r.familyId,
    actorId: null,
    kind: "DEVICE_REDEEMED",
    targetType: "EnrolledDevice",
    targetId: r.deviceId,
    payload: { label: r.label },
  });
  res.json({
    deviceToken: r.deviceToken,
    deviceId: r.deviceId,
    familyId: r.familyId,
    label: r.label,
  });
});

// Device-scoped: lists kid profiles for the device's family. No JWT needed —
// the device token IS the family-scope credential.
authRouter.get("/device/profiles", requireDeviceToken, async (req, res) => {
  if (!env.DEVICE_PAIRING_ENABLED) throw HttpError.notFound("Feature disabled");
  const kids = await prisma.user.findMany({
    where: { familyId: req.device!.familyId, role: "CHILD", isActive: true },
    select: { id: true, name: true, avatarColor: true, avatarConfig: true },
    orderBy: { name: "asc" },
  });
  res.json({ familyId: req.device!.familyId, kids });
});

const familyLookupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  familyCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{6}$/, "familyCode must be 6 alphanumeric characters"),
});

// Exact-match lookup for shared-device login. Returning the family + child list
// requires both the family display name AND the 6-char familyCode the parent
// shares verbally. Avoids the partial-match enumeration leak the old endpoint had.
authRouter.post("/families/lookup", lookupRateLimiter, requireTurnstile, async (req, res) => {
  const { name, familyCode } = familyLookupSchema.parse(req.body);
  const family = await prisma.family.findFirst({
    where: { familyCode, name: { equals: name, mode: "insensitive" } },
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
  if (!family) {
    // Generic response: never reveal which of name/code was wrong.
    return res.status(404).json({ error: "NOT_FOUND", message: "No matching family" });
  }
  await recordAudit({
    familyId: family.id,
    actorId: null,
    kind: "FAMILY_LOOKUP_HIT",
    targetType: "Family",
    targetId: family.id,
    payload: { ip: clientIpFrom(req) },
  });
  res.json({ family });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.auth!.sub } });
  if (!user) throw HttpError.unauthorized();
  const activeFid = req.auth!.fid;
  const [settings, family] = await Promise.all([
    getFamilySettings(activeFid),
    prisma.family.findUnique({ where: { id: activeFid }, select: { isBeta: true } }),
  ]);
  res.json({
    user: serializeUser(user),
    settings,
    needsOnboarding: user.onboardedAt == null,
    needsHouseholdAck: user.role === "PARENT" && user.householdAckAt == null,
    isBeta: family?.isBeta ?? false,
    features: {
      photoProof: features.photoProof,
      devicePairing: features.devicePairing,
      orgConsentRequired: features.orgConsentRequired,
    },
  });
});

authRouter.post("/onboarded", requireAuth, async (req, res) => {
  const user = await prisma.user.update({
    where: { id: req.auth!.sub },
    data: { onboardedAt: new Date() },
  });
  res.json({ user: serializeUser(user) });
});

authRouter.post("/household-ack", requireAuth, async (req, res) => {
  const userId = req.auth!.sub;
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) throw HttpError.unauthorized();
  if (existing.role !== "PARENT") throw HttpError.forbidden("Parents only");
  const activeFid = req.auth!.fid;
  const ip = clientIpFrom(req);
  const ua = userAgentFrom(req);
  await recordLegalAcceptance({
    userId,
    familyId: activeFid,
    kind: "HOUSEHOLD_TOOL_ACK",
    version: 1,
    ipAddress: ip,
    userAgent: ua,
    context: "post-signup-modal",
  }).catch((e) => console.error("[legal:household-tool-ack]", e));
  await recordLegalAcceptance({
    userId,
    familyId: activeFid,
    kind: "NO_CASH_VALUE_ACK",
    version: 1,
    ipAddress: ip,
    userAgent: ua,
    context: "post-signup-modal",
  }).catch((e) => console.error("[legal:no-cash-value-ack]", e));
  const user = await prisma.user.update({
    where: { id: userId },
    data: { householdAckAt: new Date() },
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

authRouter.post("/forgot-password", requireTurnstile, async (req, res) => {
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
  const activeFid = req.auth!.fid;
  const ip = clientIpFrom(req);
  const ua = userAgentFrom(req);
  await recordLegalAcceptance({
    userId: user.id,
    familyId: activeFid,
    kind: "TERMS",
    version,
    ipAddress: ip,
    userAgent: ua,
    context: "re-accept",
  }).catch((e) => console.error("[legal:accept terms re]", e));
  await recordLegalAcceptance({
    userId: user.id,
    familyId: activeFid,
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
    familyId: u.familyId ?? null,
    role: u.role,
    name: u.name,
    email: u.email,
    avatarColor: u.avatarColor,
    avatarConfig: (u.avatarConfig as AvatarConfig | null) ?? null,
    onboardedAt: u.onboardedAt?.toISOString() ?? null,
    emailVerifiedAt: u.emailVerifiedAt?.toISOString() ?? null,
    acceptedTermsVersion: u.acceptedTermsVersion ?? null,
    acceptedTermsAt: u.acceptedTermsAt?.toISOString() ?? null,
    isAdmin: u.isAdmin,
  };
}
