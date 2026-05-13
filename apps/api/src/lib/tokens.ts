import crypto from "node:crypto";

/** Generates a URL-safe random secret. Caller emails the raw value; DB stores hash only. */
export function generateRawToken(byteLen = 32): string {
  return crypto.randomBytes(byteLen).toString("base64url");
}

/** SHA-256 hex digest. Compared constant-time via timingSafeEqual when verifying. */
export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/** Constant-time hex compare so token presence check doesn't leak via timing. */
export function tokenMatches(rawCandidate: string, storedHash: string): boolean {
  const candidate = hashToken(rawCandidate);
  if (candidate.length !== storedHash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(storedHash, "hex"));
}
