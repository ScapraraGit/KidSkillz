import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "../env.js";

export interface PutOpts {
  contentType: string;
  ext: string;
  familyId: string;
}

export interface StorageProvider {
  put(buf: Buffer, opts: PutOpts): Promise<{ key: string }>;
  resolve(key: string): Promise<{ stream: Buffer; contentType: string }>;
  delete(key: string): Promise<void>;
}

const EXT_TO_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

const KEY_RE = /^fam_[A-Za-z0-9-]{1,64}\/[A-Za-z0-9-]{1,64}\.(jpe?g|png)$/i;

/**
 * Asserts the key has the canonical `fam_<familyId>/<uuid>.<ext>` shape and
 * contains no path-traversal sequences. Throws on malformed input — callers
 * should map that to a 404 to avoid leaking which keys exist.
 */
export function parseKey(key: string): { familyId: string; filename: string } {
  if (key.includes("..") || key.includes("\\") || path.isAbsolute(key)) {
    throw new Error("invalid key");
  }
  if (!KEY_RE.test(key)) throw new Error("invalid key");
  const [famPart, filename] = key.split("/");
  const familyId = famPart.slice("fam_".length);
  return { familyId, filename };
}

export class LocalStorage implements StorageProvider {
  constructor(private root = env.UPLOAD_DIR) {}

  private full(key: string) {
    const parsed = parseKey(key);
    return path.join(this.root, `fam_${parsed.familyId}`, parsed.filename);
  }

  async put(buf: Buffer, opts: PutOpts) {
    const filename = `${randomUUID()}${opts.ext}`;
    const key = `fam_${opts.familyId}/${filename}`;
    const target = this.full(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, buf);
    return { key };
  }

  async resolve(key: string) {
    const ext = path.extname(key).toLowerCase();
    const buf = await fs.readFile(this.full(key));
    return { stream: buf, contentType: EXT_TO_MIME[ext] ?? "application/octet-stream" };
  }

  async delete(key: string) {
    try {
      await fs.unlink(this.full(key));
    } catch {
      /* ignore */
    }
  }
}

export const storage: StorageProvider = new LocalStorage();
