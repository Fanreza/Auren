<script setup lang="ts">
import { STRATEGIES, STRATEGY_LIST, type StrategyKey } from '~/config/strategies'
import type { WalletToken } from '~/composables/useWalletTokens'
import type { TxState } from '~/composables/useVault'
import type { LifiQuote } from '~/composables/useLifi'
import { useProfileStore } from '~/stores/useProfileStore'
import { useVaultCatalog, type CatalogVault } from '~/composables/useVaultCatalog'
import { useStrategyStore } from '~/stores/useStrategyStore'
import type { StrategyWithAllocations } from '~/types/database'
import type { PickedToken } from '~/components/app/AppTokenChainPicker.vue'
import { today, getLocalTimeZone } from '@internationalized/date'
import type { DateValue } from '@internationalized/date'
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover'
import { Calendar } from '~/components/ui/calendar'
import { toast } from 'vue-sonner'

const open = defineModel<boolean>('open', { required: true })

const props = defineProps<{
  creating: boolean
  txState?: TxState
  txError?: string
  walletTokens: WalletToken[]
  loadingTokens: boolean
  userAddress?: `0x${string}`
  preSelectStrategy?: StrategyKey | null
  initialStrategy?: StrategyKey | null  // Pre-fill strategy at step 1 without forcing deposit-only mode
}>()

export interface PocketVaultPayload {
  vault_address: string
  vault_chain_id: number
  vault_protocol: string
  vault_symbol: string
  vault_asset: string
}

const emit = defineEmits<{
  create: [payload: { name: string; purpose?: string; strategy_key: StrategyKey; target_amount?: number; timeline?: string; vault: PocketVaultPayload }]
  'create-and-deposit': [payload: {
    name: string
    purpose?: string
    target_amount?: number
    timeline?: string
    strategy_key: StrategyKey
    vault: PocketVaultPayload
    fromChainId: number
    fromToken: `0x${string}`
    fromTokenSymbol: string
    fromTokenDecimals: number
    totalAmount: string
    allocations: Array<{
      vaultAddress: string
      vaultChainId: number
      assetSymbol: string
      protocol: string
      weight: number
      amount: string
      quote?: LifiQuote | null
    }>
  }]
  fetchTokens: []
}>()

const profileStore = useProfileStore()
const vaultCatalog = useVaultCatalog()
const strategyStore = useStrategyStore()

// Vault addresses already used by this user's other pockets (1 vault = 1 pocket)
const usedVaultAddresses = computed(() => {
  return profileStore.pockets
    .map(p => p.vault_address)
    .filter((a): a is string => !!a)
})

// Ensure catalog + user's strategies are loaded when dialog opens
watch(() => open.value, (v) => {
  if (v) {
    vaultCatalog.fetchCatalog()
    if (profileStore.currentUser?.id) strategyStore.fetchMine(profileStore.currentUser.id)
  }
})

// ── Step state ────────────────────────────────────────────────────────────────
const step = ref(1) // 1=name 2=vault 3=deposit 4=progress
const name = ref('')
const purpose = ref('')
const strategyKey = ref<StrategyKey | null>(null)
/** Selected vault for deposit (post-Phase-1: 1 vault per pocket) */
const selectedVault = ref<CatalogVault | null>(null)
/** Step 2 mode: preset (top-APY per strategy) vs custom (browse all vaults) vs my (my strategies) */
const vaultPickMode = ref<'preset' | 'custom' | 'my'>('preset')
/** Currently expanded strategy (when user clicks a multi-vault strategy in "my" mode) */
const expandedStrategyId = ref<string | null>(null)
const depositSkipped = ref(false)

// Target amount (optional) — formatted display with commas
const targetDisplay = ref('')
const targetAmount = computed(() => {
  const num = Number(targetDisplay.value.replace(/,/g, ''))
  return num > 0 ? num : undefined
})
function onTargetInput(v: string) {
  const raw = v.replace(/[^0-9]/g, '')
  if (!raw) { targetDisplay.value = ''; return }
  targetDisplay.value = Number(raw).toLocaleString('en-US')
}

// Timeline (optional) — when user needs the money
const timeline = ref<DateValue | undefined>()
const showDatePicker = ref(false)

const PURPOSE_OPTIONS = ['Emergency Fund', 'Vacation', 'Investment', 'Education', 'Big Purchase']

// ── Allocation display helpers ────────────────────────────────────────────────
const ALLOC_COLORS: Record<string, string> = {
  USDC: '#2775CA', 'USDC.e': '#2775CA', USDbC: '#2775CA',
  cbBTC: '#F7931A', WBTC: '#F7931A', tBTC: '#F7931A',
  WETH: '#627EEA', ETH: '#627EEA', wstETH: '#34D399', weETH: '#8B5CF6',
}
function allocColor(sym: string) { return ALLOC_COLORS[sym] ?? '#6B7280' }

const STRATEGY_META: Record<StrategyKey, { title: string; subtitle: string; riskLabel: string; riskColor: string; popular?: boolean }> = {
  conservative: { title: 'Safe Savings',    subtitle: 'Stable yield on dollars',                          riskLabel: 'Stable',      riskColor: 'text-emerald-400', popular: true },
  balanced:     { title: 'Balanced Growth', subtitle: 'BTC price growth + stablecoin yield',              riskLabel: 'Moderate',    riskColor: 'text-amber-400' },
  aggressive:   { title: 'Max Growth',      subtitle: 'ETH & BTC price growth + yield',  riskLabel: 'Higher risk', riskColor: 'text-violet-400' },
}

