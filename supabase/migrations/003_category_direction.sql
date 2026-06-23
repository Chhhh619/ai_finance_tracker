alter table public.categories
  add column if not exists direction public.transaction_direction not null default 'expense';

update public.categories
set direction = 'expense'
where direction is null;

create or replace function public.handle_new_user()
returns trigger as $$
begin
  -- Create default settings
  insert into public.user_settings (user_id) values (new.id);

  -- Seed default categories
  insert into public.categories (user_id, name, color, is_default, direction) values
    (new.id, 'Food', '#ff8d61', true, 'expense'),
    (new.id, 'Drinks', '#3cbde6', true, 'expense'),
    (new.id, 'Groceries', '#59b860', true, 'expense'),
    (new.id, 'Transport', '#5075ff', true, 'expense'),
    (new.id, 'Bills', '#f2b34a', true, 'expense'),
    (new.id, 'Shopping', '#d873d8', true, 'expense'),
    (new.id, 'Health', '#00a8a0', true, 'expense'),
    (new.id, 'Transfer', '#1882d9', true, 'expense'),
    (new.id, 'Others', '#9298a6', true, 'expense');

  return new;
end;
$$ language plpgsql security definer;