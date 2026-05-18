import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import { makeTestFamily, dbIt } from "../../__tests__/helpers.js";
import { prisma } from "../../db.js";

const app = createApp({ forTests: true });
const test = dbIt(it);

describe("/v1/tasks", () => {
  let ctx: Awaited<ReturnType<typeof makeTestFamily>> | null = null;

  afterEach(async () => {
    if (ctx) {
      await ctx.cleanup();
      ctx = null;
    }
  });

  test("requires auth", async () => {
    const res = await request(app).get("/v1/tasks");
    expect(res.status).toBe(401);
  });

  test("parent can create a task", async () => {
    ctx = await makeTestFamily();
    const res = await request(app).post("/v1/tasks").set("Authorization", `Bearer ${ctx.parent.token}`).send({
      title: "Take out trash",
      creditValue: 5,
      kind: "ONE_TIME",
      proofRequirement: "NOTES_OPTIONAL",
      assignedToId: ctx.child.id,
    });
    if (res.status !== 201) {
      console.error("create-task response:", res.status, res.body);
    }
    expect(res.status).toBe(201);
    expect(res.body.task?.title).toBe("Take out trash");
    expect(res.body.task?.creditValue).toBe(5);
  });

  test("cross-tenant task fetch is 404", async () => {
    ctx = await makeTestFamily();
    // Create a task as the in-family parent.
    const created = await request(app)
      .post("/v1/tasks")
      .set("Authorization", `Bearer ${ctx.parent.token}`)
      .send({
        title: "Trash",
        creditValue: 3,
        kind: "ONE_TIME",
        proofRequirement: "NONE",
        assignedToId: ctx.child.id,
      });
    expect(created.status).toBe(201);
    const taskId = created.body.task.id as string;
    expect(taskId).toBeTruthy();

    // The outsider parent (different family) must NOT see it.
    const res = await request(app)
      .get(`/v1/tasks/${taskId}`)
      .set("Authorization", `Bearer ${ctx.outsiderToken}`);
    expect(res.status).toBe(404);

    // Belt-and-suspenders: DB still owns it under the original family.
    const row = await prisma.task.findUnique({ where: { id: taskId } });
    expect(row?.familyId).toBe(ctx.familyId);
  });
});
