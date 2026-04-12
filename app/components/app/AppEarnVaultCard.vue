<script setup lang="ts">
import type { EarnVault } from '~/composables/useEarnStore'

const props = defineProps<{
  vault: EarnVault
  /** Optional user position on this vault (for "your position" indicator) */
  userPositionUsd?: number
}>()

defineEmits<{
  deposit: [v: EarnVault]
}>()

// Derived: APY trend icon based on 1d vs 7d comparison
const trend = computed<'up' | 'down' | 'flat'>(() => {
  const diff = props.vault.apy1d - props.vault.apy7d
  if (diff > 0.001) return 'up'
  if (diff < -0.001) return 'down'
  return 'flat'
})

const trendIcon = computed(() => {
  if (trend.value === 'up') return 'lucide:trending-up'
  if (trend.value === 'down') return 'lucide:trending-down'
  return 'lucide:minus'
})

const trendColor = computed(() => {
  if (trend.value === 'up') return 'text-emerald-400'
  if (trend.value === 'down') return 'text-amber-400'
  return 'text-muted-foreground'
})


// Tag filters we care about rendering with special style
const TAG_STYLES: Record<string, string> = {
  stablecoin: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  single: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  crypto: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  lst: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  lrt: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
  rwa: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
}

function tagStyle(tag: string): string {
  return TAG_STYLES[tag.toLowerCase()] ?? 'bg-muted/40 text-muted-foreground border-border/40'
}

function fmtTvl(n: number): string {
  if (n >= 1_000_000_000) return '$' + (n / 1_000_000_000).toFixed(1) + 'B'
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(0) + 'M'
  if (n >= 1_000) return '$' + (n / 1_000).toFixed(0) + 'K'
  return '$' + n.toFixed(0)
}

function fmtUsd(n: number): string {
  if (n < 0.01) return '<$0.01'
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtFreshness(iso: string | null): string {
  if (!iso) return ''
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}
</script>

<template>
  <div class="relative rounded-2xl border border-border/60 bg-muted/20 hover:bg-muted/30 hover:border-primary/40 transition-all overflow-hidden group">
    <!-- Your position pill (top-right absolute) -->
    <div
      v-if="userPositionUsd && userPositionUsd > 0"
      class="absolute top-3 right-3 z-10 px-2 py-0.5 rounded-full bg-primary/15 border border-primary/30 text-[10px] font-bold text-primary"
    >
      You: {{ fmtUsd(userPositionUsd) }}
    </div>

    <!-- Header: asset + protocol logos + vault name -->
    <div class="px-4 pt-4 pb-3 flex items-start gap-3">
      <AppVaultLogos
        :asset-address="vault.assetAddress"
        :asset-symbol="vault.assetSymbol"
        :protocol="vault.protocol"
        size="md"
      />
      <div class="flex-1 min-w-0">
        <p class="text-sm font-bold truncate">{{ vault.name }}</p>
        <div class="flex items-center gap-1 mt-0.5">
          <span class="text-[11px] text-muted-foreground/70 truncate">{{ vault.protocol }}</span>
          <a
            v-if="vault.protocolUrl"
            :href="vault.protocolUrl"
            target="_blank"
            rel="noopener"
            class="text-muted-foreground/40 hover:text-muted-foreground"
            @click.stop
          >
            <Icon name="lucide:external-link" class="w-2.5 h-2.5 inline" />
          </a>
        </div>
        <p v-if="vault.description && vault.description !== vault.name" class="text-[10px] text-muted-foreground/50 mt-0.5 truncate">
          {{ vault.description }}
        </p>
      </div>
    </div>

    <!-- APY section -->
    <div class="px-4 pb-3">
      <div class="flex items-baseline gap-2 mb-1">
        <p class="text-2xl font-bold text-primary tabular-nums leading-none">
          {{ (vault.apy * 100).toFixed(2) }}%
        </p>
        <p class="text-xs text-muted-foreground/60">APY</p>
        <Icon
          :name="trendIcon"
          class="w-3.5 h-3.5 ml-auto"
          :class="trendColor"
        />
      </div>

      <!-- APY breakdown: base + reward -->
      <div v-if="vault.apyReward > 0" class="flex items-center gap-2 text-[10px] text-muted-foreground/60">
        <span>Base {{ (vault.apyBase * 100).toFixed(2) }}%</span>
        <span class="text-muted-foreground/30">·</span>
        <span class="text-amber-400/80">+ Reward {{ (vault.apyReward * 100).toFixed(2) }}%</span>
      </div>
      <div v-else class="text-[10px] text-muted-foreground/60">No reward incentives</div>
    </div>

    <!-- APY trend mini-chart (1d / 7d / 30d) -->
    <div class="px-4 pb-3">
      <div class="grid grid-cols-3 gap-1 rounded-lg bg-background/40 border border-border/40 p-2 text-center">
        <div>
          <p class="text-[9px] text-muted-foreground/60 uppercase tracking-wider">24h</p>
          <p class="text-[11px] font-semibold tabular-nums">{{ (vault.apy1d * 100).toFixed(1) }}%</p>
        </div>
        <div class="border-x border-border/30">
          <p class="text-[9px] text-muted-foreground/60 uppercase tracking-wider">7d</p>
          <p class="text-[11px] font-semibold tabular-nums">{{ (vault.apy7d * 100).toFixed(1) }}%</p>
        </div>
        <div>
          <p class="text-[9px] text-muted-foreground/60 uppercase tracking-wider">30d</p>
          <p class="text-[11px] font-semibold tabular-nums">{{ (vault.apy30d * 100).toFixed(1) }}%</p>
        </div>
      </div>
    </div>

    <!-- Tags -->
    <div v-if="vault.tags.length" class="px-4 pb-3 flex items-center gap-1 flex-wrap">
      <span
        v-for="t in vault.tags.slice(0, 3)" :key="t"
        class="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border"
        :class="tagStyle(t)"
      >{{ t }}</span>
    </div>

    <!-- Footer meta + CTA -->
    <div class="px-4 py-3 border-t border-border/40 bg-background/20">
      <div class="flex items-center justify-between mb-2 text-[10px]">
        <span class="flex items-center gap-1 text-muted-foreground/60">
          <Icon name="lucide:landmark" class="w-3 h-3" />
          TVL {{ fmtTvl(vault.tvl) }}
        </span>
        <span class="text-muted-foreground/50">
          {{ vault.chainName }}
        </span>
      </div>

      <div class="flex items-center justify-between mb-2 text-[10px]">
        <span class="flex items-center gap-1 text-muted-foreground/60">
          <Icon name="lucide:coins" class="w-3 h-3" />
          {{ vault.assetSymbol }}
        </span>
        <span v-if="vault.updatedAt" class="text-muted-foreground/40">
          Updated {{ fmtFreshness(vault.updatedAt) }}
        </span>
      </div>

      <Button
        class="w-full h-9 rounded-lg text-xs font-semibold mt-1"
        @click.stop="$emit('deposit', vault)"
      >
        <Icon name="lucide:plus" class="w-3.5 h-3.5 mr-1" />
        Deposit
      </Button>
    </div>
  </div>
</template>
