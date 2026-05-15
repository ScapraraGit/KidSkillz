# Device Pairing Plan

Replace family-code + shared-device-password kid login with **device pairing**. Kid never types family name, code, or family password. Device holds long-lived family-scoped token; kid login is just profile pick + PIN.

Effort: **S** <1d · **M** 1–3d · **L** >3d.

## Goals

- Kid on a paired device sees profile picker instantly. No family lookup.
- Pairing happens once per device, driven by parent. QR scan, short pairing code, or tap-to-pair link.
- Lost/stolen device: parent revokes from Settings, that device's token dies on next request.
- familyCode kept only as parent-readable fallback for first pairing on fresh device (not user-facing for kids).
- Caregivers reuse same primitive: parent issues short-lived pairing token to in-person caregiver device.

## Non-goals

- Native mobile app device attestation (Play Integrity / DeviceCheck) — out of scope for beta.
- Multi-family device (one tablet shared across two households). Future.

---

## Architecture

### Schema

```prisma
model EnrolledDevice {
  id              String    @id @default(uuid())
  familyId        String
  family          Family    @relation(fields: [familyId], references: [id], onDelete: Cascade)
  label           String    // "Kitchen iPad", "Ava's Kindle"
  // sha256 of the long-lived device token. Raw token only seen at issuance.
  deviceTokenHash String    @unique
  // Set on first redeem so the parent sees when a device went online.
  enrolledAt      DateTime?
  lastSeenAt      DateTime?
  // Soft-revoke. requireDevice rejects on non-null.
  revokedAt       DateTime?
  revokedById     String?
  createdById     String    // parent who issued the enrollment
  createdAt       DateTime  @default(now())

  @@index([familyId])
}

model DeviceEnrollment {
  id           String   @id @default(uuid())
  familyId     String
  // sha256 of the 8-char pairing code displayed to the parent.
  codeHash     String   @unique
  // Optional QR payload includes both code + JWT signed nonce so QR scans skip retyping.
  // Hash here so DB leak doesn't reveal still-valid pairing links.
  nonceHash    String?  @unique
  label        String?  // pre-filled "Kitchen iPad" if parent named it
  expiresAt    DateTime
  consumedAt   DateTime?
  consumedDeviceId String?  // EnrolledDevice.id once redeemed
  createdById  String
  createdAt    DateTime @default(now())

  @@index([familyId, expiresAt])
}
```

Both tables tenant-scoped by familyId per project rule.

### Token model

Two kinds of credentials:
1. **Enrollment code/nonce** — short-lived (10 min), single-use. Displayed as 8-char pairing code + QR. Consumed by `/auth/devices/redeem` to mint a device token.
2. **Device token** — long-lived (e.g. 1 yr sliding), opaque base64 (32 random bytes). Stored hashed on `EnrolledDevice.deviceTokenHash`. Sent by kid device on every request as `x-device-token: <token>`. Revocable. Family-scoped only — does NOT authenticate any user.

JWT (existing user auth) stays orthogonal. Device token is a *family scope* gate; user auth (parent / kid / caregiver) layers on top:

| Request | Headers | Auth result |
|---|---|---|
| `GET /auth/device/profiles` | `x-device-token` | Returns kid profile list for that family |
| `POST /auth/child/login` | `x-device-token` + body `{childId, pin}` | PIN verified within device's family |
| `POST /auth/caregiver/pin-login` | `x-device-token` + body `{pin, name}` | Caregiver PIN verified within device's family |
| Anything else | `Authorization: Bearer <jwt>` | Existing user auth |

### Middleware

`requireDeviceToken` (new): reads `x-device-token`, hashes, looks up `EnrolledDevice` where `revokedAt IS NULL`. Throws 401 on miss/revoked. Sets `req.device = { id, familyId }`. Bumps `lastSeenAt` async.

`requireAuth` unchanged. Routes pick the middleware they need.

---

## Endpoints

### Parent flow (issuing pairings)

