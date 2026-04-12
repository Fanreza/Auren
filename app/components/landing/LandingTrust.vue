<script setup lang="ts">
import { useIntersectionObserver } from '@vueuse/core'

const sectionRef = ref<HTMLElement>()
const visible = ref(false)
const { stop } = useIntersectionObserver(sectionRef, ([entry]) => {
  if (entry?.isIntersecting) { visible.value = true; stop() }
}, { threshold: 0.1 })

const poweredBy = [
  {
    icon: 'lucide:route',
    name: 'LI.FI Composer',
    role: 'Crosschain routing',
    description: 'Composer routes your deposit through the optimal bridge + swap + vault deposit path in a single transaction. Every vault we surface is probed for Composer compatibility.',
    color: 'text-brand-teal',
    iconBg: 'bg-brand-teal/10',
    border: 'border-brand-teal/15',
  },
  {
    icon: 'lucide:landmark',
    name: 'Morpho · Aave · Yearn · Euler',
    role: 'Yield vaults',
    description: 'Funds sit in audited, battle-tested ERC-4626 vaults from leading DeFi lending protocols on Base. Real yield from on-chain liquidity — no native tokens, no rebases.',
    color: 'text-brand-gold',
    iconBg: 'bg-brand-gold/10',
    border: 'border-brand-gold/15',
  },
  {
    icon: 'lucide:fingerprint',
    name: 'Privy + Pimlico',
    role: 'Smart account & paymaster',
    description: 'Privy creates an embedded wallet from your email. Pimlico\'s ERC-4337 smart account batches actions and pays gas in USDC — you never need to hold ETH.',
    color: 'text-brand-sage',
    iconBg: 'bg-brand-sage/10',
    border: 'border-brand-sage/15',
  },
]

const guarantees = [
  { icon: 'lucide:shield-check', label: 'Non-custodial', sub: 'Only you move your funds' },
  { icon: 'lucide:file-check', label: 'Audited vaults', sub: 'Morpho, Aave, Yearn, Euler' },
  { icon: 'lucide:search', label: 'On-chain transparent', sub: 'Verify every tx yourself' },
  { icon: 'lucide:fuel', label: 'Gas paid in USDC', sub: 'No ETH required' },
]
</script>

<template>
  <section ref="sectionRef" class="py-24 sm:py-32">
    <div class="max-w-6xl mx-auto px-5 sm:px-6 lg:px-8">

      <!-- Header -->
      <div
        class="text-center mb-16 transition-all duration-700 ease-out"
        :class="visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'"
      >
        <p class="text-xs font-semibold text-primary uppercase tracking-[0.2em] mb-3">Under the hood</p>
        <h2 class="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-[-0.03em]">
          Simple face.<br class="sm:hidden" /> Serious infrastructure.
        </h2>
        <p class="mt-4 text-muted-foreground max-w-md mx-auto">
          You see a savings goal. Behind it: institutional-grade DeFi protocols doing the heavy lifting.
        </p>
      </div>

      <!-- Powered by cards -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-5 mb-8">
        <div
          v-for="(item, i) in poweredBy"
          :key="item.name"
          class="rounded-2xl bg-card border p-6 transition-all duration-700 ease-out"
          :class="[
            visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8',
            item.border,
          ]"
          :style="{ transitionDelay: visible ? `${150 + i * 110}ms` : '0ms' }"
        >
          <div
            class="w-11 h-11 rounded-xl flex items-center justify-center mb-5"
            :class="item.iconBg"
          >
            <Icon :name="item.icon" class="w-5 h-5" :class="item.color" />
          </div>
          <p class="text-xs font-semibold uppercase tracking-widest mb-1" :class="item.color">
            {{ item.role }}
          </p>
          <h3 class="font-bold text-foreground mb-3">{{ item.name }}</h3>
          <p class="text-sm text-muted-foreground leading-relaxed">{{ item.description }}</p>
        </div>
      </div>

      <!-- Security strip -->
      <div
        class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-14 transition-all duration-700 ease-out"
        :class="visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'"
        style="transition-delay: 480ms"
      >
        <div
          v-for="g in guarantees"
          :key="g.label"
          class="flex items-center gap-3 p-4 rounded-xl bg-secondary/40 border border-border/50"
        >
          <Icon :name="g.icon" class="w-4 h-4 text-primary/70 shrink-0" />
          <div>
            <p class="text-xs font-semibold text-foreground">{{ g.label }}</p>
            <p class="text-[11px] text-muted-foreground/60">{{ g.sub }}</p>
          </div>
        </div>
      </div>

      <!-- CTA card -->
      <div
        class="rounded-2xl bg-card border border-border p-10 sm:p-14 text-center relative overflow-hidden transition-all duration-700 ease-out"
        :class="visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'"
        style="transition-delay: 600ms"
      >
        <div class="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-48 rounded-full bg-primary/8 blur-[80px]" />
        </div>
        <div class="relative z-10">
          <h3 class="text-2xl sm:text-3xl font-bold tracking-[-0.03em] mb-4">
            Ready to save smarter?
          </h3>
          <p class="text-muted-foreground mb-8 max-w-sm mx-auto">
            Sign in with email. No seed phrases, no native gas. Pick a pocket, browse Earn, or fork a strategy in under a minute.
          </p>
          <button
            class="inline-flex items-center gap-2 h-12 px-8 rounded-full bg-primary text-primary-foreground text-base font-semibold shadow-xl shadow-primary/30 hover:bg-primary/90 active:scale-[0.98] transition-all duration-200"
            @click="navigateTo('/app')"
          >
            Open the app
            <Icon name="lucide:arrow-right" class="w-4 h-4" />
          </button>
        </div>
      </div>

    </div>
  </section>
</template>
