# Plan 11 — Mobile UX Phase 5 (Children's App Polish)

Status: **in progress** · Follows [10-mobile-ux.md](./10-mobile-ux.md) Phases 1–4 · Scope: `apps/web` only

## Problem

Phases 1–4 fixed the native chrome (nav bar, transitions, back button, safe area). The app now looks native. Phase 5 addresses **children's-app-specific UX** — information hierarchy tuned for a 6–14 year old as the primary actor, parent approval speed on mobile, and small legibility fixes.

---

## Findings

| #   | Finding                                                                                                                         | Where                                | Sev |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | --- |
| 1   | Task list buried — kids scroll past stats + pet + streak + challenges before seeing today's tasks. Primary job = complete tasks | `child/Dashboard.tsx`                | P0  |
| 2   | Approval row is a form — parent must fill 2 inputs per completion. Need quick ✓/✕ tap targets on native, expand for override    | `parent/Approvals.tsx` CompletionRow | P0  |
| 3   | Tab labels `text-[11px]` — below WCAG AA, illegible for 6-year-olds                                                             | `AppLayout.tsx` tab bar              | P0  |
| 4   | No celebration delight after task submit when no proof required                                                                 | `child/Dashboard.tsx` CompleteModal  | P1  |
| 5   | Celebrate overlay `px-10` clips on 375px phones                                                                                 | `child/Dashboard.tsx` line ~507      | P1  |
| 6   | No redemption pending state on reward cards — child re-taps thinking submit failed                                              | `child/Rewards.tsx`                  | P1  |
| 7   | "Initiative" label unknown to kids under 10 — "Extras" tests better                                                             | child nav                            | P1  |
| 8   | Photo warning `text-xs` — too small for kids to read                                                                            | CompleteModal                        | P1  |
| 9   | Streak tile is plain `🔥 N` text — every successful kids app treats streak as visual                                            | stat grid                            | P2  |
| 10  | Stat tile scale inconsistency — Balance `text-5xl`, others `text-2xl` in same 2×2 grid                                          | stat grid                            | P2  |
| 11  | Parent dashboard quick-approve missing — parent sees pending list but must nav to Approvals to act                              | `parent/Dashboard.tsx`               | P2  |

---

## Phase 5 — Implementation

### 5a. Task-first layout on child dashboard — **S** ✅ COMPLETE

Move `todayTasks` section above the stat grid. Stats/challenges/pet go below tasks. Zero API changes — pure JSX reorder.

New order: PageHeader → (vacation banner) → (timer when active) → **Today's tasks** → stat grid → StreakSaver → SavingsGoal → Challenges → Badges

### 5b. Approval quick-actions on native — **M**

On native: `CompletionRow` shows compact row (avatar + name + task + credit chip + large ✓ ✕ buttons). Row tap expands to reveal override/kudos form. Web unchanged.

- `isNative()` gate in `CompletionRow`
- `useState(false)` for `expanded` — default collapsed on native
- ✓ = approve immediately (existing mutation), ✕ = reject with reason modal
- Haptics: `haptic("success")` on approve tap, `haptic("warning")` on reject tap

### 5c. Tab label size + rename — **S** ✅ COMPLETE

- `AppLayout.tsx` tab bar: `text-[11px]` → `text-xs` (12px, WCAG compliant)
- `lib/nav.ts` `childLinks`: label `"Initiative"` → `"Extras"` (same route `/me/initiative`)

### 5d. Redemption pending state — **S** ✅ COMPLETE

Cross-reference pending redemptions with reward cards. If a pending redemption exists for a reward, show "Waiting for approval" badge over the Redeem button. Query already done on parent Approvals; add to child Rewards via `/redemptions?status=PENDING`.

### 5e. Celebrate overlay fix — **S** ✅ COMPLETE

`px-10` → `px-6`, add `max-w-[280px] w-full mx-4` so it never clips on narrow phones.

### 5f. Photo warning legibility — **S** ✅ COMPLETE

`text-xs` → `text-sm` on the amber warning box inside CompleteModal.

---

## Phase 5 future (P2, deferred)

- **Streak visual** — 7-dot row (filled = completed that day) replacing the plain number
- **Stat tile scale** — Normalize `text-3xl` across all 4 tiles for visual consistency
- **Parent dashboard quick-approve** — Inline ✓/✕ on pending items in dashboard card
- **Empty state illustrations** — Character/graphic for "nothing scheduled" states

---

## Files in scope

- [apps/web/src/pages/child/Dashboard.tsx](../apps/web/src/pages/child/Dashboard.tsx) — 5a, 5e, 5f
- [apps/web/src/pages/child/Rewards.tsx](../apps/web/src/pages/child/Rewards.tsx) — 5d
- [apps/web/src/pages/parent/Approvals.tsx](../apps/web/src/pages/parent/Approvals.tsx) — 5b
- [apps/web/src/components/AppLayout.tsx](../apps/web/src/components/AppLayout.tsx) — 5c (tab size)
- [apps/web/src/lib/nav.ts](../apps/web/src/lib/nav.ts) — 5c (rename)

## Guardrails

- Web must not regress — approval form stays full on web; reorder is web-neutral
- Run `native-shell-reviewer` after changes
- All native-only paths gated on `isNative()`
