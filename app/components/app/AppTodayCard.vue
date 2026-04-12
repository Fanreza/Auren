<script setup lang="ts">
import { useStreak } from '~/composables/useStreak'
import { useCurrency } from '~/composables/useCurrency'

const props = defineProps<{
  totalValueUsd: number
  avgApy: number   // weighted, e.g. 4.7
}>()

const { current, best, flameEmoji, flameLevel } = useStreak()
const { format } = useCurrency()

// ── Animated yield ticker (per second since midnight) ───────────────────────
const yieldPerSecond = computed(() => {
  if (props.totalValueUsd <= 0 || props.avgApy <= 0) return 0
  return (props.totalValueUsd * (props.avgApy / 100)) / (365 * 24 * 60 * 60)
})

const todayYieldUsd = ref(0)
let tickInterval: ReturnType<typeof setInterval> | null = null

function secondsSinceMidnight(): number {
  const now = new Date()
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
  return Math.floor((now.getTime() - midnight.getTime()) / 1000)
}

watch([yieldPerSecond, () => props.totalValueUsd], () => {
  // Initialize today's yield based on time elapsed since midnight
  todayYieldUsd.value = yieldPerSecond.value * secondsSinceMidnight()
}, { immediate: true })

onMounted(() => {
  tickInterval = setInterval(() => {
    if (yieldPerSecond.value > 0) {
      todayYieldUsd.value += yieldPerSecond.value
    }
  }, 1000)
})

onUnmounted(() => {
  if (tickInterval) clearInterval(tickInterval)
})

const isPersonalBest = computed(() => current.value >= best.value && current.value >= 1)
</script>

<template>
  <Card class="overflow-hidden relative">
    <!-- Decorative gradient corner -->
    <div class="absolute -top-12 -right-12 w-32 h-32 rounded-full bg-primary/15 blur-3xl pointer-events-none" />

    <CardContent class="p-5 relative">
      <div class="flex items-start justify-between mb-4">
        <div>
          <p class="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">Today</p>
          <h3 class="text-base font-bold mt-0.5">Welcome back</h3>
        </div>
        <div class="text-right">
          <div class="flex items-center gap-1 text-2xl">
            <span>{{ flameEmoji }}</span>
            <span class="text-lg font-bold tabular-nums">{{ current }}</span>
          </div>
          <p class="text-[10px] text-muted-foreground/60">day streak</p>
        </div>
      </div>

      <!-- Yield ticker -->
      <div class="rounded-xl bg-background/40 border border-border/40 p-3 mb-3">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-[10px] text-muted-foreground/70">Yield earned today</p>
            <p class="text-lg font-bold text-primary tabular-nums leading-tight mt-0.5">
              +{{ format(todayYieldUsd) }}
            </p>
          </div>
          <div class="text-right">
            <p class="text-[10px] text-muted-foreground/70">Per second</p>
            <p class="text-[10px] font-mono text-primary/80 tabular-nums">
              +{{ format(yieldPerSecond) }}
            </p>
          </div>
        </div>
      </div>

      <!-- Personal best badge -->
      <div v-if="isPersonalBest && current >= 7" class="flex items-center gap-1.5 text-[10px] text-amber-300">
        <Icon name="lucide:trophy" class="w-3 h-3" />
        <span class="font-semibold">Personal best!</span>
      </div>
      <div v-else-if="best > 0 && current < best" class="text-[10px] text-muted-foreground/60">
        Personal best: {{ best }} days · {{ best - current }} to beat
      </div>
      <div v-else-if="current === 0" class="text-[10px] text-muted-foreground/60">
        Visit daily to start your streak
      </div>
    </CardContent>
  </Card>
</template>
