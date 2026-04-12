<script setup lang="ts">
import { useStrategyStore } from '~/stores/useStrategyStore'
import { useVaultCatalog, type CatalogVault } from '~/composables/useVaultCatalog'
import { useProfileStore } from '~/stores/useProfileStore'
import { usePrivyAuth } from '~/composables/usePrivy'
import { BRAND } from '~/config/brand'
import { toast } from 'vue-sonner'
import type { StrategyRiskLevel, StrategyVisibility } from '~/types/database'
import { Slider } from '~/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'

const route = useRoute()

// Edit mode: if ?edit=<id> present, we're modifying an existing strategy
const editId = computed(() => (route.query.edit as string | undefined) ?? null)
const isEditing = computed(() => !!editId.value)

useHead(() => ({
  title: isEditing.value ? `Edit strategy · ${BRAND.name}` : `Create strategy · ${BRAND.name}`,
}))

const store = useStrategyStore()
const catalog = useVaultCatalog()
const profileStore = useProfileStore()
const { isConnected } = usePrivyAuth()

// ── Form state ──────────────────────────────────────────────────────────────
const step = ref(1)
const name = ref('')
const description = ref('')
const riskLevel = ref<StrategyRiskLevel>('low')
const coverColor = ref('#86B238')
const iconName = ref('lucide:layers')
const visibility = ref<StrategyVisibility>('private')

// Selected vaults with weights — user picks from catalog
interface PickedAllocation {
  vault: CatalogVault
  weight: number  // 0..1
}
const picks = ref<PickedAllocation[]>([])

// ── Load catalog + pre-fill form in edit mode ──────────────────────────────
async function loadExistingStrategy() {
  if (!editId.value) return
  // Ensure both catalogs are ready so we can resolve vault addresses
  await Promise.all([catalog.fetchCatalog(), catalog.fetchOpenCatalog()])
  const existing = await store.fetchById(editId.value)
  if (!existing) {
    toast.error('Strategy not found')
    navigateTo('/strategy')
    return
  }
  if (existing.is_system) {
    toast.error('System strategies cannot be edited')
    navigateTo(`/strategy/${existing.id}`)
    return
  }
  if (existing.creator_id !== profileStore.currentUser?.id) {
    toast.error('You can only edit your own strategies')
    navigateTo(`/strategy/${existing.id}`)
    return
  }
  // Pre-fill form state
  name.value = existing.name
  description.value = existing.description ?? ''
  riskLevel.value = (existing.risk_level ?? 'low') as StrategyRiskLevel
  coverColor.value = existing.cover_color ?? '#86B238'
  iconName.value = existing.icon ?? 'lucide:layers'
  visibility.value = existing.visibility as StrategyVisibility
  // Resolve allocation vaults from catalog
  picks.value = existing.allocations
    .map((a) => {
      const vault = catalog.findByAddress(a.vault_address)
      return vault ? { vault, weight: a.weight } : null
    })
    .filter((p): p is PickedAllocation => p !== null)
  if (picks.value.length !== existing.allocations.length) {
    toast.info('Some vaults in this strategy are no longer Composer-compatible and have been removed')
  }
}

onMounted(() => {
  if (isEditing.value) {
    loadExistingStrategy()
  } else {
    // Strategy builder uses the open catalog — any Composer-compatible vault
    catalog.fetchOpenCatalog()
  }
})

// ── Validation + derived ────────────────────────────────────────────────────
const totalWeight = computed(() => picks.value.reduce((s, p) => s + p.weight, 0))
const weightValid = computed(() => Math.abs(totalWeight.value - 1) < 0.001)

const weightedApy = computed(() => {
  if (!picks.value.length) return 0
  return picks.value.reduce((s, p) => s + p.vault.apy * p.weight, 0) * 100
})

const aggregateTvl = computed(() =>
  picks.value.reduce((s, p) => s + p.vault.tvl, 0),
)

// Picker filters (Step 2)
const pickerSearch = ref('')
const pickerAssetFilter = ref<string>('all')

// Unique assets from the open catalog (for dropdown)
const pickerAvailableAssets = computed(() => {
  const set = new Set<string>()
  for (const v of catalog.openVaults) if (v.assetSymbol) set.add(v.assetSymbol)
  return Array.from(set).sort()
})

