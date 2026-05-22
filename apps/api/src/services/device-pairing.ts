import { randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { HttpError } from "../errors.js";
import {
  canonicalizePairingCode,
  generatePairingCode,
  PAIRING_CODE_LEN,
  sha256,
} from "../lib/pairing-code.js";

export {
  canonicalizePairingCode,
  generatePairingCode,
  formatPairingCode,
  sha256,
} from "../lib/pairing-code.js";

export const PAIRING_TTL_MS = 10 * 60 * 1000;
// Hard cap on pairing-code lifetime. Beta-tester ("long-lived") codes still
// expire — they just last days instead of minutes so testers can swap test
// devices without the parent having to mint a fresh code every few minutes.
// 7 days is long enough to span a normal test cycle, short enough that a
// leaked code can't outlive the beta itself.
export const PAIRING_TTL_MAX_MS = 7 * 24 * 60 * 60 * 1000;
const CODE_LEN = PAIRING_CODE_LEN;

// Clamp a requested pairing TTL into [PAIRING_TTL_MS, PAIRING_TTL_MAX_MS].
// Anything below the default floor rounds up; anything above the max rounds
// down. Exported so the clamp math is unit-testable without DB or JWT.
export function clampPairingTtl(requestedMs: number | undefined): number {
  const requested = requestedMs ?? PAIRING_TTL_MS;
  return Math.min(Math.max(requested, PAIRING_TTL_MS), PAIRING_TTL_MAX_MS);
}

// Long device token: 32 random bytes, base64url. Opaque to client.
const DEVICE_TOKEN_BYTES = 32;

export interface IssueEnrollmentInput {
  familyId: string;
  createdById: string;
  label?: string;
  // Optional pairing-code TTL override. Clamped to PAIRING_TTL_MAX_MS server-
  // side so a bad client value can't issue a code that lives forever.
  ttlMs?: number;
}

export interface IssueEnrollmentResult {
  enrollmentId: string;
  pairingCode: string; // raw — display as `formatPairingCode(pairingCode)`
  qrNonce: string; // signed JWT — encode in QR URL
  expiresAt: Date;
}

/**
 * Mints a pairing code + QR nonce. Server stores only the hashes; raw values
 * are returned to the parent UI exactly once.
 */
export async function issueEnrollment(input: IssueEnrollmentInput): Promise<IssueEnrollmentResult> {
  const ttlMs = clampPairingTtl(input.ttlMs);
  const expiresAt = new Date(Date.now() + ttlMs);

  // Retry on the very rare code collision.
  let code: string | null = null;
  let codeHash = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generatePairingCode();
    const h = sha256(candidate);
    const existing = await prisma.deviceEnrollment.findUnique({ where: { codeHash: h } });
    if (!existing) {
      code = candidate;
      codeHash = h;
      break;
    }
  }
  if (!code) throw HttpError.serviceUnavailable("Failed to allocate pairing code");

  // QR nonce: signed JWT scoped to this enrollment. Verified server-side at redeem.
  // Random `jti` ensures the hash row remains unique even if a parent rapidly
  // re-issues a pairing.
  const jti = randomBytes(12).toString("hex");
  const qrNonce = jwt.sign({ kind: "device_pair", fid: input.familyId, jti }, env.JWT_SECRET, {
    expiresIn: Math.floor(ttlMs / 1000),
  });
  const nonceHash = sha256(qrNonce);

  const row = await prisma.deviceEnrollment.create({
    data: {
      familyId: input.familyId,
      codeHash,
      nonceHash,
      label: input.label ?? null,
      expiresAt,
      createdById: input.createdById,
    },
  });

  return { enrollmentId: row.id, pairingCode: code, qrNonce, expiresAt };
}

export interface RedeemEnrollmentInput {
  pairingCode?: string;
  qrNonce?: string;
}

export interface RedeemEnrollmentResult {
  deviceId: string;
  familyId: string;
  deviceToken: string; // raw, returned once
  label: string;
}

/**
 * Redeems a pairing artifact. Single-use, expired/consumed rows refuse. Returns
 * the raw deviceToken to the device — server stores only sha256. Caller is
 * expected to gate via rate limiter + Turnstile.
 */