- `POST /auth/devices/enroll` (PARENT)
  - Body: `{ label?: string }`
  - Returns: `{ pairingCode: "ABCD-EF12", qrPayload: "ccz://pair/<base64>", expiresAt }`
  - Codes use 8 chars from `CODE_ALPHABET` (no O/0/I/1/L). One-shot.
- `GET /family/devices` (PARENT)
  - Returns: `[{ id, label, enrolledAt, lastSeenAt, revoked: bool }]`
- `POST /family/devices/:id/revoke` (PARENT) — sets `revokedAt`. Audit-logged.
- `POST /family/devices/:id/rename` (PARENT) — relabel.

### Device flow (redeeming + using)

- `POST /auth/devices/redeem` (unauth, rate-limited)
  - Body: `{ pairingCode } | { qrNonce }`
  - Verifies code, marks `DeviceEnrollment.consumedAt`, creates `EnrolledDevice`, returns `{ deviceToken, familyId, label }`.
  - Device stores `deviceToken` in localStorage / IndexedDB (long-lived).
- `GET /auth/device/profiles` (device-auth)
  - Returns `[{ id, name, avatarColor, avatarConfig }]` for active kids in `req.device.familyId`.
- `POST /auth/child/login` (device-auth, PIN check)
  - Drops `familyPassword` branch entirely. familyCode/SHARED_DEVICE password become legacy. Body: `{ childId, pin? }`. PIN required when `family.childAuthMode === INDIVIDUAL`; auto-login (no PIN) is opt-in per-family setting.
- `POST /auth/caregiver/pin-login` (device-auth)
  - Body: `{ pin, name? }`. Replaces current `/invitations/pin-login` lookup-by-familyId.

### Web routes

- `/pair` — landing page. Reads `?token=` from QR. POST `/auth/devices/redeem` with `qrNonce`. Stores deviceToken. Redirect to profile picker. Falls back to 8-char input form if no `?token`.
- `/login` (kid mode) — calls `GET /auth/device/profiles` on mount. If 401 (no device token) → redirect to `/pair`. If 200 → show profile picker. No family-name / family-code inputs.
- Parent Settings → new "Devices" card: list, rename, revoke, "Pair a new device" button that opens modal with the live pairing code + QR.

---

## Migration / rollout

1. Ship pairing infra under feature flag `DEVICE_PAIRING_ENABLED` (default off in prod).
2. Backfill: any family with `childAuthMode = SHARED_DEVICE` keeps current flow until they pair their first device. After first pair, drop family-password UI for that family.
3. familyCode + Family.devicePasswordHash retained one beta cycle as escape hatch, removed in follow-up.
4. CaregiverPin page (familyCode + caregiver PIN) gets the same `/pair` redirect treatment; PIN check moves under device-auth.

---

## Threats addressed

