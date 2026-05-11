import { Router } from "express";
import multer from "multer";
import path from "node:path";
import { requireAuth } from "../middleware/auth.js";
import { storage } from "../lib/storage.js";
import { env } from "../env.js";
import { HttpError } from "../errors.js";

export const uploadsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.UPLOAD_MAX_BYTES },
});

const allowedExt = new Set([".jpg", ".jpeg", ".png"]);

uploadsRouter.post("/proof", requireAuth, upload.single("file"), async (req, res) => {
  if (!req.file) throw HttpError.badRequest("No file uploaded");
  const ext = path.extname(req.file.originalname).toLowerCase();
  if (!allowedExt.has(ext)) throw HttpError.badRequest("Only .jpg or .png allowed");
  const result = await storage.put(req.file.buffer, {
    contentType: req.file.mimetype,
    ext,
  });
  res.status(201).json({ key: result.key });
});

uploadsRouter.get("/:key", requireAuth, async (req, res) => {
  try {
    const { stream, contentType } = await storage.resolve(req.params.key);
    res.setHeader("Content-Type", contentType);
    res.send(stream);
  } catch {
    throw HttpError.notFound();
  }
});
