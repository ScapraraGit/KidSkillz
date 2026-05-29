# ChoreChampz Mobile — Capacitor Plan (iOS + Android)

Status: proposal · Target: App Store + Google Play · Approach: wrap the existing `apps/web` build in a Capacitor native shell.

## Why Capacitor

The web app (`apps/web`: React 18 + Vite + Tailwind + TanStack Query + Zustand) is already a clean client of a versioned REST API (`apps/api`, `/v1`, JWT + refresh tokens, device tokens via `x-device-token`). Business logic lives entirely in `apps/api/src/services/*` per the "routes are thin" rule, so a mobile client cannot bypass earning/redemption/proof/balance guards. That makes a second client almost entirely a presentation-layer concern. Capacitor lets us ship the existing React UI to both stores while reusing `packages/shared` DTOs and `lib/api.ts` untouched. The only genuinely new backend work is push notifications.

Scope of true new work: secure token storage, push notifications (new `PushProvider` + device-token registration), native camera for proof, deep links, and store/billing compliance.

---

## Phase 0 — Decisions to lock before code (½–1 week)

> **LOCKED 2026-05-28.** All four resolved per recommendation:
>
> 1. **Billing:** trial → paid + IAP (StoreKit + Play Billing). No free tier.
> 2. **Category:** Kids (Apple) / Designed for Families (Google) — no 3rd-party ads/behavioral analytics; analytics SDK choice constrained accordingly.
> 3. **Bundle ID:** `com.chorechampz.app`. Action items (Steve, outside code): enroll Apple Developer Program ($99/yr) + Google Play Console ($25 one-time), reserve the ID, provision signing (Apple certs/profiles, Android keystore), enroll Apple Small Business Program (15%).
> 4. **Shell:** single mobile binary serves both parent + child; role from JWT/device session. No split.

These gate later phases; resolve them first.

**Billing model (highest-risk).** Billing today is Stripe (`apps/api/src/services/billing.ts`, `BillingSection.tsx`, 402 → `billing:required` window event in `lib/api.ts`). The current model is **trial → paid**: `startTrial` sets a server-side `trialEndsAt` (no Stripe call), and `getEntitlement` returns `isPaid` only for `ACTIVE` or an unexpired `TRIALING` state, otherwise 402 gates. There is **no free-forever tier**.

Recommendation: **keep trial → paid and implement IAP** (StoreKit on iOS, Play Billing on Android). Rationale:

