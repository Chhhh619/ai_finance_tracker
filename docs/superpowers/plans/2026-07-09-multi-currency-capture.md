# Multi-Currency Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect a foreign currency during AI capture, convert it to the user's account currency at the transaction date via the Frankfurter API, and save the converted amount while preserving the original amount/currency/rate.

**Architecture:** Conversion runs server-side inside the `ingest` Edge Function so all capture paths (browser AI Parse, receipt photo, iOS Shortcut) share one code path. The record stores the converted amount as its primary `amount` in the account currency, plus `original_amount`, `original_currency`, and `exchange_rate` for transparency. Display formats each record in its own currency via `Intl.NumberFormat`; the dashboard headline total sums only account-currency records and badges the rest.

**Tech Stack:** React 19 + TypeScript + Vite, Supabase (Postgres + Deno Edge Function), Zod, `motion/react`, `Intl.NumberFormat`, Frankfurter API (`https://api.frankfurter.dev/v1`).

## Global Constraints

- **No automated test runner exists.** Verification per task = `npx tsc --noEmit` (zero errors) + `npx vite build` (succeeds) for frontend tasks, plus the live check named in the task. Do not add a test framework — it is out of scope.
- **Deno function and browser cannot share imports** (different runtimes). FX-fetch logic is intentionally implemented twice: inline in `supabase/functions/ingest/index.ts` and in `src/lib/fx.ts` for the client retry action.
- **FX source:** Frankfurter only. Endpoint: `GET https://api.frankfurter.dev/v1/{YYYY-MM-DD}?base={FROM}&symbols={TO}`. Response shape: `{ "amount": 1, "base": "SGD", "date": "2026-07-09", "rates": { "MYR": 3.481 } }`. No API key.
- **Rate direction:** stored as `1 original_currency = exchange_rate account_currency`. Conversion: `converted = Math.round(original * rate * 100) / 100`.
- **FX failure or unsupported currency** → save the record with `amount = original_amount`, `currency = original_currency`, `exchange_rate = null`, `needs_review = true`. Never drop the capture.
- **Headline total** sums only records where `currency === accountCurrency`. Badge copy: one foreign currency → `+ {n} in {CODE}`; multiple → `+ {n} in {m} currencies`.
- **Account currency** comes from `user_settings.default_currency` (already exists, default `'MYR'`, already in the migration-004 granted-update column list).
- **Brand accent color** is `#4169e1` (used for selected states, matching existing sheets).
- **Migration files** are numbered and never edited once applied; new tables/columns only. Next number is `005`.

---

### Task 1: Schema + types for currency columns

**Files:**
- Create: `supabase/migrations/005_multi_currency.sql`
- Modify: `src/types.ts` (add fields to `Transaction`)

**Interfaces:**
- Produces: `transactions.original_amount numeric | null`, `transactions.original_currency text | null`, `transactions.exchange_rate numeric | null`. TS `Transaction` gains `original_amount?: number | null; original_currency?: string | null; exchange_rate?: number | null;`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/005_multi_currency.sql`:

```sql
-- Multi-currency capture (2026-07-09)
-- Foreign-currency captures store the converted amount in `amount`/`currency`
-- (the account currency) plus the original amount/currency and the rate used.
-- All three are NULL for domestic captures and manual entries.

alter table public.transactions
  add column if not exists original_amount numeric,
  add column if not exists original_currency text,
  add column if not exists exchange_rate numeric;

comment on column public.transactions.original_amount is
  'Amount as printed on the source, in original_currency. NULL when no conversion happened.';
comment on column public.transactions.original_currency is
  'ISO 4217 code of the source amount. NULL when no conversion happened.';
comment on column public.transactions.exchange_rate is
  'Rate applied: 1 original_currency = exchange_rate * (account) currency. NULL when unconverted.';
```

- [ ] **Step 2: Apply the migration to the Supabase project**

Apply via the Supabase MCP `apply_migration` tool (name: `005_multi_currency`, the SQL above) OR `npx supabase db push` if the CLI is linked. Existing rows get NULLs — no backfill needed.

Verify with the Supabase MCP `execute_sql`:
```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'transactions'
  and column_name in ('original_amount','original_currency','exchange_rate');
