<script setup lang="ts">
import { useStrategyStore } from '~/stores/useStrategyStore'
import { usePrivyAuth } from '~/composables/usePrivy'
import { useProfileStore } from '~/stores/useProfileStore'
import { useVaultCatalog } from '~/composables/useVaultCatalog'
import { BRAND } from '~/config/brand'
import type { StrategyWithAllocations } from '~/types/database'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'

useHead({ title: `Strategies · ${BRAND.name}` })

const store = useStrategyStore()
const profileStore = useProfileStore()
const catalog = useVaultCatalog()
const { isConnected, isReady } = usePrivyAuth()

// Compute weighted APY + TVL live from catalog (ignore stale DB cache)
function liveApyPct(strategy: StrategyWithAllocations): number {
  let weighted = 0
  let hasAny = false
  for (const alloc of strategy.allocations) {
    const vault = catalog.findByAddress(alloc.vault_address)
    if (vault) {
      weighted += vault.apy * alloc.weight
      hasAny = true
    }
  }
  return hasAny ? weighted * 100 : 0
}

function liveTvlUsd(strategy: StrategyWithAllocations): number {
  let total = 0
  for (const alloc of strategy.allocations) {
    const vault = catalog.findByAddress(alloc.vault_address)
    if (vault) total += vault.tvl
  }
  return total
}

const tab = ref<'marketplace' | 'mine'>('marketplace')
const riskFilter = ref<'all' | 'low' | 'medium' | 'high'>('all')
const sortBy = ref<'apy' | 'tvl' | 'followers'>('followers')

onMounted(() => {
  store.fetchPublic()
  catalog.fetchCatalog()
  if (profileStore.currentUser?.id) store.fetchMine(profileStore.currentUser.id)
})

watch(() => profileStore.currentUser?.id, (id) => {
  if (id) store.fetchMine(id)
})

watch([isConnected, isReady], ([connected, ready]) => {
  // Let unauthenticated users browse marketplace, but redirect for "mine" tab
  if (ready && !connected && tab.value === 'mine') tab.value = 'marketplace'
})

const activeList = computed<StrategyWithAllocations[]>(() => {
  const source = tab.value === 'marketplace' ? store.publicStrategies : store.myStrategies
  let list = [...source]
  if (riskFilter.value !== 'all') {
    list = list.filter(s => s.risk_level === riskFilter.value)
  }
  if (sortBy.value === 'apy') list.sort((a, b) => liveApyPct(b) - liveApyPct(a))
  else if (sortBy.value === 'tvl') list.sort((a, b) => liveTvlUsd(b) - liveTvlUsd(a))
  else list.sort((a, b) => b.follower_count - a.follower_count)
  return list
})

function riskColor(level: string | null): string {
  if (level === 'low') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
  if (level === 'medium') return 'text-amber-400 bg-amber-500/10 border-amber-500/20'
  if (level === 'high') return 'text-violet-400 bg-violet-500/10 border-violet-500/20'
  return 'text-muted-foreground bg-muted/30 border-border/30'
}

