# Plan 8 — Multi-Family Membership (shared email across families)

## Goal

Allow one email/identity to belong to multiple families. Drives the divorced co-parent case: two homes, two `Family` rows, one parent login. Each family keeps its own subscription + Stripe customer; co-parents see a family switcher.

## Model split

- `User` = identity (email globally unique, password, MFA, tokenVersion). PARENT/CAREGIVER no longer carry `familyId`.
- `FamilyMembership` = (user, family, role, scope, billing-owner). One row per family the user belongs to.
- CHILD users stay tied to one family via `User.familyId` (kids don't cross households). All existing `childId` FKs (ledger, completions, etc.) unchanged.

## Schema changes

### New enums

```prisma
enum MembershipRole {
  PARENT
  CAREGIVER
}

enum MembershipStatus {
  ACTIVE
  REVOKED
}
```

### New model

```prisma
model FamilyMembership {
  id             String           @id @default(uuid())
  userId         String
  user           User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  familyId       String
  family         Family           @relation(fields: [familyId], references: [id], onDelete: Cascade)
  role           MembershipRole
  status         MembershipStatus @default(ACTIVE)

  // CAREGIVER scoping moves here from User (per-family)
  validFrom      DateTime?
  validUntil     DateTime?
  scope          Json?

  // Per-family billing permission. First PARENT to create family = true.
  isBillingOwner Boolean          @default(false)

  invitedById    String?
  invitedBy      User?            @relation("MembershipInviter", fields: [invitedById], references: [id], onDelete: SetNull)
  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt

  @@unique([userId, familyId])
  @@index([familyId])
  @@index([userId])
}
```

### User changes

- `familyId` → nullable. NULL for PARENT/CAREGIVER, set only for CHILD.
- Remove `validFrom`, `validUntil`, `scope` (moved to membership). Phase 3 cleanup.
- Add `memberships FamilyMembership[]` relation.
- Email stays globally `@unique`.

### Family addition

```prisma
billingOwnerMembershipId String? @unique
```

## Migration plan (3 phases, non-destructive)

### Phase 1 — additive (this commit)

1. Add `MembershipRole` + `MembershipStatus` enums.
2. Add `FamilyMembership` model.
3. Add `User.memberships` relation, keep `User.familyId` NOT NULL (don't break code yet).
4. Generate Prisma migration.
5. Backfill SQL inside the migration:
   - For every `User WHERE role IN ('PARENT','CAREGIVER')`, insert `FamilyMembership(userId, familyId, role, scope, validFrom, validUntil)`.
   - First PARENT per family (oldest `createdAt`) → `isBillingOwner=true`.
6. No code reads memberships yet. Production behavior unchanged.

### Phase 2 — code cutover

- Make `User.familyId` nullable.
- New JWT shape: `{ sub, fid, mid, role, tv }`. `mid` for PARENT/CAREGIVER only.
- `requireAuth` resolves membership via `mid`, checks status/window, attaches `req.membership` + `req.familyId`.
- New endpoints:
  - `GET /me/families` → list active memberships.
  - `POST /auth/select-family { familyId }` → post-login family picker.
  - `POST /auth/switch-family { familyId }` → revoke current refresh, mint new pair.
- Login response shape: if 2+ memberships, return `{ needsFamilySelect, memberships, selectToken }`. If 1, mint full token.
- Invitation accept: if user with same email already exists → prompt sign-in then create membership (no duplicate User).
- CAREGIVER scope reads from `req.membership.scope`, not `req.user.scope`.
- Billing routes gate on `req.membership.isBillingOwner` instead of `role === PARENT`.
- Frontend:
  - Family switcher in nav.
  - Post-login picker page.
  - `queryClient.clear()` on family switch.
  - Persist last-active `familyId` in localStorage.

### Phase 3 — cleanup

- Null out `User.familyId` for PARENT/CAREGIVER (data migration).
- Drop `User.validFrom`, `User.validUntil`, `User.scope` columns.
- Add CHECK: `familyId IS NOT NULL WHERE role = 'CHILD'`.

## Billing impact

- `Family.stripeCustomerId` stays per-family. Stripe allows duplicate emails across customers.
- Each family = its own subscription, trial, invoice history, card on file.
- Billing UI scoped to active family in JWT `fid`.
- Transfer ownership: `POST /family/billing/transfer-owner { membershipId }`.
- Webhooks unchanged — already key by `stripeCustomerId` → `familyId`.

## Risks / watch-outs

- Invitation accept by existing email — must NOT create duplicate User.
- Audit/ledger `createdById` / `reviewedById` still point at User.id — correct, identity stable across families.
- Notifications: filter by active `fid` on frontend, or design cross-family inbox.
- Password reset operates on identity — affects all families they're in. Correct.
- Children rarely have email but if they do, still globally unique on User — fine.

## Status

- [x] Phase 1 — schema + migration + backfill (DONE 2026-05-25, migration `20260525120000_family_membership`)
- [x] Phase 2 — JWT + middleware + endpoints + frontend switcher (DONE 2026-05-25, migration `20260525130000_membership_nullable_user_family`)
- [x] Phase 3 — drop legacy columns + tighten constraints (DONE 2026-05-25, migration `20260525140000_phase3_drop_legacy_user_columns`)

## Phase 2 — what shipped

API:

- Migration nullable `User.familyId`; `RefreshToken.familyMembershipId` FK.
- `JWTPayload.mid` field; `scope: "family-select"` single-purpose token.
- `requireAuth` resolves membership when `mid` present, validates `(userId, familyId, status, validUntil)`. Rejects `family-select` tokens.
- `requireParentOrCaregiver` reads scope from `req.membership` when present, falls back to `User.scope` for legacy single-family tokens.
- `lib/active-family.ts`: `listAuthFamilies`, `resolveActiveFamily`, `mintAccessToken`.
- Refresh rotation stores + carries `familyMembershipId` forward. Legacy refresh rows without `mid` map to the user's primary membership at rotation time.
- `POST /auth/parent/login`: returns `{ needsFamilySelect, selectToken, families }` when 2+ memberships. Single-membership returns access pair as before.
- `POST /auth/select-family`: consumes a select token + chosen `familyId`, mints access pair.
- `POST /auth/switch-family`: authenticated; revokes current refresh, mints a new pair scoped to the target membership.
- `GET /auth/me/families`: lists the caller's active families + which is currently active.
- Parent register creates a `FamilyMembership(isBillingOwner=true)` for the founding parent and threads it into the token.
- Caregiver PIN login upserts a CAREGIVER membership.
- Invitation accept: if the email matches an existing User, requires the existing password and creates a `FamilyMembership` (no duplicate User). New emails create User + membership in one tx.
- Billing `/billing/checkout` and `/billing/portal` gated on `req.membership.isBillingOwner` (falls back to `role === PARENT` for legacy tokens).
- `/auth/me`, `/household-ack`, `/accept-terms` now key off `req.auth.fid` instead of `user.familyId` so PARENT/CAREGIVER work across families once their `User.familyId` is nulled in Phase 3.
- Admin password-reset audit now records one row per active membership when the target user has no `User.familyId`.
- Beta admin notification falls back to the admin's first active membership family when `User.familyId` is null.

Web:

- `<FamilySwitcher>` component mounted in the account popover; hidden for users with 0–1 family. On switch: revoke refresh, mint new pair, `queryClient.clear()`, redirect to role root.
- Parent login form shows an inline picker when the server returns `needsFamilySelect`; calls `/auth/select-family` with the chosen family id.

## Phase 3 — what shipped

Migration (`20260525140000_phase3_drop_legacy_user_columns`):

- `UPDATE User SET familyId = NULL WHERE role IN ('PARENT','CAREGIVER')`.
- `ALTER TABLE User DROP COLUMN validFrom, validUntil, scope`.
- `CHECK (role='CHILD' AND familyId IS NOT NULL) OR (role IN ('PARENT','CAREGIVER') AND familyId IS NULL)` — schema-enforced invariant.

Schema (`User`):

- `validFrom`, `validUntil`, `scope` removed; the membership is the only source for those.

API code:

- `requireParentOrCaregiver`: caregiver path requires an active membership. Legacy tokens (no `mid`) fall back to the user's first active membership so existing sessions keep working.
- `redeemCaregiverPin`: creates a `User` (no familyId/window/scope) AND a `FamilyMembership` in one tx; returns both. Caller mints token from the membership.
- Parent register: `User.create` no longer sets `familyId`. The membership row (already created next line) is the tenant link.
- Invitation accept (new-email path): same — no `familyId` on the new User row.
- Legacy `/v1/invitations/pin-login` switched to `mintAccessToken` + returned membership.
- `auth.ts /child/login`: parent-password migration scan switched from `User.findMany(familyId, role=PARENT)` to `FamilyMembership.findMany(familyId, role=PARENT)` joined to user.
- `serializeUser` drops `validUntil` (it never made sense for PARENT/CHILD; caregiver windows live on membership now).
- `GET /v1/family/members` rewritten to query `FamilyMembership` and surface its `validUntil` + `isBillingOwner`. The `users` relation on `Family` is now effectively a CHILD list.
- `services/admin.listFamiliesWithOwner` + `getFamilyDetail`: parents pulled from memberships (with `isBillingOwner` preference for owner), children from `Family.users`.
- `services/billing.ensureStripeCustomer`: customer email/name from the family's PARENT membership (billing-owner first), not `Family.users`.
- `services/data-export.deleteFamily`: the parent-in-family check is now a membership lookup, not `actor.familyId`.

Shared DTO:

- `AuthUserDTO.familyId` is now `string | null` to reflect the schema reality. Web consumers that assumed non-null updated.

Web:

- AppLayout drops `user.validUntil` from the caregiver-session banner. (Mid-session caregiver-window UI now needs `/auth/me/families` if anyone wants to show it again — explicitly out of scope for this phase.)

Login back-compat (the "don't break customers" guarantee):

- Live access tokens minted pre-Phase 2 carry no `mid` but still validate via `payload.fid` against the user record; `requireAuth` accepts them.
- Live refresh tokens with no `familyMembershipId` resolve to the user's first active membership on first rotation. After rotation, new tokens carry `mid`.
- Existing CAREGIVER sessions: legacy tokens without `mid` fall through to the `findFirst` membership lookup in `requireParentOrCaregiver`. Their scope/window come from the Phase 1-backfilled membership row.
- No `prisma migrate reset` or destructive op. Backfill runs in the same migration that drops columns so caregiver windows aren't lost in the DDL window.

Not in Phase 2 (intentional):

- "Last-active family" localStorage hint (cosmetic; current flow already picks first membership on rotate, and the picker only fires when the user has 2+).
- Cross-family unified notifications inbox; today notifications stay scoped to the active family via `Notification.familyId`.
- Transfer-billing-owner endpoint (`POST /family/billing/transfer-owner`). Adds in a follow-up.
- CHILD users joining a second family — explicitly out of scope (kids stay single-family).
