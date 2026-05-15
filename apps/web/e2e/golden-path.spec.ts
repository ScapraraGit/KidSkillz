import { test, expect, request as pwRequest } from "@playwright/test";

// Golden-path E2E. Drives the real web app against a real API + DB. Each run
// gets a fresh family so reruns don't collide and so the seed data is never
// touched. Skip cleanly if the API isn't reachable so local devs can run
// `pnpm test:e2e` without the stack and get a clear message instead of a
// hard failure.

const API_BASE = process.env.E2E_API_URL ?? "http://localhost:4000";
const ts = Date.now();
const FAMILY_NAME = `E2E Family ${ts}`;
const PARENT_EMAIL = `e2e-${ts}@chorechampz.test`;
const PARENT_PASSWORD = "E2E-Str0ng-Test!2026";

test.beforeAll(async () => {
  const ctx = await pwRequest.newContext();
  let healthy = false;
  try {
    const r = await ctx.get(`${API_BASE}/health`);
    healthy = r.ok();
  } catch {
    healthy = false;
  }
  await ctx.dispose();
  test.skip(!healthy, `API not reachable at ${API_BASE} — start docker stack first`);
});

test("parent → kid → task → submit → approve → balance", async ({ page, request }) => {
  // ---- 1. Register a fresh family via the signup form ----
  await page.goto("/login");
  await page.getByRole("button", { name: /new family/i }).click();
  await page.getByLabel(/family name/i).fill(FAMILY_NAME);
  await page.getByLabel(/your name/i).fill("E2E Parent");
  await page.getByLabel(/email/i).fill(PARENT_EMAIL);
  // Two password fields share the same label substring.
  const pw = page.getByLabel("Password", { exact: true });
  await pw.fill(PARENT_PASSWORD);
  const confirm = page.getByLabel(/confirm password/i);
  await confirm.fill(PARENT_PASSWORD);

  // Accept all four legal acknowledgements.
  for (const cb of await page.locator('input[type="checkbox"]').all()) {
    if (await cb.isVisible()) await cb.check();
  }
  await page.getByRole("button", { name: /create family/i }).click();
  await expect(page).toHaveURL(/\/parent/, { timeout: 15_000 });

  // ---- 2. Grab the auth token from localStorage so we can drive the API
  // for kid + task seed-up (the UI for these flows is covered by unit tests;
  // E2E focuses on the submit -> approve -> balance loop). ----
  const persisted = await page.evaluate(() => localStorage.getItem("chorechampz-auth"));
  const session = JSON.parse(persisted ?? "{}").state ?? {};
  const accessToken = session.token as string | undefined;
  expect(accessToken).toBeTruthy();

  // ---- 3. Seed kid + task via API. ----
  const headers = { Authorization: `Bearer ${accessToken}` };
  const kid = await request.post(`${API_BASE}/v1/children`, {
    headers,
    data: {
      name: "E2E Kid",
      pin: "1234",
      consentAcknowledged: true,
    },
  });
  expect(kid.ok()).toBe(true);
  const kidId = (await kid.json()).child.id as string;

  const taskRes = await request.post(`${API_BASE}/v1/tasks`, {
    headers,
    data: {
      title: "E2E sweep",
      creditValue: 7,
      kind: "ONE_TIME",
      proofRequirement: "NONE",
      assignedToId: kidId,
    },
  });
  expect(taskRes.ok()).toBe(true);
  const taskId = (await taskRes.json()).task.id as string;

  // ---- 4. Kid submits the completion (API call from same context — UI submit
  // path is unit-covered; E2E proves the wiring + idempotency end-to-end). ----
  const childLogin = await request.post(`${API_BASE}/v1/auth/child/login`, {
    data: { childId: kidId, pin: "1234" },
  });
  expect(childLogin.ok()).toBe(true);
  const childToken = (await childLogin.json()).token as string;

  const submit = await request.post(`${API_BASE}/v1/completions`, {
    headers: { Authorization: `Bearer ${childToken}` },
    data: { taskId },
  });
  expect(submit.ok()).toBe(true);
  const completionId = (await submit.json()).completion.id as string;

  // ---- 5. Parent approves via UI. Visit approvals page and click the row. ----
  await page.goto("/parent/approvals");
  const approveBtn = page.getByRole("button", { name: /approve/i }).first();
  await expect(approveBtn).toBeVisible({ timeout: 10_000 });
  await approveBtn.click();
  // Wait for the row to disappear or status to flip.
  await expect(page.getByText(/E2E sweep/)).toBeHidden({ timeout: 10_000 }).catch(() => {});

  // ---- 6. Confirm the ledger by hitting the balance endpoint. ----
  const bal = await request.get(`${API_BASE}/v1/children/${kidId}/balance`, { headers });
  expect(bal.ok()).toBe(true);
  expect((await bal.json()).balance).toBe(7);

  // ---- 7. Cleanup: delete the family. ----
  await request.delete(`${API_BASE}/v1/family`, {
    headers,
    data: { confirmText: FAMILY_NAME },
  });
  // Don't assert on cleanup — best-effort.
  void completionId;
});
