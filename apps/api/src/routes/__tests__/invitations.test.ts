import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import { makeTestFamily, dbIt } from "../../__tests__/helpers.js";

// Public-by-design auth boundary. The invitations router intentionally
// mixes authenticated parent-only routes with public token-in-URL routes
// (invite preview + accept, legacy PIN login). A historical bug applied
// `router.use(requireAuth)` at module scope and 401'd the public ones,
// breaking the invite-accept flow. These tests pin the boundary so the
// regression can't sneak back in.

const app = createApp({ forTests: true });
const test = dbIt(it);

describe("/v1/invitations auth boundary", () => {
  let ctx: Awaited<ReturnType<typeof makeTestFamily>> | null = null;

  afterEach(async () => {
    if (ctx) {
      await ctx.cleanup();
      ctx = null;
    }
  });

  // --- Protected routes — must require auth ---

  test("GET / requires a bearer token", async () => {
    const res = await request(app).get("/v1/invitations");
    expect(res.status).toBe(401);
  });

  test("POST / requires a bearer token", async () => {
    const res = await request(app)
      .post("/v1/invitations")
      .send({ kind: "CO_PARENT", email: "x@example.com" });
    expect(res.status).toBe(401);
  });

  test("DELETE /:id requires a bearer token", async () => {
    const res = await request(app).delete("/v1/invitations/some-id");
    expect(res.status).toBe(401);
  });

  test("GET / with a parent bearer returns 200", async () => {
    ctx = await makeTestFamily();
    const res = await request(app).get("/v1/invitations").set("Authorization", `Bearer ${ctx.parent.token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.invitations)).toBe(true);
  });

  // --- Public-by-design routes — must NOT 401 without auth ---

  test("GET /by-token/:token is unauthenticated (404 not 401 for unknown token)", async () => {
    const res = await request(app).get("/v1/invitations/by-token/this-token-does-not-exist");
    // The credential lives in the URL — a missing token returns 404, never 401.
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(404);
  });

  test("POST /by-token/:token/accept is unauthenticated (404 not 401 for unknown token)", async () => {
    const res = await request(app)
      .post("/v1/invitations/by-token/this-token-does-not-exist/accept")
      .send({ name: "New User", password: "Sup3r-Str0ng!Test" });
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(404);
  });

  test("POST /pin-login is unauthenticated (returns 400/404 for bad input, not 401)", async () => {
    const res = await request(app)
      .post("/v1/invitations/pin-login")
      .send({ familyId: "00000000-0000-0000-0000-000000000000", pin: "1234" });
    // Either 400 (validation) or 404 (no match) or 200 — anything but 401.
    expect(res.status).not.toBe(401);
  });
});
