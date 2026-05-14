import { prisma } from "../db.js";
import type { Prisma } from "@prisma/client";

export interface AuditEventInput {
  familyId: string;
  actorId?: string | null;
  kind: string;
  targetType?: string;
  targetId?: string;
  payload?: Record<string, unknown>;
  tx?: Prisma.TransactionClient;
}

/**
 * Append an audit row. Errors swallowed so audit failures never break the operation
 * that triggered them; logged for ops follow-up. Pass `tx` to participate in the
 * caller's transaction (recommended when the audited operation might roll back).
 */
export async function recordAudit(input: AuditEventInput) {
  const client = input.tx ?? prisma;
  try {
    await client.auditEvent.create({
      data: {
        familyId: input.familyId,
        actorId: input.actorId ?? null,
        kind: input.kind,
        targetType: input.targetType,
        targetId: input.targetId,
        payload: (input.payload as object | undefined) ?? undefined,
      },
    });
  } catch (e) {
    console.error("[audit:record]", input.kind, e);
  }
}

export interface ListAuditOpts {
  limit?: number;
  before?: Date;
  kind?: string;
}

export async function listAudit(familyId: string, opts: ListAuditOpts = {}) {
  return prisma.auditEvent.findMany({
    where: {
      familyId,
      ...(opts.kind && { kind: opts.kind }),
      ...(opts.before && { createdAt: { lt: opts.before } }),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(opts.limit ?? 100, 500),
  });
}
