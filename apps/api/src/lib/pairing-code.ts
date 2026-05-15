import { createHash, randomBytes } from "node:crypto";

// Ambiguous chars (O/0/I/1/L) excluded to keep verbal/typed entry clean.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const PAIRING_CODE_LEN = 8;

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function generatePairingCode(): string {
  const bytes = randomBytes(PAIRING_CODE_LEN);
  let out = "";
  for (let i = 0; i < PAIRING_CODE_LEN; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

export function formatPairingCode(raw: string): string {
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
}

export function canonicalizePairingCode(input: string): string {
  return input.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}