```
Expected: three rows, all `is_nullable = YES`.

- [ ] **Step 3: Extend the Transaction type**

In `src/types.ts`, inside `interface Transaction`, add these fields immediately after `needs_review: boolean;` (line 26):

```typescript
  needs_review: boolean;
  original_amount?: number | null;
  original_currency?: string | null;
  exchange_rate?: number | null;
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (new fields are optional, so existing code is unaffected).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/005_multi_currency.sql src/types.ts
git commit -m "feat: schema + types for multi-currency transaction columns"
```

---

### Task 2: Currency reference list + currency-aware money formatter

**Files:**
- Create: `src/lib/currencies.ts`
- Modify: `src/lib/money.ts`

**Interfaces:**
- Consumes: `Transaction["direction"]` from `../types`.
- Produces:
  - `SUPPORTED_CURRENCIES: { code: string; name: string }[]` (the ~31 Frankfurter currencies, alphabetized, MYR pinned readable).
  - `isSupportedCurrency(code: string): boolean`.
  - `moneyFmt(amount: number, currency?: string): string` (default `"MYR"`).
  - `formatTransactionAmount(amount: number, direction: Transaction["direction"], currency?: string): string` (default `"MYR"`).
  - `getTransactionAmountClass(direction: Transaction["direction"]): string` (unchanged signature).

- [ ] **Step 1: Create the currency reference list**

Create `src/lib/currencies.ts`:

```typescript
// The currencies Frankfurter (ECB reference rates) supports. This is the single
// source of truth for both the account-currency picker and conversion coverage.
export const SUPPORTED_CURRENCIES: { code: string; name: string }[] = [
  { code: "AUD", name: "Australian Dollar" },
  { code: "BGN", name: "Bulgarian Lev" },
  { code: "BRL", name: "Brazilian Real" },
  { code: "CAD", name: "Canadian Dollar" },
  { code: "CHF", name: "Swiss Franc" },
  { code: "CNY", name: "Chinese Yuan" },
  { code: "CZK", name: "Czech Koruna" },
  { code: "DKK", name: "Danish Krone" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British Pound" },
  { code: "HKD", name: "Hong Kong Dollar" },
  { code: "HUF", name: "Hungarian Forint" },
  { code: "IDR", name: "Indonesian Rupiah" },
  { code: "ILS", name: "Israeli Shekel" },
  { code: "INR", name: "Indian Rupee" },
  { code: "ISK", name: "Icelandic Krona" },
  { code: "JPY", name: "Japanese Yen" },
  { code: "KRW", name: "South Korean Won" },
  { code: "MXN", name: "Mexican Peso" },
  { code: "MYR", name: "Malaysian Ringgit" },
  { code: "NOK", name: "Norwegian Krone" },
  { code: "NZD", name: "New Zealand Dollar" },
  { code: "PHP", name: "Philippine Peso" },
  { code: "PLN", name: "Polish Zloty" },
  { code: "RON", name: "Romanian Leu" },
  { code: "SEK", name: "Swedish Krona" },
  { code: "SGD", name: "Singapore Dollar" },
  { code: "THB", name: "Thai Baht" },
  { code: "TRY", name: "Turkish Lira" },
  { code: "USD", name: "US Dollar" },
  { code: "ZAR", name: "South African Rand" },
];

const SUPPORTED_SET = new Set(SUPPORTED_CURRENCIES.map((c) => c.code));

export function isSupportedCurrency(code: string): boolean {
  return SUPPORTED_SET.has(code.toUpperCase());
}
```

- [ ] **Step 2: Rewrite the money formatter to be currency-aware**

Replace the entire contents of `src/lib/money.ts` with:

```typescript
import type { Transaction } from "../types";

// Symbols where Intl's narrow symbol is ambiguous ("$" for SGD) or not the
// form this app prefers. Everything else uses Intl's narrow symbol.
const SYMBOL_OVERRIDE: Record<string, string> = {
  MYR: "RM",
  SGD: "S$",
};

function currencySymbol(currency: string): string {
  const code = currency.toUpperCase();
  if (SYMBOL_OVERRIDE[code]) return SYMBOL_OVERRIDE[code];
  try {
    const parts = new Intl.NumberFormat("en", {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
    }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? code;
  } catch {
    return code; // invalid/unknown code — prefix with the code itself
  }
}

function currencyFractionDigits(currency: string): number {
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).resolvedOptions().maximumFractionDigits;
  } catch {
    return 2;
  }
}

