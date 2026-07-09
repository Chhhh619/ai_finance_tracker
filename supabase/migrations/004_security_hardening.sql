-- Security hardening (audit 2026-07-07)

-- 1. Capture schema drift: display_name exists in prod but had no migration.
alter table public.user_settings
  add column if not exists display_name text;

-- 2. Lock down user_settings updates to safe columns only.
--    Clients could previously overwrite their own api_key (the sole ingest
--    credential) with an arbitrary weak value via PostgREST.
revoke update on table public.user_settings from anon, authenticated;
grant update (display_name, default_currency, ai_model, categories_order,
              month_start_day, week_start_day)
  on public.user_settings to authenticated;

-- 3. Pin search_path on the signup trigger function (advisor: mutable search_path).
--    Body already schema-qualifies all references.
alter function public.handle_new_user() set search_path = '';

-- 4. SECURITY DEFINER functions must not be callable by client roles via RPC.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