function getVaultAllocs(key: StrategyKey) {
  return profileStore.lifiVaultAddresses[key] ?? []
}
function getWeightedApy(key: StrategyKey): string {
  const allocs = getVaultAllocs(key)
  if (allocs.length) {
    const wa = allocs.reduce((s, a) => s + (a.apy ?? 0) * a.weight, 0)
    if (wa > 0 && !isNaN(wa)) return (wa * 100).toFixed(1) + '%'
  }
  const s = profileStore.getStrategyApy(key)
  if (s) {
    const n = parseFloat(s)
    if (!isNaN(n) && n > 0) return n.toFixed(1) + '%'
  }
  return '—'
}
function getProtocols(key: StrategyKey): string {
  const allocs = getVaultAllocs(key)
  if (!allocs.length) return ''
  return [...new Set(allocs.map(a => a.protocol))].join(', ')
}

// ── Deposit state ─────────────────────────────────────────────────────────────
const fromToken = ref<PickedToken | null>(null)
const amount = ref('')
const showPicker = ref(false)

// Strategy allocations (from live vault data)
const strategyAllocs = computed(() =>
  strategyKey.value ? (profileStore.lifiVaultAddresses[strategyKey.value] ?? []) : [],
)

const fromChainId = computed(() => fromToken.value?.chainId ?? 8453)

// Balance lookup
const fromBalance = computed(() => {
  if (!fromToken.value) return null
  if (fromToken.value.balance) return fromToken.value.balance
  const wt = props.walletTokens.find(
    t => t.token?.toLowerCase() === fromToken.value?.address.toLowerCase(),
  )
  return wt ? wt.formattedBal.toString() : null
})

function setMax() {
  if (fromBalance.value) amount.value = fromBalance.value
}

const amountError = computed(() => {
  if (!amount.value || !fromToken.value) return null
  const val = parseFloat(amount.value)
  if (isNaN(val) || val <= 0) return 'Enter a valid amount'
  const bal = parseFloat(fromBalance.value ?? '0')
  if (fromBalance.value && val > bal) return 'Insufficient balance'
  return null
})

const canDeposit = computed(() =>
  !!fromToken.value && !!amount.value && !amountError.value &&
  parseFloat(amount.value) > 0 && !!selectedVault.value,
)

// USD display
const amountUsd = computed(() => {
  if (!amount.value || !fromToken.value?.priceUSD) return null
  const v = parseFloat(amount.value) * fromToken.value.priceUSD
  return v > 0 ? '$' + v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : null
})

// ── LI.FI Quotes ─────────────────────────────────────────────────────────────
const quotes = ref<(LifiQuote | null)[]>([])
const quotesLoading = ref(false)

let quoteTimer: ReturnType<typeof setTimeout> | null = null
watch([amount, fromToken], () => {
  quotes.value = []
  if (quoteTimer) clearTimeout(quoteTimer)
  if (!amount.value || !fromToken.value || !strategyAllocs.value.length || !props.userAddress) return
  if (parseFloat(amount.value) <= 0 || amountError.value) return
  quoteTimer = setTimeout(fetchQuotes, 800)
})

async function fetchQuotes() {
  if (!fromToken.value || !amount.value || !strategyAllocs.value.length || !props.userAddress) return
  quotesLoading.value = true
  const total = parseFloat(amount.value)
  const dec = fromToken.value.decimals

  try {
    const results = await Promise.all(
      strategyAllocs.value.map(async (alloc) => {
        const allocWei = BigInt(Math.floor(total * alloc.weight * 10 ** dec)).toString()
        try {
          return await $fetch<LifiQuote>('/api/lifi/quote', {
            query: {
              fromChain: fromChainId.value,
              toChain: alloc.chainId,
              fromToken: fromToken.value!.address,
              toToken: alloc.address,
              fromAmount: allocWei,
              fromAddress: props.userAddress,
              slippage: 0.005,
              order: 'RECOMMENDED',
            },
          })
        } catch { return null }
      }),
    )
    quotes.value = results
  } finally {
    quotesLoading.value = false
  }
}

const primaryQuote = computed(() => quotes.value.find(q => q !== null) ?? null)

const routeSteps = computed((): any[] => {
  const q = primaryQuote.value
  if (!q) return []
  return (q as any).includedSteps ?? (q as any).steps ?? []
})

// Estimated total output in USD
const estimatedOutputUsd = computed(() => {
  let total = 0
  for (const q of quotes.value) {
    if (!q?.estimate) continue
    const usd = parseFloat((q.estimate as any).toAmountUSD ?? '0')
    if (usd > 0) total += usd
  }
  return total > 0 ? '$' + total.toLocaleString('en-US', { maximumFractionDigits: 2 }) : null
})

const estimatedOutputDisplay = computed(() => {
  if (!quotes.value.length) return null
  const parts: string[] = []
  for (let i = 0; i < quotes.value.length; i++) {
    const q = quotes.value[i]
    if (!q?.estimate?.toAmount) continue
    const alloc = strategyAllocs.value[i]
    const toToken = (q.action as any)?.toToken
    const dec = toToken?.decimals ?? 18
    const sym = toToken?.symbol ?? alloc?.assetSymbol ?? ''
    const amt = (Number(q.estimate.toAmount) / 10 ** dec).toPrecision(4)
    parts.push(`~${amt} ${sym}`)
  }
  return parts.join(' + ') || null
})