export function moneyFmt(amount: number, currency = "MYR"): string {
  const digits = currencyFractionDigits(currency);
  const num = amount.toLocaleString("en-MY", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${currencySymbol(currency)}${num}`;
}

export function formatTransactionAmount(
  amount: number,
  direction: Transaction["direction"],
  currency = "MYR",
): string {
  return `${direction === "income" ? "+" : "-"}${moneyFmt(amount, currency)}`;
}

export function getTransactionAmountClass(direction: Transaction["direction"]): string {
  return direction === "income" ? "text-emerald-600" : "text-rose-400";
}
```

- [ ] **Step 3: Sanity-check Intl output for representative currencies**

Run this node one-liner (node ships Intl):
```bash
node -e "for (const c of ['MYR','SGD','JPY','IDR','USD']) { const d=new Intl.NumberFormat('en',{style:'currency',currency:c}).resolvedOptions().maximumFractionDigits; console.log(c, d); }"
```
Expected: `MYR 2`, `SGD 2`, `JPY 0`, `IDR 0`, `USD 2` (confirms zero-decimal currencies resolve to 0 digits).

- [ ] **Step 4: Type-check + build**

Run: `npx tsc --noEmit`
Expected: FAIL — existing call sites in `HomePage.tsx` and `TransactionsPage.tsx` call `formatTransactionAmount(amount, direction)` with 2 args, which is still valid (currency defaults). So actually: PASS. The signature change is backward-compatible (added optional param). Confirm PASS.

Run: `npx vite build`
Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/lib/currencies.ts src/lib/money.ts
git commit -m "feat: currency reference list + currency-aware money formatter"
```

---

### Task 3: Ingest function — currency detection + server-side conversion

**Files:**
- Modify: `supabase/functions/ingest/index.ts`

**Interfaces:**
- Consumes: `settings.default_currency` (already selected via `select("*")` at line 250-254); `transactionSchema` (line 18-26); the inserts builder (line 317-330); the success-message builder (line 342-355).
- Produces: inserted `transactions` rows now carrying `currency` = account currency (or original on FX failure), `original_amount`, `original_currency`, `exchange_rate`.

- [ ] **Step 1: Add `currency` to the LLM output schema**

In `supabase/functions/ingest/index.ts`, modify `transactionSchema` (line 18-26) to add a `currency` field after `amount`:

```typescript
const transactionSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().length(3).optional(),
  merchant: z.string().min(1),
  direction: z.enum(["expense", "income"]),
  category: z.string().min(1),
  source: z.enum(["ewallet", "bank", "manual", "receipt"]),
  confidence: z.number().min(0).max(1),
  transaction_at: z.string().optional(),
});
```

- [ ] **Step 2: Teach the prompt to detect currency**

In `callGeminiFlash`, in the `systemPrompt` array (line 87-111), make two edits.

Replace the `- amount:` line (line 102) with these two lines:
```typescript
    "- amount: number (positive, the FINAL total as printed, in the currency you detected)",
    "- currency: string (ISO 4217 code, e.g. 'MYR', 'SGD', 'USD', 'JPY'). Infer from the currency symbol (RM, S$, $, ¥, ฿, Rp), any explicit code, the store's country, or the language. Default to 'MYR' only if genuinely ambiguous.",
```

(The existing `- direction:`, `- category:`, etc. lines stay as they are.)

- [ ] **Step 3: Add the FX helper and per-request rate cache**

In `supabase/functions/ingest/index.ts`, add this helper function immediately after the `log(...)` function (after line 77):

```typescript
// Fetches 1 `from` = ? `to` for a given date from Frankfurter (ECB rates).
// Returns null on any failure or unsupported currency — caller then flags the
// record for review rather than dropping it.
async function fetchExchangeRate(
  from: string,
  to: string,
  date: string,
  requestId: string,
  cache: Map<string, number | null>,
): Promise<number | null> {
  if (from === to) return 1;
  const key = `${from}:${to}:${date}`;
  if (cache.has(key)) return cache.get(key)!;

  log(requestId, "fx_fetch_start", { from, to, date });
  try {
    const res = await fetch(
      `https://api.frankfurter.dev/v1/${date}?base=${from}&symbols=${to}`,
    );
    if (!res.ok) {
      log(requestId, "fx_fetch_failed", { from, to, date, status: res.status });
      cache.set(key, null);
      return null;
    }
    const data = await res.json();
    const rate = data?.rates?.[to];
    if (typeof rate !== "number") {
      log(requestId, "fx_fetch_failed", { from, to, date, reason: "no_rate_in_response" });
      cache.set(key, null);
      return null;
    }
    log(requestId, "fx_fetch_done", { from, to, date, rate, rateDate: data.date });
    cache.set(key, rate);
    return rate;
  } catch (e) {
    log(requestId, "fx_fetch_failed", { from, to, date, error: String(e) });
    cache.set(key, null);
    return null;
  }
}

