---
name: chorechampz-test
description: How to write Vitest unit tests for ChoreChampz services, lib helpers, and React components. Use when adding or extending tests in apps/api or apps/web.
---

# Writing tests in ChoreChampz

Vitest is configured in both `apps/api` (node env) and `apps/web` (jsdom).

## Where tests live

- `apps/api/src/services/__tests__/<name>.test.ts`
- `apps/api/src/lib/__tests__/<name>.test.ts`
- `apps/web/src/**/__tests__/<name>.test.tsx`

Naming: prefer the `__tests__` folder over co-located `*.test.ts` to keep service folders scannable.

## Prefer pure logic

The single biggest win is testing logic that does **not** touch Prisma. Examples already in repo:

- [apps/api/src/services/**tests**/awards.test.ts](apps/api/src/services/__tests__/awards.test.ts) — `computeSuggestedAward` deadline + tier math.
- [apps/api/src/lib/**tests**/time.test.ts](apps/api/src/lib/__tests__/time.test.ts) — TZ helpers.

Patterns that are pure and worth covering:

- `awards.ts` — every tier branch.
- `tasks.ts` `recurrenceMatchesDate` — every frequency × DOW combo, expiresAt boundary.
- `completions.ts` `proofMet` — six ProofRequirement levels.

## When DB is unavoidable

- Spin up a real Postgres (Docker or Neon branch), point `DATABASE_URL` at it via `.env.test`, run `prisma db push` against it.
- Do **not** mock the Prisma client — mocked Prisma drifts from schema and gives false confidence.
- Wrap each test in a transaction that rolls back, or truncate tables in `beforeEach`.

## Run

```
pnpm test                        # all workspaces
pnpm --filter @chorechampz/api test
pnpm --filter @chorechampz/web test
pnpm --filter @chorechampz/api test:watch
```

## Import style

ESM, `.js` extensions on relative imports (matches source):

```ts
import { computeSuggestedAward } from "../awards.js";
```

## Web component tests

Use `@testing-library/react`. `vitest.setup.ts` already pulls in `@testing-library/jest-dom`. Wrap with `MemoryRouter` if the component uses `react-router-dom`, and a fresh `QueryClient` if it uses TanStack Query.

```tsx
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

render(
  <QueryClientProvider client={qc}>
    <MemoryRouter>
      <MyComponent />
    </MemoryRouter>
  </QueryClientProvider>,
);
```

## Don't

- Don't mock Prisma.
- Don't snapshot Prisma rows (timestamps + ids churn).
- Don't test the route handler directly — extract the logic into the service and test that.
