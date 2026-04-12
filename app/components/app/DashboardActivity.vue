<script setup lang="ts">
import { STRATEGIES, type StrategyKey } from '~/config/strategies'
import type { ActivityItem } from '~/composables/useDashboardStats'

const props = defineProps<{
  items: ActivityItem[]
  loading?: boolean
  limit?: number
}>()

const visibleItems = computed(() => props.items.slice(0, props.limit ?? 8))

function relativeTime(ts: number): string {
  // DB stores timestamp in seconds — normalize to ms if value looks too small
  const ms = ts < 10_000_000_000 ? ts * 1000 : ts
  const diff = Date.now() - ms
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

function iconFor(type: string): string {
  if (type === 'deposit') return 'lucide:arrow-down-right'
  if (type === 'withdraw' || type === 'redeem') return 'lucide:arrow-up-right'
  return 'lucide:arrow-left-right'
}

function colorFor(type: string): string {
  if (type === 'deposit') return 'text-primary'
  if (type === 'withdraw' || type === 'redeem') return 'text-amber-400'
  return 'text-muted-foreground'
}

function labelFor(type: string): string {
  if (type === 'deposit') return 'Deposited'
  if (type === 'withdraw') return 'Withdrew'
  if (type === 'redeem') return 'Redeemed'
  if (type === 'switch') return 'Switched'
  return type
}

function getStrategy(key: StrategyKey) {
  return STRATEGIES[key]
}

function basescanUrl(hash: string): string {
  return `https://basescan.org/tx/${hash}`
}

function fmtUsd(n: number): string {
  if (n < 0.01) return '<$0.01'
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
</script>

<template>
  <div class="rounded-2xl border border-border/60 bg-muted/20 p-4">
    <div class="flex items-baseline justify-between mb-4">
      <p class="text-xs text-muted-foreground uppercase tracking-wider">Recent activity</p>
      <p class="text-[11px] text-muted-foreground/50">{{ items.length }} total</p>
    </div>

    <!-- Loading -->
    <div v-if="loading && !items.length" class="flex justify-center py-8">
      <Icon name="lucide:loader-2" class="w-4 h-4 animate-spin text-muted-foreground" />
    </div>

    <!-- Empty -->
    <div v-else-if="!items.length" class="text-center py-8">
      <Icon name="lucide:inbox" class="w-7 h-7 text-muted-foreground/30 mb-2 mx-auto" />
      <p class="text-sm text-muted-foreground">No transactions yet</p>
    </div>

    <!-- List -->
    <div v-else class="space-y-1">
      <a
        v-for="tx in visibleItems" :key="tx.id"
        :href="basescanUrl(tx.tx_hash)"
        target="_blank" rel="noopener"
        class="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-muted/40 transition-colors group"
      >
        <!-- Icon -->
        <div
          class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          :class="tx.type === 'deposit' ? 'bg-primary/10' : tx.type === 'withdraw' || tx.type === 'redeem' ? 'bg-amber-400/10' : 'bg-muted'"
        >
          <Icon :name="iconFor(tx.type)" :class="colorFor(tx.type)" class="w-4 h-4" />
        </div>

        <!-- Middle -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5">
            <p class="text-sm font-medium">{{ labelFor(tx.type) }}</p>
            <span class="text-[11px] text-muted-foreground/60 truncate">· {{ tx.pocket_name }}</span>
          </div>
          <p class="text-[11px] text-muted-foreground/60 mt-0.5">{{ relativeTime(tx.timestamp) }}</p>
        </div>

        <!-- Right -->
        <div class="text-right shrink-0">
          <p class="text-sm font-semibold tabular-nums" :class="colorFor(tx.type)">
            {{ tx.type === 'deposit' ? '+' : '-' }}{{ fmtUsd(tx.usd_value) }}
          </p>
          <p class="text-[10px] text-muted-foreground/50 font-mono">
            {{ getStrategy(tx.strategy_key)?.assetSymbol ?? '' }}
          </p>
        </div>

        <Icon name="lucide:external-link" class="w-3 h-3 text-muted-foreground/30 group-hover:text-muted-foreground shrink-0" />
      </a>
    </div>
  </div>
</template>