const totalFeesUsd = computed(() => {
  let total = 0
  for (const q of quotes.value) {
    if (!q) continue
    for (const gc of q.estimate?.gasCosts ?? []) total += parseFloat(gc.amountUSD ?? '0')
    for (const fc of q.estimate?.feeCosts ?? []) total += parseFloat((fc as any).amountUSD ?? '0')
  }
  return total > 0 ? `~$${total.toFixed(2)}` : null
})

const estTime = computed(() => {
  let max = 0
  for (const q of quotes.value) {
    if (q?.estimate?.executionDuration) max = Math.max(max, q.estimate.executionDuration)
  }
  if (!max) return null
  return max < 60 ? `~${max}s` : `~${Math.ceil(max / 60)}min`
})

const isXChain = computed(() =>
  strategyAllocs.value.some(a => a.chainId !== fromChainId.value),
)

// ── Progress ──────────────────────────────────────────────────────────────────
const isSuccess = computed(() => !props.creating && props.txState === 'confirmed')
const isFailed  = computed(() => !props.creating && props.txState === 'failed')

const progressLabel = computed(() => {
  if (props.creating && !props.txState) return 'Creating your pocket…'
  if (props.txState === 'preparing') return 'Preparing deposit…'
  if (props.txState === 'approving') return 'Approving token…'
  if (props.txState === 'awaiting_signature') return 'Sending to vault…'
  if (props.txState === 'pending') return 'Depositing into vault…'
  if (props.creating) return 'Working on it…'
  return 'Working on it…'
})

// Deposit-only mode: skip pocket creation (existing pocket "Add" button)
const isDepositOnly = computed(() => !!props.preSelectStrategy)

// ── Lifecycle ─────────────────────────────────────────────────────────────────
function resetForm() {
  step.value = 1
  name.value = ''
  purpose.value = ''
  targetDisplay.value = ''
  timeline.value = undefined
  showDatePicker.value = false
  strategyKey.value = null
  selectedVault.value = null
  vaultPickMode.value = 'preset'
  fromToken.value = null
  amount.value = ''
  quotes.value = []
  depositSkipped.value = false
}

watch(open, (v) => {
  if (v) {
    resetForm()
    emit('fetchTokens')
    const hasAny = Object.values(profileStore.lifiVaultAddresses).some((a: any) => a.length > 0)
    if (!hasAny) profileStore.fetchVaultSnapshots()

    // If pre-selecting strategy (from pocket "Add" button), jump to deposit step
    if (props.preSelectStrategy) {
      strategyKey.value = props.preSelectStrategy
      // Find the existing pocket for this strategy and seed selectedVault from it.
      // Without this, handleStartSaving silently returns at the !selectedVault guard
      // and the Start Saving button looks like it does nothing.
      const existing = profileStore.pockets.find(p => p.strategy_key === props.preSelectStrategy)
      if (existing?.vault_address) {
        const fromCatalog = vaultCatalog.findByAddress(existing.vault_address)
        if (fromCatalog) {
          selectedVault.value = fromCatalog
        } else {
          // Catalog not ready yet — build a minimal CatalogVault from DB fields so
          // handleStartSaving has enough to emit the payload.
          selectedVault.value = {
            address: existing.vault_address,
            chainId: existing.vault_chain_id ?? 8453,
            name: existing.vault_symbol ?? '',
            protocol: existing.vault_protocol ?? '',
            vaultSymbol: existing.vault_symbol ?? '',
            apy: 0,
            tvl: 0,
            assetSymbol: '',
            assetAddress: existing.vault_asset ?? '',
            strategyKey: props.preSelectStrategy,
          }
        }
      }
      step.value = 3
    } else if (props.initialStrategy) {
      // Explorer card: pre-fill strategy but keep normal flow
      strategyKey.value = props.initialStrategy
    }
  }
})

watch(isSuccess, (v) => { if (v) setTimeout(() => { open.value = false }, 2400) })

// ── Actions ───────────────────────────────────────────────────────────────────
function handleTokenSelected(t: PickedToken) {
  fromToken.value = t
  quotes.value = []
}

/**
 * Pick a vault from a user-saved strategy. If the strategy has exactly 1
 * allocation, select it directly. If multiple, expand the card and let user
 * pick which specific vault (required because 1 pocket = 1 vault strict).
 */
function handleStrategyPick(strategy: StrategyWithAllocations) {
  if (strategy.allocations.length === 1) {
    const alloc = strategy.allocations[0]!
    const vault = vaultCatalog.findByAddress(alloc.vault_address)
    if (vault) {
      selectedVault.value = vault
      strategyKey.value = vault.strategyKey
      expandedStrategyId.value = null
    } else {
      // Vault not in catalog (maybe non-Composer or removed) — show inline warning
      expandedStrategyId.value = strategy.id
    }
  } else {
    // Multi-vault strategy — expand to let user pick which vault to use
    expandedStrategyId.value = expandedStrategyId.value === strategy.id ? null : strategy.id
  }
}

