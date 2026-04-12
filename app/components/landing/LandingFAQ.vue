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
    q: 'What\'s the difference between Pockets, Earn, and Strategies?',
    a: 'Pockets are goal-shaped wrappers — one pocket holds one vault, with a name, target, and timeline. Earn is the raw catalog of every Composer-routable vault on Base, no wrapper. Strategies are multi-vault recipes you can build, fork, or browse from a public marketplace. Same smart account underneath all three.',
  },
  {
    q: 'Do I need a crypto wallet to sign up?',
    a: 'No. You sign in with email (or Google). Privy creates a non-custodial embedded wallet for you, and Pimlico wraps it in an ERC-4337 smart account. No seed phrases, no MetaMask, no setup.',
  },
  {
    q: 'How is gas paid? Do I need ETH?',
    a: 'No. Pimlico\'s ERC-20 paymaster sponsors gas and deducts the cost in USDC from your smart account. You only need to hold the assets you want to save with — never native ETH.',
  },
  {
    q: 'Which chains and tokens can I deposit from?',
    a: 'Vaults live on Base, but you can fund from Ethereum, Arbitrum, Optimism, Polygon, BNB Chain, Avalanche and more — in any ERC-20 you already hold. LI.FI Composer routes the bridge, swap, and vault deposit into a single transaction.',
  },
  {
    q: 'How does the Strategies marketplace work?',
    a: 'Strategies are multi-vault recipes with weight sliders. You can build private ones, publish public, or share unlisted. Other users can copy ("fork") your strategy into their own library — forks are independent entities, so editing your original never breaks anyone\'s copy. Forking auto-follows the source, so creators see real follower counts.',
  },
  {
    q: 'Can I build a strategy with any token?',
    a: 'Yes — as long as it has a Composer-routable vault on Base. The strategy builder surfaces every asset that passes our filter pipeline (TVL ≥ $10M, transactional, redeemable, Composer-probed). USDC, cbBTC, WETH, EURC, LBTC, weETH, wstETH, cbETH and more are typically available.',
  },
  {
    q: 'Can I lose money?',
    a: 'Yes. Stablecoin vaults (USDC, EURC) are the most stable — yield fluctuates but principal rarely drops. cbBTC, WETH, and LST vaults follow crypto prices and can drop significantly in a downturn. DeFi also carries smart-contract risk. Only save what you\'re comfortable with at each level.',
  },
  {
    q: 'Can I withdraw whenever I want?',
    a: 'Always. No lock-ups, no exit fees, no waiting periods. Withdraw part, all, or close the pocket entirely. Yield earned stays yours.',
  },
  {
    q: 'Is Auren safe?',
    a: 'Funds sit in audited, non-custodial ERC-4626 vaults from Morpho, Aave, Yearn, Euler, Compound and others. Auren never has custody — only your smart account can move funds. Every action is verifiable on Basescan. That said, DeFi always carries smart-contract risk; only deposit amounts you\'re comfortable with.',
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
