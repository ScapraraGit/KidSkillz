import { describe, it, expect, beforeEach, vi } from "vitest";

const findUniqueUserMock = vi.fn();
const createUserMock = vi.fn();
const findUniqueIdentityMock = vi.fn();
const upsertIdentityMock = vi.fn();
const updateIdentityMock = vi.fn();
const createIdentityMock = vi.fn();
const deleteIdentityMock = vi.fn();
const countIdentityMock = vi.fn();
const findManyIdentityMock = vi.fn();
const auditCreateMock = vi.fn();
const findManyMembershipsMock = vi.fn();
const createMembershipMock = vi.fn();
const findUniqueFamilyMock = vi.fn();
const createFamilyMock = vi.fn();
const refreshCreateMock = vi.fn();
const legalCreateMock = vi.fn();

vi.mock("../../db.js", () => ({
  prisma: {
    user: { findUnique: findUniqueUserMock, create: createUserMock },
    oAuthIdentity: {
      findUnique: findUniqueIdentityMock,
      upsert: upsertIdentityMock,
      update: updateIdentityMock,
      create: createIdentityMock,
      delete: deleteIdentityMock,
      count: countIdentityMock,
      findMany: findManyIdentityMock,
    },
    auditEvent: { create: auditCreateMock },
    familyMembership: { findMany: findManyMembershipsMock, create: createMembershipMock },
    family: { findUnique: findUniqueFamilyMock, create: createFamilyMock },
    refreshToken: { create: refreshCreateMock },
    legalAcceptance: { create: legalCreateMock },
  },
}));

// Stub out the lazy-imported seed/billing helpers used by signupWithIdentity.
vi.mock("../billing.js", () => ({ startTrial: vi.fn(async () => {}) }));
vi.mock("../challenges.js", () => ({ seedDefaultChallenges: vi.fn(async () => {}) }));
vi.mock("../task-categories.js", () => ({ seedDefaultCategories: vi.fn(async () => {}) }));
vi.mock("../seed-defaults.js", () => ({
  seedDefaultRewards: vi.fn(async () => {}),
  seedDefaultTasks: vi.fn(async () => {}),
}));
vi.mock("../legal-acceptance.js", () => ({
  recordLegalAcceptance: vi.fn(async () => ({})),
}));

vi.mock("../../env.js", () => ({
  env: {
    JWT_SECRET: "x".repeat(48),
    JWT_ACCESS_TTL: "15m",
    SOCIAL_LOGIN_ENABLED: true,
    GOOGLE_OAUTH_REDIRECT_URI: "https://app.example.com/cb",
    APP_URL: "https://app.example.com",
    REFRESH_TOKEN_TTL_DAYS: 7,
    NODE_ENV: "test",
  },
}));

vi.mock("../../lib/oauth-provider.js", () => ({
  getOAuthProvider: vi.fn(() => ({
    name: "GOOGLE",
    buildAuthUrl: vi.fn(() => "https://accounts.google.com/x"),
    exchangeCode: vi.fn(),
    verifyIdToken: vi.fn(),
  })),
}));

const {
  linkIdentity,
  mintOAuthState,
  verifyOAuthState,
  buildAuthorizeUrl,
  signinWithIdentity,
  signupWithIdentity,
  unlinkIdentity,
  storeOAuthTicket,
  consumeOAuthTicket,
  buildStateCookie,
  readStateCookie,
} = await import("../oauth.js");

const baseClaims = {
  sub: "google-sub-123",
  email: "parent@example.com",
  emailVerified: true,
  name: "Parent",
};

beforeEach(() => {
  findUniqueUserMock.mockReset();
  createUserMock.mockReset();
  findUniqueIdentityMock.mockReset();
  upsertIdentityMock.mockReset();
  updateIdentityMock.mockReset();
  createIdentityMock.mockReset();
  deleteIdentityMock.mockReset();
  countIdentityMock.mockReset();
  findManyIdentityMock.mockReset();
  auditCreateMock.mockReset();
  findManyMembershipsMock.mockReset();
  createMembershipMock.mockReset();
  findUniqueFamilyMock.mockReset();
  createFamilyMock.mockReset();
  refreshCreateMock.mockReset();
  legalCreateMock.mockReset();
});

