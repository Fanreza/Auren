<script setup lang="ts">
import type { ChartPoint } from '~/composables/useDashboardStats'

const props = defineProps<{
  series: ChartPoint[]        // cost-basis step points (sorted asc by timestamp)
  currentValueUsd: number     // live on-chain total (the anchor)
  loading?: boolean
}>()

// ── Chart geometry ───────────────────────────────────────────────────────────
const WIDTH = 800
const HEIGHT = 240
const PADDING = { top: 20, right: 30, bottom: 30, left: 50 }

const plotW = WIDTH - PADDING.left - PADDING.right
const plotH = HEIGHT - PADDING.top - PADDING.bottom

// Effective series including the "now" anchor point
const effectiveSeries = computed<ChartPoint[]>(() => {
  const pts = [...props.series]
  const now = Date.now()
  // If no tx yet, create a single point at now with 0
  if (pts.length === 0) {
    return [{ timestamp: now, costBasis: 0 }]
  }
  // Append anchor only if newest tx is not "right now"
  const last = pts[pts.length - 1]
  if (now - last.timestamp > 1000) {
    pts.push({ timestamp: now, costBasis: last.costBasis })
  }
  return pts
})

const xMin = computed(() => effectiveSeries.value[0]?.timestamp ?? 0)
const xMax = computed(() => {
  const last = effectiveSeries.value[effectiveSeries.value.length - 1]?.timestamp ?? Date.now()
  return last
})
const xRange = computed(() => Math.max(xMax.value - xMin.value, 1))

const yMax = computed(() => {
  const costs = effectiveSeries.value.map(p => p.costBasis)
  const max = Math.max(...costs, props.currentValueUsd, 0.01)
  return max * 1.15
})

function x(ts: number): number {
  return PADDING.left + ((ts - xMin.value) / xRange.value) * plotW
}
function y(value: number): number {
  return PADDING.top + plotH - (value / yMax.value) * plotH
}

// ── Step path for cost basis ─────────────────────────────────────────────────
const stepPath = computed(() => {
  const pts = effectiveSeries.value
  if (!pts.length) return ''
  let d = `M ${x(pts[0].timestamp)} ${y(pts[0].costBasis)}`
  for (let i = 1; i < pts.length; i++) {
    // Horizontal to current x at previous y
    d += ` L ${x(pts[i].timestamp)} ${y(pts[i - 1].costBasis)}`
    // Vertical step up/down
    d += ` L ${x(pts[i].timestamp)} ${y(pts[i].costBasis)}`
  }
  return d
})