/** Pick a specific vault from an expanded multi-vault strategy */
function handleStrategyVaultPick(vaultAddress: string) {
  const vault = vaultCatalog.findByAddress(vaultAddress)
  if (vault) {
    selectedVault.value = vault
    strategyKey.value = vault.strategyKey
    expandedStrategyId.value = null
  }
}

function buildVaultPayload(): PocketVaultPayload | null {
  if (!selectedVault.value) return null
  const v = selectedVault.value
  return {
    vault_address: v.address,
    vault_chain_id: v.chainId,
    vault_protocol: v.protocol,
    vault_symbol: v.vaultSymbol,
    vault_asset: v.assetAddress,
  }
}

function handleStartSaving() {
  if (!strategyKey.value) { toast.error('Pick a strategy first'); return }
  if (!fromToken.value) { toast.error('Select a token to deposit from'); return }
  if (!selectedVault.value) { toast.error('No vault selected for this pocket'); return }
  if (!canDeposit.value) { toast.error(ctaLabel.value || 'Cannot deposit right now'); return }

  const addr = (fromToken.value.address === '0x0000000000000000000000000000000000000000'
    ? '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
    : fromToken.value.address) as `0x${string}`

  const total = parseFloat(amount.value)
  step.value = 4
  const vaultPayload = buildVaultPayload()!

  const payload = {
    name: name.value.trim() || `Pocket ${new Date().toLocaleDateString()}`,
    purpose: purpose.value || undefined,
    target_amount: targetAmount.value,
    timeline: timeline.value ? timeline.value.toString() : undefined,
    strategy_key: strategyKey.value,
    vault: vaultPayload,
    fromChainId: fromChainId.value,
    fromToken: addr,
    fromTokenSymbol: fromToken.value.symbol,
    fromTokenDecimals: fromToken.value.decimals,
    totalAmount: amount.value,
    // Single allocation now — 1 pocket = 1 vault
    allocations: [{
      vaultAddress: selectedVault.value.address,
      vaultChainId: selectedVault.value.chainId,
      assetSymbol: selectedVault.value.assetSymbol,
      protocol: selectedVault.value.protocol,
      weight: 1,
      amount: total.toString(),
      quote: quotes.value[0] ?? null,
    }],
  }

  emit('create-and-deposit', payload)
}

function handleCreateEmpty() {
  if (!strategyKey.value || !selectedVault.value) return
  depositSkipped.value = true
  step.value = 4
  emit('create', {
    name: name.value.trim(),
    purpose: purpose.value || undefined,
    target_amount: targetAmount.value,
    timeline: timeline.value ? timeline.value.toString() : undefined,
    strategy_key: strategyKey.value,
    vault: buildVaultPayload()!,
  })
}

