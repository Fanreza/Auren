<script setup lang="ts">
import { useIntersectionObserver } from '@vueuse/core'

const sectionRef = ref<HTMLElement>()
const visible = ref(false)
const { stop } = useIntersectionObserver(sectionRef, ([entry]) => {
  if (entry?.isIntersecting) { visible.value = true; stop() }
}, { threshold: 0.1 })

const openIndex = ref<number | null>(null)
function toggle(i: number) {
  openIndex.value = openIndex.value === i ? null : i
}

const faqs = [
  {
    q: 'What exactly is a pocket?',
    a: 'A pocket is a savings container tied to a specific goal — like "Vacation Fund" or "Emergency Fund". Each one has a name, a target amount, a timeline, and its own growth strategy. You can have as many pockets as you want, and they all run independently.',
  },
  {
    q: 'Do I need a crypto wallet to sign up?',
    a: 'No. You sign in with your email (or Google). Auren creates an embedded smart wallet for you automatically using Privy. You never see a seed phrase or need to install anything.',
  },
  {
    q: 'What does "fee-free first deposit" mean?',
    a: 'Crosschain transactions require a small gas fee. For your first deposit, Auren covers that fee on your behalf through a paymaster. You just deposit your savings — we handle the gas.',
  },
  {
    q: 'Which chains and tokens can I deposit from?',
    a: 'You can deposit from Ethereum, Arbitrum, Optimism, Polygon, BNB Chain, Avalanche, and more. Any ERC-20 token is accepted — Auren uses Enso Finance to auto-route a swap from whatever you deposit into the strategy\'s underlying asset. You don\'t need to manually bridge or swap anything.',
  },
  {
    q: 'Can I lose money?',
    a: 'Yes. The Conservative strategy (USDC) is the most stable — yield can fluctuate but your principal rarely drops. Balanced (Bitcoin) and Aggressive (Ethereum) follow crypto prices, so they can drop significantly in a downturn. Only save what you\'re comfortable with at each risk level.',
  },
  {
    q: 'Can I withdraw whenever I want?',
    a: 'Always. There are no lock-up periods, no exit fees, and no waiting periods. Withdraw part of it, all of it, or close the pocket entirely — whenever you want. The yield you\'ve earned stays yours.',
  },
  {
    q: 'Can I switch strategies after I create a pocket?',
    a: 'Yes. You can switch a pocket from Conservative to Balanced or Aggressive (and vice versa) at any time from the pocket detail page. The switch rebalances in a single transaction.',
  },
  {
    q: 'Is Auren safe?',
    a: 'Your funds sit in audited, non-custodial smart contracts. Auren never has custody of your money — only your wallet can move it. Every transaction is verifiable on-chain with any block explorer. That said, DeFi always carries smart contract risk. Only save amounts you\'re comfortable with.',
  },
]
</script>

<template>
  <section ref="sectionRef" class="py-24 sm:py-32">
    <div class="max-w-2xl mx-auto px-5 sm:px-6 lg:px-8">

      <!-- Header -->
      <div
        class="text-center mb-14 transition-all duration-700 ease-out"
        :class="visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'"
      >
        <p class="text-xs font-semibold text-primary uppercase tracking-[0.2em] mb-3">FAQ</p>
        <h2 class="text-3xl sm:text-4xl font-bold tracking-[-0.03em]">Common questions</h2>
        <p class="mt-4 text-muted-foreground">
          Straight answers about how Auren works.
        </p>
      </div>

      <!-- Items -->
      <div class="space-y-2">
        <div
          v-for="(faq, i) in faqs"
          :key="i"
          class="rounded-xl border overflow-hidden transition-all duration-500"
          :class="[
            visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6',
            openIndex === i
              ? 'bg-card border-border'
              : 'bg-card/50 border-border/60 hover:border-border hover:bg-card',
          ]"
          :style="{ transitionDelay: visible ? `${130 + i * 60}ms` : '0ms' }"
        >
          <button
            class="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
            @click="toggle(i)"
          >
            <span class="font-medium text-sm sm:text-base text-foreground">{{ faq.q }}</span>
            <Icon
              name="lucide:chevron-down"
              class="w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-300"
              :class="openIndex === i ? 'rotate-180 text-primary' : ''"
            />
          </button>
          <div
            class="grid transition-all duration-300 ease-out"
            :class="openIndex === i ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'"
          >
            <div class="overflow-hidden">
              <p class="px-5 pt-2 pb-5 text-sm text-muted-foreground leading-relaxed border-t border-border/40">
                {{ faq.a }}
              </p>
            </div>
          </div>
        </div>
      </div>

    </div>
  </section>
</template>
