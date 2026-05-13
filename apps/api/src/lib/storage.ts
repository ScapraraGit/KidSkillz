import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "../env.js";

export interface StorageProvider {
  put(buf: Buffer, opts: { contentType: string; ext: string }): Promise<{ key: string }>;
  resolve(key: string): Promise<{ stream: Buffer; contentType: string }>;
  delete(key: string): Promise<void>;
}

const EXT_TO_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

export class LocalStorage implements StorageProvider {
  constructor(private root = env.UPLOAD_DIR) {}

  private full(key: string) {
    // prevent path traversal
    if (key.includes("..") || path.isAbsolute(key)) throw new Error("invalid key");
    return path.join(this.root, key);
  }

  async put(buf: Buffer, opts: { contentType: string; ext: string }) {
    await fs.mkdir(this.root, { recursive: true });
    const key = `${randomUUID()}${opts.ext}`;
    await fs.writeFile(this.full(key), buf);
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
