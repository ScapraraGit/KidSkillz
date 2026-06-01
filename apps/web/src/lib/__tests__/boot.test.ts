import { describe, it, expect, vi, beforeEach } from "vitest";

// Force the native branch — same pattern as push.test.ts.
// initNativeUI is a no-op on web (isNativePlatform = false); that path is
// exercised implicitly by push.test.ts and the full test suite not crashing.
vi.mock("../secureStore", () => ({
  isNativePlatform: true,
  secureStore: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
}));

const setStyleMock = vi.fn(async () => {});
const setBackgroundColorMock = vi.fn(async () => {});
let platformMock = "android";

vi.mock("@capacitor/status-bar", () => ({
  StatusBar: { setStyle: setStyleMock, setBackgroundColor: setBackgroundColorMock },
  Style: { Dark: "DARK", Light: "LIGHT" },
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => platformMock,
  },
}));

// Stubs for the auth + device-session deps pulled in by awaitBoot.
vi.mock("../deviceToken", () => ({ initDeviceSession: vi.fn(async () => {}) }));
vi.mock("../../store/auth", () => ({
  useAuth: {
    persist: { hasHydrated: vi.fn(() => true), onFinishHydration: vi.fn() },
  },
}));

const { initNativeUI } = await import("../boot");

beforeEach(() => {
  setStyleMock.mockClear();
  setBackgroundColorMock.mockClear();
  platformMock = "android";
});

describe("initNativeUI — Android", () => {
  it("sets Dark icon style", async () => {
    platformMock = "android";
    await initNativeUI();
    expect(setStyleMock).toHaveBeenCalledWith({ style: "DARK" });
  });

  it("sets white status-bar background color", async () => {
    platformMock = "android";
    await initNativeUI();
    expect(setBackgroundColorMock).toHaveBeenCalledWith({ color: "#ffffff" });
  });
});

describe("initNativeUI — iOS", () => {
  it("sets Dark icon style", async () => {
    platformMock = "ios";
    await initNativeUI();
    expect(setStyleMock).toHaveBeenCalledWith({ style: "DARK" });
  });

  it("does NOT call setBackgroundColor (iOS status bar is always overlay)", async () => {
    platformMock = "ios";
    await initNativeUI();
    expect(setBackgroundColorMock).not.toHaveBeenCalled();
  });
});

describe("initNativeUI — error resilience", () => {
  it("swallows plugin errors so a missing native dep never throws", async () => {
    setStyleMock.mockRejectedValueOnce(new Error("plugin not available"));
    await expect(initNativeUI()).resolves.toBeUndefined();
  });
});
