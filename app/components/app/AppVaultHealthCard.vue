<script setup lang="ts">
import type { VaultHealth } from '~/composables/useVaultHealth'

const props = defineProps<{
  health: VaultHealth | null
  /** Optional title override */
  title?: string
}>()

const stars = computed(() => {
  if (!props.health) return []
  return Array.from({ length: 5 }, (_, i) => i < props.health!.score)
})

const scoreColor = computed(() => {
  if (!props.health) return 'text-muted-foreground'
  if (props.health.score >= 4) return 'text-emerald-400'
  if (props.health.score >= 3) return 'text-amber-400'
  return 'text-orange-400'
})

function badgeStyle(status: string) {
  switch (status) {
    case 'good': return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
    case 'warn': return 'bg-amber-500/10 text-amber-300 border-amber-500/20'
    case 'bad':  return 'bg-red-500/10 text-red-300 border-red-500/20'
    default:     return 'bg-muted/30 text-muted-foreground border-border/30'
  }
}

function badgeIcon(status: string) {
  if (status === 'good') return 'lucide:check-circle-2'
  if (status === 'warn') return 'lucide:alert-triangle'
  if (status === 'bad')  return 'lucide:x-circle'
  return 'lucide:help-circle'
}
</script>

<template>
  <Card v-if="health">
    <CardContent class="p-5">
      <!-- Header: title + stars -->
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-semibold">{{ title ?? 'Vault health' }}</h3>
        <div class="flex items-center gap-0.5">
          <Icon
            v-for="(filled, i) in stars" :key="i"
            name="lucide:star"
            class="w-3.5 h-3.5"
            :class="filled ? scoreColor : 'text-muted-foreground/20'"
            :fill="filled ? 'currentColor' : 'none'"
          />
        </div>
      </div>

      <!-- Summary -->
      <p class="text-xs text-muted-foreground mb-3">{{ health.summary }}</p>

      <!-- Badge list -->
      <div class="space-y-1.5">
        <div
          v-for="b in health.badges" :key="b.key"
          class="flex items-start gap-2 px-2.5 py-2 rounded-lg border text-[11px]"
          :class="badgeStyle(b.status)"
        >
          <Icon :name="badgeIcon(b.status)" class="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <div class="flex-1 min-w-0">
            <p class="font-semibold leading-tight">{{ b.label }}</p>
            <p class="text-[10px] opacity-80 leading-tight mt-0.5">{{ b.detail }}</p>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
