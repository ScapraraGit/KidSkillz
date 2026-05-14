# Plan 2 — Email Wiring (Resend)

## Goal
Replace console.log stubs in `apps/api/src/lib/email.ts` with real provider. Cloudflare alternative noted.

## Recommendation: Resend
- Simple REST + official SDK (`resend` npm).
- React Email templates (TS-native, matches stack).
- Cheap, generous free tier for beta.
- Cloudflare Email Routing = inbound only / mail-forwarding; not transactional send. Cloudflare Workers + MailChannels works but flaky reliability + sender-reputation tooling weaker. Resend wins.

## Env (apps/api/src/env.ts)

```
RESEND_API_KEY
EMAIL_FROM                    # "ChoreChampz <no-reply@chorechampz.com>"
EMAIL_REPLY_TO                # "support@chorechampz.com"
EMAIL_ENABLED=false           # kill-switch; off → fallback to console.log
APP_URL                       # already exists; used in links
```

## DNS prereq (out-of-code)

- Add domain in Resend dashboard.
- SPF: TXT `v=spf1 include:_spf.resend.com ~all`.
- DKIM: 3 CNAMEs from Resend.
- DMARC: TXT `v=DMARC1; p=none; rua=mailto:dmarc@chorechampz.com`.
- Verify before flipping `EMAIL_ENABLED=true`.

## Templates (apps/api/src/email/templates/ — new)

Use `@react-email/components` + `@react-email/render` → HTML string at send time. One file per template:
- `InvitationEmail.tsx` — CO_PARENT / CAREGIVER invite + accept link.
- `VerificationEmail.tsx` — verify link.
- `PasswordResetEmail.tsx` — reset link.
- `NotificationEmail.tsx` — generic title/body wrapper.
- Shared `Layout.tsx` — header, brand, footer, unsubscribe link.

Plain-text fallback per template (Resend auto-derives, but explicit is safer).

## Provider abstraction (apps/api/src/lib/email-provider.ts — new)

```ts
interface EmailProvider {
  send(msg: { to, subject, html, text, replyTo?, tags? }): Promise<{ id: string }>;
}
class ResendProvider implements EmailProvider { /* ... */ }
class ConsoleProvider implements EmailProvider { /* dev fallback */ }
export const emailProvider = EMAIL_ENABLED ? new ResendProvider(...) : new ConsoleProvider();
```

Lets us swap Postmark/SES later without touching call sites.

## Rewrite apps/api/src/lib/email.ts

Keep existing exported signatures (`sendInvitationEmail`, `sendVerificationEmail`, `sendPasswordResetEmail`, `sendNotificationEmail`). Inside each:
1. Render React Email template.
2. Call `emailProvider.send(...)`.
3. On error: log + swallow for `notification` (fire-and-forget); rethrow for verification/reset/invitation since user is actively waiting.

Tag every send with `{type, familyId}` for Resend dashboard filtering.

## Deliverability + audit

New model `EmailLog`:

```
id, familyId?, to, type, providerId, status, error?, createdAt
```

Write a row per attempt. Useful for "did invite send" support questions. Add audit event via existing `AuditEvent` for sensitive sends (invitation, reset).

## Bounces + webhooks (optional, phase 2)

- Resend webhooks → new `POST /email/webhook` (signature-verified).
- Update `EmailLog.status` on `email.delivered|bounced|complained`.
- On hard bounce of `User.email`: flag user, prompt re-entry on next login.

## Rate limiting

Per-user resend cooldown already implied in auth-tokens.ts (verification + reset). Verify:
- Verification resend ≥ 60s gap.
- Password reset request ≥ 60s gap.
- Invitation: cap N/day per family.

Add in services if missing — don't trust client.

## Notification fan-out (apps/api/src/services/notifications.ts:38)

`deliverEmailMirror` already exists fire-and-forget. Confirm:
- Respects `family.settings.emailNotifications`.
- Respects per-user `emailOptOut` (add field if missing).
- Skips children without verified email.
- Quiet hours per family settings.

## Tests

- `lib/__tests__/email.test.ts` — render each template, snapshot HTML, assert link contains token.
- Mock `ResendProvider` — assert `send()` called with right args.
- `EMAIL_ENABLED=false` path → ConsoleProvider used, no network.

## Rollout

1. Add deps: `resend`, `@react-email/components`, `@react-email/render`.
2. Build templates + provider with `EMAIL_ENABLED=false`. Verify console output unchanged.
3. DNS + domain verify in Resend.
4. Staging: `EMAIL_ENABLED=true`, send to seeded inboxes, check spam score (mail-tester.com).
5. Prod flip after SPF/DKIM/DMARC green.

## Risks

- Sender reputation — start with low volume, warm domain.
- Token leakage in email logs — store only `providerId`, never raw token.
- Child accounts — many won't have email; gate notification mirror on `emailVerifiedAt`.
- GDPR/CAN-SPAM — unsubscribe link in footer mandatory for non-transactional notification emails.
