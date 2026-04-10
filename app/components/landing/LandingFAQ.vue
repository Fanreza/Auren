<script setup lang="ts">
import { useIntersectionObserver } from '@vueuse/core'
import { BRAND } from '~/config/brand'

const sectionRef = ref<HTMLElement>()
const visible = ref(false)

const { stop } = useIntersectionObserver(sectionRef, ([{ isIntersecting }]) => {
  if (isIntersecting) { visible.value = true; stop() }
}, { threshold: 0.1 })

const openIndex = ref<number | null>(null)

function toggle(i: number) {
  openIndex.value = openIndex.value === i ? null : i
}

const faqs = [
  {
    question: 'What happens in a market crash?',
    answer: 'Depends on your plan. Savings (USDC) stays stable, maybe a small ~2% dip. Growth (Bitcoin) and High Growth (Ethereum) follow the market, so if crypto drops 20%, your balance could drop 20-30% too. That\'s why we match your plan to your risk comfort. You\'re never locked in. Switch or withdraw anytime.',
  },
  {
    question: 'What if APY drops?',
    answer: 'APY is variable. It goes up and down based on market conditions. We show you real-time rates and historical stability so there are no surprises. If rates drop, you can switch strategies or withdraw. No penalty.',
  },
  {
    question: 'What happens if I withdraw early?',
    answer: 'Nothing bad. No lock-ups, no penalties, no exit fees. You can withdraw 100% of your funds at any time. Whatever yield you\'ve earned up to that point is yours to keep.',
  },
  {
    question: 'Is my money safe?',
    answer: 'Your funds sit in audited, non-custodial vaults on the Base network (built by Coinbase). We never hold your money. Only you can move or withdraw it. Every transaction is transparent and verifiable on BaseScan. That said, DeFi carries smart contract risk. Only save what you can afford to lose.',
  },
  {
    question: 'How is this different from a bank?',
    answer: `${BRAND.name} gives you a cleaner path into transparent onchain yield. You keep full custody, you can inspect the rails, and your first steps can feel closer to a modern finance app than raw DeFi. The trade-off is still the same: returns are variable, not insured, and smart contract risk exists.`,
  },
  {
    question: 'Do I need crypto experience?',
    answer: 'Nope. Sign in with your email. No wallet or crypto knowledge needed. We handle the technical stuff. You just pick a savings plan and add money.',
  },
]
</script>

<template>
  <section ref="sectionRef" class="py-24 sm:py-32">
    <div class="max-w-3xl mx-auto px-5 sm:px-6 lg:px-8">
      <!-- Section header -->
      <div
        class="text-center mb-16 transition-all duration-700 ease-out"
        :class="visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'"
      >
        <p class="text-xs font-semibold text-muted-foreground uppercase tracking-[0.2em] mb-3">
          Honest answers
        </p>
        <h2 class="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-[-0.03em]">
          What you should know
        </h2>
        <p class="mt-4 text-muted-foreground text-base max-w-xl mx-auto">
          We believe in transparency. Here's what most apps won't tell you.
        </p>
      </div>

      <!-- FAQ items -->
      <div class="space-y-3">
        <div
          v-for="(faq, i) in faqs"
          :key="i"
          class="rounded-2xl border border-white/6 bg-white/3 overflow-hidden transition-all duration-500"
          :class="[
            visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8',
            openIndex === i ? 'bg-white/5 border-white/10' : 'hover:bg-white/4 hover:border-white/8',
          ]"
          :style="{ transitionDelay: visible ? `${200 + i * 80}ms` : '0ms' }"
        >
          <button
            class="w-full flex items-center justify-between gap-4 p-5 sm:p-6 text-left"
            @click="toggle(i)"
          >
            <span class="font-semibold text-sm sm:text-base text-foreground">{{ faq.question }}</span>
            <Icon
              name="lucide:chevron-down"
              class="w-5 h-5 text-muted-foreground shrink-0 transition-transform duration-300"
              :class="openIndex === i ? 'rotate-180' : ''"
            />
          </button>

          <div
            class="grid transition-all duration-300 ease-out"
            :class="openIndex === i ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'"
          >
            <div class="overflow-hidden">
              <p class="px-5 sm:px-6 pb-5 sm:pb-6 text-sm text-muted-foreground leading-relaxed">
                {{ faq.answer }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
