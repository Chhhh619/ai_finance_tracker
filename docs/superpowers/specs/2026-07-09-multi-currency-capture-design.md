# Multi-Currency Capture — Design

**Date:** 2026-07-09
**Status:** Approved

## Problem

The app assumes every captured amount is in MYR. A user whose account is MYR
but who spends abroad (e.g. pays SGD in Singapore via Wise) photographs an SGD
receipt, and the AI records "7" as RM7.00 — silently wrong by ~3.5×. There is
no way to (a) tell the app what currency the account thinks in, or (b) convert a
foreign-currency capture into that currency before saving.

## Goal

Let the user set an account currency. When AI capture detects a *different*
currency, convert the amount to the account currency using the exchange rate for
the transaction's date, save the converted amount as the record's primary
amount, and preserve the original amount/currency/rate for transparency.

Example: account = MYR, receipt = "7 SGD" on 9 Jul 2026 → save RM24.37
(7 × 3.481), with original S$7.00 and the rate kept in the record's detail view.

## Decisions (made with user)

1. **Record shape:** store the converted amount as the primary `amount` (in the
   account currency), plus the original amount, original currency, and the
   exchange rate used. The FX detail lives in the tap-to-expand detail panel —
   **not** crammed into the headline.
2. **FX source:** Frankfurter API — free, keyless, no signup. Serves European
   Central Bank reference rates for ~31 currencies (SGD, USD, THB, IDR, JPY,
   EUR, GBP, …), updated each ECB working day.
3. **Rate date:** the **transaction date** (historical lookup). Frankfurter
   auto-falls-back to the previous business day for weekends/holidays.
