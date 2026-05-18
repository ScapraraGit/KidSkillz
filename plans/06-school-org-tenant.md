# School / Organization Tenant — Forward Plan

Status: **deferred**. Captured for future review. Not on the near-term roadmap.

ChoreChampz today is a family product: one `Family` row = one tenant, two-to-four `PARENT`/`CAREGIVER` users approving completions for a handful of `CHILD` users. A grade school using the same mechanic for classroom behavior credit is a real adjacent market, but the shape differs enough — identity, hierarchy, compliance, billing — that we want a written plan before any code lands.

This document is the design sketch we'd pull off the shelf when schools become a real bet. It is intentionally not an MVP. It is the "what to think about, in what order, with what tradeoffs."

---

## 1. Core stance

Do **not** rename `Family` → `Tenant` everywhere. Cost is high (every service signature, every Prisma scope, every UI label) and the family product is still finding fit.

Recommended approach: **discriminator + capability roles**.

- Add `Tenant.kind` enum (`FAMILY` default, `SCHOOL` later). `Family` table effectively becomes the tenant table — column name `familyId` stays as the opaque tenantId everywhere.
- Decouple authorization from role _names_ (`PARENT`, `CHILD`) toward _capabilities_ (`approve_completion`, `manage_rewards`, `view_audit`).
- Branch behavior on `tenant.kind` only where semantics actually differ (consent recording, reward catalog defaults, signup path).

Tradeoff: code grows `if (kind === SCHOOL)` branches over time. Acceptable until divergence is large enough to justify a real refactor — at which point we'll have the revenue to fund it.

Alternative: **hard fork / full Tenant rename**. Cleaner long-term, but months of churn in a product still iterating on the family side. Only worth it if schools become a serious near-term revenue bet.

---

## 2. Architectural levers

### Tenant shape

- One `Family`/Tenant row = one billing + legal boundary. School = one tenant. District = optional parent tenant via `parentTenantId` for multi-school deployments.
- Add fields: `Tenant.kind`, `Tenant.provisioningSource` (`SELF_SERVE | CLEVER | CLASSLINK | MANUAL`), `Tenant.dataRegion` (forward-compat for residency).
- Keep `familyId` column name as opaque tenantId. Semantic clarity matters less than the cost of renaming a hot column.

### Hierarchy within a school

- New `Group` entity (classroom / section). Nullable for `FAMILY` tenants (whole family is one implicit group).
- Staff belong to one or more groups. Students belong to one or more groups.
- Service signatures stay `(tenantId, ...)`; add `groupId?` where group-scoping matters. Tenant scope is still the outer fence.

### Roles → capabilities

- Today: hardcoded `PARENT / CAREGIVER / CHILD`. Schools need at minimum `TEACHER / AIDE / COUNSELOR / SCHOOL_ADMIN / DISTRICT_ADMIN / STUDENT`.
- Replace `requireRole("PARENT")` middleware with `requireCapability("approve_completion")` (etc.). Map role → caps per tenant kind in one config module.
- Migration day 1: existing roles auto-map to a default cap set so nothing breaks.

### Identity / auth

- Family: stays email + PIN (existing flow).
- School: **SSO required**. SAML / OIDC via Clever, Google Workspace, MS Entra. JIT provisioning from IdP claims. Roster sync (Clever / ClassLink / OneRoster) for student import.
- Self-signup disabled for `SCHOOL` tenants. Provisioning is sales-led or rostering-pipeline-led.
- Students: rostered, no self-signup. Login via Google/Clever or class code + PIN.

### Approval workflow

- Today: parent approves completion.
- School: tenant-level `approvalMode: PARENT | STAFF | AUTO | TWO_STEP`. Generalizes the per-task / per-child override pattern already in place.

### Ledger

- **Append-only ledger stays.** Exactly what schools' audit teams want.
- Reward catalog branches by tenant kind: hide `MONEY` / `TREAT` defaults; surface `CLASSROOM_STORE`, `RECESS`, `BOOK_PICK`. Tenant policy: `allowedRewardTypes`.

### Settings

- `FamilySettings` becomes tiered: tenant → group → child override.
- TZ, dueByTime defaults, photo-proof gate, currency-on/off — many of these need to vary per classroom.

### Feature flags

- Today `ORG_CONSENT_REQUIRED` is an env flag. Generalize: `featuresFor(tenant)` returns the resolved set. Env stays as ops escape hatch + default; tenant row overrides per-tenant.
- `orgConsentRequired` becomes derived from `tenant.kind === SCHOOL` once the discriminator exists.

---

## 3. Governance / compliance

### Legal frameworks to plan for

- **COPPA** (US, under 13). Today we record guardian consent. In schools, _school-consent doctrine_ lets the district consent on parents' behalf, but **only for educational purpose** and **only with a signed data agreement**. Record consent _provenance_ (guardian vs district) on `LegalAcceptance`. Extend the `kind` enum.
- **FERPA** (US student records). Implies:
  - Staff only see students in their group(s) (group-scoped queries).
  - No cross-tenant analytics on PII.
  - Right of access / correction / deletion via guardian on request.
