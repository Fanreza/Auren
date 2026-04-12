<script setup lang="ts">
const props = defineProps<{
  yieldEarnedUsd: number
  principal: number          // cumulative deposits − withdrawals (USD)
  currentValueUsd: number
  targetAmount: number | null
  createdAt: string          // ISO timestamp
  recurringAmount?: string | null
}>()

// ── Time-based stats ────────────────────────────────────────────────────────
const daysActive = computed(() => {
  if (!props.createdAt) return 0
  const created = new Date(props.createdAt).getTime()
  return Math.max(1, Math.floor((Date.now() - created) / (1000 * 60 * 60 * 24)))
})

const monthsActive = computed(() => Math.max(1, daysActive.value / 30))

// Average deposit per month based on actual principal
const avgMonthly = computed(() => props.principal / monthsActive.value)

// Pace to goal: how many months until reaching target at current saving rate
const paceMonths = computed(() => {
  if (!props.targetAmount || props.targetAmount <= props.currentValueUsd) return null
  if (avgMonthly.value <= 0) return null
  const remaining = props.targetAmount - props.currentValueUsd
  return remaining / avgMonthly.value
})

const paceLabel = computed(() => {
  if (paceMonths.value === null) {
    if (props.targetAmount && props.currentValueUsd >= props.targetAmount) return 'Goal reached!'
    if (!props.targetAmount) return 'No goal set'
    return 'Need more data'
  }
  const m = paceMonths.value
  if (m < 1) return `~${Math.ceil(m * 30)} days`
  if (m < 12) return `~${Math.ceil(m)} months`
  return `~${(m / 12).toFixed(1)} years`
})

const yieldPercent = computed(() => {
  if (props.principal <= 0) return 0
  return (props.yieldEarnedUsd / props.principal) * 100
})

// ── Formatters ───────────────────────────────────────────────────────────────
function fmtUsd(n: number): string {
  if (n === 0) return '$0.00'
  if (Math.abs(n) < 0.01) return n >= 0 ? '<$0.01' : '-<$0.01'
  return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function fmtDays(n: number): string {
  if (n < 30) return `${n} day${n !== 1 ? 's' : ''}`
  if (n < 365) return `${Math.floor(n / 30)} month${Math.floor(n / 30) !== 1 ? 's' : ''}`
  const years = (n / 365).toFixed(1)
  return `${years} year${parseFloat(years) !== 1 ? 's' : ''}`
}

const yieldPositive = computed(() => props.yieldEarnedUsd >= 0)
</script>

<template>
  <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
    <!-- Yield earned -->
    <Card>
      <CardContent class="p-4">
        <div class="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
          <Icon name="lucide:trending-up" class="w-3.5 h-3.5" />
          <span class="uppercase tracking-wider">Yield earned</span>
        </div>
        <p class="text-xl font-bold tabular-nums" :class="yieldPositive ? 'text-primary' : 'text-destructive'">
          {{ yieldPositive ? '+' : '' }}{{ fmtUsd(yieldEarnedUsd) }}
        </p>
        <p class="text-[11px] text-muted-foreground/60 mt-1 tabular-nums">
          {{ yieldPositive ? '+' : '' }}{{ yieldPercent.toFixed(2) }}% return
        </p>
      </CardContent>
    </Card>

    <!-- Avg monthly -->
    <Card>
      <CardContent class="p-4">
        <div class="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
          <Icon name="lucide:calendar" class="w-3.5 h-3.5" />
          <span class="uppercase tracking-wider">Avg / month</span>
        </div>
        <p class="text-xl font-bold tabular-nums">{{ fmtUsd(avgMonthly) }}</p>
        <p class="text-[11px] text-muted-foreground/60 mt-1">
          <template v-if="recurringAmount">
            Target: ${{ parseFloat(recurringAmount).toLocaleString('en-US') }}
          </template>
          <template v-else>
            Set a reminder to plan
          </template>
        </p>
      </CardContent>
    </Card>

    <!-- Days saving -->
    <Card>
      <CardContent class="p-4">
        <div class="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
          <Icon name="lucide:flame" class="w-3.5 h-3.5" />
          <span class="uppercase tracking-wider">Days saving</span>
        </div>
        <p class="text-xl font-bold tabular-nums">{{ daysActive }}</p>
        <p class="text-[11px] text-muted-foreground/60 mt-1">
          since {{ fmtDays(daysActive) }} ago
        </p>
      </CardContent>
    </Card>

    <!-- Pace to goal -->
    <Card>
      <CardContent class="p-4">
        <div class="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
          <Icon name="lucide:target" class="w-3.5 h-3.5" />
          <span class="uppercase tracking-wider">Pace to goal</span>
        </div>
        <p class="text-xl font-bold tabular-nums">{{ paceLabel }}</p>
        <p class="text-[11px] text-muted-foreground/60 mt-1">
          <template v-if="paceMonths !== null">at current rate</template>
          <template v-else-if="targetAmount && currentValueUsd >= targetAmount">
            <Icon name="lucide:check" class="w-3 h-3 inline text-primary" />
          </template>
          <template v-else>—</template>
        </p>
      </CardContent>
    </Card>
  </div>
</template>
