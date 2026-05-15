import { Router } from "express";
import multer from "multer";
import sharp from "sharp";
import { fileTypeFromBuffer } from "file-type";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { parseKey, storage } from "../lib/storage.js";
import { env } from "../env.js";
import { HttpError } from "../errors.js";
import { features } from "../lib/features.js";

export const uploadsRouter = Router();

// Hard gate the entire uploads surface until photo-proof is generally available
// (S3 storage + retention sweeps wired up). Returns 503 so clients can detect
// "disabled" distinctly from "broken". GET stays gated too — old keys in the
// database become inaccessible by design until the feature is back on.
uploadsRouter.use((_req, _res, next) => {
  if (!features.photoProof) {
    throw HttpError.serviceUnavailable("Photo proof is currently disabled", "PHOTO_PROOF_DISABLED");
  }
  next();
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.UPLOAD_MAX_BYTES },
});

const ALLOWED_MIMES = new Set(["image/jpeg", "image/png"]);
const MAX_DIM = 4096;

uploadsRouter.post("/proof", requireAuth, upload.single("file"), async (req, res) => {
  if (!req.file) throw HttpError.badRequest("No file uploaded");

  // 1. Sniff actual bytes — never trust the client-declared mime / extension.
  // file-type reads the first ~4100 bytes so a `.png` containing PHP/HTML is
  // detected as `text/plain` (or undetected) and rejected.
  const sniffed = await fileTypeFromBuffer(req.file.buffer);
  if (!sniffed || !ALLOWED_MIMES.has(sniffed.mime)) {
    throw HttpError.badRequest("Only JPEG or PNG images are allowed", "BAD_IMAGE");
  }

  // 2. Re-encode with sharp. .rotate() honors EXIF orientation then drops the
  // metadata block, so GPS/exif tags never reach disk. .resize with `withoutEnlargement`
  // bounds dimensions without upscaling smaller images. Output forced to the
  // sniffed format so the on-disk file matches the extension.
  const targetFormat: "jpeg" | "png" = sniffed.mime === "image/png" ? "png" : "jpeg";
  let cleaned: Buffer;
  try {
    cleaned = await sharp(req.file.buffer)
      .rotate()
      .resize({ width: MAX_DIM, height: MAX_DIM, fit: "inside", withoutEnlargement: true })
      .toFormat(targetFormat, { quality: targetFormat === "jpeg" ? 85 : undefined })
      .toBuffer();
  } catch {
    throw HttpError.badRequest("Image could not be processed", "BAD_IMAGE");
  }

  const ext = targetFormat === "png" ? ".png" : ".jpg";
  const result = await storage.put(cleaned, {
    contentType: sniffed.mime,
    ext,
    familyId: req.auth!.fid,
  });
  res.status(201).json({ key: result.key });
});

// Express 4 wildcard so the multi-segment `fam_<id>/<uuid>.<ext>` key is captured
// as a single path. Anything matching `..`, `\\`, leading `/`, or shape mismatch
// is rejected by parseKey -> 404 (no info leak).
const keyParamSchema = z
  .string()
  .min(8)
  .max(200)
  .regex(/^[A-Za-z0-9_\-./]+$/, "invalid key");

uploadsRouter.get(/^\/(.+)$/, requireAuth, async (req, res) => {
  const rawKey = (req.params as Record<string, string | undefined>)[0] ?? "";
  let key: string;
  try {
    key = keyParamSchema.parse(rawKey);
  } catch {
    throw HttpError.notFound();
  }
  let parsed: { familyId: string };
  try {
    parsed = parseKey(key);
  } catch {
    throw HttpError.notFound();
  }
  if (parsed.familyId !== req.auth!.fid) throw HttpError.notFound();
  try {
    const { stream, contentType } = await storage.resolve(key);
    res.setHeader("Content-Type", contentType);
    res.send(stream);
  } catch {
    throw HttpError.notFound();
  }
});