| Threat | Mitigation |
|---|---|
| Family-name enumeration | Endpoint removed for kid login path (only fresh-device pairing needs anything tenant-discoverable, and pairing requires parent-issued code) |
| 4-digit PIN brute force across unknown families | Device token scopes PIN attempts to one family. Combined with existing lockout (plan 03 #1) |
| Token theft via localStorage XSS | Device token rotates on revoke. Per-device label lets parent revoke the suspicious one without affecting siblings |
| Phished pairing code | 10-min TTL, single-use, displayed only inside authenticated parent UI (not emailed/SMSed) |
| Stolen tablet | Parent revokes from Settings; next request 401 → device returns to /pair |

## Threats NOT addressed (acknowledged)

- Parent device compromise can issue unlimited pairings. Audit log lists every issuance — parent reviews periodically.
- Pairing code shoulder-surfing in same room. 10-min TTL + single-use limits blast radius.

---

## Tasks

### Server — **M**

- Schema + migration: `EnrolledDevice`, `DeviceEnrollment`. Cascade-on-family-delete. Compound indexes.
- `apps/api/src/services/device-pairing.ts`:
  - `issueEnrollment({ familyId, label, createdById }) → { pairingCode, qrNonce, expiresAt }`
  - `redeemEnrollment({ pairingCode? | qrNonce? }) → { deviceToken, familyId, label }`
  - `listDevices(familyId)`, `revokeDevice(familyId, deviceId, actorId)`, `renameDevice(familyId, deviceId, label)`
  - Tests: code/nonce one-shot, expired-rejection, revoked-device-rejection, family-scope assertions
- `apps/api/src/middleware/device.ts` — `requireDeviceToken`, sets `req.device`. Adds Express type augmentation.
- Routes:
  - `POST /v1/auth/devices/enroll` (parent-auth)
  - `POST /v1/auth/devices/redeem` (unauth, behind `lookupRateLimiter` + Turnstile)
  - `GET /v1/auth/device/profiles` (device-auth)
  - `GET /v1/family/devices`, `POST /v1/family/devices/:id/revoke`, `POST /v1/family/devices/:id/rename` (parent-auth)
- Update `POST /v1/auth/child/login` and `POST /v1/invitations/pin-login` to require device token; remove `familyPassword` branch under feature flag.
- Feature flag `DEVICE_PAIRING_ENABLED` on env + propagated to `/v1/auth/me` features payload.
- Audit kinds: `DEVICE_ENROLLED`, `DEVICE_REDEEMED`, `DEVICE_REVOKED`, `DEVICE_RENAMED`, `DEVICE_PAIRING_FAILED`.

### Web — **M**

- `apps/web/src/lib/deviceToken.ts` — get/set/clear in localStorage. Adds `x-device-token` header in `lib/api.ts` when present.
- `apps/web/src/pages/Pair.tsx` — QR + 8-char input. On success, stores token, redirects to `/login`.
- `apps/web/src/pages/Login.tsx` ChildLogin — drop family lookup, hit `/auth/device/profiles` on mount. On 401: redirect `/pair`.
- `apps/web/src/pages/CaregiverPin.tsx` — same redirect-on-no-device pattern.
- `apps/web/src/pages/parent/Settings.tsx` — new Devices card. Buttons: "Pair a new device" (opens modal with code + QR), per-row Rename / Revoke.
- `apps/web/src/components/QrCode.tsx` — small wrapper around `qrcode` lib (vendored, no remote calls).
- Remove familyCode + family-password inputs from kid/caregiver flows when feature flag on.

### QR + pairing-code UX — **S**

- Code format: `XXXX-XXXX` (8 chars from 31-char alphabet, hyphen for readability). Display large monospace.
- QR encodes `https://app.host/pair?nonce=<base64-jwt>` so a phone-camera scan jumps straight to redemption. JWT signed with `JWT_SECRET`, 10-min exp, single-use enforced via `nonceHash` in DB.
- Web app + native browser scanners must both accept it; no custom scheme.

### Tests — **M**

- Unit: `device-pairing.ts` service (pure-logic + DB).
- Route integration (Tier supertest): enroll → redeem flow, expired pairing, double-redeem, revoke kills lookup, cross-family device token → 404.
- Web Playwright (slot into plan 03 #14): parent pair → kid login on paired device golden path.

### Docs — **S**

- `docs/operations/device-pairing.md`: support runbook (lost device, parent reset flow).
- Privacy policy update: deviceToken disclosure, retention on revoke.

---

## Sequencing

Week 1: schema + service + tests + parent enroll/list/revoke routes.
Week 2: kid + caregiver redemption + login refactor, web /pair page.
Week 3: Settings UI, Playwright happy path, feature-flag flip in staging.
Week 4: production flag-on, deprecate familyCode + Family.devicePasswordHash UI (keep DB columns one cycle).

## Dependencies

- Plan 03 #1 PIN lockout (already shipped) — PIN attempts now scoped to one family via device token; lockout still applies per-child.
- Plan 03 #5 Turnstile — apply to `/auth/devices/redeem` to gate brute force on pairing code.
- Plan 03 #8 JWT lifecycle — separate concern; device token is its own credential.

## Out of scope

- Multi-family device.
- Hardware attestation.
- Remote wipe (deviceToken revoke covers the access surface; local proof photos in IndexedDB cache stay until the device clears).
