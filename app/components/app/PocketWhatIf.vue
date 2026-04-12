<script setup lang="ts">
import { STRATEGIES, type StrategyKey } from '~/config/strategies'

const props = defineProps<{
  currentStrategyKey: StrategyKey
  principal: number          // cumulative net contributed in USD
  daysActive: number
  /** Map of strategy_key → APY decimal (e.g. 0.047) — pulled from store */
  strategyApys: Record<string, number>
}>()

interface ComparisonRow {
  key: StrategyKey
  name: string
  color: string
  apy: number              // decimal
  projectedValue: number   // principal × (1 + apy)^(years)
  yieldVsCurrent: number   // diff vs current strategy
  isCurrent: boolean
}

const rows = computed<ComparisonRow[]>(() => {
  const years = props.daysActive / 365
  const results: ComparisonRow[] = []

  // Compute projected value for each strategy
  for (const key of Object.keys(STRATEGIES) as StrategyKey[]) {
    const strategy = STRATEGIES[key]
    const apy = props.strategyApys[key] ?? 0
    // Compound at given APY for the same duration
    const projected = props.principal * Math.pow(1 + apy, years)
    results.push({
      key,
      name: strategy.name,
      color: strategy.assetColor,
      apy,
      projectedValue: projected,
      yieldVsCurrent: 0,  // filled below
      isCurrent: key === props.currentStrategyKey,
    })
  }

  const currentRow = results.find(r => r.isCurrent)
  const baseline = currentRow?.projectedValue ?? props.principal
  for (const r of results) {
    r.yieldVsCurrent = r.projectedValue - baseline
  }
  return results
})

function fmtUsd(n: number): string {
  if (Math.abs(n) < 0.01) return '$0.00'
  return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
</script>

<template>
  <Card>
    <CardContent class="p-5">
      <div class="flex items-baseline justify-between mb-4">
        <h3 class="text-sm font-semibold">What if you'd picked...</h3>
        <p class="text-[11px] text-muted-foreground/60">Same principal, same time, different strategy</p>
      </div>

      <div v-if="principal <= 0 || daysActive < 1" class="text-center py-6">
        <Icon name="lucide:scale" class="w-7 h-7 text-muted-foreground/30 mb-2 mx-auto" />
        <p class="text-sm text-muted-foreground">Not enough history yet</p>
        <p class="text-[11px] text-muted-foreground/50 mt-1">Make a deposit and wait a few days</p>
      </div>

      <div v-else class="space-y-2">
        <div
          v-for="r in rows" :key="r.key"
          class="flex items-center gap-3 p-3 rounded-xl border"
          :class="r.isCurrent ? 'border-primary/40 bg-primary/5' : 'border-border/40 bg-background/40'"
        >
          <span class="w-2 h-8 rounded-full shrink-0" :style="{ backgroundColor: r.color }" />
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5">
              <p class="text-sm font-semibold">{{ r.name }}</p>
              <span v-if="r.isCurrent" class="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">
                Current
              </span>
            </div>
            <p class="text-[11px] text-muted-foreground/60 tabular-nums">
              {{ (r.apy * 100).toFixed(2) }}% APY
            </p>
          </div>
          <div class="text-right shrink-0">
            <p class="text-sm font-bold tabular-nums">{{ fmtUsd(r.projectedValue) }}</p>
            <p
              v-if="!r.isCurrent && Math.abs(r.yieldVsCurrent) >= 0.01"
              class="text-[10px] tabular-nums"
              :class="r.yieldVsCurrent > 0 ? 'text-emerald-400' : 'text-orange-400'"
            >
              {{ r.yieldVsCurrent > 0 ? '+' : '' }}{{ fmtUsd(r.yieldVsCurrent) }}
            </p>
          </div>
        </div>
      </div>

      <p class="text-[10px] text-muted-foreground/50 mt-3 text-center">
        Compares APY interest only — does not include underlying asset price changes
      </p>
    </CardContent>
  </Card>
</template>
