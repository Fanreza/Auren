# Auren

Goal-based DeFi savings on Base. Pick a strategy, set a target, deposit any token from any chain — yield accrues automatically in vetted vaults. Non-custodial. Gas paid in USDC.

## What it does

Users create **pockets** (savings goals), each mapped to one strategy:

- **Conservative** — USDC in top Morpho/Aave vaults
- **Balanced** — cbBTC (Bitcoin exposure + yield)
- **Aggressive** — WETH (Ethereum exposure + yield)

Auren discovers the highest-APY vault for each asset via LI.FI Earn API, validates it's Composer-compatible, then routes deposits through LI.FI's crosschain engine. Users can fund with any token on Ethereum / Base / Arbitrum / Optimism / Polygon — the app handles bridging + swapping + depositing in a single UserOp.

Withdraws work the same way in reverse, including cross-token exits (redeem vault shares, swap to desired output).

## Stack

### Frontend
- **Nuxt 4** (Vue 3 Composition API, SSR disabled)
- **Tailwind CSS 4** + **shadcn-vue** (Reka UI primitives)
- **Pinia** for state (`useProfileStore` holds pockets, positions, vault snapshots)
- **@vite-pwa/nuxt** — installable PWA with offline shell
- **driver.js** for first-time user tour
- **html-to-image** + **jspdf** for share cards and tax reports

### Wallet & account abstraction
- **Privy** — email/wallet auth + embedded wallet
- **Pimlico** — ERC-4337 smart account + bundler
- **permissionless.js** — `toSimpleSmartAccount` + `prepareUserOperationForErc20Paymaster` (gas in USDC, no ETH required)
- **viem 2** — RPC reads, contract calls, tx encoding

### DeFi routing
- **LI.FI Earn API** — vault discovery, APY, TVL, underlying asset metadata
- **LI.FI Composer Quote** — single-tx crosschain deposit routing (swap + bridge + deposit)
- **LI.FI Status** — bridge delivery polling for crosschain tx confirmation
- **Runtime Composer probe** — per-vault dummy quote at snapshot time, rejects vaults without a working Composer adapter (Aave-style non-ERC-4626, non-standard protocols)

### Backend
- **Supabase** — pocket records, transaction history, referral graph
- **Nuxt server routes** (`server/api/`) proxy LI.FI + Enso + CoinGecko to keep API keys server-side

### Prices & data
- **CoinGecko** — asset prices and FX rates for currency localization
- **Enso SDK** — multi-chain token balance lookups for the crosschain "Transfer In" picker

## Architecture notes

### Vault filter pipeline

Every strategy fetches a shortlist via:

1. **Earn API server filter** — `sortBy=apy`, `minTvlUsd=10_000_000`, limit 50
2. **Client static filter** — `isTransactional && isRedeemable`, no timelock, canonical underlying address (reject USDbC/USDC.e variants), dedupe
3. **Composer probe** — dummy `/v1/quote` per candidate, only keep vaults where `quote.tool === 'composer'`

Result is cached in `lifiVaultAddresses[strategy_key]` for the session. This guarantees every deposit uses single-tx Composer routing (no broken fallbacks to DEX swaps that price share tokens incorrectly).

### Smart account + paymaster

All onchain actions go through a Pimlico smart account. Gas is sponsored by the ERC-20 paymaster at `0x7777777777...834C` and deducted in USDC from the smart account balance. Users never need to hold native ETH.

The paymaster middleware (`prepareUserOperationForErc20Paymaster`) auto-injects an `approve` call to the paymaster on the first UserOp, then skips it on subsequent ones once allowance is set.

### Transaction recording

Every deposit/withdraw/switch is recorded to Supabase `transactions` with type, amount (stored as USD decimal for consistent cost basis), asset, tx hash, and timestamp. This feeds:

- Dashboard PnL calculation
- Pocket performance chart (cost basis + projection)
- FIFO-matched tax export
- Activity feed

### Reconciliation

When two pockets share the same strategy, the vault's `balanceOf` returns the full combined position. Auren splits the value proportionally by net contribution (deposits − withdrawals from tx history) so each pocket shows its correct share. The UI additionally gates pocket creation to 1-per-strategy for now.

## Project layout

