import crypto from "node:crypto";

export interface CaregiverScope {
  canApproveTasks: boolean;
  canApproveRedemptions: boolean;
  canApproveInitiatives: boolean;
  canViewLedger: boolean;
  kidIds: string[]; // empty = all kids in family
}

export const DEFAULT_CAREGIVER_SCOPE: CaregiverScope = {
  canApproveTasks: true,
  canApproveRedemptions: true,
  canApproveInitiatives: true,
  canViewLedger: true,
  kidIds: [],
};

export function generateInvitationToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

export function generatePin(digits = 6): { raw: string; hash: string } {
  const max = 10 ** digits;
  const n = crypto.randomInt(0, max);
  const raw = n.toString().padStart(digits, "0");
  return { raw, hash: hashToken(raw) };
}

export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function caregiverWindowActive(
  validFrom: Date | null | undefined,
  validUntil: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (validFrom && now < validFrom) return false;
  if (validUntil && now >= validUntil) return false;
  return true;
}
