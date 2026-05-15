import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import { makeTestFamily, dbIt } from "../../__tests__/helpers.js";
import { prisma } from "../../db.js";

const app = createApp({ forTests: true });
const test = dbIt(it);

async function createTask(token: string, childId: string) {
  const r = await request(app)
    .post("/v1/tasks")
    .set("Authorization", `Bearer ${token}`)
    .send({
      title: "Sweep",
      creditValue: 4,
      kind: "ONE_TIME",
      proofRequirement: "NONE",
      assignedToId: childId,
    });
  if (r.status !== 201) throw new Error(`create task ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.task.id as string;
}

describe("/v1/completions", () => {
  let ctx: Awaited<ReturnType<typeof makeTestFamily>> | null = null;

  afterEach(async () => {
    if (ctx) {
      await ctx.cleanup();
      ctx = null;
    }
  });

  test("child submits + parent approves end-to-end", async () => {
    ctx = await makeTestFamily();
    const taskId = await createTask(ctx.parent.token, ctx.child.id);

    const submit = await request(app)
      .post("/v1/completions")
      .set("Authorization", `Bearer ${ctx.child.token}`)
      .send({ taskId });
    expect(submit.status).toBe(201);
    const completionId = submit.body.completion.id as string;

    const approve = await request(app)
      .post(`/v1/completions/${completionId}/approve`)
      .set("Authorization", `Bearer ${ctx.parent.token}`)
      .send({});
    expect(approve.status).toBe(200);
    expect(approve.body.completion.status).toBe("APPROVED");

    // Ledger entry written for the awarded credit. sourceId is `<completionId>:<childId>`
    // so the per-recipient row is uniquely identifiable in audit + idempotency checks.
    const ledger = await prisma.ledgerEntry.findFirst({
      where: { childId: ctx.child.id, sourceId: `${completionId}:${ctx.child.id}` },
    });
    expect(ledger?.amount).toBe(4);
  });

  test("cross-tenant approve is 404", async () => {
    ctx = await makeTestFamily();
    const taskId = await createTask(ctx.parent.token, ctx.child.id);
    const submit = await request(app)
      .post("/v1/completions")
      .set("Authorization", `Bearer ${ctx.child.token}`)
      .send({ taskId });
    const completionId = submit.body.completion.id as string;

    const res = await request(app)
      .post(`/v1/completions/${completionId}/approve`)
      .set("Authorization", `Bearer ${ctx.outsiderToken}`)
      .send({});
    expect(res.status).toBe(404);
  });

  test("idempotency-key replay returns cached response", async () => {
    ctx = await makeTestFamily();
    const taskId = await createTask(ctx.parent.token, ctx.child.id);
    const submit = await request(app)
      .post("/v1/completions")
      .set("Authorization", `Bearer ${ctx.child.token}`)
      .send({ taskId });
    const completionId = submit.body.completion.id as string;

    const key = `test-${completionId}`;
    const a = await request(app)
      .post(`/v1/completions/${completionId}/approve`)
      .set("Authorization", `Bearer ${ctx.parent.token}`)
      .set("Idempotency-Key", key)
      .send({});
    expect(a.status).toBe(200);

    // Second call MUST return the cached envelope, NOT post a second ledger row.
    const b = await request(app)
      .post(`/v1/completions/${completionId}/approve`)
      .set("Authorization", `Bearer ${ctx.parent.token}`)
      .set("Idempotency-Key", key)
      .send({});
    expect(b.status).toBe(200);
    expect(b.body).toEqual(a.body);

    const ledgerCount = await prisma.ledgerEntry.count({
      where: { childId: ctx.child.id, sourceId: `${completionId}:${ctx.child.id}` },
    });
    expect(ledgerCount).toBe(1);
  });
});
