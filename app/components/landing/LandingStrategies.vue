<script setup lang="ts">
import type { Strategy } from '~/config/strategies'
import { useIntersectionObserver } from '@vueuse/core'

defineProps<{
  strategies: Strategy[]
}>()

const sectionRef = ref<HTMLElement>()
const visible = ref(false)

const { stop } = useIntersectionObserver(sectionRef, ([entry]) => {
  if (entry?.isIntersecting) { visible.value = true; stop() }
}, { threshold: 0.1 })

const details: Record<string, { tagline: string; features: string[] }> = {
  conservative: {
    tagline: 'Your dollars earn daily interest from top-rated USDC vaults — stable, predictable, no token risk.',
    features: ['USDC across Morpho & Aave', 'Stable, predictable returns', 'Best for short-term goals'],
  },
  balanced: {
    tagline: 'Ride Bitcoin\'s long-term growth while cbBTC keeps earning vault yield in the background.',
    features: ['cbBTC vault exposure', 'Moderate risk & reward', 'Best for 1–3 year goals'],
  },
  aggressive: {
    tagline: 'Maximum Ethereum exposure via WETH and LST vaults. Higher potential, higher swings.',
    features: ['WETH + LST vaults', 'Highest risk & upside', 'Best for long horizons'],
  },
}

const riskLabels: Record<string, { label: string; class: string }> = {
  low: { label: 'Low risk', class: 'bg-brand-sage/10 text-brand-sage border-brand-sage/20' },
  medium: { label: 'Medium risk', class: 'bg-brand-gold/10 text-brand-gold border-brand-gold/20' },
  high: { label: 'High risk', class: 'bg-red-500/10 text-red-400 border-red-500/20' },
}

const colors: Record<string, {
  iconBg: string
  iconText: string
  accentBar: string
  glow: string
  badge: string
  checkColor: string
}> = {
  sage: {
    iconBg: 'bg-brand-sage/10',
    iconText: 'text-brand-sage',
    accentBar: 'bg-brand-sage',
    glow: 'hover:shadow-brand-sage/8',
    badge: 'bg-brand-sage/10 text-brand-sage border-brand-sage/20',
    checkColor: 'text-brand-sage/70',
  },
  teal: {
    iconBg: 'bg-brand-teal/10',
    iconText: 'text-brand-teal',
    accentBar: 'bg-brand-teal',
    glow: 'hover:shadow-brand-teal/8',
    badge: 'bg-brand-teal/10 text-brand-teal border-brand-teal/20',
    checkColor: 'text-brand-teal/70',
  },
  gold: {
    iconBg: 'bg-brand-gold/10',
    iconText: 'text-brand-gold',
    accentBar: 'bg-brand-gold',
    glow: 'hover:shadow-brand-gold/8',
    badge: 'bg-brand-gold/10 text-brand-gold border-brand-gold/20',
    checkColor: 'text-brand-gold/70',
  },
}
</script>

<template>
  <section ref="sectionRef" class="py-24 sm:py-32">
    <div class="max-w-6xl mx-auto px-5 sm:px-6 lg:px-8">

      <!-- Header -->
      <div
        class="text-center mb-16 transition-all duration-700 ease-out"
        :class="visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'"
      >
        <p class="text-xs font-semibold text-primary uppercase tracking-[0.2em] mb-3">System strategies</p>
        <h2 class="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-[-0.03em]">
          Start with a preset.<br />Or build your own.
        </h2>
        <p class="mt-4 text-muted-foreground text-base sm:text-lg max-w-xl mx-auto">
          Three curated strategies cover the most common goals. Want something custom?
          The Strategies tab lets you combine any Composer-routable vaults on Base with weight sliders.
        </p>
      </div>

      <!-- Cards -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-6">
        <div
          v-for="(s, i) in strategies"
          :key="s.key"
          class="group relative rounded-2xl overflow-hidden bg-card border border-border
                 hover:border-border/80 hover:shadow-2xl transition-all duration-500"
          :class="[
            visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8',
            colors[s.color]?.glow,
          ]"
          :style="{ transitionDelay: visible ? `${180 + i * 120}ms` : '0ms' }"
        >
          <!-- Top accent -->
          <div class="h-0.5 w-full" :class="colors[s.color]?.accentBar" />

          <div class="p-6 sm:p-7">
            <!-- Icon -->
            <div
              class="w-12 h-12 rounded-xl flex items-center justify-center mb-5"
              :class="colors[s.color]?.iconBg"
            >
              <Icon :name="s.icon" class="w-6 h-6" :class="colors[s.color]?.iconText" />
            </div>

            <!-- Name + label -->
            <p class="text-xs font-semibold uppercase tracking-widest mb-1" :class="colors[s.color]?.iconText">
              {{ s.name }}
            </p>
            <h3 class="text-xl font-bold text-foreground mb-3">{{ s.label }}</h3>
            <p class="text-sm text-muted-foreground leading-relaxed mb-6">
              {{ details[s.key]?.tagline }}
            </p>

            <!-- Features -->
            <ul class="space-y-2 mb-6">
              <li
                v-for="feature in details[s.key]?.features"
                :key="feature"
                class="flex items-center gap-2.5 text-sm text-muted-foreground"
              >
                <Icon name="lucide:check" class="w-3.5 h-3.5 shrink-0" :class="colors[s.color]?.checkColor" />
                {{ feature }}
              </li>
            </ul>

            <!-- Badges -->
            <div class="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                class="text-xs border"
                :class="colors[s.color]?.badge"
              >
                {{ s.assetLabel }}
              </Badge>
              <Badge
                variant="outline"
                class="text-xs border"
                :class="riskLabels[s.risk]?.class"
              >
                {{ riskLabels[s.risk]?.label }}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      <!-- Build-your-own CTA strip -->
      <div
        class="mt-10 flex flex-col sm:flex-row items-center justify-between gap-5 p-6 sm:p-7 rounded-2xl bg-card/60 border border-border transition-all duration-700 ease-out"
        :class="visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'"
        style="transition-delay: 540ms"
      >
        <div class="flex items-start gap-4 text-center sm:text-left">
          <div class="hidden sm:flex w-11 h-11 shrink-0 rounded-xl bg-primary/10 items-center justify-center">
            <Icon name="lucide:layers" class="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 class="text-base sm:text-lg font-bold text-foreground mb-1">
              Need something the presets don't cover?
            </h3>
            <p class="text-sm text-muted-foreground max-w-lg">
              Combine any number of vaults — USDC, cbBTC, WETH, EURC, LBTC, weETH and more —
              with weight sliders that auto-rebalance. Publish, fork, or keep it private.
            </p>
          </div>
        </div>
        <button
          class="inline-flex items-center gap-2 h-11 px-6 rounded-full bg-primary text-primary-foreground text-sm font-semibold shadow-lg shadow-primary/25 hover:bg-primary/90 active:scale-[0.97] transition-all duration-200 shrink-0"
          @click="navigateTo('/strategy/create')"
        >
          Open the strategy builder
          <Icon name="lucide:arrow-right" class="w-4 h-4" />
        </button>
      </div>

    </div>
  </section>
</template>