const availableVaults = computed(() => {
  const selectedAddrs = new Set(picks.value.map(p => p.vault.address.toLowerCase()))
  let list = catalog.openVaults.filter(v => !selectedAddrs.has(v.address.toLowerCase()))
  if (pickerAssetFilter.value !== 'all') {
    list = list.filter(v => v.assetSymbol === pickerAssetFilter.value)
  }
  if (pickerSearch.value) {
    const q = pickerSearch.value.toLowerCase()
    list = list.filter(v =>
      v.name.toLowerCase().includes(q) ||
      v.protocol.toLowerCase().includes(q) ||
      v.assetSymbol.toLowerCase().includes(q),
    )
  }
  return list
})

function addVault(v: CatalogVault) {
  // Insert with remaining weight so total stays ≤ 1
  const remaining = Math.max(0, 1 - totalWeight.value)
  picks.value.push({ vault: v, weight: remaining > 0.5 ? 0.5 : remaining })
  rebalance()
}

function removeVault(idx: number) {
  picks.value.splice(idx, 1)
  rebalance()
}

/**
 * When the user changes a weight, redistribute remaining (1 - newWeight) across
 * the OTHER vaults proportionally to their current weights. If other vaults are
 * all 0, split evenly.
 */
function updateWeight(idx: number, newWeight: number) {
  const clamped = Math.max(0, Math.min(1, newWeight))
  picks.value[idx]!.weight = clamped

  const others = picks.value.filter((_, i) => i !== idx)
  if (!others.length) return

  const remaining = 1 - clamped
  const othersTotal = others.reduce((s, p) => s + p.weight, 0)

  if (othersTotal === 0) {
    // Split evenly
    const share = remaining / others.length
    for (let i = 0; i < picks.value.length; i++) {
      if (i !== idx) picks.value[i]!.weight = share
    }
  } else {
    // Scale proportionally
    const scale = remaining / othersTotal
    for (let i = 0; i < picks.value.length; i++) {
      if (i !== idx) picks.value[i]!.weight *= scale
    }
  }
}

/** Re-normalize weights if they drift from 1 (called on add/remove). */
function rebalance() {
  if (!picks.value.length) return
  const total = totalWeight.value
  if (total === 0) {
    const share = 1 / picks.value.length
    for (const p of picks.value) p.weight = share
    return
  }
  if (Math.abs(total - 1) > 0.001) {
    const scale = 1 / total
    for (const p of picks.value) p.weight *= scale
  }
}

// ── Publish ─────────────────────────────────────────────────────────────────
const publishing = ref(false)
const publishError = ref('')

async function handlePublish() {
  if (!profileStore.currentUser) {
    publishError.value = 'Sign in required'
    return
  }
  if (!name.value.trim()) {
    publishError.value = 'Name required'
    return
  }
  if (!picks.value.length) {
    publishError.value = 'Add at least one vault'
    return
  }
  if (!weightValid.value) {
    publishError.value = 'Weights must sum to 100%'
    return
  }

  publishing.value = true
  publishError.value = ''

  const payload = {
    creator_id: profileStore.currentUser.id,
    name: name.value.trim(),
    description: description.value.trim() || undefined,
    risk_level: riskLevel.value,
    visibility: visibility.value,
    cover_color: coverColor.value,
    icon: iconName.value,
    allocations: picks.value.map((p, i) => ({
      vault_address: p.vault.address,
      vault_chain_id: p.vault.chainId,
      protocol: p.vault.protocol,
      vault_symbol: p.vault.vaultSymbol,
      asset_symbol: p.vault.assetSymbol,
      asset_address: p.vault.assetAddress,
      weight: p.weight,
      display_order: i,
    })),
  }

  const result = isEditing.value && editId.value
    ? await store.updateStrategy(editId.value, profileStore.currentUser.id, payload)
    : await store.create(payload)

  publishing.value = false

  if (!result) {
    publishError.value = store.error || (isEditing.value ? 'Failed to save changes' : 'Failed to create strategy')
    return
  }

  toast.success(isEditing.value ? 'Strategy updated' : 'Strategy published')
  navigateTo(`/strategy/${result.id}`)
}

