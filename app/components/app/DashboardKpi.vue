<script setup lang="ts">
const props = defineProps<{
  totalValueUsd: number
  netContributedUsd: number
  unrealizedPnlUsd: number
  pnlPercent: number
  avgApy: number
  projectedAnnualUsd: number
  loading?: boolean
}>()

/** Format as "$12.34" for USD. */
function fmtUsd(n: number): string {
  const abs = Math.abs(n)
  if (abs < 0.01 && abs > 0) return (n >= 0 ? '' : '-') + '$<0.01'
  return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** Dual-unit PnL display: "$0.20 / 0.20 USDC" */
function fmtDual(n: number): string {
  const sign = n < 0 ? '-' : '+'
  const abs = Math.abs(n)
  if (abs < 0.01) return sign + '$0.00 / 0.00 USDC'
  const s = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${sign}$${s} / ${s} USDC`
}

function fmtPct(n: number): string {
  if (!isFinite(n) || isNaN(n)) return '—'
  const sign = n > 0 ? '+' : ''
  return sign + n.toFixed(2) + '%'
}

const pnlPositive = computed(() => props.unrealizedPnlUsd >= 0)
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
      </div>
      <p class="text-2xl font-bold tabular-nums">{{ fmtUsd(netContributedUsd) }}</p>
      <p class="text-[11px] text-muted-foreground/60 mt-1">deposits − withdrawals</p>
    </div>

    <!-- Unrealized PnL (dual-unit) -->
    <div
      class="rounded-2xl border p-4"
      :class="pnlPositive ? 'border-primary/30 bg-primary/5' : 'border-destructive/30 bg-destructive/5'"
    >
      <div class="flex items-center gap-1.5 text-xs mb-2" :class="pnlPositive ? 'text-primary/80' : 'text-destructive/80'">
        <Icon :name="pnlPositive ? 'lucide:trending-up' : 'lucide:trending-down'" class="w-3.5 h-3.5" />
        <span class="uppercase tracking-wider">Unrealized PnL</span>
      </div>
      <p class="text-lg font-bold tabular-nums leading-tight" :class="pnlPositive ? 'text-primary' : 'text-destructive'">
        {{ fmtDual(unrealizedPnlUsd) }}
      </p>
      <p class="text-[11px] mt-1" :class="pnlPositive ? 'text-primary/60' : 'text-destructive/60'">
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
