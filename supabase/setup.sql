-- ============================================================================
-- Auren — full database setup (idempotent, single file)
-- ============================================================================
-- Paste into Supabase SQL Editor:
-- https://supabase.com/dashboard/project/_/sql/new
--
-- Running this on an EMPTY project will create everything needed.
-- Running this on an EXISTING project is safe: all `create` / `alter` /
-- `insert` statements are guarded with `if not exists` / `on conflict do nothing`.
--
-- To WIPE and start fresh, uncomment the DROP block at the top.
-- ============================================================================


-- ── Optional: wipe existing state ───────────────────────────────────────────
-- Uncomment this block to drop every Auren table before re-creating. Useful
-- during development. NEVER run this in production without a backup.
--
-- drop table if exists public.pocket_allocations   cascade;
-- drop table if exists public.strategy_followers   cascade;
-- drop table if exists public.strategy_allocations cascade;
-- drop table if exists public.strategies           cascade;
-- drop table if exists public.transactions         cascade;
-- drop table if exists public.pockets              cascade;
-- drop table if exists public.users                cascade;
-- drop function if exists public.set_updated_at()  cascade;


-- ── Users ───────────────────────────────────────────────────────────────────
create table if not exists public.users (
  id              uuid primary key default gen_random_uuid(),
  address         text unique not null,
  display_name    text,
  referral_code   text unique,
  referred_by     text,
  referral_count  integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);


