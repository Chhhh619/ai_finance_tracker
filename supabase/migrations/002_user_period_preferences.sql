-- Add per-user preferences for when a "month" and a "week" start.
-- month_start_day: 1..31 (cycles in short months clamp to the last day)
-- week_start_day:  0..6 (0 = Sunday, 6 = Saturday)

alter table public.user_settings
  add column month_start_day smallint not null default 1
    check (month_start_day between 1 and 31),
  add column week_start_day smallint not null default 0
    check (week_start_day between 0 and 6);
