-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- Categories table
create table public.categories (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#9298a6',
  icon text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.categories enable row level security;

create policy "Users can read own categories"
  on public.categories for select
  using (auth.uid() = user_id);

create policy "Users can insert own categories"
  on public.categories for insert
  with check (auth.uid() = user_id);

create policy "Users can update own categories"
  on public.categories for update
  using (auth.uid() = user_id);

create policy "Users can delete own categories"
  on public.categories for delete
  using (auth.uid() = user_id);

-- Transactions table
create type public.transaction_direction as enum ('expense', 'income');
create type public.transaction_source as enum ('ewallet', 'bank', 'manual', 'receipt');

create table public.transactions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount decimal(12,2) not null check (amount > 0),
  currency text not null default 'MYR',
  direction public.transaction_direction not null default 'expense',
  merchant text not null,
  description text,
  category_id uuid references public.categories(id) on delete set null,
  source public.transaction_source not null default 'manual',
  confidence float not null default 1.0 check (confidence >= 0 and confidence <= 1),
  raw_text text,
  needs_review boolean not null default false,
  created_at timestamptz not null default now(),
  transaction_at timestamptz not null default now()
);

alter table public.transactions enable row level security;

create policy "Users can read own transactions"
  on public.transactions for select
  using (auth.uid() = user_id);

create policy "Users can insert own transactions"
  on public.transactions for insert
  with check (auth.uid() = user_id);

create policy "Users can update own transactions"
  on public.transactions for update
  using (auth.uid() = user_id);

create policy "Users can delete own transactions"
  on public.transactions for delete
  using (auth.uid() = user_id);

create index idx_transactions_user_date on public.transactions(user_id, transaction_at desc);
create index idx_transactions_needs_review on public.transactions(user_id, needs_review) where needs_review = true;

-- User settings table
create type public.duplicate_handling as enum ('all', 'expenses_only', 'smart_merge');

create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  duplicate_handling public.duplicate_handling not null default 'expenses_only',
  default_currency text not null default 'MYR',
  ai_model text not null default 'gemini-2.0-flash',
  categories_order jsonb,
  api_key text unique default encode(gen_random_bytes(32), 'hex'),
  created_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy "Users can read own settings"
  on public.user_settings for select
  using (auth.uid() = user_id);

create policy "Users can update own settings"
  on public.user_settings for update
  using (auth.uid() = user_id);

-- Auto-create settings and default categories when a user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  -- Create default settings
  insert into public.user_settings (user_id) values (new.id);

  -- Seed default categories
  insert into public.categories (user_id, name, color, is_default) values
    (new.id, 'Food', '#ff8d61', true),
    (new.id, 'Drinks', '#3cbde6', true),
    (new.id, 'Groceries', '#59b860', true),
    (new.id, 'Transport', '#5075ff', true),
    (new.id, 'Bills', '#f2b34a', true),
    (new.id, 'Shopping', '#d873d8', true),
    (new.id, 'Health', '#00a8a0', true),
    (new.id, 'Transfer', '#1882d9', true),
    (new.id, 'Others', '#9298a6', true);

  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
