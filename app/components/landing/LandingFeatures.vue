<script setup lang="ts">
import { useIntersectionObserver } from '@vueuse/core'

const sectionRef = ref<HTMLElement>()
const visible = ref(false)
const { stop } = useIntersectionObserver(sectionRef, ([entry]) => {
  if (entry?.isIntersecting) { visible.value = true; stop() }
}, { threshold: 0.1 })

// Mock pocket cards to visualise the concept
const pockets = [
  {
    emoji: '🏖️',
    name: 'Vacation Fund',
    target: 3000,
    current: 1247,
    strategy: 'Conservative',
    strategyColor: 'text-brand-sage',
    strategyBg: 'bg-brand-sage/10 border-brand-sage/20',
    apy: '4.8%',
    months: '3 months in',
  },
  {
    emoji: '🏠',
    name: 'House Deposit',
    target: 20000,
    current: 8540,
    strategy: 'Balanced',
    strategyColor: 'text-brand-teal',
    strategyBg: 'bg-brand-teal/10 border-brand-teal/20',
    apy: '6.2%',
    months: '11 months in',
  },
  {
    emoji: '🛡️',
    name: 'Emergency Fund',
    target: 5000,
    current: 5000,
    strategy: 'Conservative',
    strategyColor: 'text-brand-sage',
    strategyBg: 'bg-brand-sage/10 border-brand-sage/20',
    apy: '4.8%',
    months: 'Goal reached',
  },
]

function progress(current: number, target: number) {
  return Math.min(100, Math.round((current / target) * 100))
}

function fmt(n: number) {
  return '$' + n.toLocaleString('en-US')
}
</script>

<template>
  <section
    id="what-is-a-pocket"
    ref="sectionRef"
    class="py-24 sm:py-32"
  >
    <div class="max-w-6xl mx-auto px-5 sm:px-6 lg:px-8">

      <!-- Header -->
      <div
        class="max-w-2xl mb-16 transition-all duration-700 ease-out"
        :class="visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'"
      >
        <p class="text-xs font-semibold text-primary uppercase tracking-[0.2em] mb-3">
          Core concept
        </p>
        <h2 class="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-[-0.03em] mb-5">
          One goal.<br />One pocket.
        </h2>
        <p class="text-muted-foreground text-base sm:text-lg leading-relaxed">
          A pocket is a savings container for a specific goal. Give it a name, set a target,
          pick a growth strategy, and deposit. That's it. Each pocket tracks its own progress,
          earns its own yield, and can be withdrawn independently — any time.
        </p>
      </div>

      <!-- Pocket cards -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-5">
        <div
          v-for="(pocket, i) in pockets"
          :key="pocket.name"
          class="rounded-2xl bg-card border border-border p-5 sm:p-6 transition-all duration-700 ease-out"
          :class="visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'"
          :style="{ transitionDelay: visible ? `${160 + i * 110}ms` : '0ms' }"
        >
          <!-- Header row -->
          <div class="flex items-start justify-between mb-5">
            <div class="flex items-center gap-2.5">
              <div class="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-xl">
                {{ pocket.emoji }}
              </div>
              <div>
                <p class="font-semibold text-sm text-foreground leading-tight">{{ pocket.name }}</p>
                <p class="text-xs text-muted-foreground mt-0.5">{{ pocket.months }}</p>
              </div>
            </div>
            <span class="text-xs font-semibold text-primary">{{ pocket.apy }} APY</span>
          </div>

          <!-- Progress bar -->
          <div class="mb-3">
            <div class="flex justify-between text-xs text-muted-foreground mb-1.5">
              <span>{{ fmt(pocket.current) }}</span>
              <span>{{ fmt(pocket.target) }}</span>
            </div>
            <div class="h-1.5 bg-secondary rounded-full overflow-hidden">
              <div
                class="h-full bg-primary rounded-full transition-all duration-1000 ease-out"
                :style="{ width: visible ? `${progress(pocket.current, pocket.target)}%` : '0%' }"
              />
            </div>
            <p class="text-xs text-muted-foreground mt-1.5 text-right">
              {{ progress(pocket.current, pocket.target) }}% of goal
            </p>
          </div>

          <!-- Strategy badge -->
          <span
            class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border"
            :class="[pocket.strategyBg, pocket.strategyColor]"
          >
            {{ pocket.strategy }}
          </span>
        </div>
      </div>

      <!-- Caption -->
      <p
        class="mt-8 text-center text-sm text-muted-foreground/60 transition-all duration-700 ease-out"
        :class="visible ? 'opacity-100' : 'opacity-0'"
        style="transition-delay: 500ms"
      >
        Example pockets — your real data lives here when you sign in
      </p>

    </div>
  </section>
</template>
