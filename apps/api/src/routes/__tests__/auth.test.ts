import { afterEach, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import { makeTestFamily, dbIt } from "../../__tests__/helpers.js";
import { prisma } from "../../db.js";

const app = createApp({ forTests: true });
const test = dbIt(it);

describe("/v1/auth", () => {
  let ctx: Awaited<ReturnType<typeof makeTestFamily>> | null = null;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;
  });

  afterEach(async () => {
    if (ctx) {
      await ctx.cleanup();
      ctx = null;
    }
  });

  test("login happy path returns access + refresh", async () => {
    ctx = await makeTestFamily();
    // Reset password to a known value matching the helper's hash.
    const res = await request(app)
      .post("/v1/auth/parent/login")
      .send({ email: ctx.parent.email, password: "Sup3r-Str0ng!Test" });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.user.id).toBe(ctx.parent.id);
  });

  test("login wrong password is 401", async () => {
    ctx = await makeTestFamily();
    const res = await request(app)
      .post("/v1/auth/parent/login")
      .send({ email: ctx.parent.email, password: "wrong-pw" });
    expect(res.status).toBe(401);
  });

  test("/me requires auth", async () => {
    const res = await request(app).get("/v1/auth/me");
    expect(res.status).toBe(401);
  });

  test("/me returns the caller", async () => {
    ctx = await makeTestFamily();
    const res = await request(app)
      .get("/v1/auth/me")
      .set("Authorization", `Bearer ${ctx.parent.token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(ctx.parent.id);
  });

  test("refresh rotates the token + tripwires on replay", async () => {
    ctx = await makeTestFamily();
    const loginRes = await request(app)
      .post("/v1/auth/parent/login")
      .send({ email: ctx.parent.email, password: "Sup3r-Str0ng!Test" });
    const r1 = loginRes.body.refreshToken as string;

    // First rotation succeeds.
    const rot1 = await request(app).post("/v1/auth/refresh").send({ refreshToken: r1 });
    expect(rot1.status).toBe(200);
    expect(rot1.body.refreshToken).toBeTruthy();
    expect(rot1.body.refreshToken).not.toBe(r1);

    // Replaying the original (now-revoked) refresh token should 401 AND should
    // revoke any outstanding successor — the replay tripwire.
    const replay = await request(app).post("/v1/auth/refresh").send({ refreshToken: r1 });
    expect(replay.status).toBe(401);

    // Successor token should also fail after the tripwire fires.
    const successor = await request(app)
      .post("/v1/auth/refresh")
      .send({ refreshToken: rot1.body.refreshToken });
    expect(successor.status).toBe(401);

    // No live refresh tokens should remain for the user.
    const live = await prisma.refreshToken.count({
      where: { userId: ctx.parent.id, revokedAt: null },
    });
    expect(live).toBe(0);
  });
});