export async function redeemEnrollment(input: RedeemEnrollmentInput): Promise<RedeemEnrollmentResult> {
  if (!input.pairingCode && !input.qrNonce) {
    throw HttpError.badRequest("Provide pairingCode or qrNonce");
  }

  let row: Awaited<ReturnType<typeof prisma.deviceEnrollment.findUnique>> | null = null;

  if (input.qrNonce) {
    try {
      jwt.verify(input.qrNonce, env.JWT_SECRET);
    } catch {
      throw HttpError.unauthorized("Pairing link expired or invalid");
    }
    row = await prisma.deviceEnrollment.findUnique({
      where: { nonceHash: sha256(input.qrNonce) },
    });
  } else if (input.pairingCode) {
    const canonical = canonicalizePairingCode(input.pairingCode);
    if (canonical.length !== CODE_LEN) {
      throw HttpError.badRequest("Pairing code must be 8 characters");
    }
    row = await prisma.deviceEnrollment.findUnique({ where: { codeHash: sha256(canonical) } });
  }

  if (!row) throw HttpError.unauthorized("Pairing code expired or invalid");
  if (row.consumedAt) throw HttpError.unauthorized("Pairing code already used");
  if (row.expiresAt.getTime() < Date.now()) {
    throw HttpError.unauthorized("Pairing code expired");
  }

  // Mint device token. We hash before storage; raw goes back to the device.
  const deviceToken = randomBytes(DEVICE_TOKEN_BYTES).toString("base64url");
  const deviceTokenHash = sha256(deviceToken);
  const label = row.label ?? "New device";

  const device = await prisma.$transaction(async (tx) => {
    const d = await tx.enrolledDevice.create({
      data: {
        familyId: row!.familyId,
        label,
        deviceTokenHash,
        enrolledAt: new Date(),
        lastSeenAt: new Date(),
        createdById: row!.createdById,
      },
    });
    await tx.deviceEnrollment.update({
      where: { id: row!.id },
      data: { consumedAt: new Date(), consumedDeviceId: d.id },
    });
    return d;
  });

  return { deviceId: device.id, familyId: device.familyId, deviceToken, label: device.label };
}

export interface DeviceRecord {
  id: string;
  label: string;
  enrolledAt: string | null;
  lastSeenAt: string | null;
  revoked: boolean;
  createdAt: string;
}

export async function listDevices(familyId: string): Promise<DeviceRecord[]> {
  const rows = await prisma.enrolledDevice.findMany({
    where: { familyId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    enrolledAt: r.enrolledAt?.toISOString() ?? null,
    lastSeenAt: r.lastSeenAt?.toISOString() ?? null,
    revoked: r.revokedAt != null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function revokeDevice(familyId: string, deviceId: string, revokedById: string): Promise<void> {
  const row = await prisma.enrolledDevice.findFirst({ where: { id: deviceId, familyId } });
  if (!row) throw HttpError.notFound("Device not found");
  if (row.revokedAt) return; // idempotent
  await prisma.enrolledDevice.update({
    where: { id: deviceId },
    data: { revokedAt: new Date(), revokedById },
  });
}

export async function renameDevice(familyId: string, deviceId: string, label: string): Promise<void> {
  const trimmed = label.trim();
  if (trimmed.length < 1 || trimmed.length > 80) {
    throw HttpError.badRequest("Label must be 1-80 chars");
  }
  const r = await prisma.enrolledDevice.updateMany({
    where: { id: deviceId, familyId },
    data: { label: trimmed },
  });
  if (r.count === 0) throw HttpError.notFound("Device not found");
}

/**
 * Looks up a device by raw token (sha256 it server-side). Returns null on
 * miss/revoked. Used by requireDeviceToken middleware.
 */
export async function findActiveDeviceByToken(
  rawToken: string,
): Promise<{ id: string; familyId: string } | null> {
  if (!rawToken || rawToken.length < 20) return null;
  const row = await prisma.enrolledDevice.findUnique({
    where: { deviceTokenHash: sha256(rawToken) },
    select: { id: true, familyId: true, revokedAt: true },
  });
  if (!row || row.revokedAt) return null;
  return { id: row.id, familyId: row.familyId };
}

/**
 * Best-effort lastSeenAt bump. Errors swallowed.
 */
export async function touchDevice(deviceId: string): Promise<void> {
  await prisma.enrolledDevice
    .update({ where: { id: deviceId }, data: { lastSeenAt: new Date() } })
    .catch((e) => console.error("[device:touch]", e));
}
