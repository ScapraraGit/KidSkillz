import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { hashPassword, comparePassword } from "../lib/auth.js";
import { mintAccessToken } from "../lib/active-family.js";
import { serializeUser } from "./auth.js";
import {
  DEFAULT_CAREGIVER_SCOPE,
  generateInvitationToken,
  generatePin,
  hashToken,
  type CaregiverScope,
} from "../lib/invitations.js";
import { sendInvitationEmail } from "../lib/email.js";
import { env } from "../env.js";
import type { Request } from "express";
import { redeemCaregiverPin } from "../services/caregiver-pin.js";

export const invitationsRouter = Router();

// Prefer the browser-supplied Origin (matches the domain the parent is on),
// fall back to a configured APP_URL for non-browser callers / cron / tests.
function resolveAppUrl(req: Request): string {
  const origin = req.header("origin");
  if (origin && /^https?:\/\//.test(origin)) return origin.replace(/\/$/, "");
  return env.APP_URL.replace(/\/$/, "");
}

const scopeSchema = z.object({
  canApproveTasks: z.boolean(),
  canApproveRedemptions: z.boolean(),
  canApproveInitiatives: z.boolean(),
  canViewLedger: z.boolean(),
  kidIds: z.array(z.string().uuid()),
});

const createCoParentSchema = z.object({
  kind: z.literal("CO_PARENT"),
  email: z.string().email(),
  inviteeName: z.string().trim().min(1).max(80).optional(),
});

const createCaregiverEmailSchema = z.object({
  kind: z.literal("CAREGIVER"),
  email: z.string().email(),
  inviteeName: z.string().trim().min(1).max(80),
  validFrom: z.string().datetime(),
  validUntil: z.string().datetime(),
  scope: scopeSchema.optional(),
});

const createCaregiverPinSchema = z.object({
  kind: z.literal("CAREGIVER_PIN"),
  inviteeName: z.string().trim().min(1).max(80),
  validUntil: z.string().datetime().optional(), // default +24h
  scope: scopeSchema.optional(),
});

const createSchema = z.discriminatedUnion("kind", [
  createCoParentSchema,
  createCaregiverEmailSchema,
  createCaregiverPinSchema,
]);

// Auth is applied per-route below. The /by-token/* and /pin-login routes are
// intentionally public — the invite token (or PIN) in the URL/body is the
// credential. A router-wide `requireAuth` here would 401 the invite-accept
// flow because the invitee hasn't logged in yet.

// List pending invitations for the family.
invitationsRouter.get("/", requireAuth, requireRole("PARENT"), async (req, res) => {
  const rows = await prisma.invitation.findMany({
    where: { familyId: req.auth!.fid },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json({ invitations: rows.map(serializeInvitation) });
});

// Create invitation. Parent only.
invitationsRouter.post("/", requireAuth, requireRole("PARENT"), async (req, res) => {
  const body = createSchema.parse(req.body);
  const familyId = req.auth!.fid;
  const createdById = req.auth!.sub;

  const family = await prisma.family.findUnique({ where: { id: familyId } });
  if (!family) throw HttpError.notFound("Family");
  const inviter = await prisma.user.findUnique({ where: { id: createdById } });
  if (!inviter) throw HttpError.unauthorized();

  if (body.kind === "CAREGIVER_PIN") {
    const { raw: pin, hash } = generatePin(6);
    const validUntil = body.validUntil ? new Date(body.validUntil) : new Date(Date.now() + 24 * 3600_000);
    const inv = await prisma.invitation.create({
      data: {
        familyId,
        kind: "CAREGIVER_PIN",
        tokenHash: hash,
        expiresAt: validUntil,
        validFrom: new Date(),
        validUntil,
        inviteeName: body.inviteeName,
        scope: (body.scope ?? DEFAULT_CAREGIVER_SCOPE) as object,
        createdById,
      },
    });
    // PIN returned ONCE to parent. Not stored raw.
    res.status(201).json({ invitation: serializeInvitation(inv), pin });
    return;
  }

  const { raw: token, hash } = generateInvitationToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600_000);

  const data = {
    familyId,
    kind: body.kind,
    tokenHash: hash,
    expiresAt,
    email: body.email.toLowerCase(),
    inviteeName: body.inviteeName,
    createdById,
    ...(body.kind === "CAREGIVER" && {
      validFrom: new Date(body.validFrom),
      validUntil: new Date(body.validUntil),
      scope: (body.scope ?? DEFAULT_CAREGIVER_SCOPE) as object,
    }),
  };

  const inv = await prisma.invitation.create({ data });
  const acceptUrl = `${resolveAppUrl(req)}/invite/${token}`;
  await sendInvitationEmail({
    to: data.email,
    inviterName: inviter.name,
    familyName: family.name,
    acceptUrl,
    kind: body.kind,
    validFrom: data.validFrom ?? null,
    validUntil: data.validUntil ?? null,
  });

  // acceptUrl returned for parent UI to show ("share manually if needed") in v1.
  res.status(201).json({ invitation: serializeInvitation(inv), acceptUrl });
});

// Preview invitation by raw token (unauthenticated — used by accept page).
invitationsRouter.get("/by-token/:token", async (req, res) => {
  const inv = await findActiveByToken(req.params.token);
  if (!inv) throw HttpError.notFound("Invitation");
  if (inv.kind === "CAREGIVER_PIN") throw HttpError.notFound("Invitation");
  const family = await prisma.family.findUnique({ where: { id: inv.familyId }, select: { name: true } });
  res.json({
    kind: inv.kind,
    familyName: family?.name ?? null,
    email: inv.email,
    inviteeName: inv.inviteeName,
    validFrom: inv.validFrom?.toISOString() ?? null,
    validUntil: inv.validUntil?.toISOString() ?? null,
    expiresAt: inv.expiresAt.toISOString(),
  });
});

const acceptSchema = z.object({
  name: z.string().trim().min(1).max(80),
  password: z.string().min(8).max(128),
});

// Accept email invitation (CO_PARENT or CAREGIVER). Unauthenticated.
//
// Two paths:
//  - Email not registered → create new User + FamilyMembership in the invited family.
//  - Email already registered → password must match the existing account;
//    we create a FamilyMembership in the new family without creating a duplicate
//    User. This is the divorced-co-parent path (plans/08-multi-family-membership.md).
//    Returning 409 here would force the user to use a different email per family,
//    which is exactly what the multi-family work removes.
invitationsRouter.post("/by-token/:token/accept", async (req, res) => {
  const { name, password } = acceptSchema.parse(req.body);
  const inv = await findActiveByToken(req.params.token);
  if (!inv) throw HttpError.notFound("Invitation");
  if (inv.kind === "CAREGIVER_PIN") throw HttpError.badRequest("Use PIN login instead");
  if (!inv.email) throw HttpError.badRequest("Invitation missing email");

  const role = inv.kind === "CO_PARENT" ? "PARENT" : "CAREGIVER";
  const existing = await prisma.user.findUnique({ where: { email: inv.email } });

  let userId: string;
  let membershipId: string;

  if (existing) {
    // Identity reuse: existing account joins this family as a new membership.
    // We require the existing password (NOT the one supplied in the accept form
    // beyond verification) so a stolen invite link can't grant access to a
    // different family for an account the attacker doesn't control.
    if (!existing.passwordHash || !(await comparePassword(password, existing.passwordHash))) {
      throw HttpError.unauthorized(
        "Email already registered — sign in with your existing password to join this family",
      );
    }
    if (!existing.isActive) throw HttpError.forbidden("Account inactive");
    // Prevent dup memberships when the same person re-accepts an invite.
    const dup = await prisma.familyMembership.findUnique({
      where: { userId_familyId: { userId: existing.id, familyId: inv.familyId } },
    });
    if (dup) throw HttpError.conflict("You're already a member of this family");

    const result = await prisma.$transaction(async (tx) => {
      const m = await tx.familyMembership.create({
        data: {
          userId: existing.id,
          familyId: inv.familyId,
          role: role === "PARENT" ? "PARENT" : "CAREGIVER",
          invitedById: inv.createdById,
          ...(role === "CAREGIVER" && {
            validFrom: inv.validFrom,
            validUntil: inv.validUntil,
            scope: inv.scope ?? undefined,
          }),
        },
      });
      await tx.invitation.update({
        where: { id: inv.id },
        data: { status: "ACCEPTED", acceptedAt: new Date(), acceptedById: existing.id },
      });
      return m;
    });
    userId = existing.id;
    membershipId = result.id;
  } else {
    const passwordHash = await hashPassword(password);
    const result = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          // Adult identity rows hold no familyId; FamilyMembership (next) owns it.
          role,
          name,
          email: inv.email!,
          passwordHash,
          avatarColor: role === "CAREGIVER" ? "#f59e0b" : "#2563eb",
          invitedById: inv.createdById,
        },
      });
      const m = await tx.familyMembership.create({
        data: {
          userId: u.id,
          familyId: inv.familyId,
          role: role === "PARENT" ? "PARENT" : "CAREGIVER",
          invitedById: inv.createdById,
          ...(role === "CAREGIVER" && {
            validFrom: inv.validFrom,
            validUntil: inv.validUntil,
            scope: inv.scope ?? undefined,
          }),
        },
      });
      await tx.invitation.update({
        where: { id: inv.id },
        data: { status: "ACCEPTED", acceptedAt: new Date(), acceptedById: u.id },
      });
      return { u, m };
    });
    userId = result.u.id;
    membershipId = result.m.id;
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const token = mintAccessToken({ user, familyId: inv.familyId, membershipId });
  res.json({ token, user: serializeUser(user) });
});

