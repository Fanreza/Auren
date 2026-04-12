-- Phase 1: Decouple pocket from hardcoded strategy_key enum.
-- Pocket now stores the exact vault it deposits into. 1 pocket = 1 vault,
-- strictly unique per user (enforced via index).
--
-- strategy_key is retained as a DISPLAY CATEGORY (conservative/balanced/aggressive)
-- so we can keep icon/color/grouping logic, but the actual deposit target is
-- vault_address + vault_chain_id.
--
-- Run in Supabase SQL editor. Safe to run multiple times.

alter table public.pockets
  add column if not exists vault_address   text,
  add column if not exists vault_chain_id  integer default 8453,
  add column if not exists vault_protocol  text,
  add column if not exists vault_symbol    text,
  add column if not exists vault_asset     text;

-- Strict uniqueness: a user cannot have 2 active pockets pointing at the same vault.
-- Case-insensitive (addresses are case-mixed).
create unique index if not exists pockets_user_vault_unique
  on public.pockets (user_id, lower(vault_address))
  where vault_address is not null;

-- Index for faster joins when aggregating per-vault TVL
create index if not exists pockets_vault_address_idx on public.pockets(lower(vault_address));
