<script setup lang="ts">
import { useIntersectionObserver } from '@vueuse/core'

const sectionRef = ref<HTMLElement>()
const visible = ref(false)
const { stop } = useIntersectionObserver(sectionRef, ([entry]) => {
  if (entry?.isIntersecting) { visible.value = true; stop() }
}, { threshold: 0.1 })

const products = [
  {
    icon: 'lucide:piggy-bank',
    name: 'Pockets',
    tagline: 'Goal-based savings',
    description: 'Create a pocket with a name, target, and timeline. Each pocket maps to one vault. Track progress like a savings app — yield compounds in the background.',
    bullets: ['Quick-pick presets', '1 vault per pocket', 'Goal projection chart'],
    accent: 'sage',
  },
  {
    icon: 'lucide:trending-up',
    name: 'Earn',
    tagline: 'Browse every vault',
    description: 'Jumper-style catalog of every Composer-routable vault on Base. Filter by asset, protocol, category, or TVL. APY base/reward split, trends, and freshness shown per card.',
    bullets: ['Live APY + TVL', 'Filter by asset & protocol', 'Your positions, in one place'],
    accent: 'teal',
  },
  {
    icon: 'lucide:layers',
    name: 'Strategies',
    tagline: 'Multi-vault marketplace',
    description: 'Build a strategy from any combination of vaults with weight sliders. Publish it, fork someone else\'s, or keep it private. Forks create separate copies — edits never break followers.',
    bullets: ['Any-asset builder', 'Public marketplace', 'Fork & customize'],
    accent: 'gold',
  },
]

const accents: Record<string, { iconBg: string; iconText: string; bullet: string; bar: string }> = {
  sage: {
    iconBg: 'bg-brand-sage/10',
    iconText: 'text-brand-sage',
    bullet: 'text-brand-sage/70',
    bar: 'bg-brand-sage',
  },
  teal: {
    iconBg: 'bg-brand-teal/10',
    iconText: 'text-brand-teal',
    bullet: 'text-brand-teal/70',
    bar: 'bg-brand-teal',
  },
  gold: {
    iconBg: 'bg-brand-gold/10',
    iconText: 'text-brand-gold',
    bullet: 'text-brand-gold/70',
    bar: 'bg-brand-gold',
  },
}
</script>

<template>
  <section
    id="three-products"
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
          What's inside
        </p>
        <h2 class="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-[-0.03em] mb-5">
          Three tabs.<br />One smart account.
        </h2>
        <p class="text-muted-foreground text-base sm:text-lg leading-relaxed">
          Auren wraps three different ways to earn into one app. Pick a goal-shaped pocket,
          browse the raw catalog, or design your own strategy — your funds and gas live in
          the same Pimlico smart account.
        </p>
      </div>

      <!-- Product cards -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-5">
        <div
          v-for="(p, i) in products"
          :key="p.name"
          class="rounded-2xl overflow-hidden bg-card border border-border transition-all duration-700 ease-out"
          :class="visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'"
          :style="{ transitionDelay: visible ? `${160 + i * 110}ms` : '0ms' }"
        >
          <div class="h-0.5 w-full" :class="accents[p.accent]?.bar" />

          <div class="p-6 sm:p-7">
            <div
              class="w-12 h-12 rounded-xl flex items-center justify-center mb-5"
              :class="accents[p.accent]?.iconBg"
            >
              <Icon :name="p.icon" class="w-6 h-6" :class="accents[p.accent]?.iconText" />
            </div>

            <p class="text-xs font-semibold uppercase tracking-widest mb-1" :class="accents[p.accent]?.iconText">
              {{ p.tagline }}
            </p>
            <h3 class="text-xl font-bold text-foreground mb-3">{{ p.name }}</h3>
            <p class="text-sm text-muted-foreground leading-relaxed mb-5">
              {{ p.description }}
            </p>

            <ul class="space-y-2">
              <li
                v-for="b in p.bullets"
                :key="b"
                class="flex items-center gap-2.5 text-sm text-muted-foreground"
              >
                <Icon name="lucide:check" class="w-3.5 h-3.5 shrink-0" :class="accents[p.accent]?.bullet" />
                {{ b }}
              </li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Caption -->
      <p
        class="mt-10 text-center text-sm text-muted-foreground/60 transition-all duration-700 ease-out"
        :class="visible ? 'opacity-100' : 'opacity-0'"
        style="transition-delay: 500ms"
      >
        Every vault that surfaces has been probed for Composer routing — single-tx deposits, no manual bridging.
      </p>

    </div>
  </section>
</template>
