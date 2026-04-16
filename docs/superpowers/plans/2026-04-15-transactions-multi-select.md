# Transactions Multi-Select & Bottom-Sheet Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-select with bulk Export (XLSX/CSV) and Delete to the Transactions page, make the page header sticky, share the new XLSX/CSV submenu with HomePage's existing export, and fix the Settings page bottom sheet (and other bottom sheets) that misposition on desktop.

**Architecture:** Local React state on `TransactionsPage` for selection mode + `Set<string>` of selected IDs. Three-stage right-side button (Select → light-blue Select → "More ▼" + X cancel). Long-press detection via pointer events with 500ms timer. More dropdown is a positioned popover; Delete uses an existing-style bottom-sheet confirm modal. A new `src/lib/export.ts` consolidates XLSX and CSV serialization, used by both Transactions bulk export and HomePage's existing export. Bottom sheets are rendered via `ReactDOM.createPortal(..., document.body)` to escape any ancestor that creates a containing block for `position: fixed` (the Settings sheet bug).

**Tech Stack:** React 19, TypeScript, Vite, Tailwind v4, Framer Motion (`motion/react`), `xlsx`, `lucide-react`, Supabase JS client. No test framework is installed; verification is `tsc --noEmit`, `eslint`, and manual smoke test on the dev server.

---

## File Structure

**Created:**
- `src/lib/export.ts` — `exportTransactionsXLSX(txns, filename)` and `exportTransactionsCSV(txns, filename)` helpers (RFC 4180 CSV with UTF-8 BOM).
- `src/components/BottomSheet.tsx` — small wrapper that portals its children to `document.body` and renders the standard backdrop + bottom panel with the existing animation. Used by all new sheets and progressively adopted by existing ones touched in this work.
- `src/components/ExportMenu.tsx` — small component rendering the XLSX / CSV choice (used by both pages). Renders inline as a popover or as a bottom sheet depending on a `variant` prop.
- `src/components/Toast.tsx` — minimal top-of-viewport toast (`fixed top-4 inset-x-0` portaled), accepts `message` + `onDone`, auto-dismisses.

**Modified:**
- `src/pages/TransactionsPage.tsx` — sticky header wrapper; selection state; long-press; checkboxes; Select/More button morph; X cancel; More dropdown; Delete confirm modal + parallel delete; toast.
- `src/pages/HomePage.tsx` — replace single XLSX export button with `ExportMenu` (XLSX + CSV).
- `src/pages/SettingsPage.tsx` — wrap Duplicate Handling sheet with new `BottomSheet` (portaled).

---

## Task 1: Shared export helpers (`src/lib/export.ts`)

**Files:**
- Create: `src/lib/export.ts`

- [ ] **Step 1: Create the export helpers**

Create `src/lib/export.ts`:

```ts
import * as XLSX from "xlsx";
import type { Transaction } from "../types";

type ExportRow = {
  Date: string;
  Time: string;
  Merchant: string;
  Amount: number;
  Direction: string;
  Category: string;
  Source: string;
};

function toRows(txns: Transaction[]): ExportRow[] {
  const pad = (n: number) => String(n).padStart(2, "0");
  return txns.map((t) => {
    const d = new Date(t.transaction_at);
    return {
      Date: `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${String(d.getFullYear()).slice(-2)}`,
      Time: `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`,
      Merchant: t.merchant,
      Amount: Number(t.amount),
      Direction: t.direction,
      Category: t.category?.name ?? "",
      Source: t.source,
    };
  });
}

export function exportTransactionsXLSX(txns: Transaction[], filename: string): void {
  const rows = toRows(txns);
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Transactions");
  XLSX.writeFile(wb, filename);
}

function csvEscape(value: string | number): string {
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportTransactionsCSV(txns: Transaction[], filename: string): void {
  const rows = toRows(txns);
  const headers: (keyof ExportRow)[] = ["Date", "Time", "Merchant", "Amount", "Direction", "Category", "Source"];
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map((h) => csvEscape(r[h])).join(","));
  const csv = "\uFEFF" + lines.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function exportFilename(ext: "xlsx" | "csv"): string {
  return `pocketringgit-${new Date().toISOString().slice(0, 10)}.${ext}`;
}
```

