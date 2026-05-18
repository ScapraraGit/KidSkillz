# Summer Break / Schedule Mode — Enhancement

Status: **proposed**. Captured for review. Not started.

## Problem

Recurring tasks today carry one `dueByTime` and one `daysOfWeek`. Real families need two modes:

- **School year**: "Make the bed by 7:00 AM", "Pack snacks Mon–Fri".
- **Summer / break / weekends**: same chore at 9:30 AM, or skipped entirely.

Parents currently work around this by editing each task at the start of summer (and forgetting to switch it back). We want one toggle, sane defaults, and a per-task escape hatch.

This builds directly on the recently-added "Weekdays only" DAILY option (`daysOfWeek` honored on `DAILY` frequency).

---

## Recommended UX: family-level Schedule Mode + per-task overrides

One family-wide mode flip is the primary control. Per-task overrides handle outliers. Most tasks need zero editing.

### Family setting — Settings → Schedule

- `scheduleMode`: `SCHOOL_YEAR` (default) | `SUMMER` | `BREAK`
- Optional `autoSwitch`: date range pair (e.g. _Summer = Jun 7 – Aug 22_). When set, mode flips automatically on those dates without parent touching anything. TZ-aware via existing `lib/time.ts`.
- Manual override always wins (snow day, sick week, mid-summer travel).
- Per-kid override (older sibling still in school, younger out) — see open questions.

### Per-task — "Different schedule when school's out"

Collapsed by default in the task form. Three independent knobs:

```
[ ] Different schedule when school's out
    Days:     ○ Same as school year   ○ Choose…   [M T W T F S S]
    Due by:   ○ Same time             ○ Choose…   [ 09:30 ]
    Or:       ○ Skip entirely on this mode
```

Each knob inherits ("Same as school year") if untouched. "Skip entirely" supersedes the other two for that mode.

### Kid's day view

Small mode badge near the day header: `📅 Summer schedule`. Tap for tooltip + link to Settings. One visual signal, no friction.

---

## Why this over alternatives

| Approach                                     | Cost     | Issue                                                                           |
| -------------------------------------------- | -------- | ------------------------------------------------------------------------------- |
| Per-task summer fields only (no family mode) | Cheap    | Parent edits N tasks twice a year. Inconsistent.                                |
| Named schedule profiles ("custom")           | Powerful | Overkill for 90% of families. Decision paralysis.                               |
| **Mode + per-task override (this)**          | Medium   | Best balance. One flip handles common case; per-task escape hatch for outliers. |
| Auto-detect via calendar/location            | Magic    | Privacy + reliability cost. Out of scope.                                       |

---

## Data model

Recurrence JSON grows an optional `byMode` map. No new column.

```jsonc
{
  "frequency": "DAILY",
  "daysOfWeek": [1, 2, 3, 4, 5],
  "dueByTime": "07:00",
  "byMode": {
    "SUMMER": { "daysOfWeek": [], "dueByTime": "09:30", "skip": false },
    "BREAK": { "skip": true },
  },
}
```

Resolution at evaluation time:

1. Read tenant `scheduleMode` (and per-kid override if set).
2. If `recurrence.byMode[mode]` exists, merge over base recurrence (per-key override; missing keys inherit).
3. If `skip === true`, treat as not active for the day.
4. Evaluate as today via `recurrenceMatchesDate` + `dueByTime`.

Backward compat: no `byMode` = identical behavior every mode. Existing tasks unchanged.

### Family settings additions

```ts
{
  scheduleMode: "SCHOOL_YEAR" | "SUMMER" | "BREAK",
  scheduleAutoSwitch?: {
    summer?: { start: "MM-DD", end: "MM-DD" },
    break?:  { start: "MM-DD", end: "MM-DD" }, // optional second window
  },
  perChildScheduleModeOverride?: Record<string, ScheduleMode>, // childId → mode
}
```

