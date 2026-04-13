-- Phase 4: Multi-vault per pocket.
-- A pocket can now hold N vaults with weighted allocations (like strategies).
-- The legacy single-vault columns on `pockets` become the "primary vault"
-- (kept for backwards compat + dashboard quick-read) but authoritative state
-- lives in the new pocket_allocations table.
--
-- Run in Supabase SQL editor after migration 003. Safe to run multiple times.

-- ── Drop the 1-pocket-1-vault uniqueness constraint ──────────────────────────
-- Multi-vault pockets need many rows per vault address. The strict unique
-- index from Phase 1 would block any pocket that shares a vault across its
-- allocations, and it also blocks two pockets from holding the same vault
-- (which is fine under the new model — each pocket tracks its own deposits).
drop index if exists public.pockets_user_vault_unique;

-- ── pocket_allocations table ────────────────────────────────────────────────
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

alter table public.pocket_allocations disable row level security;