- [ ] **Step 2: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/export.ts
git commit -m "feat: shared XLSX and CSV transaction export helpers"
```

---

## Task 2: BottomSheet component (portaled)

**Files:**
- Create: `src/components/BottomSheet.tsx`

- [ ] **Step 1: Create the BottomSheet component**

Create `src/components/BottomSheet.tsx`:

```tsx
import { type ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";

type Props = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
};

export default function BottomSheet({ open, onClose, children }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-40" onClick={onClose}
          />
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 bg-white rounded-t-3xl z-50 max-w-md mx-auto"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)" }}
          >
            <div className="px-6 pt-3 pb-4">
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
```

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/BottomSheet.tsx
git commit -m "feat: add portaled BottomSheet component"
```

---

## Task 3: Toast component

**Files:**
- Create: `src/components/Toast.tsx`

- [ ] **Step 1: Create Toast**

Create `src/components/Toast.tsx`:

```tsx
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";

type Props = {
  message: string | null;
  onDone: () => void;
  durationMs?: number;
};

export default function Toast({ message, onDone, durationMs = 3000 }: Props) {
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(onDone, durationMs);
    return () => clearTimeout(id);
  }, [message, durationMs, onDone]);

  return createPortal(
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -20, opacity: 0 }}
          className="fixed top-4 inset-x-0 z-[60] flex justify-center pointer-events-none"
        >
          <div className="px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm shadow-lg max-w-xs text-center">
            {message}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
```

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit
git add src/components/Toast.tsx
git commit -m "feat: add Toast component"
```

---

## Task 4: ExportMenu component

**Files:**
- Create: `src/components/ExportMenu.tsx`

- [ ] **Step 1: Create ExportMenu**

Create `src/components/ExportMenu.tsx`:

```tsx
import { useEffect, useRef } from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  onPickXLSX: () => void;
  onPickCSV: () => void;
  /** Where to anchor the popover. Defaults to "right". */
  align?: "left" | "right";
};

export default function ExportMenu({ open, onClose, onPickXLSX, onPickCSV, align = "right" }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (ref.current && t && !ref.current.contains(t)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  const sideClass = align === "right" ? "right-0" : "left-0";

  return (
    <div
      ref={ref}
      className={`absolute ${sideClass} mt-2 w-44 rounded-xl bg-white shadow-lg border border-gray-100 z-50 overflow-hidden`}
    >
      <button
        onClick={() => { onPickXLSX(); onClose(); }}
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100"
      >
        <FileSpreadsheet size={16} className="text-gray-500" />
        Export as XLSX
      </button>
      <button
        onClick={() => { onPickCSV(); onClose(); }}
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100 border-t border-gray-50"
      >
        <FileText size={16} className="text-gray-500" />
        Export as CSV
      </button>
    </div>
  );
}

export function ExportTrigger({ onClick, label = "Export" }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      className="h-9 px-3 rounded-xl text-sm flex items-center gap-1.5 bg-gray-50 text-gray-600 active:bg-gray-100 transition-colors touch-manipulation"
    >
      <Download size={14} />
      {label}
    </button>
  );
}
```

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit
git add src/components/ExportMenu.tsx
git commit -m "feat: add ExportMenu (XLSX/CSV) popover"
```

---

## Task 5: HomePage adopts ExportMenu

**Files:**
- Modify: `src/pages/HomePage.tsx` (replace existing XLSX-only export button with ExportMenu)

- [ ] **Step 1: Identify the existing export button**

Find the export button in `src/pages/HomePage.tsx` (currently uses `XLSX.writeFile` directly). Note its location — it should be inside a `relative` container so the absolute popover anchors correctly.

- [ ] **Step 2: Replace with ExportMenu + helpers**

At the top of `HomePage.tsx`, add:

```tsx
import ExportMenu, { ExportTrigger } from "../components/ExportMenu";
import { exportTransactionsXLSX, exportTransactionsCSV, exportFilename } from "../lib/export";
```

Add state near the other `useState` hooks:

```tsx
const [showExportMenu, setShowExportMenu] = useState(false);
```

Replace the existing XLSX export button JSX with:

```tsx
<div className="relative">
  <ExportTrigger onClick={() => setShowExportMenu((v) => !v)} />
  <ExportMenu
    open={showExportMenu}
    onClose={() => setShowExportMenu(false)}
    onPickXLSX={() => exportTransactionsXLSX(transactionsForExport, exportFilename("xlsx"))}
    onPickCSV={() => exportTransactionsCSV(transactionsForExport, exportFilename("csv"))}
  />
</div>
```

