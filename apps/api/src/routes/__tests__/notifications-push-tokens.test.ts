import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import { makeTestFamily, dbIt } from "../../__tests__/helpers.js";
import { prisma } from "../../db.js";

const app = createApp({ forTests: true });
const test = dbIt(it);

describe("/v1/notifications/push-tokens", () => {
  let ctx: Awaited<ReturnType<typeof makeTestFamily>> | null = null;

  afterEach(async () => {
    if (ctx) {
      await ctx.cleanup();
      ctx = null;
    }
  });

  test("parent registers a token", async () => {
    ctx = await makeTestFamily();
    const res = await request(app)
      .post("/v1/notifications/push-tokens")
      .set("Authorization", `Bearer ${ctx.parent.token}`)
      .send({ token: "tok-parent-1", platform: "ANDROID" });
    expect(res.status).toBe(204);
    const row = await prisma.pushToken.findUnique({ where: { token: "tok-parent-1" } });
    expect(row).toBeTruthy();
    expect(row?.familyId).toBe(ctx.familyId);
    expect(row?.userId).toBe(ctx.parent.id);
    expect(row?.platform).toBe("ANDROID");
  });

  test("re-registering the same token upserts (no duplicates) and bumps lastSeenAt", async () => {
    ctx = await makeTestFamily();
    const send = () =>
      request(app)
        .post("/v1/notifications/push-tokens")
        .set("Authorization", `Bearer ${ctx!.parent.token}`)
        .send({ token: "tok-dup", platform: "IOS" });
    await send();
    const firstSeen = (await prisma.pushToken.findUnique({ where: { token: "tok-dup" } }))!.lastSeenAt;
    await new Promise((r) => setTimeout(r, 5));
    await send();
    const count = await prisma.pushToken.count({ where: { token: "tok-dup" } });
    expect(count).toBe(1);
    const after = (await prisma.pushToken.findUnique({ where: { token: "tok-dup" } }))!.lastSeenAt;
    expect(after.getTime()).toBeGreaterThan(firstSeen.getTime());
  });

  test("unauthenticated request is rejected", async () => {
    const res = await request(app)
      .post("/v1/notifications/push-tokens")
      .send({ token: "tok", platform: "ANDROID" });
    expect(res.status).toBe(401);
  });

  test("invalid platform rejected with 400", async () => {
    ctx = await makeTestFamily();
    const res = await request(app)
      .post("/v1/notifications/push-tokens")
      .set("Authorization", `Bearer ${ctx.parent.token}`)
      .send({ token: "tok-bad", platform: "WINDOWS_PHONE" });
    expect(res.status).toBe(400);
  });

  test("DELETE removes only the caller's own token", async () => {
    ctx = await makeTestFamily();
    // Parent registers a token, then deletes it.
    await request(app)
      .post("/v1/notifications/push-tokens")
      .set("Authorization", `Bearer ${ctx.parent.token}`)
      .send({ token: "tok-mine", platform: "ANDROID" });
    // Same token string but try to delete from an outsider session.
    const wrongOwner = await request(app)
      .delete("/v1/notifications/push-tokens")
      .set("Authorization", `Bearer ${ctx.outsiderToken}`)
      .send({ token: "tok-mine" });
    expect(wrongOwner.status).toBe(200);
    expect(wrongOwner.body.count).toBe(0);
    expect(await prisma.pushToken.findUnique({ where: { token: "tok-mine" } })).toBeTruthy();
    // Real owner can delete.
    const owner = await request(app)
      .delete("/v1/notifications/push-tokens")
      .set("Authorization", `Bearer ${ctx.parent.token}`)
      .send({ token: "tok-mine" });
    expect(owner.status).toBe(200);
    expect(owner.body.count).toBe(1);
    expect(await prisma.pushToken.findUnique({ where: { token: "tok-mine" } })).toBeNull();
  });
});
