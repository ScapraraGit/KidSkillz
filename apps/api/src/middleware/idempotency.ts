import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";

const KEY_HEADER = "idempotency-key";
const TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Replay-safe wrapper for ledger-affecting mutations. If the client sends
 * `Idempotency-Key: <uuid>`, the first response is cached against (familyId, key)
 * and served verbatim on subsequent hits within 24h.
 *
 * Missing header = pass-through (no caching). This preserves backward compat with
 * older clients while letting newer mobile/web double-tap-safely.
 *
 * Tenant scoping: cache is keyed by familyId, so requireAuth must run first.
 */
export async function idempotency(req: Request, res: Response, next: NextFunction): Promise<void> {
  const raw = req.header(KEY_HEADER);
  if (!raw) return next();
  const key = raw.trim();
  if (key.length < 8 || key.length > 200) {
    return next(HttpError.badRequest("Idempotency-Key must be 8-200 chars"));
  }
  if (!req.auth?.fid) return next(HttpError.unauthorized());
  const familyId = req.auth.fid;
  const route = `${req.method} ${req.baseUrl}${req.route?.path ?? req.path}`;

  const existing = await prisma.idempotencyKey.findUnique({
    where: { familyId_key: { familyId, key } },
  });
  if (existing) {
    if (Date.now() - existing.createdAt.getTime() > TTL_MS) {
      // Stale; let GC handle eventually. Treat as miss.
    } else {
      res.status(existing.statusCode).json(existing.responseJson);
      return;
    }
  }

  // Capture res.json output so we can persist after the handler runs.
  const origJson = res.json.bind(res);
  let captured: unknown = undefined;
  res.json = ((body: unknown) => {
    captured = body;
    return origJson(body);
  }) as Response["json"];

  res.on("finish", () => {
    // Only cache successful responses; errors should be retryable.
    if (res.statusCode >= 200 && res.statusCode < 300 && captured !== undefined) {
      prisma.idempotencyKey
        .create({
          data: {
            familyId,
            key,
            route,
            statusCode: res.statusCode,
            responseJson: captured as object,
          },
        })
        .catch((e: any) => {
          // P2002 = concurrent first-write race; safe to ignore — cache already populated.
          if (e?.code !== "P2002") console.error("[idempotency:persist]", e);
        });
    }
  });

  next();
}
