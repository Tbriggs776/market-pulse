-- Pass 11A: Portfolio positions
-- Apply via Supabase SQL Editor (or `supabase db push` if wired up).

create table if not exists public.positions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  symbol               text not null,
  name                 text,
  asset_type           text not null check (asset_type in ('stock', 'etf', 'mutual_fund')),
  shares               numeric(20, 8) not null check (shares > 0),
  cost_basis_per_share numeric(20, 6) not null check (cost_basis_per_share >= 0),
  purchase_date        date,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (user_id, symbol, asset_type)
);

create index if not exists positions_user_id_idx on public.positions(user_id);

create or replace function public.positions_touch()
returns trigger
language plpgsql
as $$
begin
  new.symbol := upper(new.symbol);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists positions_touch_trg on public.positions;
create trigger positions_touch_trg
  before insert or update on public.positions
  for each row execute function public.positions_touch();

alter table public.positions enable row level security;

drop policy if exists "positions_select_own" on public.positions;
create policy "positions_select_own"
  on public.positions for select
  using (auth.uid() = user_id);

drop policy if exists "positions_insert_own" on public.positions;
create policy "positions_insert_own"
  on public.positions for insert
  with check (auth.uid() = user_id);

drop policy if exists "positions_update_own" on public.positions;
create policy "positions_update_own"
  on public.positions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "positions_delete_own" on public.positions;
create policy "positions_delete_own"
  on public.positions for delete
  using (auth.uid() = user_id);
