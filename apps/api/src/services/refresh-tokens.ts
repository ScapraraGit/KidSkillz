import { randomBytes } from "node:crypto";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { HttpError } from "../errors.js";
import { sha256 } from "../lib/pairing-code.js";
import { signToken } from "../lib/auth.js";

const REFRESH_BYTES = 32;
const TTL_MS = () => env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

export interface IssueRefreshInput {
  userId: string;
  userAgent?: string | null;
  ip?: string | null;
}

export interface IssueRefreshResult {
  refreshToken: string;
  expiresAt: Date;
}

export async function issueRefreshToken(input: IssueRefreshInput): Promise<IssueRefreshResult> {
  const raw = randomBytes(REFRESH_BYTES).toString("base64url");
  const expiresAt = new Date(Date.now() + TTL_MS());
  await prisma.refreshToken.create({
    data: {
      userId: input.userId,
      tokenHash: sha256(raw),
      expiresAt,
      userAgent: input.userAgent ?? null,
      ip: input.ip ?? null,
    },
  });
  return { refreshToken: raw, expiresAt };
}

export interface RotateResult {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  user: { id: string; familyId: string; role: string; isAdmin: boolean };
}

/**
 * Validates the supplied refresh token, marks it revoked, mints a successor +
 * a fresh access token. Throws on missing/expired/revoked. A revoked-then-used
 * token is treated as a tripwire: every outstanding refresh token for the user
 * is revoked, forcing a full re-login.
 */
export async function rotateRefreshToken(
  raw: string,
  meta: { userAgent?: string | null; ip?: string | null } = {},
): Promise<RotateResult> {
  if (!raw || raw.length < 16) throw HttpError.unauthorized("Invalid refresh token");
  const tokenHash = sha256(raw);
  const row = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: {
      user: { select: { id: true, familyId: true, role: true, isAdmin: true, tokenVersion: true, isActive: true } },
    },
  });
  if (!row || !row.user) throw HttpError.unauthorized("Refresh token not found");
  if (!row.user.isActive) throw HttpError.forbidden("Account is inactive");

  if (row.revokedAt) {
    // Replay of an already-rotated token. Burn every outstanding refresh row
    // for the user and force re-login.
    await prisma.refreshToken.updateMany({
      where: { userId: row.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw HttpError.unauthorized("Refresh token reused — session terminated");
  }
  if (row.expiresAt.getTime() < Date.now()) {
    throw HttpError.unauthorized("Refresh token expired");
  }

  const newRaw = randomBytes(REFRESH_BYTES).toString("base64url");
  const newExpires = new Date(Date.now() + TTL_MS());
  const successor = await prisma.$transaction(async (tx) => {
    const created = await tx.refreshToken.create({
      data: {
        userId: row.userId,
        tokenHash: sha256(newRaw),
        expiresAt: newExpires,
        userAgent: meta.userAgent ?? null,
        ip: meta.ip ?? null,
      },
    });
    await tx.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date(), replacedById: created.id, lastUsedAt: new Date() },
    });
    return created;
  });

  const access = signToken({
    sub: row.user.id,
    fid: row.user.familyId,
    role: row.user.role,
    adm: row.user.isAdmin,
    tv: row.user.tokenVersion,
  });
  return {
    accessToken: access,
    refreshToken: newRaw,
    expiresAt: successor.expiresAt,
    user: {
      id: row.user.id,
      familyId: row.user.familyId,
      role: row.user.role,
      isAdmin: row.user.isAdmin,
    },
  };
}

export async function revokeRefreshToken(raw: string): Promise<void> {
  if (!raw) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: sha256(raw), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Logout-everywhere: bump tokenVersion (kills all live access tokens via the
 * `tv` check in requireAuth) AND revoke every outstanding refresh row.
 */
export async function bumpTokenVersionAndRevokeAll(userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    }),
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}

export function clientIpFromReq(req: { ip?: string; header: (n: string) => string | undefined }): string | null {
  return req.header("cf-connecting-ip") ?? req.ip ?? null;
}
