-- Phase 2: Strategy marketplace tables.
-- Strategies are multi-vault recipes, used for the Strategy tab.
-- Pockets do NOT reference strategies (pocket = 1 vault constraint).
-- Run in Supabase SQL editor.

-- ── Strategies ─────────────────────────────────────────────────────────────
create table if not exists public.strategies (
  id              uuid primary key default gen_random_uuid(),
  creator_id      uuid references public.users(id) on delete set null,
  name            text not null,
  description     text,
  risk_level      text check (risk_level in ('low', 'medium', 'high')),
  visibility      text not null default 'private'
                     check (visibility in ('private', 'unlisted', 'public')),
  is_system       boolean not null default false,
  forked_from_id  uuid references public.strategies(id) on delete set null,
  cover_color     text,
  icon            text,
  -- cached aggregates (best-effort, refreshed on read or by app-level triggers)
  follower_count  integer not null default 0,
  total_tvl_usd   numeric  not null default 0,
  avg_apy_pct     numeric  not null default 0,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Only one strategy with the same name per creator
create unique index if not exists strategies_creator_name_unique
  on public.strategies (creator_id, lower(name))
  where deleted_at is null;

create index if not exists strategies_visibility_idx
  on public.strategies (visibility)
  where deleted_at is null;

create index if not exists strategies_creator_id_idx
  on public.strategies (creator_id);

-- ── Strategy allocations ───────────────────────────────────────────────────
create table if not exists public.strategy_allocations (
  id              uuid primary key default gen_random_uuid(),
  strategy_id     uuid not null references public.strategies(id) on delete cascade,
  vault_address   text not null,
  vault_chain_id  integer not null,
  protocol        text,
  vault_symbol    text,
  asset_symbol    text,
  asset_address   text,
  weight          numeric not null check (weight > 0 and weight <= 1),
  display_order   integer not null default 0
);

create index if not exists strategy_allocations_strategy_id_idx
  on public.strategy_allocations (strategy_id);

-- ── Followers ──────────────────────────────────────────────────────────────
create table if not exists public.strategy_followers (
  strategy_id  uuid not null references public.strategies(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  followed_at  timestamptz not null default now(),
  primary key (strategy_id, user_id)
);

create index if not exists strategy_followers_user_id_idx
  on public.strategy_followers (user_id);

-- ── Auto updated_at ────────────────────────────────────────────────────────
drop trigger if exists strategies_updated_at on public.strategies;
create trigger strategies_updated_at
  before update on public.strategies
  for each row execute function public.set_updated_at();

-- ── RLS (disabled, same as other tables) ───────────────────────────────────
alter table public.strategies             disable row level security;
alter table public.strategy_allocations   disable row level security;
alter table public.strategy_followers     disable row level security;

-- ── Extend transactions with optional strategy reference ───────────────────
-- Earn positions / strategy deposits use transactions table too, but link to
-- strategy instead of pocket. At least one of {pocket_id, strategy_id} must be set.
alter table public.transactions
  add column if not exists strategy_id uuid references public.strategies(id) on delete set null;

-- Allow pocket_id to be null (earn/strategy transactions don't have a pocket)
alter table public.transactions
  alter column pocket_id drop not null;

create index if not exists transactions_strategy_id_idx on public.transactions(strategy_id);
