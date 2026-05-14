import type { Request } from "express";
import { prisma } from "../db.js";

export type LegalAcceptanceKind = "TERMS" | "PRIVACY" | "CHILD_PROFILE_CONSENT" | "UPLOAD_ACK";

export interface RecordAcceptanceInput {
  userId: string;
  familyId: string;
  kind: LegalAcceptanceKind;
  version: number;
  subjectChildId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  context?: string | null;
}

export async function recordLegalAcceptance(input: RecordAcceptanceInput) {
  return prisma.legalAcceptance.create({
    data: {
      userId: input.userId,
      familyId: input.familyId,
      kind: input.kind,
      version: input.version,
      subjectChildId: input.subjectChildId ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      context: input.context ?? null,
    },
  });
}

// Extract client IP honoring X-Forwarded-For when express is behind a trusted proxy
// (app.set('trust proxy', ...) — caller's responsibility). Truncates to first hop.
export function clientIpFrom(req: Request): string | null {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) return fwd.split(",")[0]!.trim();
  if (Array.isArray(fwd) && fwd.length > 0) return fwd[0]!;
  return req.ip ?? req.socket?.remoteAddress ?? null;
}

export function userAgentFrom(req: Request): string | null {
  const ua = req.headers["user-agent"];
  return typeof ua === "string" ? ua.slice(0, 512) : null;
}