const pinLoginSchema = z.object({
  familyId: z.string().uuid(),
  pin: z.string().regex(/^\d{4,8}$/),
  name: z.string().trim().min(1).max(80).optional(),
});

// Legacy caregiver PIN login (familyId in body). Kept for back-compat with
// any client still using the `/families/lookup` -> `/invitations/pin-login`
// flow. New clients on a paired device should use `/v1/auth/caregiver/pin-login`.
//
// When DEVICE_PAIRING_ENABLED is on this legacy route refuses the request so
// caregivers funnel through the device-scoped path.
invitationsRouter.post("/pin-login", async (req, res) => {
  if (env.DEVICE_PAIRING_ENABLED) {
    throw HttpError.notFound("Legacy caregiver login disabled — pair the device first");
  }
  const { familyId, pin, name } = pinLoginSchema.parse(req.body);
  const { user, membership } = await redeemCaregiverPin({ familyId, pin, name });
  const token = mintAccessToken({
    user,
    familyId: membership.familyId,
    membershipId: membership.id,
  });
  res.json({ token, user: serializeUser(user) });
});

// Revoke pending invitation.
invitationsRouter.delete("/:id", requireAuth, requireRole("PARENT"), async (req, res) => {
  const inv = await prisma.invitation.findUnique({ where: { id: req.params.id } });
  if (!inv || inv.familyId !== req.auth!.fid) throw HttpError.notFound("Invitation");
  if (inv.status !== "PENDING") throw HttpError.badRequest("Invitation no longer pending");
  await prisma.invitation.update({ where: { id: inv.id }, data: { status: "REVOKED" } });
  res.json({ ok: true });
});

async function findActiveByToken(rawToken: string) {
  const hash = hashToken(rawToken);
  const inv = await prisma.invitation.findUnique({ where: { tokenHash: hash } });
  if (!inv) return null;
  if (inv.status !== "PENDING") return null;
  if (inv.expiresAt < new Date()) {
    await prisma.invitation.update({ where: { id: inv.id }, data: { status: "EXPIRED" } });
    return null;
  }
  return inv;
}

function serializeInvitation(inv: import("@prisma/client").Invitation) {
  return {
    id: inv.id,
    kind: inv.kind,
    status: inv.status,
    email: inv.email,
    inviteeName: inv.inviteeName,
    validFrom: inv.validFrom?.toISOString() ?? null,
    validUntil: inv.validUntil?.toISOString() ?? null,
    expiresAt: inv.expiresAt.toISOString(),
    createdAt: inv.createdAt.toISOString(),
    acceptedAt: inv.acceptedAt?.toISOString() ?? null,
  };
}
