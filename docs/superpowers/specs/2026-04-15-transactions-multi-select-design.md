# Transactions Multi-Select, Sticky Header, Export Enhancements & Bottom-Sheet Fix

Date: 2026-04-15

## Goals

1. Make the Transactions page header sticky so filters and selection controls stay accessible while scrolling.
2. Add a multi-select mode on the Transactions page with two entry paths (long-press a row, or tap a Select button) and a More dropdown for bulk actions (Export / Delete).
3. Add CSV as an additional export format (Transactions page bulk export AND existing HomePage export).
4. Fix the Settings page "Duplicate Handling" bottom sheet, which currently renders off-center on desktop because an ancestor creates a containing block for `position: fixed`.

## Non-goals

- No new selection state shared across pages.
- No undo for delete (per design decision).
- No collapsing/condensed sticky header on scroll — full header stays sticky.
- No changes to the existing edit/inline-edit flow on Transactions.

---

## 1. Sticky header

Wrap the entire current header block on `TransactionsPage` (title row, segmented date-mode pills + Select button, optional period total, search input, filter chip row) inside one container with:

```
sticky top-0 z-30 bg-white
```

- Background must be opaque white so list rows do not bleed through.
- Add a small bottom shadow that appears only when the page has scrolled (`shadow-sm` toggled via a scroll listener or `IntersectionObserver` sentinel above the list).
- The transaction list scrolls underneath naturally.
- The bottom nav (`BottomNav`) is unaffected.

## 2. Selection mode

### State (TransactionsPage local state)

- `selectionMode: boolean`
- `selectedIds: Set<string>`
- `moreOpen: boolean` (controls dropdown)

### Right-aligned button states

The button sits on the same row as the All / Day / Week / Month pills, aligned to the right.

| Stage | When | Button text | Button style | "X" cancel button |
|---|---|---|---|---|
| 1. Idle | Default | "Select" | `bg-gray-50 text-gray-600 active:bg-gray-100` (matches inactive filter chips) | hidden |
| 2. Hint | Long-press a row enters selection mode with that row selected | "Select" | `bg-[#4169e1]/15 text-[#4169e1]` (light royal blue) | hidden |
| 3. Active | User taps the Select button (from Stage 1 OR Stage 2) | "More ▼" (with `ChevronDown` icon) | `bg-[#4169e1] text-white` royal blue; `disabled` styling when 0 rows selected | shown to the LEFT of More as an "X" pill (`bg-gray-50`); also shows "N selected" text label inline |

Transitions:

- **Idle → Hint:** long-press a row.
- **Idle → Active:** tap "Select" directly.
- **Hint → Active:** tap "Select" (light blue).
- **Active → Idle:** tap "X" cancel. Clears `selectedIds` and exits selection mode.
- The dropdown auto-closes when transitioning to Idle.

Per Q5: in Active stage with 0 selected, the More button is disabled (`opacity-50 pointer-events-none` or `disabled` attribute), preventing dropdown open.

### Long-press detection

- On row `pointerdown`: start a 500ms timer; record start position.
- If `pointermove` exceeds ~10px before timer fires, cancel.
- If `pointerup`/`pointercancel` before 500ms, cancel and treat as a tap.
- If timer fires: `setSelectionMode(true)`, `setSelectedIds(new Set([rowId]))`, suppress the subsequent `click`.
- Long-press is only armed when `selectionMode === false`. In selection mode, `pointerdown` does nothing special and a tap toggles selection.

### Row selection UX

- When `selectionMode === true`, every row shows a **checkbox** at the left (animated in via Framer Motion: slide+fade from left, ~150ms).
- Tap anywhere on the row toggles `selectedIds.has(id)`. Does NOT open `editingId` or `detailId`.
- Selected rows: background `bg-[#4169e1]/5`, checkbox filled royal blue.
- The header shows `N selected` text next to the X button.

### Disabled interactions while in selection mode

- Inline edit form does not open on tap.
- Detail panel does not open on tap.
- Long-press does nothing extra (already in selection mode).
- Filter chips, search, and date-mode pills remain fully usable.

## 3. More dropdown

- Anchored beneath the More button (popover, not bottom sheet) — implemented as an absolutely-positioned panel within a `relative` wrapper around the More button.
- Closed by: tap outside (capture `pointerdown` on `document`), `Escape` key, exiting selection mode, or selecting an item.
- Items:
  - **Export** with right chevron — opens nested submenu (slide-in from right within the same panel, OR shows submenu on hover/tap):
    - Export as XLSX
    - Export as CSV
  - **Delete** — red text, `text-red-500`.

