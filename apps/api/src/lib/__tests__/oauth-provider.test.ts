import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
  setEnv({
    SOCIAL_LOGIN_ENABLED: undefined,
    GOOGLE_OAUTH_CLIENT_ID: undefined,
    GOOGLE_OAUTH_CLIENT_SECRET: undefined,
    GOOGLE_OAUTH_REDIRECT_URI: undefined,
  });
});

describe("oauth provider factory", () => {
  it("returns DisabledOAuthProvider when SOCIAL_LOGIN_ENABLED is unset", async () => {
    setEnv({ SOCIAL_LOGIN_ENABLED: undefined });
    const mod = await import("../oauth-provider.js");
    expect(mod.googleOAuthProvider.name).toBe("GOOGLE");
    expect(() =>
      mod.googleOAuthProvider.buildAuthUrl({ state: "s", nonce: "n", redirectUri: "https://x" }),
    ).toThrow(/disabled/i);
  });

  it("returns DisabledOAuthProvider when SOCIAL_LOGIN_ENABLED=false", async () => {
    setEnv({ SOCIAL_LOGIN_ENABLED: "false" });
    const mod = await import("../oauth-provider.js");
    await expect(mod.googleOAuthProvider.verifyIdToken({ idToken: "x", nonce: "n" })).rejects.toThrow(
      /disabled/i,
    );
  });

  it("throws at module load when enabled without client id/secret", async () => {
    setEnv({
      SOCIAL_LOGIN_ENABLED: "true",
      GOOGLE_OAUTH_CLIENT_ID: "",
      GOOGLE_OAUTH_CLIENT_SECRET: "",
      GOOGLE_OAUTH_REDIRECT_URI: "https://app.example.com/cb",
    });
    await expect(import("../oauth-provider.js")).rejects.toThrow(/GOOGLE_OAUTH_CLIENT_ID/);
  });

  it("throws at module load when enabled without redirect uri", async () => {
    setEnv({
      SOCIAL_LOGIN_ENABLED: "true",
      GOOGLE_OAUTH_CLIENT_ID: "cid",
      GOOGLE_OAUTH_CLIENT_SECRET: "csec",
      GOOGLE_OAUTH_REDIRECT_URI: "",
    });
    await expect(import("../oauth-provider.js")).rejects.toThrow(/REDIRECT_URI/);
  });

  it("buildAuthUrl emits expected Google authorization endpoint with state + nonce", async () => {
    setEnv({
      SOCIAL_LOGIN_ENABLED: "true",
      GOOGLE_OAUTH_CLIENT_ID: "cid",
      GOOGLE_OAUTH_CLIENT_SECRET: "csec",
      GOOGLE_OAUTH_REDIRECT_URI: "https://app.example.com/cb",
    });
    const mod = await import("../oauth-provider.js");
    const url = new URL(
      mod.googleOAuthProvider.buildAuthUrl({
        state: "state-token",
        nonce: "nonce-token",
        redirectUri: "https://app.example.com/cb",
      }),
    );
    expect(url.hostname).toBe("accounts.google.com");
    expect(url.searchParams.get("client_id")).toBe("cid");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.example.com/cb");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toContain("openid");
    expect(url.searchParams.get("state")).toBe("state-token");
    expect(url.searchParams.get("nonce")).toBe("nonce-token");
  });

  it("getOAuthProvider returns the same instance for GOOGLE", async () => {
    setEnv({ SOCIAL_LOGIN_ENABLED: "false" });
    const mod = await import("../oauth-provider.js");
    expect(mod.getOAuthProvider("GOOGLE")).toBe(mod.googleOAuthProvider);
  });
});
