<script setup lang="ts">
import { useStrategyStore } from '~/stores/useStrategyStore'
import { useProfileStore } from '~/stores/useProfileStore'
import { useVaultCatalog } from '~/composables/useVaultCatalog'
import { usePrivyAuth } from '~/composables/usePrivy'
import { BRAND } from '~/config/brand'
import { toast } from 'vue-sonner'
import type { StrategyWithAllocations } from '~/types/database'

const route = useRoute()
const store = useStrategyStore()
const profileStore = useProfileStore()
const catalog = useVaultCatalog()
const { isConnected } = usePrivyAuth()

const strategy = ref<StrategyWithAllocations | null>(null)
const loading = ref(true)
const error = ref('')

async function load() {
  loading.value = true
  const id = route.params.id as string
  strategy.value = await store.fetchById(id)
  loading.value = false
  if (!strategy.value) error.value = 'Strategy not found or has been removed'
}

onMounted(() => {
  load()
  catalog.fetchCatalog()
  // Load user's strategies so we can detect existing forks of this one
  if (profileStore.currentUser?.id) store.fetchMine(profileStore.currentUser.id)
})

// Detect user's forks of the current strategy (they may have copied multiple times)
const myForks = computed(() => {
  if (!strategy.value || !profileStore.currentUser) return []
  return store.myStrategies.filter(s => s.forked_from_id === strategy.value!.id)
})

const hasCopied = computed(() => myForks.value.length > 0)

useHead(() => ({
  title: strategy.value ? `${strategy.value.name} · ${BRAND.name}` : BRAND.name,
}))

const isOwner = computed(() =>
  strategy.value && profileStore.currentUser
    ? strategy.value.creator_id === profileStore.currentUser.id
    : false,
)

const weightedApy = computed(() => {
  if (!strategy.value) return 0
  let weighted = 0
  let hasAny = false
  for (const alloc of strategy.value.allocations) {
    const vault = catalog.findByAddress(alloc.vault_address)
    if (vault) {
      weighted += vault.apy * alloc.weight
      hasAny = true
    }
  }
  return hasAny ? weighted * 100 : 0
})

const liveTvl = computed(() => {
  if (!strategy.value) return 0
  let total = 0
  for (const alloc of strategy.value.allocations) {
    const vault = catalog.findByAddress(alloc.vault_address)
    if (vault) total += vault.tvl
  }
  return total
})

function fmtTvl(n: number): string {
  if (n >= 1_000_000_000) return '$' + (n / 1_000_000_000).toFixed(1) + 'B'
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(0) + 'M'
  if (n >= 1_000) return '$' + (n / 1_000).toFixed(0) + 'K'
  return '$' + n.toFixed(0)
}

// Per-allocation live APY (for the vault list display)
function allocationApy(vaultAddress: string): number {
  const vault = catalog.findByAddress(vaultAddress)
  return vault ? vault.apy * 100 : 0
}

async function handleFollow() {
  if (!profileStore.currentUser || !strategy.value) return
  const result = await store.toggleFollow(strategy.value.id, profileStore.currentUser.id)
  toast.success(result ? 'Following strategy' : 'Unfollowed')
  strategy.value = await store.fetchById(strategy.value.id)
}

async function handleFork() {
  if (!profileStore.currentUser || !strategy.value) return
  const forked = await store.fork(strategy.value.id, profileStore.currentUser.id)
  if (forked) {
    toast.success('Copied to My strategies')
    // Refresh source to reflect new follower count
    strategy.value = await store.fetchById(strategy.value.id)
    // Refresh my strategies list so detail recognizes the new copy
    await store.fetchMine(profileStore.currentUser.id)
    navigateTo(`/strategy/${forked.id}`)
  }
}

function goToMyCopy() {
  const copy = myForks.value[0]
  if (copy) navigateTo(`/strategy/${copy.id}`)
}

async function handleDelete() {
  if (!profileStore.currentUser || !strategy.value || !isOwner.value) return
  if (!confirm('Delete this strategy? This cannot be undone.')) return
  const ok = await store.deleteStrategy(strategy.value.id, profileStore.currentUser.id)
  if (ok) {
    toast.success('Strategy deleted')
    navigateTo('/strategy')
  }
}

