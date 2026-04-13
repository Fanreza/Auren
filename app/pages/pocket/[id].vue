<script setup lang="ts">
import { formatUnits, parseUnits } from 'viem'
import { toPng } from 'html-to-image'
import { BRAND } from '~/config/brand'
import { STRATEGIES, type StrategyKey } from '~/config/strategies'
import { usePrivyAuth } from '~/composables/usePrivy'
import { storeToRefs } from 'pinia'
import { useProfileStore } from '~/stores/useProfileStore'
import type { LifiAllocData } from '~/stores/useProfileStore'
import { useVaultCatalog } from '~/composables/useVaultCatalog'
import { useVault } from '~/composables/useVault'
import { useCoinGecko } from '~/composables/useCoinGecko'
import { useWalletTokens } from '~/composables/useWalletTokens'
import { useTransactionRecorder } from '~/composables/useTransactionRecorder'
import { computeNextDue } from '~/composables/useDepositReminders'
import { computePocketHealth } from '~/composables/useVaultHealth'
import { toast } from 'vue-sonner'
import type { DbPocket } from '~/types/database'

const route = useRoute()
const pocketId = route.params.id as string

const { isConnected, isReady, address } = usePrivyAuth()
const profileStore = useProfileStore()
const vaultCatalog = useVaultCatalog()
const { pockets, pocketPositions, loadingPositions } = storeToRefs(profileStore)
const { getTransactions } = useUserData()

onMounted(() => {
  vaultCatalog.fetchCatalog()
  vaultCatalog.fetchOpenCatalog()
})

// ---- Vault + wallet tokens (for deposit dialog) ----
const { txState, txHash, txError, lifiDeposit, reset } = useVault()
const { getTokenPrices } = useCoinGecko()
const { walletTokens, loadingTokens, fetchWalletTokens } = useWalletTokens(
  address, null, getTokenPrices,
)

// Refetch pocket position + wallet tokens on demand
async function refetchAll() {
  await fetchWalletTokens()
  if (address.value) await profileStore.fetchAllPositions(address.value)
  await profileStore.refreshPockets()
}

watch(address, (a) => { if (a) fetchWalletTokens() }, { immediate: true })

// ---- Pocket ----
const pocket = computed(() => pockets.value.find(p => p.id === pocketId) ?? null)
const strategy = computed(() =>
  pocket.value ? STRATEGIES[pocket.value.strategy_key as StrategyKey] : null,
)

const STRATEGY_LABELS: Record<string, string> = {
  conservative: 'Savings',
  balanced: 'Growth',
  aggressive: 'High Growth',
}

const RISK_META: Record<string, { label: string; color: string; bg: string }> = {
  conservative: { label: 'Low risk', color: 'text-emerald-500', bg: 'bg-emerald-500' },
  balanced: { label: 'Medium risk', color: 'text-blue-500', bg: 'bg-blue-500' },
  aggressive: { label: 'High risk', color: 'text-violet-500', bg: 'bg-violet-500' },
}


// ---- Position + price ----
const position = computed(() =>
  pocketPositions.value[pocketId] ?? { shares: 0n, value: 0n },
)
const assetPrice = computed(() =>
  pocket.value ? profileStore.getAssetPrice(pocket.value.strategy_key) : 0,
)
const assetValue = computed(() => {
  if (position.value.value === 0n || !strategy.value) return 0
  return parseFloat(formatUnits(position.value.value, strategy.value.decimals))
})
const usdValue = computed(() => assetValue.value * assetPrice.value)

// ---- Vault allocations ----
// Phase 4: prefer pocket_allocations (joined from DB). Each pocket can have
// N vaults with explicit weights. Fall back to the Phase 1 single-vault
// cache column, then to the legacy strategy-level snapshot.
const allocations = computed<LifiAllocData[]>(() => {
  if (!pocket.value) return []
  if (pocket.value.allocations?.length) {
    return pocket.value.allocations.map((a) => {
      const catalogMatch = vaultCatalog.findByAddress(a.vault_address)
      return {
        address: a.vault_address,
        chainId: a.vault_chain_id ?? 8453,
        assetSymbol: a.asset_symbol ?? catalogMatch?.assetSymbol ?? '',
        vaultSymbol: a.vault_symbol ?? catalogMatch?.name ?? '',
        protocol: a.protocol ?? catalogMatch?.protocol ?? '',
        weight: a.weight,
        apy: catalogMatch?.apy ?? 0,
        tvl: catalogMatch?.tvl ?? 0,
      }
    })
  }
  if (pocket.value.vault_address) {
    const catalogMatch = vaultCatalog.findByAddress(pocket.value.vault_address)
    return [{
      address: pocket.value.vault_address,
      chainId: pocket.value.vault_chain_id ?? 8453,
      assetSymbol: pocket.value.vault_asset ?? catalogMatch?.assetSymbol ?? '',
      vaultSymbol: pocket.value.vault_symbol ?? catalogMatch?.name ?? '',
      protocol: pocket.value.vault_protocol ?? catalogMatch?.protocol ?? '',
      weight: 1,
      apy: catalogMatch?.apy ?? 0,
      tvl: catalogMatch?.tvl ?? 0,
    }]
  }
  return profileStore.lifiVaultAddresses[pocket.value.strategy_key] ?? []
})


