# Auren

DeFi yield made as approachable as a savings app. Three different ways to earn, one smart account, gas paid in USDC.

## The three tabs

### Pockets — goal-based savings
Create a pocket with a name, target amount, and deadline. Each pocket maps to exactly **one vault**. System presets cover USDC, cbBTC, and WETH (top Morpho / Aave picks), or browse any Composer-compatible vault on Base. 1 pocket = 1 vault per user, enforced at the DB level so onchain balances are never double-counted.

### Earn — direct yield catalog
Jumper-style browsable catalog of every LI.FI-indexed vault on Base. Filters by asset, protocol, category (stablecoin / LST / LRT / RWA), and TVL threshold. Each card shows APY base/reward split, 24h/7d/30d trend, live TVL, and a freshness timestamp. User earn positions from the LI.FI Portfolio API render above the catalog.

### Strategies — multi-vault marketplace
Users build custom strategies by combining **any number of Composer-compatible vaults** (any asset — USDC, WETH, cbBTC, EURC, LBTC, weETH, etc.) with weight sliders that auto-rebalance when moved. Strategies are private by default, can be published public or shared unlisted. Other users browse the marketplace, copy strategies to their own library (auto-follows the source), fork to customize, or edit their owned copies.

## Stack

### Frontend
- **Nuxt 4** (Vue 3 Composition API, SSR disabled — every flow depends on client-only wallet state)
- **Tailwind CSS 4** + **shadcn-vue** (full Reka UI wrapper set: Dialog, Select, Slider, Popover, Calendar, Tooltip)
- **Pinia** stores:
  - `useProfileStore` — user + pockets + positions
  - `useVaultCatalog` — curated (3-asset) + open (any-asset) Composer-verified vault catalog
  - `useStrategyStore` — marketplace + fork/edit/follow
  - `useEarnStore` — LI.FI Earn catalog + portfolio positions
- **@vite-pwa/nuxt** — installable PWA with offline shell + service worker
- **driver.js** — first-time user tour
- **html-to-image** + **jspdf** — share cards and tax reports

### Wallet & account abstraction
- **Privy** — email/wallet auth + embedded wallet
- **Pimlico** — ERC-4337 smart account + bundler
- **permissionless.js** — `toSimpleSmartAccount` + `prepareUserOperationForErc20Paymaster` (gas in USDC, no ETH required)
- **viem 2** + **ox** — RPC reads, contract calls, tx encoding

### DeFi routing
- **LI.FI Earn API** — vault discovery, APY, TVL, underlying asset metadata
- **LI.FI Composer Quote** — single-tx crosschain deposit routing (swap + bridge + deposit)
- **LI.FI Status** — bridge delivery polling for crosschain tx confirmation
- **LI.FI Portfolio API** — user earn positions aggregated per wallet
- **Runtime Composer probe** — per-vault dummy quote at snapshot time, rejects vaults without a working Composer adapter

### Backend
- **Supabase** — users, pockets, transactions, strategies, strategy allocations, strategy followers
- **Nuxt server routes** (`server/api/`) — proxy LI.FI + Enso + CoinGecko to keep API keys server-side; handle Supabase writes with validation

### Prices & logos
- **CoinGecko** — asset prices and FX rates for currency localization (USD/IDR/EUR/GBP/SGD/JPY/AUD/CAD)
- **Enso SDK** — multi-chain token balance lookups for the crosschain "Transfer In" picker
- **LI.FI `/v1/tokens`** — token logo URIs cached session-wide via `useTokenLogos`
- **DeFiLlama icons** — protocol logos (Morpho, Aave, Yearn, Compound, Euler, Fluid, etc.)

## Architecture notes

### Data model (Supabase)

