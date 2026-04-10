<script setup lang="ts">
import { useIntersectionObserver } from '@vueuse/core'
import { BRAND } from '~/config/brand'

const sectionRef = ref<HTMLElement>()
const visible = ref(false)

const { stop } = useIntersectionObserver(sectionRef, ([{ isIntersecting }]) => {
  if (isIntersecting) { visible.value = true; stop() }
}, { threshold: 0.1 })

const features = [
  {
    icon: 'lucide:target',
    title: 'Plans for every goal',
    description: 'Pick a plan that matches your comfort level. From safe and steady to high-growth.',
  },
  {
    icon: 'lucide:eye',
    title: 'Fully transparent',
    description: 'Every transaction is recorded publicly. No hidden fees, no surprises.',
  },
  {
    icon: 'lucide:trending-up',
    title: 'Real returns',
    description: 'Your money earns real interest from proven financial strategies. Not gimmicks.',
  },
  {
    icon: 'lucide:door-open',
    title: 'Withdraw anytime',
    description: 'No lock-ups, no penalties. Your money is always accessible.',
  },
]
</script>

<template>
  <section ref="sectionRef" class="py-24 sm:py-32">
    <div class="max-w-6xl mx-auto px-5 sm:px-6 lg:px-8">
      <div
        class="text-center mb-16 transition-all duration-700 ease-out"
        :class="visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'"
      >
        <p class="text-xs font-semibold text-muted-foreground uppercase tracking-[0.2em] mb-3">
          Why {{ BRAND.name }}
        </p>
        <h2 class="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-[-0.03em]">
          Savings made simple
        </h2>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div
          v-for="(f, i) in features"
          :key="f.title"
          class="text-center transition-all duration-700 ease-out"
          :class="visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'"
          :style="{ transitionDelay: visible ? `${200 + i * 100}ms` : '0ms' }"
        >
          <div
            class="w-12 h-12 rounded-xl bg-primary/10 border border-primary/15
                   flex items-center justify-center mx-auto mb-4"
          >
            <Icon :name="f.icon" class="w-6 h-6 text-primary" />
          </div>
          <h3 class="font-semibold mb-1.5 text-foreground text-sm">{{ f.title }}</h3>
          <p class="text-sm text-muted-foreground leading-relaxed max-w-56 mx-auto">
            {{ f.description }}
          </p>
        </div>
      </div>
    </div>
  </section>
</template>