4. **FX failure** (network error, or currency outside Frankfurter's set): **save
   flagged for review** — keep the original amount/currency, leave the converted
   amount and rate empty, set `needs_review = true`. The capture is never lost.
5. **Scope:** **AI capture only.** The manual add form is unchanged (amounts are
   entered directly in the account currency).
6. **Changing account currency later:** affects new captures and display going
   forward only. Existing records keep their stored currency untouched; the
   settings screen warns that past transactions stay in their original currency
   and are excluded from totals.
7. **Mixed-currency totals:** the headline total sums **only** records whose
   `currency` equals the account currency — always exactly correct, never mixing
   units. When the viewed period also contains foreign/unconverted records, a
   small tappable line appears under the hero (e.g. "+ 2 in SGD") revealing them.
8. **Conversion location:** **inside the `ingest` Edge Function** (server-side),
   so all capture paths — browser AI Parse, receipt photo, and the iOS Shortcut
   — go through one code path with no duplication and no client changes to the
   request shape (offline queue stays compatible).
9. **Zero-decimal currencies:** handled at **display** time via
   `Intl.NumberFormat({ style: "currency" })`, which knows each currency's
   decimal convention automatically (¥1,000 and Rp50,000 with no decimals;
   RM7.00 / S$7.00 with two). Storage is unaffected.

## Design

### Schema — new migration `005_multi_currency.sql`

Three **nullable** columns on `transactions`:

- `original_amount numeric` — amount as printed on the receipt (e.g. `7`).
- `original_currency text` — detected ISO 4217 code (e.g. `SGD`).
- `exchange_rate numeric` — rate applied, expressed as
  `1 original_currency = <rate> account_currency` (e.g. `3.4810`).

All three are `NULL` for normal domestic captures and for manually-added
transactions. The existing `amount decimal(12,2)` and `currency text` columns
keep their meanings: `amount` is denominated in `currency`. `decimal(12,2)`
already stores whole-number foreign amounts fine (JPY `1000` → `1000.00`).

No RLS changes: the existing per-user policies on `transactions` already cover
new columns. Migration only `ALTER TABLE ... ADD COLUMN` — safe on existing rows.

### Account-currency setting

`user_settings.default_currency` already exists (default `'MYR'`) and is already
in the granted-update column list (migration `004`). Work needed:

- **Settings UI:** a "Currency" row (next to "Date Settings") opens a picker
  sheet listing the ~31 Frankfurter-supported currencies with name + symbol.
  Saves via the existing `updateSettings({ default_currency })` path.
- **Change warning:** when the user picks a currency different from the current
  one *and* they have existing transactions, show an inline note in the sheet:
  "Past transactions stay in their original currency and are excluded from
  totals." No history rewrite.
- **Wiring:** `App.tsx` already fetches `user_settings`; add `default_currency`
  to the same state and pass it down to `HomePage` (and the detail/list
  formatting) the way `monthStartDay` / `weekStartDay` already flow.

### Ingest function (`supabase/functions/ingest/index.ts`)

**Prompt change** — currency detection:

- Instruct Gemini to report the ISO 4217 currency code inferred from symbols
  (S$, ฿, Rp, ¥, RM…), explicit codes, store location, or language, defaulting
  to the account currency when genuinely ambiguous.
- Remove the current "amount … in MYR" instruction; `amount` becomes "the final
  total **as printed**, in the currency you detected."

**Zod change** — `transactionSchema` gains
`currency: z.string().length(3).transform(s => s.toUpperCase())` (validate LLM
output; never trust it blindly, per the ingest rules).

**Conversion flow** (after extraction, before insert), given the resolved
account currency from `user_settings.default_currency`:

- Detected currency **==** account currency → insert exactly as today
  (`original_*` and `exchange_rate` all `NULL`).
- Detected currency **!=** account currency → fetch
  `GET https://api.frankfurter.dev/v1/{txnDate}?base={FROM}&symbols={TO}`
  (response: `{ base, date, rates: { TO: <rate> } }`). Compute
  `amount = round(original_amount × rate, 2)`; insert with
  `currency = account currency`, `original_amount`, `original_currency`,
  `exchange_rate = rate`. Cache the `{FROM,date} → rate` result **within the
  request** so a multi-transaction capture fetches each currency/date once.
- Fetch fails (non-200, network throw) or currency unsupported by Frankfurter →
  insert with `amount = original_amount`, `currency = original_currency`,
  `original_amount`/`original_currency` set, `exchange_rate = NULL`,
  `needs_review = true`. Never drop the capture.

**Logging:** add `fx_fetch_start` / `fx_fetch_done` / `fx_fetch_failed` stages
following the existing `log(requestId, stage, extra)` pattern.

**Success message:** show both currencies, e.g.
`−RM24.37 (S$7.00) · Alchemist · Eating out`.

### Display

- **`src/lib/money.ts`** — replace the hardcoded-`RM` formatter with
  `moneyFmt(amount, currency = accountCurrency)` built on
  `Intl.NumberFormat("en-MY", { style: "currency", currency, currencyDisplay:
  "narrowSymbol" })`. A small override map fixes symbols where the narrow symbol
  is ambiguous or non-preferred (`MYR → "RM"`, `SGD → "S$"`); decimal places come
  straight from `Intl`. `formatTransactionAmount` / `getTransactionAmountClass`
  gain a `currency` argument threaded from each record.
- **Headline total** (`HomePage`): sum only `selectedTransactions` where
  `t.currency === accountCurrency`. When the period contains records with a
  different currency, render a tappable line under the pagination dots that
  reveals/scrolls to those records. Copy rule: one foreign currency →
  "+ {n} in {CODE}" (e.g. "+ 2 in SGD"); more than one foreign currency →
  "+ {n} in {m} currencies".
- **Transaction rows & detail panel:** each row formats its own amount with its
  own `currency`. The tap-to-expand detail panel gains two rows **only when
  `original_currency` is present**: `Original — S$7.00` and
  `Rate — 1 SGD = 3.4810 MYR`.
- **Unconverted flagged records:** shown in-list in their own currency with the
  existing review marker; the detail panel offers a **Retry conversion** action
  (client-side Frankfurter fetch — the API is CORS-open — then the existing
  `updateTransaction` to write the converted amount + audit columns). Normal
  long-press edit still available for manual correction.

### Edge cases

- **Zero-decimal currencies** (JPY, KRW): `Intl` renders them with no
  decimals automatically; storage is a whole number in `decimal(12,2)`.
  (Note: IDR is *not* zero-decimal — its ISO 4217 minor unit is 2, so `Intl`
  renders it with 2 decimals. Only currencies with an ISO minor unit of 0 hit
  this branch.)
- **Same-day / weekend transactions:** Frankfurter returns the most recent
  published rate; the response's `date` field reports the actual rate date.
- **Currencies outside Frankfurter's ~31** (e.g. VND, TWD): take the
  flagged-for-review path. Documented v1 limitation.
- **Gemini misreads the currency:** fixable via the existing long-press edit;
  confidence/`needs_review` rules are unchanged.
- **Rounding:** convert with `Math.round(x * 100) / 100`; store 2dp in the
  account currency regardless of the source currency's decimals.

## Verification

No automated test rig exists. Gate: `tsc --noEmit` + `vite build`, then a live
pass in the running app:

1. **SGD → MYR (happy path):** capture the provided screenshot (7 SGD ·
   Alchemist · Singapore · 9 Jul 2026 12:59) via AI Parse. Confirm the saved row
   has `amount ≈ 7 × rate` in MYR, `currency = MYR`, `original_amount = 7`,
   `original_currency = SGD`, `exchange_rate` set; detail panel shows the
   Original and Rate rows; headline total includes it as an MYR record.
2. **Zero-decimal branch:** a JPY or KRW receipt — confirm no-decimal display
   and correct conversion.
3. **Failed-FX branch:** a VND (unsupported) receipt — confirm it saves flagged,
   is excluded from the headline total, shows the "+ 1 in VND" badge, and the
   detail panel's Retry action works after switching to a supported currency.
4. **Currency setting:** change account currency, confirm the warning appears and
   that old records stay in their original currency and drop out of the total.
5. **iOS-shortcut path:** a curl shaped like the Shortcut's POST against the
   deployed function to confirm server-side conversion works with no client.

## Alternatives considered

- **Client-side conversion after ingest returns** — rejected: breaks the iOS
  Shortcut path entirely (no client logic there) and creates a two-phase write
  that can strand half-converted records.
- **Background job converting flagged records on a schedule** — rejected: totals
  lag reality, and it's a cron+retry system for what is a ~200ms inline fetch.
- **Store original only, convert on every display** — rejected: totals drift as
  rates change; historical spending would be revalued daily.
- **Ask Gemini to convert** — rejected: LLM rates are training-data-stale and
  unverifiable; unacceptable for money.
- **ExchangeRate-API** instead of Frankfurter — more currencies but adds a key
  to manage and a monthly quota; deferred unless an unsupported currency becomes
  a real need.
