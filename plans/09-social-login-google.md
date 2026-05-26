# Plan 9 — Social Login (Google)

## Status

- **Phase 0 — DONE** (commit pending). `OAuthIdentity` table + `OAuthProvider` enum, additive migration `20260526120000_oauth_identity`, env vars, `lib/oauth-provider.ts` with `GoogleOAuthProvider` + `DisabledOAuthProvider` stub, `google-auth-library@^9.15.0`, tests green.
- **Phase 1 — DONE** (commit pending). Link-to-existing flow: `services/oauth.ts` (`mintOAuthState`, `verifyOAuthState`, `linkIdentity`, `buildAuthorizeUrl`, `handleCallback`, `listIdentities`), thin route file `routes/auth-oauth.ts`, mounted at `/v1/auth/oauth`. Kill-switch gates whole router with 404. Audit event `OAUTH_LINKED`. Tests green (15/15).
- **Phase 2 — DONE** (commit pending). Sign-in with linked Google. Added `/signin/start` (public), state-cookie CSRF binding for callbacks without `uid`, `signinWithIdentity()` outcomes (`TOKENS` / `FAMILY_SELECT` / `UNLINKED_EMAIL_MATCH` / `NO_ACCOUNT`), one-shot ticket exchange (`POST /complete`) so tokens never travel in URLs. No-auto-link rule enforced. Audit event `OAUTH_SIGNIN`. Full suite green (139/139 + 23 skipped).
- **Phase 3 — DONE** (commit pending). Sign-up with Google. `signupWithIdentity()` creates Family + User (passwordHash=null, emailVerifiedAt=now) + FamilyMembership + OAuthIdentity, seeds defaults, records legal acceptances, mints tokens. New `POST /v1/auth/oauth/:provider/signup/complete` endpoint. Callback `NO_ACCOUNT` branch stores a `SIGNUP_PENDING` ticket and redirects to web `/auth/oauth/signup` interstitial. Audit event `OAUTH_SIGNUP`. Web page `OAuthSignup.tsx` collects family name + terms acceptance.
- **Phase 4 — DONE** (commit pending). Account settings UI + unlink. `DELETE /v1/auth/oauth/identities/:id` with last-identity guard (refuses unlink when user has no password and no other identity → returns `OAUTH_LAST_IDENTITY`). New `ConnectedAccountsCard` component on `/parent/settings`, surfaces `?oauth_linked=google` toast, Connect/Disconnect with tooltips. Link redirect target updated `/account/security` → `/parent/settings`. Audit event `OAUTH_UNLINKED`. Full API suite green (147/147 + 23 skipped); web suite green (56/56).

## Goal

Add Google sign-in for PARENT/CAREGIVER accounts. CHILD accounts unaffected (PIN/family-code login stays). Phased rollout: link-to-existing first, then sign-up, then expand providers later.

## Scope

- Google only in v1. Architecture leaves room for Apple/Microsoft.
- Web only in v1 (mobile pairing flow unchanged).
- Parents + Caregivers only. Children explicitly excluded — COPPA surface stays narrow.

## Non-goals

- No SSO/SAML.
- No replacing existing email+password — coexists.
- No social link for child accounts.

---

## Phase 0 — Foundation (schema + provider abstraction) — DONE

### Schema

New table `OAuthIdentity`:

```
id              String   @id @default(uuid())
userId          String
user            User     @relation(...)
provider        OAuthProvider   // enum: GOOGLE (APPLE/MICROSOFT later)
providerSub     String          // Google `sub` claim — stable per-user id
email           String          // email at link time, audit only
emailVerified   Boolean
linkedAt        DateTime @default(now())
lastLoginAt     DateTime?

@@unique([provider, providerSub])
@@unique([provider, userId])     // one Google account per user
@@index([userId])
```

`User.passwordHash` already nullable — supports passwordless social-only users in Phase 2.

Migration is additive only. No backfill. No data risk.

### Provider abstraction

New `apps/api/src/lib/oauth-provider.ts`:

```ts
interface OAuthProvider {
  name: "GOOGLE";
  buildAuthUrl(state: string, nonce: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<OAuthTokenSet>;
  verifyIdToken(idToken: string, nonce: string): Promise<OAuthClaims>;
}
class GoogleOAuthProvider implements OAuthProvider {
  /* ... */
}
```

`OAuthClaims = { sub, email, emailVerified, name, picture? }`.

Use `google-auth-library` (`OAuth2Client`) — handles JWKS, signature, `iss`/`aud`/`exp`/`nonce` validation.

### Env (apps/api/src/env.ts + .env.example)

```
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
GOOGLE_OAUTH_REDIRECT_URI       # https://app.chorechampz.com/auth/google/callback
SOCIAL_LOGIN_ENABLED=false      # kill-switch
```

Web:

```
VITE_SOCIAL_LOGIN_ENABLED
VITE_GOOGLE_OAUTH_CLIENT_ID     # for client-side button rendering
```

