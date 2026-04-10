<script setup lang="ts">
import type { Strategy } from '~/config/strategies'
import { useIntersectionObserver } from '@vueuse/core'

defineProps<{
  strategies: Strategy[]
}>()

const sectionRef = ref<HTMLElement>()
const visible = ref(false)

const { stop } = useIntersectionObserver(sectionRef, ([{ isIntersecting }]) => {
  if (isIntersecting) { visible.value = true; stop() }
}, { threshold: 0.1 })

const details: Record<string, { tagline: string; features: string[] }> = {
  conservative: {
    tagline: 'Like a high-interest savings account for your dollars. Stable and predictable.',
    features: ['Dollar-based savings', 'Steady returns', 'Lowest risk'],
  },
  balanced: {
    tagline: 'Grow your savings with Bitcoin. A balance between stability and growth potential.',
    features: ['Bitcoin-backed', 'Moderate risk', 'Growth potential'],
  },
  aggressive: {
    tagline: 'Go for maximum growth with Ethereum. Higher potential returns, higher risk.',
    features: ['Ethereum-based', 'Higher risk', 'Highest potential returns'],
  },
}

const riskLabels: Record<string, { label: string; class: string }> = {
  low: { label: 'Low risk', class: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  medium: { label: 'Medium risk', class: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
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
  emerald: {
    iconBg: 'bg-emerald-500/10',
    iconText: 'text-emerald-400',
    accentBar: 'bg-emerald-500',
    glow: 'hover:shadow-emerald-500/8',
    badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    checkColor: 'text-emerald-400/70',
  },
  blue: {
    iconBg: 'bg-blue-500/10',
    iconText: 'text-blue-400',
    accentBar: 'bg-blue-500',
    glow: 'hover:shadow-blue-500/8',
    badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    checkColor: 'text-blue-400/70',
  },
  violet: {
    iconBg: 'bg-violet-500/10',
    iconText: 'text-violet-400',
    accentBar: 'bg-violet-500',
    glow: 'hover:shadow-violet-500/8',
    badge: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
    checkColor: 'text-violet-400/70',
  },
}
</script>

<template>
  <section ref="sectionRef" class="py-24 sm:py-32">
    <div class="max-w-6xl mx-auto px-5 sm:px-6 lg:px-8">
      <!-- Section header -->
      <div
        class="text-center mb-16 transition-all duration-700 ease-out"
        :class="visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'"
      >
        <p class="text-xs font-semibold text-muted-foreground uppercase tracking-[0.2em] mb-3">
          Strategies
        </p>
        <h2 class="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-[-0.03em]">
          Choose how your money grows
        </h2>
        <p class="mt-4 text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto">
          Three plans designed for different goals. Pick what feels right for you.
        </p>
      </div>

      <!-- Cards grid -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-6">
        <div
          v-for="(s, i) in strategies"
          :key="s.key"
          class="group relative rounded-2xl overflow-hidden
                 bg-white/3 border border-white/6
                 hover:bg-white/5 hover:border-white/10
                 hover:shadow-2xl transition-all duration-500"
          :class="[
            visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8',
            colors[s.color]?.glow,
          ]"
          :style="{ transitionDelay: visible ? `${200 + i * 120}ms` : '0ms' }"
        >
          <!-- Top accent bar -->
          <div class="h-0.5" :class="colors[s.color]?.accentBar" />

          <div class="p-6 sm:p-7">
            <!-- Icon -->
            <div
              class="w-12 h-12 rounded-xl flex items-center justify-center mb-5"
              :class="colors[s.color]?.iconBg"
            >
              <Icon :name="s.icon" class="w-6 h-6" :class="colors[s.color]?.iconText" />
            </div>

            <!-- Title & description -->
            <h3 class="text-xl font-semibold mb-2 text-foreground">{{ s.label }}</h3>
            <p class="text-sm text-muted-foreground leading-relaxed mb-5">
              {{ details[s.key]?.tagline }}
            </p>

            <!-- Features -->
            <ul class="space-y-2.5 mb-6">
              <li
                v-for="feature in details[s.key]?.features"
                :key="feature"
                class="flex items-center gap-2.5 text-sm text-muted-foreground"
              >
                <Icon name="lucide:check" class="w-4 h-4 shrink-0" :class="colors[s.color]?.checkColor" />
                {{ feature }}
              </li>
            </ul>

            <!-- Badges -->
            <div class="flex items-center gap-2">
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
    </div>
  </section>
</template>
