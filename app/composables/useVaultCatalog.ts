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
 *
 * Session cache: `_catalogFetched` flag prevents duplicate fetches.
 */
import { defineStore } from 'pinia'
import { STRATEGIES, STRATEGY_LIST, type StrategyKey } from '~/config/strategies'
import { MIN_VAULT_TVL_USD, normalizeApy, passesVaultFilter } from '~/utils/vaultFilter'

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
        const staticallyOk = candidates.filter(v =>
          passesVaultFilter(v, { canonicalUnderlying: canonical, seen }),
        )

        const composerVaults: CatalogVault[] = []
        for (const candidate of staticallyOk) {
          const apy = normalizeApy(candidate.analytics?.apy?.total)
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
   * the same static filters. Used by the strategy builder so users can pick
   * ANY asset as long as it's LI.FI-transactional.
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
      const staticallyOk = candidates.filter(v => passesVaultFilter(v, { seen }))

      const result: CatalogVault[] = []
      for (const candidate of staticallyOk) {
        const underlying = candidate.underlyingTokens?.[0]
        if (!underlying?.address || !underlying?.decimals) continue
        const apy = normalizeApy(candidate.analytics?.apy?.total)
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

  /** Fetch a single vault directly by address via LI.FI's detail endpoint and
   *  merge it into openVaults so subsequent findByAddress calls hit the cache.
   *  Used when an allocation references a vault outside the top-N catalog fetches. */
  const _inflight = new Map<string, Promise<CatalogVault | null>>()
  async function fetchVaultByAddress(chainId: number, address: string): Promise<CatalogVault | null> {
    const key = `${chainId}:${address.toLowerCase()}`
    const existing = findByAddress(address)
    if (existing) return existing
    if (_inflight.has(key)) return _inflight.get(key)!

    const promise = (async () => {
      try {
        const v: any = await $fetch('/api/lifi/vault', { query: { chainId, address } })
        if (!v?.address) return null
        const apy = normalizeApy(v.analytics?.apy?.total)
        const protocol = typeof v.protocol === 'object'
          ? (v.protocol?.name ?? 'Unknown')
          : String(v.protocol ?? 'Unknown')
        const underlying = v.underlyingTokens?.[0] ?? v.underlyingToken
        const sym = (underlying?.symbol ?? '').toLowerCase()
        const strategyKey: StrategyKey =
          sym.includes('btc') ? 'balanced'
          : sym.includes('eth') ? 'aggressive'
          : 'conservative'
        const vault: CatalogVault = {
          address: v.address,
          chainId: v.chainId ?? chainId,
          name: v.name ?? underlying?.symbol ?? '',
          protocol,
          vaultSymbol: v.name ?? underlying?.symbol ?? '',
          apy,
          tvl: parseFloat(v.analytics?.tvl?.usd ?? '0') || 0,
          assetSymbol: underlying?.symbol ?? '',
          assetAddress: underlying?.address ?? '',
          strategyKey,
        }
        // Merge into openVaults (dedupe by address) so findByAddress finds it next time
        const target = vault.address.toLowerCase()
        if (!openVaults.value.some(o => o.address.toLowerCase() === target)) {
          openVaults.value = [...openVaults.value, vault]
        }
        return vault
      } catch (e) {
        if (import.meta.dev) console.warn('[catalog] vault detail fetch failed', address, e)
        return null
      } finally {
        _inflight.delete(key)
      }
    })()
    _inflight.set(key, promise)
    return promise
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
    fetchVaultByAddress,
    findByAddress,
    topForStrategy,
    reset,
  }
})