Where `transactionsForExport` is the existing variable name HomePage currently passes to its XLSX call. If the current implementation fetches inside the click handler, refactor to do the same fetch inside `onPickXLSX` / `onPickCSV` (call a single shared `loadAllForExport()` helper local to the component if needed).

Remove the now-unused `import * as XLSX from "xlsx"` in `HomePage.tsx` if no other code uses it.

- [ ] **Step 3: Type-check, lint, manual smoke**

Run:
```
npx tsc --noEmit
npx eslint src/pages/HomePage.tsx src/components/ExportMenu.tsx src/lib/export.ts
```

Start the dev server (`npm run dev`) and verify on HomePage:
- The export button shows the popover with "Export as XLSX" and "Export as CSV".
- XLSX downloads as before.
- CSV downloads, opens cleanly in Excel/Numbers, and contains the same columns.

- [ ] **Step 4: Commit**

```bash
git add src/pages/HomePage.tsx
git commit -m "feat: HomePage export gains XLSX/CSV submenu via shared ExportMenu"
```

---

## Task 6: SettingsPage uses portaled BottomSheet

**Files:**
- Modify: `src/pages/SettingsPage.tsx` — replace inline `AnimatePresence` + `fixed` sheet with `<BottomSheet open={...} onClose={...}>`

- [ ] **Step 1: Wrap Duplicate Handling sheet with BottomSheet**

In `SettingsPage.tsx`:

Add at top: `import BottomSheet from "../components/BottomSheet";`

Replace the existing Duplicate Handling picker block (the `<AnimatePresence>{showDupPicker && (<>...</>)}</AnimatePresence>` from around line 210-240) with:

```tsx
<BottomSheet open={showDupPicker} onClose={() => setShowDupPicker(false)}>
  <h2 className="text-lg font-semibold mb-4">Duplicate Handling</h2>
  <div className="space-y-2 min-w-[45vw] max-w-full">
    {duplicateOptions.map((opt) => (
      <button
        key={opt.value}
        onClick={() => { void handleDuplicateChange(opt.value); setShowDupPicker(false); }}
        className={`w-full text-left p-4 rounded-2xl transition-colors ${
          settings.duplicate_handling === opt.value
            ? "bg-[#4169e1] text-white"
            : "bg-gray-50 text-gray-700 active:bg-gray-100"
        }`}
      >
        <div className="font-medium">{opt.label}</div>
        <div className={`text-xs mt-0.5 ${settings.duplicate_handling === opt.value ? "text-white/80" : "text-gray-500"}`}>{opt.desc}</div>
      </button>
    ))}
  </div>
</BottomSheet>
```

(Preserve the exact button content currently rendered — copy from the existing block if it differs.)

Remove the now-unused `AnimatePresence` / `motion` imports from `SettingsPage.tsx` if no other usage remains.

- [ ] **Step 2: Manual verify on dev server (desktop browser)**

Open the Settings page in a desktop-sized window. Tap the duplicate-handling button. Verify the sheet:
- Slides up from the bottom.
- Is centered on the **viewport**, not on the centered app column.
- Closes on backdrop tap and Escape key.

- [ ] **Step 3: Commit**

```bash
git add src/pages/SettingsPage.tsx
git commit -m "fix: portal Settings duplicate-handling sheet to body to fix desktop position"
```

---

## Task 7: TransactionsPage — sticky header

**Files:**
- Modify: `src/pages/TransactionsPage.tsx` — wrap the existing header block in a sticky container.

- [ ] **Step 1: Wrap header with sticky container**

In `TransactionsPage.tsx`, find the JSX returned by the component (around line 237). The current outer is `<div className="px-6 pt-4 pb-6">` containing all content.

Restructure to:

```tsx
return (
  <div className="pb-6">
    <div className="sticky top-0 z-30 bg-white px-6 pt-4 pb-3">
      {/* title row */}
      {/* date mode pills + Select button (added in Task 8) */}
      {/* period total */}
      {/* search */}
      {/* filters */}
    </div>
    <div className="px-6">
      {/* transaction list */}
    </div>
  </div>
);
```

Move the existing title row, date mode pills row, period total, search, and filter chips inside the sticky div. Move the transaction list and the bottom-sheet markup outside.

- [ ] **Step 2: Manual verify**

