# Dashboard Period Navigation — Design

**Date:** 2026-07-07
**Status:** Approved

## Problem

The Home dashboard only shows the *current* day/week/month. There is no way to
view a previous period's total, breakdown chart, or transaction list.

## Decisions (made with user)

1. **Navigation gesture:** horizontal swipe on the hero/summary area (iOS-style).
2. **Indicator:** small pagination dots under the hero — rightmost dot = current
   period, filled dot = the period being viewed. Dots are tappable (desktop
   fallback); ←/→ arrow keys also navigate.
3. **Boundaries:** past only, unlimited. Forward navigation hard-stops at the
   current period (rubber-band resistance at the boundary).

## Design

### State

- New `periodOffset: number` state in `HomePage` (0 = current, 1 = one back, …).
- Changing granularity (day/week/month) resets offset to 0.
- Saving a transaction (manual or AI capture) resets offset to 0 so the user
  sees what they just added.
- Tapping the period label keeps its existing behavior (opens the
  day/week/month picker sheet).

### Date math (`src/lib/date-cycle.ts`)

Offset-aware variants that reuse the existing anchored helpers:

- `getDayRangeAt(now, offset)` — anchor = today − offset days.
- `getWeekRangeAt(now, weekStartDay, offset)` — anchor = today − offset×7 days.
- `getMonthRangeAt(now, monthStartDay, offset)` — current cycle start stepped
  back `offset` months via the existing `clampStart` logic, so custom
  `month_start_day` cycles (e.g. salary on the 25th) and short-month clamping
  keep working.

No API or DB changes: `loadData` already fetches by `from_date`/`to_date`, and
the chart, breakdown, and list all derive from the fetched window.

### Gesture

`motion/react` `drag="x"` on the hero wrapper (already a dependency):
`dragConstraints={{left:0,right:0}}` + `dragElastic` give rubber-banding;
`onDragEnd` interprets drag distance/velocity — rightward = back one period,
leftward = forward, clamped at 0. Vertical scroll is unaffected (axis-locked
drag). `prefers-reduced-motion` disables the slide-in transition (content
swaps instantly; drag still works).

### Dots

Four dots, left→right = older→newer, rightmost = offset 0. Filled dot marks
the viewed offset. When offset > 3, a leading `⋯` appears and the filled dot
pins left. Each dot is a `<button>` with an aria-label ("2 months ago",
"current month") that jumps to that offset.

### Copy

Tense flips for past periods: "You have spent RM X this month" → "You spent
RM X …" with labels:

| Granularity | offset 1 | offset > 1 |
|---|---|---|
| day | "yesterday" | "on 3 Jul" |
| week | "last week" | "week of 23 Jun" |
| month | "last month" | "in May" (cycle-start month name) |

Empty state for past periods: "No expense transactions in this period."

### Edge cases

- Old periods with no data: RM 0.00 + empty state (not an error).
- Fetch failure: keep previous view (existing behavior).
- Custom month cycles spanning short months: handled by `clampStart`.

## Verification

No test rig exists. Gate: `tsc --noEmit` + `vite build`, then a live pass —
swipe back/forward on all three granularities, boundary stop at "now", dot
taps, arrow keys, custom month-start cycle, add-transaction reset.

## Alternatives considered

- Chevron stepper pill / period list in the picker sheet — rejected by user in
  favor of swipe.
- Three-pane swipeable carousel — truer pager feel, but much more code/state
  for the same outcome.
- Hand-rolled touch listeners — loses motion's free drag feedback and
  rubber-banding.
