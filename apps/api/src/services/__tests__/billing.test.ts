import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock prisma + env BEFORE importing the service so the service binds the mocks.
const findUniqueMock = vi.fn();
const updateMock = vi.fn();
const stripeEventCreateMock = vi.fn();
const stripeEventUpdateMock = vi.fn();
const overrideLogCreateMock = vi.fn();
const transactionMock = vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops));

vi.mock("../../db.js", () => ({
  prisma: {
    family: { findUnique: findUniqueMock, update: updateMock, findFirst: vi.fn() },
    stripeEvent: { create: stripeEventCreateMock, update: stripeEventUpdateMock },
    billingOverrideLog: { create: overrideLogCreateMock, findMany: vi.fn() },
    // getEntitlement now also probes IAP grants; default null so non-IAP cases unaffected.
    iapEntitlementGrant: { findFirst: vi.fn().mockResolvedValue(null) },
    $transaction: transactionMock,
  },
}));

vi.mock("stripe", () => ({
  default: class {
    customers = { create: vi.fn() };
    checkout = { sessions: { create: vi.fn() } };
    billingPortal = { sessions: { create: vi.fn() } };
    webhooks = { constructEvent: vi.fn() };
  },
}));

vi.mock("../../env.js", () => ({
  env: {
    BILLING_TRIAL_DAYS: 10,
    APP_URL: "http://test",
    STRIPE_SECRET_KEY: "",
    STRIPE_WEBHOOK_SECRET: "",
    STRIPE_PRICE_BASIC_MONTHLY: "price_basic",
    STRIPE_PRICE_PREMIUM_MONTHLY: "price_premium",
  },
}));

const { getEntitlement, setBillingOverride, clearBillingOverride, handleWebhook } =
  await import("../billing.js");

beforeEach(() => {
  findUniqueMock.mockReset();
  updateMock.mockReset();
  stripeEventCreateMock.mockReset();
  stripeEventUpdateMock.mockReset();
  overrideLogCreateMock.mockReset();
  transactionMock.mockClear();
});

function famRow(overrides: Partial<any> = {}) {
  return {
    subscriptionStatus: "TRIALING",
    currentPlan: "BASIC",
    trialEndsAt: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    billingOverride: "NONE",
    billingOverrideReason: null,
    billingOverrideUntil: null,
    ...overrides,
  };
}

describe("getEntitlement", () => {
  it("trialing-active: source=TRIAL, isPaid=true", async () => {
    findUniqueMock.mockResolvedValueOnce(
      famRow({ trialEndsAt: new Date(Date.now() + 86400000), subscriptionStatus: "TRIALING" }),
    );
    const ent = await getEntitlement("f1");
    expect(ent.isPaid).toBe(true);
    expect(ent.source).toBe("TRIAL");
    expect(ent.override).toBe("NONE");
  });

  it("trialing-expired: source=STRIPE, isPaid=false", async () => {
    findUniqueMock.mockResolvedValueOnce(
      famRow({ trialEndsAt: new Date(Date.now() - 86400000), subscriptionStatus: "TRIALING" }),
    );
    const ent = await getEntitlement("f1");
    expect(ent.isPaid).toBe(false);
    expect(ent.source).toBe("STRIPE");
  });

  it("ACTIVE subscription: paid, source=STRIPE", async () => {
    findUniqueMock.mockResolvedValueOnce(famRow({ subscriptionStatus: "ACTIVE" }));
    const ent = await getEntitlement("f1");
    expect(ent.isPaid).toBe(true);
    expect(ent.source).toBe("STRIPE");
  });

  it("CANCELED subscription: not paid", async () => {
    findUniqueMock.mockResolvedValueOnce(famRow({ subscriptionStatus: "CANCELED" }));
    const ent = await getEntitlement("f1");
    expect(ent.isPaid).toBe(false);
  });

  it("PAST_DUE subscription: not paid (gate blocks)", async () => {
    findUniqueMock.mockResolvedValueOnce(famRow({ subscriptionStatus: "PAST_DUE" }));
    const ent = await getEntitlement("f1");
    expect(ent.isPaid).toBe(false);
  });

  it("FREE_FOREVER override beats CANCELED Stripe state", async () => {
    findUniqueMock.mockResolvedValueOnce(
      famRow({
        subscriptionStatus: "CANCELED",
        billingOverride: "FREE_FOREVER",
        billingOverrideReason: "Friends & family",
      }),
    );
    const ent = await getEntitlement("f1");
    expect(ent.isPaid).toBe(true);
    expect(ent.source).toBe("OVERRIDE");
    expect(ent.plan).toBe("BASIC");
    expect(ent.isPremium).toBe(false);
  });

  it("COMPED_PREMIUM override → isPremium=true regardless of Stripe plan=BASIC", async () => {
    findUniqueMock.mockResolvedValueOnce(famRow({ currentPlan: "BASIC", billingOverride: "COMPED_PREMIUM" }));
    const ent = await getEntitlement("f1");
    expect(ent.isPremium).toBe(true);
    expect(ent.plan).toBe("PREMIUM");
    expect(ent.source).toBe("OVERRIDE");
  });

  it("FREE_UNTIL active: paid via override", async () => {
    findUniqueMock.mockResolvedValueOnce(
      famRow({
        subscriptionStatus: "CANCELED",
        billingOverride: "FREE_UNTIL",
        billingOverrideUntil: new Date(Date.now() + 86400000),
      }),
    );
    const ent = await getEntitlement("f1");
    expect(ent.isPaid).toBe(true);
    expect(ent.source).toBe("OVERRIDE");
  });

  it("FREE_UNTIL expired: falls through to Stripe state", async () => {
    findUniqueMock.mockResolvedValueOnce(
      famRow({
        subscriptionStatus: "CANCELED",
        billingOverride: "FREE_UNTIL",
        billingOverrideUntil: new Date(Date.now() - 86400000),
      }),
    );
    const ent = await getEntitlement("f1");
    expect(ent.isPaid).toBe(false);
    expect(ent.source).toBe("STRIPE");
  });
});

