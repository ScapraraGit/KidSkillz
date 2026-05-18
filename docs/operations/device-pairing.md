# Device pairing — support runbook

Operational reference for the device-pairing login path (Plan 04). Covers what's on each device, how parents pair / revoke, and how support unblocks the common stuck cases.

This document assumes `DEVICE_PAIRING_ENABLED=true`. When the flag is off the legacy familyCode + shared-device-password flow is in effect — see the comments in [apps/api/src/routes/auth.ts](../../apps/api/src/routes/auth.ts) for that path.

---

## What's actually stored

### On the device (browser)

- `localStorage["chorechampz.deviceToken"]` — opaque 32-byte token, base64url-encoded. Long-lived (1 yr sliding). Sent as `x-device-token: <token>` on kid + caregiver auth requests.
- That's it. No family name, no familyCode, no parent identity. Clearing localStorage = un-pairing.

### Server side

- `EnrolledDevice` row per paired device: `familyId`, `label`, `deviceTokenHash` (sha256), `enrolledAt`, `lastSeenAt`, `revokedAt`, `revokedById`, `createdById`.
- `DeviceEnrollment` row per issued pairing code/QR: `familyId`, `codeHash`, `nonceHash`, `expiresAt`, `consumedAt`, `consumedDeviceId`. Single-use; lives 10 minutes.
- The raw device token is only visible to the server during `POST /v1/auth/devices/redeem`. After that the server only ever sees its hash.

Cascade-on-family-delete: removing a family wipes both tables for that family.

---

## Parent flow (normal path)

1. Parent → **Settings → Devices** card → **Pair a new device**.
2. Modal shows an 8-char code (`XXXX-XXXX`, no `O/0/I/1/L`) and a QR code that encodes `https://app.host/pair?nonce=<jwt>`.
3. On the kid/caregiver device, either:
   - Scan the QR with the device camera → opens `/pair?nonce=…` → redeems automatically.
   - Or open `/pair` and type the 8-char code.
4. Server validates → creates `EnrolledDevice` → returns `{ deviceToken, familyId, label }`. Device stores the token. `enrolledAt` and the parent-supplied label show on the parent's Devices card.
5. Kid hits `/login` → `GET /v1/auth/device/profiles` (device-auth) → profile picker shows that family's kids. Kid taps profile, enters PIN.

Pairing code expires after **10 minutes** and is **single-use**. After expiry the parent issues a new one.

## Caregiver flow

Same primitive. Parent issues a pairing for the caregiver's phone/tablet. Once paired, `/caregiver-pin` POSTs `{ pin, name? }` to `/v1/auth/caregiver/pin-login` (device-auth). Caregiver never types a family code.

---

## Common support cases

### "I lost my tablet"

1. Parent logs in on any browser → **Settings → Devices**.
2. Find the row by `label` (or `lastSeenAt`).
3. **Revoke**. `revokedAt` is set; the device's next request 401s.
4. The replacement device hits `/pair` and the parent issues a fresh pairing code.

