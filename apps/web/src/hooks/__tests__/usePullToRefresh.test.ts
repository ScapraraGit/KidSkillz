import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Control native flag per test.
let isNativeMock = false;
vi.mock("../../lib/native", () => ({
  isNative: () => isNativeMock,
  haptic: vi.fn(),
}));

const { usePullToRefresh, PULL_THRESHOLD } = await import("../usePullToRefresh");

function fire(type: "touchstart" | "touchmove" | "touchend", y = 0) {
  const evt =
    type === "touchend"
      ? new Event("touchend")
      : new TouchEvent(type, {
          touches: [{ clientY: y } as Touch],
        });
  window.dispatchEvent(evt);
}

beforeEach(() => {
  isNativeMock = false;
  // Reset scroll position
  Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
});

afterEach(() => {
  isNativeMock = false;
});

describe("usePullToRefresh — web (no-op)", () => {
  it("adds no window listeners when isNative is false", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    renderHook(() => usePullToRefresh(vi.fn()));
    expect(addSpy).not.toHaveBeenCalled();
    addSpy.mockRestore();
  });

  it("returns refreshing=false and pullDistance=0 on web", () => {
    const { result } = renderHook(() => usePullToRefresh(vi.fn()));
    expect(result.current.refreshing).toBe(false);
    expect(result.current.pullDistance).toBe(0);
  });
});

describe("usePullToRefresh — native", () => {
  beforeEach(() => {
    isNativeMock = true;
  });

  it("adds and removes window listeners on mount/unmount", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = renderHook(() => usePullToRefresh(vi.fn()));

    const events = addSpy.mock.calls.map((c) => c[0]);
    expect(events).toContain("touchstart");
    expect(events).toContain("touchmove");
    expect(events).toContain("touchend");

    unmount();

    const removed = removeSpy.mock.calls.map((c) => c[0]);
    expect(removed).toContain("touchstart");
    expect(removed).toContain("touchmove");
    expect(removed).toContain("touchend");

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it("does not activate pull when scrollY > 0 (mid-page scroll)", () => {
    Object.defineProperty(window, "scrollY", { value: 50, configurable: true });
    const { result } = renderHook(() => usePullToRefresh(vi.fn()));

    act(() => {
      fire("touchstart", 100);
      fire("touchmove", 200); // 100px downward drag
    });

    expect(result.current.pullDistance).toBe(0);
  });

  it("accumulates pullDistance when dragging down at scroll top", () => {
    const { result } = renderHook(() => usePullToRefresh(vi.fn()));

    act(() => {
      fire("touchstart", 100);
      fire("touchmove", 200); // 100px drag
    });

    // Resistance-adjusted — not raw 100px but > 0
    expect(result.current.pullDistance).toBeGreaterThan(0);
    expect(result.current.pullDistance).toBeLessThanOrEqual(80); // MAX_PULL cap
  });

  it("resets pullDistance to 0 when drag moves back up", () => {
    const { result } = renderHook(() => usePullToRefresh(vi.fn()));

    act(() => {
      fire("touchstart", 100);
      fire("touchmove", 200);
    });
    expect(result.current.pullDistance).toBeGreaterThan(0);

    act(() => {
      fire("touchmove", 80); // back above start
    });
    expect(result.current.pullDistance).toBe(0);
  });

  it("fires onRefresh when released past PULL_THRESHOLD", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => usePullToRefresh(onRefresh));

    // Pull far enough (resistance-adjusted PULL_THRESHOLD ≈ sqrt(x)*5 = 64 → x ≈ 164)
    act(() => {
      fire("touchstart", 0);
      fire("touchmove", 200); // well past any resistance-adjusted threshold
    });

    expect(result.current.pullDistance).toBeGreaterThanOrEqual(PULL_THRESHOLD);

    await act(async () => {
      fire("touchend");
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire onRefresh when released before PULL_THRESHOLD", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    renderHook(() => usePullToRefresh(onRefresh));

    act(() => {
      fire("touchstart", 0);
      fire("touchmove", 5); // tiny drag — resistance-adjusted well below threshold
    });

    await act(async () => {
      fire("touchend");
    });

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("sets refreshing=true during onRefresh, false after", async () => {
    let resolveRefresh!: () => void;
    const onRefresh = vi.fn(
      () =>
        new Promise<void>((res) => {
          resolveRefresh = res;
        }),
    );
    const { result } = renderHook(() => usePullToRefresh(onRefresh));

    act(() => {
      fire("touchstart", 0);
      fire("touchmove", 200);
    });

    act(() => {
      fire("touchend");
    });
    // Give the async path a tick to start
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.refreshing).toBe(true);

    await act(async () => {
      resolveRefresh();
    });

    expect(result.current.refreshing).toBe(false);
  });
});
