<script setup lang="ts">
const props = defineProps<{
  totalEarningsUsd: number
  pocketCount: number
  topPocketName: string | null
}>()

function formatUsd(v: number): string {
  if (v < 0.01) return '<$0.01'
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const hasEarnings = computed(() => props.totalEarningsUsd > 0)
</script>

<template>
  <div
    v-if="pocketCount > 0"
    class="rounded-xl border border-border/50 bg-card p-4"
  >
    <div class="flex items-center gap-2 mb-2">
      <Icon name="lucide:sparkles" class="w-4 h-4 text-amber-400" />
      <p class="text-sm font-semibold">This week</p>
    </div>

    <div v-if="hasEarnings">
      <p class="text-sm text-muted-foreground">
        You earned
        <span class="font-semibold text-foreground">{{ formatUsd(totalEarningsUsd) }}</span>
        from {{ pocketCount }} pocket{{ pocketCount !== 1 ? 's' : '' }}.
      </p>
      <p v-if="topPocketName" class="text-xs text-muted-foreground mt-1">
        Your best earner: <span class="font-medium text-foreground">{{ topPocketName }}</span>
      </p>
    </div>

    <div v-else>
      <p class="text-sm text-muted-foreground">
        Your {{ pocketCount }} pocket{{ pocketCount !== 1 ? 's are' : ' is' }} earning yield.
        Check back soon to see your earnings grow.
      </p>
    </div>
  </div>
</template>
