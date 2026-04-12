<script setup lang="ts">
import { formatUnits } from 'viem'
import { STRATEGIES, type StrategyKey } from '~/config/strategies'
import { useCurrency } from '~/composables/useCurrency'
import type { DbPocket } from '~/types/database'

const { format: fmtCurrency } = useCurrency()

const props = defineProps<{
  pocket: DbPocket
  position: { shares: bigint; value: bigint }
  assetPrice: number
  apy: string | null
  profit?: string | null
  loading?: boolean
}>()

defineEmits<{
  click: []
  deposit: []
  withdraw: []
  delete: []
  schedule: []
}>()

const STRATEGY_CONFIG: Record<string, {
  label: string
  icon: string
  gradient: string
  accentColor: string
  dotColor: string
}> = {
  conservative: {
    label: 'Savings',
    icon: 'lucide:shield',
    gradient: 'from-emerald-950/80 via-card to-card',
    accentColor: 'text-emerald-400',
    dotColor: 'bg-emerald-400',
  },
  balanced: {
    label: 'Growth',
    icon: 'lucide:scale',
    gradient: 'from-blue-950/80 via-card to-card',
    accentColor: 'text-blue-400',
    dotColor: 'bg-blue-400',
  },
  aggressive: {
    label: 'High Growth',
    icon: 'lucide:zap',
    gradient: 'from-violet-950/80 via-card to-card',
    accentColor: 'text-violet-400',
    dotColor: 'bg-violet-400',
  },
}

const PROGRESS_COLOR: Record<string, string> = {
  conservative: 'bg-emerald-500',
  balanced: 'bg-blue-500',
  aggressive: 'bg-violet-500',
}

const config = computed(() => (STRATEGY_CONFIG[props.pocket.strategy_key] ?? STRATEGY_CONFIG.conservative) as NonNullable<typeof STRATEGY_CONFIG[string]>)
const strategy = computed(() => STRATEGIES[props.pocket.strategy_key as StrategyKey])

const assetValue = computed(() => {
  if (!props.position || props.position.value === 0n || !strategy.value) return 0
  return parseFloat(formatUnits(props.position.value, strategy.value.decimals))
})

const usdValue = computed(() => assetValue.value * props.assetPrice)

const progressRaw = computed(() => {
  if (!props.pocket.target_amount || props.pocket.target_amount === 0) return 0
  if (usdValue.value === 0) return 0
  return Math.min((usdValue.value / props.pocket.target_amount) * 100, 100)
})

const apyFormatted = computed(() => {
  if (!props.apy) return null
  const val = parseFloat(props.apy)
  if (isNaN(val)) return null
  return val.toFixed(1) + '%'
})

const timelineDisplay = computed(() => {
  if (!props.pocket.timeline) return null
  const target = new Date(props.pocket.timeline)
  const now = new Date()
  const diffDays = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  const dateStr = target.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  if (diffDays < 0) return { label: 'Past due', urgent: true }
  if (diffDays === 0) return { label: 'Due today', urgent: true }
  if (diffDays <= 30) return { label: `${diffDays}d left`, urgent: false }
  return { label: dateStr, urgent: false }
})

const reminderInfo = computed(() => {
  if (!props.pocket.recurring_next_due) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(props.pocket.recurring_next_due + 'T00:00:00')
  const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  // Optional amount preview
  const amount = props.pocket.recurring_amount
    ? '$' + parseFloat(props.pocket.recurring_amount).toLocaleString('en-US', { maximumFractionDigits: 2 })
    : null

  if (diffDays < 0) return { label: 'Reminder overdue', urgent: true, amount }
  if (diffDays === 0) return { label: 'Reminder today', urgent: true, amount }
  if (diffDays === 1) return { label: 'Reminder tomorrow', urgent: true, amount }
  if (diffDays <= 7) return { label: `Reminder in ${diffDays} days`, urgent: false, amount }
  return null  // hide if more than a week away
})

// Backwards compat: small dot still pulses when very urgent
const reminderDue = computed(() => reminderInfo.value?.urgent === true)

function displayUsd(value: number): string {
  return fmtCurrency(value)
}
</script>