// CTA label
const ctaLabel = computed(() => {
  if (!fromToken.value) return 'Select a token'
  if (!amount.value || parseFloat(amount.value) <= 0) return 'Enter amount'
  if (amountError.value) return amountError.value
  return 'Get Started'
})
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-md p-0 gap-0 max-h-dvh sm:max-h-[90dvh] overflow-y-auto h-dvh sm:h-auto sm:rounded-2xl rounded-none top-auto bottom-0 sm:top-1/2 sm:bottom-auto translate-y-0 sm:-translate-y-1/2">

      <!-- Mobile drag handle (visual cue for bottom sheet) -->
      <div class="sm:hidden flex justify-center pt-2 pb-1">
        <div class="w-10 h-1 rounded-full bg-muted-foreground/30" />
      </div>

      <!-- ── Header ── -->
      <div class="px-5 pt-5 pb-4 border-b border-border/40">
        <DialogHeader>
          <DialogTitle class="text-base">
            <template v-if="isDepositOnly && step === 3">Deposit</template>
            <template v-else-if="isDepositOnly && step === 4">
              <span v-if="isSuccess">All set!</span>
              <span v-else-if="isFailed">Something went wrong</span>
              <span v-else>Depositing…</span>
            </template>
            <template v-else-if="step === 1">New pocket</template>
            <template v-else-if="step === 2">Choose a strategy</template>
            <template v-else-if="step === 3">Deposit</template>
            <template v-else>
              <span v-if="isSuccess">All set!</span>
              <span v-else-if="isFailed">Something went wrong</span>
              <span v-else>Setting up…</span>
            </template>
          </DialogTitle>
        </DialogHeader>
        <div v-if="step < 4 && !isDepositOnly" class="flex items-center gap-1 mt-3">
          <div
            v-for="s in 3" :key="s"
            class="h-1 rounded-full transition-all"
            :class="[s <= step ? 'bg-primary' : 'bg-muted', s === step ? 'flex-2' : 'flex-1']"
          />
        </div>
      </div>

      <!-- ── Step 1: Name ── -->
      <div v-if="step === 1" class="px-5 py-5 space-y-5">
        <div>
          <label class="text-sm font-medium mb-2 block">What are you saving for?</label>
          <Input
            v-model="name"
            placeholder="e.g. Europe Trip, Emergency Fund"
            class="h-12 text-base"
            @keydown.enter="name.trim() && step++"
          />
        </div>
        <div>
          <p class="text-xs text-muted-foreground mb-2">Category (optional)</p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="opt in PURPOSE_OPTIONS" :key="opt"
              class="px-3 py-1.5 text-xs rounded-full border transition-all"
              :class="purpose === opt
                ? 'border-primary bg-primary/10 text-primary font-medium'
                : 'border-border hover:border-primary/40 text-muted-foreground'"
              @click="purpose = purpose === opt ? '' : opt"
            >{{ opt }}</button>
          </div>
        </div>

        <!-- Target amount (optional) -->
        <div>
          <label class="text-sm font-medium mb-1.5 block">Target amount (optional)</label>
          <div class="relative">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-base font-medium">$</span>
            <Input
              :model-value="targetDisplay"
              type="text"
              inputmode="numeric"
              placeholder="1,000"
              class="h-12 pl-8 text-base"
              @update:model-value="(v: any) => onTargetInput(String(v))"
            />
          </div>
          <p class="text-[11px] text-muted-foreground mt-1">Set a goal to track your progress.</p>
        </div>

        <!-- Timeline (optional) -->
        <div>
          <label class="text-sm font-medium mb-1.5 block">Timeline (optional)</label>
          <Popover v-model:open="showDatePicker">
            <PopoverTrigger as-child>
              <Button
                variant="outline"
                class="w-full h-12 justify-start text-left font-normal"
                :class="{ 'text-muted-foreground': !timeline }"
              >
                <Icon name="lucide:calendar" class="w-4 h-4 mr-2" />
                <template v-if="timeline">{{ timeline.toString() }}</template>
                <template v-else>Pick a date</template>
              </Button>
            </PopoverTrigger>
            <PopoverContent class="w-auto p-0" align="start">
              <Calendar
                v-model="timeline"
                :min-value="today(getLocalTimeZone())"
                initial-focus
                @update:model-value="showDatePicker = false"
              />
            </PopoverContent>
          </Popover>
          <p class="text-[11px] text-muted-foreground mt-1">When do you need this money?</p>
        </div>

        <Button class="w-full h-11" :disabled="!name.trim()" @click="step++">
          Continue <Icon name="lucide:arrow-right" class="w-4 h-4 ml-1.5" />
        </Button>
      </div>

      <!-- ── Step 2: Pick a vault (1 pocket = 1 vault) ── -->
      <div v-else-if="step === 2" class="px-5 py-5">
        <p class="text-xs text-muted-foreground mb-4">Where should your money earn?</p>

        <!-- Mode toggle (3 modes) -->
        <div class="flex gap-1 bg-muted/40 rounded-lg p-0.5 mb-3">
          <button
            class="flex-1 text-xs font-semibold py-2 rounded-md transition-colors"
            :class="vaultPickMode === 'preset' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'"
            @click="vaultPickMode = 'preset'"
          >Quick pick</button>
          <button
            class="flex-1 text-xs font-semibold py-2 rounded-md transition-colors"
            :class="vaultPickMode === 'my' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'"
            @click="vaultPickMode = 'my'"
          >My strategies</button>
          <button
            class="flex-1 text-xs font-semibold py-2 rounded-md transition-colors"
            :class="vaultPickMode === 'custom' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'"
            @click="vaultPickMode = 'custom'"
          >All vaults</button>
        </div>

        <!-- Explore/create strategy CTAs -->
        <div class="flex gap-2 mb-4">
          <Button
            variant="outline"
            size="sm"
            class="flex-1 h-8 text-[11px]"
            @click="open = false; navigateTo('/strategy')"
          >
            <Icon name="lucide:compass" class="w-3 h-3 mr-1.5" />
            Explore strategies
          </Button>
          <Button
            variant="outline"
            size="sm"
            class="flex-1 h-8 text-[11px]"
            @click="open = false; navigateTo('/strategy/create')"
          >
            <Icon name="lucide:plus" class="w-3 h-3 mr-1.5" />
            Create your own
          </Button>
        </div>

        <!-- Preset mode: top-APY vault per strategy -->
        <div v-if="vaultPickMode === 'preset'" class="space-y-2.5">
          <button
            v-for="s in STRATEGY_LIST" :key="s.key"
            class="w-full rounded-xl border-2 p-4 text-left transition-all relative disabled:opacity-40 disabled:cursor-not-allowed"
            :class="selectedVault?.strategyKey === s.key ? 'border-primary bg-primary/5' : 'border-border hover:border-border/80'"
            :disabled="!vaultCatalog.topForStrategy(s.key) || usedVaultAddresses.includes(vaultCatalog.topForStrategy(s.key)!.address)"
            @click="() => { const top = vaultCatalog.topForStrategy(s.key); if (top) { selectedVault = top; strategyKey = s.key; } }"
          >
            <span
              v-if="STRATEGY_META[s.key].popular"
              class="absolute top-3 right-3 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/15 text-primary"
            >Most Popular</span>

            <div class="flex items-start gap-3">
              <div class="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center shrink-0 mt-0.5">
                <Icon :name="s.icon" class="w-4.5 h-4.5" :class="STRATEGY_META[s.key].riskColor" />
              </div>
              <div class="flex-1 min-w-0 pr-12">
                <div class="flex items-baseline gap-2 flex-wrap">
                  <p class="font-semibold text-sm">{{ STRATEGY_META[s.key].title }}</p>
                  <span class="text-xs" :class="STRATEGY_META[s.key].riskColor">{{ STRATEGY_META[s.key].riskLabel }}</span>
                </div>
                <div class="flex items-center gap-1.5 mt-1.5">
                  <span class="w-2 h-2 rounded-full shrink-0" :style="{ backgroundColor: s.assetColor }" />
                  <span class="text-xs text-muted-foreground">{{ s.assetLabel }} · {{ s.assetSymbol }}</span>
                </div>
                <div class="mt-2">
                  <template v-if="vaultCatalog.topForStrategy(s.key)">
                    <div class="flex items-baseline gap-2">
                      <span class="text-base font-bold text-primary">
                        {{ (vaultCatalog.topForStrategy(s.key)!.apy * 100).toFixed(2) }}%
                      </span>
                      <span class="text-xs text-muted-foreground">APY</span>
                    </div>
                    <p class="text-[11px] text-muted-foreground/60 mt-1">
                      {{ vaultCatalog.topForStrategy(s.key)!.vaultSymbol }} · {{ vaultCatalog.topForStrategy(s.key)!.protocol }}
                    </p>
                  </template>
                  <span v-else class="text-xs text-muted-foreground/50">No vault available</span>
                </div>
              </div>
              <div v-if="selectedVault?.strategyKey === s.key" class="absolute top-4 right-4 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                <Icon name="lucide:check" class="w-3 h-3 text-primary-foreground" />
              </div>
            </div>
          </button>
        </div>

        <!-- My strategies mode: user's copied + created strategies -->
        <div v-else-if="vaultPickMode === 'my'" class="space-y-2">
          <!-- Loading skeleton -->
          <div v-if="strategyStore.loading && !strategyStore.myStrategies.length" class="space-y-2">
            <div
              v-for="i in 3" :key="i"
              class="rounded-xl border border-border/60 bg-muted/20 p-3 flex items-center gap-3"
            >
              <Skeleton class="w-9 h-9 rounded-lg" />
              <div class="flex-1 space-y-1.5">
                <Skeleton class="h-4 w-28" />
                <Skeleton class="h-3 w-20" />
              </div>
            </div>
          </div>

          <!-- Empty state -->
          <div v-else-if="!strategyStore.myStrategies.length" class="rounded-xl border border-dashed border-border/60 p-6 text-center">
            <Icon name="lucide:layers" class="w-7 h-7 text-muted-foreground/40 mb-2 mx-auto" />
            <p class="text-xs text-muted-foreground mb-3">No saved strategies yet</p>
            <div class="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                class="flex-1 h-8 text-[11px]"
                @click="open = false; navigateTo('/strategy')"
              >
                <Icon name="lucide:compass" class="w-3 h-3 mr-1.5" /> Browse
              </Button>
              <Button
                size="sm"
                class="flex-1 h-8 text-[11px]"
                @click="open = false; navigateTo('/strategy/create')"
              >
                <Icon name="lucide:plus" class="w-3 h-3 mr-1.5" /> Create
              </Button>
            </div>
          </div>

          <!-- My strategies list -->
          <template v-else>
            <button
              v-for="s in strategyStore.myStrategies" :key="s.id"
              type="button"
              class="w-full text-left rounded-xl border-2 p-3 transition-all"
              :class="expandedStrategyId === s.id
                ? 'border-primary bg-primary/5'
                : selectedVault && s.allocations.some(a => a.vault_address.toLowerCase() === selectedVault?.address.toLowerCase())
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-border/80 bg-muted/20'"
              @click="handleStrategyPick(s)"
            >
              <div class="flex items-center gap-3">
                <div
                  class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  :style="{ backgroundColor: (s.cover_color ?? '#86B238') + '20' }"
                >
                  <Icon :name="s.icon ?? 'lucide:layers'" class="w-4 h-4" :style="{ color: s.cover_color ?? '#86B238' }" />
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-bold truncate">{{ s.name }}</p>
                  <p class="text-[11px] text-muted-foreground/70">
                    {{ s.allocations.length }} vault{{ s.allocations.length !== 1 ? 's' : '' }}
                    <template v-if="s.is_system"> · System</template>
                    <template v-else-if="s.forked_from_id"> · Copied</template>
                    <template v-else> · Custom</template>
                  </p>
                </div>
                <Icon
                  v-if="s.allocations.length > 1"
                  name="lucide:chevron-down"
                  class="w-4 h-4 text-muted-foreground/60 transition-transform"
                  :class="{ 'rotate-180': expandedStrategyId === s.id }"
                />
              </div>

              <!-- Expanded sub-picker (for multi-vault strategies) -->
              <div
                v-if="expandedStrategyId === s.id && s.allocations.length > 1"
                class="mt-3 pt-3 border-t border-border/30 space-y-1.5"
                @click.stop
              >
                <p class="text-[10px] text-muted-foreground/70 uppercase tracking-wider mb-1">
                  Pick which vault to use (1 pocket = 1 vault)
                </p>
                <button
                  v-for="alloc in s.allocations" :key="alloc.id"
                  type="button"
                  class="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border transition-colors"
                  :class="selectedVault?.address.toLowerCase() === alloc.vault_address.toLowerCase()
                    ? 'border-primary bg-primary/10'
                    : usedVaultAddresses.map(a => a.toLowerCase()).includes(alloc.vault_address.toLowerCase())
                      ? 'border-border/30 bg-muted/20 opacity-50 cursor-not-allowed'
                      : 'border-border/60 hover:border-primary/40'"
                  :disabled="usedVaultAddresses.map(a => a.toLowerCase()).includes(alloc.vault_address.toLowerCase())"
                  @click="handleStrategyVaultPick(alloc.vault_address)"
                >
                  <div class="flex-1 min-w-0 text-left">
                    <p class="text-xs font-semibold truncate">{{ alloc.vault_symbol ?? alloc.asset_symbol }}</p>
                    <p class="text-[10px] text-muted-foreground/70 truncate">
                      {{ alloc.protocol ?? 'Unknown' }} · {{ (alloc.weight * 100).toFixed(0) }}% of strategy
                    </p>
                  </div>
                  <span
                    v-if="usedVaultAddresses.map(a => a.toLowerCase()).includes(alloc.vault_address.toLowerCase())"
                    class="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0"
                  >In use</span>
                </button>
              </div>
            </button>
          </template>
        </div>

        <!-- Custom mode: full vault picker -->
        <AppVaultPicker
          v-else
          v-model="selectedVault"
          :disabled-addresses="usedVaultAddresses"
          @update:model-value="(v) => { if (v) strategyKey = v.strategyKey }"
        />

        <div class="flex gap-3 mt-5">
          <Button variant="outline" class="h-11 px-4" @click="step--">
            <Icon name="lucide:arrow-left" class="w-4 h-4" />
          </Button>
          <Button class="flex-1 h-11" :disabled="!selectedVault" @click="step++">
            Continue <Icon name="lucide:arrow-right" class="w-4 h-4 ml-1.5" />
          </Button>
        </div>
      </div>

      <!-- ── Step 3: Fund your pocket ── -->
      <div v-else-if="step === 3" class="px-5 py-5 space-y-3">

        <!-- FROM: token + amount -->
        <div class="rounded-2xl bg-muted/40 border border-border/40 p-4">
          <div class="flex items-center justify-between mb-2">
            <p class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">You deposit</p>
            <span v-if="fromBalance" class="text-[11px] text-muted-foreground">
              Bal: {{ parseFloat(fromBalance).toLocaleString('en-US', { maximumFractionDigits: 4 }) }}
              <button class="text-primary font-semibold ml-1" @click="setMax">MAX</button>
            </span>
          </div>

          <div class="flex items-end gap-3">
            <div class="flex-1 min-w-0">
              <input
                v-model="amount"
                type="number"
                inputmode="decimal"
                placeholder="0"
                class="w-full bg-transparent text-3xl font-bold outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
              <p class="text-xs text-muted-foreground/60 mt-0.5">{{ amountUsd ?? '$0.00' }}</p>
            </div>

            <button
              class="flex items-center gap-2 rounded-xl px-3 py-2 border transition-colors shrink-0"
              :class="fromToken
                ? 'bg-background/60 border-border/60 hover:border-primary/40'
                : 'bg-primary/10 border-primary/30 hover:bg-primary/15'"
              @click="showPicker = true"
            >
              <template v-if="fromToken">
                <div class="relative shrink-0">
                  <img
                    v-if="fromToken.logoURI"
                    :src="fromToken.logoURI"
                    :alt="fromToken.symbol"
                    class="w-6 h-6 rounded-full"
                    @error="($event.target as HTMLImageElement).style.display='none'"
                  />
                  <img
                    v-if="fromToken.chainLogoURI"
                    :src="fromToken.chainLogoURI"
                    class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border border-background bg-background"
                    @error="($event.target as HTMLImageElement).style.display='none'"
                  />
                </div>
                <span class="font-bold text-sm">{{ fromToken.symbol }}</span>
              </template>
              <template v-else>
                <Icon name="lucide:coins" class="w-4 h-4 text-primary" />
                <span class="font-semibold text-sm text-primary">Select token</span>
              </template>
              <Icon name="lucide:chevron-down" class="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
          <p v-if="amountError" class="text-xs text-destructive mt-1.5">{{ amountError }}</p>
        </div>

        <!-- Arrow -->
        <div class="flex justify-center -my-1 relative z-10">
          <div class="w-8 h-8 rounded-lg border-2 border-border bg-background flex items-center justify-center">
            <Icon name="lucide:arrow-down" class="w-3.5 h-3.5 text-muted-foreground" />
          </div>
        </div>

        <!-- INTO: vault allocation -->
        <div class="rounded-2xl bg-muted/40 border border-border/40 p-4">
          <div class="flex items-center justify-between mb-3">
            <p class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Earning in</p>
            <span v-if="strategyKey" class="text-xs font-bold text-primary">
              {{ getWeightedApy(strategyKey) }} APY
            </span>
          </div>

          <template v-if="strategyKey && strategyAllocs.length">
            <div class="space-y-2">
              <div
                v-for="(alloc, i) in strategyAllocs"
                :key="alloc.assetSymbol"
                class="flex items-center gap-2 rounded-lg bg-background/40 px-3 py-2"
              >
                <span class="w-2 h-2 rounded-full shrink-0" :style="{ backgroundColor: allocColor(alloc.assetSymbol) }" />
                <span class="text-xs font-bold w-10 shrink-0">{{ Math.round(alloc.weight * 100) }}%</span>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-semibold leading-tight truncate">{{ alloc.vaultSymbol || alloc.assetSymbol }}</p>
                  <p class="text-[10px] text-muted-foreground/50 leading-tight">{{ alloc.protocol }}</p>
                </div>
                <span class="text-sm font-bold text-primary shrink-0">
                  {{ alloc.apy > 0 ? (alloc.apy * 100).toFixed(1) + '%' : '—' }}
                </span>
                <Icon
                  v-if="quotesLoading"
                  name="lucide:loader-2"
                  class="w-3 h-3 animate-spin text-muted-foreground/40 shrink-0"
                />
                <Icon
                  v-else-if="quotes[i]"
                  name="lucide:check-circle-2"
                  class="w-3 h-3 text-primary/50 shrink-0"
                />
              </div>
            </div>

          </template>

          <button
            v-else
            class="w-full flex items-center gap-2 text-sm text-muted-foreground py-2"
            @click="step--"
          >
            <Icon name="lucide:arrow-left" class="w-4 h-4" /> Go back to pick a strategy
          </button>
        </div>

        <!-- Detailed transaction preview (route + fees + time) -->
        <AppTxPreview
          v-if="strategyKey && fromToken && amount && (quotesLoading || primaryQuote)"
          :quote="primaryQuote"
          :loading="quotesLoading"
          title="Deposit Preview"
          :subtitle="`${fromToken?.symbol ?? ''} → ${STRATEGIES[strategyKey].assetSymbol} vault`"
        />

        <!-- CTA -->
        <Button
          class="w-full h-12 text-sm font-bold uppercase tracking-wider rounded-2xl"
          :disabled="!canDeposit"
          @click="handleStartSaving"
        >
          {{ canDeposit ? 'Start Saving' : ctaLabel }}
        </Button>
        <button
          v-if="!isDepositOnly"
          class="w-full text-[11px] text-muted-foreground/40 hover:text-muted-foreground py-1 transition-colors text-center"
          @click="handleCreateEmpty"
        >
          Skip — create without depositing
        </button>
      </div>

      <!-- ── Step 4: Progress / Result ── -->
      <div v-else class="px-6 py-10 flex flex-col items-center text-center">

        <template v-if="isSuccess">
          <div class="w-16 h-16 rounded-full bg-primary/15 flex items-center justify-center mb-4">
            <Icon name="lucide:check" class="w-8 h-8 text-primary" />
          </div>
          <h3 class="text-lg font-bold mb-1">
            <template v-if="depositSkipped">Pocket ready!</template>
            <template v-else>You're earning now</template>
          </h3>
          <p class="text-sm text-muted-foreground max-w-xs">
            <template v-if="depositSkipped">Your pocket is set up. Add funds whenever you're ready.</template>
            <template v-else>Your savings are live in <span class="text-foreground font-medium">{{ strategyKey ? STRATEGY_META[strategyKey].title : '' }}</span>.</template>
          </p>
          <p class="text-xs text-muted-foreground/40 mt-5">Closing automatically…</p>
        </template>

        <template v-else-if="isFailed">
          <div class="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <Icon name="lucide:x" class="w-7 h-7 text-destructive" />
          </div>
          <h3 class="text-base font-bold mb-2">Transaction failed</h3>
          <p class="text-xs text-muted-foreground mb-5 max-w-xs">{{ txError || 'Something went wrong. Please try again.' }}</p>
          <Button variant="outline" size="sm" @click="step = depositSkipped ? 2 : 3">
            <Icon name="lucide:rotate-ccw" class="w-3.5 h-3.5 mr-1.5" /> Try again
          </Button>
        </template>

        <template v-else>
          <div class="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-5">
            <Icon name="lucide:loader-2" class="w-8 h-8 text-primary animate-spin" />
          </div>
          <h3 class="text-base font-semibold mb-1">{{ progressLabel }}</h3>
          <p class="text-xs text-muted-foreground max-w-xs mb-6">Sit back — no approvals or confirmations needed.</p>

          <div class="space-y-3 w-full max-w-xs text-left">
            <div v-if="!isDepositOnly" class="flex items-center gap-2.5 text-xs">
              <Icon
                :name="!creating ? 'lucide:check-circle-2' : 'lucide:loader-2'"
                class="w-4 h-4 shrink-0"
                :class="!creating ? 'text-primary' : 'text-muted-foreground animate-spin'"
              />
              <span :class="!creating ? 'text-foreground' : 'text-muted-foreground'">Pocket created</span>
            </div>
            <template v-if="!depositSkipped">
              <div
                v-for="alloc in strategyAllocs"
                :key="alloc.assetSymbol"
                class="flex items-center gap-2.5 text-xs"
              >
                <Icon
                  :name="txState === 'confirmed' ? 'lucide:check-circle-2' : ['approving','awaiting_signature','pending'].includes(txState ?? '') ? 'lucide:loader-2' : 'lucide:circle'"
                  class="w-4 h-4 shrink-0"
                  :class="txState === 'confirmed' ? 'text-primary' : ['approving','awaiting_signature','pending'].includes(txState ?? '') ? 'text-primary animate-spin' : 'text-muted-foreground'"
                />
                <span :class="['approving','awaiting_signature','pending','confirmed'].includes(txState ?? '') ? 'text-foreground' : 'text-muted-foreground'">
                  {{ Math.round(alloc.weight * 100) }}% → {{ alloc.assetSymbol }} vault
                </span>
              </div>
            </template>
          </div>
        </template>

      </div>

    </DialogContent>
  </Dialog>

  <!-- Token / Chain picker (shown on top) -->
  <AppTokenChainPicker
    v-model:open="showPicker"
    :wallet-tokens="walletTokens"
    :user-address="userAddress"
    @select="handleTokenSelected"
  />
</template>