// Area fill = step path extended to baseline
const areaPath = computed(() => {
  const pts = effectiveSeries.value
  if (pts.length === 0) return ''
  const baseline = PADDING.top + plotH
  let d = `M ${x(pts[0].timestamp)} ${baseline}`
  d += ` L ${x(pts[0].timestamp)} ${y(pts[0].costBasis)}`
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${x(pts[i].timestamp)} ${y(pts[i - 1].costBasis)}`
    d += ` L ${x(pts[i].timestamp)} ${y(pts[i].costBasis)}`
  }
  d += ` L ${x(pts[pts.length - 1].timestamp)} ${baseline} Z`
  return d
})

// ── PnL gap line: from last cost basis point to current value at same timestamp ──
const gapLine = computed(() => {
  const last = effectiveSeries.value[effectiveSeries.value.length - 1]
  if (!last) return null
  return {
    x1: x(last.timestamp),
    y1: y(last.costBasis),
    x2: x(last.timestamp),
    y2: y(props.currentValueUsd),
  }
})

const pnlPositive = computed(() => {
  const last = effectiveSeries.value[effectiveSeries.value.length - 1]
  return props.currentValueUsd >= (last?.costBasis ?? 0)
})

// ── Axis ticks ───────────────────────────────────────────────────────────────
const yTicks = computed(() => {
  const max = yMax.value
  const steps = 4
  return Array.from({ length: steps + 1 }, (_, i) => (max / steps) * i).reverse()
})

const xTicks = computed(() => {
  const pts = effectiveSeries.value
  if (pts.length <= 1) return []
  // Up to 5 evenly spaced ticks based on timestamp range
  const count = Math.min(5, pts.length)
  const step = xRange.value / (count - 1)
  return Array.from({ length: count }, (_, i) => xMin.value + step * i)
})

function fmtUsdShort(n: number): string {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return '$' + (n / 1_000).toFixed(1) + 'K'
  if (n >= 1) return '$' + n.toFixed(0)
  if (n === 0) return '$0'
  return '$' + n.toFixed(2)
}

function fmtDate(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const isEmpty = computed(() => props.series.length === 0 && props.currentValueUsd < 0.01)
</script>

<template>
  <div class="rounded-2xl border border-border/60 bg-muted/20 p-4">
    <div class="flex items-baseline justify-between mb-4">
      <div>
        <p class="text-xs text-muted-foreground uppercase tracking-wider">Portfolio value</p>
        <p class="text-[10px] text-muted-foreground/50 mt-0.5">
          Cost basis (step) vs current value — gap = unrealized yield
        </p>
      </div>
      <div class="flex items-center gap-3 text-[10px] text-muted-foreground/70">
        <span class="flex items-center gap-1">
          <span class="w-2.5 h-2.5 rounded-sm bg-primary/60" /> Cost basis
        </span>
        <span class="flex items-center gap-1">
          <span class="w-2.5 h-[2px] bg-primary" /> Now
        </span>
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="isEmpty" class="flex flex-col items-center justify-center py-14 text-center">
      <Icon name="lucide:bar-chart-3" class="w-8 h-8 text-muted-foreground/40 mb-2" />
      <p class="text-sm text-muted-foreground">No activity yet</p>
      <p class="text-xs text-muted-foreground/50 mt-1">Fund a pocket to start seeing your portfolio chart</p>
    </div>

    <!-- Chart -->
    <svg
      v-else
      :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
      class="w-full h-auto"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="currentColor" stop-opacity="0.25" />
          <stop offset="100%" stop-color="currentColor" stop-opacity="0" />
        </linearGradient>
      </defs>

      <!-- Y grid lines + labels -->
      <g class="text-muted-foreground/30">
        <line
          v-for="(tick, i) in yTicks" :key="'ygrid-' + i"
          :x1="PADDING.left" :y1="y(tick)" :x2="WIDTH - PADDING.right" :y2="y(tick)"
          stroke="currentColor" stroke-width="0.5" stroke-dasharray="2 4"
        />
      </g>
      <g class="text-muted-foreground/60" font-size="10">
        <text
          v-for="(tick, i) in yTicks" :key="'ylabel-' + i"
          :x="PADDING.left - 6" :y="y(tick) + 3"
          text-anchor="end" fill="currentColor"
        >{{ fmtUsdShort(tick) }}</text>
      </g>

      <!-- X axis labels -->
      <g class="text-muted-foreground/60" font-size="10">
        <text
          v-for="(tick, i) in xTicks" :key="'xlabel-' + i"
          :x="x(tick)" :y="HEIGHT - 8"
          text-anchor="middle" fill="currentColor"
        >{{ fmtDate(tick) }}</text>
      </g>

      <!-- Area fill (cost basis) -->
      <path :d="areaPath" fill="url(#areaGradient)" class="text-primary" />

      <!-- Step line (cost basis) -->
      <path
        :d="stepPath"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linejoin="round"
        class="text-primary/80"
      />

      <!-- Cost basis point markers -->
      <g>
        <circle
          v-for="(pt, i) in effectiveSeries" :key="'pt-' + i"
          :cx="x(pt.timestamp)" :cy="y(pt.costBasis)"
          r="3" fill="currentColor" class="text-primary"
        />
      </g>

      <!-- PnL gap line (vertical dashed from last cost basis to current value) -->
      <line
        v-if="gapLine && Math.abs(gapLine.y1 - gapLine.y2) > 1"
        :x1="gapLine.x1" :y1="gapLine.y1"
        :x2="gapLine.x2" :y2="gapLine.y2"
        stroke-width="2" stroke-dasharray="3 3"
        :class="pnlPositive ? 'text-primary' : 'text-destructive'"
        stroke="currentColor"
      />

      <!-- Current value anchor -->
      <g v-if="currentValueUsd > 0">
        <line
          :x1="PADDING.left" :y1="y(currentValueUsd)"
          :x2="WIDTH - PADDING.right" :y2="y(currentValueUsd)"
          stroke="currentColor" stroke-width="1"
          :class="pnlPositive ? 'text-primary' : 'text-destructive'"
          stroke-dasharray="5 5" opacity="0.6"
        />
        <circle
          :cx="x(xMax)" :cy="y(currentValueUsd)"
          r="5" fill="currentColor"
          :class="pnlPositive ? 'text-primary' : 'text-destructive'"
        />
        <circle
          :cx="x(xMax)" :cy="y(currentValueUsd)"
          r="8" fill="none" stroke="currentColor" stroke-width="1.5"
          :class="pnlPositive ? 'text-primary' : 'text-destructive'"
          opacity="0.5"
        >
          <animate attributeName="r" values="6;12;6" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.6;0;0.6" dur="2s" repeatCount="indefinite" />
        </circle>
        <text
          :x="x(xMax) - 8" :y="y(currentValueUsd) - 10"
          text-anchor="end" font-size="11" font-weight="600"
          fill="currentColor"
          :class="pnlPositive ? 'text-primary' : 'text-destructive'"
        >
          ${{ currentValueUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
        </text>
      </g>
    </svg>

    <p class="text-[10px] text-muted-foreground/50 mt-3 text-center">
      Cost basis uses current prices — historical tx valuation is approximate for non-USDC pockets
    </p>
  </div>
</template>
