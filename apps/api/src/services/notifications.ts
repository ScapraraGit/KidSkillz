import { prisma } from "../db.js";
import type { NotificationKind, Prisma } from "@prisma/client";
import type { NotificationDTO } from "@chorechamps/shared";
import { sendNotificationEmail } from "../lib/email.js";
import { getFamilySettings } from "./family.js";

interface CreateOpts {
  familyId: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  payload?: Record<string, unknown>;
  tx?: Prisma.TransactionClient;
}

export async function createNotification(opts: CreateOpts) {
  const client = opts.tx ?? prisma;
  const created = await client.notification.create({
    data: {
      familyId: opts.familyId,
      userId: opts.userId,
      kind: opts.kind,
      title: opts.title,
      body: opts.body,
      payload: opts.payload as object | undefined,
    },
  });

  // Mirror to email when family setting is on and recipient has an email on file.
  // Errors are swallowed — the in-app notification is already persisted.
  try {
    const settings = await getFamilySettings(opts.familyId);
    if (settings.emailNotifications) {
      const recipient = await prisma.user.findUnique({
        where: { id: opts.userId },
        select: { email: true },
      });
      if (recipient?.email) {
        await sendNotificationEmail({
          to: recipient.email,
          title: opts.title,
          body: opts.body ?? null,
        });
      }
    }
  } catch (e) {
    console.error("[notifications:email]", e);
  }

  return created;
}

export async function listForUser(
  userId: string,
  opts: { onlyUnread?: boolean; limit?: number } = {},
): Promise<NotificationDTO[]> {
  const list = await prisma.notification.findMany({
    where: { userId, ...(opts.onlyUnread && { readAt: null }) },
    orderBy: { createdAt: "desc" },
    take: opts.limit ?? 50,
  });
  return list.map(serialize);
}

export async function unreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

export async function markRead(userId: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const r = await prisma.notification.updateMany({
    where: { id: { in: ids }, userId, readAt: null },
    data: { readAt: new Date() },
  });
  return r.count;
}

export async function markAllRead(userId: string): Promise<number> {
  const r = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return r.count;
}

function serialize(n: {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  payload: unknown;
  readAt: Date | null;
  createdAt: Date;
}): NotificationDTO {
  return {
    id: n.id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    payload: (n.payload as Record<string, unknown>) ?? null,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  };
}
