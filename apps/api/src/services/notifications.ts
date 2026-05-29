import { prisma } from "../db.js";
import type { NotificationKind, Prisma, PushPlatform } from "@prisma/client";
import type { NotificationDTO } from "@chorechampz/shared";
import { sendNotificationEmail } from "../lib/email.js";
import { pushProvider } from "../lib/push-provider.js";
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
  //
  // Fire-and-forget via setImmediate so a slow SMTP call never blocks an active Prisma
  // transaction. createNotification is called from inside approveCompletion,
  // evaluateChallenges, evaluateLevelUp, etc., all of which run inside $transaction —
  // awaiting a network round-trip there holds the DB connection open and risks pool
  // starvation. The in-app notification row is already persisted (in or out of the
  // caller's tx), so even if the email errors the user still sees the alert in-app.
  setImmediate(() => {
    void deliverEmailMirror(opts).catch((e) => console.error("[notifications:email]", e));
    void deliverPushMirror(opts).catch((e) => console.error("[notifications:push]", e));
  });

  return created;
}

async function deliverEmailMirror(opts: CreateOpts) {
  const settings = await getFamilySettings(opts.familyId);
  if (!settings.emailNotifications) return;
  const recipient = await prisma.user.findUnique({
    where: { id: opts.userId },
    select: { email: true },
  });
  if (!recipient?.email) return;
  await sendNotificationEmail({
    to: recipient.email,
    title: opts.title,
    body: opts.body ?? null,
  });
}

// Native-push mirror of an in-app notification. Same fire-and-forget contract as
// deliverEmailMirror: gated on a family setting, errors swallowed, the in-app
// Notification row is the source of truth. FCM requires all data values to be
// strings, so the payload is flattened to a string map for deep-link routing.
async function deliverPushMirror(opts: CreateOpts) {
  const settings = await getFamilySettings(opts.familyId);
  if (!settings.pushNotifications) return;
  const tokens = await prisma.pushToken.findMany({
    where: { userId: opts.userId },
    select: { token: true },
  });
  if (tokens.length === 0) return;
  const res = await pushProvider.send({
    tokens: tokens.map((t) => t.token),
    title: opts.title,
    body: opts.body,
    data: { kind: opts.kind, ...flattenPayload(opts.payload) },
  });
  if (res.invalidTokens.length) {
    await prisma.pushToken.deleteMany({ where: { token: { in: res.invalidTokens } } });
  }
}

function flattenPayload(payload: Record<string, unknown> | undefined): Record<string, string> {
  if (!payload) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (v == null) continue;
    out[k] = typeof v === "string" ? v : JSON.stringify(v);
  }
  return out;
}

// Upsert a device's push token on (re-)registration. token is unique, so a
// rotated token from the same device lands as a new row and dead ones are pruned
// by deliverPushMirror when FCM reports them invalid.
export async function registerPushToken(opts: {
  familyId: string;
  userId: string;
  token: string;
  platform: PushPlatform;
}) {
  return prisma.pushToken.upsert({
    where: { token: opts.token },
    create: {
      familyId: opts.familyId,
      userId: opts.userId,
      token: opts.token,
      platform: opts.platform,
    },
    update: {
      familyId: opts.familyId,
      userId: opts.userId,
      platform: opts.platform,
      lastSeenAt: new Date(),
    },
  });
}

// Drop a token on logout. Scoped to the calling user so one account can't unregister
// another's device.
export async function clearPushToken(userId: string, token: string): Promise<number> {
  const r = await prisma.pushToken.deleteMany({ where: { userId, token } });
  return r.count;
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
