---
name: chorechamps-web-feature
description: Scaffolding rules for new ChoreChamps web features (pages, buttons, modals, form fields). Mandates tooltips on every primary action and non-obvious icon. Use when adding any new page, button, or interactive control under apps/web/src.
---

# Adding a web feature to ChoreChamps

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

## 8. PR self-check

Before opening a PR that touches `apps/web`, grep for new `<Button` / `<button` / `<select` / icon-only triggers you added. Each one must be either:

1. Wrapped in `<Tooltip label="…">`, OR
2. Have a visible self-describing label AND no ambiguity, OR
3. Be inside a Modal footer where the action is stated unambiguously by the modal title.

If your diff adds a new icon-only control and there's no `<Tooltip>` on it, the diff is incomplete.
