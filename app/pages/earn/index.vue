<script setup lang="ts">
import { useEarnStore, type EarnVault } from '~/composables/useEarnStore'
import { useProfileStore } from '~/stores/useProfileStore'
import { usePrivyAuth } from '~/composables/usePrivy'
import { useCurrency } from '~/composables/useCurrency'
import { BRAND } from '~/config/brand'
import { toast } from 'vue-sonner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'

useHead({ title: `Earn · ${BRAND.name}` })

const store = useEarnStore()
const profileStore = useProfileStore()
const { isConnected } = usePrivyAuth()
const { format: fmtCurrency } = useCurrency()

onMounted(() => {
  store.fetchVaults()
  if (isConnected.value) store.fetchPositions()
})
watch(isConnected, (c) => { if (c) store.fetchPositions() })

// ── Filters ──────────────────────────────────────────────────────────────
const assetFilter = ref<string>('all')
const protocolFilter = ref<string>('all')
const tagFilter = ref<string>('all')
const minTvl = ref<number>(10_000_000)
const searchQuery = ref('')
const sortBy = ref<'apy' | 'tvl'>('apy')

// Aggregate tags from catalog
const uniqueTags = computed(() => {
  const set = new Set<string>()
  for (const v of store.vaults) for (const t of v.tags) set.add(t)
  return Array.from(set).sort()
})

const filteredVaults = computed<EarnVault[]>(() => {
  let list = [...store.vaults]
  if (assetFilter.value !== 'all') list = list.filter(v => v.assetSymbol === assetFilter.value)
  if (protocolFilter.value !== 'all') list = list.filter(v => v.protocol === protocolFilter.value)
  if (tagFilter.value !== 'all') list = list.filter(v => v.tags.includes(tagFilter.value))
  if (minTvl.value > 0) list = list.filter(v => v.tvl >= minTvl.value)
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(v =>
      v.name.toLowerCase().includes(q) ||
      v.protocol.toLowerCase().includes(q) ||
      v.assetSymbol.toLowerCase().includes(q) ||
      v.description.toLowerCase().includes(q),
    )
  }
  list.sort((a, b) => sortBy.value === 'apy' ? b.apy - a.apy : b.tvl - a.tvl)
  return list
})

// User position lookup by vault address (for "You: $X" badge on card)
// LI.FI Portfolio API shape varies — try both `vault.address` and top-level `address`.
const userPositionByAddress = computed(() => {
  const map = new Map<string, number>()
  for (const pos of store.positions) {
    if (!pos) continue
    const addr = (pos.vault?.address ?? (pos as any).address ?? '').toString().toLowerCase()
    if (addr) map.set(addr, (map.get(addr) ?? 0) + (pos.assetsValue ?? 0))
  }
  return map
})

function getUserPosition(vault: EarnVault): number {
  return userPositionByAddress.value.get(vault.address.toLowerCase()) ?? 0
}

function handleDeposit(v: EarnVault) {
  if (!isConnected.value) {
    toast.info('Connect your wallet first')
    return
  }
  // Route through the existing pocket create flow with the earn vault preselected.
  // app.vue reads these query params on mount and opens CreatePocketDialog at step 3.
  navigateTo({
    path: '/app',
    query: {
      earn_vault: v.address,
      earn_chain: String(v.chainId ?? 8453),
      earn_protocol: v.protocol ?? '',
      earn_symbol: v.name ?? '',
      earn_asset_symbol: v.assetSymbol ?? '',
      earn_asset_address: v.assetAddress ?? '',
    },
  })
}

function resetFilters() {
  assetFilter.value = 'all'
  protocolFilter.value = 'all'
  tagFilter.value = 'all'
  minTvl.value = 10_000_000
  searchQuery.value = ''
}

