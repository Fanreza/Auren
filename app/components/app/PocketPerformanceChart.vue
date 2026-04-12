<script setup lang="ts">
export interface ChartTx {
  timestamp: number  // ms
  type: 'deposit' | 'withdraw' | 'redeem' | 'switch'
  usdValue: number
}

const props = defineProps<{
  transactions: ChartTx[]
  currentValueUsd: number
  apy: number               // decimal e.g. 0.047 for 4.7%
  targetAmount?: number | null
  pocketCreatedAt: string   // ISO
}>()

// ── Time range toggle ───────────────────────────────────────────────────────
type Range = '1M' | '3M' | '6M' | '1Y' | 'ALL'
const range = ref<Range>('3M')
const RANGES: Range[] = ['1M', '3M', '6M', '1Y', 'ALL']

const rangeDays = computed<{ past: number; future: number }>(() => {
  switch (range.value) {
    case '1M':  return { past: 30,  future: 30 }
    case '3M':  return { past: 90,  future: 90 }
    case '6M':  return { past: 180, future: 180 }
    case '1Y':  return { past: 365, future: 365 }
    case 'ALL':
      const created = new Date(props.pocketCreatedAt).getTime()
      const ageDays = Math.max(30, Math.floor((Date.now() - created) / (1000 * 60 * 60 * 24)))
      return { past: ageDays, future: 365 }
  }
})

// ── Build series ────────────────────────────────────────────────────────────
interface Pt { t: number; v: number }

const pastSeries = computed<Pt[]>(() => {
  // Walk transactions sorted asc, accumulate cost basis
  const txs = [...props.transactions].sort((a, b) => a.timestamp - b.timestamp)
  const cutoff = Date.now() - rangeDays.value.past * 24 * 60 * 60 * 1000
  const points: Pt[] = []
  let running = 0
  for (const tx of txs) {
    if (tx.type === 'deposit') running += tx.usdValue
    else if (tx.type === 'withdraw' || tx.type === 'redeem') running -= tx.usdValue
    if (tx.timestamp >= cutoff) {
      points.push({ t: tx.timestamp, v: Math.max(running, 0) })
    }
  }
  // If no point in range, anchor cost basis line at left edge
  if (points.length === 0 && txs.length > 0) {
    let total = 0
    for (const tx of txs) {
      if (tx.timestamp > Date.now()) break
      if (tx.type === 'deposit') total += tx.usdValue
      else if (tx.type === 'withdraw' || tx.type === 'redeem') total -= tx.usdValue
    }
    points.push({ t: cutoff, v: Math.max(total, 0) })
  }
  return points
})

const futureSeries = computed<Pt[]>(() => {
  const apy = props.apy || 0
  if (apy <= 0 || props.currentValueUsd <= 0) return []
  const dailyRate = apy / 365
  const days = rangeDays.value.future
  const stepDays = Math.max(1, Math.floor(days / 40)) // ~40 sample points
  const points: Pt[] = []
  const startTs = Date.now()
  for (let d = 0; d <= days; d += stepDays) {
    const v = props.currentValueUsd * Math.pow(1 + dailyRate, d)
    points.push({ t: startTs + d * 24 * 60 * 60 * 1000, v })
  }
  return points
})

// Goal intersection: solve t for projected = target
const goalIntersection = computed<{ t: number; v: number } | null>(() => {
  if (!props.targetAmount || props.targetAmount <= 0) return null
  if (props.currentValueUsd >= props.targetAmount) return null
  const apy = props.apy || 0
  if (apy <= 0) return null
  const dailyRate = apy / 365
  const t = Math.log(props.targetAmount / props.currentValueUsd) / Math.log(1 + dailyRate)
  if (!isFinite(t) || t < 0) return null
  if (t > rangeDays.value.future) return null
  return {
    t: Date.now() + t * 24 * 60 * 60 * 1000,
    v: props.targetAmount,
  }
})

// ── Chart geometry ──────────────────────────────────────────────────────────
const WIDTH = 800
const HEIGHT = 280
const PADDING = { top: 24, right: 30, bottom: 32, left: 56 }
const plotW = WIDTH - PADDING.left - PADDING.right
const plotH = HEIGHT - PADDING.top - PADDING.bottom

