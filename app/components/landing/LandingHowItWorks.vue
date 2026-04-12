<script setup lang="ts">
import { useIntersectionObserver } from '@vueuse/core'

const sectionRef = ref<HTMLElement>()
const visible = ref(false)
const { stop } = useIntersectionObserver(sectionRef, ([entry]) => {
  if (entry?.isIntersecting) { visible.value = true; stop() }
}, { threshold: 0.1 })

const steps = [
  {
    number: '01',
    icon: 'lucide:target',
    title: 'Create a pocket',
    description: 'Give it a name, set a savings goal, and pick a yield strategy. Conservative keeps you in stablecoins. Balanced rides Bitcoin. Aggressive goes full Ethereum.',
    tag: 'Takes 30 seconds',
    tagIcon: 'lucide:clock',
  },
  {
    number: '02',
    icon: 'lucide:send',
    title: 'Deposit from any chain',
    description: 'Connect any wallet on any network. Send USDT on Polygon, ETH on Arbitrum, USDC anywhere — whatever you have. LI.FI routes it to the vault automatically.',
    tag: 'No bridging needed',
    tagIcon: 'lucide:zap',
  },
  {
    number: '03',
    icon: 'lucide:trending-up',
    title: 'Watch it grow',
    description: 'Your deposit earns real yield inside audited DeFi vaults — Morpho, Aave, and others. Yield compounds daily. Withdraw any amount, any time, with zero penalties.',
    tag: 'Real yield, daily',
    tagIcon: 'lucide:coins',
  },
]
</script>

<template>
  <section
    id="how-it-works"
    ref="sectionRef"
    class="py-24 sm:py-32 relative overflow-hidden"
  >
    <!-- BG glow -->
    <div class="absolute inset-0 pointer-events-none" aria-hidden="true">
      <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-150 h-64 rounded-full bg-primary/4 blur-[120px]" />
    </div>

    <div class="relative max-w-6xl mx-auto px-5 sm:px-6 lg:px-8">

      <!-- Header -->
      <div
        class="text-center mb-16 transition-all duration-700 ease-out"
        :class="visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'"
      >
        <p class="text-xs font-semibold text-primary uppercase tracking-[0.2em] mb-3">How it works</p>
        <h2 class="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-[-0.03em]">
          Three steps. That's it.
        </h2>
        <p class="mt-4 text-muted-foreground max-w-md mx-auto">
          The complexity is ours. The yield is yours.
        </p>
      </div>

      <!-- Steps -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-6 relative">

        <!-- Connecting line (desktop only) -->
        <div class="hidden md:block absolute top-9 left-[calc(33.333%+1rem)] right-[calc(33.333%+1rem)] h-px border-t border-dashed border-border/50" aria-hidden="true" />

        <div
          v-for="(step, i) in steps"
          :key="step.number"
          class="relative rounded-2xl bg-card border border-border p-7 transition-all duration-700 ease-out"
          :class="visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'"
          :style="{ transitionDelay: visible ? `${i * 140}ms` : '0ms' }"
        >
          <!-- Step number badge -->
          <div class="flex items-center justify-between mb-6">
            <span class="text-4xl font-black text-muted-foreground/12 leading-none select-none">
              {{ step.number }}
            </span>
            <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Icon :name="step.icon" class="w-5 h-5 text-primary" />
            </div>
          </div>

          <!-- Content -->
          <h3 class="text-lg font-bold text-foreground mb-3">{{ step.title }}</h3>
          <p class="text-sm text-muted-foreground leading-relaxed mb-6">{{ step.description }}</p>

          <!-- Tag -->
          <div class="flex items-center gap-1.5 text-xs font-medium text-primary/70">
            <Icon :name="step.tagIcon" class="w-3.5 h-3.5" />
            {{ step.tag }}
          </div>
        </div>
      </div>

      <!-- Bottom note -->
      <p
        class="mt-10 text-center text-sm text-muted-foreground/50 transition-all duration-700 ease-out"
        :class="visible ? 'opacity-100' : 'opacity-0'"
        style="transition-delay: 500ms"
      >
        Crosschain routing powered by
        <span class="text-foreground/60 font-medium">LI.FI</span>
        · Yield vaults by
        <span class="text-foreground/60 font-medium">Morpho, Aave &amp; Euler</span>
        · Wallets by
        <span class="text-foreground/60 font-medium">Privy</span>
      </p>

    </div>
  </section>
</template>