```
users           (id, address, display_name, referral_code, referred_by, ...)
pockets         (id, user_id, name, strategy_key, vault_address, vault_chain_id,
                 vault_protocol, vault_symbol, vault_asset, target_amount, timeline, ...)
                 + UNIQUE (user_id, lower(vault_address))  ← 1 vault = 1 pocket
strategies      (id, creator_id, name, description, risk_level, visibility,
                 is_system, forked_from_id, cover_color, icon,
                 follower_count, total_tvl_usd, avg_apy_pct, deleted_at, ...)
strategy_allocations  (id, strategy_id, vault_address, vault_chain_id, protocol,
                       asset_symbol, asset_address, weight, display_order)
strategy_followers    (strategy_id, user_id, followed_at)
transactions    (id, pocket_id, strategy_id, type, amount, asset_symbol, tx_hash, timestamp)
```

Migration files live in `supabase/migrations/` — run in order:
1. `001_phase1_pockets_vault.sql` — add vault columns + unique index
2. `002_phase2_strategies.sql` — strategies + allocations + followers tables
3. `003_seed_system_strategies.sql` — seed Conservative/Balanced/Aggressive system strategies

### Vault filter pipeline

Every vault shown in the pocket quick-pick + strategy builder passes three layers:

1. **Earn API server filter** — `sortBy=apy`, `minTvlUsd=10_000_000`, limit 50
2. **Client static filter** — `isTransactional && isRedeemable`, no timelock, canonical underlying address (reject USDbC/USDC.e variants), dedupe
3. **Composer probe** — dummy `/v1/quote` per candidate, only keep vaults where `quote.tool === 'composer'`

Two catalogs exist:
- **`fetchCatalog()` → `byStrategy`** — 3-asset curated list (USDC/cbBTC/WETH) for the preset flow
- **`fetchOpenCatalog()` → `openVaults`** — any asset that passes the probe, for the strategy builder where users pick freely

### Smart account + paymaster

All onchain actions go through a Pimlico smart account. Gas is sponsored by the ERC-20 paymaster at `0x7777777777...834C` and deducted in USDC from the smart account balance. Users never need to hold native ETH.

The paymaster middleware (`prepareUserOperationForErc20Paymaster`) auto-injects an `approve` call to the paymaster on the first UserOp, then skips it on subsequent ones once allowance is set.

### Pocket ↔ Strategy ↔ Earn separation

Three primitives, decoupled:
- **Pocket** = goal wrapper + 1 vault. Strict 1:1 with a vault address (DB unique index).
- **Strategy** = multi-vault recipe, composable via the builder. Used in the marketplace. Can be system, private, unlisted, or public. Forks create new entities — editing a strategy never affects copies.
- **Earn position** = raw yield without any wrapper, sourced from the LI.FI Portfolio API. Not stored in DB — read-through only.

Strategies can be used as a *source* in pocket creation (pick a vault from a saved strategy), but pockets never directly reference strategy IDs.

### Follower tracking

`strategies.follower_count` is a cached column. To avoid race conditions, both the `follow` and `fork` endpoints re-count from the `strategy_followers` junction table after mutation and write the actual count back. Forking automatically inserts the forker as a follower of the source (implicit interest).

## Project layout