---

## Phase 1 — Link-to-existing (low risk, internal beta) — DONE

Flow: signed-in parent visits Account → Security → "Connect Google". Confirms parity with current email. Useful for support and dogfooding before letting unauthenticated users in.

### Shipped

Routes (`apps/api/src/routes/auth-oauth.ts`):

- `GET /v1/auth/oauth/:provider/link/start` (auth required) — calls `buildAuthorizeUrl({ intent: 'LINK', userId })`, 302 to provider authorize URL.
- `GET /v1/auth/oauth/:provider/callback` (public) — verifies signed state JWT, exchanges code, verifies id_token + nonce, dispatches by intent. LINK → `linkIdentity()` → 302 to `${APP_URL}/account/security?oauth_linked=google`. SIGNIN/SIGNUP currently throw `OAUTH_INTENT_UNSUPPORTED` until Phase 2/3.
- `GET /v1/auth/oauth/identities` (auth required) — returns the user's connected identities.

Router gated by `SOCIAL_LOGIN_ENABLED` — 404 when off so scanners can't see the surface.

Service (`apps/api/src/services/oauth.ts`):

- `mintOAuthState` / `verifyOAuthState` — JWT signed with `JWT_SECRET`, 10-min TTL, carries `{ purpose, intent, provider, uid, nonce, jti }`. State binding for LINK comes from the signed `uid` — attacker cannot forge a state for a victim's session without `JWT_SECRET`.
- `linkIdentity` collision rules: reject unverified Google email, reject mismatched email when user's account email is verified, reject when `(provider, providerSub)` already attached to a different user (`OAUTH_SUB_TAKEN`). Upsert keyed on `(provider, userId)` so re-link is idempotent and refreshes `lastLoginAt`.
- Audit event `OAUTH_LINKED` recorded when `user.familyId` is present (skipped for membership-only users until audit table accepts null `familyId`).

### Security notes (Phase 1)

- No cookie binding yet — LINK state carries `uid` and callback verifies the signed payload. SIGNIN (Phase 2) will need a state-cookie echo since SIGNIN state has no `uid` to bind against.
- `nonce` from state JWT asserted against `id_token.nonce` inside `GoogleOAuthProvider.verifyIdToken`.
- `aud`/`iss`/`exp`/signature handled by `google-auth-library`.
- `email_verified=true` enforced at link time.

### Tests

- `src/services/__tests__/oauth.test.ts` — state round-trip, garbage state rejected, link blocked on unverified email, link blocked on mismatched verified email, link allowed when account email unverified, sub-collision rejected, re-link idempotent, audit skipped when no familyId.
- `src/lib/__tests__/oauth-provider.test.ts` — disabled stub when flag off, factory throws on missing creds, authorize URL shape.
- 15/15 green. `pnpm typecheck` clean.

### Rollout gate

Default `SOCIAL_LOGIN_ENABLED=false`. Flip on staging only when:

1. Google OAuth client created in Google Cloud console.
2. `GOOGLE_OAUTH_REDIRECT_URI` whitelisted there.
3. Internal QA links Google to existing accounts end-to-end.

---

## Phase 2 — Sign-in with Google (existing accounts) — DONE

Unauthenticated user clicks "Sign in with Google" on `Login.tsx`. Matches `OAuthIdentity` by `(GOOGLE, sub)`.

### New endpoint behavior

`/auth/oauth/google/start` (no auth) — `state.intent = 'SIGNIN'`.

Callback handler branches on intent:

- `SIGNIN`:
  - Lookup `OAuthIdentity` by `(GOOGLE, sub)`.
  - If found → mint access + refresh tokens (existing `issueTokens` path), set cookies, redirect to `/`.
  - If not found but Google `email_verified=true` and a `User` with that email exists → **do not auto-link**. Redirect to `/login?social_unlinked=google&hint=<short-token>`. UI tells user to sign in with password, then link from Account settings. Prevents account-takeover via attacker controlling abandoned email.
  - If not found and no matching user → Phase 3 (sign-up) or reject.

### Security details (shipped)

- `state` is a signed JWT (`JWT_SECRET`, 10-min TTL, carries `intent`, `provider`, `nonce`, `jti`, `uid`).
- HttpOnly `cc_oauth_state` cookie holds `jti`; callback rejects when cookie missing or mismatched (CSRF guard for SIGNIN which has no `uid` binding).
- `nonce` from state asserted equal to `id_token.nonce` inside `GoogleOAuthProvider.verifyIdToken`.
- `iss` / `aud` / `exp` / signature verified by `google-auth-library`.
- `email_verified=true` enforced before any user lookup.
- **No auto-link** when sub is unknown but email matches an existing user — caller is redirected to `/login?social_unlinked=google`.
- Refresh tokens never appear in URLs. The callback stores the minted outcome under a single-use random ticket (60-second TTL, in-memory) and the SPA POSTs `/v1/auth/oauth/complete` with the ticket to receive `{ token, refreshToken, user }` or `{ needsFamilySelect, selectToken, families }`.
- In-memory ticket store is single-instance only; multi-instance deployments must move it to a shared cache (Redis) — TODO before horizontal scaling.
- Rate-limiting: `authLimiter` already wraps the router. No new per-route limit needed yet.

