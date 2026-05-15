import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import { makeTestFamily, dbIt } from "../../__tests__/helpers.js";
import { prisma } from "../../db.js";

const app = createApp({ forTests: true });
const test = dbIt(it);

describe("/v1/adjustments", () => {
  let ctx: Awaited<ReturnType<typeof makeTestFamily>> | null = null;

  afterEach(async () => {
    if (ctx) {
      await ctx.cleanup();
      ctx = null;
    }
  });

  test("parent can post a positive adjustment", async () => {
    ctx = await makeTestFamily();
    const res = await request(app)
      .post("/v1/adjustments")
      .set("Authorization", `Bearer ${ctx.parent.token}`)
      .send({ childId: ctx.child.id, amount: 10, reason: "good week" });
    expect(res.status).toBe(201);
    const ledger = await prisma.ledgerEntry.findFirst({
      where: { childId: ctx.child.id, kind: "ADJUSTMENT_POSITIVE" },
    });
    expect(ledger?.amount).toBe(10);
  });

  test("cross-tenant child rejected with 404", async () => {
    ctx = await makeTestFamily();
    // outsider parent tries to adjust THIS family's child
    const res = await request(app)
      .post("/v1/adjustments")
      .set("Authorization", `Bearer ${ctx.outsiderToken}`)
      .send({ childId: ctx.child.id, amount: 10, reason: "bad actor" });
    expect(res.status).toBe(404);
  });

  test("child role forbidden", async () => {
    ctx = await makeTestFamily();
    const res = await request(app)
      .post("/v1/adjustments")
      .set("Authorization", `Bearer ${ctx.child.token}`)
      .send({ childId: ctx.child.id, amount: 10, reason: "self-grant" });
    expect(res.status).toBe(403);
  });
});
