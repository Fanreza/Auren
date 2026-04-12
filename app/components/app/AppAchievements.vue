<script setup lang="ts">
import type { AchievementUnlock } from '~/composables/useAchievements'

const props = defineProps<{
  unlocks: AchievementUnlock[]
  unlockedCount: number
  totalCount: number
  /** When true, show all in grid; otherwise just unlocked + next 3 to unlock */
  showAll?: boolean
}>()

const TIER_STYLES: Record<string, string> = {
  starter:   'bg-muted/40 border-border',
  bronze:    'bg-amber-700/15 border-amber-700/30',
  silver:    'bg-slate-400/15 border-slate-400/30',
  gold:      'bg-yellow-500/15 border-yellow-500/30',
  legendary: 'bg-violet-500/15 border-violet-500/30',
}

const visible = computed(() => {
  if (props.showAll) return props.unlocks
  // Show all unlocked + next 3 locked
  const unlocked = props.unlocks.filter(u => u.unlockedAt)
  const locked = props.unlocks.filter(u => !u.unlockedAt).slice(0, 3)
  return [...unlocked, ...locked]
})

function progressPct(p?: { current: number; target: number }) {
  if (!p || p.target <= 0) return 0
  return Math.min(100, (p.current / p.target) * 100)
}
</script>

<template>
  <Card>
    <CardContent class="p-5">
      <div class="flex items-baseline justify-between mb-4">
        <h3 class="text-sm font-semibold">Achievements</h3>
        <p class="text-[11px] text-muted-foreground tabular-nums">
          {{ unlockedCount }} / {{ totalCount }} unlocked
        </p>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <div
          v-for="badge in visible" :key="badge.key"
          class="rounded-xl border p-3 transition-all"
          :class="[
            TIER_STYLES[badge.tier] ?? TIER_STYLES.starter,
            badge.unlockedAt ? 'opacity-100' : 'opacity-50 grayscale',
          ]"
        >
          <div class="flex items-start gap-2 mb-1">
            <span class="text-2xl leading-none">{{ badge.emoji }}</span>
            <div class="flex-1 min-w-0">
              <p class="text-xs font-bold leading-tight truncate">{{ badge.name }}</p>
              <p class="text-[9px] text-muted-foreground/70 leading-tight mt-0.5 line-clamp-2">
                {{ badge.description }}
              </p>
            </div>
          </div>

          <!-- Progress bar -->
          <div v-if="badge.progress && !badge.unlockedAt" class="mt-2">
            <div class="h-1 rounded-full bg-background/40 overflow-hidden">
              <div
                class="h-full rounded-full bg-primary/60 transition-all"
                :style="{ width: progressPct(badge.progress) + '%' }"
              />
            </div>
            <p class="text-[9px] text-muted-foreground/60 tabular-nums mt-0.5">
              {{ Math.round(progressPct(badge.progress)) }}%
            </p>
          </div>

          <Icon
            v-else-if="badge.unlockedAt"
            name="lucide:check-circle-2"
            class="w-3 h-3 text-primary mt-1"
          />
        </div>
      </div>
    </CardContent>
  </Card>
</template>
