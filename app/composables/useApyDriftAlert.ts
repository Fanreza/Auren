/**
 * Daily APY drift check — runs once per user visit per day.
 * Compares current vault APY against the top alternative; if there's a meaningful
 * gap, shows a toast suggesting they switch.
 *
 * Cache: localStorage `auren_apy_check_YYYY-MM-DD` to avoid re-running same day.
 */
import { toast } from 'vue-sonner'
import { BRAND } from '~/config/brand'
import { useProfileStore } from '~/stores/useProfileStore'
import { STRATEGIES, type StrategyKey } from '~/config/strategies'

const CACHE_KEY_PREFIX = `${BRAND.storagePrefix}_apy_check_`
// Minimum APY gap (decimal) before we alert
const ALERT_THRESHOLD = 0.01 // 1%

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function alreadyCheckedToday(): boolean {
  if (typeof localStorage === 'undefined') return true
  return !!localStorage.getItem(CACHE_KEY_PREFIX + todayKey())
}

function markCheckedToday() {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(CACHE_KEY_PREFIX + todayKey(), '1')
  // Cleanup old day keys
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith(CACHE_KEY_PREFIX) && k !== CACHE_KEY_PREFIX + todayKey()) {
      localStorage.removeItem(k)
    }
  }
}

export function useApyDriftAlert() {
  const profileStore = useProfileStore()

  async function runCheck() {
    if (alreadyCheckedToday()) return
    if (!profileStore.pockets.length) return

    // For each pocket, fetch top alternative vault APY for that strategy
    for (const pocket of profileStore.pockets) {
      const strategy = STRATEGIES[pocket.strategy_key as StrategyKey]
      if (!strategy) continue

      const currentVaults = profileStore.lifiVaultAddresses[pocket.strategy_key] ?? []
      if (!currentVaults.length) continue
      const currentApy = currentVaults[0]!.apy ?? 0

      try {
        const res = await $fetch<any>('/api/lifi/vaults', {
          query: {
            chainId: 8453,
            asset: strategy.lifiAssetSymbol,
            sortBy: 'apy',
            minTvlUsd: 10_000_000,
            limit: 5,
          },
        })
        const candidates: any[] = res?.data ?? []
        const canonical = strategy.assetAddress.toLowerCase()
        const topAlt = candidates.find((v) => {
          if (v.isTransactional !== true || v.isRedeemable !== true) return false
          if (v.address.toLowerCase() === currentVaults[0]!.address.toLowerCase()) return false
          const u = v.underlyingTokens?.[0]?.address?.toLowerCase()
          return u === canonical
        })

        if (!topAlt) continue
        const rawAlt = topAlt.analytics?.apy?.total ?? 0
        const altApy = rawAlt > 1 ? rawAlt / 100 : rawAlt

        const gap = altApy - currentApy
        if (gap >= ALERT_THRESHOLD) {
          const altName = topAlt.name ?? 'a higher-APY vault'
          toast.info(
            `${pocket.name}: ${altName} is offering +${(gap * 100).toFixed(2)}% APY vs your current vault. Switch from the pocket detail page.`,
            { duration: 8000, id: `apy-drift-${pocket.id}` },
          )
        }
      } catch (e) {
        // Silent fail — drift check is best-effort
        if (import.meta.dev) console.warn(`[apy-drift] check failed for ${pocket.name}:`, e)
      }
    }

    markCheckedToday()
  }

  return { runCheck }
}