const xMin = computed(() => {
  const past = pastSeries.value
  if (past.length) return past[0]!.t
  return Date.now() - rangeDays.value.past * 24 * 60 * 60 * 1000
})

const xMax = computed(() => {
  const fut = futureSeries.value
  if (fut.length) return fut[fut.length - 1]!.t
  return Date.now() + rangeDays.value.future * 24 * 60 * 60 * 1000
})

const yMax = computed(() => {
  const past = pastSeries.value.map(p => p.v)
  const fut = futureSeries.value.map(p => p.v)
  const all = [...past, ...fut, props.currentValueUsd, props.targetAmount ?? 0]
  const max = Math.max(...all, 0.01)
  return max * 1.15
})

function x(ts: number): number {
  return PADDING.left + ((ts - xMin.value) / Math.max(1, xMax.value - xMin.value)) * plotW
}
function y(v: number): number {
  return PADDING.top + plotH - (v / yMax.value) * plotH
}

// Step path for past cost basis
const pastPath = computed(() => {
  const pts = pastSeries.value
  if (!pts.length) return ''
  let d = `M ${x(pts[0]!.t)} ${y(pts[0]!.v)}`
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${x(pts[i]!.t)} ${y(pts[i - 1]!.v)}`
    d += ` L ${x(pts[i]!.t)} ${y(pts[i]!.v)}`
  }
  // extend horizontally to "now"
  d += ` L ${x(Date.now())} ${y(pts[pts.length - 1]!.v)}`
  return d
})

const pastAreaPath = computed(() => {
  const pts = pastSeries.value
  if (!pts.length) return ''
  const baseline = PADDING.top + plotH
  let d = `M ${x(pts[0]!.t)} ${baseline}`
  d += ` L ${x(pts[0]!.t)} ${y(pts[0]!.v)}`
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${x(pts[i]!.t)} ${y(pts[i - 1]!.v)}`
    d += ` L ${x(pts[i]!.t)} ${y(pts[i]!.v)}`
  }
  d += ` L ${x(Date.now())} ${y(pts[pts.length - 1]!.v)}`
  d += ` L ${x(Date.now())} ${baseline} Z`
  return d
})