describe("oauth state mint/verify", () => {
  it("round-trips a LINK state", () => {
    const { state, nonce } = mintOAuthState({ intent: "LINK", provider: "GOOGLE", userId: "u1" });
    const decoded = verifyOAuthState(state);
    expect(decoded.intent).toBe("LINK");
    expect(decoded.uid).toBe("u1");
    expect(decoded.provider).toBe("GOOGLE");
    expect(decoded.nonce).toBe(nonce);
  });

  it("rejects garbage state", () => {
    expect(() => verifyOAuthState("not-a-jwt")).toThrow();
  });
});

describe("buildAuthorizeUrl", () => {
  it("returns provider URL + state", () => {
    const r = buildAuthorizeUrl({ provider: "GOOGLE", intent: "LINK", userId: "u1" });
    expect(r.url).toBe("https://accounts.google.com/x");
    expect(r.state.length).toBeGreaterThan(0);
  });
});

describe("linkIdentity", () => {
  it("rejects when Google email is unverified", async () => {
    await expect(
      linkIdentity({
        userId: "u1",
        provider: "GOOGLE",
        claims: { ...baseClaims, emailVerified: false },
      }),
    ).rejects.toMatchObject({ code: "OAUTH_EMAIL_UNVERIFIED" });
    expect(findUniqueUserMock).not.toHaveBeenCalled();
  });

  it("rejects when user has verified email and Google email differs", async () => {
    findUniqueUserMock.mockResolvedValue({
      id: "u1",
      email: "different@example.com",
      emailVerifiedAt: new Date(),
      familyId: "f1",
    });
    await expect(
      linkIdentity({ userId: "u1", provider: "GOOGLE", claims: baseClaims }),
    ).rejects.toMatchObject({ code: "OAUTH_EMAIL_MISMATCH" });
  });

  it("allows link when user email is unset or unverified", async () => {
    findUniqueUserMock.mockResolvedValue({
      id: "u1",
      email: "different@example.com",
      emailVerifiedAt: null,
      familyId: "f1",
    });
    findUniqueIdentityMock.mockResolvedValue(null);
    upsertIdentityMock.mockResolvedValue({ id: "ident-1", linkedAt: new Date() });
    const r = await linkIdentity({ userId: "u1", provider: "GOOGLE", claims: baseClaims });
    expect(r.identityId).toBe("ident-1");
    expect(upsertIdentityMock).toHaveBeenCalledOnce();
    expect(auditCreateMock).toHaveBeenCalledOnce();
  });

  it("rejects when providerSub already bound to a different user", async () => {
    findUniqueUserMock.mockResolvedValue({
      id: "u1",
      email: "parent@example.com",
      emailVerifiedAt: new Date(),
      familyId: "f1",
    });
    findUniqueIdentityMock.mockResolvedValue({ id: "other-ident", userId: "u2" });
    await expect(
      linkIdentity({ userId: "u1", provider: "GOOGLE", claims: baseClaims }),
    ).rejects.toMatchObject({ code: "OAUTH_SUB_TAKEN" });
  });

  it("upserts when re-linking the same user (idempotent)", async () => {
    findUniqueUserMock.mockResolvedValue({
      id: "u1",
      email: "parent@example.com",
      emailVerifiedAt: new Date(),
      familyId: "f1",
    });
    findUniqueIdentityMock.mockResolvedValue({ id: "ident-1", userId: "u1" });
    upsertIdentityMock.mockResolvedValue({ id: "ident-1", linkedAt: new Date(Date.now() - 86_400_000) });
    const r = await linkIdentity({ userId: "u1", provider: "GOOGLE", claims: baseClaims });
    expect(r.identityId).toBe("ident-1");
    expect(upsertIdentityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { provider_userId: { provider: "GOOGLE", userId: "u1" } },
      }),
    );
  });

  it("skips audit when user has no familyId", async () => {
    findUniqueUserMock.mockResolvedValue({
      id: "u1",
      email: "parent@example.com",
      emailVerifiedAt: new Date(),
      familyId: null,
    });
    findUniqueIdentityMock.mockResolvedValue(null);
    upsertIdentityMock.mockResolvedValue({ id: "ident-1", linkedAt: new Date() });
    await linkIdentity({ userId: "u1", provider: "GOOGLE", claims: baseClaims });
    expect(auditCreateMock).not.toHaveBeenCalled();
  });
});