// ── Helpers ─────────────────────────────────────────────────────────────────
const COLORS = ['#86B238', '#2775CA', '#F7931A', '#627EEA', '#E84142', '#8B5CF6', '#EC4899', '#F59E0B']
const ICONS = ['lucide:layers', 'lucide:shield', 'lucide:zap', 'lucide:scale', 'lucide:sparkles', 'lucide:target', 'lucide:flame', 'lucide:rocket']

function fmtTvl(n: number): string {
  if (n >= 1_000_000_000) return '$' + (n / 1_000_000_000).toFixed(1) + 'B'
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(0) + 'M'
  if (n >= 1_000) return '$' + (n / 1_000).toFixed(0) + 'K'
  return '$' + n.toFixed(0)
}

function canContinue(): boolean {
  if (step.value === 1) return !!name.value.trim()
  if (step.value === 2) return picks.value.length > 0
  if (step.value === 3) return weightValid.value && picks.value.length > 0
  return true
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

    <main class="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <NuxtLink to="/strategy" class="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-6">
        <Icon name="lucide:arrow-left" class="w-3.5 h-3.5" /> Back to strategies
      </NuxtLink>

      <h1 class="text-2xl font-bold mb-2">
        {{ isEditing ? 'Edit strategy' : 'Create a strategy' }}
      </h1>
      <p class="text-sm text-muted-foreground mb-6">
        <template v-if="isEditing">
          Changes only affect this strategy — copies made by other users stay unchanged.
        </template>
        <template v-else>
          Combine multiple vaults into one recipe. Followers can deposit into your strategy with one click.
        </template>
      </p>

      <!-- Step indicator -->
      <div class="flex items-center gap-2 mb-6">
        <div
          v-for="s in 4" :key="s"
          class="flex-1 h-1 rounded-full"
          :class="s <= step ? 'bg-primary' : 'bg-muted/40'"
        />
      </div>

      <!-- Step 1: Basics -->
      <Card v-if="step === 1">
        <CardContent class="p-5 space-y-4">
          <div>
            <label class="text-sm font-medium mb-1.5 block">Strategy name</label>
            <Input v-model="name" placeholder="e.g. Stable Max Yield" class="h-11" />
          </div>

          <div>
            <label class="text-sm font-medium mb-1.5 block">Description <span class="text-muted-foreground/60">(optional)</span></label>
            <textarea
              v-model="description"
              rows="3"
              placeholder="Explain the thesis — what's the edge, what's the risk?"
              class="flex min-h-20 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
            />
          </div>

          <div>
            <label class="text-sm font-medium mb-2 block">Risk level</label>
            <div class="flex gap-2">
              <button
                v-for="r in (['low', 'medium', 'high'] as const)" :key="r"
                class="flex-1 py-2 rounded-lg border text-xs font-semibold transition-colors capitalize"
                :class="riskLevel === r ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'"
                @click="riskLevel = r"
              >{{ r }}</button>
            </div>
          </div>

          <div>
            <label class="text-sm font-medium mb-2 block">Cover color</label>
            <div class="flex gap-2 flex-wrap">
              <button
                v-for="c in COLORS" :key="c"
                class="w-8 h-8 rounded-lg border-2 transition-all"
                :class="coverColor === c ? 'border-foreground scale-110' : 'border-border'"
                :style="{ backgroundColor: c }"
                @click="coverColor = c"
              />
            </div>
          </div>

          <div>
            <label class="text-sm font-medium mb-2 block">Icon</label>
            <div class="flex gap-2 flex-wrap">
              <button
                v-for="i in ICONS" :key="i"
                class="w-10 h-10 rounded-lg border-2 flex items-center justify-center transition-all"
                :class="iconName === i ? 'border-primary bg-primary/10' : 'border-border'"
                @click="iconName = i"
              >
                <Icon :name="i" class="w-4 h-4" :style="{ color: coverColor }" />
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Step 2: Pick vaults -->
      <Card v-else-if="step === 2">
        <CardContent class="p-5">
          <h3 class="text-sm font-semibold mb-1">Pick vaults</h3>
          <p class="text-[11px] text-muted-foreground mb-4">
            Any Composer-compatible vault — any asset, any protocol. Combine as many as you want.
          </p>

          <!-- Search + asset filter -->
          <div class="space-y-2 mb-4">
            <div class="relative">
              <Icon name="lucide:search" class="w-3.5 h-3.5 text-muted-foreground/60 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input
                v-model="pickerSearch"
                placeholder="Search by vault, protocol, asset..."
                class="h-9 pl-9 text-xs"
              />
            </div>
            <Select v-model="pickerAssetFilter">
              <SelectTrigger class="h-9 text-xs">
                <SelectValue placeholder="All assets" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All assets</SelectItem>
                <SelectItem v-for="a in pickerAvailableAssets" :key="a" :value="a">{{ a }}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <!-- Already picked -->
          <div v-if="picks.length" class="mb-4">
            <p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Selected ({{ picks.length }})
            </p>
            <div class="space-y-1.5">
              <div
                v-for="(p, idx) in picks" :key="p.vault.address"
                class="flex items-center gap-2 p-2 rounded-lg bg-primary/5 border border-primary/20"
              >
                <AppVaultLogos
                  :asset-address="p.vault.assetAddress"
                  :asset-symbol="p.vault.assetSymbol"
                  :protocol="p.vault.protocol"
                  size="sm"
                />
                <div class="flex-1 min-w-0">
                  <p class="text-xs font-bold truncate">{{ p.vault.vaultSymbol }}</p>
                  <p class="text-[10px] text-muted-foreground/70">{{ p.vault.protocol }} · {{ (p.vault.apy * 100).toFixed(2) }}% APY</p>
                </div>
                <button class="text-muted-foreground hover:text-destructive" @click="removeVault(idx)">
                  <Icon name="lucide:x" class="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <!-- Available (loading skeleton) -->
          <div v-if="catalog.loadingOpen && !availableVaults.length" class="space-y-1.5">
            <div
              v-for="i in 4" :key="i"
              class="flex items-center gap-3 p-3 rounded-lg border border-border/60 bg-muted/20"
            >
              <div class="flex-1 space-y-1.5">
                <Skeleton class="h-4 w-28" />
                <Skeleton class="h-3 w-20" />
              </div>
              <div class="text-right space-y-1">
                <Skeleton class="h-4 w-12" />
                <Skeleton class="h-3 w-10 ml-auto" />
              </div>
            </div>
          </div>
          <div v-else class="space-y-1.5">
            <p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Available
            </p>
            <button
              v-for="v in availableVaults" :key="v.address"
              class="w-full flex items-center gap-3 p-3 rounded-lg border border-border/60 hover:border-primary/40 bg-muted/20 hover:bg-muted/30 transition-colors text-left"
              @click="addVault(v)"
            >
              <AppVaultLogos
                :asset-address="v.assetAddress"
                :asset-symbol="v.assetSymbol"
                :protocol="v.protocol"
                size="sm"
              />
              <div class="flex-1 min-w-0">
                <p class="text-sm font-bold truncate">{{ v.vaultSymbol }}</p>
                <p class="text-[11px] text-muted-foreground/70">{{ v.protocol }} · {{ v.assetSymbol }}</p>
              </div>
              <div class="text-right shrink-0">
                <p class="text-sm font-bold text-primary tabular-nums">{{ (v.apy * 100).toFixed(2) }}%</p>
                <p class="text-[10px] text-muted-foreground/60">{{ fmtTvl(v.tvl) }}</p>
              </div>
              <Icon name="lucide:plus" class="w-4 h-4 text-muted-foreground/60" />
            </button>
          </div>
        </CardContent>
      </Card>

      <!-- Step 3: Weights -->
      <Card v-else-if="step === 3">
        <CardContent class="p-5">
          <h3 class="text-sm font-semibold mb-1">Allocation weights</h3>
          <p class="text-[11px] text-muted-foreground mb-4">
            Must sum to 100%. Other vaults auto-rebalance when you move a slider.
          </p>

          <div class="space-y-4">
            <div
              v-for="(p, idx) in picks" :key="p.vault.address"
              class="rounded-xl border border-border/60 p-3 space-y-2"
            >
              <div class="flex items-center justify-between">
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-bold truncate">{{ p.vault.vaultSymbol }}</p>
                  <p class="text-[10px] text-muted-foreground/70">{{ p.vault.protocol }}</p>
                </div>
                <p class="text-lg font-bold text-primary tabular-nums ml-2 shrink-0">
                  {{ (p.weight * 100).toFixed(0) }}%
                </p>
              </div>
              <Slider
                :model-value="[Math.round(p.weight * 100)]"
                :min="0"
                :max="100"
                :step="1"
                @update:model-value="(v) => v && updateWeight(idx, (v[0] ?? 0) / 100)"
              />
            </div>
          </div>

          <!-- Live preview -->
          <div class="mt-5 rounded-xl bg-background/40 border border-border/40 p-4">
            <div class="grid grid-cols-3 gap-2 text-center">
              <div>
                <p class="text-[10px] text-muted-foreground/70 uppercase tracking-wider">APY</p>
                <p class="text-base font-bold text-primary tabular-nums">{{ weightedApy.toFixed(2) }}%</p>
              </div>
              <div>
                <p class="text-[10px] text-muted-foreground/70 uppercase tracking-wider">TVL</p>
                <p class="text-base font-bold tabular-nums">{{ fmtTvl(aggregateTvl) }}</p>
              </div>
              <div>
                <p class="text-[10px] text-muted-foreground/70 uppercase tracking-wider">Total</p>
                <p
                  class="text-base font-bold tabular-nums"
                  :class="weightValid ? 'text-primary' : 'text-destructive'"
                >
                  {{ (totalWeight * 100).toFixed(0) }}%
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Step 4: Publish -->
      <Card v-else>
        <CardContent class="p-5 space-y-4">
          <h3 class="text-sm font-semibold mb-1">{{ isEditing ? 'Review changes' : 'Review & publish' }}</h3>

          <div class="rounded-xl border border-border/60 p-4">
            <div class="flex items-center gap-3 mb-3">
              <div
                class="w-10 h-10 rounded-xl flex items-center justify-center"
                :style="{ backgroundColor: coverColor + '20' }"
              >
                <Icon :name="iconName" class="w-5 h-5" :style="{ color: coverColor }" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-bold">{{ name }}</p>
                <p class="text-[11px] text-muted-foreground">{{ picks.length }} vaults · {{ weightedApy.toFixed(2) }}% APY</p>
              </div>
            </div>
            <p v-if="description" class="text-[11px] text-muted-foreground">{{ description }}</p>
          </div>

          <div>
            <label class="text-sm font-medium mb-2 block">Visibility</label>
            <div class="space-y-2">
              <button
                v-for="v in (['private', 'unlisted', 'public'] as const)" :key="v"
                class="w-full text-left p-3 rounded-lg border-2 transition-colors"
                :class="visibility === v ? 'border-primary bg-primary/5' : 'border-border'"
                @click="visibility = v"
              >
                <p class="text-sm font-semibold capitalize">{{ v }}</p>
                <p class="text-[11px] text-muted-foreground">
                  <template v-if="v === 'private'">Only you can see and use this strategy</template>
                  <template v-else-if="v === 'unlisted'">Anyone with the link can use it, but it's not in the marketplace</template>
                  <template v-else>Listed in the marketplace, anyone can deposit and fork</template>
                </p>
              </button>
            </div>
          </div>

          <p v-if="publishError" class="text-xs text-destructive">{{ publishError }}</p>
        </CardContent>
      </Card>

      <!-- Nav buttons -->
      <div class="flex gap-3 mt-5">
        <Button v-if="step > 1" variant="outline" class="h-11" @click="step--">
          <Icon name="lucide:arrow-left" class="w-4 h-4" />
        </Button>
        <Button
          v-if="step < 4"
          class="flex-1 h-11"
          :disabled="!canContinue()"
          @click="step++"
        >
          Continue <Icon name="lucide:arrow-right" class="w-4 h-4 ml-1.5" />
        </Button>
        <Button
          v-else
          class="flex-1 h-11"
          :disabled="publishing || !weightValid"
          @click="handlePublish"
        >
          <Icon v-if="publishing" name="lucide:loader-2" class="w-4 h-4 animate-spin mr-1.5" />
          <template v-if="publishing">{{ isEditing ? 'Saving…' : 'Publishing…' }}</template>
          <template v-else>{{ isEditing ? 'Save changes' : 'Publish strategy' }}</template>
        </Button>
      </div>
    </main>

    <LandingFooter />
  </div>
</template>