// Smooth curve for future projection
const futurePath = computed(() => {
  const pts = futureSeries.value
  if (!pts.length) return ''
  let d = `M ${x(pts[0]!.t)} ${y(pts[0]!.v)}`
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${x(pts[i]!.t)} ${y(pts[i]!.v)}`
  }
  return d
})

// ── Axis ticks ──────────────────────────────────────────────────────────────
const yTicks = computed(() => {
  const max = yMax.value
  const steps = 4
  return Array.from({ length: steps + 1 }, (_, i) => (max / steps) * i).reverse()
})

const xTicks = computed(() => {
  const count = 5
  const step = (xMax.value - xMin.value) / (count - 1)
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

function fmtFullDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

const isEmpty = computed(() => pastSeries.value.length === 0 && props.currentValueUsd < 0.01)
</script>

<template>
  <Card>
    <CardContent class="p-5">
      <div class="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h3 class="text-sm font-semibold">Performance & projection</h3>
          <p class="text-[11px] text-muted-foreground/60 mt-0.5">
            Cost basis (past) · live value · projected at {{ (apy * 100).toFixed(2) }}% APY (future)
          </p>
        </div>
        <!-- Range toggle -->
        <div class="flex gap-1 bg-muted/40 rounded-lg p-0.5">
          <button
            v-for="r in RANGES" :key="r"
            class="px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors"
            :class="range === r ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
            @click="range = r"
          >{{ r }}</button>
        </div>
      </div>

      <!-- Empty state -->
      <div v-if="isEmpty" class="flex flex-col items-center justify-center py-14 text-center">
        <Icon name="lucide:line-chart" class="w-8 h-8 text-muted-foreground/40 mb-2" />
        <p class="text-sm text-muted-foreground">No activity yet</p>
        <p class="text-xs text-muted-foreground/50 mt-1">Make a deposit to see your performance chart</p>
      </div>

      <!-- Chart -->
      <svg v-else :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" class="w-full h-auto">
        <defs>
          <linearGradient id="pocketPastGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="currentColor" stop-opacity="0.25" />
            <stop offset="100%" stop-color="currentColor" stop-opacity="0" />
          </linearGradient>
        </defs>

        <!-- Y grid + labels -->
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

        <!-- X labels -->
        <g class="text-muted-foreground/60" font-size="10">
          <text
            v-for="(tick, i) in xTicks" :key="'xlabel-' + i"
            :x="x(tick)" :y="HEIGHT - 10"
            text-anchor="middle" fill="currentColor"
          >{{ fmtDate(tick) }}</text>
        </g>

        <!-- "Now" vertical separator -->
        <line
          :x1="x(Date.now())" :y1="PADDING.top"
          :x2="x(Date.now())" :y2="PADDING.top + plotH"
          stroke="currentColor" stroke-width="0.8" stroke-dasharray="2 3"
          class="text-muted-foreground/50"
        />
        <text
          :x="x(Date.now())" :y="PADDING.top - 8"
          text-anchor="middle" font-size="9" font-weight="600"
          class="text-muted-foreground" fill="currentColor"
        >NOW</text>

        <!-- Goal horizontal line -->
        <g v-if="targetAmount && targetAmount <= yMax">
          <line
            :x1="PADDING.left" :y1="y(targetAmount)"
            :x2="WIDTH - PADDING.right" :y2="y(targetAmount)"
            stroke="currentColor" stroke-width="1" stroke-dasharray="4 3"
            class="text-amber-400/50"
          />
          <text
            :x="WIDTH - PADDING.right - 4" :y="y(targetAmount) - 4"
            text-anchor="end" font-size="9" font-weight="600"
            class="text-amber-400" fill="currentColor"
          >🎯 Goal {{ fmtUsdShort(targetAmount) }}</text>
        </g>

        <!-- Past area + line -->
        <path :d="pastAreaPath" fill="url(#pocketPastGradient)" class="text-primary" />
        <path
          :d="pastPath" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linejoin="round" class="text-primary/80"
        />

        <!-- Past tx markers -->
        <g>
          <circle
            v-for="(pt, i) in pastSeries" :key="'pt-' + i"
            :cx="x(pt.t)" :cy="y(pt.v)" r="2.5"
            fill="currentColor" class="text-primary"
          />
        </g>

        <!-- Future projection (dashed) -->
        <path
          :d="futurePath" fill="none" stroke="currentColor" stroke-width="2"
          stroke-dasharray="5 4" stroke-linejoin="round"
          class="text-primary/60"
        />

        <!-- Current value anchor (pulsing) -->
        <g v-if="currentValueUsd > 0">
          <circle
            :cx="x(Date.now())" :cy="y(currentValueUsd)"
            r="5" fill="currentColor" class="text-primary"
          />
          <circle
            :cx="x(Date.now())" :cy="y(currentValueUsd)"
            r="8" fill="none" stroke="currentColor" stroke-width="1.5"
            class="text-primary" opacity="0.5"
          >
            <animate attributeName="r" values="6;12;6" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.6;0;0.6" dur="2s" repeatCount="indefinite" />
          </circle>
          <text
            :x="x(Date.now()) + 12" :y="y(currentValueUsd) + 4"
            font-size="11" font-weight="600"
            class="text-primary" fill="currentColor"
          >${{ currentValueUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</text>
        </g>

        <!-- Goal intersection marker -->
        <g v-if="goalIntersection">
          <circle
            :cx="x(goalIntersection.t)" :cy="y(goalIntersection.v)"
            r="5" fill="currentColor" stroke="white" stroke-width="1.5"
            class="text-amber-400"
          />
          <text
            :x="x(goalIntersection.t)" :y="y(goalIntersection.v) - 12"
            text-anchor="middle" font-size="10" font-weight="600"
            class="text-amber-400" fill="currentColor"
          >📅 {{ fmtFullDate(goalIntersection.t) }}</text>
        </g>
      </svg>

      <p class="text-[10px] text-muted-foreground/50 mt-3 text-center">
        Projection assumes APY stays constant — actual returns may vary
      </p>
    </CardContent>
  </Card>
</template>
