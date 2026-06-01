import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "../Tooltip";

vi.mock("../../lib/native", () => ({ isNative: () => true, haptic: vi.fn() }));
vi.mock("../../store/auth", () => ({
  useAuth: (sel: (s: { user: unknown }) => unknown) =>
    sel({ user: { name: "Ada", avatarColor: "#6366f1", avatarConfig: null } }),
}));
vi.mock("../NotificationBell", () => ({ NotificationBell: () => <div data-testid="bell" /> }));
vi.mock("../SoundToggle", () => ({ SoundToggle: () => <div data-testid="sound" /> }));
vi.mock("../KidAvatar", () => ({
  KidAvatar: ({ name }: { name: string }) => <div data-testid="avatar">{name}</div>,
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const real = await importOriginal<typeof import("react-router-dom")>();
  return { ...real, useNavigate: () => mockNavigate };
});

const { NativeHeader } = await import("../NativeHeader");

function renderHeader(historyIdx = 0, role: "PARENT" | "CHILD" = "PARENT") {
  // Simulate React Router 6 history state index
  Object.defineProperty(window, "history", {
    value: { ...window.history, state: { idx: historyIdx } },
    configurable: true,
  });
  return render(
    <TooltipProvider>
      <MemoryRouter>
        <NativeHeader title="Test Screen" role={role} />
      </MemoryRouter>
    </TooltipProvider>,
  );
}

beforeEach(() => {
  mockNavigate.mockClear();
});

describe("NativeHeader", () => {
  it("renders the screen title", () => {
    renderHeader(0);
    expect(screen.getByText("Test Screen")).toBeInTheDocument();
  });

  it("does NOT show back button when history.idx === 0 (root / cold launch)", () => {
    renderHeader(0);
    expect(screen.queryByLabelText("Go back")).toBeNull();
  });

  it("shows back button when history.idx > 0 (navigated here)", () => {
    renderHeader(1);
    expect(screen.getByLabelText("Go back")).toBeInTheDocument();
  });

  it("calls navigate(-1) on back button press", () => {
    renderHeader(2);
    fireEvent.click(screen.getByLabelText("Go back"));
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  it("shows NotificationBell for both roles", () => {
    renderHeader(0, "PARENT");
    expect(screen.getByTestId("bell")).toBeInTheDocument();
  });

  it("shows SoundToggle for CHILD role only", () => {
    renderHeader(0, "CHILD");
    expect(screen.getByTestId("sound")).toBeInTheDocument();
  });

  it("does NOT show SoundToggle for PARENT role", () => {
    renderHeader(0, "PARENT");
    expect(screen.queryByTestId("sound")).toBeNull();
  });
});