Run dev server. On the Transactions page, scroll the list. Header (title, pills, search, filters) should remain pinned at the top, visible above the scrolling list. No bleed-through of rows.

- [ ] **Step 3: Type-check + commit**

```bash
npx tsc --noEmit
git add src/pages/TransactionsPage.tsx
git commit -m "feat: sticky header on TransactionsPage"
```

---

## Task 8: TransactionsPage — selection state, Select button, X cancel

**Files:**
- Modify: `src/pages/TransactionsPage.tsx`

- [ ] **Step 1: Add selection state and helpers**

Near the other `useState` declarations in `TransactionsPage`:

```tsx
const [selectionMode, setSelectionMode] = useState(false);
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
const [hintMode, setHintMode] = useState(false); // true between long-press and first tap on Select
const [moreOpen, setMoreOpen] = useState(false);

const toggleSelected = (id: string) => {
  setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
};

const exitSelection = () => {
  setSelectionMode(false);
  setSelectedIds(new Set());
  setHintMode(false);
  setMoreOpen(false);
};
```

- [ ] **Step 2: Place Select / More / X button in the date-mode row**

Locate the `Date mode pills` block (around line 251). Wrap its inner content in a `flex justify-between` so the four pills sit on the left and the Select/More button on the right:

```tsx
<div className="flex items-center justify-between gap-2 mb-4">
  <div className="flex gap-2">
    {(["all", "day", "week", "month"] as const).map((m) => (
      <button
        key={m}
        onClick={() => setDateMode(m)}
        className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all touch-manipulation ${
          dateMode === m ? "bg-[#4169e1] text-white" : "bg-gray-50 text-gray-500 active:bg-gray-100"
        }`}
      >
        {m === "all" ? "All" : m === "day" ? "Day" : m === "week" ? "Week" : "Month"}
      </button>
    ))}
  </div>

  {/* Selection control */}
  <div className="flex items-center gap-2 relative">
    {selectionMode && (
      <button
        onClick={exitSelection}
        aria-label="Cancel selection"
        className="h-8 w-8 flex items-center justify-center rounded-xl bg-gray-50 text-gray-600 active:bg-gray-100 touch-manipulation"
      >
        <X size={14} />
      </button>
    )}
    {selectionMode && selectedIds.size > 0 && (
      <span className="text-xs text-gray-500">{selectedIds.size} selected</span>
    )}
    {!selectionMode ? (
      <button
        onClick={() => { setSelectionMode(true); setHintMode(false); }}
        className={`h-8 px-3 rounded-xl text-xs font-medium transition-colors touch-manipulation ${
          hintMode
            ? "bg-[#4169e1]/15 text-[#4169e1]"
            : "bg-gray-50 text-gray-600 active:bg-gray-100"
        }`}
      >
        Select
      </button>
    ) : (
      <>
        <button
          onClick={() => { if (selectedIds.size > 0) setMoreOpen((v) => !v); }}
          disabled={selectedIds.size === 0}
          className={`h-8 px-3 rounded-xl text-xs font-medium flex items-center gap-1 transition-colors touch-manipulation ${
            selectedIds.size === 0
              ? "bg-[#4169e1]/40 text-white cursor-not-allowed"
              : "bg-[#4169e1] text-white active:bg-[#3151c1]"
          }`}
        >
          More <ChevronDown size={12} />
        </button>
        {/* dropdown rendered in Task 10 */}
      </>
    )}
  </div>
</div>
```

Make sure `X` and `ChevronDown` are imported from `lucide-react` (ChevronDown likely already is).

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/TransactionsPage.tsx
git commit -m "feat: add selection mode state and Select/More/X controls on Transactions"
```

---

## Task 9: TransactionsPage — long-press detection + row checkboxes

**Files:**
- Modify: `src/pages/TransactionsPage.tsx`

- [ ] **Step 1: Add long-press hook usage**

Inside the `TransactionsPage` component, add a ref-based long-press handler factory. Place it above `return (`:

