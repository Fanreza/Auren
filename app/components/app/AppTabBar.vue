<script setup lang="ts">
// Shared tab bar for the 3 main app sections (Pockets / Earn / Strategy).
// Mount below AppHeader on each of the 3 routes.

const route = useRoute()

const tabs = [
  { key: 'app',      label: 'Pockets',    to: '/app',      icon: 'lucide:piggy-bank' },
  { key: 'earn',     label: 'Earn',       to: '/earn',     icon: 'lucide:sparkles' },
  { key: 'strategy', label: 'Strategies', to: '/strategy', icon: 'lucide:layers' },
]

function isActive(to: string): boolean {
  if (to === '/app') return route.path === '/app' || route.path.startsWith('/pocket')
  return route.path.startsWith(to)
}
</script>

<template>
  <nav class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="flex gap-1 bg-muted/30 rounded-xl p-1 border border-border/50 w-fit">
      <NuxtLink
        v-for="tab in tabs" :key="tab.key"
        :to="tab.to"
        class="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-colors"
        :class="isActive(tab.to)
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground'"
      >
        <Icon :name="tab.icon" class="w-3.5 h-3.5" />
        {{ tab.label }}
      </NuxtLink>
    </div>
  </nav>
</template>