- A free-tier mobile app is _more_ work, not less — you'd have to design a third entitlement band and decide what stays free forever, which doesn't exist today. It also weakens monetization.
- The store cut is **15%, not 30%**, under Apple's Small Business Program (<$1M/yr proceeds — almost certainly applies; enroll annually) and Google Play's automatic 15% on the first $1M/yr. At $2.99/mo that nets **~$2.54**.
- Your trial is already server-side and platform-agnostic, so it stays as the source of truth; StoreKit/Play Billing is only invoked at the conversion moment when the trial ends. This is exactly the shape the stores expect (you are not offering an _IAP_ introductory trial, you simply aren't gating yet).
- Your entitlement is already **source-abstracted** (`source: "STRIPE" | "TRIAL" | "OVERRIDE"`), so IAP is two additional sources, not a rewrite. See the reconciliation appendix.

The US anti-steering injunction permits linking out to a web purchase, but for a $2.99 family app checkout friction costs more conversion than a 15% cut — not worth it at launch. The real cost of IAP is engineering (client purchase flows, server-side receipt verification, server-to-server renewal/cancel/refund notifications, restore purchases, sandbox testing), covered in Phase 5.

**Kids-category posture.** This is a children's product. Decide whether to list under the Kids category (Apple) / Designed for Families (Google), which forbid third-party ads/behavioral analytics and require parental gates. You already have caregiver PINs, parental approval, and terms gates, which align well. Decision affects analytics SDK choices and store metadata.

**Bundle identifiers & accounts.** Reserve `com.chorechampz.app` (or chosen ID), enroll in Apple Developer Program ($99/yr) and Google Play Console ($25 one-time). Provision signing (Apple certificates/profiles, Android keystore).

**Single shell vs. parent/child split.** Today web serves both `/parent` and `/child` flows in one app. Confirm a single mobile binary serves both roles (it should — role comes from JWT/device session). No split needed.

---

## Phase 1 — Capacitor scaffold (1 week)

Goal: existing web app runs as a native shell on both platforms, hitting the real API.

> **Progress 2026-05-28 (Android scaffold done on the Windows box; iOS pending a Mac).**
>
> - Deps added to `apps/web`: `@capacitor/core`, `@capacitor/ios`, `@capacitor/android` (dependencies) + `@capacitor/cli` (devDependency), all `^8.3.4`.
> - [apps/web/capacitor.config.ts](../apps/web/capacitor.config.ts): `appId="com.chorechampz.app"`, `appName="ChoreChampz"`, `webDir="dist"`, `server.androidScheme="https"`.
> - [apps/web/.gitignore](../apps/web/.gitignore): commits `ios/`/`android/` sources; ignores synced `public/` assets, `capacitor.config.json`, Gradle/Pods/build outputs, and all signing material (`*.keystore`, `*.jks`, `google-services.json`, `GoogleService-Info.plist`).
> - Scripts in `apps/web/package.json`: `cap:sync`, `cap:android`, `cap:ios` (each runs `pnpm build` then `cap sync`/`open`).
> - `pnpm exec cap add android` ran clean → `apps/web/android/` committed. Web `pnpm build` + `pnpm typecheck` green.
> - **Still TODO (needs macOS + Xcode):** `pnpm exec cap add ios`; then verify the auth → dashboard → task-complete loop in the iOS simulator and an Android emulator against staging. The Windows host has no Android SDK / no Xcode, so neither emulator run nor the iOS scaffold can happen here.
> - Note: `npx cap …` fails to resolve the binary under pnpm — use `pnpm exec cap …` (from `apps/web`) or `pnpm --filter @chorechampz/web exec cap …` from root.
>
> **Local Android dev wiring 2026-05-28 (no staging exists — emulator hits the local API).**
> There is no staging/deployed API yet, only local + prod. So the Android emulator must reach `apps/api` on the host. Wiring added, all dev-only and segregated from prod:
>
> - **`CAP_ENV` gate** in [capacitor.config.ts](../apps/web/capacitor.config.ts): `CAP_ENV=dev` → `androidScheme=http` (origin `http://localhost`, so calling the http API isn't WebView mixed-content); default/unset → `androidScheme=https` for prod.
> - **[.env.mobile](../.env.mobile)** (repo root, committed — not a secret): `VITE_API_URL=http://10.0.2.2:4000` (`10.0.2.2` = emulator's host-loopback alias). Loaded only by `vite build --mode mobile`, so `pnpm dev` web still uses `.env` → localhost.
> - **Debug-only cleartext**: [android/app/src/debug/AndroidManifest.xml](../apps/web/android/app/src/debug/AndroidManifest.xml) + `res/xml/network_security_config.xml` permit cleartext to `10.0.2.2`/`localhost`. Merged into **debug builds only** — release builds keep Android's cleartext-blocked default.
> - **Scripts** (`apps/web/package.json`): `cap:dev:android` / `cap:dev:ios` = `cross-env CAP_ENV=dev vite build --mode mobile` → `cap sync` → `cap open`. Prod `cap:android`/`cap:ios` unchanged (https + normal `.env`/build).
> - Verified without an SDK: `cap:dev` build+sync bakes `androidScheme:"http"` into `capacitor.config.json` and `http://10.0.2.2:4000` into the JS bundle. Web build + typecheck green.
> - **When a real HTTPS API exists:** point `VITE_API_URL` at it, drop `CAP_ENV=dev`, use the plain `cap:android`/`cap:ios` scripts. The debug overlay can stay (harmless; debug-only).
>
> **To actually run it (your box — toolchain not installed here):** install Android Studio (bundles SDK + emulator + JDK), create an AVD, start `apps/api` locally on :4000, then `pnpm --filter @chorechampz/web cap:dev:android` and Run from Android Studio.

- Add `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, `@capacitor/android` to `apps/web` (or a thin new `apps/mobile` that consumes the web build — recommend keeping it in `apps/web` to avoid a second build pipeline).
- `capacitor.config.ts`: `webDir` → Vite `dist`, `appId`, `appName`, `server.androidScheme=https`.
- Generate native projects: `npx cap add ios`, `npx cap add android`. These produce `ios/` and `android/` folders to commit (add build artifacts to `.gitignore`).
- Point the shell at the production API. `VITE_API_URL` is already the single source for the API base in `lib/api.ts`; set it per build. Native apps have no Origin header, so CORS (`CORS_ORIGIN` exact-match list in `apps/api/src/app.ts`) is a non-issue for native — but keep the web allow-list intact.
- Verify the full auth → dashboard → task-complete loop works in the iOS simulator and an Android emulator.

Exit criteria: login, `/tasks/today`, complete a task, see ledger update — all working in both simulators against staging.

---

## Phase 2 — Secure token storage (3–5 days)

Goal: stop persisting JWTs in web `localStorage` on device.

Current state: `apps/web/src/store/auth.ts` uses Zustand `persist` with `localStorage` (`name: "chorechampz-auth"`); `apps/web/src/lib/deviceToken.ts` stores the device token in `localStorage` too. In a WebView these are recoverable plaintext.

- Add `@capacitor/preferences` (encrypted on-device) or a secure-storage plugin backed by iOS Keychain / Android Keystore.
- Introduce a small storage adapter so web keeps `localStorage` and native uses secure storage. Swap the Zustand `persist` storage option and the `deviceToken.ts` getters/setters behind one interface — mirrors the existing `StorageProvider`/`EmailProvider` "swap one class" pattern in the codebase.
- No backend change: the refresh-token single-flight flow in `lib/api.ts` (`refreshAccessToken`, `/auth/refresh`) already handles token rotation; we're only changing where tokens rest.

Exit criteria: tokens survive app restart, are not in WebView `localStorage`, and refresh-on-401 still works.

> **Done 2026-05-29 (code).** Backend chosen: **Keychain/Keystore** via `@aparajita/capacitor-secure-storage@8.0.0` (peer-locked to Cap 8; pulls `@capacitor/app` + `@capacitor/keyboard`).
>
> - [lib/secureStore.ts](../apps/web/src/lib/secureStore.ts): `AsyncKV` adapter — native → Keychain/Keystore, web → `localStorage`. Exports `authPersistStorage` (a Zustand `StateStorage`): web returns sync `localStorage` (zero hydration gap/regression), native wraps the async KV.
> - [store/auth.ts](../apps/web/src/store/auth.ts): `persist` now uses `createJSONStorage(() => authPersistStorage)`. Same `name: "chorechampz-auth"`, so web sessions are unaffected; native reads from Keychain.
> - [lib/deviceToken.ts](../apps/web/src/lib/deviceToken.ts): rewritten to a sync-getter / in-memory-cache front over the async store (api.ts and Login read synchronously). Web seeds the cache at import; native seeds via `initDeviceSession()`.
> - [lib/boot.ts](../apps/web/src/lib/boot.ts) + [main.tsx](../apps/web/src/main.tsx): native render is gated on `awaitBoot()` (auth-persist hydration + device-session load) so the app never flashes logged-out or fires a tokenless request. No-op on web.
> - **Native migration note:** first launch after this change logs native users out once (token moves localStorage → Keychain). Fine pre-release.
> - Typecheck + 56 web tests green; `cap sync` registers the plugin.

---

## Phase 3 — Push notifications (1.5–2 weeks, the main backend work)

Goal: native push for parent-approval pings, redemption events, challenge/level-ups — the events already flowing through `createNotification`.

Backend (mirror the existing provider pattern):

- New `PushProvider` interface in `apps/api/src/lib/push-provider.ts`, modeled exactly on `apps/api/src/lib/email-provider.ts`: an `ApnsFcmProvider` (Firebase Cloud Messaging fronting both APNs + Android) selected when `PUSH_ENABLED=true`, and a `ConsolePushProvider` default for dev. Add `PUSH_ENABLED`, FCM credentials to `env.ts` **and** `.env.example` in the same change (env-var rule).
- Device push-token registration: add a `PushToken` table (`familyId`, `userId`, `platform`, `token`, `lastSeenAt`) and a thin endpoint `POST /v1/notifications/push-tokens` (Zod-validated, scoped by `familyId`, calls a `notifications` service fn). Model the lifecycle on the existing `EnrolledDevice`/device-pairing pattern. Ship a Prisma **migration** (never `db push` against Neon).
- Hook delivery into the one chokepoint: `createNotification` in `apps/api/src/services/notifications.ts` already mirrors to email via `setImmediate` (fire-and-forget, so it never blocks the surrounding `$transaction`). Add a parallel `deliverPushMirror(opts)` alongside `deliverEmailMirror`, gated on a family/user setting. Swallow errors like the email mirror does — the in-app `Notification` row is the source of truth.

Mobile:

- Add `@capacitor/push-notifications`; request permission post-login, register the FCM token via the new endpoint, re-register on rotation, clear on logout.
- Map notification `payload` (already carried on `Notification`) to deep links into the right screen (see Phase 4).

Exit criteria: completing a child task fires a native push to the parent device on both platforms; tapping it deep-links to the approval screen.

> **Done 2026-05-29 (mobile half, code).** Backend half completed 2026-05-28 (provider, `PushToken`, `POST/DELETE /v1/notifications/push-tokens`, `deliverPushMirror`, `pushNotifications` setting, tests).
>
> - Plugin `@capacitor/push-notifications@8.1.1` installed + synced.
> - [lib/push.ts](../apps/web/src/lib/push.ts): `registerPushForSession()` (perm request → `register()` → on `registration` POST the FCM token, platform from `Capacitor.getPlatform()`), `teardownPushForSession()` (DELETE token + clear listeners), and a `pushNotificationActionPerformed` handler that deep-links by recipient role + notification kind. Native-only; no-ops on web. Idempotent (clears listeners before re-wiring) → safe across re-login / token rotation.
> - [App.tsx](../apps/web/src/App.tsx): wired to the auth lifecycle via a `useAuth.subscribe` token-presence watcher — register on login, teardown on logout, covering every login path without per-page code. `navigate` handler set for deep links.
> - **Runtime delivery still needs provisioning (not code) before it works on-device:**
>   1. Firebase project → `google-services.json` into `apps/web/android/app/` + apply the `com.google.gms.google-services` Gradle plugin (Capacitor's push plugin does NOT auto-apply it). Without this, `register()` raises `registrationError` (caught — app is fine) but no token is minted.
>   2. APNs key in Firebase for iOS.
>   3. Server: `PUSH_ENABLED=true` + `FCM_SERVICE_ACCOUNT_JSON` (the service-account key).
>   4. Family setting `pushNotifications` turned on.
> - Deep-link routing is role+kind based; payload-specific routing (jump to the exact completion) lands with Phase 4 deep links.

---

## Phase 4 — Native device integration (1 week)

- **Camera / proof uploads.** `uploadProof(file)` in `lib/api.ts` posts `FormData` to `/v1/uploads/proof`. Add `@capacitor/camera` so children can shoot proof photos directly; convert the captured blob to a `File`/`Blob` and reuse `uploadProof` unchanged. Proof-requirement logic stays server-side (`ProofRequirement`, child-override-over-task resolution).
- **Deep links / app links.** You already have URL-credential flows: invitation accept, password reset, device pairing, and the `/child?fc=<code>&fn=<name>` QR prefill. Configure iOS Universal Links + Android App Links so these open the app instead of the browser, with web fallback. Register associated-domains / `assetlinks.json` on the API host.
- **Status bar, splash, safe areas.** Add `@capacitor/splash-screen`, `@capacitor/status-bar`; verify the mobile-responsive chrome (`PageHeader` `flex-col`/`sm:flex-row`, `flex-wrap` action groups) renders correctly inside notch/safe-area insets.

Exit criteria: shoot-and-submit proof works; an invitation/QR link cold-opens the app to the right screen.

---

## Phase 5 — Store readiness & billing (1.5–2 weeks)

- Implement IAP per the reconciliation appendix: StoreKit 2 (iOS) + Play Billing (Android) purchase flows, server-side receipt verification, server-to-server renewal/cancel/refund notifications, and "restore purchases." Feed both into the existing source-abstracted `getEntitlement` so a family stays paid regardless of purchase channel. Enroll in Apple's Small Business Program (15%).
- Double-charge guards: hide the IAP paywall when a family is already `ACTIVE` via Stripe or `OVERRIDE`; on web, show "manage in App Store / Play Store" when an active `IapSubscription` exists (a Stripe portal can't cancel an Apple/Google sub).
- Store assets: icons, splash, screenshots (parent + child views), privacy policy (you have `Legal.tsx`/`LegalFooter.tsx`), data-safety / App Privacy disclosures (declare photo capture, push tokens, account data).
- Parental-gate and kids-compliance review pass per Phase 0 decision.
- Account-deletion path (Apple requires in-app account deletion for apps with accounts) — confirm `data-export.ts` / account flows cover deletion or add it.

Exit criteria: TestFlight + Play internal-testing builds installable by the team; store listings drafted.

---

## Phase 6 — CI/CD, release, and ops (1 week, can overlap)

- No CI exists yet (acknowledged gap). Add a workflow that builds the web bundle, runs `pnpm lint/typecheck/test`, and produces signed iOS/Android artifacts (Fastlane or EAS-style). Keep API container startup on `prisma migrate deploy`.
- OTA web-layer updates (optional): a Capacitor live-update channel lets you ship JS/CSS fixes without a store review, while native changes (plugins, permissions) still require a submission.
- Crash/observability sized to the kids-category analytics constraints from Phase 0.
- Submit to TestFlight + Play internal track → closed beta (you already have a beta surface: `apps/web/src/pages/beta`, `beta.ts` service, long-lived device pairing for testers) → production.

---

## Effort summary

| Phase | Work                                                    | Rough size      |
| ----- | ------------------------------------------------------- | --------------- |
| 0     | Decisions: billing, kids posture, accounts              | ½–1 wk          |
| 1     | Capacitor scaffold, both platforms                      | 1 wk            |
| 2     | Secure token storage                                    | 3–5 days        |
| 3     | Push notifications (PushProvider + registration + hook) | 1.5–2 wks       |
| 4     | Camera proof, deep links, chrome                        | 1 wk            |
| 5     | Store readiness + billing                               | 1.5–2 wks       |
| 6     | CI/CD + release                                         | 1 wk (overlaps) |

Ballpark: **~6–9 weeks** for one engineer to first store submission, faster with the billing decision deferred to free-tier-only. Phases 2 and 4 can parallelize against Phase 3.

## What does NOT change

- API services, tenant isolation (`familyId` scoping), the append-only ledger / `postLedger()`, proof-requirement resolution, recurring-task walking — all server-side and client-agnostic.
- `packages/shared` DTOs/enums — reused as-is.
- `lib/api.ts` request/refresh logic — reused; only token _storage_ location changes.

## Backend changes checklist (the only server work)

1. `apps/api/src/lib/push-provider.ts` — new `PushProvider` interface + FCM/console impls (mirror `email-provider.ts`).
2. `env.ts` + `.env.example` — `PUSH_ENABLED`, FCM creds (same-change rule).
3. Prisma migration — `PushToken` table (`familyId`-scoped). Migration file, not `db push`.
4. `POST /v1/notifications/push-tokens` — thin Zod-validated route → notifications service.
5. `apps/api/src/services/notifications.ts` — add `deliverPushMirror` alongside `deliverEmailMirror` in `createNotification` (fire-and-forget, error-swallowing).
6. Test: extend `notifications` service tests for the push mirror; pure-logic where possible.

---

# Appendix — deep dives

## A1. `PushProvider` interface (`apps/api/src/lib/push-provider.ts`)

Modeled one-for-one on `email-provider.ts`: an interface, a real impl gated on `env`, a console impl for dev, and a `buildProvider()` selector exported as a singleton. FCM (firebase-admin) fronts both APNs and Android, so one provider covers both platforms.

```ts
import { env } from "../env.js";
import admin from "firebase-admin";

export interface PushMessage {
  tokens: string[]; // device tokens to fan out to
  title: string;
  body?: string;
  data?: Record<string, string>; // deep-link payload; FCM data values must be strings
}

export interface PushSendResult {
  successCount: number;
  failureCount: number;
  invalidTokens: string[]; // prune these from PushToken (UNREGISTERED / invalid)
}

export interface PushProvider {
  send(msg: PushMessage): Promise<PushSendResult>;
}

class FcmProvider implements PushProvider {
  private messaging: admin.messaging.Messaging;
  constructor(serviceAccountJson: string) {
    const app = admin.apps.length
      ? admin.app()
      : admin.initializeApp({ credential: admin.credential.cert(JSON.parse(serviceAccountJson)) });
    this.messaging = admin.messaging(app);
  }
  async send(msg: PushMessage): Promise<PushSendResult> {
    if (msg.tokens.length === 0) return { successCount: 0, failureCount: 0, invalidTokens: [] };
    const res = await this.messaging.sendEachForMulticast({
      tokens: msg.tokens,
      notification: { title: msg.title, body: msg.body },
      data: msg.data,
    });
    const invalidTokens: string[] = [];
    res.responses.forEach((r, i) => {
      const code = r.error?.code;
      if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-argument") {
        invalidTokens.push(msg.tokens[i]);
      }
    });
    return { successCount: res.successCount, failureCount: res.failureCount, invalidTokens };
  }
}

class ConsolePushProvider implements PushProvider {
  async send(msg: PushMessage): Promise<PushSendResult> {
    // eslint-disable-next-line no-console
    console.log("[push:console]", { tokens: msg.tokens.length, title: msg.title, data: msg.data ?? null });
    return { successCount: msg.tokens.length, failureCount: 0, invalidTokens: [] };
  }
}

function buildProvider(): PushProvider {
  if (env.PUSH_ENABLED) {
    if (!env.FCM_SERVICE_ACCOUNT_JSON)
      throw new Error("PUSH_ENABLED=true but FCM_SERVICE_ACCOUNT_JSON is empty");
    return new FcmProvider(env.FCM_SERVICE_ACCOUNT_JSON);
  }
  return new ConsolePushProvider();
}

export const pushProvider: PushProvider = buildProvider();
```

Env (add to `env.ts` **and** `.env.example` in the same change — env-var rule): `PUSH_ENABLED` (default `false` → console), `FCM_SERVICE_ACCOUNT_JSON` (the service-account credential, API section).

Hook in `notifications.ts` — add alongside `deliverEmailMirror`, fired from the same `setImmediate` so it never blocks the surrounding `$transaction`, and swallow errors (the in-app `Notification` row is the source of truth):

```ts
async function deliverPushMirror(opts: CreateOpts) {
  const settings = await getFamilySettings(opts.familyId);
  if (!settings.pushNotifications) return; // new family setting
  const tokens = await prisma.pushToken.findMany({
    where: { userId: opts.userId },
    select: { token: true },
  });
  if (tokens.length === 0) return;
  const res = await pushProvider.send({
    tokens: tokens.map((t) => t.token),
    title: opts.title,
    body: opts.body,
    data: { kind: opts.kind, ...(opts.payload as Record<string, string> | undefined) },
  });
  if (res.invalidTokens.length) {
    await prisma.pushToken.deleteMany({ where: { token: { in: res.invalidTokens } } });
  }
}
```

## A2. `PushToken` model + migration

> Committed: these models now live in `apps/api/prisma/schema.prisma` with migration `20260528120000_push_and_iap`. They use `@default(uuid())` (repo convention, not `cuid()`) and store audit "by" fields as plain `String`s (matching `billingOverrideBy`, `claimedByUserId`). The blocks below are the canonical, committed shapes.

```prisma
enum PushPlatform {
  IOS
  ANDROID
  WEB
}

model PushToken {
  id         String       @id @default(uuid())
  familyId   String
  userId     String
  platform   PushPlatform
  token      String       @unique            // re-registration upserts on token
  lastSeenAt DateTime     @default(now())
  createdAt  DateTime     @default(now())
  family     Family       @relation(fields: [familyId], references: [id], onDelete: Cascade)
  user       User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([familyId])
  @@index([userId])
}
```

Additive only (new enum, new table, new indexes — no column drops), so the migration is safe. Generate it with `pnpm db:migrate` (writes the migration file); **never** `db push` against Neon. Registration endpoint `POST /v1/notifications/push-tokens` stays thin: Zod-validate `{ token, platform }`, derive `familyId`/`userId` from the JWT, `upsert` on `token`, bump `lastSeenAt`. Clear the row on logout.

## A3. IAP ↔ Stripe reconciliation

The whole design leans on one fact: **the family is the unit of subscription, and `getEntitlement` is already source-abstracted.** IAP becomes two more sources feeding the same family-level decision.

**Extend the source union and the resolution.**

```ts
source: "STRIPE" | "TRIAL" | "OVERRIDE" | "APPLE_IAP" | "GOOGLE_PLAY";
```

`getEntitlement` resolution becomes "best entitlement wins": `OVERRIDE` → any active **paid** source (Stripe `ACTIVE` **or** an `ACTIVE` `IapEntitlementGrant` whose subscription is active/unexpired) → active `TRIAL` → none. `isPaid = override || stripeActive || iapActive || trialActive`. The trial layer is unchanged and platform-agnostic.

**Store the subscription separately from its family bindings.** One store account can fund more than one family (e.g. a divorced parent managing chores in two households), and a binding must be **independently revocable** without canceling the underlying store subscription (e.g. the parent remarries and stops funding the ex-household). So the purchase and the family grant are two tables: `IapSubscription` is the store purchase (owned by the purchasing user, keyed by the stable transaction id); `IapEntitlementGrant` is a revocable link from one subscription to one family.

```prisma
enum GrantStatus {
  ACTIVE
  REVOKED
}

model IapSubscription {
  id                    String                @id @default(uuid())
  purchaserUserId       String                          // whose store account owns it
  purchaser             User                  @relation("IapPurchaser", fields: [purchaserUserId], references: [id], onDelete: Cascade)
  platform              PushPlatform                    // IOS | ANDROID
  productId             String
  originalTransactionId String                @unique   // Apple original_transaction_id / Google purchaseToken
  status                SubscriptionStatus    @default(INCOMPLETE)  // reuse existing enum
  expiresAt             DateTime?
  autoRenewing          Boolean               @default(true)
  lastVerifiedAt        DateTime              @default(now())
  createdAt             DateTime              @default(now())
  updatedAt             DateTime              @updatedAt
  grants                IapEntitlementGrant[]

  @@index([purchaserUserId])
  @@index([status])
}

model IapEntitlementGrant {
  id              String          @id @default(uuid())
  subscriptionId  String
  subscription    IapSubscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)
  familyId        String
  family          Family          @relation(fields: [familyId], references: [id], onDelete: Cascade)
  status          GrantStatus     @default(ACTIVE)
  grantedByUserId String
  grantedAt       DateTime        @default(now())
  revokedByUserId String?
  revokedAt       DateTime?

  @@unique([subscriptionId, familyId])             // one grant per (sub, family)
  @@index([familyId])
  @@index([status])
}
```

A family is IAP-paid when it has an `ACTIVE` grant whose subscription is itself active/unexpired. Detaching a family = flip that grant to `REVOKED` (record `revokedByUserId`/`revokedAt`); the `IapSubscription` is untouched, so the purchaser's other family keeps its entitlement. When the underlying subscription lapses (payment fails, canceled, expired), every `ACTIVE` grant silently loses entitlement because resolution checks the subscription's `status`/`expiresAt` — no grant changes needed; entitlement returns automatically on renewal.

Policy knobs to set (config, not hardcode): a **cap on families per subscription** (Steve's case is two households, so a small cap like 2–3 prevents one $2.99 sub from funding fifty families), and **who may revoke a grant** — recommend either the purchaser or the target family's billing owner, so a family can refuse funding it no longer wants.

**Verification flow (mirrors the Stripe webhook + `StripeEvent` idempotency pattern).**

- iOS: app sends the StoreKit 2 signed transaction (JWS) to `POST /v1/billing/iap/apple`. Server verifies via the App Store Server API, upserts the `IapSubscription` against `purchaserUserId` (from the JWT), and creates/reactivates an `IapEntitlementGrant` for the session's active family. A purchaser funding a second family hits a separate "apply my subscription to this family" action that adds another grant (subject to the family cap).
- Renewals/cancels/refunds: Apple **App Store Server Notifications V2** → `POST /v1/billing/iap/apple/notifications`. Persist raw events in an `AppleNotification` table with the same dedupe-on-insert idempotency the `StripeEvent` table uses, then mutate `IapSubscription`.
- Android: app sends the `purchaseToken` to `POST /v1/billing/iap/google`; server verifies via the Play Developer API (`purchases.subscriptionsv2.get`), upserts. **Real-time Developer Notifications** (Pub/Sub) → equivalent webhook.

**Double-charge / cross-channel guards.**

- Before showing the IAP paywall in the app, call `/billing/status`; if the family is already paid via an active grant, `STRIPE`, or `OVERRIDE`, hide IAP and show who's funding it ("covered by Alex's App Store subscription" / "managed on the web" / "comped") so nobody double-pays.
- On web, if the family is funded by an `IapEntitlementGrant`, replace the Stripe portal CTA with "manage in App Store / Play Store" — a Stripe billing portal cannot cancel a store subscription.

**Restore purchases (Apple-required).** A "Restore" action re-sends StoreKit 2 `currentEntitlements` to the verify endpoint, re-binding the `IapSubscription` to the purchasing user and reactivating its grant for the current family. Essential after reinstall or when a parent signs in on a new device.

**Subscription / family management UI.** Two surfaces fall out of the grant model: the purchaser sees "this subscription funds: Family A, Family B [remove]" and can revoke a grant; each family's billing screen shows its funding source and, for the billing owner, a "stop using this funding" action. Revoking a grant drops that family to its next-best source (Stripe → trial → none) and should surface a clear "set up your own plan" prompt rather than silently going unpaid. This covers the remarriage / no-longer-responsible case directly.
