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
