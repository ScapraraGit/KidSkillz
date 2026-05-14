import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from "../services/task-categories.js";

export const taskCategoriesRouter = Router();

taskCategoriesRouter.use(requireAuth);

const upsertSchema = z.object({
  name: z.string().min(1).max(40),
  icon: z.string().min(1).max(8),
  color: z.string().max(40).nullable().optional(),
  position: z.number().int().min(0).max(999).optional(),
});

taskCategoriesRouter.get("/", async (req, res) => {
  res.json({ categories: await listCategories(req.auth!.fid) });
});

taskCategoriesRouter.post("/", requireRole("PARENT"), async (req, res) => {
  const input = upsertSchema.parse(req.body);
  res.status(201).json({ category: await createCategory(req.auth!.fid, input) });
});

taskCategoriesRouter.patch("/:id", requireRole("PARENT"), async (req, res) => {
  const input = upsertSchema.partial().parse(req.body);
  res.json({ category: await updateCategory(req.auth!.fid, req.params.id, input) });
});

taskCategoriesRouter.delete("/:id", requireRole("PARENT"), async (req, res) => {
  await deleteCategory(req.auth!.fid, req.params.id);
  res.status(204).end();
});
