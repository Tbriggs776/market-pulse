-- Pass 13: Tax-lot-aware selling.
-- Adds a lot_method column to transactions. Only meaningful on SELL rows;
-- BUY and DIVIDEND ignore it. Legacy sells (null) are treated as
-- average_cost by the engine so historical realized P&L doesn't shift.

alter table public.transactions
  add column if not exists lot_method text;

-- Intentionally NOT adding a check constraint yet -- we want room to add
-- methods (specific lot selection) without another migration. The engine
-- validates the value; unknown values fall back to the asset-type default.