describe("signinWithIdentity", () => {
  it("rejects unverified Google email", async () => {
    await expect(
      signinWithIdentity({ provider: "GOOGLE", claims: { ...baseClaims, emailVerified: false } }),
    ).rejects.toMatchObject({ code: "OAUTH_EMAIL_UNVERIFIED" });
  });

  it("returns UNLINKED_EMAIL_MATCH when sub unknown but email is on an existing user", async () => {
    findUniqueIdentityMock.mockResolvedValue(null);
    findUniqueUserMock.mockResolvedValue({ id: "u1" });
    const r = await signinWithIdentity({ provider: "GOOGLE", claims: baseClaims });
    expect(r).toEqual({ kind: "UNLINKED_EMAIL_MATCH", email: "parent@example.com" });
  });

  it("returns NO_ACCOUNT when sub unknown and email has no user", async () => {
    findUniqueIdentityMock.mockResolvedValue(null);
    findUniqueUserMock.mockResolvedValue(null);
    const r = await signinWithIdentity({ provider: "GOOGLE", claims: baseClaims });
    expect(r).toEqual({ kind: "NO_ACCOUNT", email: "parent@example.com" });
  });

  it("rejects when linked user is CHILD", async () => {
    findUniqueIdentityMock.mockResolvedValue({ id: "ident-1", userId: "c1" });
    findUniqueUserMock.mockResolvedValue({
      id: "c1",
      role: "CHILD",
      isActive: true,
      isAdmin: false,
      tokenVersion: 0,
      familyId: "f1",
    });
    updateIdentityMock.mockResolvedValue({});
    await expect(signinWithIdentity({ provider: "GOOGLE", claims: baseClaims })).rejects.toMatchObject({
      status: 403,
    });
  });

  it("mints tokens for single-family parent", async () => {
    findUniqueIdentityMock.mockResolvedValue({ id: "ident-1", userId: "u1" });
    findUniqueUserMock.mockResolvedValue({
      id: "u1",
      role: "PARENT",
      isActive: true,
      isAdmin: false,
      tokenVersion: 0,
      familyId: null,
    });
    updateIdentityMock.mockResolvedValue({});
    findManyMembershipsMock.mockResolvedValue([
      {
        id: "m1",
        role: "PARENT",
        isBillingOwner: true,
        family: { id: "f1", name: "Smiths" },
      },
    ]);
    refreshCreateMock.mockResolvedValue({});
    const r = await signinWithIdentity({ provider: "GOOGLE", claims: baseClaims });
    expect(r.kind).toBe("TOKENS");
    if (r.kind === "TOKENS") {
      expect(r.userId).toBe("u1");
      expect(r.token.length).toBeGreaterThan(0);
      expect(r.refreshToken.length).toBeGreaterThan(0);
    }
    expect(auditCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: "OAUTH_SIGNIN" }) }),
    );
  });

  it("returns FAMILY_SELECT for multi-family parent", async () => {
    findUniqueIdentityMock.mockResolvedValue({ id: "ident-1", userId: "u1" });
    findUniqueUserMock.mockResolvedValue({
      id: "u1",
      role: "PARENT",
      isActive: true,
      isAdmin: false,
      tokenVersion: 0,
      familyId: null,
    });
    updateIdentityMock.mockResolvedValue({});
    findManyMembershipsMock.mockResolvedValue([
      { id: "m1", role: "PARENT", isBillingOwner: true, family: { id: "f1", name: "A" } },
      { id: "m2", role: "PARENT", isBillingOwner: false, family: { id: "f2", name: "B" } },
    ]);
    const r = await signinWithIdentity({ provider: "GOOGLE", claims: baseClaims });
    expect(r.kind).toBe("FAMILY_SELECT");
    if (r.kind === "FAMILY_SELECT") {
      expect(r.families).toHaveLength(2);
      expect(r.selectToken.length).toBeGreaterThan(0);
    }
    expect(refreshCreateMock).not.toHaveBeenCalled();
  });
});

describe("oauth ticket exchange", () => {
  it("round-trips and burns on consume", () => {
    const code = storeOAuthTicket({ kind: "NO_ACCOUNT", email: "x@y.com" });
    const r = consumeOAuthTicket(code);
    expect(r.kind).toBe("NO_ACCOUNT");
    expect(() => consumeOAuthTicket(code)).toThrow();
  });

  it("rejects unknown ticket", () => {
    expect(() => consumeOAuthTicket("not-a-real-code")).toThrow();
  });
});