<template>
  <div
    class="relative rounded-2xl overflow-hidden cursor-pointer active:scale-[0.98] transition-transform duration-150 select-none"
    @click="$emit('click')"
  >
    <!-- Card background with strategy gradient -->
    <div
      class="absolute inset-0 bg-linear-to-br"
      :class="config.gradient"
    />
    <!-- Subtle border -->
    <div class="absolute inset-0 rounded-2xl ring-1 ring-white/5" />

    <div class="relative p-5">
      <!-- Top row: icon + name + APY -->
      <div class="flex items-start justify-between mb-5">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
            <Icon :name="config.icon" class="w-4.5 h-4.5" :class="config.accentColor" />
          </div>
          <div>
            <h3 class="font-semibold text-[15px] leading-tight">{{ pocket.name }}</h3>
            <p class="text-xs text-muted-foreground mt-0.5">{{ config.label }}</p>
          </div>
        </div>

        <!-- APY badge -->
        <div class="flex flex-col items-end gap-1">
          <Skeleton v-if="loading" class="h-5 w-16 rounded-full" />
          <div
            v-else-if="apyFormatted"
            class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
            :class="{
              'bg-emerald-500/15 text-emerald-400': pocket.strategy_key === 'conservative',
              'bg-blue-500/15 text-blue-400': pocket.strategy_key === 'balanced',
              'bg-violet-500/15 text-violet-400': pocket.strategy_key === 'aggressive',
            }"
          >
            {{ apyFormatted }} APY
          </div>
          <!-- Reminder dot -->
          <div v-if="reminderDue" class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse-soft" />
        </div>
      </div>

      <!-- Balance -->
      <div class="mb-4">
        <Skeleton v-if="loading" class="h-9 w-28 mb-1" />
        <p v-else class="text-3xl font-bold tracking-tight tabular-nums">
          {{ displayUsd(usdValue) }}
        </p>
        <p class="text-xs text-muted-foreground mt-0.5">
          <template v-if="loading">
            <Skeleton class="h-3.5 w-36 inline-block" />
          </template>
          <template v-else>
            {{ pocket.target_amount ? `${displayUsd(usdValue)} of ${displayUsd(pocket.target_amount)}` : `${strategy?.assetSymbol} vault` }}
            <span v-if="timelineDisplay" class="ml-1.5" :class="timelineDisplay.urgent ? 'text-amber-400' : ''">
              · {{ timelineDisplay.label }}
            </span>
          </template>
        </p>
      </div>

      <!-- Progress bar (only if has target) -->
      <div v-if="pocket.target_amount" class="mb-5">
        <div class="h-1.5 rounded-full bg-white/8 overflow-hidden">
          <div
            v-if="!loading"
            class="h-full rounded-full transition-all duration-700"
            :class="PROGRESS_COLOR[pocket.strategy_key]"
            :style="{ width: `${progressRaw}%` }"
          />
        </div>
        <div class="flex justify-between mt-1">
          <span class="text-[10px] text-muted-foreground">{{ Math.round(progressRaw) }}% saved</span>
          <span class="text-[10px] text-muted-foreground">{{ displayUsd(pocket.target_amount) }} goal</span>
        </div>
      </div>

      <!-- Reminder banner (when next deposit is due within 7 days) -->
      <div
        v-if="reminderInfo"
        class="mb-3 flex items-center gap-2 px-3 py-2 rounded-xl border"
        :class="reminderInfo.urgent
          ? 'bg-amber-500/10 border-amber-500/30'
          : 'bg-white/5 border-white/10'"
      >
        <Icon
          name="lucide:bell"
          class="w-3.5 h-3.5 shrink-0"
          :class="reminderInfo.urgent ? 'text-amber-400' : 'text-muted-foreground'"
        />
        <div class="flex-1 min-w-0 flex items-baseline gap-1.5">
          <span
            class="text-[11px] font-semibold"
            :class="reminderInfo.urgent ? 'text-amber-300' : 'text-foreground/80'"
          >{{ reminderInfo.label }}</span>
          <span v-if="reminderInfo.amount" class="text-[10px] text-muted-foreground/70 truncate">
            · {{ reminderInfo.amount }}
          </span>
        </div>
        <button
          class="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md transition-colors"
          :class="reminderInfo.urgent
            ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
            : 'bg-white/10 text-foreground/70 hover:bg-white/15'"
          @click.stop="$emit('deposit')"
        >
          Add now
        </button>
      </div>

      <!-- Action row -->
      <div class="flex items-center gap-2" @click.stop>
        <button
          class="flex-1 h-9 rounded-xl bg-white/8 hover:bg-white/12 active:bg-white/6 transition-colors text-xs font-medium flex items-center justify-center gap-1.5"
          @click="$emit('deposit')"
        >
          <Icon name="lucide:plus" class="w-3.5 h-3.5" />
          Add
        </button>
        <button
          class="flex-1 h-9 rounded-xl bg-white/8 hover:bg-white/12 active:bg-white/6 transition-colors text-xs font-medium flex items-center justify-center gap-1.5"
          @click="$emit('withdraw')"
        >
          <Icon name="lucide:arrow-up" class="w-3.5 h-3.5" />
          Withdraw
        </button>
        <button
          class="w-9 h-9 rounded-xl bg-white/8 hover:bg-white/12 active:bg-white/6 transition-colors flex items-center justify-center"
          :class="pocket.recurring_day != null ? config.accentColor : 'text-muted-foreground'"
          @click="$emit('schedule')"
        >
          <Icon name="lucide:bell" class="w-3.5 h-3.5" />
        </button>
        <button
          class="w-9 h-9 rounded-xl bg-white/8 hover:bg-red-500/20 active:bg-red-500/10 transition-colors text-muted-foreground hover:text-red-400 flex items-center justify-center"
          @click="$emit('delete')"
        >
          <Icon name="lucide:trash-2" class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  </div>
</template>