```
app/
  components/
    app/               # domain components (pockets, strategies, earn, dashboard, vault logos)
    landing/           # marketing site
    ui/                # shadcn primitives (button, dialog, input, select, slider, calendar, tooltip)
  composables/
    useProfileStore    # pockets + positions + user profile (duplicated into Pinia store)
    useVaultCatalog    # curated + open Composer-verified catalogs
    useStrategyStore   # marketplace + fork/edit/follow
    useEarnStore       # LI.FI catalog + portfolio positions
    useTokenLogos      # session-cached token address → logo URI
    useDashboardStats  # PnL, activity feed, chart series
    useWalletTokens    # direct-RPC multicall for wallet balances
    useCurrency        # USD/IDR/EUR/... localization
    useTour            # driver.js first-run walkthrough
    useNotifications   # browser push (reminder due, goal reached)
    useStreak          # daily check-in counter
    useAchievements    # state-derived badge unlocks
    useTaxExport       # FIFO cost basis CSV export
    useVaultHealth     # star rating + risk signals
    useTransactionRecorder # tx → DB writeback
    ... and more
  config/
    strategies.ts      # static STRATEGY_LIST (3 categories for display grouping)
    glossary.ts        # 15 inline tooltips for DeFi terms
    protocolLogos.ts   # protocol name → logo URL map
    brand.ts           # name, tagline, support links
  pages/
    /                  # landing
    /app               # pockets tab
    /earn              # earn tab (LI.FI catalog + positions)
    /strategy          # strategies marketplace
    /strategy/:id      # strategy detail
    /strategy/create   # strategy builder wizard (4 steps) — edit mode via ?edit=<id>
    /pocket/:id        # pocket detail (performance, projection, allocations)
    /profile           # user prefs (name, currency, notif, tax export, referral)
    /status            # live system health
    /terms /privacy /risks /learn
  stores/              # Pinia roots
server/api/            # lifi/*, enso/*, transactions/*, users/*, pockets/*,
                       # strategies/* (index, [id] crud, [id]/follow, [id]/fork), referral/*
supabase/
  schema.sql           # initial schema
  migrations/          # ordered migrations for phase rollouts
```

## Feature index

### Pockets flow
- Step 1: name + target + timeline + category
- Step 2: **3 modes** — Quick pick (3 preset system strategies) / My strategies (saved strategies with sub-picker for multi-vault) / All vaults (full Composer-compatible catalog)
- Step 3: pick token + amount + LI.FI quote preview
- Step 4: execute via smart account
- Constraint: 1 vault = 1 pocket per user (DB unique index)
- Dashboard: KPI strip, cost-basis chart, allocation donut, activity feed, streak counter, achievement badges

### Pocket card + detail
- Vault symbol shown directly on card
- Hero with live USD value + yield ticker animation
- Per-allocation vault breakdown with asset + protocol logos
- Performance + projection chart with time range toggle, goal line, intersection marker
- KPIs: yield earned, avg monthly deposit, days saving, pace to goal
- APY trend (1d / 7d / 30d deltas)
- 12-month deposit pace bar chart
- What-if strategy comparison (compound interest)
- Vault health badges + 1-5 risk score
- Transaction history with CSV export
- Deposit / Withdraw / Switch vault actions
- Edit (name/target/timeline) + Delete
- Schedule recurring reminders
- Share card to X / Farcaster / clipboard / PNG download

### Earn tab
- Multi-section card grid (1-3 cols responsive)
- Per-card: asset logo + protocol logo overlap, name, description, protocol link
- Big APY with base/reward split, trend arrow (1d vs 7d)
- 3-column mini trend chart (24h / 7d / 30d)
- Category tag chips (stablecoin, LST, LRT, RWA, etc.) with color coding
- TVL, chain badge, freshness timestamp
- User position "You: $X" pill when holding balance
- Filters: search, asset, protocol, category, min TVL, sort by APY/TVL
- User earn positions section (aggregated from LI.FI Portfolio API)
- LI.FI empty/placeholder entries filtered out

### Strategy marketplace
- 3 tabs: Marketplace (public) / My strategies / (optional following)
- Filters: risk (all/low/medium/high), sort by followers/APY/TVL
- Strategy card: icon + cover color, name, creator, description snippet, live APY (not cached), vault count, risk badge, follower count
- "Explore marketplace" + "Create your own" CTAs from dashboard + pocket creation

### Strategy detail
- Header card: icon, name, badges (System/Yours/Risk), creator label, follower count
- Stats: live APY / live TVL / vaults / followers (all live from catalog lookup)
- Per-allocation breakdown with asset + protocol logos, live APY per vault
- Actions:
  - **Non-owner, not yet copied**: "Copy to my strategies" (primary) + Follow
  - **Non-owner, already copied**: "Go to my copy" (primary) + "Copy again" + Follow + "Already in library" banner
  - **Owner**: "Use in pocket" + Edit + Delete