describe("signupWithIdentity", () => {
  it("rejects unverified Google email", async () => {
    await expect(
      signupWithIdentity({
        provider: "GOOGLE",
        claims: { ...baseClaims, emailVerified: false },
        familyName: "Smiths",
        acceptedTermsVersion: 1,
      }),
    ).rejects.toMatchObject({ code: "OAUTH_EMAIL_UNVERIFIED" });
  });

  it("rejects when email already belongs to a user", async () => {
    findUniqueUserMock.mockResolvedValue({ id: "existing" });
    await expect(
      signupWithIdentity({
        provider: "GOOGLE",
        claims: baseClaims,
        familyName: "Smiths",
        acceptedTermsVersion: 1,
      }),
    ).rejects.toMatchObject({ code: "EMAIL_IN_USE" });
  });

  it("rejects when provider sub is already linked", async () => {
    findUniqueUserMock.mockResolvedValue(null);
    findUniqueIdentityMock.mockResolvedValue({ id: "other" });
    await expect(
      signupWithIdentity({
        provider: "GOOGLE",
        claims: baseClaims,
        familyName: "Smiths",
        acceptedTermsVersion: 1,
      }),
    ).rejects.toMatchObject({ code: "OAUTH_SUB_TAKEN" });
  });

  it("creates family + user + identity + audit on happy path", async () => {
    findUniqueUserMock.mockResolvedValue(null);
    findUniqueIdentityMock.mockResolvedValue(null);
    createFamilyMock.mockResolvedValue({ id: "f1", name: "Smiths" });
    createUserMock.mockResolvedValue({
      id: "u1",
      role: "PARENT",
      isAdmin: false,
      tokenVersion: 0,
    });
    createMembershipMock.mockResolvedValue({ id: "m1" });
    createIdentityMock.mockResolvedValue({ id: "i1" });
    refreshCreateMock.mockResolvedValue({});
    const r = await signupWithIdentity({
      provider: "GOOGLE",
      claims: baseClaims,
      familyName: "Smiths",
      acceptedTermsVersion: 1,
    });
    expect(r.kind).toBe("TOKENS");
    expect(r.userId).toBe("u1");
    expect(createFamilyMock).toHaveBeenCalledOnce();
    expect(createUserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: "parent@example.com", passwordHash: null }),
      }),
    );
    expect(createIdentityMock).toHaveBeenCalledOnce();
    expect(auditCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: "OAUTH_SIGNUP" }) }),
    );
  });
});

describe("unlinkIdentity", () => {
  it("404s when identity belongs to a different user", async () => {
    findUniqueIdentityMock.mockResolvedValue({ id: "i1", userId: "other", provider: "GOOGLE" });
    await expect(unlinkIdentity({ userId: "u1", identityId: "i1" })).rejects.toMatchObject({ status: 404 });
  });

  it("blocks unlink when user has no password and no other identity", async () => {
    findUniqueIdentityMock.mockResolvedValue({ id: "i1", userId: "u1", provider: "GOOGLE" });
    findUniqueUserMock.mockResolvedValue({ passwordHash: null, familyId: "f1" });
    countIdentityMock.mockResolvedValue(0);
    await expect(unlinkIdentity({ userId: "u1", identityId: "i1" })).rejects.toMatchObject({
      code: "OAUTH_LAST_IDENTITY",
    });
    expect(deleteIdentityMock).not.toHaveBeenCalled();
  });

  it("allows unlink when user has a password", async () => {
    findUniqueIdentityMock.mockResolvedValue({ id: "i1", userId: "u1", provider: "GOOGLE" });
    findUniqueUserMock.mockResolvedValue({ passwordHash: "hash", familyId: "f1" });
    countIdentityMock.mockResolvedValue(0);
    await unlinkIdentity({ userId: "u1", identityId: "i1" });
    expect(deleteIdentityMock).toHaveBeenCalledWith({ where: { id: "i1" } });
    expect(auditCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: "OAUTH_UNLINKED" }) }),
    );
  });

  it("allows unlink when another identity remains", async () => {
    findUniqueIdentityMock.mockResolvedValue({ id: "i1", userId: "u1", provider: "GOOGLE" });
    findUniqueUserMock.mockResolvedValue({ passwordHash: null, familyId: "f1" });
    countIdentityMock.mockResolvedValue(1);
    await unlinkIdentity({ userId: "u1", identityId: "i1" });
    expect(deleteIdentityMock).toHaveBeenCalledOnce();
  });
});

describe("state cookie helpers", () => {
  it("builds + reads back the jti", () => {
    const header = buildStateCookie("my-jti");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    const cookieHeader = "other=foo; cc_oauth_state=my-jti; another=bar";
    expect(readStateCookie(cookieHeader)).toBe("my-jti");
  });

  it("returns null when cookie is absent", () => {
    expect(readStateCookie(undefined)).toBe(null);
    expect(readStateCookie("other=foo")).toBe(null);
  });
});
