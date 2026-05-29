import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import {
  clearPushToken,
  listForUser,
  markAllRead,
  markRead,
  registerPushToken,
  unreadCount,
} from "../services/notifications.js";

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

notificationsRouter.get("/", async (req, res) => {
  const onlyUnread = req.query.unread === "1";
  const limit = Math.min(Number(req.query.limit ?? 50), 100);
  const [notifications, unread] = await Promise.all([
    listForUser(req.auth!.sub, { onlyUnread, limit }),
    unreadCount(req.auth!.sub),
  ]);
  res.json({ notifications, unread });
});

const readSchema = z.object({ ids: z.array(z.string().uuid()).min(1) });

notificationsRouter.post("/read", async (req, res) => {
  const { ids } = readSchema.parse(req.body);
  const count = await markRead(req.auth!.sub, ids);
  res.json({ count });
});

notificationsRouter.post("/read-all", async (req, res) => {
  const count = await markAllRead(req.auth!.sub);
  res.json({ count });
});

const registerTokenSchema = z.object({
  token: z.string().min(1).max(4096),
  platform: z.enum(["IOS", "ANDROID", "WEB"]),
});

notificationsRouter.post("/push-tokens", async (req, res) => {
  const { token, platform } = registerTokenSchema.parse(req.body);
  await registerPushToken({
    familyId: req.auth!.fid,
    userId: req.auth!.sub,
    token,
    platform,
  });
  res.status(204).end();
});

const clearTokenSchema = z.object({ token: z.string().min(1).max(4096) });

notificationsRouter.delete("/push-tokens", async (req, res) => {
  const { token } = clearTokenSchema.parse(req.body);
  const count = await clearPushToken(req.auth!.sub, token);
  res.json({ count });
});
