import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { listRecentMissedOpportunities } from "../services/missed-opportunities.js";

export const missedOpportunitiesRouter = Router();

missedOpportunitiesRouter.use(requireAuth);

missedOpportunitiesRouter.get("/recent", async (req, res) => {
  const days = Math.min(30, Math.max(1, Number(req.query.days ?? 7) || 7));
  res.json({ missedOpportunities: await listRecentMissedOpportunities(req.auth!.fid, days) });
});
