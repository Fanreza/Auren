<script setup lang="ts">
import { BRAND } from '~/config/brand'

const monthlyAmount = ref(100)
const months = ref(12)
const bankRate = 0.02
const appRate = ref(0.05)

const totalDeposited = computed(() => monthlyAmount.value * months.value)

const appEarnings = computed(() => {
  let balance = 0
  const monthlyRate = appRate.value / 12
  for (let i = 0; i < months.value; i++) {
    balance += monthlyAmount.value
    balance *= 1 + monthlyRate
  }
  return balance - totalDeposited.value
})

const bankEarnings = computed(() => {
  let balance = 0
  const monthlyRate = bankRate / 12
  for (let i = 0; i < months.value; i++) {
    balance += monthlyAmount.value
    balance *= 1 + monthlyRate
  }
  return balance - totalDeposited.value
})

const totalWithYield = computed(() => totalDeposited.value + appEarnings.value)
const extraEarnings = computed(() => appEarnings.value - bankEarnings.value)

function formatUsd(v: number): string {
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const durationLabel = computed(() => {
  if (months.value === 1) return '1 month'
  if (months.value < 12) return `${months.value} months`
  const y = Math.floor(months.value / 12)
  const m = months.value % 12
  if (m === 0) return y === 1 ? '1 year' : `${y} years`
  return `${y}y ${m}m`
})
</script>

<template>
  <section id="calculator" class="py-20 sm:py-28 px-4">
    <div class="max-w-3xl mx-auto">
      <div class="text-center mb-12">
        <h2 class="text-3xl sm:text-4xl font-bold tracking-tight mb-3">
          See how much you could earn
        </h2>
        <p class="text-muted-foreground text-lg">
          Move the sliders and watch your savings grow.
        </p>
      </div>

      <div class="rounded-2xl border border-border/50 bg-card p-6 sm:p-8 space-y-8">
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <label class="text-sm font-medium text-muted-foreground">Monthly deposit</label>
            <span class="text-xl font-bold font-mono text-primary">{{ formatUsd(monthlyAmount) }}</span>
          </div>
          <input
            v-model.number="monthlyAmount"
            type="range"
            min="10"
            max="5000"
            step="10"
            class="w-full h-2 bg-muted rounded-full appearance-none cursor-pointer accent-primary [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer"
          >
          <div class="flex justify-between text-[11px] text-muted-foreground/60">
            <span>$10</span>
            <span>$5,000</span>
          </div>
        </div>

        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <label class="text-sm font-medium text-muted-foreground">Save for</label>
            <span class="text-xl font-bold font-mono text-primary">{{ durationLabel }}</span>
          </div>
          <input
            v-model.number="months"
            type="range"
            min="1"
            max="60"
            step="1"
            class="w-full h-2 bg-muted rounded-full appearance-none cursor-pointer accent-primary [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer"
          >
          <div class="flex justify-between text-[11px] text-muted-foreground/60">
            <span>1 month</span>
            <span>5 years</span>
          </div>
        </div>

        <div class="h-px bg-border/50" />

        <div class="space-y-4">
          <div class="text-center">
            <p class="text-sm text-muted-foreground mb-1">Your savings could grow to</p>
            <p class="text-4xl sm:text-5xl font-bold font-mono text-primary">
              {{ formatUsd(totalWithYield) }}
            </p>
            <p class="text-sm text-muted-foreground mt-1">
              from {{ formatUsd(totalDeposited) }} deposited
            </p>
          </div>

          <div class="grid grid-cols-2 gap-3 pt-2">
            <div class="rounded-xl bg-primary/10 border border-primary/20 p-4 text-center">
              <p class="text-xs text-muted-foreground mb-1">With {{ BRAND.name }}</p>
              <p class="text-lg font-bold font-mono text-primary">+{{ formatUsd(appEarnings) }}</p>
              <p class="text-[11px] text-muted-foreground">~5% APY</p>
            </div>
            <div class="rounded-xl bg-muted/60 border border-border/50 p-4 text-center">
              <p class="text-xs text-muted-foreground mb-1">Traditional bank</p>
              <p class="text-lg font-bold font-mono text-muted-foreground">+{{ formatUsd(bankEarnings) }}</p>
              <p class="text-[11px] text-muted-foreground">~2% APY</p>
            </div>
          </div>

          <div v-if="extraEarnings > 0.01" class="text-center pt-2">
            <p class="text-sm">
              That's <span class="font-bold text-primary">{{ formatUsd(extraEarnings) }} more</span> than a bank account
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