function riskColor(level: string | null): string {
  if (level === 'low') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
  if (level === 'medium') return 'text-amber-400 bg-amber-500/10 border-amber-500/20'
  if (level === 'high') return 'text-violet-400 bg-violet-500/10 border-violet-500/20'
  return 'text-muted-foreground bg-muted/30 border-border/30'
}

function truncate(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
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

    <main class="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <NuxtLink to="/strategy" class="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-6">
        <Icon name="lucide:arrow-left" class="w-3.5 h-3.5" /> Back to strategies
      </NuxtLink>

      <!-- Loading skeleton -->
      <div v-if="loading" class="space-y-4">
        <Card>
          <CardContent class="p-6 space-y-4">
            <div class="flex items-start gap-4">
              <Skeleton class="w-14 h-14 rounded-xl" />
              <div class="flex-1 space-y-2">
                <Skeleton class="h-5 w-40" />
                <Skeleton class="h-3 w-24" />
              </div>
            </div>
            <Skeleton class="h-4 w-full" />
            <Skeleton class="h-4 w-4/5" />
            <div class="grid grid-cols-4 gap-2">
              <Skeleton v-for="i in 4" :key="i" class="h-16 rounded-xl" />
            </div>
            <div class="flex gap-2">
              <Skeleton class="flex-1 h-11 rounded-xl" />
              <Skeleton class="h-11 w-24 rounded-xl" />
              <Skeleton class="h-11 w-24 rounded-xl" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent class="p-5 space-y-2">
            <Skeleton class="h-4 w-32 mb-3" />
            <Skeleton v-for="i in 3" :key="i" class="h-14 rounded-xl" />
          </CardContent>
        </Card>
      </div>

      <!-- Error -->
      <div v-else-if="error || !strategy" class="text-center py-20">
        <Icon name="lucide:circle-x" class="w-10 h-10 text-muted-foreground/40 mb-3 mx-auto" />
        <p class="text-sm text-muted-foreground">{{ error }}</p>
      </div>

      <!-- Detail -->
      <template v-else>
        <!-- Header card -->
        <Card class="overflow-hidden relative mb-4">
          <div
            class="absolute -top-16 -right-16 w-48 h-48 rounded-full blur-3xl pointer-events-none opacity-40"
            :style="{ backgroundColor: strategy.cover_color ?? '#86B238' }"
          />
          <CardContent class="p-6 relative">
            <div class="flex items-start gap-4 mb-4">
              <div
                class="w-14 h-14 rounded-xl flex items-center justify-center shrink-0"
                :style="{ backgroundColor: (strategy.cover_color ?? '#86B238') + '20' }"
              >
                <Icon
                  :name="strategy.icon ?? 'lucide:layers'"
                  class="w-6 h-6"
                  :style="{ color: strategy.cover_color ?? '#86B238' }"
                />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap mb-1">
                  <h1 class="text-xl font-bold tracking-tight">{{ strategy.name }}</h1>
                  <span v-if="strategy.is_system" class="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">System</span>
                  <span v-else-if="isOwner" class="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">Yours</span>
                  <span
                    v-if="strategy.risk_level"
                    class="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border"
                    :class="riskColor(strategy.risk_level)"
                  >
                    {{ strategy.risk_level }} risk
                  </span>
                </div>
                <p class="text-[11px] text-muted-foreground">
                  by {{ strategy.is_system ? 'Auren' : truncate(strategy.creator_id ?? '') }}
                  · {{ strategy.follower_count }} followers
                </p>
              </div>
            </div>

            <p v-if="strategy.description" class="text-sm text-muted-foreground mb-5">
              {{ strategy.description }}
            </p>

            <!-- Stats -->
            <div class="grid grid-cols-4 gap-2 mb-5">
              <div class="rounded-xl bg-background/40 border border-border/40 p-3 text-center">
                <p class="text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-1">APY</p>
                <p class="text-lg font-bold text-primary tabular-nums">
                  {{ weightedApy > 0 ? weightedApy.toFixed(2) + '%' : '—' }}
                </p>
              </div>
              <div class="rounded-xl bg-background/40 border border-border/40 p-3 text-center">
                <p class="text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-1">TVL</p>
                <p class="text-lg font-bold tabular-nums">
                  {{ liveTvl > 0 ? fmtTvl(liveTvl) : '—' }}
                </p>
              </div>
              <div class="rounded-xl bg-background/40 border border-border/40 p-3 text-center">
                <p class="text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-1">Vaults</p>
                <p class="text-lg font-bold tabular-nums">{{ strategy.allocations.length }}</p>
              </div>
              <div class="rounded-xl bg-background/40 border border-border/40 p-3 text-center">
                <p class="text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-1">Followers</p>
                <p class="text-lg font-bold tabular-nums">{{ strategy.follower_count }}</p>
              </div>
            </div>

            <!-- Already-copied indicator -->
            <div
              v-if="!isOwner && hasCopied"
              class="mb-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/10 border border-primary/30"
            >
              <Icon name="lucide:check-circle-2" class="w-4 h-4 text-primary shrink-0" />
              <div class="flex-1 min-w-0">
                <p class="text-xs font-semibold text-primary">
                  Already in your library
                </p>
                <p class="text-[10px] text-muted-foreground">
                  You can edit your copy without affecting the original.
                </p>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex gap-2 flex-wrap">
              <!-- Primary action varies based on state -->
              <Button
                v-if="isOwner"
                class="flex-1 h-11 rounded-xl"
                @click="navigateTo('/app')"
              >
                <Icon name="lucide:piggy-bank" class="w-4 h-4 mr-1.5" />
                Use in pocket
              </Button>
              <Button
                v-else-if="hasCopied"
                class="flex-1 h-11 rounded-xl"
                @click="goToMyCopy"
              >
                <Icon name="lucide:arrow-right" class="w-4 h-4 mr-1.5" />
                Go to my copy
              </Button>
              <Button
                v-else
                class="flex-1 h-11 rounded-xl"
                :disabled="!isConnected"
                @click="handleFork"
              >
                <Icon name="lucide:copy" class="w-4 h-4 mr-1.5" />
                Copy to my strategies
              </Button>

              <Button v-if="!strategy.is_system && !isOwner" variant="outline" class="h-11" @click="handleFollow">
                <Icon name="lucide:heart" class="w-4 h-4 mr-1.5" /> Follow
              </Button>
              <Button
                v-if="isOwner && !strategy.is_system"
                variant="outline"
                class="h-11"
                @click="navigateTo(`/strategy/create?edit=${strategy.id}`)"
              >
                <Icon name="lucide:pencil" class="w-4 h-4 mr-1.5" /> Edit
              </Button>
              <Button v-if="isOwner && !strategy.is_system" variant="outline" class="h-11 text-destructive" @click="handleDelete">
                <Icon name="lucide:trash-2" class="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <!-- Allocations -->
        <Card class="mb-4">
          <CardContent class="p-5">
            <h3 class="text-sm font-semibold mb-4">Vault allocations</h3>
            <div class="space-y-2">
              <div
                v-for="alloc in strategy.allocations" :key="alloc.id"
                class="flex items-center gap-3 p-3 rounded-xl bg-muted/20 border border-border/40"
              >
                <AppVaultLogos
                  :asset-address="alloc.asset_address"
                  :asset-symbol="alloc.asset_symbol"
                  :protocol="alloc.protocol"
                  size="sm"
                />
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-bold truncate">{{ alloc.vault_symbol ?? alloc.asset_symbol }}</p>
                  <p class="text-[11px] text-muted-foreground/70 truncate">
                    {{ alloc.protocol ?? 'Unknown' }} · {{ alloc.asset_symbol }}
                    <span v-if="allocationApy(alloc.vault_address) > 0" class="text-primary ml-1">
                      · {{ allocationApy(alloc.vault_address).toFixed(2) }}% APY
                    </span>
                  </p>
                </div>
                <div class="text-right shrink-0">
                  <p class="text-sm font-bold tabular-nums">{{ (alloc.weight * 100).toFixed(0) }}%</p>
                  <p class="text-[10px] text-muted-foreground/60 font-mono">
                    {{ truncate(alloc.vault_address) }}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- Forked attribution -->
        <div v-if="strategy.forked_from_id" class="text-[11px] text-muted-foreground/60 text-center mb-4">
          <Icon name="lucide:git-branch" class="w-3 h-3 inline mr-1" />
          Forked from another strategy
        </div>
      </template>
    </main>

    <LandingFooter />
  </div>
</template>
