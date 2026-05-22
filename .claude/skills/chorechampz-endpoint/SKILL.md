---
name: chorechampz-endpoint
description: Scaffolds a new ChoreChampz API endpoint with the conventional layering — Zod validation in the route, business logic in a service, tenant scoping, serializer, and a unit test stub. Use when adding any new REST endpoint to apps/api.
---

# Scaffolding a new ChoreChampz endpoint

Follow this exact layering. Routes stay thin. Services own logic. Tenant scope is mandatory.

## 1. Route file (`apps/api/src/routes/<resource>.ts`)

```ts
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";
import * as svc from "../services/<resource>.js";

const Router_ = Router();

const CreateInput = z.object({
  // fields only — never accept familyId from the client
});

// IMPORTANT: apply requireAuth per-route, never via `Router_.use(requireAuth)`.
// If even one route in this router is public-by-design (token-in-URL credential,
// e.g. invitation accept), a router-wide guard 401s it. Past incident: the
// invitations router applied `.use(requireAuth)` and broke /by-token/:token.
Router_.post("/", requireAuth, requireRole("PARENT"), async (req, res) => {
  const input = CreateInput.parse(req.body);
  const out = await svc.create(req.auth!.fid, input);
  res.json(svc.serialize(out));
});

export const <resource>Router = Router_;
```

Wire it in [apps/api/src/index.ts](apps/api/src/index.ts).

## 2. Service file (`apps/api/src/services/<resource>.ts`)

```ts
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";

export interface CreateInput { /* ... */ }

export async function create(familyId: string, input: CreateInput) {
  // 1. ensure related rows belong to this family
  // 2. enforce business rules (pause flags, proof, balance via postLedger)
  // 3. return Prisma row; let route call serialize()
  return prisma.<model>.create({ data: { familyId, ...input } });
}

export function serialize(row: import("@prisma/client").<Model>) {
  return { /* never expose internal fields you don't want clients to see */ };
}
```

## 3. Tenant scoping rules

- First arg of every service fn is `familyId: string`.
- Every Prisma `where` includes `familyId` (directly or via relation `task: { familyId }`).
- Never read `familyId` from `req.body` — only from `req.auth!.fid`.

## 3a. Public-by-design routes

Some routes intentionally have no `requireAuth` because the token in the URL **is** the credential — invitation accept, password reset, device pairing redemption, family lookup. For those:

- Mount inside the same router as protected routes is fine; just **do not** apply `router.use(requireAuth)` at module scope.
- Apply auth per-route: `router.get("/protected", requireAuth, requireRole("PARENT"), …)` and `router.get("/by-token/:t", …)` side by side.
- The token-validation logic lives in the service (`findActiveByToken`, `redeemEnrollment`, etc.), not the route — same thin-route rule applies.
- These routes still need `requireTurnstile` + a rate limiter when unauthenticated traffic could enumerate.

## 3b. Email-affecting flows

If the endpoint sends an email (verification, reset, invitation, ad-hoc notification):

- Use the exported helpers in [apps/api/src/lib/email.ts](apps/api/src/lib/email.ts). Do not call the provider or Resend SDK directly.
- For user-facing auth flows (verify / reset / invite): let the helper rethrow on failure. The caller responds with the error.
- For anti-enumeration flows (forgot-password specifically): wrap the helper in try/catch at the SERVICE level so the route always returns 200 regardless of whether the email existed. A 500 from a Resend hiccup would leak account existence.
- Notification mirror sends are already fire-and-forget — wrapped with `setImmediate` in [apps/api/src/services/notifications.ts](apps/api/src/services/notifications.ts). Don't await them inside a Prisma transaction.

## 4. Ledger-affecting flows

If approval awards credit, post via `postLedger()` inside `prisma.$transaction`. See `approveCompletion` in [apps/api/src/services/completions.ts](apps/api/src/services/completions.ts) as the canonical pattern.

## 5. Test stub (`apps/api/src/services/__tests__/<resource>.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import * as svc from "../<resource>.js";

describe("<resource>", () => {
  it.todo("rejects cross-family access");
  it.todo("enforces business rule X");
});
```

Prefer pure-logic tests (no DB). For DB tests, use the `__tests__` folder and a real Postgres via a test schema; do not mock Prisma.

## 6. Web side (if any)

If the new endpoint surfaces UI, invoke the `chorechampz-web-feature` skill while wiring up the page. Every primary action and non-obvious icon needs a `<Tooltip>` — that skill has the rules and the wrapper import.

## 7. Shared types

If the response shape is consumed by the web app, add a DTO to [packages/shared/src/types.ts](packages/shared/src/types.ts) and import from `@chorechampz/shared` on both sides.

## 8. Checklist before declaring done

- [ ] Zod validates every input field.
- [ ] Service signature starts with `familyId`.
- [ ] All Prisma queries scope `familyId`.
- [ ] No `req.body.familyId` reads.
- [ ] Serializer returns only intended fields.
- [ ] At least one `it.todo` or real test added.
- [ ] Router wired in `index.ts`.
- [ ] If endpoint is consumed by new UI: every new button/control has a `<Tooltip>` (see `chorechampz-web-feature`).
- [ ] If the endpoint reads any new env var (via `apps/api/src/env.ts` or `import.meta.env.VITE_*`): `.env.example` has a matching commented entry in the same change. No exceptions.
