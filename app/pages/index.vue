<script setup lang="ts">
import { BRAND } from '~/config/brand'
import { STRATEGY_LIST } from '~/config/strategies'

useHead({
  title: `${BRAND.name} | Save smarter, from any chain`,
  meta: [
    { name: 'description', content: BRAND.description },
  ],
})
</script>

<template>
  <div class="dark">
    <div class="bg-background text-foreground min-h-screen">
      <LandingNav />

      <main>
        <!-- 1. Hero — split layout, mock pocket card, chain badges -->
        <LandingHero />

        <div class="w-full h-px bg-border" />

        <!-- 2. What is a pocket — visual goal cards -->
        <LandingFeatures />

        <div class="w-full h-px bg-border" />

        <!-- 3. How it works — 3 numbered steps -->
        <LandingHowItWorks />

        <div class="w-full h-px bg-border" />

        <!-- 4. Strategies — Conservative / Balanced / Aggressive -->
        <LandingStrategies :strategies="STRATEGY_LIST" />

        <div class="w-full h-px bg-border" />

        <!-- 5. Calculator — see how much you could earn -->
        <LandingCalculator />

        <div class="w-full h-px bg-border" />

        <!-- 6. Under the hood — LI.FI + protocols + Privy + security + CTA -->
        <LandingTrust />

        <div class="w-full h-px bg-border" />

        <!-- 7. FAQ -->
        <LandingFAQ />
      </main>

      <LandingFooter />
    </div>
  </div>
</template>
