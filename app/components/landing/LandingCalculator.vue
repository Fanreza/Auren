<script setup lang="ts">
import { BRAND } from '~/config/brand'
import { useIntersectionObserver } from '@vueuse/core'

const sectionRef = ref<HTMLElement>()
const visible = ref(false)
const { stop } = useIntersectionObserver(sectionRef, ([entry]) => {
  if (entry?.isIntersecting) { visible.value = true; stop() }
}, { threshold: 0.1 })

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
  <section id="calculator" ref="sectionRef" class="py-24 sm:py-32">
    <div class="max-w-3xl mx-auto px-5 sm:px-6 lg:px-8">

      <!-- Header -->
      <div
        class="text-center mb-12 transition-all duration-700 ease-out"
        :class="visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'"
      >
        <p class="text-xs font-semibold text-primary uppercase tracking-[0.2em] mb-3">Calculator</p>
        <h2 class="text-3xl sm:text-4xl font-bold tracking-[-0.03em]">
          Watch your pocket grow
        </h2>
        <p class="mt-4 text-muted-foreground">
          Adjust the sliders to see what consistent saving adds up to.
        </p>
      </div>

      <!-- Card -->
      <div
        class="rounded-2xl bg-card border border-border p-6 sm:p-8 space-y-8 transition-all duration-700 ease-out"
        :class="visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'"
        style="transition-delay: 150ms"
      >

        <!-- Monthly deposit slider -->
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <label class="text-sm font-medium text-muted-foreground">Monthly deposit</label>
            <span class="text-2xl font-bold font-mono text-primary">{{ formatUsd(monthlyAmount) }}</span>
          </div>
          <input
            v-model.number="monthlyAmount"
            type="range" min="10" max="5000" step="10"
            class="w-full h-1.5 bg-secondary rounded-full appearance-none cursor-pointer accent-primary
                   [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
                   [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary
                   [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:shadow-primary/30"
          />
          <div class="flex justify-between text-xs text-muted-foreground/50">
            <span>$10</span><span>$5,000</span>
          </div>
        </div>

        <!-- Duration slider -->
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <label class="text-sm font-medium text-muted-foreground">Save for</label>
            <span class="text-2xl font-bold font-mono text-primary">{{ durationLabel }}</span>
          </div>
          <input
            v-model.number="months"
            type="range" min="1" max="60" step="1"
            class="w-full h-1.5 bg-secondary rounded-full appearance-none cursor-pointer accent-primary
                   [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
                   [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary
                   [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:shadow-primary/30"
          />
          <div class="flex justify-between text-xs text-muted-foreground/50">
            <span>1 month</span><span>5 years</span>
          </div>
        </div>

        <div class="h-px bg-border" />

        <!-- Results -->
        <div class="space-y-5">
          <div class="text-center">
            <p class="text-sm text-muted-foreground mb-2">Your savings could grow to</p>
            <p class="text-5xl sm:text-6xl font-bold font-mono text-primary">
              {{ formatUsd(totalWithYield) }}
            </p>
            <p class="text-sm text-muted-foreground mt-2">
              from <span class="text-foreground font-medium">{{ formatUsd(totalDeposited) }}</span> deposited
            </p>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="rounded-xl bg-primary/8 border border-primary/15 p-4 text-center">
              <p class="text-xs text-muted-foreground mb-1.5">With {{ BRAND.name }}</p>
              <p class="text-lg font-bold font-mono text-primary">+{{ formatUsd(appEarnings) }}</p>
              <p class="text-[11px] text-muted-foreground/70 mt-0.5">~5% APY</p>
            </div>
            <div class="rounded-xl bg-secondary border border-border p-4 text-center">
              <p class="text-xs text-muted-foreground mb-1.5">Traditional bank</p>
              <p class="text-lg font-bold font-mono text-muted-foreground">+{{ formatUsd(bankEarnings) }}</p>
              <p class="text-[11px] text-muted-foreground/70 mt-0.5">~2% APY</p>
            </div>
          </div>

          <div v-if="extraEarnings > 0.01" class="rounded-xl bg-primary/6 border border-primary/12 p-4 text-center">
            <p class="text-sm text-muted-foreground">
              That's <span class="font-bold text-primary text-base">{{ formatUsd(extraEarnings) }} more</span> than a bank account over {{ durationLabel }}
            </p>
          </div>
        </div>

      </div>
    </div>
  </section>
</template>
