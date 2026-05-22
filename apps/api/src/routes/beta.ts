import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";
import { getChecklist, submitFeedback, updateChecklist } from "../services/beta.js";

export const betaRouter = Router();

betaRouter.use(requireAuth);
// Beta program is parent-only. Caregivers and kids don't see /beta — feedback
// is about the account-owner's overall experience setting up + running the family.
betaRouter.use(requireRole("PARENT"));

// Family-level enrollment gate. Admins flip Family.isBeta via the admin portal.
// Non-beta families 403 here, which also makes the dashboard banner self-hide
// (BetaBanner swallows 403 and renders nothing).
async function requireBetaFamily(req: Request, _res: Response, next: NextFunction) {
  try {
    const family = await prisma.family.findUnique({
      where: { id: req.auth!.fid },
      select: { isBeta: true },
    });
    if (!family?.isBeta) throw HttpError.forbidden("Family is not enrolled in the beta program");
    next();
  } catch (e) {
    next(e);
  }
}
betaRouter.use(requireBetaFamily);

betaRouter.get("/status", async (req, res) => {
  const data = await getChecklist(req.auth!.fid, req.auth!.sub);
  res.json({ submittedAt: data.submittedAt, checklistCompleted: data.completed.length });
});

betaRouter.get("/checklist", async (req, res) => {
  const data = await getChecklist(req.auth!.fid, req.auth!.sub);
  res.json(data);
});

betaRouter.put("/checklist", async (req, res) => {
  const data = await updateChecklist(req.auth!.fid, req.auth!.sub, req.body);
  res.json(data);
});

betaRouter.post("/feedback", async (req, res) => {
  const ua = req.header("user-agent") ?? undefined;
  const body = req.body && typeof req.body === "object" ? { ...req.body, userAgent: ua } : req.body;
  const result = await submitFeedback(req.auth!.fid, req.auth!.sub, body);
  res.status(201).json(result);
});