```tsx
const longPressTimer = useRef<number | null>(null);
const longPressStart = useRef<{ x: number; y: number } | null>(null);

const startLongPress = (id: string, e: React.PointerEvent) => {
  if (selectionMode) return;
  longPressStart.current = { x: e.clientX, y: e.clientY };
  longPressTimer.current = window.setTimeout(() => {
    setSelectionMode(true);
    setHintMode(true);
    setSelectedIds(new Set([id]));
    longPressTimer.current = null;
  }, 500);
};

const cancelLongPress = () => {
  if (longPressTimer.current != null) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  longPressStart.current = null;
};

const moveLongPress = (e: React.PointerEvent) => {
  if (longPressTimer.current == null || !longPressStart.current) return;
  const dx = e.clientX - longPressStart.current.x;
  const dy = e.clientY - longPressStart.current.y;
  if (Math.hypot(dx, dy) > 10) cancelLongPress();
};
```

(Add `useRef` to the React imports if missing.)

- [ ] **Step 2: Add a checkbox + tap-to-toggle to each transaction row**

In the row-rendering JSX (the `{group.transactions.map((t) => ...)}` block, around line 341), wrap each row container with the long-press handlers and a leading checkbox:

```tsx
{group.transactions.map((t) => {
  const selected = selectedIds.has(t.id);
  return (
    <div key={t.id}>
      {editingId === t.id ? (
        /* existing edit form, unchanged */
      ) : (
        <div
          onPointerDown={(e) => startLongPress(t.id, e)}
          onPointerMove={moveLongPress}
          onPointerUp={cancelLongPress}
          onPointerCancel={cancelLongPress}
          onClick={() => {
            if (selectionMode) { toggleSelected(t.id); return; }
            /* existing tap behavior — open detail / inline edit, copied from current code */
          }}
          className={`flex items-center gap-2 p-2 rounded-xl transition-colors ${
            selected ? "bg-[#4169e1]/5" : "active:bg-gray-50"
          }`}
        >
          {selectionMode && (
            <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
              selected ? "bg-[#4169e1] border-[#4169e1]" : "border-gray-300 bg-white"
            }`}>
              {selected && <Check size={14} className="text-white" />}
            </div>
          )}
          {/* existing row content (icon, merchant, amount, time) — unchanged */}
        </div>
      )}
    </div>
  );
})}
```

Preserve the current row's existing onClick / inline content exactly — just add the wrapping handlers + leading checkbox div. Import `Check` from `lucide-react` if not already.

When `selectionMode` is true, suppress entering edit mode (`setEditingId(...)`) and the detail panel.

- [ ] **Step 3: Manual verify on dev server**

- Long-press a row (~500ms) — selection mode activates, that row is selected, Select button shows light blue.
- Tap the (light blue) Select button — it morphs into "More ▼" with X to its left, "1 selected" label shown.
- Tap another row — checkbox toggles, count updates.
- Tap a selected row — deselects.
- Tap X — selection mode exits, button returns to gray "Select".
- Tap "Select" directly from idle — selection mode active, More disabled until rows selected.

- [ ] **Step 4: Type-check + commit**

```bash
npx tsc --noEmit
git add src/pages/TransactionsPage.tsx
git commit -m "feat: long-press selection and per-row checkbox on Transactions"
```

---

## Task 10: TransactionsPage — More dropdown with Export submenu and Delete

**Files:**
- Modify: `src/pages/TransactionsPage.tsx`

- [ ] **Step 1: Add More dropdown JSX**

Just under the `<button>More ...</button>` JSX from Task 8, add:

```tsx
{moreOpen && (
  <div
    className="absolute right-0 top-full mt-2 w-44 rounded-xl bg-white shadow-lg border border-gray-100 z-50 overflow-hidden"
  >
    {!exportSubOpen ? (
      <>
        <button
          onClick={() => setExportSubOpen(true)}
          className="w-full flex items-center justify-between px-3.5 py-2.5 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100"
        >
          <span className="flex items-center gap-2.5"><Download size={16} className="text-gray-500" />Export</span>
          <ChevronRight size={14} className="text-gray-400" />
        </button>
        <button
          onClick={() => { setMoreOpen(false); setShowDeleteConfirm(true); }}
          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-red-500 hover:bg-red-50 active:bg-red-100 border-t border-gray-50"
        >
          <Trash2 size={16} />
          Delete
        </button>
      </>
    ) : (
      <>
        <button
          onClick={() => setExportSubOpen(false)}
          className="w-full flex items-center gap-2 px-3.5 py-2 text-xs text-gray-500 hover:bg-gray-50 border-b border-gray-50"
        >
          <ChevronLeft size={14} /> Back
        </button>
        <button
          onClick={() => { handleExport("xlsx"); setMoreOpen(false); setExportSubOpen(false); }}
          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100"
        >
          <FileSpreadsheet size={16} className="text-gray-500" />
          Export as XLSX
        </button>
        <button
          onClick={() => { handleExport("csv"); setMoreOpen(false); setExportSubOpen(false); }}
          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100 border-t border-gray-50"
        >
          <FileText size={16} className="text-gray-500" />
          Export as CSV
        </button>
      </>
    )}
  </div>
)}
```

Add state:

```tsx
const [exportSubOpen, setExportSubOpen] = useState(false);
const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
const [toastMsg, setToastMsg] = useState<string | null>(null);
```

Add handlers:

```tsx
const selectedTransactions = useMemo(
  () => transactions.filter((t) => selectedIds.has(t.id)),
  [transactions, selectedIds]
);