const MIN_TVL_OPTIONS = [
  { label: '$0', value: 0 },
  { label: '$1M', value: 1_000_000 },
  { label: '$10M', value: 10_000_000 },
  { label: '$100M', value: 100_000_000 },
]
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

    <main class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <!-- Header -->
      <div class="flex items-end justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 class="text-3xl font-bold tracking-tight">Earn</h1>
          <p class="text-sm text-muted-foreground mt-1">
            Browse every yield vault from LI.FI. Deposit directly — no goal, no wrapper.
          </p>
        </div>
        <div v-if="store.totalPositionsUsd > 0" class="text-right">
          <p class="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Your positions</p>
          <p class="text-xl font-bold tabular-nums">{{ fmtCurrency(store.totalPositionsUsd) }}</p>
          <p class="text-[10px] text-muted-foreground/60">{{ store.positions.length }} vaults</p>
        </div>
      </div>

      <!-- Filter bar -->
      <div class="rounded-2xl border border-border/60 bg-muted/20 p-3 mb-5 space-y-3">
        <!-- Search -->
        <div class="relative">
          <Icon name="lucide:search" class="w-4 h-4 text-muted-foreground/60 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            v-model="searchQuery"
            placeholder="Search by vault, protocol, asset, or description..."
            class="h-10 pl-10 pr-10"
          />
          <button
            v-if="searchQuery"
            class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground"
            @click="searchQuery = ''"
          >
            <Icon name="lucide:x" class="w-3.5 h-3.5" />
          </button>
        </div>

        <!-- Filter chips -->
        <div class="flex items-center gap-2 flex-wrap text-xs">
          <Select v-model="assetFilter">
            <SelectTrigger class="h-9 w-auto min-w-32 text-xs">
              <SelectValue placeholder="All assets" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All assets</SelectItem>
              <SelectItem v-for="a in store.uniqueAssets" :key="a" :value="a">{{ a }}</SelectItem>
            </SelectContent>
          </Select>

          <Select v-model="protocolFilter">
            <SelectTrigger class="h-9 w-auto min-w-36 text-xs">
              <SelectValue placeholder="All protocols" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All protocols</SelectItem>
              <SelectItem v-for="p in store.uniqueProtocols" :key="p" :value="p">{{ p }}</SelectItem>
            </SelectContent>
          </Select>

          <Select v-if="uniqueTags.length" v-model="tagFilter">
            <SelectTrigger class="h-9 w-auto min-w-36 text-xs">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              <SelectItem v-for="t in uniqueTags" :key="t" :value="t">{{ t }}</SelectItem>
            </SelectContent>
          </Select>

          <div class="flex items-center gap-1">
            <span class="text-muted-foreground/60 mr-1">Min TVL</span>
            <Button
              v-for="opt in MIN_TVL_OPTIONS" :key="opt.value"
              :variant="minTvl === opt.value ? 'default' : 'outline'"
              size="sm"
              class="h-8 px-2.5 text-xs"
              @click="minTvl = opt.value"
            >{{ opt.label }}</Button>
          </div>

          <Select v-model="sortBy">
            <SelectTrigger class="h-9 w-auto min-w-28 text-xs">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="apy">Sort: APY</SelectItem>
              <SelectItem value="tvl">Sort: TVL</SelectItem>
            </SelectContent>
          </Select>

          <Button
            v-if="assetFilter !== 'all' || protocolFilter !== 'all' || tagFilter !== 'all' || searchQuery"
            variant="ghost"
            size="sm"
            class="h-8 px-2 text-xs text-muted-foreground"
            @click="resetFilters"
          >
            Clear
          </Button>

          <span class="ml-auto text-muted-foreground/60">
            {{ filteredVaults.length }} of {{ store.vaults.length }} vaults
          </span>
        </div>
      </div>

      <!-- User earn positions (compact row) -->
      <div v-if="store.positions.length" class="mb-6">
        <h2 class="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider mb-3">
          Your earn positions ({{ store.positions.length }})
        </h2>
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          <div
            v-for="(pos, i) in store.positions" :key="i"
            class="rounded-xl border border-primary/30 bg-primary/5 p-3"
          >
            <p class="text-xs font-bold truncate">{{ pos?.vault?.name ?? '—' }}</p>
            <p class="text-[10px] text-muted-foreground/70 truncate mb-2">{{ pos?.vault?.protocol ?? '' }}</p>
            <div class="flex items-baseline justify-between">
              <p class="text-sm font-bold tabular-nums">{{ fmtCurrency(pos?.assetsValue ?? 0) }}</p>
              <p class="text-[10px] text-primary">{{ ((pos?.vault?.apy ?? 0) * 100).toFixed(1) }}%</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Catalog heading -->
      <div class="flex items-baseline justify-between mb-3">
        <h2 class="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">
          All vaults
        </h2>
        <Skeleton v-if="store.loadingVaults" class="h-3 w-20" />
      </div>

      <!-- Card grid -->
      <div v-if="store.loadingVaults && !store.vaults.length" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div
          v-for="i in 6" :key="i"
          class="rounded-2xl border border-border/60 bg-muted/20 p-4 space-y-3"
        >
          <div class="flex items-start gap-3">
            <Skeleton class="w-10 h-10 rounded-xl shrink-0" />
            <div class="flex-1 space-y-1.5">
              <Skeleton class="h-4 w-24" />
              <Skeleton class="h-3 w-16" />
            </div>
          </div>
          <Skeleton class="h-8 w-28" />
          <Skeleton class="h-12 w-full rounded-lg" />
          <div class="flex gap-1.5">
            <Skeleton class="h-4 w-14 rounded" />
            <Skeleton class="h-4 w-10 rounded" />
          </div>
          <div class="pt-3 border-t border-border/40">
            <Skeleton class="h-9 w-full rounded-lg" />
          </div>
        </div>
      </div>
      <div v-else-if="!filteredVaults.length" class="rounded-2xl border border-dashed border-border/60 p-12 text-center">
        <Icon name="lucide:search-x" class="w-10 h-10 text-muted-foreground/40 mb-3 mx-auto" />
        <p class="text-sm text-muted-foreground mb-1">No vaults match your filters</p>
        <p class="text-xs text-muted-foreground/60 mb-4">Try adjusting the filters or lower the TVL threshold</p>
        <Button variant="outline" size="sm" @click="resetFilters">Reset filters</Button>
      </div>
      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <AppEarnVaultCard
          v-for="v in filteredVaults" :key="v.address + '-' + v.chainId"
          :vault="v"
          :user-position-usd="getUserPosition(v)"
          @deposit="handleDeposit"
        />
      </div>

      <p class="text-[10px] text-muted-foreground/50 text-center mt-8">
        Direct deposit flow is in preview. For now, create a pocket to use any of these vaults.
      </p>
    </main>

    <LandingFooter />
  </div>
</template>