Both Export options export ONLY the selected transactions (filtered by `selectedIds`).

### Export columns (both XLSX and CSV)

Same as today's XLSX export (consistency):

- Date (DD-MM-YY)
- Time (HH-MM-SS)
- Merchant
- Amount (number)
- Direction
- Category
- Source

CSV is RFC 4180: comma separator, fields containing comma/quote/newline are wrapped in `"..."` with internal quotes doubled. Use `\r\n` line endings. UTF-8 BOM prefixed for Excel compatibility.

Filename: `pocketringgit-YYYY-MM-DD.{xlsx|csv}`.

### HomePage existing export — same submenu

The existing HomePage XLSX export button gains the same XLSX/CSV submenu. Behavior of what gets exported is unchanged (current period transactions); only the format choice is added.

A small shared helper `src/lib/export.ts` exposes:

```ts
export function exportTransactionsXLSX(txns: Transaction[], filename: string): void;
export function exportTransactionsCSV(txns: Transaction[], filename: string): void;
```

Both pages use it, removing duplication.

## 4. Delete confirmation flow

1. User selects Delete from the More dropdown.
2. Bottom-sheet modal appears (matches existing date/category picker pattern):
   - Title: "Delete N transactions?"
   - Body: "This cannot be undone."
   - Buttons: Cancel (gray, dismiss) / Delete (red `bg-red-500 text-white`).
3. On confirm:
   - Run `Promise.allSettled(selectedIds.map((id) => deleteTransaction(id)))`.
   - Successful IDs: remove from `transactions` state.
   - Selection mode exits and `selectedIds` clears.
4. Toast (top of viewport, auto-dismiss in 3s):
   - All success: "Deleted N transactions"
   - Partial failure: "Deleted X of N — Y failed" (failed rows remain visible)

A minimal Toast utility is fine — single-message state on the page is sufficient (no global toast system).

## 5. Settings page bottom-sheet fix

### Symptom

The Duplicate Handling sheet uses `fixed inset-x-0 bottom-0 ... max-w-md mx-auto`. On desktop it renders horizontally offset (constrained to the centered app column instead of the viewport).

### Likely cause

An ancestor of the sheet has a CSS property that makes it the containing block for `position: fixed`. Candidates: `transform`, `will-change: transform`, `filter`, `backdrop-filter`, `perspective`, `contain`. `app.css`/`styles.css` use `backdrop-filter` and `will-change: transform` in places — need to confirm in DevTools whether any is on a sheet ancestor.

### Fix

1. Diagnose in the running dev server: inspect computed styles on each ancestor of the sheet to identify which property creates the containing block.
2. Preferred fix: render bottom sheets via `ReactDOM.createPortal` to `document.body`, so they are never affected by ancestor transforms/filters. This is the most robust fix and a one-line change per sheet.
3. Apply the same portal treatment to the other bottom sheets that share this pattern: HomePage and TransactionsPage Edit Date/Time picker, category pickers, source picker, calendar picker, the new Delete confirm modal.
4. Optionally extract a small `<BottomSheet>` component to consolidate the pattern, but this is a refactor — only do it if all sheets are nearly identical. Otherwise patch in place.

## File touch list

- `src/pages/TransactionsPage.tsx` — sticky header, selection state, checkboxes, More dropdown, Delete modal.
- `src/pages/HomePage.tsx` — wrap export button in XLSX/CSV submenu; portal the date picker if part of the bottom-sheet fix.
- `src/pages/SettingsPage.tsx` — portal the Duplicate Handling sheet.
- `src/lib/export.ts` — new shared XLSX/CSV export helpers.
- `src/components/BottomSheet.tsx` (optional) — only if extracting the shared pattern.
- `src/app.css` / `src/styles.css` — only if a CSS property needs to be removed/relocated as part of the fix diagnosis.

## Success criteria

- Header on Transactions stays visible while scrolling the list.
- Long-press a row → row is selected, button turns light blue.
- Tap Select (idle or light-blue) → button becomes "More ▼", X cancel appears, "N selected" shows.
- Checkboxes appear on all rows; tap toggles selection; selected rows highlighted.
- More dropdown disabled at 0 selected, enabled at ≥1.
- Export submenu offers XLSX and CSV; both exports contain the selected transactions only.
- HomePage export gains the same XLSX/CSV submenu.
- Delete shows confirm modal → on confirm, deletes in parallel and toasts the result.
- Duplicate Handling sheet (and other bottom sheets) center correctly on the viewport on desktop.

## Open questions

None at design time. Implementation may surface small UX choices (e.g., exact submenu animation) — defer to writing-plans and implementation.
