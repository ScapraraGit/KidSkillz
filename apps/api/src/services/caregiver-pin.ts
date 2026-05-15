import { prisma } from "../db.js";
import { HttpError } from "../errors.js";
import { hashToken } from "../lib/invitations.js";

export interface RedeemCaregiverPinInput {
  familyId: string;
  pin: string;
  name?: string | null;
}

/**
 * Validates a CAREGIVER_PIN invitation against the given family + raw PIN,
 * creates the caregiver User row and marks the invitation accepted. Throws
 * 401 on miss / expiry. Returns the new User.
 *
 * Single point of truth so both legacy `/v1/invitations/pin-login` (familyId
 * from body, looked up via /families/lookup) and device-scoped
 * `/v1/auth/caregiver/pin-login` (familyId from device token) share the same
 * check + side effects.
 */
export async function redeemCaregiverPin(input: RedeemCaregiverPinInput) {
  const hash = hashToken(input.pin);
  const inv = await prisma.invitation.findFirst({
    where: {
      familyId: input.familyId,
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

  return prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        familyId: input.familyId,
        role: "CAREGIVER",
        name: input.name ?? inv.inviteeName ?? "Caregiver",
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
}
