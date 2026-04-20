-- Pass 12: Transactions as the source of truth
-- Apply via Supabase SQL Editor.
--
-- Positions become a derived view computed from chronological transaction replay.
-- The `positions` table is preserved intentionally for rollback safety; a later
-- pass will drop it once the transaction-based flow has baked.

create table if not exists public.transactions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  symbol            text not null,
  name              text,
  asset_type        text not null check (asset_type in ('stock', 'etf', 'mutual_fund')),
  transaction_type  text not null check (transaction_type in ('buy', 'sell', 'dividend')),
  shares            numeric(20, 8),
  price_per_share   numeric(20, 6),
  total_amount      numeric(20, 2),
  occurred_at       date not null,
  notes             text,
  source            text not null default 'manual',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists transactions_user_id_idx on public.transactions(user_id);
create index if not exists transactions_user_symbol_idx
  on public.transactions(user_id, symbol, asset_type, occurred_at);

create or replace function public.transactions_touch()
returns trigger
language plpgsql
as $$
begin
  new.symbol := upper(new.symbol);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists transactions_touch_trg on public.transactions;
create trigger transactions_touch_trg
  before insert or update on public.transactions
  for each row execute function public.transactions_touch();

alter table public.transactions enable row level security;

drop policy if exists "transactions_select_own" on public.transactions;
create policy "transactions_select_own"
  on public.transactions for select
  using (auth.uid() = user_id);

drop policy if exists "transactions_insert_own" on public.transactions;
create policy "transactions_insert_own"
  on public.transactions for insert
  with check (auth.uid() = user_id);

drop policy if exists "transactions_update_own" on public.transactions;
create policy "transactions_update_own"
  on public.transactions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "transactions_delete_own" on public.transactions;
create policy "transactions_delete_own"
  on public.transactions for delete
  using (auth.uid() = user_id);

-- Backfill: each existing position becomes a single BUY transaction.
-- Uses purchase_date when available, else the position's created_at.
-- Safe to re-run: the NOT EXISTS guard prevents duplicates if a transaction
-- with source='backfill_pass12' already exists for a position.
insert into public.transactions (
  user_id, symbol, name, asset_type, transaction_type,
  shares, price_per_share, total_amount, occurred_at, notes, source, created_at
)
select
  p.user_id,
  p.symbol,
  p.name,
  p.asset_type,
  'buy',
  p.shares,
  p.cost_basis_per_share,
  round((p.shares * p.cost_basis_per_share)::numeric, 2),
  coalesce(p.purchase_date, p.created_at::date),
  p.notes,
  'backfill_pass12',
  p.created_at
from public.positions p
where not exists (
  select 1 from public.transactions t
  where t.user_id = p.user_id
    and t.symbol = p.symbol
    and t.asset_type = p.asset_type
    and t.source = 'backfill_pass12'
);
