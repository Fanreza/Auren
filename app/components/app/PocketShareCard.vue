<script setup lang="ts">
import { BRAND } from '~/config/brand'

const props = defineProps<{
  pocketName: string
  strategyLabel: string
  strategyColor: string
  assetSymbol: string
  currentValueUsd: string
  profitFormatted: string | null
  profitPositive: boolean
  apyFormatted: string | null
}>()

const colorMap: Record<string, { text: string; bg: string; glow: string }> = {
  emerald: { text: 'text-emerald-400', bg: 'bg-emerald-500/20', glow: 'bg-emerald-500/15' },
  blue: { text: 'text-blue-400', bg: 'bg-blue-500/20', glow: 'bg-blue-500/15' },
  violet: { text: 'text-violet-400', bg: 'bg-violet-500/20', glow: 'bg-violet-500/15' },
}

const colors = computed(() => colorMap[props.strategyColor] ?? colorMap.emerald!)
</script>

<template>
  <div
    class="w-[360px] rounded-2xl p-6 relative overflow-hidden"
    style="background: #09090b; font-family: 'Plus Jakarta Sans', system-ui, sans-serif;"
  >
    <!-- Background glow -->
    <div
      class="absolute w-[200px] h-[200px] rounded-full blur-[80px] opacity-30 top-[-40px] right-[-40px]"
      :class="colors.glow"
    />

    <!-- Header -->
    <div class="flex items-center justify-between mb-6 relative z-10">
      <div class="flex items-center gap-2.5">
        <img src="/logo.png" :alt="BRAND.name" class="w-9 h-9 rounded-lg" />
        <div>
          <p class="text-xs text-zinc-500 mb-0.5">{{ BRAND.name }}</p>
          <p class="text-base font-semibold text-white">{{ pocketName }}</p>
          <p class="text-xs text-zinc-400 mt-0.5">{{ strategyLabel }} Strategy</p>
        </div>
      </div>
      <div
        class="px-2.5 py-1 rounded-full text-xs font-medium"
        :class="[colors.bg, colors.text]"
      >
        {{ assetSymbol }}
      </div>
    </div>

    <!-- Main value -->
    <div class="mb-5 relative z-10">
      <p class="text-xs text-zinc-500 mb-1">Current Value</p>
      <p class="text-3xl font-bold text-white tracking-tight">{{ currentValueUsd }}</p>
      <p
        v-if="profitFormatted"
        class="text-sm mt-1.5 font-medium"
        :class="profitPositive ? 'text-emerald-400' : 'text-red-400'"
      >
        {{ profitFormatted }} yield earned
      </p>
    </div>

    <!-- APY -->
    <div v-if="apyFormatted" class="mb-6 relative z-10">
      <div class="inline-flex bg-zinc-800/80 rounded-lg px-3 py-2">
        <div>
          <p class="text-[10px] text-zinc-500 uppercase tracking-wider">APY</p>
          <p class="text-sm font-semibold" :class="colors.text">{{ apyFormatted }}</p>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="flex items-center justify-between border-t border-zinc-800 pt-4 relative z-10">
      <p class="text-[11px] text-zinc-600">{{ BRAND.domain }}</p>
      <p class="text-[11px] text-zinc-600">Built on Base</p>
    </div>
  </div>
</template>
