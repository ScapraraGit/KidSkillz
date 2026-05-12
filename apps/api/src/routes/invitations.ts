import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { hashPassword, signToken } from "../lib/auth.js";
import {
  DEFAULT_CAREGIVER_SCOPE,
  generateInvitationToken,
  generatePin,
  hashToken,
  type CaregiverScope,
} from "../lib/invitations.js";
import { sendInvitationEmail } from "../lib/email.js";
import { env } from "../env.js";

export const invitationsRouter = Router();

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

invitationsRouter.use(requireAuth);

// List pending invitations for the family.
invitationsRouter.get("/", requireRole("PARENT"), async (req, res) => {
  const rows = await prisma.invitation.findMany({
    where: { familyId: req.auth!.fid },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json({ invitations: rows.map(serializeInvitation) });
});

// Create invitation. Parent only.
invitationsRouter.post("/", requireRole("PARENT"), async (req, res) => {
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
  const acceptUrl = `${env.APP_URL}/invite/${token}`;
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
invitationsRouter.post("/by-token/:token/accept", async (req, res) => {
  const { name, password } = acceptSchema.parse(req.body);
  const inv = await findActiveByToken(req.params.token);
  if (!inv) throw HttpError.notFound("Invitation");
  if (inv.kind === "CAREGIVER_PIN") throw HttpError.badRequest("Use PIN login instead");
  if (!inv.email) throw HttpError.badRequest("Invitation missing email");

  const existing = await prisma.user.findUnique({ where: { email: inv.email } });
  if (existing) throw HttpError.conflict("Email already in use");

  const passwordHash = await hashPassword(password);
  const role = inv.kind === "CO_PARENT" ? "PARENT" : "CAREGIVER";

  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        familyId: inv.familyId,
        role,
        name,
        email: inv.email!,
        passwordHash,
        avatarColor: role === "CAREGIVER" ? "#f59e0b" : "#2563eb",
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
    return u;
  });

  const token = signToken({ sub: user.id, fid: user.familyId, role: user.role });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

const pinLoginSchema = z.object({
  familyId: z.string().uuid(),
  pin: z.string().regex(/^\d{4,8}$/),
  name: z.string().trim().min(1).max(80).optional(),
});

// Caregiver PIN login. Creates a short-lived caregiver User row + JWT.
invitationsRouter.post("/pin-login", async (req, res) => {
  const { familyId, pin, name } = pinLoginSchema.parse(req.body);
  const hash = hashToken(pin);
  const inv = await prisma.invitation.findFirst({
    where: {
      familyId,
      kind: "CAREGIVER_PIN",
      tokenHash: hash,
      status: "PENDING",
    },
  });
  if (!inv) throw HttpError.unauthorized("Invalid PIN");
  const now = new Date();
  if (inv.expiresAt < now) {
    await prisma.invitation.update({ where: { id: inv.id }, data: { status: "EXPIRED" } });
    throw HttpError.unauthorized("PIN expired");
  }

  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        familyId,
        role: "CAREGIVER",
        name: name ?? inv.inviteeName ?? "Caregiver",
        avatarColor: "#f59e0b",
        validFrom: inv.validFrom ?? now,
        validUntil: inv.validUntil ?? inv.expiresAt,
        scope: inv.scope ?? undefined,
        invitedById: inv.createdById,
      },
    });
    await tx.invitation.update({
      where: { id: inv.id },
      data: { status: "ACCEPTED", acceptedAt: now, acceptedById: u.id },
    });
    return u;
  });

  const token = signToken({ sub: user.id, fid: user.familyId, role: user.role });
  res.json({
    token,
    user: { id: user.id, name: user.name, role: user.role, validUntil: user.validUntil?.toISOString() ?? null },
  });
});

// Revoke pending invitation.
invitationsRouter.delete("/:id", requireRole("PARENT"), async (req, res) => {
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
