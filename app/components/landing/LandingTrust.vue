<script setup lang="ts">
import { useIntersectionObserver } from '@vueuse/core'
import { BRAND } from '~/config/brand'

const sectionRef = ref<HTMLElement>()
const visible = ref(false)

const { stop } = useIntersectionObserver(sectionRef, ([{ isIntersecting }]) => {
  if (isIntersecting) { visible.value = true; stop() }
}, { threshold: 0.1 })

const trustItems = [
  {
    icon: 'lucide:hexagon',
    title: 'Backed by Coinbase',
    description: 'Runs on Coinbase\'s secure network. Low fees, fast processing.',
  },
  {
    icon: 'lucide:lock',
    title: 'Bank-grade security',
    description: 'Your money is stored in audited, industry-standard savings programs.',
  },
  {
    icon: 'lucide:key-round',
    title: 'You\'re always in control',
    description: 'We never hold your money. Only you can move or withdraw your funds.',
  },
]
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
          Security
        </p>
        <h2 class="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-[-0.03em]">
          Built for trust
        </h2>
      </div>

      <!-- Trust items -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-8 lg:gap-12">
        <div
          v-for="(item, i) in trustItems"
          :key="item.title"
          class="text-center transition-all duration-700 ease-out"
          :class="visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'"
          :style="{ transitionDelay: visible ? `${200 + i * 120}ms` : '0ms' }"
        >
          <div
            class="w-14 h-14 rounded-2xl bg-white/4 border border-white/6
                   flex items-center justify-center mx-auto mb-5"
          >
            <Icon :name="item.icon" class="w-7 h-7 text-muted-foreground" />
          </div>
          <h3 class="font-semibold mb-2 text-foreground">{{ item.title }}</h3>
          <p class="text-sm text-muted-foreground max-w-70 mx-auto leading-relaxed">
            {{ item.description }}
          </p>
        </div>
      </div>

      <!-- Bottom CTA -->
      <div
        class="mt-24 sm:mt-32 text-center transition-all duration-700 ease-out"
        :class="visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'"
        :style="{ transitionDelay: visible ? '600ms' : '0ms' }"
      >
        <div class="w-16 h-px bg-primary/20 mx-auto mb-16" />

        <h3 class="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-[-0.03em] mb-4">
          Ready to grow your savings?
        </h3>
        <p class="text-muted-foreground mb-10 max-w-md mx-auto">
          Join early users testing a simpler, smarter way to save onchain with {{ BRAND.name }}.
        </p>
        <button
          class="inline-flex items-center justify-center h-12 px-8 text-base font-semibold
                 rounded-full bg-primary text-white
                 shadow-lg shadow-primary/25
                 hover:bg-primary/80 hover:shadow-primary/35
                 active:scale-[0.98] transition-all duration-200"
          @click="navigateTo('/app')"
        >
          Start with {{ BRAND.name }}
          <Icon name="lucide:arrow-right" class="w-4 h-4 ml-2" />
        </button>
      </div>
    </div>
  </section>
</template>