`MM-DD` so the range repeats annually without re-entry. Resolver compares to today in family TZ.

---

## Where it plugs in

- `apps/api/src/services/tasks.ts` → `recurrenceMatchesDate(rec, dateStr, dow, mode)` — add `mode` arg; merge `byMode[mode]` before checks.
- `apps/api/src/services/tasks.ts` → `listTodayForChild` — read tenant mode once per call, pass through.
- `apps/api/src/services/penalties.ts` → same resolution. A `skip: true` task in current mode must not penalize.
- `apps/api/src/lib/time.ts` → helper `currentScheduleMode(tenantId, today)` honoring `scheduleAutoSwitch` + manual override.
- `apps/web/src/pages/parent/Tasks.tsx` → "Different schedule when school's out" sub-section in `TaskFormModal`. Collapsed by default; expanded if `byMode` present.
- `apps/web/src/pages/parent/Settings.tsx` → Schedule card with mode picker + auto-switch dates + per-kid override.
- `apps/web/src/pages/child/Dashboard.tsx` → mode badge near day header.
- `packages/shared/src/types.ts` → `ScheduleMode` enum, `Recurrence.byMode` field, `FamilySettings` additions.
- Audit: mode changes write `SCHEDULE_MODE_CHANGED` event (actor, prev, next).

---

## Phasing

| Phase | Cost     | What                                                                                                                                     |
| ----- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | ~½ day   | Schema/types: `ScheduleMode` enum, `Recurrence.byMode`, `FamilySettings.scheduleMode`. No UI yet. Resolver returns `SCHOOL_YEAR` always. |
| 1     | ~1 day   | Backend resolver: `currentScheduleMode()` + merge logic in `recurrenceMatchesDate` and `penalties.ts`. Unit tests for merge precedence.  |
| 2     | ~1 day   | Settings UI: mode picker (manual switch only). Audit event.                                                                              |
| 3     | ~1 day   | Task form: collapsible "Different schedule when school's out" sub-section. Skip-mode option.                                             |
| 4     | ~½ day   | Auto-switch via date range. TZ-aware resolution.                                                                                         |
| 5     | optional | Per-kid override. Kid dashboard mode badge.                                                                                              |

Phases 0–3 deliver the feature end-to-end. 4–5 are polish.

---

## Open questions

- **Per-kid mode vs family mode?** Older sibling still in school, younger out for summer. Per-kid override on the family setting feels right; default = family mode.
- **Holiday handling.** Week-long Thanksgiving — same `BREAK` mode, or a third one-off `HOLIDAY` mode? Recommend reusing `BREAK` + manual flip for v1; reconsider if usage shows distinct semantics.
- **Year-spanning ranges.** "Break = Dec 20 – Jan 3" wraps the year. Resolver must handle wraparound.
- **Notifications / digests.** Mode-skipped tasks should not appear in "today" digests or fire missed-task notifications. Already covered if penalties + listToday share the resolver.
- **Streaks.** A skip-day breaks or preserves the streak? Recommend: preserved (skip = N/A, not miss). Wire through streak engine carefully.
- **Initial migration.** Tasks created with the old "Weekdays only" DAILY option don't change meaning under `SCHOOL_YEAR` — but parents may _expect_ "weekdays" to become "every day" automatically in summer. Onboarding tooltip when the parent first flips to `SUMMER`: "Tasks set to Weekdays only will skip Saturday and Sunday in Summer too — add a Summer override if you want them every day."

---

## Related

- [Daily Weekdays-only recurrence] — already shipped. `daysOfWeek` honored on `DAILY` frequency. This plan extends the same recurrence shape.
- `apps/api/src/services/tasks.ts:recurrenceMatchesDate` — primary integration point.
- `apps/api/src/services/penalties.ts` — must share resolver to keep missed-task fairness honest.
- `CLAUDE.md` — recurring-task rule ("templates walked at read time, not materialized") carries forward unchanged.
