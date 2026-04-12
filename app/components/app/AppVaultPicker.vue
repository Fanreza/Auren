<script setup lang="ts">
import { useVaultCatalog, type CatalogVault } from '~/composables/useVaultCatalog'
import { STRATEGIES, STRATEGY_LIST, type StrategyKey } from '~/config/strategies'
import { useProfileStore } from '~/stores/useProfileStore'

const props = defineProps<{
  /** Currently selected vault (for controlled mode) */
  modelValue: CatalogVault | null
  /** If set, only show vaults for this strategy. Otherwise show all. */
  lockStrategy?: StrategyKey
  /** Addresses to disable (e.g. vaults already used by other pockets of this user) */
  disabledAddresses?: string[]
}>()

const emit = defineEmits<{
  'update:modelValue': [v: CatalogVault | null]
}>()

const catalog = useVaultCatalog()
const profileStore = useProfileStore()

// Initial fetch
onMounted(() => { catalog.fetchCatalog() })

// ── Filter state ────────────────────────────────────────────────────────────
const selectedStrategy = ref<StrategyKey | 'all'>(props.lockStrategy ?? 'all')

const disabledSet = computed(() => {
  const set = new Set<string>()
  for (const addr of (props.disabledAddresses ?? [])) set.add(addr.toLowerCase())
  return set
})

const filteredVaults = computed<CatalogVault[]>(() => {
  let list = catalog.all
  if (selectedStrategy.value !== 'all') {
    list = catalog.byStrategy[selectedStrategy.value] ?? []
  }
  return [...list].sort((a, b) => b.apy - a.apy)
})

function isDisabled(vault: CatalogVault): boolean {
  return disabledSet.value.has(vault.address.toLowerCase())
}

function select(vault: CatalogVault) {
  if (isDisabled(vault)) return
  emit('update:modelValue', vault)
}

function isSelected(vault: CatalogVault): boolean {
  return props.modelValue?.address.toLowerCase() === vault.address.toLowerCase()
}

function fmtTvl(n: number): string {
  if (n >= 1_000_000_000) return '$' + (n / 1_000_000_000).toFixed(1) + 'B'
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(0) + 'M'
  if (n >= 1_000) return '$' + (n / 1_000).toFixed(0) + 'K'
  return '$' + n.toFixed(0)
}

function strategyMeta(key: StrategyKey) {
  return STRATEGIES[key]
}
</script>

<template>
  <div class="space-y-3">
    <!-- Strategy filter tabs (hidden when locked) -->
    <div v-if="!lockStrategy" class="flex gap-1 bg-muted/40 rounded-lg p-0.5">
      <button
        class="flex-1 text-[11px] font-semibold py-1.5 rounded-md transition-colors"
        :class="selectedStrategy === 'all' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'"
        @click="selectedStrategy = 'all'"
      >All</button>
      <button
        v-for="s in STRATEGY_LIST" :key="s.key"
        class="flex-1 text-[11px] font-semibold py-1.5 rounded-md transition-colors"
        :class="selectedStrategy === s.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'"
        @click="selectedStrategy = s.key"
      >{{ s.assetSymbol }}</button>
    </div>

    <!-- Loading skeleton -->
    <div v-if="catalog.loading && !filteredVaults.length" class="space-y-1.5">
      <div
        v-for="i in 4" :key="i"
        class="rounded-xl border border-border/60 bg-muted/20 p-3 flex items-center gap-3"
      >
        <Skeleton class="w-2 h-8 rounded-full" />
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

    <!-- Empty -->
    <div v-else-if="!filteredVaults.length" class="text-center py-8">
      <Icon name="lucide:inbox" class="w-6 h-6 text-muted-foreground/40 mb-2 mx-auto" />
      <p class="text-xs text-muted-foreground">No Composer-compatible vaults found</p>
    </div>

    <!-- Vault list -->
    <div v-else class="space-y-1.5">
      <button
        v-for="vault in filteredVaults" :key="vault.address"
        type="button"
        class="w-full text-left rounded-xl border p-3 transition-all"
        :class="[
          isSelected(vault) && !isDisabled(vault)
            ? 'border-primary bg-primary/5'
            : isDisabled(vault)
              ? 'border-border/30 bg-muted/20 opacity-50 cursor-not-allowed'
              : 'border-border/60 bg-muted/20 hover:border-border/80 hover:bg-muted/30',
        ]"
        :disabled="isDisabled(vault)"
        @click="select(vault)"
      >
        <div class="flex items-start gap-3">
          <AppVaultLogos
            :asset-address="vault.assetAddress"
            :asset-symbol="vault.assetSymbol"
            :protocol="vault.protocol"
            size="sm"
          />
          <!-- Main info -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5">
              <p class="text-sm font-bold truncate">{{ vault.name }}</p>
              <span
                v-if="isDisabled(vault)"
                class="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0"
              >In use</span>
            </div>
            <p class="text-[11px] text-muted-foreground/70 truncate">
              {{ vault.protocol }} · {{ vault.assetSymbol }}
            </p>
          </div>
          <!-- APY + TVL -->
          <div class="text-right shrink-0">
            <p class="text-sm font-bold text-primary tabular-nums">{{ (vault.apy * 100).toFixed(2) }}%</p>
            <p class="text-[10px] text-muted-foreground/60">TVL {{ fmtTvl(vault.tvl) }}</p>
          </div>
        </div>
      </button>
    </div>
  </div>
</template>
