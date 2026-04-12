/**
 * Vault catalog — fetches + caches the list of deposit-safe vaults per strategy.
 *
 * Extracted from useProfileStore as a standalone composable so the same logic
 * can be reused by:
 *  - Pocket creation (Custom vault picker)
 *  - Strategy builder (multi-vault picker)
 *  - Dashboard Explore strategies (top-APY preset per strategy)
 *
 * Filter pipeline:
 *  1. LI.FI Earn API server-side filter (minTvlUsd, sortBy=apy, limit=50)
 *  2. Client static filter (isTransactional/isRedeemable/timelock/canonical underlying/dedupe)
 *  3. Runtime Composer probe (/v1/quote dummy call, keep tool === 'composer' only)
 *
 * Session cache: `_catalogFetched` flag prevents duplicate fetches.
 */
import { defineStore } from 'pinia'
import { STRATEGIES, STRATEGY_LIST, type StrategyKey } from '~/config/strategies'

export interface CatalogVault {
  address: string
  chainId: number
  name: string
  protocol: string
  vaultSymbol: string
  apy: number           // decimal 0..1
  tvl: number           // USD
  assetSymbol: string
  assetAddress: string
  strategyKey: StrategyKey  // derived from underlying asset match
}

const MIN_VAULT_TVL_USD = 10_000_000

async function isComposerCompatible(
  vaultAddress: string,
  assetAddress: string,
  assetDecimals: number,
): Promise<boolean> {
  const probeAmount = (BigInt(10) ** BigInt(assetDecimals)).toString()
  const probeAddress = '0x000000000000000000000000000000000000dEaD'
  try {
    const quote = await $fetch<any>('/api/lifi/quote', {
      query: {
        fromChain: 8453,
        toChain: 8453,
        fromToken: assetAddress,
        toToken: vaultAddress,
        fromAmount: probeAmount,
        fromAddress: probeAddress,
        toAddress: probeAddress,
        slippage: 0.005,
        order: 'RECOMMENDED',
      },
    })
    return quote?.tool === 'composer'
  } catch {
    return false
  }
}

