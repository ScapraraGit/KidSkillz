# Child Consent UX — Revisit

Parent-only flow for creating a kid currently surfaces a separate "guardian consent" checkbox in the child-create modal. Logged-in parent already accepted Terms + Privacy at registration; the extra checkbox reads as bureaucratic.

Legal trail must stay (COPPA / GDPR-K require per-child evidence with `subjectChildId`), but the UX can be re-thought from scratch.

## What stays (non-negotiable)

- Server-side audit event `CHILD_PROFILE_CONSENT` with `subjectChildId`, version, IP, UA, timestamp — per existing `LegalAcceptance` table.
- Acknowledgement event recorded **at the moment of data collection**, not only at parent signup.

## Open questions / scope to figure out

- Should the parent acknowledgement be inline (submit-button-implies-consent + disclaimer text) or a one-tap checkbox?
- Per-jurisdiction wording differences (COPPA vs UK AADC vs EU GDPR-K) — same UI for all or geo-conditional?
- For teen profiles (≥13 in US), is the same flow appropriate or lighter?
- Should the kid themselves see / re-acknowledge anything on first login (assent vs consent)?
- Re-consent triggers: when does an existing kid profile need a fresh acknowledgement? (Terms version bump, kid data scope expansion, etc.)
- Bulk creation of multiple kids — one consent event each, or one bundle?
- Account recovery / kid transfer between families: does the new parent need a fresh consent event for that kid?

## Quick-fix path (if needed before larger revisit)

Drop the checkbox, replace with inline disclaimer above Save:

> "By creating this profile, you confirm you are **<name>**'s parent or legal guardian and authorize ChoreChampz to collect their first name, PIN, and chore activity. See [Privacy Policy](/privacy)."

Submit button stays as the consent action. Server already records the audit event.

## Files in scope when picked up

- [apps/web/src/pages/parent/Children.tsx](apps/web/src/pages/parent/Children.tsx) — child-create modal.
- [apps/api/src/routes/children.ts](apps/api/src/routes/children.ts) — `consentAcknowledged` zod field; route still records `CHILD_PROFILE_CONSENT` via `recordLegalAcceptance`.
- [packages/shared/src/legal.ts](packages/shared/src/legal.ts) — versions, kinds.

## Out of scope

- Removing the audit trail.
- Verifiable parental consent (credit-card-cents check, gov-ID upload) — only needed if collecting data classes COPPA flags as high-risk (geolocation, persistent identifiers across sites, contact info). ChoreChampz collects first-name + PIN + activity, low-sensitivity tier; in-app acknowledgement remains acceptable.