const handleExport = (kind: "xlsx" | "csv") => {
  const filename = exportFilename(kind);
  if (kind === "xlsx") exportTransactionsXLSX(selectedTransactions, filename);
  else exportTransactionsCSV(selectedTransactions, filename);
  setToastMsg(`Exported ${selectedTransactions.length} transactions`);
  exitSelection();
};
```

Imports to add at top:
```tsx
import { Trash2, Download, FileSpreadsheet, FileText, ChevronRight, ChevronLeft, Check, X } from "lucide-react";
import { exportTransactionsXLSX, exportTransactionsCSV, exportFilename } from "../lib/export";
import Toast from "../components/Toast";
import BottomSheet from "../components/BottomSheet";
```

(Merge with existing lucide-react import — don't duplicate.)

Add a click-outside effect to close `moreOpen`:

```tsx
useEffect(() => {
  if (!moreOpen) return;
  const onPointer = (e: PointerEvent) => {
    const target = e.target as Element | null;
    if (target && !target.closest("[data-more-popover]")) setMoreOpen(false);
  };
  document.addEventListener("pointerdown", onPointer);
  return () => document.removeEventListener("pointerdown", onPointer);
}, [moreOpen]);
```

Add `data-more-popover` to both the More button and the dropdown container (their common parent div with `relative`).

- [ ] **Step 2: Render Toast at the bottom of the component JSX**

Just before the closing `</div>` of the page root, add:

```tsx
<Toast message={toastMsg} onDone={() => setToastMsg(null)} />
```

- [ ] **Step 3: Type-check + commit**

```bash
npx tsc --noEmit
git add src/pages/TransactionsPage.tsx
git commit -m "feat: More dropdown with Export submenu on Transactions"
```

---

## Task 11: TransactionsPage — Delete confirm modal + parallel delete

**Files:**
- Modify: `src/pages/TransactionsPage.tsx`

- [ ] **Step 1: Add the BottomSheet-based confirm modal**

Near the existing bottom sheets at the bottom of the JSX, add:

```tsx
<BottomSheet open={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)}>
  <h2 className="text-lg font-semibold mb-1">Delete {selectedIds.size} transactions?</h2>
  <p className="text-sm text-gray-500 mb-4">This cannot be undone.</p>
  <div className="flex gap-2">
    <button
      onClick={() => setShowDeleteConfirm(false)}
      className="flex-1 h-11 rounded-xl bg-gray-100 text-gray-700 text-sm font-medium active:bg-gray-200 touch-manipulation"
    >
      Cancel
    </button>
    <button
      onClick={() => void handleConfirmDelete()}
      className="flex-1 h-11 rounded-xl bg-red-500 text-white text-sm font-medium active:bg-red-600 touch-manipulation"
    >
      Delete
    </button>
  </div>
