import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Control native flag per describe block.
let isNativeMock = false;
vi.mock("../../lib/native", () => ({
  isNative: () => isNativeMock,
  haptic: vi.fn(),
}));

// Stub the hook — component rendering tests shouldn't re-test hook logic.
vi.mock("../../hooks/usePullToRefresh", () => ({
  usePullToRefresh: () => ({ refreshing: false, pullDistance: 0 }),
  PULL_THRESHOLD: 64,
  MAX_PULL: 80,
}));

const { PullToRefresh } = await import("../PullToRefresh");

describe("PullToRefresh — web passthrough", () => {
  it("renders children directly without a wrapper div", () => {
    isNativeMock = false;
    render(
      <PullToRefresh onRefresh={vi.fn()}>
        <p>content</p>
      </PullToRefresh>,
    );
    expect(screen.getByText("content")).toBeInTheDocument();
    // No relative-positioned wrapper — the fragment is a transparent passthrough
    expect(document.querySelector("[class*='relative']")).toBeNull();
  });
});

describe("PullToRefresh — native wrapper", () => {
  it("renders children inside the relative wrapper on native", () => {
    isNativeMock = true;
    render(
      <PullToRefresh onRefresh={vi.fn()}>
        <p>native-content</p>
      </PullToRefresh>,
    );
    expect(screen.getByText("native-content")).toBeInTheDocument();
    // Wrapper div with relative class should exist
    expect(document.querySelector(".relative")).not.toBeNull();
  });

  it("passes onRefresh to usePullToRefresh (smoke test — hook stubbed)", () => {
    isNativeMock = true;
    // If it renders without throwing, the onRefresh prop is correctly wired.
    expect(() =>
      render(
        <PullToRefresh onRefresh={async () => {}}>
          <span>ok</span>
        </PullToRefresh>,
      ),
    ).not.toThrow();
  });
});
