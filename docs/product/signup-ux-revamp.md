# Signup UX Revamp Plan

**Status:** Proposed
**Owner:** TBD
**Created:** 2026-05-19

## Problem

Current parent signup ([apps/web/src/pages/Login.tsx:133](../../apps/web/src/pages/Login.tsx#L133)) bundles account creation + family creation + 4 separate consent checkboxes on one screen. Friction hurts conversion. Disclaimer copy reads defensive, not aspirational.

## Goals

- Lower time-to-first-value (target: < 60 sec from landing → first chore created).
- Preserve legal coverage ([LegalAcceptance](../../apps/api/prisma/schema.prisma#L664) audit log stays intact).
- Reframe disclaimers as product positioning.
- Reduce form-field count on the critical-path screen.

## Non-goals

- No change to underlying terms/privacy versioning ([packages/shared/src/types.ts:175](../../packages/shared/src/types.ts#L175)).
- No change to ledger, family scoping, or child onboarding flow.

---

## Phased rollout

### Phase 1 — Quick wins (1-2 days)

Low risk. Ship without backend changes.

- **Reframe disclaimer copy** in [Login.tsx:301-373](../../apps/web/src/pages/Login.tsx#L301-L373):
  - "Not childcare/therapy/..." → "You stay in control. Parents approve every task and reward."
  - "No cash value..." → "Credits are your family's currency — you decide what they're worth."
- **Consolidate 4 checkboxes → 1**: "I agree to the Terms, Privacy, Acceptable Use, and Child Safety policies." Links open inline drawer/modal with full text.
- **Move household disclaimers** (#3, #4) out of checkboxes into a post-signup "How ChoreChampz works" modal (one-time, dismiss with "Got it"). Record acceptance via existing [recordLegalAcceptance()](../../apps/api/src/services/legal-acceptance.ts#L17) using new event types `HOUSEHOLD_TOOL_ACK` and `NO_CASH_VALUE_ACK`.
- **CTA copy**: "Create family" → "Start free →".
- **Trust strip above form**: "Free. No credit card. Cancel anytime." + (when available) family-count counter.

**Files touched:** Login.tsx, legal-acceptance.ts (add enum values), schema.prisma (extend `LegalEventType` enum + migration).

### Phase 2 — Split account from family (3-5 days)

Restructure flow: account-first, family-on-demand.

- **New route** `/welcome` — post-signup landing. Empty-state dashboard with sample chores, "Create your family" primary CTA, "See how it works" secondary.
- **Defer family creation** out of `POST /parent/register` ([auth.ts:54](../../apps/api/src/routes/auth.ts#L54)). New endpoint `POST /families` for explicit family creation (parent already authenticated).
- **Schema**: allow `User.familyId` nullable for parents in "pre-family" state, OR create a placeholder family row at registration and rename on family creation. Recommend nullable — cleaner audit.
  - Migration: nullable `familyId` on User, paired backfill (existing users already have family).
- **Move seed defaults** ([seed-defaults.ts:50](../../apps/api/src/services/seed-defaults.ts#L50)) to run on `POST /families` instead of registration.
- **Update [requireAuth](../../apps/api/src/middleware) + downstream services** to handle `familyId: null` gracefully (return 409 "family required" on family-scoped endpoints).

**Risk:** Tenant-isolation invariant from [CLAUDE.md](../../CLAUDE.md) ("Every service takes `familyId` as its first arg") needs careful handling for null-family users. Mitigation: only auth/profile endpoints accept null-family; everything else 409.

### Phase 3 — OAuth (2-3 days)

- Google + Apple sign-in via Passport or Auth.js.
- New routes: `GET /auth/google`, `GET /auth/google/callback` (and Apple equivalents).
- New `User.provider` + `User.providerSubject` columns. Migration.
- UI: add buttons above email/password form. Single-tap signup.
- Consent capture: OAuth users still must accept TOS — show single-checkbox consent screen post-callback before redirecting to `/welcome`.

**Decision needed:** Apple required for App Store later; Google sufficient for web demo. Recommend Google first.

### Phase 4 — Progressive onboarding (2-4 days)

Build on existing [OnboardingTour.tsx](../../apps/web/src/components/OnboardingTour.tsx).

- **Empty-state dashboard** (Phase 2 prerequisite) replaces tour-on-first-load.
- **Add child** moved out of family-creation form into a dashboard tile: "Add your first child →".
- **First-chore CTA** prominent: pre-filled sample ("Make bed — 5 credits"), one click to accept.
- **Track funnel events** (page view, account created, family created, first child added, first chore created, first completion approved). Sentry breadcrumbs or new lightweight analytics table.

### Phase 5 — Conversion polish (ongoing)

- A/B test single-checkbox vs. 4-checkbox legal consent (measure: signup completion rate, support tickets about TOS).
- Social proof: live family count, testimonial carousel.
- Exit-intent modal on landing: "Not sure yet? Watch the 30-sec demo."
- Landing page hero rework — show the product, not the form.

---

## Legal/compliance guardrails

- Single consent checkbox is defensible if: (1) text references all four policies by name, (2) links work and load full text, (3) `LegalAcceptance` row written server-side with version + IP + UA per the existing [recordLegalAcceptance()](../../apps/api/src/services/legal-acceptance.ts#L17) contract.
- Household-tool / no-cash-value acknowledgements move to first-run modal — still logged as `LegalAcceptance` events. Gate dashboard until acknowledged (similar pattern to [TermsGate.tsx](../../apps/web/src/components/TermsGate.tsx)).
- COPPA: no change. Children still added by authenticated parent.
- Consider counsel review of consolidated consent copy before Phase 1 ships.

## Metrics

Track before/after:

- Landing → account-created conversion %.
- Account-created → family-created %.
- Family-created → first-completion-approved %.
- Median time landing → first-chore-created.
- Support tickets mentioning "signup" or "terms".

## Open questions

1. Counsel sign-off on single-checkbox consent?
2. Apple OAuth required for web-only demo, or defer to mobile?
3. Keep "create family" inline option for power users, or force two-step?
4. Analytics: roll own table or wire PostHog/Plausible?

## Implementation order recommendation

Phase 1 → Phase 2 → Phase 4 → Phase 3 → Phase 5.

Rationale: copy + checkbox consolidation ship same week, lowest risk, highest leverage. Account/family split unblocks empty-state dashboard. OAuth adds another conversion lift but bigger lift than Phase 1; defer until measurement baseline established.
