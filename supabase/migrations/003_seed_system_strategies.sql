-- Phase 2: Seed 3 system strategies (Conservative/Balanced/Aggressive).
-- These are immutable (is_system=true) and always visible in the marketplace.
-- The vault_address fields are placeholders — at runtime, client picks the
-- current top-APY vault from the catalog dynamically. For the db record we just
-- keep a "representative" vault for cold display.
--
-- Run AFTER 002_phase2_strategies.sql

-- Conservative: top Morpho USDC vault
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

-- Balanced: cbBTC vault (Bitcoin exposure + yield)
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

-- Placeholder cbBTC vault (client picks actual top vault at runtime)
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

-- Aggressive: WETH vault (ETH exposure + yield)
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
