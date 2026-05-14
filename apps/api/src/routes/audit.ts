import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { listAudit } from "../services/audit.js";

export const auditRouter = Router();

auditRouter.use(requireAuth, requireRole("PARENT"));

auditRouter.get("/", async (req, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit ?? 100) || 100));
  const before = req.query.before ? new Date(String(req.query.before)) : undefined;
  const kind = req.query.kind ? String(req.query.kind) : undefined;
  const rows = await listAudit(req.auth!.fid, { limit, before, kind });
  res.json({
    events: rows.map((r: Awaited<ReturnType<typeof listAudit>>[number]) => ({
      id: r.id,
      actorId: r.actorId,
      kind: r.kind,
      targetType: r.targetType,
      targetId: r.targetId,
      payload: r.payload,
      createdAt: r.createdAt.toISOString(),
    })),
  });
});
