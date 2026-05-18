import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import { makeTestFamily, dbIt } from "../../__tests__/helpers.js";
import { prisma } from "../../db.js";

const app = createApp({ forTests: true });
const test = dbIt(it);

async function seedReward(token: string, creditCost = 5) {
  const r = await request(app).post("/v1/rewards").set("Authorization", `Bearer ${token}`).send({
    name: "Ice cream",
    creditCost,
    type: "TREAT",
    requiresApproval: true,
  });
  if (r.status !== 201) throw new Error(`reward ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.reward.id as string;
}

async function topUp(childId: string, familyId: string, amount: number) {
  await prisma.ledgerEntry.create({
    data: {
      familyId,
      childId,
      amount,
      kind: "ADJUSTMENT_POSITIVE",
      reason: "test seed",
    },
  });
}

describe("/v1/redemptions", () => {
  let ctx: Awaited<ReturnType<typeof makeTestFamily>> | null = null;

  afterEach(async () => {
    if (ctx) {
      await ctx.cleanup();
      ctx = null;
    }
  });

  test("child requests, parent approves, ledger debited", async () => {
    ctx = await makeTestFamily();
    const rewardId = await seedReward(ctx.parent.token, 5);
    await topUp(ctx.child.id, ctx.familyId, 20);

    const req1 = await request(app)
      .post("/v1/redemptions")
      .set("Authorization", `Bearer ${ctx.child.token}`)
      .send({ rewardId });
    expect(req1.status).toBe(201);
    const redemptionId = req1.body.redemption.id as string;

    const approve = await request(app)
      .post(`/v1/redemptions/${redemptionId}/approve`)
      .set("Authorization", `Bearer ${ctx.parent.token}`)
      .send({});
    expect(approve.status).toBe(200);
    expect(approve.body.redemption.status).toBe("APPROVED");

    const debit = await prisma.ledgerEntry.findFirst({
      where: { childId: ctx.child.id, kind: "REDEMPTION" },
    });
    expect(debit?.amount).toBe(-5);
  });

  test("cross-tenant approve is 404", async () => {
    ctx = await makeTestFamily();
    const rewardId = await seedReward(ctx.parent.token, 5);
    await topUp(ctx.child.id, ctx.familyId, 20);
    const req1 = await request(app)
      .post("/v1/redemptions")
      .set("Authorization", `Bearer ${ctx.child.token}`)
      .send({ rewardId });
    const redemptionId = req1.body.redemption.id as string;

    const res = await request(app)
      .post(`/v1/redemptions/${redemptionId}/approve`)
      .set("Authorization", `Bearer ${ctx.outsiderToken}`)
      .send({});
    expect(res.status).toBe(404);
  });
});
