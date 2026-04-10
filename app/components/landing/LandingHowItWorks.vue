<script setup lang="ts">
import { useIntersectionObserver } from '@vueuse/core'

const sectionRef = ref<HTMLElement>()
const visible = ref(false)

const { stop } = useIntersectionObserver(sectionRef, ([{ isIntersecting }]) => {
  if (isIntersecting) { visible.value = true; stop() }
}, { threshold: 0.1 })

const steps = [
  {
    icon: 'lucide:target',
    title: 'Pick a plan',
    description: 'Choose how you want your money to grow. Safe and steady, balanced, or high potential.',
  },
  {
    icon: 'lucide:user-round',
    title: 'Sign in',
    description: 'Use your existing wallet, or create an account with just your email.',
  },
  {
    icon: 'lucide:arrow-down-to-line',
    title: 'Add money',
    description: 'Transfer funds into your chosen plan. Takes less than a minute.',
  },
  {
    icon: 'lucide:trending-up',
    title: 'Watch it grow',
    description: 'Your money earns interest automatically. Check your balance anytime.',
  },
  {
    icon: 'lucide:door-open',
    title: 'Cash out anytime',
    description: 'No lock-ups, no penalties. Withdraw whenever you want.',
  },
]
</script>

<template>
  <section
    id="how-it-works"
    ref="sectionRef"
    class="py-24 sm:py-32 relative overflow-hidden"
  >
    <!-- Background glow -->
    <div class="absolute inset-0 pointer-events-none" aria-hidden="true">
      <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-200 h-100 rounded-full bg-primary/5 blur-[150px]" />
    </div>

    <div class="relative max-w-6xl mx-auto px-5 sm:px-6 lg:px-8">
      <!-- Section header -->
      <div
        class="text-center mb-16 transition-all duration-700 ease-out"
        :class="visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'"
      >
        <p class="text-xs font-semibold text-primary uppercase tracking-[0.2em] mb-3">
          How It Works
        </p>
        <h2 class="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-[-0.03em]">
          Getting started is easy
        </h2>
      </div>

      <!-- Steps -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5 lg:gap-4">
        <div
          v-for="(step, i) in steps"
          :key="i"
          class="group relative z-10 text-center rounded-2xl p-5 sm:p-6
                 bg-white/3 border border-white/6
                 hover:bg-white/5 hover:border-white/12
                 transition-all duration-500"
          :class="visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'"
          :style="{ transitionDelay: visible ? `${200 + i * 120}ms` : '0ms' }"
        >
          <!-- Step icon -->
          <div class="relative z-10 mx-auto mb-4">
            <div
              class="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto
                     bg-primary/10 border border-primary/20
                     transition-all duration-500 group-hover:scale-105 group-hover:shadow-lg group-hover:shadow-primary/10"
            >
              <Icon :name="step.icon" class="w-6 h-6 text-primary" />
            </div>
            <!-- Step number -->
            <span
              class="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full
                     text-[10px] font-bold flex items-center justify-center
                     bg-primary text-white shadow-lg shadow-primary/30
                     transition-transform duration-500 group-hover:scale-110"
            >
              {{ i + 1 }}
            </span>
          </div>

          <h3 class="text-sm font-semibold mb-1.5 text-foreground">{{ step.title }}</h3>
          <p class="text-xs text-muted-foreground leading-relaxed">
            {{ step.description }}
          </p>

          <!-- Bottom accent line -->
          <div
            class="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-0 rounded-full bg-primary/50
                   transition-all duration-500 group-hover:w-12"
          />
        </div>
      </div>
    </div>
  </section>
</template>
