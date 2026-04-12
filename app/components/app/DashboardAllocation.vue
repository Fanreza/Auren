<script setup lang="ts">
import { STRATEGIES, type StrategyKey } from '~/config/strategies'
import type { DbPocket } from '~/types/database'

interface AllocationItem {
  pocket: DbPocket
  valueUsd: number
  percent: number
}

const props = defineProps<{
  items: AllocationItem[]
  totalUsd: number
}>()

// Donut geometry
const SIZE = 160
const STROKE = 24
const RADIUS = (SIZE - STROKE) / 2
const CIRC = 2 * Math.PI * RADIUS
const CENTER = SIZE / 2

// Compute SVG arc segments
const segments = computed(() => {
  const segs: Array<{
    dashArray: string
    dashOffset: number
    color: string
    pocket: DbPocket
    percent: number
  }> = []
  if (props.items.length === 0) return segs
  let accumulated = 0
  for (const item of props.items) {
    const strategy = STRATEGIES[item.pocket.strategy_key as StrategyKey]
    const color = strategy?.assetColor ?? '#666'
    const length = (item.percent / 100) * CIRC
    const gap = CIRC - length
    segs.push({
      dashArray: `${length} ${gap}`,
      dashOffset: -accumulated,
      color,
      pocket: item.pocket,
      percent: item.percent,
    })
    accumulated += length
  }
  return segs
})

function fmtUsd(n: number): string {
  if (n < 0.01) return '<$0.01'
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function getStrategy(key: StrategyKey) {
  return STRATEGIES[key]
}
</script>

<template>
  <div class="rounded-2xl border border-border/60 bg-muted/20 p-4">
    <p class="text-xs text-muted-foreground uppercase tracking-wider mb-4">Allocation</p>

    <!-- Empty state -->
    <div v-if="!items.length" class="flex flex-col items-center py-8 text-center">
      <Icon name="lucide:pie-chart" class="w-7 h-7 text-muted-foreground/30 mb-2" />
      <p class="text-sm text-muted-foreground">No funded pockets</p>
    </div>

    <!-- Donut + list -->
    <div v-else class="flex flex-col items-center gap-5">
      <!-- Donut -->
      <div class="relative">
        <svg :width="SIZE" :height="SIZE" :viewBox="`0 0 ${SIZE} ${SIZE}`">
          <!-- Background track -->
          <circle
            :cx="CENTER" :cy="CENTER" :r="RADIUS"
            fill="none" stroke="currentColor"
            :stroke-width="STROKE"
            class="text-muted/40"
          />
          <!-- Segments -->
          <circle
            v-for="(seg, i) in segments" :key="i"
            :cx="CENTER" :cy="CENTER" :r="RADIUS"
            fill="none" :stroke="seg.color"
            :stroke-width="STROKE"
            :stroke-dasharray="seg.dashArray"
            :stroke-dashoffset="seg.dashOffset"
            :transform="`rotate(-90 ${CENTER} ${CENTER})`"
            stroke-linecap="butt"
          />
        </svg>
        <!-- Center label -->
        <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p class="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Total</p>
          <p class="text-lg font-bold tabular-nums leading-tight">{{ fmtUsd(totalUsd) }}</p>
        </div>
      </div>

      <!-- Legend list -->
      <div class="w-full space-y-2">
        <NuxtLink
          v-for="item in items" :key="item.pocket.id"
          :to="`/pocket/${item.pocket.id}`"
          class="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted/40 transition-colors"
        >
          <span
            class="w-2.5 h-2.5 rounded-sm shrink-0"
            :style="{ backgroundColor: getStrategy(item.pocket.strategy_key as StrategyKey)?.assetColor ?? '#666' }"
          />
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate">{{ item.pocket.name }}</p>
            <p class="text-[11px] text-muted-foreground/60">
              {{ getStrategy(item.pocket.strategy_key as StrategyKey)?.assetSymbol }}
              · {{ item.percent.toFixed(1) }}%
            </p>
          </div>
          <p class="text-sm font-semibold tabular-nums shrink-0">{{ fmtUsd(item.valueUsd) }}</p>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
