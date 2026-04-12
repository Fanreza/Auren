<script setup lang="ts">
export interface PaceTx {
  timestamp: number  // ms
  type: 'deposit' | 'withdraw' | 'redeem' | 'switch'
  usdValue: number
}

const props = defineProps<{
  transactions: PaceTx[]
  monthsBack?: number  // default 12
}>()

const monthsBack = computed(() => props.monthsBack ?? 12)

interface Bucket {
  key: string         // YYYY-MM
  label: string       // "Jan"
  net: number         // deposits - withdrawals
  isCurrentMonth: boolean
}

const buckets = computed<Bucket[]>(() => {
  const out: Bucket[] = []
  const now = new Date()
  for (let i = monthsBack.value - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    out.push({
      key,
      label: d.toLocaleDateString('en-US', { month: 'short' }),
      net: 0,
      isCurrentMonth: i === 0,
    })
  }

  // Aggregate transactions into buckets
  const byKey: Record<string, Bucket> = {}
  for (const b of out) byKey[b.key] = b

  for (const tx of props.transactions) {
    const d = new Date(tx.timestamp)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const bucket = byKey[key]
    if (!bucket) continue
    if (tx.type === 'deposit') bucket.net += tx.usdValue
    else if (tx.type === 'withdraw' || tx.type === 'redeem') bucket.net -= tx.usdValue
  }

  return out
})

const maxBucket = computed(() => {
  const max = Math.max(...buckets.value.map(b => Math.abs(b.net)), 1)
  return max
})

const totalDeposited = computed(() => buckets.value.reduce((s, b) => s + Math.max(b.net, 0), 0))
const activeMonths = computed(() => buckets.value.filter(b => b.net > 0).length)

function fmtUsd(n: number): string {
  if (n === 0) return '$0'
  if (n < 1) return '<$1'
  if (n >= 1_000) return '$' + (n / 1_000).toFixed(1) + 'K'
  return '$' + n.toFixed(0)
}

function barHeight(net: number): number {
  if (net === 0) return 4
  return Math.max(4, (Math.abs(net) / maxBucket.value) * 100)
}
</script>

<template>
  <Card>
    <CardContent class="p-5">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h3 class="text-sm font-semibold">Deposit pace</h3>
          <p class="text-[11px] text-muted-foreground/60 mt-0.5">Last {{ monthsBack }} months</p>
        </div>
        <div class="text-right">
          <p class="text-sm font-bold tabular-nums">{{ fmtUsd(totalDeposited) }}</p>
          <p class="text-[10px] text-muted-foreground/60">{{ activeMonths }}/{{ monthsBack }} active months</p>
        </div>
      </div>

      <!-- Bar chart -->
      <div class="flex items-end gap-1 h-24 mb-2">
        <div
          v-for="b in buckets" :key="b.key"
          class="flex-1 flex flex-col items-center justify-end group relative"
        >
          <!-- Tooltip on hover -->
          <div
            class="absolute -top-7 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-background border border-border text-[9px] font-semibold tabular-nums opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10"
          >
            {{ fmtUsd(b.net) }}
          </div>

          <div
            class="w-full rounded-t transition-all"
            :class="b.net > 0
              ? (b.isCurrentMonth ? 'bg-primary' : 'bg-primary/60 group-hover:bg-primary')
              : b.net < 0
                ? 'bg-destructive/40 group-hover:bg-destructive/60'
                : 'bg-muted/30'"
            :style="{ height: `${barHeight(b.net)}%` }"
          />
        </div>
      </div>

      <!-- Month labels -->
      <div class="flex gap-1">
        <div
          v-for="b in buckets" :key="b.key + '-label'"
          class="flex-1 text-center text-[9px] text-muted-foreground/60 tabular-nums"
          :class="{ 'font-bold text-primary': b.isCurrentMonth }"
        >
          {{ b.label }}
        </div>
      </div>
    </CardContent>
  </Card>
</template>
