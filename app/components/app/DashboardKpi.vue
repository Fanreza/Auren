<script setup lang="ts">
import { useCurrency } from '~/composables/useCurrency'

const props = defineProps<{
  totalValueUsd: number
  netContributedUsd: number
  unrealizedPnlUsd: number
  pnlPercent: number
  avgApy: number
  projectedAnnualUsd: number
  loading?: boolean
}>()

const { format } = useCurrency()

function fmtUsd(n: number): string {
  return format(n)
}

/** Dual-unit PnL display: "{localized} / X.XX USDC" */
function fmtDual(n: number): string {
  const sign = n < 0 ? '' : '+'
  const localized = format(n, { signDisplay: 'always' })
  const usdcAbs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${localized} / ${sign}${usdcAbs} USDC`
}

function fmtPct(n: number): string {
  if (!isFinite(n) || isNaN(n)) return '—'
  const sign = n > 0 ? '+' : ''
  return sign + n.toFixed(2) + '%'
}

const pnlZero = computed(() => Math.abs(props.unrealizedPnlUsd) < 0.005)
const pnlPositive = computed(() => !pnlZero.value && props.unrealizedPnlUsd > 0)
const pnlNegative = computed(() => !pnlZero.value && props.unrealizedPnlUsd < 0)

const pnlBorderClass = computed(() => {
  if (pnlZero.value) return 'border-border/60 bg-muted/20'
  return pnlPositive.value ? 'border-primary/30 bg-primary/5' : 'border-destructive/30 bg-destructive/5'
})
const pnlLabelClass = computed(() => {
  if (pnlZero.value) return 'text-muted-foreground'
  return pnlPositive.value ? 'text-primary/80' : 'text-destructive/80'
})
const pnlValueClass = computed(() => {
  if (pnlZero.value) return 'text-foreground'
  return pnlPositive.value ? 'text-primary' : 'text-destructive'
})
const pnlSubClass = computed(() => {
  if (pnlZero.value) return 'text-muted-foreground/60'
  return pnlPositive.value ? 'text-primary/60' : 'text-destructive/60'
})
const pnlIcon = computed(() => {
  if (pnlZero.value) return 'lucide:minus'
  return pnlPositive.value ? 'lucide:trending-up' : 'lucide:trending-down'
})
</script>

<template>
  <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
    <!-- Total Saved -->
    <div class="rounded-2xl border border-border/60 bg-muted/20 p-4">
      <div class="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
        <Icon name="lucide:wallet" class="w-3.5 h-3.5" />
        <span class="uppercase tracking-wider">Total saved</span>
      </div>
      <p class="text-2xl font-bold tabular-nums">{{ fmtUsd(totalValueUsd) }}</p>
      <p class="text-[11px] text-muted-foreground/60 mt-1">across all pockets</p>
    </div>

    <!-- Net Contributed -->
    <div class="rounded-2xl border border-border/60 bg-muted/20 p-4">
      <div class="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
        <Icon name="lucide:arrow-down-to-line" class="w-3.5 h-3.5" />
        <span class="uppercase tracking-wider">Net in</span>
        <AppHelpTip term="cost_basis" />
      </div>
      <p class="text-2xl font-bold tabular-nums">{{ fmtUsd(netContributedUsd) }}</p>
      <p class="text-[11px] text-muted-foreground/60 mt-1">deposits − withdrawals</p>
    </div>

    <!-- Unrealized PnL (dual-unit) -->
    <div class="rounded-2xl border p-4" :class="pnlBorderClass">
      <div class="flex items-center gap-1.5 text-xs mb-2" :class="pnlLabelClass">
        <Icon :name="pnlIcon" class="w-3.5 h-3.5" />
        <span class="uppercase tracking-wider">Unrealized PnL</span>
        <AppHelpTip term="unrealized_pnl" />
      </div>
      <p class="text-lg font-bold tabular-nums leading-tight" :class="pnlValueClass">
        {{ fmtDual(unrealizedPnlUsd) }}
      </p>
      <p class="text-[11px] mt-1" :class="pnlSubClass">
        {{ fmtPct(pnlPercent) }} · at current prices
      </p>
    </div>

    <!-- Projected 12mo -->
    <div class="rounded-2xl border border-border/60 bg-muted/20 p-4">
      <div class="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
        <Icon name="lucide:sparkles" class="w-3.5 h-3.5" />
        <span class="uppercase tracking-wider">Projected 12mo</span>
      </div>
      <p class="text-2xl font-bold tabular-nums text-primary">{{ fmtUsd(projectedAnnualUsd) }}</p>
      <p class="text-[11px] text-muted-foreground/60 mt-1">
        at {{ avgApy.toFixed(2) }}% avg APY
      </p>
    </div>
  </div>
</template>