### Logout

`tokenVersion` increment on "logout everywhere" already kills all sessions — no oauth-specific work.

### Tests (shipped)

`src/services/__tests__/oauth.test.ts` — added: unverified email rejected, UNLINKED_EMAIL_MATCH path, NO_ACCOUNT path, CHILD role rejected, single-family tokens minted, multi-family FAMILY_SELECT, ticket round-trip + single-use burn, ticket replay rejected, cookie helpers. 19 oauth-service tests + 6 oauth-provider tests, all green. Full API suite 139/139 passing.

---

## Phase 3 — Sign-up with Google (new accounts) — DONE

Callback path for `SIGNIN` intent with no existing user → present "Create account with Google" interstitial. Confirms ToS acceptance, family name. Then:

- Create `User` (role=PARENT, `passwordHash=null`, `emailVerifiedAt=now`).
- Create `Family` (existing onboarding service).
- Insert `OAuthIdentity`.
- Issue tokens, redirect to onboarding tour.

### Constraints

- Email from Google must have `email_verified=true`.
- Same `acceptedTermsVersion`/`acceptedTermsAt` write as password sign-up.
- Reuse onboarding service — no parallel codepath.

### Recovery

Social-only user (no `passwordHash`) loses Google access → must use existing "forgot password" flow which sets a password and unlocks email login. Flow already account-existence-silent per CLAUDE.md; works unchanged.

---

## Phase 4 — Account settings UI — DONE

`apps/web/src/pages/parent/Security.tsx` (or existing account page):

- "Connected accounts" section.
- Google row: Connect / Disconnect.
- Disconnect blocked if user has no `passwordHash` and no other identity → force "Set password first" flow.
- Tooltip on each action per `chorechampz-web-feature` skill.

### Endpoints

- `GET /auth/oauth/identities` — list connected providers for current user.
- `DELETE /auth/oauth/identities/:id` — disconnect, with the no-orphan guard above.

---

## Web (apps/web)

- `lib/api.ts` adds `startGoogleLogin(intent: 'SIGNIN' | 'LINK')` → window.location to `/auth/oauth/google/start?intent=...`.
- `Login.tsx`: "Sign in with Google" button under password form, gated on `VITE_SOCIAL_LOGIN_ENABLED`.
- New page `pages/auth/OAuthCallback.tsx` only needed if we move to PKCE-in-browser. For server-side flow (recommended), callback hits the API directly and API redirects to `/` with cookies set — no React page required.
- Brand assets: Google's official "Sign in with Google" button per their branding guidelines (don't roll our own pixel art).

---

## Security checklist

- `state` signed, single-use, ≤10min TTL.
- `nonce` in id_token verified.
- `id_token` signature verified via Google JWKS (library handles).
- `aud` === our client_id, `iss` ∈ `accounts.google.com` / `https://accounts.google.com`.
- `email_verified=true` required for any account creation or matching.
- No auto-link on email match. Manual link only.
- Audit events: `OAUTH_LINKED`, `OAUTH_UNLINKED`, `OAUTH_SIGNIN`, `OAUTH_SIGNUP`.
- Refresh tokens unchanged — Google refresh token discarded; we only need `id_token` at login.
- HTTPS-only redirect URIs in Google console. No `localhost` in prod client; separate dev client.

---

## Rollout

1. Phase 0+1 behind `SOCIAL_LOGIN_ENABLED=false`. Migration ships. Tests green.
2. Flip flag on staging, internal QA links Google to existing accounts.
3. Phase 2 sign-in flag flip in prod for beta cohort.
4. Phase 3 sign-up — public.
5. Monitor: failed callback rate, `OAUTH_SIGNIN` vs password ratio, support tickets for "can't sign in".

---

## Risks

- Email collision attack: mitigated by no-auto-link rule (Phase 2).
- Google client secret in env — rotate on staff turnover; store in secret manager once available.
- Children inadvertently creating Google accounts — `Login.tsx` social button hidden on child login screen (`/child` route).
- Cookie SameSite — callback is top-level navigation, `SameSite=Lax` cookies fire correctly. `state` cookie set with `SameSite=Lax; Secure; HttpOnly`.
- Provider outage — degrade gracefully: keep password login as primary, social as additive.

---

## Out of scope / future

- Apple Sign-In (App Store requirement when iOS app ships).
- Microsoft (school/work accounts — pairs with Plan 06 school tenant).
- Account merge UI (two separate accounts that should be one).
- Step-up auth (re-verify before sensitive ops like role change).
