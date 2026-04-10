<script setup lang="ts">
import { BRAND } from '~/config/brand'
import { STRATEGY_LIST } from '~/config/strategies'

useHead({
  title: `${BRAND.name} | Smart pockets on Base`,
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
        <LandingHero />

        <!-- Separator -->
        <div class="w-full h-px bg-white/6" />

        <LandingFeatures />

        <!-- Separator -->
        <div class="w-full h-px bg-white/6" />

        <LandingStrategies :strategies="STRATEGY_LIST" />

        <!-- Separator -->
        <div class="w-full h-px bg-white/6" />

        <LandingCalculator />

        <!-- Separator -->
        <div class="w-full h-px bg-white/6" />

        <LandingHowItWorks />

        <!-- Separator -->
        <div class="w-full h-px bg-white/6" />

        <LandingTrust />

        <!-- Separator -->
        <div class="w-full h-px bg-white/6" />

        <LandingFAQ />
      </main>

      <LandingFooter />
    </div>
  </div>
</template>