describe("setBillingOverride", () => {
  it("requires `until` for FREE_UNTIL", async () => {
    findUniqueMock.mockResolvedValueOnce({ billingOverride: "NONE" });
    await expect(setBillingOverride("f1", "admin1", { type: "FREE_UNTIL", reason: "x" })).rejects.toThrow();
  });

  it("rejects `until` on FREE_FOREVER", async () => {
    findUniqueMock.mockResolvedValueOnce({ billingOverride: "NONE" });
    await expect(
      setBillingOverride("f1", "admin1", { type: "FREE_FOREVER", reason: "x", until: new Date() }),
    ).rejects.toThrow();
  });

  it("rejects NONE — must use clear()", async () => {
    await expect(setBillingOverride("f1", "admin1", { type: "NONE" as any, reason: "x" })).rejects.toThrow();
  });

  it("appends log row + updates family on valid SET", async () => {
    findUniqueMock.mockResolvedValueOnce({ billingOverride: "NONE" });
    await setBillingOverride("f1", "admin1", { type: "FREE_FOREVER", reason: "Friends" });
    expect(updateMock).toHaveBeenCalledOnce();
    expect(overrideLogCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        familyId: "f1",
        adminId: "admin1",
        action: "SET",
        prevType: "NONE",
        newType: "FREE_FOREVER",
        reason: "Friends",
      }),
    });
  });
});

describe("clearBillingOverride", () => {
  it("no-op when already NONE", async () => {
    findUniqueMock.mockResolvedValueOnce({ billingOverride: "NONE" });
    await clearBillingOverride("f1", "admin1", "n/a");
    expect(updateMock).not.toHaveBeenCalled();
    expect(overrideLogCreateMock).not.toHaveBeenCalled();
  });

  it("resets family + logs CLEAR with prev type captured", async () => {
    findUniqueMock.mockResolvedValueOnce({ billingOverride: "COMPED_PREMIUM" });
    await clearBillingOverride("f1", "admin1", "Stopped beta");
    expect(overrideLogCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "CLEAR",
        prevType: "COMPED_PREMIUM",
        newType: "NONE",
        reason: "Stopped beta",
      }),
    });
  });
});

describe("handleWebhook idempotency", () => {
  it("skips processing on duplicate event id (P2002)", async () => {
    stripeEventCreateMock.mockRejectedValueOnce({ code: "P2002" });
    await handleWebhook({ id: "evt_1", type: "checkout.session.completed", data: { object: {} } } as any);
    // No subsequent family lookups / updates should have run.
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("invoice.payment_failed sets PAST_DUE on matching family", async () => {
    stripeEventCreateMock.mockResolvedValueOnce({});
    // findFirst on family by stripeSubscriptionId
    (await import("../../db.js")).prisma.family.findFirst = vi.fn().mockResolvedValueOnce({ id: "f1" });
    stripeEventUpdateMock.mockResolvedValueOnce({});
    await handleWebhook({
      id: "evt_2",
      type: "invoice.payment_failed",
      data: { object: { subscription: "sub_1" } },
    } as any);
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "f1" },
      data: { subscriptionStatus: "PAST_DUE" },
    });
  });
});