</BottomSheet>
```

- [ ] **Step 2: Add the parallel delete handler**

```tsx
const handleConfirmDelete = async () => {
  const ids = Array.from(selectedIds);
  const total = ids.length;
  setShowDeleteConfirm(false);
  const results = await Promise.allSettled(ids.map((id) => deleteTransaction(id)));
  const ok: string[] = [];
  results.forEach((r, i) => { if (r.status === "fulfilled") ok.push(ids[i]); });
  const okSet = new Set(ok);
  setTransactions((prev) => prev.filter((t) => !okSet.has(t.id)));
  const failed = total - ok.length;
  setToastMsg(failed === 0 ? `Deleted ${total} transactions` : `Deleted ${ok.length} of ${total} — ${failed} failed`);
  exitSelection();
};
```

Note: `deleteTransaction` is already imported from `../lib/api`; verify and add if missing.

- [ ] **Step 3: Manual verify on dev server**

- Select 3 transactions → More → Delete → confirm modal appears.
- Cancel: modal closes, selection persists.
- Delete: rows disappear, toast shows "Deleted 3 transactions", selection mode exits.
- Refresh page — deletions persist (server-side delete confirmed).

- [ ] **Step 4: Type-check, lint, commit**

```bash
npx tsc --noEmit
npx eslint src/pages/TransactionsPage.tsx
git add src/pages/TransactionsPage.tsx
git commit -m "feat: bulk delete with confirm modal and toast on Transactions"
```

---

## Task 12: Adopt portaled BottomSheet for existing Transactions/Home sheets (bottom-sheet fix follow-through)

**Files:**
- Modify: `src/pages/TransactionsPage.tsx` — replace inline `AnimatePresence` + `fixed` markup for the Edit Date/Time picker, source picker, category picker, and calendar picker with `<BottomSheet>`.
- Modify: `src/pages/HomePage.tsx` — same for the Edit Date/Time picker and category picker.

- [ ] **Step 1: Refactor each existing sheet to use BottomSheet**

For each sheet that currently uses the `<AnimatePresence>{showX && (<>{backdrop}{panel}</>)}</AnimatePresence>` pattern, replace with:

```tsx
<BottomSheet open={showX} onClose={() => setShowX(false)}>
  {/* existing inner content of the sheet (everything that was inside the px-6 pt-5 pb-4 panel) */}
</BottomSheet>
```

Strip the now-redundant grabber div if `BottomSheet` already renders one (it does — see Task 2).

- [ ] **Step 2: Manual verify on desktop browser**

For each sheet (date picker, category picker, source picker, calendar) on both pages:
- Sheet centers on viewport, not constrained to the app column.
- Animation still slides up from bottom.
- Backdrop tap and Escape close the sheet.
- Inner interactive elements work (calendar dates clickable, etc.).

- [ ] **Step 3: Type-check, lint, commit**

```bash
npx tsc --noEmit
npx eslint src/pages/TransactionsPage.tsx src/pages/HomePage.tsx
git add src/pages/TransactionsPage.tsx src/pages/HomePage.tsx
git commit -m "refactor: route remaining bottom sheets through portaled BottomSheet"
```

---

## Task 13: Final QA pass

- [ ] **Step 1: Type-check whole project**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 2: Lint whole project**

Run: `npx eslint src`
Expected: zero new errors. Pre-existing warnings unchanged.

- [ ] **Step 3: Manual end-to-end smoke test (dev server)**

In a desktop browser at mobile width (~390px):

- Transactions page header is sticky while scrolling.
- Long-press a row → selection on, row selected, Select light blue.
- Tap Select → "More ▼" + X visible, "1 selected" label.
- Tap More → Export / Delete.
- Export → XLSX or CSV submenu → file downloads, contains only the selected rows.
- Delete → confirm modal → confirm → rows deleted, toast shown.
- Tap "Select" from idle → selection mode active, More disabled.
- HomePage export menu offers XLSX + CSV.
- Settings duplicate-handling sheet centers on viewport on a wide desktop window.
- All other bottom sheets (calendar, date picker, category picker, source picker) likewise center.

- [ ] **Step 4: Final commit if any cleanup**

```bash
git status
# if any untracked or unstaged trivial cleanup
git add -A
git commit -m "chore: post-feature cleanup"
```

---

## Verification summary

- **Type safety:** `npx tsc --noEmit` passes.
- **Lint:** `npx eslint src` no new errors.
- **Manual:** All bullets in Task 13 Step 3 pass.

## Notes for the implementer

- This codebase has **no test framework**. Verification is type-check + lint + manual smoke. Do not add Vitest/Jest unless asked — that's out of scope.
- Existing patterns to imitate: bottom sheets (date/category pickers in `HomePage.tsx` / `TransactionsPage.tsx`), Tailwind v4 utility-class style, royal blue brand color `#4169e1`, motion via `motion/react`.
- Keep edits surgical inside the existing files. Do not reformat unrelated code.
- The Settings sheet bug is fixed by portaling, not by removing CSS — do not remove `backdrop-filter`/`will-change` from `styles.css` / `app.css` as those are used elsewhere intentionally.
