---
name: chorechampz-web-feature
description: Scaffolding rules for new ChoreChampz web features (pages, buttons, modals, form fields). Mandates tooltips on every primary action and non-obvious icon. Use when adding any new page, button, or interactive control under apps/web/src.
---

# Adding a web feature to ChoreChampz

Every interactive element a user can touch must have a tooltip OR a visible label that is fully self-explanatory. No exceptions for "obvious" icons — what's obvious to the builder is not obvious to a tired parent or an 8-year-old.

## 1. Tooltip is mandatory for

- Every primary `<Button>` whose action is not stated in its visible text (e.g. icon-only buttons, ambiguous verbs like "Apply", "Submit").
- Every secondary/ghost button that triggers a state change (Edit, Delete, Adjust, Revoke, Copy to all kids, etc.).
- Every icon-only or emoji-only control (✏️, 🎲, 🔥).
- Every form `<select>` or `<input>` whose purpose is not made obvious by the surrounding `<Field label>`.
- Every page-header `right` action.
- Nav links (`AppLayout`'s parentLinks / childLinks / caregiverLinks must include a `tip`).

## 2. Tooltip is NOT needed when

- The button's visible text already says exactly what happens ("Save", "Cancel", "Sign out" — these still got tips in this codebase, but you don't have to).
- There is already an `info={...}` `InfoButton` on the parent `<Card>` that explains the section.

When in doubt, add the tooltip. It's free.

## 3. How to add a tooltip

Import:

```tsx
import { Tooltip } from "../../components/Tooltip";
```

Wrap the trigger. `asChild` is default `true` — children must accept a `ref` and forward props. Native elements (`<button>`, `<select>`, `<a>`, `<input>`) and the local `Button` work out of the box.

```tsx
<Tooltip label="Create a new chore template (one-time or recurring)">
  <Button onClick={() => setEditing("new")}>New task</Button>
</Tooltip>
```

For disabled-state explanations, pass a dynamic label:

```tsx
<Tooltip
  label={
    paused ? "Earning is paused — ask a parent" : "Submit this task for parent approval"
  }
>
  <Button disabled={paused} onClick={…}>Mark done</Button>
</Tooltip>
```

For `<select>` / `<input>` triggers, ALSO add `aria-label` — Radix's accessible-name lint rule does not see the tooltip content.

```tsx
<Tooltip label="Filter ledger by kid">
  <select aria-label="Filter ledger by kid" …>…</select>
</Tooltip>
```

## 4. Writing the tooltip text

- One short sentence. Imperative or descriptive, not pleading.
- Say what the action does and any side effect (deduct credits, requires approval, posts to ledger).
- Do not restate the visible label verbatim. Add information.
- Mention the disabled reason when the button is conditionally disabled.

Good:

- `"Permanently delete this task (history preserved on ledger)"`
- `"Approve redemption and deduct held credits"`
- `"Cancel this invitation. PIN/link stops working immediately."`

Bad:

- `"Delete"` — restates the button.
- `"Click here to do the thing"` — useless.
- `"This is a button that will permanently and irreversibly delete the task forever from the database…"` — too long.

## 5. Don't bypass the wrapper

- Don't use the native HTML `title=""` attribute for tooltips — inconsistent rendering, no portal, no styling, no keyboard a11y. Use `<Tooltip>`.
- Don't build a one-off tooltip with `useState` + absolute positioning. We have one. Use it.

## 6. Provider check

`TooltipProvider` is mounted once in `apps/web/src/main.tsx`. Don't add a second one. If a new top-level route bypasses it (rare), wrap that route.

## 7. Existing patterns to mirror

- `apps/web/src/components/AppLayout.tsx` — nav links with per-link `tip`.
- `apps/web/src/pages/parent/Approvals.tsx` — tooltips on Approve/Reject pairs with disabled-reason variants.
- `apps/web/src/pages/child/Rewards.tsx` — tooltip with a computed `label` that explains why the button is disabled.

## 7a. Mobile-responsive page chrome

`PageHeader` is `flex-col` on small screens and `sm:flex-row` desktop ([apps/web/src/components/ui.tsx](../../../apps/web/src/components/ui.tsx)). When using its `right` slot for multiple buttons, wrap them in `flex flex-wrap gap-2` so they reflow on phone widths instead of overflowing. The title block has `min-w-0` to prevent ugly hyphenation; the right wrapper has `shrink-0` so buttons stay full size.

```tsx
<PageHeader
  title="Family members"
  subtitle="…"
  right={
    <div className="flex flex-wrap gap-2">
      <Tooltip label="…">
        <Button>Add Parent</Button>
      </Tooltip>
      <Tooltip label="…">
        <Button>Invite caregiver</Button>
      </Tooltip>
    </div>
  }
/>
```

## 7b. Onboarding tour targets

