import { prisma } from "../db.js";
import { env } from "../env.js";
import { HttpError } from "../errors.js";
import { generateRawToken, hashToken, tokenMatches } from "../lib/tokens.js";
import { sendPasswordResetEmail, sendVerificationEmail } from "../lib/email.js";
import { hashPassword } from "../lib/auth.js";
import { checkPassword } from "../lib/password-policy.js";

const VERIFY_TTL_MS = 24 * 3600_000; // 24h
const RESET_TTL_MS = 60 * 60_000; // 1h

export async function issueVerificationEmail(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw HttpError.notFound("User not found");
  if (!user.email) throw HttpError.badRequest("User has no email on file");
  if (user.emailVerifiedAt) return; // already verified — no-op

  // Invalidate prior unconsumed tokens for this email; one live link at a time.
  await prisma.emailVerification.updateMany({
    where: { userId, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });

  const raw = generateRawToken();
  await prisma.emailVerification.create({
    data: {
      userId,
      email: user.email,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
    },
  });

  const verifyUrl = `${env.APP_URL}/verify-email?token=${encodeURIComponent(raw)}`;
  await sendVerificationEmail({ to: user.email, verifyUrl });
}

export async function consumeVerificationToken(raw: string): Promise<{ userId: string }> {
  const tokenHash = hashToken(raw);
  const rec = await prisma.emailVerification.findUnique({ where: { tokenHash } });
  if (!rec || rec.consumedAt || rec.expiresAt < new Date()) {
    throw HttpError.badRequest("Invalid or expired verification link", "INVALID_TOKEN");
  }
  // Defense in depth: re-confirm with constant-time compare (no-op extra cost).
  if (!tokenMatches(raw, rec.tokenHash)) throw HttpError.badRequest("Invalid token", "INVALID_TOKEN");

  const user = await prisma.user.findUnique({ where: { id: rec.userId } });
  if (!user || user.email !== rec.email) {
    // Email changed after token issued → invalidate.
    throw HttpError.badRequest("Verification link no longer matches the account email", "STALE_TOKEN");
  }

  await prisma.$transaction([
    prisma.emailVerification.update({ where: { id: rec.id }, data: { consumedAt: new Date() } }),
    prisma.user.update({ where: { id: rec.userId }, data: { emailVerifiedAt: new Date() } }),
  ]);

  return { userId: rec.userId };
}

export async function issuePasswordReset(email: string): Promise<void> {
  // Always return success-shape to the caller; here we just no-op silently
  // when the email doesn't map to an account, to prevent enumeration.
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) return;

  await prisma.passwordReset.updateMany({
    where: { userId: user.id, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });

  const raw = generateRawToken();
  await prisma.passwordReset.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    },
  });

  const resetUrl = `${env.APP_URL}/reset-password?token=${encodeURIComponent(raw)}`;
  // Swallow send errors. Caller always responds 200 to prevent account
  // enumeration; a 500 from the email provider would leak the existence of
  // a matching account vs. the silent no-op above for unknown emails. Log
  // loudly so prod failures are still investigable.
  try {
    await sendPasswordResetEmail({ to: user.email!, resetUrl });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[auth:forgot-password] email send failed", { userId: user.id, err: e });
  }
}

export async function consumePasswordReset(raw: string, newPassword: string): Promise<{ userId: string }> {
  if (newPassword.length < 8 || newPassword.length > 128) {
    throw HttpError.badRequest("Password must be 8–128 characters");
  }
  const tokenHash = hashToken(raw);
  const rec = await prisma.passwordReset.findUnique({ where: { tokenHash } });
  if (!rec || rec.consumedAt || rec.expiresAt < new Date()) {
    throw HttpError.badRequest("Invalid or expired reset link", "INVALID_TOKEN");
  }
  if (!tokenMatches(raw, rec.tokenHash)) throw HttpError.badRequest("Invalid token", "INVALID_TOKEN");

  // Strength check needs the user's email/name to penalise self-derived passwords.
  const target = await prisma.user.findUnique({
    where: { id: rec.userId },
    select: { email: true, name: true },
  });
  const pw = checkPassword(newPassword, [target?.email ?? "", target?.name ?? ""]);
  if (!pw.ok) throw HttpError.badRequest(pw.reason ?? "Weak password", "WEAK_PASSWORD");

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.passwordReset.update({ where: { id: rec.id }, data: { consumedAt: new Date() } }),
    prisma.user.update({ where: { id: rec.userId }, data: { passwordHash } }),
    // Invalidate every other unused reset token for this user as well.
    prisma.passwordReset.updateMany({
      where: { userId: rec.userId, id: { not: rec.id }, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
  ]);

  return { userId: rec.userId };
}
