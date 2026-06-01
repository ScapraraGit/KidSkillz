# Plan 10 — Mobile UX / Native-Feel Overhaul

Status: **Phases 1–4 complete** · Target: Android + iOS native shell · Scope: `apps/web` presentation only, all gated on `isNative()`

## Problem

The Capacitor shell (Plan [mobile-capacitor.md](./mobile-capacitor.md)) ships the existing `apps/web` React build to the stores. The native plumbing is in place — bottom tab bar, bottom-sheet modals, safe-area insets, 44px touch targets, `inputMode` keyboard hints, a haptics helper — but the **information architecture and chrome are still desktop-web**. The app reads as "a website in a wrapper," concentrated in navigation and a handful of native-illusion-breaking details.

This plan captures the findings and a phased, file-level path to fix them. **No web regression**: every change is gated on `isNative()` (or behaves identically on web), so the browser experience is untouched. Run the `native-shell-reviewer` agent after each phase.

Effort: **S** <1d · **M** 1–3d · **L** >3d.

---

## What's already right (do not redo)

- Native bottom tab bar — [AppLayout.tsx:317](../apps/web/src/components/AppLayout.tsx#L317).
- Bottom-sheet modals with drag handle + safe area — [Modal.tsx:106](../apps/web/src/components/Modal.tsx#L106).
- Safe-area utility classes (`pt-safe`/`pb-safe`/…) — [index.css:15](../apps/web/src/index.css#L15).
- 44px min touch targets + `text-base` inputs on native — [ui.tsx:9](../apps/web/src/components/ui.tsx#L9), [ui.tsx:171](../apps/web/src/components/ui.tsx#L171).
- `inputMode` keyboard-layout helpers — [ui.tsx:179](../apps/web/src/components/ui.tsx#L179).
- Best-effort haptics helper — [native.ts:9](../apps/web/src/lib/native.ts#L9).
- Page-transition + sheet-slide keyframes, `prefers-reduced-motion` honored — [index.css:44](../apps/web/src/index.css#L44).

---

## Findings (severity = native-feel impact)

| #   | Finding                                                                                                                                                           | Where                                                                                                                   | Sev |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --- |
| 1   | Persistent `🪙 ChoreChampz` brand bar on every screen — biggest "this is a website" tell, wastes ~56px every screen                                               | [AppLayout.tsx:164](../apps/web/src/components/AppLayout.tsx#L164)                                                      | P0  |
| 2   | Emoji tab icons ignore `color`, so the active tab icon looks identical to inactive (only the 11px label changes color); no filled/outline swap, no indicator      | [AppLayout.tsx:28](../apps/web/src/components/AppLayout.tsx#L28), [:336](../apps/web/src/components/AppLayout.tsx#L336) | P0  |
| 3   | `links.slice(0, 5)` silently drops primary destinations from the bottom bar (parent: **Kids + Members never appear**); Settings/Admin only in a top-right popover | [AppLayout.tsx:141](../apps/web/src/components/AppLayout.tsx#L141)                                                      | P0  |
| 4   | Account menu is a 180px desktop popover anchored to a corner avatar via `getBoundingClientRect` — tiny target, hardest thumb corner                               | [AppLayout.tsx:215](../apps/web/src/components/AppLayout.tsx#L215)                                                      | P1  |
| 5   | Caregiver + email-verify + trial banners stack 3-high above content, can eat ~20% of a phone viewport                                                             | [AppLayout.tsx:154-162](../apps/web/src/components/AppLayout.tsx#L154-L162)                                             | P1  |
| 6   | No pull-to-refresh anywhere — the #1 gesture native users reach for; data is TanStack Query behind `staleTime`                                                    | dashboards / list pages                                                                                                 | P1  |
| 7   | No navigation depth / back gesture — drill-ins are in-page state, no back chevron, no iOS left-edge swipe-back                                                    | route structure                                                                                                         | P2  |
| 8   | Bare `<div>Loading…</div>` instead of skeletons                                                                                                                   | [Dashboard.tsx:155](../apps/web/src/pages/child/Dashboard.tsx#L155) + most pages                                        | P1  |
| 9   | 4-stat grid `sm:grid-cols-2 lg:grid-cols-4` collapses to a 4-high single-column stack on phones — hero stats fall below the fold                                  | [Dashboard.tsx:269](../apps/web/src/pages/child/Dashboard.tsx#L269)                                                     | P2  |
| 10  | Haptics wired to exactly one action (task-submit success); tab switches, primary buttons, approve/reject are silent                                               | [Dashboard.tsx:468](../apps/web/src/pages/child/Dashboard.tsx#L468)                                                     | P2  |
| 11  | `@capacitor/status-bar` + `@capacitor/keyboard` not configured — white header risks invisible status text; bottom inputs can be obscured by the keyboard          | `capacitor.config.ts`, App boot                                                                                         | P1  |

---

## Native pattern reference (the bar we're aiming for)

- **Contextual title bar, not a brand bar.** iOS large titles (~34pt, collapse to inline on scroll); Android top app bar shows the _current screen_ name. App name appears only on login/landing. The screen title is the nav bar.
- **Tab bar.** 4–5 monochrome, tinted icons. Active = filled variant + brand tint + (optional) indicator. ≤5 items; overflow goes to a "More"/"You" tab, never truncated silently. Light haptic on tab tap.
- **Profile/settings** live on their own tab or a full-height sheet, not a corner dropdown.
- **Pull-to-refresh** on every scrollable data screen.
- **Skeletons**, not spinners-with-text, for first paint.
- **Back navigation** with a left chevron and platform swipe-back for any drill-in.

---

## Phase 1 — Navigation + chrome (the big shift) — **M** ✅ COMPLETE

Goal: stop looking like a website. All changes native-gated; web keeps today's header + scroll-strip + popover.

**Delivered (2026-06-01):**

### 1a. Icon system (replaces emoji) — **S** ✅

- Chose hand-rolled inline SVGs (zero dep) over `lucide-react` — answers open question #1.
- New [apps/web/src/components/NavIcon.tsx](../apps/web/src/components/NavIcon.tsx): 10 icons (Home, Check, List, Gift, Trophy, Users, Star, Chart, Grid, Settings, Dot fallback). All `currentColor` — `text-brand-700` / `text-slate-500` tint correctly. Active state: filled bg at 12% opacity + heavier stroke. Removes `TAB_ICONS` emoji map.

### 1b. Contextual native title bar — **M** ✅

- New [apps/web/src/components/NativeHeader.tsx](../apps/web/src/components/NativeHeader.tsx): `sticky top-0 z-30`, `pt-safe`, h-12 inner. Shows current screen title (from `resolveScreenTitle`), `NotificationBell`, `SoundToggle` (child only), avatar button → `/more`.
- [apps/web/src/components/ui.tsx](../apps/web/src/components/ui.tsx): `PageHeader` suppresses `<h1>` on native when title is a plain string; ReactNode titles (child avatar hero) always render.
- Title source: `resolveScreenTitle(pathname, links)` in [apps/web/src/lib/nav.ts](../apps/web/src/lib/nav.ts) — exact match → extras map → longest-prefix match → "ChoreChampz".

### 1c. Tab curation + "More" tab — **M** ✅

- New [apps/web/src/lib/nav.ts](../apps/web/src/lib/nav.ts): single source of truth for link definitions, `PARENT_PRIMARY_ROUTES`, `CHILD_PRIMARY_ROUTES`, `MORE_TAB`, `resolveScreenTitle`, `AppLayoutOutletContext` interface.
- `tabDefs` built from explicit route whitelist + `MORE_TAB` — never array-truncated.
  - Parent: Dashboard, Approvals, Tasks, Kids + More.
  - Child: My Day, Rewards, Initiative, Activity + More (answers open question #2 — both roles get More).
- New [apps/web/src/pages/More.tsx](../apps/web/src/pages/More.tsx): native-only route, grouped list rows (Browse overflow + Account section + Sign out). Full-width 52px touch targets.
- Route registered in [apps/web/src/App.tsx](../apps/web/src/App.tsx) for both parent and child route trees.

### 1d. Retire the corner popover on native — **S** ✅

- `Popover` block stays for web. On native, NativeHeader avatar taps navigate to `/more`.
- `FamilySwitcher`, Edit avatar, Settings, Beta, Sign out rendered as `RowLink`/`RowButton` rows in More.tsx.
- Sign-out mirrors AppLayout exactly: refresh-token revoke → `logout()` → `/login`. Push teardown via `useAuth.subscribe` chokepoint in App.tsx — not duplicated.

**Also delivered alongside Phase 1:**

- [apps/web/src/components/Modal.tsx](../apps/web/src/components/Modal.tsx): bottom-sheet on native (slide-up, drag handle, `pb-safe`, `rounded-t-2xl`); centered dialog on web.
- [apps/web/src/index.css](../apps/web/src/index.css): safe-area utility classes (`pt-safe`, `pb-safe`, etc.) + `animate-sheet-up` keyframe.
- [apps/web/android/app/src/main/AndroidManifest.xml](../apps/web/android/app/src/main/AndroidManifest.xml): `android:enableOnBackInvokedCallback="true"` for Android 13+ predictive back.

**Phase 1 exit criteria met:** no brand bar on native; each screen shows its own title; bottom bar has tinted SVG icons with unmistakable active state; Kids/Members/Settings all reachable; account actions on a real screen. Web pixel-identical to pre-Phase-1.

---

## Phase 2 — Polish pass (high perceived-quality, small diffs) — **M** ✅ COMPLETE

**Delivered (2026-06-01):**

### 2a. Consolidate banners — **S** ✅

On native: at most 1 banner shows (caregiver > email-verify > trial priority). Caregiver strip uses `text-xs py-1` (more compact). Web shows all three as before. [AppLayout.tsx](../apps/web/src/components/AppLayout.tsx).

### 2b. Pull-to-refresh — **M** ✅

- New [hooks/usePullToRefresh.ts](../apps/web/src/hooks/usePullToRefresh.ts): attaches `touchstart`/`touchmove`/`touchend` to `window` only when `isNative()`. Rubber-band resistance (`sqrt(dy)*5`), `PULL_THRESHOLD=64px`, `MAX_PULL=80px`. Fires `onRefresh` on release past threshold; `refreshing` state during inflight. No-op on web.
- New [components/PullToRefresh.tsx](../apps/web/src/components/PullToRefresh.tsx): wrapper component — passthrough `<>` on web, relative-positioned wrapper + spinner indicator on native. Spinner slides in as user pulls, spins while refreshing.
- Wired to all 5 primary data screens: child Dashboard, child Rewards, child Activity, parent Approvals, parent Dashboard. Each `onRefresh` invalidates all relevant queries via `useQueryClient`.

### 2c. Skeletons — **S** ✅

- `Skeleton` + `SkeletonCard` added to [components/ui.tsx](../apps/web/src/components/ui.tsx). `Skeleton` = `animate-pulse bg-slate-200 rounded-lg`, `aria-hidden`. `SkeletonCard` = card-shaped wrapper with N lines of varying widths.
- Replaced bare `Loading…` / `Loading…` guards on: child Dashboard, child Rewards, child Activity, parent Approvals, parent Dashboard. Each skeleton matches the content's card shape.

### 2d. Haptics everywhere it counts — **S** ✅

- `Button` in [ui.tsx](../apps/web/src/components/ui.tsx) fires `haptic("light")` on every click (native-gated, extracted `onClick` handler).
- Tab tap: already done in Phase 1.
- Approve/reject in Approvals: already had `haptic("success")`/`haptic("warning")` pre-Phase 2 — confirmed.
- Redemption in child Rewards: already had `haptic("success")` — confirmed.

### 2e. Stat tiles glanceable — **S** ✅

`sm:grid-cols-2` → `grid-cols-2` in child Dashboard stat section. 4 tiles now sit 2×2 on all phone widths (not just `sm+`), keeping Balance/Week/Streak/Initiative above the fold. [Dashboard.tsx](../apps/web/src/pages/child/Dashboard.tsx).

**Also delivered:**

- [android/app/src/main/AndroidManifest.xml](../apps/web/android/app/src/main/AndroidManifest.xml): `android:enableOnBackInvokedCallback="true"` for Android 13+ predictive back.
- Tests: [hooks/**tests**/usePullToRefresh.test.ts](../apps/web/src/hooks/__tests__/usePullToRefresh.test.ts) (8 cases), [components/**tests**/Skeleton.test.tsx](../apps/web/src/components/__tests__/Skeleton.test.tsx) (6 cases), [components/**tests**/PullToRefresh.test.tsx](../apps/web/src/components/__tests__/PullToRefresh.test.tsx) (3 cases).

**Phase 2 exit criteria met:** pull-to-refresh on all primary data screens; skeleton loading on all primary screens; primary `Button` buzzes on native; stat tiles 2×2 above fold; at most 1 banner on native.

---

## Phase 3 — Native plugins (Phase 4 of the mobile plan) — **S** ✅ COMPLETE

**Delivered (2026-06-01):**

- **`@capacitor/status-bar`** installed (`^8.x`). New `initNativeUI()` in [lib/boot.ts](../apps/web/src/lib/boot.ts): dynamic import, `Style.Dark` (dark icons on white bg), `setBackgroundColor("#ffffff")` on Android only (iOS status bar is always overlay — `pt-safe` already handles the gap). Swallows errors so a missing native dep never crashes the app. Called from [App.tsx](../apps/web/src/App.tsx) in a fire-and-forget `useEffect` on mount (does not block first render).
- **`@capacitor/keyboard`** (already installed as `^8.0.3`). Configured in [capacitor.config.ts](../apps/web/capacitor.config.ts): `resize: "body"` + `resizeOnFullScreen: true`. Body resize pushes the whole document up when the software keyboard appears — keeps the bottom-sheet `Modal` inputs and the bottom tab bar visible above the keyboard without per-component workarounds.
- **SplashScreen** configured in `capacitor.config.ts`: `launchAutoHide: true`, `launchShowDuration: 500ms` — splash dismisses quickly and automatically.
- **`cap sync` required** after these changes before testing on device: `pnpm --filter @chorechampz/web cap:dev:android`.

**Phase 3 exit criteria met:** status bar legible (dark icons on white) on every screen; keyboard pushes content up so bottom-anchored inputs/tabs never hide under it; splash auto-dismisses.

---

## Phase 4 — Navigation depth + back gesture — **L** ✅ COMPLETE

**Delivered (2026-06-01):**

### Back button in NativeHeader ✅

[NativeHeader.tsx](../apps/web/src/components/NativeHeader.tsx): `window.history.state?.idx > 0` detects in-app history depth (React Router 6 increments `idx` on every push). When true, a back chevron renders left of the title and calls `navigate(-1)` with `haptic("light")`. No-op on cold launch or when at the root. Works automatically for any drill-in route added in the future.

### Directional route transitions ✅

[index.css](../apps/web/src/index.css): two new keyframes — `slideInRight` (28px + opacity, 220ms) for push navigation, `fadeIn` (opacity only, 160ms) for same-level tab switches. [AppLayout.tsx](../apps/web/src/components/AppLayout.tsx): `<main>` key remounts on path change; native tab destinations (`primaryRoutes` + `/more`) get `animate-fade-in`, all other paths get `animate-slide-in-right`. Web keeps `animate-page-in` (upward nudge, unchanged).

### Kid detail drill-in route ✅

New [pages/parent/ChildDetail.tsx](../apps/web/src/pages/parent/ChildDetail.tsx): `/parent/children/:childId` — kid header card (avatar, balance, pause status), XP level card, and full credit ledger (last 100 entries, pull-to-refresh). Registered in [App.tsx](../apps/web/src/App.tsx). "View detail" button added to each kid card in [Children.tsx](../apps/web/src/pages/parent/Children.tsx) (navigates with haptic on native). Screen title resolves to "Kids" via `resolveScreenTitle` prefix fallback.

**Scope note:** Task editor, Reward editor, and Member forms remain in-page modal state — those are 450 + 120 + 175 lines of form logic that would require full route extraction. The back button + transitions make any future conversion straightforward.

**Phase 4 exit criteria met:** back chevron appears on all drill-in screens; tab switches cross-fade; push navigations slide from the right; kid detail is a real navigated route with full credit history.

---

## Sequencing

Phase 1 (chrome) → Phase 2 (polish) → Phase 3 (plugins; can overlap Phase 2) → Phase 4 (depth, optional).

Phase 1 is the highest leverage per unit of work — findings #1–4 are what actually make it feel web.

## Files in scope (Phases 1–3)

- [apps/web/src/components/AppLayout.tsx](../apps/web/src/components/AppLayout.tsx) — header swap, tab curation, More routing, banner consolidation, tab haptics.
- **New** `apps/web/src/components/NativeHeader.tsx`, `NavIcon.tsx`, `Skeleton.tsx`; `apps/web/src/pages/More.tsx`; `apps/web/src/hooks/usePullToRefresh.ts`.
- [apps/web/src/components/ui.tsx](../apps/web/src/components/ui.tsx) — `PageHeader` native title suppression, `Button` haptic, `Skeleton` export.
- [apps/web/src/pages/child/Dashboard.tsx](../apps/web/src/pages/child/Dashboard.tsx) + parent pages — skeletons, stat grid, pull-to-refresh wiring.
- [apps/web/src/App.tsx](../apps/web/src/App.tsx) — `More` route (native), status-bar/keyboard init.
- `capacitor.config.ts` / [apps/web/src/lib/boot.ts](../apps/web/src/lib/boot.ts) — plugin config.
- `package.json` — `lucide-react` (if chosen), `@capacitor/status-bar`, `@capacitor/keyboard` (keyboard may already be present via the secure-storage peer).

## Guardrails

- **Web must not regress.** Every change native-gated via `isNative()` ([native.ts:3](../apps/web/src/lib/native.ts#L3)) or visually identical on web. The `sm:hidden` scroll strip + brand header + corner popover all stay for web.
- **`native-shell-reviewer` after each phase** — watches secure-storage discipline, native guards, modal-dismiss persistence, no committed build artifacts, push-lifecycle integrity.
- **Tooltips/labels** — new controls follow the `chorechampz-web-feature` skill (every primary action / non-obvious icon gets a `<Tooltip>`; nav links carry a `tip`).
- **Re-sync after web changes** — device holds the last-synced bundle; `cap sync` required.
- New deps (`lucide-react`) and any new env reads → update `.env.example` per the env-var rule (n/a unless a flag is added).

## Open questions

1. ~~Icon set: `lucide-react` dependency vs. hand-rolled inline SVGs?~~ **Resolved: hand-rolled SVGs** (zero dep, 10 icons in NavIcon.tsx).
2. ~~Child role — keep 4 tabs and add account to More, or give kids a More tab too?~~ **Resolved: both roles get More tab.**
3. ~~Title-bar source of truth — derive from nav `label`, or have `PageHeader` publish via context?~~ **Resolved: `resolveScreenTitle(pathname, links)` in nav.ts — pathname-driven, no context needed for static titles. Dynamic titles (child avatar hero) stay as ReactNode in PageHeader and are not suppressed.**
4. Phase 4 scope — is the in-page drill-in actually bothering users, or is the chrome (Phase 1) the whole complaint? Defer Phase 4 until Phase 1–2 land and we reassess.

## Related

- [mobile-capacitor.md](./mobile-capacitor.md) — parent plan; this is the UX layer on top of its Phases 1–4. Status-bar/keyboard here = its Phase 4 native integration.
- `chorechampz-web-feature` skill — tooltip/label + mobile-responsive chrome rules.
- `native-shell-reviewer` agent — the review gate for all of this.
