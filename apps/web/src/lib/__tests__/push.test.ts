import { describe, it, expect, beforeEach, vi } from "vitest";

// Force the native branch — push.ts is a no-op on web.
vi.mock("../secureStore", () => ({
  isNativePlatform: true,
  secureStore: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
}));

const apiMock = vi.fn();
vi.mock("../api", () => ({ api: apiMock }));

// Listener registry — captures the handlers push.ts wires so we can fire
// 'registration' / 'pushNotificationActionPerformed' synthetically.
const listeners = new Map<string, (arg: unknown) => void>();
const removeAllListeners = vi.fn(async () => {
  listeners.clear();
});
const addListener = vi.fn(async (event: string, cb: (arg: unknown) => void) => {
  listeners.set(event, cb);
  return { remove: vi.fn() };
});
const checkPermissions = vi.fn(async () => ({ receive: "granted" as const }));
const requestPermissions = vi.fn(async () => ({ receive: "granted" as const }));
const register = vi.fn(async () => {});

vi.mock("@capacitor/push-notifications", () => ({
  PushNotifications: { removeAllListeners, addListener, checkPermissions, requestPermissions, register },
}));

const getPlatformMock = vi.fn(() => "android");
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: getPlatformMock },
}));

// useAuth — resolvePath reads role.
const authState = { user: { role: "PARENT" as "PARENT" | "CHILD" | "CAREGIVER" } };
vi.mock("../../store/auth", () => ({
  useAuth: { getState: () => authState },
}));

const { registerPushForSession, teardownPushForSession, setPushNavigateHandler } = await import("../push");

beforeEach(() => {
  listeners.clear();
  removeAllListeners.mockClear();
  addListener.mockClear();
  checkPermissions.mockClear();
  requestPermissions.mockClear();
  register.mockClear();
  apiMock.mockReset();
  apiMock.mockResolvedValue(undefined);
  getPlatformMock.mockReturnValue("android");
  authState.user = { role: "PARENT" };
});

describe("registerPushForSession", () => {
  it("clears stale listeners before re-wiring (idempotent across re-login)", async () => {
    await registerPushForSession();
    await registerPushForSession();
    expect(removeAllListeners).toHaveBeenCalledTimes(2);
  });

  it("requests permission when prompt-state, then registers", async () => {
    checkPermissions.mockResolvedValueOnce({ receive: "prompt" });
    requestPermissions.mockResolvedValueOnce({ receive: "granted" });
    await registerPushForSession();
    expect(requestPermissions).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledTimes(1);
  });

  it("does not register when permission denied", async () => {
    checkPermissions.mockResolvedValueOnce({ receive: "denied" });
    await registerPushForSession();
    expect(register).not.toHaveBeenCalled();
  });

  it("POSTs the FCM token + platform on registration callback", async () => {
    await registerPushForSession();
    const onReg = listeners.get("registration");
    expect(onReg).toBeDefined();
    onReg!({ value: "fcm-token-abc" });
    await Promise.resolve();
    expect(apiMock).toHaveBeenCalledWith("/notifications/push-tokens", {
      method: "POST",
      body: { token: "fcm-token-abc", platform: "ANDROID" },
    });
  });

  it("maps iOS platform to IOS", async () => {
    getPlatformMock.mockReturnValue("ios");
    await registerPushForSession();
    listeners.get("registration")!({ value: "tok-ios" });
    await Promise.resolve();
    expect(apiMock).toHaveBeenLastCalledWith("/notifications/push-tokens", {
      method: "POST",
      body: { token: "tok-ios", platform: "IOS" },
    });
  });
});

describe("pushNotificationActionPerformed (deep link)", () => {
  it("routes child redemption pushes to /me/rewards", async () => {
    authState.user = { role: "CHILD" };
    const navigate = vi.fn();
    setPushNavigateHandler(navigate);
    await registerPushForSession();
    const onAction = listeners.get("pushNotificationActionPerformed");
    onAction!({ notification: { data: { kind: "REDEMPTION_APPROVED" } } });
    expect(navigate).toHaveBeenCalledWith("/me/rewards");
  });

  it("routes child non-redemption pushes to /me/activity", async () => {
    authState.user = { role: "CHILD" };
    const navigate = vi.fn();
    setPushNavigateHandler(navigate);
    await registerPushForSession();
    listeners.get("pushNotificationActionPerformed")!({
      notification: { data: { kind: "LEVEL_UP" } },
    });
    expect(navigate).toHaveBeenCalledWith("/me/activity");
  });

  it("routes parent initiative pushes to /parent/approvals", async () => {
    authState.user = { role: "PARENT" };
    const navigate = vi.fn();
    setPushNavigateHandler(navigate);
    await registerPushForSession();
    listeners.get("pushNotificationActionPerformed")!({
      notification: { data: { kind: "INITIATIVE_APPROVED" } },
    });
    expect(navigate).toHaveBeenCalledWith("/parent/approvals");
  });
});

describe("teardownPushForSession", () => {
  it("DELETEs the registered token and clears listeners", async () => {
    await registerPushForSession();
    listeners.get("registration")!({ value: "tok-delete-me" });
    await Promise.resolve();
    apiMock.mockClear();
    removeAllListeners.mockClear();

    await teardownPushForSession();
    expect(removeAllListeners).toHaveBeenCalledTimes(1);
    expect(apiMock).toHaveBeenCalledWith("/notifications/push-tokens", {
      method: "DELETE",
      body: { token: "tok-delete-me" },
    });
  });

  it("skips DELETE when no token was ever registered", async () => {
    await teardownPushForSession();
    expect(apiMock).not.toHaveBeenCalled();
  });
});