// Minimal money formatter for the response message (Deno has Intl; cannot import
// the browser money.ts). Mirrors src/lib/money.ts symbol/decimal rules.
const MSG_SYMBOL_OVERRIDE: Record<string, string> = { MYR: "RM", SGD: "S$" };
function fmtMoney(amount: number, currency: string): string {
  const code = currency.toUpperCase();
  let symbol = MSG_SYMBOL_OVERRIDE[code];
  if (!symbol) {
    try {
      symbol = new Intl.NumberFormat("en", { style: "currency", currency: code, currencyDisplay: "narrowSymbol" })
        .formatToParts(0).find((p) => p.type === "currency")?.value ?? code;
    } catch {
      symbol = code;
    }
  }
  let digits = 2;
  try {
    digits = new Intl.NumberFormat("en", { style: "currency", currency: code }).resolvedOptions().maximumFractionDigits;
  } catch { /* keep 2 */ }
  return `${symbol}${Number(amount).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}
```

- [ ] **Step 4: Convert amounts when building inserts**

Replace the inserts builder (line 317-330, the `const inserts = transactions.map((t) => ({ ... }));` block) with this sequential builder that resolves rates:

```typescript
    const accountCurrency = String(settings.default_currency ?? "MYR").toUpperCase();
    const rateCache = new Map<string, number | null>();
    const inserts: Array<Record<string, unknown>> = [];

    for (const t of transactions) {
      const normalizedAt = normalizeTransactionAt(t.transaction_at ?? body.timestamp ?? new Date().toISOString());
      const fromCurrency = (t.currency ?? accountCurrency).toUpperCase();

      let amount = t.amount;
      let currency = accountCurrency;
      let originalAmount: number | null = null;
      let originalCurrency: string | null = null;
      let exchangeRate: number | null = null;
      let needsReview = t.confidence < 0.7;

      if (fromCurrency !== accountCurrency) {
        const rateDate = normalizedAt.slice(0, 10); // YYYY-MM-DD
        const rate = await fetchExchangeRate(fromCurrency, accountCurrency, rateDate, requestId, rateCache);
        if (rate != null) {
          amount = Math.round(t.amount * rate * 100) / 100;
          originalAmount = t.amount;
          originalCurrency = fromCurrency;
          exchangeRate = rate;
        } else {
          // Conversion failed — keep the original amount/currency, flag for review.
          amount = t.amount;
          currency = fromCurrency;
          originalAmount = t.amount;
          originalCurrency = fromCurrency;
          exchangeRate = null;
          needsReview = true;
        }
      }

      inserts.push({
        user_id: userId,
        amount,
        currency,
        original_amount: originalAmount,
        original_currency: originalCurrency,
        exchange_rate: exchangeRate,
        direction: t.direction,
        merchant: t.merchant,
        description: `${t.direction === "expense" ? "Paid" : "Received"} ${amount} - ${t.merchant}`,
        category_id: categoryMap.get(t.category.toLowerCase()) ?? categoryMap.get(`${t.category.toLowerCase()} (${t.direction.toLowerCase()})`) ?? categoryMap.get("others") ?? null,
        source: body.source === "receipt" ? "receipt" as const : t.source,
        confidence: t.confidence,
        raw_text: body.text ?? "(image)",
        needs_review: needsReview,
        transaction_at: normalizedAt,
      });
    }
```

- [ ] **Step 5: Show both currencies in the success message**

Replace the `lines` builder (line 344-349) with a version that reads the converted rows and shows the original in parentheses when present:

```typescript
    const lines = (inserted ?? []).map((t: { amount: number; currency: string; merchant: string; direction: string; category_id: string | null; needs_review: boolean; original_amount: number | null; original_currency: string | null }) => {
      const arrow = t.direction === "expense" ? "−" : "+";
      const cat = t.category_id ? (categoryById.get(t.category_id) ?? "Others") : "Others";
      const review = t.needs_review ? " ⚠︎" : "";
      const main = fmtMoney(Number(t.amount), t.currency);
      const orig = t.original_currency && t.original_amount != null
        ? ` (${fmtMoney(Number(t.original_amount), t.original_currency)})`
        : "";
      return `${arrow}${main}${orig} · ${t.merchant} · ${cat}${review}`;
    });
```

- [ ] **Step 6: Deploy the function and check it type-checks under Deno**

Deploy via the Supabase MCP `deploy_edge_function` (function name `ingest`, the full updated file) OR `npx supabase functions deploy ingest`. A successful deploy confirms the Deno type-check passed (Supabase rejects a function that fails to bundle).

- [ ] **Step 7: Live smoke test — SGD → MYR via AI Parse**

With the dev server running and logged in (account currency MYR), open Add → AI Parse, paste:
```
Alchemist charged you S$7.00 on 9 July 2026, Singapore
```
Click Analyze. Expected: success message shows `−RM… (S$7.00) · Alchemist · …`. Then verify the row via Supabase MCP `execute_sql`:
```sql
select amount, currency, original_amount, original_currency, exchange_rate, needs_review
from transactions where merchant = 'Alchemist' order by created_at desc limit 1;
```
Expected: `currency=MYR`, `original_amount=7`, `original_currency=SGD`, `exchange_rate` ≈ 3.4–3.6, `amount ≈ 7 × exchange_rate`, `needs_review=false`. Delete this test row afterward.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/ingest/index.ts
git commit -m "feat: detect + convert foreign currencies in ingest via Frankfurter"
```

---

### Task 4: Account-currency setting (picker sheet + App wiring)

**Files:**
- Create: `src/components/CurrencySettingsSheet.tsx`
- Modify: `src/pages/SettingsPage.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `SUPPORTED_CURRENCIES` from `../lib/currencies`; `updateSettings` from `../lib/api` (already accepts `default_currency`); the `BottomSheet`, `Card*`, `Button` components used by `DateSettingsSheet`.
- Produces:
  - `App` state `currency: string` + handler `handleSetCurrency(code: string): Promise<void>`, passed to `HomePage` as `accountCurrency` and to `SettingsPage` as `currency` / `onSetCurrency`.
  - `CurrencySettingsSheet` props: `{ open: boolean; onClose: () => void; currency: string; hasTransactions: boolean; onSave: (code: string) => void }`.

- [ ] **Step 1: Create the currency picker sheet**

Create `src/components/CurrencySettingsSheet.tsx` (mirrors `DateSettingsSheet.tsx` structure):

```tsx
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import BottomSheet from "./BottomSheet";
import { Card, CardHeader, CardTitle, CardMeta, CardSeparator, CardFootnote } from "./ui/card";
import { Button } from "./ui/button";
import { SUPPORTED_CURRENCIES } from "@/lib/currencies";

type Props = {
  open: boolean;
  onClose: () => void;
  currency: string;
  hasTransactions: boolean;
  onSave: (code: string) => void;
};

export default function CurrencySettingsSheet({ open, onClose, currency, hasTransactions, onSave }: Props) {
  const [draft, setDraft] = useState(currency);

  useEffect(() => {
    if (open) setDraft(currency);
  }, [open, currency]);

  const dirty = draft !== currency;

  const save = () => {
    onSave(draft);
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose}>
      <h2 className="text-lg font-semibold mb-4">Account Currency</h2>

      <Card>
        <CardHeader>
          <CardTitle>Currency</CardTitle>
          <CardMeta>{draft}</CardMeta>
        </CardHeader>
        <CardSeparator />
        <div className="py-1 max-h-[50vh] overflow-y-auto">
          {SUPPORTED_CURRENCIES.map(({ code, name }) => (
            <button
              key={code}
              type="button"
              onClick={() => setDraft(code)}
              className="w-full flex items-center justify-between px-4 py-3 active:bg-gray-50 transition-colors touch-manipulation"
            >
              <span className="text-[15px] text-gray-800">
                <span className="font-medium">{code}</span>
                <span className="text-gray-400"> · {name}</span>
              </span>
              {draft === code && (
                <span className="w-6 h-6 rounded-full bg-[#4169e1] text-white flex items-center justify-center shrink-0">
                  <Check size={14} strokeWidth={3} />
                </span>
              )}
            </button>
          ))}
        </div>
        {dirty && hasTransactions && (
          <CardFootnote>
            Past transactions stay in their original currency and are excluded from your totals.
          </CardFootnote>
        )}
      </Card>

      <div className="flex gap-2 mt-4">
        <Button variant="secondary" size="lg" className="flex-1" onClick={onClose}>
          Cancel
        </Button>
        <Button size="lg" className="flex-1" onClick={save} disabled={!dirty}>
          Save
        </Button>
      </div>
    </BottomSheet>
  );
}
```

- [ ] **Step 2: Thread account currency through App**

In `src/App.tsx`:

(a) Add state after line 21 (`const [weekStartDay, setWeekStartDay] = useState(0);`):
```typescript
  const [currency, setCurrency] = useState("MYR");
```

(b) In `loadInitialData` (line 37-41), set it from settings — add inside the `.then((s) => { ... })`:
```typescript
      if (s.display_name) setDisplayName(s.display_name);
      setMonthStartDay(s.month_start_day ?? 1);
      setWeekStartDay(s.week_start_day ?? 0);
      setCurrency(s.default_currency ?? "MYR");
```

(c) Add a handler next to `handleSetCycleStart` (after line 97):
```typescript
  const handleSetCurrency = useCallback(async (code: string) => {
    setCurrency(code);
    try {
      await updateSettings({ default_currency: code });
    } catch {
      // keep local value even if the DB update fails
    }
  }, []);
```

(d) Pass to `HomePage` (add prop in the element at line 106-115):
```typescript
                accountCurrency={currency}
```

(e) Pass to `SettingsPage` (modify line 120):
```typescript
          <Route path="/settings" element={<SettingsPage monthStartDay={monthStartDay} weekStartDay={weekStartDay} onSetCycleStart={handleSetCycleStart} onStartTour={startTour} currency={currency} onSetCurrency={handleSetCurrency} />} />
```

- [ ] **Step 3: Add the Currency row to Settings**

In `src/pages/SettingsPage.tsx`:

(a) Add imports — extend the lucide import (line 6) to include `Coins`, and add the sheet import after line 9:
```typescript
import CurrencySettingsSheet from "../components/CurrencySettingsSheet";
```

(b) Extend `SettingsPageProps` (line 27-32):
```typescript
interface SettingsPageProps {
  monthStartDay: number;
  weekStartDay: number;
  onSetCycleStart: (month: number, week: number) => void;
  onStartTour: () => void;
  currency: string;
  onSetCurrency: (code: string) => void;
}
```

(c) Update the destructure (line 34):
```typescript
export default function SettingsPage({ monthStartDay, weekStartDay, onSetCycleStart, onStartTour, currency, onSetCurrency }: SettingsPageProps) {
```

(d) Add sheet-open state next to `showDateSettings` (line 41):
```typescript
  const [showCurrencySettings, setShowCurrencySettings] = useState(false);
```

(e) Add a Currency section in the JSX immediately after the Date Cycle `</section>` (after line 129):
```tsx
      {/* Currency */}
      <section className="mb-6">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Currency</h2>
        <p className="text-xs text-gray-400 mb-2">Foreign captures are converted into this currency.</p>
        <button
          onClick={() => setShowCurrencySettings(true)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3.5 bg-gray-50 rounded-2xl active:bg-gray-100 transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <Coins size={18} className="text-gray-500 shrink-0" />
            <div className="min-w-0 text-left">
              <div className="text-[15px] font-medium">Account Currency</div>
              <div className="text-xs text-gray-500 truncate">{currency}</div>
            </div>
          </div>
          <ChevronRight size={16} className="text-gray-300 shrink-0" />
        </button>
      </section>
```

(f) Render the sheet next to `DateSettingsSheet` (after line 223):
```tsx
      <CurrencySettingsSheet
        open={showCurrencySettings}
        onClose={() => setShowCurrencySettings(false)}
        currency={currency}
        hasTransactions={true}
        onSave={onSetCurrency}
      />
```

- [ ] **Step 4: Type-check + build**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vite build`
Expected: succeeds.

- [ ] **Step 5: Live check — change currency and confirm persistence**

With the dev server running: Settings → Account Currency → pick SGD → confirm the change warning appears (since transactions exist) → Save. Reload the page; the Settings row should still read `SGD`. Change it back to `MYR` and Save.

- [ ] **Step 6: Commit**

```bash
git add src/components/CurrencySettingsSheet.tsx src/pages/SettingsPage.tsx src/App.tsx
git commit -m "feat: account-currency picker in settings, threaded through App"
```

---

### Task 5: Dashboard — currency-aware display, total filter, foreign badge, FX detail, retry

**Files:**
- Modify: `src/pages/HomePage.tsx`
- Modify: `src/lib/api.ts` (extend `updateTransaction` allowed columns)
- Create: `src/lib/fx.ts` (client retry FX helper)

**Interfaces:**
- Consumes: `moneyFmt` / `formatTransactionAmount` (now currency-aware) from `../lib/money`; `accountCurrency` prop from App; `updateTransaction` from `../lib/api`.
- Produces: `fetchRate(from: string, to: string, date: string): Promise<number | null>` and `convertAmount(amount: number, rate: number): number` in `src/lib/fx.ts`.

- [ ] **Step 1: Create the client FX helper**

Create `src/lib/fx.ts`:

```typescript
// Client-side Frankfurter fetch, used only by the "Retry conversion" action on
// records that failed conversion at capture time. The API is CORS-open.
export async function fetchRate(from: string, to: string, date: string): Promise<number | null> {
  if (from === to) return 1;
  try {
    const res = await fetch(`https://api.frankfurter.dev/v1/${date}?base=${from}&symbols=${to}`);
    if (!res.ok) return null;
    const data = await res.json();
    const rate = data?.rates?.[to];
    return typeof rate === "number" ? rate : null;
  } catch {
    return null;
  }
}

export function convertAmount(amount: number, rate: number): number {
  return Math.round(amount * rate * 100) / 100;
}
```

- [ ] **Step 2: Allow the new columns in updateTransaction**

In `src/lib/api.ts`, extend the `updates` Pick in `updateTransaction` (line 89-91) to include the currency columns:

```typescript
export async function updateTransaction(
  id: string,
  updates: Partial<Pick<Transaction, "amount" | "merchant" | "description" | "category_id" | "direction" | "needs_review" | "transaction_at" | "currency" | "original_amount" | "original_currency" | "exchange_rate">>
): Promise<Transaction> {
```

- [ ] **Step 3: Accept the accountCurrency prop**

In `src/pages/HomePage.tsx`:

(a) Add to `HomePageProps` (after `refreshKey: number;`, line ~42):
```typescript
  accountCurrency: string;
```

(b) Add to the destructure (line 44) — append `, accountCurrency` before `}: HomePageProps`.

(c) Add the fx + currencies imports near the top (after line 17's money import):
```typescript
import { fetchRate, convertAmount } from "../lib/fx";
```

- [ ] **Step 4: Filter the headline total to account-currency records**

In `src/pages/HomePage.tsx`, change `summaryTotal` (line 229-232) to sum only account-currency records:

```typescript
  const summaryTotal = useMemo(
    () => selectedTransactions
      .filter((t) => (t.currency ?? accountCurrency) === accountCurrency)
      .reduce((sum, t) => sum + Number(t.amount), 0),
    [selectedTransactions, accountCurrency]
  );
```

Change the headline `moneyFmt(total)` call (line 446) to pass the account currency:
```typescript
            {moneyFmt(total, accountCurrency)}
```

Also update the chart-modal header `moneyFmt(total)` (line 813) and any other bare `moneyFmt(total)` in this file to `moneyFmt(total, accountCurrency)`.

- [ ] **Step 5: Compute foreign records + badge, render under the dots**

In `src/pages/HomePage.tsx`, add a memo after `summaryTotal` (after line 232):

```typescript
  const foreignRecords = useMemo(
    () => selectedTransactions.filter((t) => (t.currency ?? accountCurrency) !== accountCurrency),
    [selectedTransactions, accountCurrency]
  );

  const foreignBadge = useMemo(() => {
    if (foreignRecords.length === 0) return null;
    const codes = new Set(foreignRecords.map((t) => t.currency));
    if (codes.size === 1) return `+ ${foreignRecords.length} in ${[...codes][0]}`;
    return `+ ${foreignRecords.length} in ${codes.size} currencies`;
  }, [foreignRecords]);

  const recentSectionRef = useRef<HTMLDivElement | null>(null);
```

Render the badge inside the hero, immediately after the period-dots `</div>` (after line 482, before the closing `</motion.div>`):

```tsx
        {foreignBadge && (
          <button
            onClick={() => recentSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="mt-2 text-xs text-gray-400 underline decoration-dotted underline-offset-4 active:text-gray-600 transition-colors"
          >
            {foreignBadge} · not in total
          </button>
        )}
```

Attach the ref to the Recent section wrapper. Change the opening tag of the "Recent Transactions" block (line 533, `<div>`) to:
```tsx
      <div ref={recentSectionRef}>
```

- [ ] **Step 6: Format each transaction row + group totals in their own currency**

In `src/pages/HomePage.tsx`:

(a) The per-row amount (line 636) — pass the record's currency:
```typescript
                                  {formatTransactionAmount(Number(t.amount), t.direction, t.currency ?? accountCurrency)}
```

(b) The group/day total (line 547) sums a single day's records which may mix currencies; scope it to account currency for correctness. Change `groupedTransactions`' `dayTotal` (line 266) to only sum matching-currency records:
```typescript
      dayTotal: txns.filter((t) => (t.currency ?? accountCurrency) === accountCurrency).reduce((s, t) => s + Number(t.amount), 0),
```
and the group header formatter (line 547):
```typescript
                    {formatTransactionAmount(group.dayTotal, recentView, accountCurrency)}
```
Add `accountCurrency` to the `groupedTransactions` memo dependency array (line 268).

(c) The chart-modal category rows (line 852, 871) and the detail-panel Amount row (line 666) — pass `t.currency ?? accountCurrency` to their `moneyFmt` / `formatTransactionAmount` calls the same way.

- [ ] **Step 7: Add FX rows + Retry to the detail panel**

In `src/pages/HomePage.tsx`, inside the detail panel (the `detailId === t.id` block, lines 645-677), add — after the existing Amount row (after line 668) — conditional FX rows and a retry action. Insert:

```tsx
                              {t.original_currency && t.original_amount != null && (
                                <>
                                  <div className="flex justify-between">
                                    <span className="text-gray-400">Original</span>
                                    <span>{moneyFmt(Number(t.original_amount), t.original_currency)}</span>
                                  </div>
                                  {t.exchange_rate != null ? (
                                    <div className="flex justify-between">
                                      <span className="text-gray-400">Rate</span>
                                      <span>1 {t.original_currency} = {t.exchange_rate} {accountCurrency}</span>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => void handleRetryConversion(t)}
                                      className="w-full mt-1 h-9 rounded-lg bg-[#4169e1] text-white text-xs font-medium active:bg-[#3151c1] transition-colors"
                                    >
                                      Retry conversion
                                    </button>
                                  )}
                                </>
                              )}
```

Add the `handleRetryConversion` handler alongside the other handlers (e.g. after `handleDelete`, line 169):

```typescript
  const handleRetryConversion = async (t: Transaction) => {
    if (!t.original_currency || t.original_amount == null) return;
    const rate = await fetchRate(t.original_currency, accountCurrency, t.transaction_at.slice(0, 10));
    if (rate == null) {
      setCaptureStatus(`Still couldn't fetch a rate for ${t.original_currency}. Try again later.`);
      return;
    }
    const updated = await updateTransaction(t.id, {
      amount: convertAmount(Number(t.original_amount), rate),
      currency: accountCurrency,
      exchange_rate: rate,
      needs_review: false,
    });
    setTransactions((prev) => prev.map((x) => (x.id === t.id ? updated : x)));
    onDataChanged();
  };
```

- [ ] **Step 8: Type-check + build**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vite build`
Expected: succeeds.

- [ ] **Step 9: Live check — dashboard multi-currency behavior**

With the dev server running (account = MYR): capture the SGD test line from Task 3 Step 7. Confirm on the dashboard: the SGD-converted record appears in the list showing `−RM…` (converted); the headline total includes it (it's now an MYR record); tapping it expands to show `Original — S$7.00` and `Rate — 1 SGD = … MYR`. Then, to exercise the badge + retry: temporarily switch account currency to SGD (Settings), reload — the old MYR records now read as foreign; confirm the `+ N in MYR · not in total` badge appears under the dots and the headline total drops to only SGD records. Switch back to MYR. Delete any test rows.

- [ ] **Step 10: Commit**

```bash
git add src/pages/HomePage.tsx src/lib/api.ts src/lib/fx.ts
git commit -m "feat: currency-aware dashboard totals, foreign badge, FX detail + retry"
```

---

### Task 6: Transactions page — currency-aware rows + FX detail

**Files:**
- Modify: `src/pages/TransactionsPage.tsx`

**Interfaces:**
- Consumes: currency-aware `formatTransactionAmount` / `moneyFmt`; the `accountCurrency` value (this page currently has no App-provided currency — see Step 1).

- [ ] **Step 1: Obtain the account currency on this page**

`TransactionsPage` is rendered in `App.tsx` (line 118) without currency props. Add the prop rather than refetching. In `src/App.tsx` line 118, add `accountCurrency={currency}`:
```tsx
          <Route path="/transactions" element={<TransactionsPage categories={categories} monthStartDay={monthStartDay} weekStartDay={weekStartDay} accountCurrency={currency} />} />
```
Then in `src/pages/TransactionsPage.tsx`, add `accountCurrency: string;` to its props interface and destructure it (match the existing props pattern in that file's component signature).

- [ ] **Step 2: Format per-row amounts in their own currency**

In `src/pages/TransactionsPage.tsx`, update the row amount (line 616):
```typescript
                              {formatTransactionAmount(Number(t.amount), t.direction, t.currency ?? accountCurrency)}
```

- [ ] **Step 3: Scope the period + day totals to the account currency**

The `periodTotal` (line 448) and `group.dayTotal` (line 522) sum amounts that may mix currencies. Filter both to account-currency records (find where each is computed and add `.filter((t) => (t.currency ?? accountCurrency) === accountCurrency)` before the reduce), and pass `accountCurrency` as the third arg to their `formatTransactionAmount` calls (lines 448, 522).

- [ ] **Step 4: Add FX rows to the detail panel**

In the detail panel block (`detailId === t.id`, starting line 624), add the same conditional Original / Rate rows used in Task 5 Step 7 (no retry button here — retry lives on the dashboard):
```tsx
                        {t.original_currency && t.original_amount != null && (
                          <>
                            <div className="flex justify-between">
                              <span className="text-gray-400">Original</span>
                              <span>{moneyFmt(Number(t.original_amount), t.original_currency)}</span>
                            </div>
                            {t.exchange_rate != null && (
                              <div className="flex justify-between">
                                <span className="text-gray-400">Rate</span>
                                <span>1 {t.original_currency} = {t.exchange_rate} {accountCurrency}</span>
                              </div>
                            )}
                          </>
                        )}
```
Add `moneyFmt` to the money import at line 13 if not already imported:
```typescript
import { formatTransactionAmount, getTransactionAmountClass, moneyFmt } from "../lib/money";
```
Place the FX rows adjacent to the existing detail fields, matching that panel's row markup.

- [ ] **Step 5: Type-check + build**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vite build`
Expected: succeeds.

- [ ] **Step 6: Live check — transactions list**

With the dev server running and a converted SGD record present: open the Transactions tab. Confirm the row shows the converted `RM…` amount and tapping it reveals Original / Rate rows. Confirm totals read correctly. Delete test rows.

- [ ] **Step 7: Commit**

```bash
git add src/pages/TransactionsPage.tsx src/App.tsx
git commit -m "feat: currency-aware amounts + FX detail on transactions page"
```

---

## Self-Review

**Spec coverage:**
- Schema (3 nullable columns) → Task 1 ✓
- Account-currency setting + change warning → Task 4 ✓
- Ingest currency detection (prompt + Zod) → Task 3 Steps 1-2 ✓
- Server-side conversion + transaction-date rate + in-request cache → Task 3 Steps 3-4 ✓
- FX-failure flagged-for-review path → Task 3 Step 4 ✓
- Success message shows both currencies → Task 3 Step 5 ✓
- `Intl`-based formatter + symbol overrides + zero-decimal → Task 2 ✓
- Headline total excludes foreign + badge copy rule → Task 5 Steps 4-5 ✓
- Detail-panel Original/Rate rows → Task 5 Step 7, Task 6 Step 4 ✓
- Retry conversion (client-side) → Task 5 Steps 1-2, 7 ✓
- iOS-shortcut path unchanged (server-side conversion) → covered by Task 3 (no client change to request shape) ✓
- Verification pass (SGD happy path, zero-decimal, failed-FX, currency switch, shortcut) → distributed across Task 3 Step 7, Task 4 Step 5, Task 5 Step 9; final end-to-end below.

**Placeholder scan:** No TBD/TODO; every code step shows complete code.

**Type consistency:** `fetchRate`/`convertAmount` (fx.ts) match their uses in Task 5; `Transaction` optional fields defined in Task 1 are consumed consistently (`original_amount`, `original_currency`, `exchange_rate`); `accountCurrency` prop added to both `HomePage` (Task 4) and `TransactionsPage` (Task 6) before use; `updateTransaction` column list (Task 5 Step 2) covers exactly the fields the retry handler writes.

## Final End-to-End Verification (after all tasks)

1. `npx tsc --noEmit` and `npx vite build` — both clean.
2. SGD receipt (the provided screenshot: 7 SGD · Alchemist · Singapore · 9 Jul 2026) via AI Parse → converted MYR row, FX detail rows, included in total.
3. JPY or IDR capture → zero-decimal display (no `.00`), correct conversion.
4. VND capture (unsupported) → saved flagged, excluded from total, `+ 1 in VND` badge, Retry available (and reports failure since VND stays unsupported).
5. Switch account currency MYR↔SGD → warning shows, old records keep their currency and drop from the total, badge appears.
6. `curl` shaped like the iOS Shortcut POST against the deployed ingest function with an SGD text → converted row saved server-side.
7. Delete all test rows; restore account currency to MYR.
