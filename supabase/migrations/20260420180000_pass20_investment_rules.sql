-- Pass 20: Investment Rules + AI-curated suggestions
-- (Schema documented for the record; Tyler applied this manually.)

create table if not exists public.investment_rules (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  goal                 text,
  time_horizon         text,
  risk_tolerance       text,
  income_need          text,
  experience           text,
  account_type         text,
  capital_range        text,
  exclusions           text,
  onboarding_status    text not null default 'pending'
    check (onboarding_status in ('pending', 'completed', 'dismissed')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create or replace function public.investment_rules_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end; $$;

drop trigger if exists investment_rules_touch_trg on public.investment_rules;
create trigger investment_rules_touch_trg
  before update on public.investment_rules
  for each row execute function public.investment_rules_touch();

alter table public.investment_rules enable row level security;

drop policy if exists "rules_select_own" on public.investment_rules;
create policy "rules_select_own" on public.investment_rules for select
  using (auth.uid() = user_id);
drop policy if exists "rules_insert_own" on public.investment_rules;
create policy "rules_insert_own" on public.investment_rules for insert
  with check (auth.uid() = user_id);
drop policy if exists "rules_update_own" on public.investment_rules;
create policy "rules_update_own" on public.investment_rules for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "rules_delete_own" on public.investment_rules;
create policy "rules_delete_own" on public.investment_rules for delete
  using (auth.uid() = user_id);

create table if not exists public.investment_suggestions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  symbol        text not null,
  asset_type    text,
  name          text,
  category      text,
  rationale     text,
  risk_fit      text,
  generated_at  timestamptz not null default now()
);

create index if not exists investment_suggestions_user_idx
  on public.investment_suggestions(user_id, generated_at desc);

alter table public.investment_suggestions enable row level security;

drop policy if exists "suggestions_select_own" on public.investment_suggestions;
create policy "suggestions_select_own" on public.investment_suggestions for select
  using (auth.uid() = user_id);
drop policy if exists "suggestions_insert_own" on public.investment_suggestions;
create policy "suggestions_insert_own" on public.investment_suggestions for insert
  with check (auth.uid() = user_id);
drop policy if exists "suggestions_delete_own" on public.investment_suggestions;
create policy "suggestions_delete_own" on public.investment_suggestions for delete
  using (auth.uid() = user_id);