- Forking auto-increments source follower count and follows the source

### Strategy builder (4-step wizard)
- Supports both create and edit modes (`/strategy/create?edit=<id>`)
- Step 1: name + description + risk tag + cover color + icon
- Step 2: vault picker from open catalog — **any Composer-compatible asset**, search + asset filter dropdown, asset/protocol logos per row
- Step 3: weight sliders (shadcn Slider component) — moving one slider auto-rebalances others proportionally, live weighted APY + TVL preview
- Step 4: visibility (private/unlisted/public) + publish button
- Edit mode: pre-fills all state from existing strategy, saves via PATCH instead of POST, disclaimer "changes only affect this strategy — copies stay unchanged"

### Trust & UX
- Inline glossary tooltips (ⓘ icons → 15 DeFi terms explained)
- Withdrawal opportunity cost warning
- System status page (`/status`) with live health checks
- First-time user tour (driver.js)
- Currency localization (8 currencies, live FX from CoinGecko)
- Browser notifications for reminder due
- Daily APY drift alert
- Tax report CSV export (FIFO cost basis)
- Skeleton loaders across every data-fetch point
- Asset + protocol logos consistently rendered wherever vaults appear (earn card, vault picker, strategy detail, strategy builder, switch vault, pocket breakdown)

### Legal
- `/terms`, `/privacy`, `/risks` — real content, not lorem ipsum

## Development

```bash
npm install
cp .env.example .env  # fill in PRIVY_APP_ID, PIMLICO_API_KEY, LIFI_API_KEY, SUPABASE_URL, SUPABASE_KEY, ENSO_API_KEY
npm run dev
```

Before first run, apply Supabase migrations in order:
```bash
# Paste each file into Supabase SQL editor
supabase/schema.sql                        # initial tables
supabase/migrations/001_phase1_pockets_vault.sql
supabase/migrations/002_phase2_strategies.sql
supabase/migrations/003_seed_system_strategies.sql
```

Nuxt runs on `http://localhost:3000`. SSR disabled (`ssr: false`) because every flow depends on client-only Privy wallet state.

### Environment variables

```
PRIVY_APP_ID
PRIVY_CLIENT_ID
NUXT_PUBLIC_PIMLICO_API_KEY
NUXT_PUBLIC_BASE_RPC_URL
NUXT_PUBLIC_WALLET_CONNECT_PROJECT_ID
NUXT_PUBLIC_MOONPAY_API_KEY
LIFI_API_KEY
ENSO_API_KEY
SUPABASE_URL
SUPABASE_KEY
```

## Known limitations

- **Base chain only for vaults** — strategies and pockets live on Base. Transfer In is crosschain but always lands on Base. Earn tab currently limited to Base (Phase 4d multi-chain expansion planned).
- **Strategy deposit flow deferred** — strategy detail page's "Deposit" button was removed because multi-vault strategy deposit needs smart account batch UserOps (not yet wired). Use the strategy in a pocket via the My strategies picker instead.
- **Earn tab direct deposit deferred** — clicking Deposit on an earn vault shows a "coming soon" toast. For now, create a pocket to use any catalog vault.
- **Historical cost basis approximation** — `transactions.amount` stores USD at tx time via LI.FI `toAmountUSD`. For direct deposits of non-USDC assets without LI.FI this is approximate.
- **Browser push notifications are local-only** — `Notification` API fires only when user has the app open. No backend push server yet.
- **USDT and DAI absent on Base** — not a filter issue, LI.FI Earn simply doesn't index those stablecoins for Base. The catalog surfaces USDC, EURC, cbBTC, WETH, LBTC, LSTs (wstETH, weETH, cbETH, etc.), and smaller niche assets.
- **Composer-only** — vaults that fall outside LI.FI Composer routing are filtered out to guarantee single-tx UX. This excludes some Aave markets in cross-asset scenarios.

## License

Private. All rights reserved.