const apyFormatted = computed(() => {
  if (!pocket.value) return null
  const val = profileStore.getStrategyApy(pocket.value.strategy_key)
  if (!val) return null
  const num = parseFloat(val)
  return isNaN(num) ? null : num.toFixed(2) + '%'
})

const tvlTotal = computed(() =>
  allocations.value.reduce((sum, a) => sum + a.tvl, 0),
)

// ---- Transaction history ----
interface HistoryEntry {
  type: 'deposit' | 'withdraw' | 'redeem' | 'switch'
  timestamp: number
  amount: string
  assetSymbol: string
  txHash: string
}
const history = ref<HistoryEntry[]>([])
const loadingHistory = ref(false)
const exportingPDF = ref(false)

async function fetchHistory() {
  if (!pocketId) return
  loadingHistory.value = true
  try {
    const txs = await getTransactions(pocketId)
    history.value = txs.map(tx => ({
      type: tx.type,
      timestamp: tx.timestamp,
      amount: tx.amount,
      assetSymbol: tx.asset_symbol,
      txHash: tx.tx_hash,
    }))
  } catch (e) {
    console.error('[pocket] history fetch failed:', e)
    history.value = []
  } finally {
    loadingHistory.value = false
  }
}

// ---- Earnings ----
// Tx amounts are stored as USD decimal (see useDashboardStats convention).
// Principal = net contributed = deposits − (withdraws + redeems). A `switch`
// transaction is a zero-sum vault migration (redeem → re-deposit into the same
// pocket) and must not touch principal.
const principal = computed(() => {
  let total = 0
  for (const tx of history.value) {
    const amt = parseFloat(tx.amount)
    if (isNaN(amt)) continue
    if (tx.type === 'deposit') total += amt
    else if (tx.type === 'withdraw' || tx.type === 'redeem') total -= amt
    // tx.type === 'switch' → no-op, net zero
  }
  return Math.max(total, 0)
})

// Yield in USD = current pocket value − net contributed
const yieldEarnedUsd = computed(() => {
  if (usdValue.value <= 0 || principal.value <= 0) return 0
  return usdValue.value - principal.value
})

// Backwards-compat alias for hero card / share card
const yieldEarned = yieldEarnedUsd

const profitFormatted = computed(() => {
  const profit = yieldEarnedUsd.value
  if (Math.abs(profit) < 0.01) return null
  const abs = Math.abs(profit).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (profit >= 0 ? '+$' : '-$') + abs
})
const profitPositive = computed(() => yieldEarnedUsd.value >= 0)

// ---- Chart series (transactions normalized for chart components) ----
const chartTransactions = computed(() => {
  return history.value.map(tx => ({
    timestamp: tx.timestamp < 10_000_000_000 ? tx.timestamp * 1000 : tx.timestamp,
    type: tx.type,
    usdValue: parseFloat(tx.amount) || 0,
  }))
})

// Live APY decimal (e.g. 0.047)
const apyDecimal = computed(() => {
  if (!pocket.value) return 0
  const v = profileStore.getStrategyApy(pocket.value.strategy_key)
  if (!v) return 0
  const n = parseFloat(v)
  return isNaN(n) ? 0 : n / 100
})

const apyDetailsForPocket = computed(() => {
  if (!pocket.value) return null
  return profileStore.getStrategyApyDetails(pocket.value.strategy_key)
})

// All strategies APY for what-if comparison
const allStrategyApys = computed<Record<string, number>>(() => {
  const out: Record<string, number> = {}
  for (const k of Object.keys(STRATEGIES)) {
    const v = profileStore.getStrategyApy(k)
    out[k] = v ? (parseFloat(v) || 0) / 100 : 0
  }
  return out
})

const pocketHealth = computed(() => computePocketHealth(allocations.value))

const daysActiveForWhatIf = computed(() => {
  if (!pocket.value?.created_at) return 0
  const created = new Date(pocket.value.created_at).getTime()
  return Math.max(1, Math.floor((Date.now() - created) / (1000 * 60 * 60 * 24)))
})

// ---- Goal progress ----
const progressRaw = computed(() => {
  if (!pocket.value?.target_amount || pocket.value.target_amount === 0 || usdValue.value === 0) return 0
  return Math.min((usdValue.value / pocket.value.target_amount) * 100, 100)
})

