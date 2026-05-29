import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock collaborators BEFORE importing the service so it binds the mocks.
const notificationCreateMock = vi.fn(async () => ({ id: "n1" }));
const pushTokenFindManyMock = vi.fn();
const pushTokenUpsertMock = vi.fn();
const pushTokenDeleteManyMock = vi.fn(async () => ({ count: 0 }));
const userFindUniqueMock = vi.fn(async () => ({ email: null }));

vi.mock("../../db.js", () => ({
  prisma: {
    notification: { create: notificationCreateMock },
    pushToken: {
      findMany: pushTokenFindManyMock,
      upsert: pushTokenUpsertMock,
      deleteMany: pushTokenDeleteManyMock,
    },
    user: { findUnique: userFindUniqueMock },
  },
}));

const sendMock = vi.fn(async () => ({ successCount: 1, failureCount: 0, invalidTokens: [] as string[] }));
vi.mock("../../lib/push-provider.js", () => ({ pushProvider: { send: sendMock } }));

vi.mock("../../lib/email.js", () => ({ sendNotificationEmail: vi.fn() }));

const getFamilySettingsMock = vi.fn();
vi.mock("../family.js", () => ({ getFamilySettings: getFamilySettingsMock }));

const { createNotification, registerPushToken, clearPushToken } = await import("../notifications.js");

// createNotification fires the mirror via setImmediate; flush the queue so we can assert.
const flush = () => new Promise((r) => setImmediate(r));

const baseOpts = {
  familyId: "fam1",
  userId: "user1",
  kind: "COMPLETION_APPROVED" as const,
  title: "Chore done",
  body: "Take out trash",
  payload: { completionId: "c1", count: 3 },
};

beforeEach(() => {
  notificationCreateMock.mockClear();
  pushTokenFindManyMock.mockReset();
  pushTokenUpsertMock.mockReset();
  pushTokenDeleteManyMock.mockClear();
  sendMock.mockClear();
  getFamilySettingsMock.mockReset();
  getFamilySettingsMock.mockResolvedValue({ pushNotifications: true, emailNotifications: false });
});

describe("deliverPushMirror (via createNotification)", () => {
  it("sends push when setting on and tokens exist, flattening payload to strings", async () => {
    pushTokenFindManyMock.mockResolvedValue([{ token: "tokA" }, { token: "tokB" }]);
    await createNotification(baseOpts);
    await flush();
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith({
      tokens: ["tokA", "tokB"],
      title: "Chore done",
      body: "Take out trash",
      data: { kind: "COMPLETION_APPROVED", completionId: "c1", count: "3" },
    });
  });

  it("skips when family setting is off", async () => {
    getFamilySettingsMock.mockResolvedValue({ pushNotifications: false });
    await createNotification(baseOpts);
    await flush();
    expect(pushTokenFindManyMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("skips send when the user has no registered tokens", async () => {
    pushTokenFindManyMock.mockResolvedValue([]);
    await createNotification(baseOpts);
    await flush();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("prunes tokens FCM reports as invalid", async () => {
    pushTokenFindManyMock.mockResolvedValue([{ token: "good" }, { token: "dead" }]);
    sendMock.mockResolvedValueOnce({ successCount: 1, failureCount: 1, invalidTokens: ["dead"] });
    await createNotification(baseOpts);
    await flush();
    expect(pushTokenDeleteManyMock).toHaveBeenCalledWith({ where: { token: { in: ["dead"] } } });
  });

  it("never throws out of createNotification when push delivery fails", async () => {
    pushTokenFindManyMock.mockResolvedValue([{ token: "tokA" }]);
    sendMock.mockRejectedValueOnce(new Error("FCM down"));
    await expect(createNotification(baseOpts)).resolves.toEqual({ id: "n1" });
    await flush();
  });
});

describe("registerPushToken / clearPushToken", () => {
  it("upserts on the unique token, refreshing owner and lastSeenAt", async () => {
    pushTokenUpsertMock.mockResolvedValue({ id: "p1" });
    await registerPushToken({ familyId: "fam1", userId: "user1", token: "tok", platform: "IOS" });
    const arg = pushTokenUpsertMock.mock.calls[0][0];
    expect(arg.where).toEqual({ token: "tok" });
    expect(arg.create).toMatchObject({ familyId: "fam1", userId: "user1", token: "tok", platform: "IOS" });
    expect(arg.update).toMatchObject({ familyId: "fam1", userId: "user1", platform: "IOS" });
    expect(arg.update.lastSeenAt).toBeInstanceOf(Date);
  });

  it("deletes scoped by userId so one account can't drop another's device", async () => {
    pushTokenDeleteManyMock.mockResolvedValueOnce({ count: 1 });
    const count = await clearPushToken("user1", "tok");
    expect(pushTokenDeleteManyMock).toHaveBeenCalledWith({ where: { userId: "user1", token: "tok" } });
    expect(count).toBe(1);
  });
});