- **State student-data-privacy laws**: NY Ed Law §2-d, CA SOPIPA, IL SOPPA, CO, more. Each has a DPA template and a breach SLA (often 72 hours). One DPA per district. Legal cost, not code cost — but the _features_ (export, delete, audit) must exist.
- **GDPR / UK GDPR** if EU schools — residency, DPA, right to erasure, DPIA.
- **SOC 2 Type 2** is effectively table stakes for district sales.

### Data architecture for compliance

- **Row-level tenancy now, schema-per-tenant later.** Some districts will require logical or physical separation. Decision point at first six-figure contract.
- **Region pinning**. EU / CA data residency. Model `Tenant.dataRegion` early so future sharding doesn't require backfill.
- **Hard delete vs soft delete**. Ledger is append-only, but FERPA / GDPR demand deletion-on-request. Define a **redaction model** now — replace PII fields with tombstones, keep ledger integrity. Don't paint into a corner.
- **Audit completeness**. Every staff action on a student record must write `actor, target, before/after, IP, UA`. Audit table exists — formalize coverage as a contract (CI check: every mutating service writes an audit row).
- **PII minimization**. Photo proof per-tenant gated (already feature-gated — good). Many districts will require it off.
- **Sub-processor disclosure**. List every third party touching student data (Sentry, S3, email, AI). Public page. Update on change.

### Operational governance

- **Per-tenant retention policy**. End-of-school-year purge or archive. Cron job + tenant config.
- **Right to export**. Parent / district can request a student data export. Build the export job early — single-tenant scoped dump.
- **Breach process**. 72-hour notification SLA in many state laws. Runbook before first district signs.
- **Admin impersonation**. Support need to view a tenant. Must be logged loudly, time-boxed, consent-flagged.
- **Billing**. Per-seat / per-student annual contract, PO/invoice, not Stripe self-serve.

---

## 4. Phasing (when we decide to actually do this)

| Phase | Cost        | What                                                                                                                                                                                              |
| ----- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | ~1 day      | Add `Tenant.kind` enum, `provisioningSource`, `dataRegion`. Derive `orgConsentRequired` from kind. Move user-facing strings ("Family", "Kid") behind a labels module so they swap by tenant kind. |
| 1     | ~1 week     | Capability-based authorization. Map current roles → caps. No behavior change for families.                                                                                                        |
| 2     | ~2 weeks    | `Group` entity (classroom). Nullable for `FAMILY`. Staff↔group membership. Group-scoped queries.                                                                                                  |
| 3     | ~3-4 weeks  | SSO + Clever / Google rostering connector. Org signup flow. School-side onboarding.                                                                                                               |
| 4     | ongoing     | Per-tenant feature / reward / approval policy. Audit-coverage CI check. Hard-delete / redaction model. Export job. Retention cron.                                                                |
| 5     | when needed | Schema-per-tenant + region pinning for enterprise contracts.                                                                                                                                      |

Each phase ships independently. None is a prerequisite for the family product.

---

## 5. What's already in place that helps

Worth noting — the current codebase has not painted us into a corner here.

- `familyId` scoping is consistent across services. Easy to reinterpret as tenantId.
- Ledger is already append-only.
- `LegalAcceptance` already records `subjectChildId`, version, IP, UA.
- `ORG_CONSENT_REQUIRED` flag and the recently-added `features.orgConsentRequired` plumbing are the first wedge of tenant-kind-derived behavior.
- Audit events (`AuditEvent`) exist for major mutations.
- Feature flags pattern (`features.photoProof`, `features.devicePairing`) generalizes cleanly to per-tenant.

The expensive parts (SSO, rostering, group hierarchy, redaction) are net-new. Nothing in the current model has to be undone to get there.

---

## 6. Open questions to answer before phasing starts

These are blockers for committing to a phase plan — not code blockers, decision blockers.

- Are schools a 2026 bet or "someday"? Sets aggression of phase ordering.
- Single-tenant DB acceptable for district pilots, or do we need physical isolation from day 1?
- District-direct sales motion, or teacher-led freemium that grows into district? Drives auth model (SSO mandatory vs optional) and billing.
- Photo / upload posture for schools — off by default? Likely yes.
- Retention policy: do we own it (one default for all districts) or take it per DPA (more flexible, more ops cost)?
- Multi-language / multi-region in scope or US-only first?
- What's the smallest pilot that proves the model — single classroom, single school, single district?

Answer those, the phasing falls out.

---

## 7. Related plans / context

- [05-child-consent-ux.md](./05-child-consent-ux.md) — the consent recording is already split from the signup-time Terms acceptance. School-consent doctrine extension lives there.
- `CLAUDE.md` — tenant-isolation rule, ledger rule, data-safety rule. All three carry forward unchanged to a multi-kind tenant world.
- `features.ts` / `useFeatures` — the pattern this plan generalizes.