const timelineDisplay = computed(() => {
  if (!pocket.value?.timeline) return null
  const target = new Date(pocket.value.timeline)
  const diffDays = Math.ceil((target.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  const dateStr = target.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  if (diffDays < 0) return { date: dateStr, remaining: 'Past due', overdue: true }
  if (diffDays === 0) return { date: dateStr, remaining: 'Today', overdue: false }
  return { date: dateStr, remaining: `${diffDays} days left`, overdue: false }
})

// ---- Helpers ----
function displayUsd(value: number): string {
  if (value === 0) return '$0.00'
  return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatTvl(value: number): string {
  if (value >= 1_000_000_000) return '$' + (value / 1_000_000_000).toFixed(1) + 'B'
  if (value >= 1_000_000) return '$' + (value / 1_000_000).toFixed(1) + 'M'
  if (value >= 1_000) return '$' + (value / 1_000).toFixed(0) + 'K'
  return '$' + value.toFixed(0)
}

function formatTxDate(timestamp: number): string {
  const ms = timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const TX_TYPES: Record<string, { label: string; icon: string; color: string }> = {
  deposit: { label: 'Deposit', icon: 'lucide:arrow-down-to-line', color: 'text-primary' },
  withdraw: { label: 'Withdraw', icon: 'lucide:arrow-up-from-line', color: 'text-orange-500' },
  redeem: { label: 'Redeem', icon: 'lucide:arrow-up-from-line', color: 'text-orange-500' },
  switch: { label: 'Switch', icon: 'lucide:repeat-2', color: 'text-blue-400' },
}

// ---- Vault details ----
const showVaultDetails = ref(false)
const copiedAddress = ref(false)
function copyAddress(addr: string) {
  navigator.clipboard.writeText(addr)
  copiedAddress.value = true
  setTimeout(() => copiedAddress.value = false, 2000)
}
function truncAddr(addr: string) { return addr.slice(0, 6) + '...' + addr.slice(-4) }

// ---- Exports ----
function exportCSV() {
  if (!pocket.value || !history.value.length) return
  const rows = [['Date', 'Type', 'Amount', 'Asset', 'TX Hash']]
  for (const tx of history.value) {
    rows.push([formatTxDate(tx.timestamp), TX_TYPES[tx.type]?.label ?? tx.type, tx.amount, tx.assetSymbol || 'USD', tx.txHash])
  }
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `${pocket.value.name.replace(/\s+/g, '_')}_transactions.csv`
  link.click()
}

async function exportPDF() {
  if (!pocket.value) return
  exportingPDF.value = true
  try {
    const blob = await $fetch<Blob>('/api/transactions/export-pdf', {
      method: 'POST',
      body: {
        pocket_id: pocketId,
        pocket_name: pocket.value.name,
        strategy_label: STRATEGY_LABELS[pocket.value.strategy_key] ?? '',
        asset_symbol: allocations.value.length > 1 ? 'Multi-asset' : strategy.value?.assetSymbol ?? '',
        apy: apyFormatted.value ?? 'N/A',
        current_value: displayUsd(usdValue.value),
        profit: profitFormatted.value ?? '$0.00',
      },
      responseType: 'blob',
    })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${pocket.value.name.replace(/\s+/g, '_')}_transactions.pdf`
    link.click()
  } finally {
    exportingPDF.value = false
  }
}

// ---- Share card ----
const showShareCard = ref(false)
const shareCardRef = ref<HTMLElement | null>(null)
const generatingImage = ref(false)
const STRATEGY_COLORS: Record<string, string> = { conservative: 'emerald', balanced: 'blue', aggressive: 'violet' }

async function downloadShareCard() {
  if (!shareCardRef.value) return
  generatingImage.value = true
  try {
    const dataUrl = await toPng(shareCardRef.value, { quality: 1, pixelRatio: 2, backgroundColor: '#09090b' })
    const link = document.createElement('a')
    link.download = `${pocket.value?.name ?? 'pocket'}-${BRAND.name.toLowerCase()}.png`
    link.href = dataUrl
    link.click()
  } finally {
    generatingImage.value = false
  }
}

function shareText(): string {
  const yieldStr = yieldEarnedUsd.value > 0 ? ` (${profitFormatted.value} earned)` : ''
  return `I'm saving ${displayUsd(usdValue)} for "${pocket.value?.name}"${yieldStr} with @aurenapp — goal-based DeFi savings on @base.`
}

async function nativeShare() {
  const text = shareText()
  if (navigator.share) await navigator.share({ text, url: BRAND.siteUrl })
  else await navigator.clipboard.writeText(`${text}\n${BRAND.siteUrl}`)
}

function shareToTwitter() {
  const text = encodeURIComponent(shareText())
  const url = encodeURIComponent(BRAND.siteUrl)
  window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank', 'width=550,height=420')
}

function shareToFarcaster() {
  const text = encodeURIComponent(shareText())
  const url = encodeURIComponent(BRAND.siteUrl)
  window.open(`https://warpcast.com/~/compose?text=${text}&embeds[]=${url}`, '_blank', 'width=550,height=420')
}

async function copyShareLink() {
  await navigator.clipboard.writeText(`${shareText()}\n${BRAND.siteUrl}`)
  toast.success('Copied to clipboard')
}

// ---- Yield ticker (animated counter) ----
const displayedUsd = ref(0)
let tickerRaf: number | null = null

function animateYield(target: number) {
  if (tickerRaf) cancelAnimationFrame(tickerRaf)
  const start = displayedUsd.value
  const diff = target - start
  if (Math.abs(diff) < 0.01) { displayedUsd.value = target; return }
  const duration = 1200
  const startTime = performance.now()
  function step(now: number) {
    const t = Math.min((now - startTime) / duration, 1)
    const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
    displayedUsd.value = start + diff * ease
    if (t < 1) tickerRaf = requestAnimationFrame(step)
  }
  tickerRaf = requestAnimationFrame(step)
}

watch(usdValue, (v) => animateYield(v), { immediate: true })

// ---- Yield per second (live ticker feel) ----
const yieldPerSecond = computed(() => {
  if (!pocket.value || usdValue.value === 0) return 0
  const apyStr = profileStore.getStrategyApy(pocket.value.strategy_key)
  const apy = parseFloat(apyStr ?? '0')
  if (isNaN(apy) || apy === 0) return 0
  return (usdValue.value * apy / 100) / (365 * 24 * 60 * 60)
})

let tickInterval: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  tickInterval = setInterval(() => {
    if (yieldPerSecond.value > 0) {
      displayedUsd.value += yieldPerSecond.value
    }
  }, 1000)
})
onUnmounted(() => { if (tickInterval) clearInterval(tickInterval) })

// ---- Edit ----
const showEditDialog = ref(false)
function handleSaved() { profileStore.refreshPockets() }

// ---- Deposit dialog (uses CreatePocketDialog in deposit-only mode) ----
const showDepositDialog = ref(false)
const creatingPocket = ref(false)
const selectedPocketForTx = ref<DbPocket | null>(null)
const lastTxType = ref<'deposit' | 'withdraw' | 'redeem'>('deposit')
const lastTxAmount = ref('')
const showLegacyDepositDialog = ref(false)

const selectedStrategyForTx = computed(() =>
  selectedPocketForTx.value ? STRATEGIES[selectedPocketForTx.value.strategy_key as StrategyKey] : null,
)

useTransactionRecorder({
  txState, txHash, reset,
  selectedPocket: selectedPocketForTx,
  selectedStrategy: selectedStrategyForTx,
  lastTxType, lastTxAmount,
  showDepositDialog: showLegacyDepositDialog,
  address,
  fetchBalances: refetchAll,
  fetchWalletTokens: refetchAll,
  fetchAllPositions: async () => { await refetchAll() },
  refreshPockets: async () => { await refetchAll() },
})

function openDepositDialog() {
  if (!pocket.value) return
  selectedPocketForTx.value = pocket.value
  showDepositDialog.value = true
}

async function handleCreateAndDeposit(payload: {
  name: string
  purpose?: string
  target_amount?: number
  timeline?: string
  strategy_key: StrategyKey
  vault: {
    vault_address: string
    vault_chain_id: number
    vault_protocol: string
    vault_symbol: string
    vault_asset: string
  }
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
    quote?: any
  }>
}) {
  if (!pocket.value) return
  creatingPocket.value = true
  try {
    selectedPocketForTx.value = pocket.value
    lastTxType.value = 'deposit'
    lastTxAmount.value = payload.totalAmount

    const strategy = STRATEGIES[payload.strategy_key]
    for (const alloc of payload.allocations) {
      reset()
      const amtFixed = Number(alloc.amount).toFixed(payload.fromTokenDecimals)
      const amtWei = parseUnits(amtFixed, payload.fromTokenDecimals).toString()

      await lifiDeposit({
        fromChain: payload.fromChainId,
        fromToken: payload.fromToken,
        fromAmount: amtWei,
        vaultAddress: alloc.vaultAddress,
        vaultChainId: alloc.vaultChainId,
        vaultAssetAddress: strategy?.assetAddress,
        vaultProtocol: alloc.protocol,
      })

      if (txState.value === 'failed') break
    }

    creatingPocket.value = false
    await refetchAll()
  } catch (e) {
    creatingPocket.value = false
    throw e
  }
}

// Empty handler for "create" event (deposit-only mode never emits this)
function handleCreatePocket() {}

// ---- Withdraw dialog ----
const showWithdrawDialog = ref(false)
function openWithdrawDialog() {
  if (pocket.value) showWithdrawDialog.value = true
}

// ---- Switch vault dialog ----
const showSwitchVaultDialog = ref(false)
function openSwitchVaultDialog() {
  if (pocket.value) showSwitchVaultDialog.value = true
}
const currentVaultAddress = computed(() => allocations.value[0]?.address)

// ---- Schedule dialog ----
const showScheduleDialog = ref(false)
const savingSchedule = ref(false)

function openScheduleDialog() {
  if (pocket.value) showScheduleDialog.value = true
}

async function handleSaveSchedule(payload: { recurring_day: number; recurring_amount: string; recurring_next_due: string }) {
  if (!pocket.value) return
  savingSchedule.value = true
  try {
    await profileStore.updatePocket(pocket.value.id, payload)
    await profileStore.refreshPockets()
    showScheduleDialog.value = false
    toast.success('Deposit reminder set!')
  } finally {
    savingSchedule.value = false
  }
}

async function handleRemoveSchedule() {
  if (!pocket.value) return
  savingSchedule.value = true
  try {
    await profileStore.updatePocket(pocket.value.id, {
      recurring_day: null,
      recurring_amount: null,
      recurring_next_due: null,
    })
    await profileStore.refreshPockets()
    showScheduleDialog.value = false
    toast.success('Deposit reminder removed')
  } finally {
    savingSchedule.value = false
  }
}

// ---- Lifecycle ----
watch(pocket, () => { if (pocket.value) fetchHistory() }, { immediate: true })
watch([isConnected, isReady], ([connected, ready]) => {
  if (ready && !connected) navigateTo('/app')
}, { immediate: true })
</script>

<template>
  <div class="min-h-screen bg-background">
    <!-- Header -->
    <header class="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b">
      <div class="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
        <Button variant="ghost" size="sm" class="h-8 w-8 p-0" @click="navigateTo('/app')">
          <Icon name="lucide:arrow-left" class="w-4 h-4" />
        </Button>
        <h1 class="text-sm font-semibold truncate">{{ pocket?.name || 'Pocket' }}</h1>
        <div class="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" class="h-8" @click="showShareCard = true">
            <Icon name="lucide:share-2" class="w-4 h-4 mr-1" /> Share
          </Button>
          <Button variant="ghost" size="sm" class="h-8" @click="showEditDialog = true">
            <Icon name="lucide:pencil" class="w-4 h-4 mr-1" /> Edit
          </Button>
        </div>
      </div>
    </header>

    <!-- Loading skeleton -->
    <div v-if="!pocket" class="max-w-4xl mx-auto px-4 sm:px-6 py-6">
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card class="lg:row-span-2">
          <CardContent class="p-6 space-y-4">
            <div class="flex items-center gap-2">
              <Skeleton class="w-10 h-10 rounded-xl" />
              <div class="flex-1 space-y-1.5">
                <Skeleton class="h-4 w-28" />
                <Skeleton class="h-3 w-16" />
              </div>
            </div>
            <Skeleton class="h-12 w-40" />
            <Skeleton class="h-4 w-24" />
            <div class="flex gap-3">
              <Skeleton class="flex-1 h-11 rounded-xl" />
              <Skeleton class="flex-1 h-11 rounded-xl" />
            </div>
            <Skeleton class="h-9 w-full rounded-xl" />
          </CardContent>
        </Card>
        <Card>
          <CardContent class="p-5 space-y-3">
            <Skeleton class="h-4 w-28" />
            <Skeleton class="h-14 w-full rounded-xl" />
          </CardContent>
        </Card>
        <Card>
          <CardContent class="p-5 space-y-3">
            <Skeleton class="h-4 w-20" />
            <div class="space-y-2">
              <Skeleton class="h-4 w-full" />
              <Skeleton class="h-4 w-5/6" />
              <Skeleton class="h-4 w-3/4" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>

    <main v-else class="max-w-4xl mx-auto px-4 sm:px-6 py-6">
      <!-- Card grid -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">

        <!-- ── Hero Card ── -->
        <Card class="lg:row-span-2">
          <CardContent class="p-6">
            <div class="flex items-center gap-2 mb-4">
              <div class="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                <Icon :name="strategy?.icon ?? 'lucide:piggy-bank'" class="w-5 h-5" :class="RISK_META[pocket.strategy_key]?.color" />
              </div>
              <div>
                <p class="text-sm font-semibold">{{ STRATEGY_LABELS[pocket.strategy_key] || pocket.strategy_key }}</p>
                <p class="text-xs" :class="RISK_META[pocket.strategy_key]?.color">{{ RISK_META[pocket.strategy_key]?.label }}</p>
              </div>
            </div>

            <template v-if="loadingPositions">
              <Skeleton class="h-12 w-44 mb-2" />
              <Skeleton class="h-5 w-28" />
            </template>
            <template v-else>
              <!-- Animated yield ticker -->
              <h2 class="text-4xl font-bold tracking-tight tabular-nums">
                {{ displayUsd(displayedUsd) }}
              </h2>
              <div class="flex items-center gap-3 mt-1">
                <span v-if="apyFormatted" class="text-sm text-primary font-semibold">{{ apyFormatted }} APY</span>
                <span
                  v-if="profitFormatted"
                  class="text-sm font-medium"
                  :class="profitPositive ? 'text-primary' : 'text-red-500'"
                >{{ profitFormatted }}</span>
              </div>
              <p v-if="yieldPerSecond > 0" class="text-[11px] text-primary/50 mt-1 flex items-center gap-1">
                <span class="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                earning {{ (yieldPerSecond * 86400).toFixed(4) }}/day
              </p>
            </template>

            <!-- Actions -->
            <div class="flex gap-3 mt-6">
              <Button class="flex-1 h-11 rounded-xl" @click="openDepositDialog">
                <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" /> Deposit
              </Button>
              <Button variant="outline" class="flex-1 h-11 rounded-xl" @click="openWithdrawDialog">
                <Icon name="lucide:arrow-up" class="w-4 h-4 mr-1.5" /> Withdraw
              </Button>
            </div>
            <Button
              v-if="(pocket?.allocations?.length ?? 1) <= 1"
              variant="ghost"
              size="sm"
              class="w-full h-9 rounded-xl mt-2 text-xs text-muted-foreground hover:text-foreground"
              @click="openSwitchVaultDialog"
            >
              <Icon name="lucide:repeat-2" class="w-3.5 h-3.5 mr-1.5" /> Switch vault
            </Button>
          </CardContent>
        </Card>

        <!-- ── Vault Breakdown Card ── -->
        <Card>
          <CardContent class="p-5">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-sm font-semibold">{{ strategy?.assetSymbol }} Vaults</h3>
              <span class="text-xs text-muted-foreground">{{ allocations.length }} vault{{ allocations.length !== 1 ? 's' : '' }}</span>
            </div>

            <div class="space-y-2.5">
              <div
                v-for="alloc in allocations" :key="alloc.address"
                class="flex items-center gap-3 rounded-lg bg-muted/30 px-3 py-2.5"
              >
                <AppVaultLogos
                  :asset-address="strategy?.assetAddress"
                  :asset-symbol="alloc.assetSymbol"
                  :protocol="alloc.protocol"
                  size="sm"
                />
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-semibold truncate">{{ alloc.vaultSymbol }}</p>
                  <p class="text-[11px] text-muted-foreground">{{ alloc.protocol }} · {{ Math.round(alloc.weight * 100) }}%</p>
                </div>
                <div class="text-right shrink-0">
                  <p class="text-sm font-bold text-primary">{{ alloc.apy > 0 ? (alloc.apy * 100).toFixed(1) + '%' : '—' }}</p>
                  <p class="text-[10px] text-muted-foreground">{{ formatTvl(alloc.tvl) }}</p>
                </div>
              </div>
            </div>

            <div v-if="!allocations.length" class="text-sm text-muted-foreground py-4 text-center">
              Loading vault data...
            </div>
          </CardContent>
        </Card>


        <!-- ── Earnings Breakdown Card ── -->
        <Card v-if="!loadingPositions && !loadingHistory && (assetValue > 0 || history.length > 0)">
          <CardContent class="p-5">
            <h3 class="text-sm font-semibold mb-3">Earnings</h3>
            <div class="space-y-2.5">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <div class="w-2 h-2 rounded-full bg-muted-foreground" />
                  <span class="text-sm text-muted-foreground">Deposited</span>
                </div>
                <span class="text-sm font-medium">{{ displayUsd(principal) }}</span>
              </div>
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <div class="w-2 h-2 rounded-full bg-primary" />
                  <span class="text-sm text-muted-foreground">Yield</span>
                </div>
                <span class="text-sm font-medium text-primary">+{{ displayUsd(yieldEarnedUsd) }}</span>
              </div>
              <div class="h-px bg-border" />
              <div class="flex items-center justify-between">
                <span class="text-sm text-muted-foreground">Total</span>
                <span class="text-sm font-bold">{{ displayUsd(usdValue) }}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- ── Goal Card ── -->
        <Card v-if="pocket.target_amount || pocket.timeline">
          <CardContent class="p-5">
            <h3 class="text-sm font-semibold mb-3">Goal</h3>

            <div v-if="pocket.target_amount" class="space-y-2">
              <div class="flex items-center justify-between text-sm">
                <span class="text-muted-foreground">Progress</span>
                <span class="font-medium">{{ displayUsd(usdValue) }} / {{ displayUsd(pocket.target_amount) }}</span>
              </div>
              <!-- Simple progress bar -->
              <div class="h-2 rounded-full bg-muted/40 overflow-hidden">
                <div
                  class="h-full rounded-full transition-all duration-700"
                  :class="RISK_META[pocket.strategy_key]?.bg ?? 'bg-primary'"
                  :style="{ width: Math.min(progressRaw, 100) + '%' }"
                />
              </div>
              <p class="text-xs text-muted-foreground text-right">{{ Math.round(progressRaw) }}%</p>
            </div>

            <div v-if="timelineDisplay" class="flex items-center justify-between mt-3 pt-3 border-t">
              <span class="text-xs text-muted-foreground">Deadline</span>
              <div class="text-right">
                <p class="text-xs font-medium">{{ timelineDisplay.date }}</p>
                <p class="text-[11px]" :class="timelineDisplay.overdue ? 'text-red-500' : 'text-muted-foreground'">
                  {{ timelineDisplay.remaining }}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- ── Recurring Reminder ── -->
        <Card>
          <CardContent class="p-5">
            <div class="flex items-center gap-2 mb-3">
              <Icon name="lucide:bell" class="w-4 h-4 text-muted-foreground" />
              <h3 class="text-sm font-semibold">Deposit Reminder</h3>
            </div>

            <template v-if="pocket.recurring_day != null">
              <div class="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/10">
                <div class="flex-1">
                  <p class="text-sm font-medium">
                    Every {{ pocket.recurring_day === 1 ? '1st' : pocket.recurring_day === 2 ? '2nd' : pocket.recurring_day === 3 ? '3rd' : pocket.recurring_day + 'th' }} of the month
                  </p>
                  <p v-if="pocket.recurring_amount" class="text-xs text-muted-foreground">
                    {{ displayUsd(parseFloat(pocket.recurring_amount)) }} target
                  </p>
                  <p v-if="pocket.recurring_next_due" class="text-[11px] text-primary mt-0.5">
                    Next: {{ new Date(pocket.recurring_next_due).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }}
                  </p>
                </div>
                <Icon name="lucide:check-circle-2" class="w-5 h-5 text-primary shrink-0" />
              </div>
            </template>

            <template v-else>
              <p class="text-xs text-muted-foreground mb-3">
                Set a monthly reminder to grow your pocket consistently.
              </p>
              <Button variant="outline" size="sm" class="w-full" @click="openScheduleDialog">
                <Icon name="lucide:calendar-plus" class="w-3.5 h-3.5 mr-1.5" />
                Set reminder
              </Button>
            </template>
          </CardContent>
        </Card>

        <!-- ── PERFORMANCE SECTION ── -->
        <div class="lg:col-span-2 space-y-4">
          <!-- KPI strip -->
          <AppPocketKpis
            :yield-earned-usd="yieldEarnedUsd"
            :principal="principal"
            :current-value-usd="usdValue"
            :target-amount="pocket.target_amount ?? null"
            :created-at="pocket.created_at"
            :recurring-amount="pocket.recurring_amount"
          />

          <!-- Combined past + projection chart -->
          <AppPocketPerformanceChart
            :transactions="chartTransactions"
            :current-value-usd="usdValue"
            :apy="apyDecimal"
            :target-amount="pocket.target_amount ?? null"
            :pocket-created-at="pocket.created_at"
          />

          <!-- APY trend + Deposit pace side-by-side -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <AppPocketApyTrend
              :apy-details="apyDetailsForPocket"
              :current-apy="apyFormatted"
            />
            <AppPocketDepositPace
              :transactions="chartTransactions"
              :months-back="12"
            />
          </div>

          <!-- Vault health + risk score -->
          <AppVaultHealthCard :health="pocketHealth" title="Vault health & risk" />

          <!-- What-if comparison -->
          <AppPocketWhatIf
            :current-strategy-key="(pocket.strategy_key as StrategyKey)"
            :principal="principal"
            :days-active="daysActiveForWhatIf"
            :strategy-apys="allStrategyApys"
          />
        </div>

        <!-- ── Transaction History ── -->
        <Card class="lg:col-span-2">
          <CardContent class="p-5">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-sm font-semibold">Transactions</h3>
              <div v-if="history.length" class="flex items-center gap-1">
                <Button variant="ghost" size="sm" class="h-7 text-xs gap-1" @click="exportCSV">
                  <Icon name="lucide:download" class="w-3 h-3" /> CSV
                </Button>
                <Button variant="ghost" size="sm" class="h-7 text-xs gap-1" :disabled="exportingPDF" @click="exportPDF">
                  <Icon :name="exportingPDF ? 'lucide:loader-2' : 'lucide:file-text'" :class="exportingPDF ? 'animate-spin' : ''" class="w-3 h-3" /> PDF
                </Button>
              </div>
            </div>

            <div v-if="loadingHistory" class="space-y-2">
              <Skeleton v-for="i in 3" :key="i" class="h-14 rounded-lg" />
            </div>

            <p v-else-if="!history.length" class="text-sm text-muted-foreground text-center py-6">
              No transactions yet
            </p>

            <div v-else class="space-y-2">
              <div
                v-for="tx in history" :key="tx.txHash"
                class="flex items-center gap-3 p-3 rounded-xl bg-muted/30"
              >
                <div
                  class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  :class="tx.type === 'deposit' ? 'bg-primary/10' : 'bg-orange-500/10'"
                >
                  <Icon :name="TX_TYPES[tx.type]?.icon ?? 'lucide:circle'" class="w-3.5 h-3.5" :class="TX_TYPES[tx.type]?.color" />
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium">{{ TX_TYPES[tx.type]?.label ?? tx.type }}</p>
                  <p class="text-[11px] text-muted-foreground">{{ formatTxDate(tx.timestamp) }}</p>
                </div>
                <div class="text-right shrink-0">
                  <p class="text-sm font-medium font-mono">
                    {{ tx.type === 'deposit' ? '+' : '-' }}{{ tx.amount }} {{ tx.assetSymbol || 'USD' }}
                  </p>
                  <a
                    :href="`https://basescan.org/tx/${tx.txHash}`"
                    target="_blank"
                    class="text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    View tx <Icon name="lucide:external-link" class="w-2.5 h-2.5 inline" />
                  </a>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>

      <!-- Trust footer -->
      <div class="mt-6 pt-4 border-t border-border/40">
        <div class="flex flex-wrap items-center justify-center gap-x-6 gap-y-1.5 text-[11px] text-muted-foreground/50">
          <span class="flex items-center gap-1"><Icon name="lucide:shield-check" class="w-3 h-3" /> Non-custodial</span>
          <span class="flex items-center gap-1"><Icon name="lucide:link" class="w-3 h-3" /> Onchain vaults</span>
          <span class="flex items-center gap-1"><Icon name="lucide:activity" class="w-3 h-3" /> Variable returns</span>
        </div>
      </div>
    </main>

    <LandingFooter />

    <!-- Edit Dialog -->
    <AppEditPocketDialog v-if="pocket" v-model:open="showEditDialog" :pocket="pocket" @saved="handleSaved" />

    <!-- Share Card Dialog -->
    <Dialog v-model:open="showShareCard">
      <DialogContent class="sm:max-w-fit bg-transparent border-none shadow-none p-0 [&>button]:hidden">
        <DialogHeader class="sr-only">
          <DialogTitle>Share Pocket</DialogTitle>
          <DialogDescription>Download your pocket performance card</DialogDescription>
        </DialogHeader>
        <div class="flex flex-col items-center gap-4">
          <div ref="shareCardRef">
            <AppPocketShareCard
              :pocket-name="pocket?.name ?? ''"
              :strategy-label="STRATEGY_LABELS[pocket?.strategy_key ?? ''] ?? ''"
              :strategy-color="STRATEGY_COLORS[pocket?.strategy_key ?? ''] ?? 'emerald'"
              :asset-symbol="allocations.length > 1 ? 'Multi-asset' : strategy?.assetSymbol ?? ''"
              :current-value-usd="displayUsd(usdValue)"
              :profit-formatted="profitFormatted"
              :profit-positive="profitPositive"
              :apy-formatted="apyFormatted"
            />
          </div>
          <div class="flex flex-wrap gap-2">
            <Button @click="downloadShareCard" :disabled="generatingImage">
              <Icon name="lucide:download" class="w-4 h-4 mr-2" /> {{ generatingImage ? 'Generating...' : 'Save PNG' }}
            </Button>
            <Button variant="outline" @click="shareToTwitter">
              <Icon name="lucide:twitter" class="w-4 h-4 mr-2" /> X
            </Button>
            <Button variant="outline" @click="shareToFarcaster">
              <Icon name="lucide:hexagon" class="w-4 h-4 mr-2" /> Farcaster
            </Button>
            <Button variant="outline" @click="copyShareLink">
              <Icon name="lucide:copy" class="w-4 h-4 mr-2" /> Copy
            </Button>
            <DialogClose as-child><Button variant="ghost" size="icon"><Icon name="lucide:x" class="w-4 h-4" /></Button></DialogClose>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <!-- Deposit Dialog (CreatePocketDialog in deposit-only mode) -->
    <AppCreatePocketDialog
      v-if="pocket"
      v-model:open="showDepositDialog"
      :creating="creatingPocket"
      :tx-state="txState"
      :tx-error="txError"
      :wallet-tokens="walletTokens"
      :loading-tokens="loadingTokens"
      :user-address="address"
      :pre-select-strategy="pocket.strategy_key as StrategyKey"
      :initial-strategy="null"
      @create="handleCreatePocket"
      @create-and-deposit="handleCreateAndDeposit"
      @fetch-tokens="fetchWalletTokens"
    />

    <!-- Withdraw Dialog -->
    <AppPocketWithdrawDialog
      v-model:open="showWithdrawDialog"
      :pocket="pocket"
      @done="refetchAll"
    />

    <!-- Schedule Dialog -->
    <AppScheduleDialog
      v-model:open="showScheduleDialog"
      :pocket="pocket"
      :asset-price="pocket ? profileStore.getAssetPrice(pocket.strategy_key) : 0"
      :saving="savingSchedule"
      @save="handleSaveSchedule"
      @remove="handleRemoveSchedule"
    />

    <!-- Switch Vault Dialog -->
    <AppPocketSwitchVaultDialog
      v-model:open="showSwitchVaultDialog"
      :pocket="pocket"
      :current-vault-address="currentVaultAddress"
      @done="refetchAll"
    />
  </div>
</template>