```
app/
  components/
    app/         # domain components (pockets, dialogs, dashboard)
    landing/     # marketing site
    ui/          # shadcn primitives
  composables/   # useProfileStore deps, auth, vault, currency, notifications,
                 # achievements, streak, tax export, vault health, tour, etc.
  config/        # strategies, glossary, brand
  pages/         # / (landing), /app, /pocket/[id], /profile, /status, /terms, /privacy, /risks
  stores/        # useProfileStore (Pinia)
server/api/      # lifi/*, enso/*, transactions/*, users/*, pockets/*, referral/*
```

## Feature index

### Core flows
- Create pocket with target + timeline (goal-based)
- Deposit from any token/chain → USDC/cbBTC/WETH vault via LI.FI Composer
- Withdraw same-token (ERC-4626 redeem, Aave Pool.withdraw) or cross-token (swap via LI.FI)
- Switch vault (migrate balance to a higher-APY vault in 2 tx)
- Fund wallet (crosschain transfer in, MoonPay/Coinbase onramp, same-chain swap, USDC withdraw)

### Dashboard
- Total saved / Net contributed / Unrealized PnL / Projected 12mo KPI strip
- Cost-basis step chart with current-value anchor (honest about what's measured)
- Allocation donut + merged activity feed across pockets
- Streak counter + "today's yield" ticker
- Achievement badges (16 starter badges, tiered)

### Pocket detail
- Hero with live USD value + yield ticker animation
- Vault breakdown (protocol, APY, TVL, address)
- Performance + projection chart with time range toggle (1M / 3M / 6M / 1Y / All), goal line, intersection marker
- KPIs: yield earned, avg monthly deposit, days saving, pace to goal
- APY trend (1d / 7d / 30d deltas)
- 12-month deposit pace bar chart
- What-if strategy comparison (compound interest only, no historical prices)
- Vault health badges + 1-5 risk score
- Transaction history with CSV export
- Schedule recurring reminders (monthly, amount in token or USD)
- Share card to X / Farcaster / clipboard (PNG download)

### Trust & UX
- Inline glossary tooltips (ⓘ icons → 15 DeFi terms explained)
- Withdrawal opportunity cost warning (yield forfeited by withdrawing now)
- System status page (`/status`) with live health checks
- First-time user tour (driver.js)
- Currency localization (USD / IDR / EUR / GBP / SGD / JPY / AUD / CAD)
- Browser notifications for reminder due (permission-gated, deduped per tag)
- Daily APY drift alert (cached, fires once per user per day)
- Tax report CSV export with FIFO cost basis

### Legal
- `/terms`, `/privacy`, `/risks` — actual content, not lorem ipsum

## Development

```bash
npm install
cp .env.example .env  # fill in PRIVY_APP_ID, PIMLICO_API_KEY, LIFI_API_KEY, SUPABASE_URL, SUPABASE_KEY, ENSO_API_KEY, COINGECKO_API_KEY
npm run dev
```

Nuxt runs on `http://localhost:3000`. The app is SSR-disabled (`ssr: false`) because every flow depends on Privy wallet state which is client-only.

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

### Database

Supabase schema (subset):

```sql
users       (id, address, display_name, referred_by, referral_code, created_at)
pockets     (id, user_id, name, purpose, strategy_key, target_amount, timeline,
             recurring_day, recurring_amount, recurring_next_due, created_at)
transactions(id, pocket_id, type, amount, asset_symbol, tx_hash, timestamp, created_at)
```

`transactions.amount` is stored as **USD decimal string** (not wei) per the app convention — aligns deposit/withdraw accounting regardless of underlying asset.

## Known limitations

- **Single chain (Base)** — strategies and positions live on Base only. Transfer In is crosschain but deposits always land on Base.
- **Historical cost basis approximation** — `transactions.amount` stores USD at tx time via LI.FI `toAmountUSD`; for non-LI.FI direct deposits of non-USDC assets this is approximate.
- **1 pocket per strategy** — gated in UI until multi-vault aggregation is designed properly. Reconciliation composable is wired as a safety net for legacy data.
- **Browser push notifications are local-only** — `Notification` API fires when user opens the app. No backend push server yet, so notifications don't wake the device.
- **Composer gap** — vaults that aren't ERC-4626 compatible (some Aave markets) are filtered out automatically, reducing the pool. The alternative would be custom swap-then-deposit flows per protocol.

## License

Private. All rights reserved.
