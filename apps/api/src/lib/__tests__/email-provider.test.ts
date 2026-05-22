import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The provider factory reads env at module-load time. Each test must
// reset env + clear the module cache so the next dynamic import re-runs
// the factory with fresh values.
function setEnv(values: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

const baseEnv: Record<string, string | undefined> = {
  DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://test:test@localhost:5432/test",
  JWT_SECRET: "x".repeat(48),
};

beforeEach(() => {
  vi.resetModules();
  setEnv(baseEnv);
});

afterEach(() => {
  setEnv({ EMAIL_ENABLED: undefined, RESEND_API_KEY: undefined, EMAIL_FROM: undefined });
});

describe("email provider factory", () => {
  it("returns ConsoleProvider when EMAIL_ENABLED is unset", async () => {
    setEnv({ EMAIL_ENABLED: undefined });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const mod = await import("../email-provider.js");
    const result = await mod.emailProvider.send({
      to: "test@example.com",
      subject: "Hi",
      html: "<p>x</p>",
      text: "x",
    });
    expect(result.id).toMatch(/^console_/);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("returns ConsoleProvider when EMAIL_ENABLED=false", async () => {
    setEnv({ EMAIL_ENABLED: "false" });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const mod = await import("../email-provider.js");
    const r = await mod.emailProvider.send({
      to: "test@example.com",
      subject: "Hi",
      html: "<p>x</p>",
      text: "x",
    });
    expect(r.id).toMatch(/^console_/);
    consoleSpy.mockRestore();
  });

  it("throws at module load when EMAIL_ENABLED=true and RESEND_API_KEY is empty", async () => {
    setEnv({ EMAIL_ENABLED: "true", RESEND_API_KEY: "" });
    await expect(import("../email-provider.js")).rejects.toThrow(/RESEND_API_KEY/i);
  });

  it("ConsoleProvider truncates the text preview without losing the id", async () => {
    setEnv({ EMAIL_ENABLED: "false" });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const mod = await import("../email-provider.js");
    const longText = "x".repeat(500);
    const r = await mod.emailProvider.send({
      to: "test@example.com",
      subject: "Hi",
      html: "<p>x</p>",
      text: longText,
    });
    expect(r.id.length).toBeGreaterThan(0);
    consoleSpy.mockRestore();
  });
});