To make a control reachable from the onboarding tour, add `data-tour="<id>"` (not `id="<id>"`). The tour ([apps/web/src/components/OnboardingTour.tsx](../../../apps/web/src/components/OnboardingTour.tsx)) prefers `data-tour` and picks the first VISIBLE match via `offsetParent !== null`. This lets a logical link be duplicated across hidden mobile / visible desktop variants without ID collisions. Mirror the same `data-tour` on every visible duplicate (the desktop top nav AND the mobile bottom nav). Then add the step to [apps/web/src/lib/tours.ts](../../../apps/web/src/lib/tours.ts).

## 7c. Runtime-positioned overlays (inline styles)

The lint rule "CSS inline styles should not be used" is a VS Code warning, not an ESLint rule. For overlays whose position comes from `el.getBoundingClientRect()` at runtime (tour highlight, dnd-kit drag transform), inline `style={{ top, left, width, height }}` is the correct API. Prefix with a one-line comment explaining the constraint and (for ESLint side) `// eslint-disable-next-line react/forbid-dom-props`. Don't try to move dynamic values to a CSS file — they aren't compile-time known.

## 7d. Drag + drop with dnd-kit

For sortable lists (e.g. Task categories), use `@dnd-kit/core` + `@dnd-kit/sortable`. Pattern:

- `DndContext` at the list root with `PointerSensor` + `closestCenter`.
- `SortableContext` wrapping `items={ids}` with `verticalListSortingStrategy`.
- Each row calls `useSortable({ id })` and spreads `{...attributes}` + `{...listeners}` on a drag handle (a `<button>` with `cursor-grab`), not the whole row.
- After `onDragEnd`, optimistically reorder local state, then PATCH only the rows whose `position` changed.
- See `TaskCategoriesCard` in [apps/web/src/pages/parent/Settings.tsx](../../../apps/web/src/pages/parent/Settings.tsx).

## 8. PR self-check

Before opening a PR that touches `apps/web`, grep for new `<Button` / `<button` / `<select` / icon-only triggers you added. Each one must be either:

1. Wrapped in `<Tooltip label="…">`, OR
2. Have a visible self-describing label AND no ambiguity, OR
3. Be inside a Modal footer where the action is stated unambiguously by the modal title.

If your diff adds a new icon-only control and there's no `<Tooltip>` on it, the diff is incomplete.

## 8b. Native-specific UI patterns

These components and helpers are native-only (gated on `isNative()`) and must not affect web rendering.

### Navigation

- **`lib/nav.ts`** — single source of truth for link definitions, curated primary-tab routes (`PARENT_PRIMARY_ROUTES`, `CHILD_PRIMARY_ROUTES`), `MORE_TAB`, and `resolveScreenTitle`. Import link arrays from here; never define them inline in `AppLayout`.
- **`NavIcon`** (`components/NavIcon.tsx`) — maps route → hand-rolled inline SVG. Uses `currentColor` so `text-brand-700`/`text-slate-500` tint correctly. Props: `to`, `active`, `size`. Add a new entry to the `ICONS` map when a new primary route is added.
- **`NativeHeader`** (`components/NativeHeader.tsx`) — `sticky top-0 z-30 pt-safe` title bar showing the current screen title + `NotificationBell` + avatar → `/more`. Shown only when `isNative()` inside `AppLayout`. Title comes from `resolveScreenTitle(pathname, links)`.
- **`More` page** (`pages/More.tsx`) — overflow nav + account actions for native. Receives `AppLayoutOutletContext` via `useOutletContext()`. When adding a new parent/child nav destination, it automatically appears here if its route is not in `primaryRoutes`.

### Haptics

Import `haptic` from `lib/native`. Styles: `"light"` (taps), `"medium"` (drag), `"success"/"warning"/"error"` (outcomes). Always `void haptic(...)` — it returns a Promise. Already fired on: tab switch (AppLayout), avatar/menu nav (NativeHeader), More page rows. **Add to:** approve/reject actions, redemption submit, any mutation that completes a user-initiated flow.

### Pull-to-refresh

Wrap page content with `<PullToRefresh onRefresh={...}>` from `components/PullToRefresh.tsx`. The `onRefresh` callback should call `qc.invalidateQueries(...)` for all queries on that page. Native-only — no-ops as a passthrough on web. Use `useQueryClient()` to get the client.

### Skeleton loading

Replace bare `<div>Loading…</div>` guards with `<Skeleton>` and `<SkeletonCard>` from `components/ui`. On native the loading flash is more noticeable (no SSR), so every data screen should have a skeleton matching the content shape.

### Safe area

Use `pt-safe`, `pb-safe`, `pl-safe`, `pr-safe` utility classes (defined in `index.css`) for any element that could overlap the device status bar or home indicator. Never hard-code pixel values for these gaps.

### Bottom-sheet modals

`Modal.tsx` already renders as a bottom sheet on native (`animate-sheet-up`, drag handle, `pb-safe`, `rounded-t-2xl`). No extra work needed — just use `<Modal>` normally.

## 9. Env vars

If you read `import.meta.env.VITE_*` for any new variable, add a commented entry to [.env.example](../../.env.example) in the same change. Place it under the `# Web — apps/web` section with a one-line description of what it does and what happens when unset. Same rule applies for any new server-side env var read in `apps/api/src/env.ts` (under the API section).
