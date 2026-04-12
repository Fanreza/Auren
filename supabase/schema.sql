-- Auren database schema
-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/vdzyatbsiqowandthzmf/sql/new

-- ── Users ──────────────────────────────────────────────────────────────────
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

-- ── Pockets ────────────────────────────────────────────────────────────────
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

create index if not exists pockets_user_id_idx on public.pockets(user_id);

-- ── Transactions ───────────────────────────────────────────────────────────
create table if not exists public.transactions (
  id            uuid primary key default gen_random_uuid(),
  pocket_id     uuid not null references public.pockets(id) on delete cascade,
  type          text not null check (type in ('deposit', 'withdraw', 'redeem', 'switch')),
  amount        text not null,
  asset_symbol  text not null,
  tx_hash       text not null,
  timestamp     bigint not null,
  created_at    timestamptz not null default now()
);

create index if not exists transactions_pocket_id_idx on public.transactions(pocket_id);
create unique index if not exists transactions_tx_hash_idx on public.transactions(tx_hash);

-- ── Auto-update updated_at ─────────────────────────────────────────────────
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

-- ── RLS ────────────────────────────────────────────────────────────────────
-- All DB access goes through our Nitro server (not browser → Supabase directly).
-- Disable RLS so the anon key used server-side can read/write freely.
alter table public.users disable row level security;
alter table public.pockets disable row level security;
alter table public.transactions disable row level security;
