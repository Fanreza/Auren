<script setup lang="ts">
const props = defineProps<{
  apyDetails: { '1d': string | null; '7d': string | null; '30d': string | null } | null
  currentApy: string | null
}>()

function parseApy(v: string | null): number | null {
  if (!v) return null
  const n = parseFloat(v)
  return isNaN(n) ? null : n
}

const periods = computed(() => {
  // Live APY from vaultApys is most up-to-date; fall back to apyDetails['1d']
  const oneDay = parseApy(props.apyDetails?.['1d'] ?? null) ?? parseApy(props.currentApy)
  const sevenDay = parseApy(props.apyDetails?.['7d'] ?? null)
  const thirtyDay = parseApy(props.apyDetails?.['30d'] ?? null)

  return [
    { key: '1d', label: '24h', value: oneDay, vsKey: '7d', vsValue: sevenDay },
    { key: '7d', label: '7d',  value: sevenDay, vsKey: '30d', vsValue: thirtyDay },
    { key: '30d', label: '30d', value: thirtyDay, vsKey: null, vsValue: null },
  ]
})

function delta(curr: number | null, prev: number | null): { value: number; positive: boolean } | null {
  if (curr === null || prev === null) return null
  const diff = curr - prev
  if (Math.abs(diff) < 0.001) return null
  return { value: diff, positive: diff > 0 }
}
</script>

<template>
  <Card>
    <CardContent class="p-5">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-semibold">APY trend</h3>
        <p class="text-[11px] text-muted-foreground/60">Live from vault</p>
      </div>

      <div class="grid grid-cols-3 gap-3">
        <div
          v-for="p in periods" :key="p.key"
          class="rounded-xl border border-border/40 bg-background/40 p-3"
        >
          <p class="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider mb-1">
            {{ p.label }}
          </p>
          <p
            class="text-lg font-bold tabular-nums"
            :class="p.value !== null ? 'text-primary' : 'text-muted-foreground/40'"
          >
            <template v-if="p.value !== null">{{ p.value.toFixed(2) }}%</template>
            <template v-else>—</template>
          </p>
          <!-- Delta indicator -->
          <div v-if="p.vsKey && delta(p.value, p.vsValue)" class="mt-1 flex items-center gap-0.5 text-[10px] tabular-nums">
            <Icon
              :name="delta(p.value, p.vsValue)!.positive ? 'lucide:trending-up' : 'lucide:trending-down'"
              class="w-2.5 h-2.5"
              :class="delta(p.value, p.vsValue)!.positive ? 'text-emerald-400' : 'text-orange-400'"
            />
            <span :class="delta(p.value, p.vsValue)!.positive ? 'text-emerald-400' : 'text-orange-400'">
              {{ delta(p.value, p.vsValue)!.positive ? '+' : '' }}{{ delta(p.value, p.vsValue)!.value.toFixed(2) }}%
            </span>
            <span class="text-muted-foreground/40">vs {{ p.vsKey }}</span>
          </div>
          <p v-else-if="p.vsKey" class="mt-1 text-[10px] text-muted-foreground/40">
            stable vs {{ p.vsKey }}
          </p>
        </div>
      </div>

      <p class="text-[10px] text-muted-foreground/50 mt-3 text-center">
        Variable rate — past performance doesn't guarantee future returns
      </p>
    </CardContent>
  </Card>
</template>