-- ── Pockets ─────────────────────────────────────────────────────────────────
create table if not exists public.pockets (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.users(id) on delete cascade,
  name                text not null,
  purpose             text,
  timeline            text,
  target_amount       numeric,
  strategy_key        text not null,
  recurring_day       integer,
  recurring_amount    text,
  recurring_next_due  text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Phase 1: primary/cache vault columns on pockets. Authoritative allocation
-- list lives in pocket_allocations (Phase 4) — these fields are kept as a
-- quick-read cache for dashboards and single-vault legacy pockets.
alter table public.pockets
  add column if not exists vault_address   text,
  add column if not exists vault_chain_id  integer default 8453,
  add column if not exists vault_protocol  text,
  add column if not exists vault_symbol    text,
  add column if not exists vault_asset     text;

create index if not exists pockets_user_id_idx       on public.pockets(user_id);
create index if not exists pockets_vault_address_idx on public.pockets(lower(vault_address));


-- ── Pocket allocations (Phase 4: multi-vault per pocket) ────────────────────
create table if not exists public.pocket_allocations (
  id              uuid primary key default gen_random_uuid(),
  pocket_id       uuid not null references public.pockets(id) on delete cascade,
  vault_address   text not null,
  vault_chain_id  integer not null default 8453,
  protocol        text,
  vault_symbol    text,
  asset_symbol    text,
  asset_address   text,
  weight          numeric not null check (weight >= 0 and weight <= 1),
  display_order   integer not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists pocket_allocations_pocket_id_idx
  on public.pocket_allocations(pocket_id);

create index if not exists pocket_allocations_vault_address_idx
  on public.pocket_allocations(lower(vault_address));

-- Within a single pocket, the same vault can only appear once
create unique index if not exists pocket_allocations_pocket_vault_unique
  on public.pocket_allocations(pocket_id, lower(vault_address));


-- ── Transactions ────────────────────────────────────────────────────────────
create table if not exists public.transactions (
  id            uuid primary key default gen_random_uuid(),
  pocket_id     uuid references public.pockets(id) on delete cascade,
  type          text not null check (type in ('deposit', 'withdraw', 'redeem', 'switch')),
  amount        text not null,
  asset_symbol  text not null,
  tx_hash       text not null,
  timestamp     bigint not null,
  created_at    timestamptz not null default now()
);

create index        if not exists transactions_pocket_id_idx on public.transactions(pocket_id);
create unique index if not exists transactions_tx_hash_idx   on public.transactions(tx_hash);


-- ── Strategies (Phase 2: marketplace) ───────────────────────────────────────
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
  follower_count  integer not null default 0,
  total_tvl_usd   numeric  not null default 0,
  avg_apy_pct     numeric  not null default 0,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists strategies_creator_name_unique
  on public.strategies (creator_id, lower(name))
  where deleted_at is null;

create index if not exists strategies_visibility_idx
  on public.strategies (visibility)
  where deleted_at is null;

create index if not exists strategies_creator_id_idx
  on public.strategies (creator_id);


-- ── Strategy allocations ────────────────────────────────────────────────────
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


-- ── Strategy followers ──────────────────────────────────────────────────────
create table if not exists public.strategy_followers (
  strategy_id  uuid not null references public.strategies(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  followed_at  timestamptz not null default now(),
  primary key (strategy_id, user_id)
);

create index if not exists strategy_followers_user_id_idx
  on public.strategy_followers (user_id);


-- ── Link transactions to strategies (Earn tab / strategy deposits) ──────────
alter table public.transactions
  add column if not exists strategy_id uuid references public.strategies(id) on delete set null;

alter table public.transactions
  alter column pocket_id drop not null;

create index if not exists transactions_strategy_id_idx on public.transactions(strategy_id);


-- ── Auto-update updated_at ──────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_updated_at on public.users;
create trigger users_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

drop trigger if exists pockets_updated_at on public.pockets;
create trigger pockets_updated_at
  before update on public.pockets
  for each row execute function public.set_updated_at();

drop trigger if exists strategies_updated_at on public.strategies;
create trigger strategies_updated_at
  before update on public.strategies
  for each row execute function public.set_updated_at();


-- ── RLS disabled ────────────────────────────────────────────────────────────
-- All DB access is gated through the Nitro server. The anon key used server-
-- side needs full read/write access, so RLS is explicitly disabled.
alter table public.users                disable row level security;
alter table public.pockets               disable row level security;
alter table public.pocket_allocations    disable row level security;
alter table public.transactions          disable row level security;
alter table public.strategies            disable row level security;
alter table public.strategy_allocations  disable row level security;
alter table public.strategy_followers    disable row level security;


-- ============================================================================
-- Seed: system strategies (Conservative / Balanced / Aggressive)
-- ============================================================================
-- These are immutable (is_system=true) and always visible in the marketplace.
-- vault_address fields are representative — at runtime the client picks the
-- current top-APY vault from the catalog dynamically.

-- Conservative: USDC via Morpho
insert into public.strategies (id, name, description, risk_level, visibility, is_system, cover_color, icon, follower_count)
values (
  'c0000000-0000-0000-0000-000000000001',
  'Conservative',
  'Stable yield on USDC through battle-tested Morpho vaults. Best for emergency funds and short-term savings.',
  'low',
  'public',
  true,
  '#2775CA',
  'lucide:shield',
  0
) on conflict (id) do nothing;

insert into public.strategy_allocations (strategy_id, vault_address, vault_chain_id, protocol, vault_symbol, asset_symbol, asset_address, weight, display_order)
values (
  'c0000000-0000-0000-0000-000000000001',
  '0xbeefa7b88064feef0cee02aaebbd95d30df3878f',
  8453,
  'morpho-v1',
  'BBQUSDC',
  'USDC',
  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  1.0,
  0
) on conflict do nothing;

-- Balanced: cbBTC via Aave
insert into public.strategies (id, name, description, risk_level, visibility, is_system, cover_color, icon, follower_count)
values (
  'c0000000-0000-0000-0000-000000000002',
  'Balanced',
  'BTC price growth + vault yield via cbBTC lending markets. Higher upside, moderate volatility.',
  'medium',
  'public',
  true,
  '#F7931A',
  'lucide:scale',
  0
) on conflict (id) do nothing;

insert into public.strategy_allocations (strategy_id, vault_address, vault_chain_id, protocol, vault_symbol, asset_symbol, asset_address, weight, display_order)
values (
  'c0000000-0000-0000-0000-000000000002',
  '0xbdb9300b7cde636d9cd4aff00f6f009ffbbc8ee6',
  8453,
  'aave-v3',
  'aBascbBTC',
  'cbBTC',
  '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
  1.0,
  0
) on conflict do nothing;

-- Aggressive: WETH via Aave
insert into public.strategies (id, name, description, risk_level, visibility, is_system, cover_color, icon, follower_count)
values (
  'c0000000-0000-0000-0000-000000000003',
  'Aggressive',
  'ETH price growth + vault yield. Maximum upside with significant volatility — for long-term holders only.',
  'high',
  'public',
  true,
  '#627EEA',
  'lucide:zap',
  0
) on conflict (id) do nothing;

insert into public.strategy_allocations (strategy_id, vault_address, vault_chain_id, protocol, vault_symbol, asset_symbol, asset_address, weight, display_order)
values (
  'c0000000-0000-0000-0000-000000000003',
  '0xd4a0e0b9149bcee3c920d2e00b5de09138fd8bb7',
  8453,
  'aave-v3',
  'aBasWETH',
  'WETH',
  '0x4200000000000000000000000000000000000006',
  1.0,
  0
) on conflict do nothing;
