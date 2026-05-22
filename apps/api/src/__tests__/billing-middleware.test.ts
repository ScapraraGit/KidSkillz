import { describe, it, expect, beforeEach, vi } from "vitest";

const getEntitlementMock = vi.fn();
vi.mock("../services/billing.js", () => ({ getEntitlement: getEntitlementMock }));

const envObj: any = { BILLING_ENABLED: true };
vi.mock("../env.js", () => ({ env: envObj }));

const { requirePaidEntitlement, requirePremium } = await import("../middleware/billing.js");

function run(mw: any, req: any): Promise<any> {
  return new Promise((resolve) => mw(req, {}, (err: any) => resolve(err)));
}

beforeEach(() => {
  getEntitlementMock.mockReset();
  envObj.BILLING_ENABLED = true;
});

describe("requirePaidEntitlement", () => {
  it("kill-switch off → bypass", async () => {
    envObj.BILLING_ENABLED = false;
    const err = await run(requirePaidEntitlement, { auth: { fid: "f1" } });
    expect(err).toBeUndefined();
    expect(getEntitlementMock).not.toHaveBeenCalled();
  });

  it("paid entitlement passes", async () => {
    getEntitlementMock.mockResolvedValueOnce({ isPaid: true, isPremium: false });
    const err = await run(requirePaidEntitlement, { auth: { fid: "f1" } });
    expect(err).toBeUndefined();
  });

  it("unpaid throws 402", async () => {
    getEntitlementMock.mockResolvedValueOnce({ isPaid: false });
    const err = await run(requirePaidEntitlement, { auth: { fid: "f1" } });
    expect(err?.status).toBe(402);
    expect(err?.code).toBe("BILLING_REQUIRED");
  });

  it("override (already encoded in isPaid) passes", async () => {
    getEntitlementMock.mockResolvedValueOnce({ isPaid: true, source: "OVERRIDE" });
    const err = await run(requirePaidEntitlement, { auth: { fid: "f1" } });
    expect(err).toBeUndefined();
  });
});

describe("requirePremium", () => {
  it("BASIC paid blocks premium gate", async () => {
    getEntitlementMock.mockResolvedValueOnce({ isPaid: true, isPremium: false });
    const err = await run(requirePremium, { auth: { fid: "f1" } });
    expect(err?.status).toBe(402);
    expect(err?.code).toBe("PREMIUM_REQUIRED");
  });

  it("COMPED_PREMIUM passes", async () => {
    getEntitlementMock.mockResolvedValueOnce({ isPaid: true, isPremium: true });
    const err = await run(requirePremium, { auth: { fid: "f1" } });
    expect(err).toBeUndefined();
  });
});
