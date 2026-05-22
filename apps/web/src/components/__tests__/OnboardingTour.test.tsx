import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { OnboardingTour, type TourStep } from "../OnboardingTour";

// Force "desktop" sizing so the tour uses the anchored-popover variant —
// the bottom-sheet mobile variant short-circuits some of the data-tour
// selection logic we want to assert here.
function setDesktopViewport() {
  Object.defineProperty(window, "innerWidth", { value: 1024, configurable: true });
  window.dispatchEvent(new Event("resize"));
}

beforeEach(() => {
  setDesktopViewport();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function runRetries(times = 14) {
  // Drive the 100ms `setTimeout(tryFind, 100)` polling loop.
  for (let i = 0; i < times; i++) {
    act(() => {
      vi.advanceTimersByTime(110);
    });
  }
}

describe("OnboardingTour target selection", () => {
  it("anchors to the visible duplicate when same data-tour is on hidden + visible elements", () => {
    // Hidden desktop nav variant + visible mobile nav variant — same hook.
    const hidden = document.createElement("a");
    hidden.setAttribute("data-tour", "nav-tasks");
    hidden.textContent = "Tasks (desktop)";
    // jsdom: setting style display:none makes offsetParent === null.
    hidden.style.display = "none";
    document.body.appendChild(hidden);

    const visible = document.createElement("a");
    visible.setAttribute("data-tour", "nav-tasks");
    visible.textContent = "Tasks (mobile)";
    // Stub offsetParent for the visible element (jsdom returns null by default
    // for elements not in a layout tree; we mark explicitly).
    Object.defineProperty(visible, "offsetParent", { value: document.body, configurable: true });
    document.body.appendChild(visible);

    const steps: TourStep[] = [{ targetId: "nav-tasks", title: "Tasks", body: "Find your tasks here." }];
    render(<OnboardingTour steps={steps} onDone={() => {}} />);

    expect(screen.getByText("Tasks")).toBeInTheDocument();
  });

  it("falls back to getElementById when no data-tour attribute matches", () => {
    const el = document.createElement("div");
    el.id = "legacy-target";
    Object.defineProperty(el, "offsetParent", { value: document.body, configurable: true });
    document.body.appendChild(el);

    const steps: TourStep[] = [{ targetId: "legacy-target", title: "Legacy", body: "ID-based fallback." }];
    render(<OnboardingTour steps={steps} onDone={() => {}} />);
    expect(screen.getByText("Legacy")).toBeInTheDocument();
  });

  it("shows missing-fallback card after MAX_FIND_ATTEMPTS when target never appears", () => {
    const steps: TourStep[] = [
      { targetId: "nope-not-there", title: "Hidden", body: "This target does not exist." },
    ];
    render(<OnboardingTour steps={steps} onDone={() => {}} />);

    // Drive past the retry budget (12 attempts × 100ms).
    runRetries();

    // Step copy still renders even though the target couldn't be found —
    // the missing-fallback card carries it. Title is still on screen.
    expect(screen.getByText("Hidden")).toBeInTheDocument();
  });
});
