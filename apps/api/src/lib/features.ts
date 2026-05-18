import { z } from "zod";
import { env } from "../env.js";
import type { ProofRequirement } from "@prisma/client";

export const features = {
  photoProof: env.PHOTO_PROOF_ENABLED,
  devicePairing: env.DEVICE_PAIRING_ENABLED,
  orgConsentRequired: env.ORG_CONSENT_REQUIRED,
} as const;

export type FeatureFlags = typeof features;

const PHOTO_PROOF_VALUES = new Set<ProofRequirement>(["PHOTO_OPTIONAL", "PHOTO_REQUIRED", "PHOTO_AND_NOTES"]);

export function isPhotoProof(value: string): boolean {
  return PHOTO_PROOF_VALUES.has(value as ProofRequirement);
}

// When the photo-proof feature is off, any legacy PHOTO_* values still sitting in
// the database (from before the flag flipped) are downgraded to NOTES_OPTIONAL at
// read time. Without this a flag flip would brick existing tasks: kids would be
// asked for proof they can no longer attach.
export function effectiveProofRequirement(value: ProofRequirement): ProofRequirement {
  if (!features.photoProof && isPhotoProof(value)) return "NOTES_OPTIONAL";
  return value;
}

export const ALLOWED_PROOF_VALUES: readonly ProofRequirement[] = features.photoProof
  ? ["NONE", "NOTES_OPTIONAL", "NOTES_REQUIRED", "PHOTO_OPTIONAL", "PHOTO_REQUIRED", "PHOTO_AND_NOTES"]
  : ["NONE", "NOTES_OPTIONAL", "NOTES_REQUIRED"];

// Zod enum over the currently allowed proof values. When PHOTO_PROOF_ENABLED is
// false, PHOTO_* values are rejected at the route boundary — defense in depth on
// top of the UI hiding them.
export const proofRequirementSchema = z.enum(
  ALLOWED_PROOF_VALUES as readonly [ProofRequirement, ...ProofRequirement[]],
);
