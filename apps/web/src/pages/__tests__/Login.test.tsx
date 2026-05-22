import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "../../components/Tooltip";

// Stub the Turnstile component out — it tries to load a Cloudflare script
// at runtime, which has no place inside a unit-test render and would warn
// during teardown. The kid-login flow gates the Find button on the field
// validity, not on Turnstile, so the stub keeps the rest of the surface
// area intact.
vi.mock("../../components/Turnstile", () => ({
  Turnstile: () => null,
  turnstileEnabled: () => false,
}));

// Avoid pulling in the real device-token helpers' localStorage handshake.
vi.mock("../../lib/deviceToken", () => ({
  getDeviceSession: () => null,
  clearDeviceSession: () => {},
}));

import { Login } from "../Login";
import { setLastFamily } from "../../lib/lastFamily";

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <MemoryRouter initialEntries={[path]}>
          <Login initialMode="CHILD" />
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

// Vitest config has globals:false so RTL doesn't auto-cleanup after each
// test. Explicit cleanup keeps each render isolated; without it the
// placeholder lookups find multiple matches across prior renders.
beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("ChildLogin query-param prefill", () => {
  it("prefills name and code from ?fc + ?fn", () => {
    renderAt("/child?fc=ABC123&fn=Smith");
    const nameInput = screen.getByPlaceholderText(/family name/i) as HTMLInputElement;
    const codeInput = screen.getByPlaceholderText(/ABC123/i) as HTMLInputElement;
    expect(nameInput.value).toBe("Smith");
    expect(codeInput.value).toBe("ABC123");
  });

  it("prefills code only when ?fc is present without ?fn", () => {
    renderAt("/child?fc=ZXY654");
    const codeInput = screen.getByPlaceholderText(/ABC123/i) as HTMLInputElement;
    expect(codeInput.value).toBe("ZXY654");
  });

  it("uppercases lowercase code from query string", () => {
    renderAt("/child?fc=abc123");
    const codeInput = screen.getByPlaceholderText(/ABC123/i) as HTMLInputElement;
    expect(codeInput.value).toBe("ABC123");
  });

  it("query param wins over a stale localStorage entry from a different family", () => {
    setLastFamily("Old Family", "OLD999");
    renderAt("/child?fc=NEW123&fn=New%20Family");
    const nameInput = screen.getByPlaceholderText(/family name/i) as HTMLInputElement;
    const codeInput = screen.getByPlaceholderText(/ABC123/i) as HTMLInputElement;
    expect(nameInput.value).toBe("New Family");
    expect(codeInput.value).toBe("NEW123");
    // "Last used" remembered banner suppressed when QR prefilled.
    expect(screen.queryByText(/last used/i)).not.toBeInTheDocument();
  });

  it("shows 'Last used' banner when no query param + localStorage entry present", () => {
    setLastFamily("Smiths", "ABC123");
    renderAt("/child");
    expect(screen.getByText(/last used/i)).toBeInTheDocument();
  });

  it("shows no remembered banner on a clean device with no query param", () => {
    renderAt("/child");
    expect(screen.queryByText(/last used/i)).not.toBeInTheDocument();
  });
});
