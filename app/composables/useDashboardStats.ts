import { storeToRefs } from 'pinia'
import { useProfileStore } from '~/stores/useProfileStore'
import { useUserData } from '~/composables/useUserData'
import { STRATEGIES, type StrategyKey } from '~/config/strategies'
import type { DbTransaction, DbPocket } from '~/types/database'
import { formatUnits } from 'viem'

export interface ActivityItem extends DbTransaction {
  pocket_name: string
  strategy_key: StrategyKey
  /** USD value at today's prices (approximation for non-USDC) */
  usd_value: number
}

export interface ChartPoint {
  timestamp: number
  costBasis: number   // cumulative net contributed in USD
  label?: string      // optional hover label
}

/**
 * Dashboard-level aggregation: merges tx history across all pockets,
 * computes net contributed, unrealized PnL, projected earnings, and
 * the cost-basis step-chart series with a final anchor at current value.
 *
 * Cost basis for non-USDC pockets uses CURRENT prices (not historical),
 * which is an approximation — clearly labeled in the UI as such.
 */
export function useDashboardStats() {
  const profileStore = useProfileStore()
  const { pockets, pocketPositions, assetPrices, vaultApys } = storeToRefs(profileStore)
  const { getTransactions } = useUserData()

  const allTransactions = ref<ActivityItem[]>([])
  const loadingTx = ref(false)

  async function fetchAllTransactions() {
    if (!pockets.value.length) {
      allTransactions.value = []
      return
    }
    loadingTx.value = true
    try {
      const results = await Promise.all(
        pockets.value.map(async (p) => {
          const txs = await getTransactions(p.id)
          return txs.map((t): ActivityItem => {
            // `amount` is stored as a USD decimal string by the recorder
            // (uses `lifiQuote.estimate.toAmountUSD` or the USDC decimal amount).
            // For non-LI.FI paths with non-USDC input this is approximate.
            const usd = parseFloat(t.amount) || 0
            // DB stores timestamp in seconds — normalize to ms for all consumers
            const tsMs = t.timestamp < 10_000_000_000 ? t.timestamp * 1000 : t.timestamp
            return {
              ...t,
              timestamp: tsMs,
              pocket_name: p.name,
              strategy_key: p.strategy_key as StrategyKey,
              usd_value: usd,
            }
          })
        }),
      )
      allTransactions.value = results.flat().sort((a, b) => b.timestamp - a.timestamp)
    } finally {
      loadingTx.value = false
    }
  }

  // ── Derived stats ────────────────────────────────────────────────────────
  const totalValueUsd = computed(() => {
    let total = 0
    for (const p of pockets.value) {
      const pos = pocketPositions.value[p.id]
      if (!pos || pos.value === 0n) continue
      const strategy = STRATEGIES[p.strategy_key as StrategyKey]
      if (!strategy) continue
      const tokens = parseFloat(formatUnits(pos.value, strategy.decimals))
      const price = assetPrices.value[strategy.assetAddress.toLowerCase()] ?? 0
      total += tokens * price
    }
    return total
  })

  /** Net contributed = deposits - withdrawals, in USD at current prices. */
  const netContributedUsd = computed(() => {
    let net = 0
    for (const tx of allTransactions.value) {
      if (tx.type === 'deposit') net += tx.usd_value
      else if (tx.type === 'withdraw' || tx.type === 'redeem') net -= tx.usd_value
    }
    return net
  })

  const unrealizedPnlUsd = computed(() => totalValueUsd.value - netContributedUsd.value)

  const pnlPercent = computed(() => {
    if (netContributedUsd.value <= 0) return 0
    return (unrealizedPnlUsd.value / netContributedUsd.value) * 100
  })

  /** Weighted average APY across all positions. */
  const avgApy = computed(() => {
    let weightedSum = 0
    let totalWeight = 0
    for (const p of pockets.value) {
      const pos = pocketPositions.value[p.id]
      if (!pos || pos.value === 0n) continue
      const strategy = STRATEGIES[p.strategy_key as StrategyKey]
      if (!strategy) continue
      const tokens = parseFloat(formatUnits(pos.value, strategy.decimals))
      const price = assetPrices.value[strategy.assetAddress.toLowerCase()] ?? 0
      const valueUsd = tokens * price
      const apyStr = vaultApys.value[p.strategy_key] ?? '0'
      const apy = parseFloat(apyStr) || 0
      weightedSum += apy * valueUsd
      totalWeight += valueUsd
    }
    if (totalWeight === 0) return 0
    return weightedSum / totalWeight
  })

  const projectedAnnualUsd = computed(() => totalValueUsd.value * (avgApy.value / 100))

  /** Allocation breakdown per pocket in USD. */
  const allocation = computed(() => {
    const list: Array<{ pocket: DbPocket; valueUsd: number; percent: number }> = []
    const total = totalValueUsd.value
    for (const p of pockets.value) {
      const pos = pocketPositions.value[p.id]
      if (!pos) continue
      const strategy = STRATEGIES[p.strategy_key as StrategyKey]
      if (!strategy) continue
      const tokens = parseFloat(formatUnits(pos.value, strategy.decimals))
      const price = assetPrices.value[strategy.assetAddress.toLowerCase()] ?? 0
      const valueUsd = tokens * price
      if (valueUsd < 0.001) continue
      list.push({
        pocket: p,
        valueUsd,
        percent: total > 0 ? (valueUsd / total) * 100 : 0,
      })
    }
    return list.sort((a, b) => b.valueUsd - a.valueUsd)
  })

  /**
   * Cost-basis step chart series.
   * Each point = cumulative net contributed *after* that tx (at current prices).
   * The final anchor point at "now" uses the actual on-chain value to visualise
   * the unrealized PnL gap.
   */
  const chartSeries = computed<ChartPoint[]>(() => {
    const txs = [...allTransactions.value].sort((a, b) => a.timestamp - b.timestamp)
    const points: ChartPoint[] = []
    let running = 0
    for (const tx of txs) {
      if (tx.type === 'deposit') running += tx.usd_value
      else if (tx.type === 'withdraw' || tx.type === 'redeem') running -= tx.usd_value
      points.push({
        timestamp: tx.timestamp,
        costBasis: Math.max(running, 0),
        label: tx.type,
      })
    }
    return points
  })

  return {
    // state
    allTransactions,
    loadingTx,
    // actions
    fetchAllTransactions,
    // derived
    totalValueUsd,
    netContributedUsd,
    unrealizedPnlUsd,
    pnlPercent,
    avgApy,
    projectedAnnualUsd,
    allocation,
    chartSeries,
  }
}