Threat surface: a stolen tablet retains the local token until the next authenticated request reaches the server. As soon as it does, 401 → `/pair` redirect. The PIN lockout (Plan 03 #1) and proof retention rules still apply for actions the thief took before revoke.

### "The pairing code expired"

10-min TTL is intentional. Issue another from Settings.

### "I typed the wrong code 5 times"

`/v1/auth/devices/redeem` is rate-limited (`lookupRateLimiter`) and gated by Turnstile. The next attempt may need a CAPTCHA. Wait a minute and retry; or have the parent issue a fresh code (the rate limiter clears).

### "Kid says profile picker shows the wrong family's kids"

This should be impossible — `EnrolledDevice` is family-scoped and `/auth/device/profiles` filters by `req.device.familyId`. If reported:

1. Get the kid device's `localStorage["chorechampz.deviceToken"]` hash (support tool — never the raw token). Look up `EnrolledDevice` → confirm `familyId`.
2. If familyId is wrong: hard incident. Revoke immediately, audit `DEVICE_REDEEMED` events around the time, file ticket.

### "Kid login keeps redirecting to /pair"

The device has no valid token, has a revoked token, or has a token whose family no longer exists.

1. Clear `localStorage["chorechampz.deviceToken"]` on the device.
2. Parent re-pairs.

### "Parent doesn't see the new device in Settings"

The redemption call failed silently on the device side, or the device is showing stale parent UI. Refresh the Settings page. If still missing, ask the kid device to retry — `/v1/family/devices` reflects every committed `EnrolledDevice` row immediately.

### "We need to reset everything for a family"

Worst-case nuclear option:

1. Parent revokes every device row in Settings (one click each — no bulk endpoint by design; revokes are audit-logged individually).
2. Optional: bump every parent's `tokenVersion` via `/auth/logout-all` (Plan 03 #8) to invalidate parent JWTs too.
3. Re-issue pairings as needed.

There is no "reset family" admin endpoint and there shouldn't be — every revoke writes a `DEVICE_REVOKED` audit event so the family has a record.

---

## Audit kinds

Every state change writes an `AuditEvent`:

| Kind                    | When                                                      | Payload                               |
| ----------------------- | --------------------------------------------------------- | ------------------------------------- |
| `DEVICE_ENROLLED`       | Parent issues a pairing code                              | `{ enrollmentId, label?, expiresAt }` |
| `DEVICE_REDEEMED`       | A device successfully consumes a pairing code             | `{ deviceId, enrollmentId, label }`   |
| `DEVICE_REVOKED`        | Parent revokes a device                                   | `{ deviceId, label, lastSeenAt }`     |
| `DEVICE_RENAMED`        | Parent renames a device                                   | `{ deviceId, prevLabel, nextLabel }`  |
| `DEVICE_PAIRING_FAILED` | Redeem rejected (expired / wrong code / already-consumed) | `{ reason }`                          |

Support can answer "who paired what, when?" entirely from `AuditEvent` filtered by `familyId` + `kind IN (DEVICE_*)`.

---

## Tables to know

- `EnrolledDevice` — current device fleet for a family. `revokedAt IS NULL` = active.
- `DeviceEnrollment` — pending + consumed pairing offers. Rows hang around for audit history; the `consumedAt` + `consumedDeviceId` columns trace which `EnrolledDevice` came from which code.
- `AuditEvent` — durable history of pairing actions.

A daily cron (see `apps/api/prisma/run-ledger-recon.ts`-style jobs) can prune `DeviceEnrollment` rows older than 30 days where `consumedAt IS NULL` — not implemented yet, low priority.

---

## Privacy disclosures

The device token is disclosed in the Privacy Policy under "Cookies and Analytics" — it is essential storage for authentication on shared-device kid logins. It contains no user identity. Revoking a device deletes the server-side reference; the client-side localStorage entry is cleared on next 401.

---

## Known sharp edges

- **Multi-family device** is not supported. One device, one familyId. If a household needs two families on one tablet, they pair separately and clear localStorage between sessions. Future enhancement.
- **Hardware attestation** (Play Integrity, DeviceCheck) is not in scope. A device token is bearer; treat it like a password and rotate via revoke on suspected compromise.
- **Remote wipe** is not implemented. Revoke kills server access; local IndexedDB caches (proof photos awaiting upload) clear on the device's next opportunistic sync. Parents should not rely on remote wipe for compliance scenarios.
- **Pairing code shoulder-surf**: 10-min TTL + single-use limits blast radius. If the parent suspects observation, revoke the issued enrollment from Settings (any unconsumed `DeviceEnrollment` row can be invalidated by bumping `expiresAt`).

---

## Related

- [Plan 04 — Device Pairing](../../plans/04-device-pairing.md) — design + rollout plan.
- [Plan 03 — Beta Hardening](../../plans/03-beta-hardening.md) #1 (PIN lockout) — PIN attempts are now device-scoped to one family, lockout still per-child.
- [apps/api/src/services/device-pairing.ts](../../apps/api/src/services/device-pairing.ts) — issuance + redemption + revoke implementation.
- [apps/api/src/middleware/device.ts](../../apps/api/src/middleware/device.ts) — `requireDeviceToken`.