export const useVaultCatalog = defineStore('vaultCatalog', () => {
  /** All Composer-compatible vaults grouped by strategy key (USDC/cbBTC/WETH only).
   *  Used for pocket quick-pick and the curated 3-strategy preset flow. */
  const byStrategy = ref<Record<StrategyKey, CatalogVault[]>>({
    conservative: [],
    balanced: [],
    aggressive: [],
  })

  /** Open catalog — any Composer-compatible vault regardless of underlying asset.
   *  Used by the strategy builder so users can compose ANY asset combination. */
  const openVaults = ref<CatalogVault[]>([])

  /** Flat list (curated 3-asset) for pickers that allow cross-asset selection. */
  const all = computed<CatalogVault[]>(() =>
    Object.values(byStrategy.value).flat(),
  )

  const loading = ref(false)
  const loadingOpen = ref(false)
  const error = ref('')
  let _fetched = false
  let _openFetched = false

  async function fetchCatalog(force = false) {
    if (_fetched && !force && all.value.length) return
    loading.value = true
    error.value = ''
    try {
      await Promise.allSettled(
        STRATEGY_LIST.map(async (strategy) => {
          const result = await fetchForStrategy(strategy.key)
          byStrategy.value[strategy.key] = result
        }),
      )
      _fetched = true
    } catch (e: any) {
      error.value = e?.message ?? 'Catalog fetch failed'
    } finally {
      loading.value = false
    }
  }

  async function fetchForStrategy(key: StrategyKey): Promise<CatalogVault[]> {
    const strategy = STRATEGIES[key]
    const canonical = strategy.assetAddress.toLowerCase()
    const symbolsToTry = [strategy.lifiAssetSymbol, ...strategy.lifiAssetSymbols]

    for (const symbol of symbolsToTry) {
      try {
        const res = await $fetch<any>('/api/lifi/vaults', {
          query: {
            chainId: 8453,
            asset: symbol,
            sortBy: 'apy',
            minTvlUsd: MIN_VAULT_TVL_USD,
            limit: 50,
          },
        })
        const candidates: any[] = res?.data ?? []
        const seen = new Set<string>()
        const staticallyOk = candidates.filter((v) => {
          if (v.isTransactional !== true) return false
          if (v.isRedeemable !== true) return false
          if (v.timeLock && v.timeLock > 0) return false
          const u = v.underlyingTokens?.[0]?.address?.toLowerCase()
          if (u !== canonical) return false
          const addr = v.address?.toLowerCase()
          if (!addr || seen.has(addr)) return false
          seen.add(addr)
          return true
        })

        // Composer-probe top candidates, keep all that pass (no hard limit —
        // user picks which to use, we just return the Composer-compatible set)
        const composerVaults: CatalogVault[] = []
        for (const candidate of staticallyOk.slice(0, 10)) {
          const ok = await isComposerCompatible(
            candidate.address,
            strategy.assetAddress,
            strategy.decimals,
          )
          if (!ok) continue
          const rawApy = candidate.analytics?.apy?.total ?? 0
          const apy = rawApy > 1 ? rawApy / 100 : rawApy
          const protocol = typeof candidate.protocol === 'object'
            ? (candidate.protocol?.name ?? 'Unknown')
            : String(candidate.protocol ?? 'Unknown')
          composerVaults.push({
            address: candidate.address,
            chainId: candidate.chainId ?? 8453,
            name: candidate.name ?? strategy.assetSymbol,
            protocol,
            vaultSymbol: candidate.name ?? strategy.assetSymbol,
            apy,
            tvl: parseFloat(candidate.analytics?.tvl?.usd ?? '0') || 0,
            assetSymbol: strategy.assetSymbol,
            assetAddress: strategy.assetAddress,
            strategyKey: key,
          })
        }
        if (composerVaults.length) return composerVaults
      } catch (e) {
        if (import.meta.dev) console.error(`[catalog] ${symbol}: fetch failed`, e)
      }
    }
    return []
  }

  /**
   * Open catalog fetcher — queries LI.FI Earn without an asset lock, applies
   * the same static filters + Composer probe. Used by the strategy builder
   * so users can pick ANY asset as long as it's Composer-routable.
   */
  async function fetchOpenCatalog(force = false) {
    if (_openFetched && !force && openVaults.value.length) return
    loadingOpen.value = true
    try {
      const res = await $fetch<any>('/api/lifi/vaults', {
        query: {
          chainId: 8453,
          sortBy: 'apy',
          minTvlUsd: MIN_VAULT_TVL_USD,
          limit: 100,
        },
      })
      const candidates: any[] = res?.data ?? []
      const seen = new Set<string>()
      const staticallyOk = candidates.filter((v) => {
        if (v.isTransactional !== true) return false
        if (v.isRedeemable !== true) return false
        if (v.timeLock && v.timeLock > 0) return false
        const underlying = v.underlyingTokens?.[0]
        if (!underlying?.address) return false
        const addr = v.address?.toLowerCase()
        if (!addr || seen.has(addr)) return false
        seen.add(addr)
        return true
      })

      // Composer probe — limit to top 30 candidates for latency
      const result: CatalogVault[] = []
      for (const candidate of staticallyOk.slice(0, 30)) {
        const underlying = candidate.underlyingTokens?.[0]
        if (!underlying?.address || !underlying?.decimals) continue
        const ok = await isComposerCompatible(
          candidate.address,
          underlying.address,
          underlying.decimals,
        )
        if (!ok) continue
        const rawApy = candidate.analytics?.apy?.total ?? 0
        const apy = rawApy > 1 ? rawApy / 100 : rawApy
        const protocol = typeof candidate.protocol === 'object'
          ? (candidate.protocol?.name ?? 'Unknown')
          : String(candidate.protocol ?? 'Unknown')
        // Infer strategy key from underlying symbol — for non-USDC/cbBTC/WETH
        // assets, default to 'conservative' (UI grouping only, doesn't affect behavior)
        const sym = (underlying.symbol ?? '').toLowerCase()
        const strategyKey: StrategyKey =
          sym.includes('btc') ? 'balanced'
          : sym.includes('eth') ? 'aggressive'
          : 'conservative'
        result.push({
          address: candidate.address,
          chainId: candidate.chainId ?? 8453,
          name: candidate.name ?? underlying.symbol,
          protocol,
          vaultSymbol: candidate.name ?? underlying.symbol,
          apy,
          tvl: parseFloat(candidate.analytics?.tvl?.usd ?? '0') || 0,
          assetSymbol: underlying.symbol ?? '',
          assetAddress: underlying.address,
          strategyKey,
        })
      }
      openVaults.value = result.sort((a, b) => b.apy - a.apy)
      _openFetched = true
    } catch (e: any) {
      error.value = e?.message ?? 'Open catalog fetch failed'
    } finally {
      loadingOpen.value = false
    }
  }

  /** Look up a single vault by address across both curated + open catalogs. */
  function findByAddress(addr: string): CatalogVault | null {
    const target = addr.toLowerCase()
    const fromCurated = all.value.find(v => v.address.toLowerCase() === target)
    if (fromCurated) return fromCurated
    return openVaults.value.find(v => v.address.toLowerCase() === target) ?? null
  }

  /** Get the top-APY vault for a strategy (used as "default" preset). */
  function topForStrategy(key: StrategyKey): CatalogVault | null {
    const list = byStrategy.value[key] ?? []
    if (!list.length) return null
    return [...list].sort((a, b) => b.apy - a.apy)[0] ?? null
  }

  function reset() {
    byStrategy.value = { conservative: [], balanced: [], aggressive: [] }
    openVaults.value = []
    _fetched = false
    _openFetched = false
  }

  return {
    byStrategy,
    openVaults,
    all,
    loading,
    loadingOpen,
    error,
    fetchCatalog,
    fetchOpenCatalog,
    findByAddress,
    topForStrategy,
    reset,
  }
})
