import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { listForUser, markAllRead, markRead, unreadCount } from "../services/notifications.js";

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
