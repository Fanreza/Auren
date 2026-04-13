-- Auren full reset — wipes all data + drops tables, then run schema.sql + migrations 001/002/003 after this.
-- Paste into Supabase SQL Editor: https://supabase.com/dashboard/project/vdzyatbsiqowandthzmf/sql/new

drop table if exists public.pocket_allocations cascade;
drop table if exists public.strategy_followers cascade;
drop table if exists public.strategy_allocations cascade;
drop table if exists public.strategies cascade;
drop table if exists public.transactions cascade;
drop table if exists public.pockets cascade;
drop table if exists public.users cascade;

drop function if exists public.set_updated_at() cascade;