function truncate(addr: string | null): string {
  if (!addr) return ''
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function goToCreate() {
  navigateTo('/strategy/create')
}

function goToDetail(id: string) {
  navigateTo(`/strategy/${id}`)
}
</script>

<template>
  <div class="min-h-dvh bg-background">
    <AppHeader
      :is-connected="isConnected"
      :is-base="true"
      :display-name="profileStore.currentUser ? profileStore.displayName(profileStore.currentUser.address) : ''"
      :address="profileStore.currentUser?.address"
      @sign-in="navigateTo('/app')"
      @go-profile="navigateTo('/profile')"
      @logout="() => { navigateTo('/') }"
    />
    <AppTabBar v-if="isConnected" class="mt-3" />

    <main class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <!-- Header + CTA -->
      <div class="flex items-end justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 class="text-3xl font-bold tracking-tight">Strategies</h1>
          <p class="text-sm text-muted-foreground mt-1">
            Multi-vault savings recipes. Follow community-made strategies or build your own.
          </p>
        </div>
        <Button class="h-10 rounded-xl" @click="goToCreate">
          <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" /> Create strategy
        </Button>
      </div>

      <!-- Tabs -->
      <div class="flex gap-1 bg-muted/40 rounded-lg p-0.5 mb-5 w-fit">
        <button
          class="px-4 py-2 text-sm font-semibold rounded-md transition-colors"
          :class="tab === 'marketplace' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'"
          @click="tab = 'marketplace'"
        >Marketplace</button>
        <button
          v-if="isConnected"
          class="px-4 py-2 text-sm font-semibold rounded-md transition-colors"
          :class="tab === 'mine' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'"
          @click="tab = 'mine'"
        >My strategies</button>
      </div>

      <!-- Filters -->
      <div class="flex items-center gap-2 mb-5 flex-wrap">
        <div class="flex gap-1 text-xs">
          <Button
            v-for="r in ['all', 'low', 'medium', 'high']" :key="r"
            :variant="riskFilter === r ? 'default' : 'outline'"
            size="sm"
            class="h-8 px-3 text-xs capitalize"
            @click="riskFilter = r as any"
          >{{ r === 'all' ? 'All risks' : r }}</Button>
        </div>
        <div class="ml-auto">
          <Select v-model="sortBy">
            <SelectTrigger class="h-9 w-auto min-w-40 text-xs">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="followers">Most followed</SelectItem>
              <SelectItem value="apy">Highest APY</SelectItem>
              <SelectItem value="tvl">Most TVL</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <!-- Loading skeleton grid -->
      <div v-if="store.loading && !activeList.length" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="i in 6" :key="i"
          class="rounded-2xl border border-border/60 bg-muted/20 p-5 space-y-3"
        >
          <div class="flex items-start gap-3">
            <Skeleton class="w-10 h-10 rounded-xl shrink-0" />
            <div class="flex-1 space-y-1.5">
              <Skeleton class="h-4 w-28" />
              <Skeleton class="h-3 w-16" />
            </div>
          </div>
          <Skeleton class="h-3 w-full" />
          <Skeleton class="h-3 w-5/6" />
          <div class="flex items-center justify-between pt-3 border-t border-border/40">
            <div class="space-y-1">
              <Skeleton class="h-2 w-8" />
              <Skeleton class="h-4 w-12" />
            </div>
            <div class="space-y-1 items-end flex flex-col">
              <Skeleton class="h-2 w-10" />
              <Skeleton class="h-4 w-6" />
            </div>
          </div>
          <div class="flex items-center justify-between">
            <Skeleton class="h-4 w-16 rounded-full" />
            <Skeleton class="h-3 w-6" />
          </div>
        </div>
      </div>

      <!-- Empty -->
      <div
        v-else-if="!activeList.length"
        class="rounded-2xl border border-dashed border-border/60 p-12 text-center"
      >
        <Icon name="lucide:layers" class="w-10 h-10 text-muted-foreground/40 mb-3 mx-auto" />
        <p class="font-semibold mb-1">
          {{ tab === 'mine' ? 'No strategies yet' : 'No public strategies match' }}
        </p>
        <p class="text-sm text-muted-foreground mb-6 max-w-60 mx-auto">
          {{ tab === 'mine' ? 'Create your first strategy and start earning with your own recipe.' : 'Try different filters or be the first to create one.' }}
        </p>
        <Button class="rounded-xl" @click="goToCreate">
          <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" /> Create strategy
        </Button>
      </div>

      <!-- Grid -->
      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <button
          v-for="s in activeList" :key="s.id"
          class="group text-left rounded-2xl border border-border/60 bg-muted/20 hover:bg-muted/30 hover:border-primary/40 transition-all p-5 relative overflow-hidden"
          @click="goToDetail(s.id)"
        >
          <!-- Cover accent -->
          <div
            class="absolute -top-12 -right-12 w-32 h-32 rounded-full blur-3xl pointer-events-none opacity-40"
            :style="{ backgroundColor: s.cover_color ?? '#86B238' }"
          />

          <!-- Header -->
          <div class="relative flex items-start gap-3 mb-3">
            <div
              class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              :style="{ backgroundColor: (s.cover_color ?? '#86B238') + '20' }"
            >
              <Icon
                :name="s.icon ?? 'lucide:layers'"
                class="w-5 h-5"
                :style="{ color: s.cover_color ?? '#86B238' }"
              />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5 flex-wrap">
                <p class="font-bold text-sm truncate">{{ s.name }}</p>
                <span v-if="s.is_system" class="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-primary/15 text-primary shrink-0">System</span>
              </div>
              <p class="text-[11px] text-muted-foreground/60 mt-0.5">
                by {{ s.is_system ? 'Auren' : (s.creator_id ? truncate(s.creator_id) : 'Unknown') }}
              </p>
            </div>
          </div>

          <!-- Description -->
          <p v-if="s.description" class="relative text-[11px] text-muted-foreground line-clamp-2 mb-4">
            {{ s.description }}
          </p>

          <!-- Stats row -->
          <div class="relative flex items-center justify-between pt-3 border-t border-border/40 mb-3">
            <div>
              <p class="text-[9px] text-muted-foreground/60 uppercase tracking-wider">APY</p>
              <p class="text-sm font-bold text-primary tabular-nums">
                {{ liveApyPct(s) > 0 ? liveApyPct(s).toFixed(2) + '%' : '—' }}
              </p>
            </div>
            <div class="text-right">
              <p class="text-[9px] text-muted-foreground/60 uppercase tracking-wider">Vaults</p>
              <p class="text-sm font-bold tabular-nums">{{ s.allocations.length }}</p>
            </div>
          </div>

          <!-- Footer meta -->
          <div class="relative flex items-center justify-between text-[10px] text-muted-foreground/70">
            <span
              v-if="s.risk_level"
              class="px-1.5 py-0.5 rounded-full border uppercase tracking-wider font-semibold"
              :class="riskColor(s.risk_level)"
            >
              {{ s.risk_level }} risk
            </span>
            <span class="flex items-center gap-1">
              <Icon name="lucide:users" class="w-3 h-3" />
              {{ s.follower_count }}
            </span>
          </div>
        </button>
      </div>
    </main>

    <LandingFooter />
  </div>
</template>
