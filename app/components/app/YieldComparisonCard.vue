<script setup lang="ts">
import { BRAND } from '~/config/brand'

const props = defineProps<{
  totalValueUsd: number
  averageApy: number
}>()

const BANK_APY = 2

const yearlyAuren = computed(() => props.totalValueUsd * (props.averageApy / 100))
const yearlyBank = computed(() => props.totalValueUsd * (BANK_APY / 100))
const extraPerYear = computed(() => yearlyAuren.value - yearlyBank.value)

function formatUsd(v: number): string {
  if (v < 0.01) return '$0.00'
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
</script>

<template>
  <div
    v-if="totalValueUsd > 0 && averageApy > 0"
    class="rounded-xl border border-primary/20 bg-primary/5 p-4"
  >
    <div class="flex items-center gap-2 mb-3">
      <Icon name="lucide:trending-up" class="w-4 h-4 text-primary" />
      <p class="text-sm font-semibold">You're earning more</p>
    </div>
    <div class="grid grid-cols-2 gap-3">
      <div>
        <p class="text-[11px] text-muted-foreground mb-0.5">{{ BRAND.name }} (~{{ averageApy.toFixed(1) }}%)</p>
        <p class="text-lg font-bold font-mono text-primary">{{ formatUsd(yearlyAuren) }}</p>
        <p class="text-[11px] text-muted-foreground">per year</p>
      </div>
      <div>
        <p class="text-[11px] text-muted-foreground mb-0.5">Bank (~{{ BANK_APY }}%)</p>
        <p class="text-lg font-bold font-mono text-muted-foreground">{{ formatUsd(yearlyBank) }}</p>
        <p class="text-[11px] text-muted-foreground">per year</p>
      </div>
    </div>
    <p v-if="extraPerYear > 0.01" class="text-xs text-primary mt-3 font-medium">
      That's {{ formatUsd(extraPerYear) }}/year more than a savings account
    </p>
  </div>
</template>
