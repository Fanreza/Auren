<script setup lang="ts">
import { formatUnits } from 'viem'
import { toPng } from 'html-to-image'
import { BRAND } from '~/config/brand'
import { STRATEGIES, STRATEGY_LIST, type StrategyKey } from '~/config/strategies'
import { usePrivyAuth } from '~/composables/usePrivy'
import { storeToRefs } from 'pinia'
import { useProfileStore } from '~/stores/useProfileStore'

const route = useRoute()
const pocketId = route.params.id as string

const { isConnected, isReady } = usePrivyAuth()
const profileStore = useProfileStore()
const { pockets, pocketPositions, pocketProfits, loadingPositions } = storeToRefs(profileStore)
const { getTransactions } = useUserData()

const CIRCUMFERENCE = 2 * Math.PI * 42

// ---- Pocket ----
const pocket = computed(() => pockets.value.find(p => p.id === pocketId) ?? null)
const strategy = computed(() =>
  pocket.value ? STRATEGIES[pocket.value.strategy_key as StrategyKey] : null,
)

const RISK_LABELS: Record<string, { label: string; color: string }> = {
  conservative: { label: 'Low risk', color: 'text-emerald-500' },
  balanced: { label: 'Medium risk', color: 'text-blue-500' },
  aggressive: { label: 'High risk', color: 'text-violet-500' },
}

const STRATEGY_LABELS: Record<string, string> = {
  conservative: 'Savings',
  balanced: 'Growth',
  aggressive: 'High Growth',
}

// ---- Position + price from store ----
const position = computed(() =>
  pocketPositions.value[pocketId] ?? { shares: 0n, value: 0n },
)

const assetPrice = computed(() =>
  pocket.value ? profileStore.getAssetPrice(pocket.value.strategy_key) : 0,
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
    console.error('[pocket detail] history fetch failed:', e)
    history.value = []
  } finally {
    loadingHistory.value = false
  }
}

// ---- Computed values ----
const assetValue = computed(() => {
  if (position.value.value === 0n || !strategy.value) return 0
  return parseFloat(formatUnits(position.value.value, strategy.value.decimals))
})

const usdValue = computed(() => assetValue.value * assetPrice.value)

const currentValueFormatted = computed(() => {
  if (assetValue.value === 0) return '0'
  if (assetValue.value < 0.000001) return '<0.000001'
  return assetValue.value.toLocaleString('en-US', { maximumFractionDigits: 6 })
})

const progressRaw = computed(() => {
  if (!pocket.value?.target_amount || pocket.value.target_amount === 0) return 0
  if (usdValue.value === 0) return 0
  return Math.min((usdValue.value / pocket.value.target_amount) * 100, 100)
})

const progress = computed(() => {
  const v = progressRaw.value
  if (v === 0) return '0'
  if (v >= 1) return Math.round(v).toString()
  if (v >= 0.1) return v.toFixed(1)
  if (v >= 0.01) return v.toFixed(2)
  return v.toFixed(3)
})

const apyFormatted = computed(() => {
  if (!pocket.value) return null
  const val = profileStore.getStrategyApy(pocket.value.strategy_key)
  if (!val) return null
  const num = parseFloat(val)
  if (isNaN(num)) return null
  return num.toFixed(2) + '%'
})

const profitFormatted = computed(() => {
  const raw = pocketProfits.value[pocketId]
  if (!raw) return null
  const val = parseFloat(raw)
  if (isNaN(val) || val === 0) return null
  const usd = val * assetPrice.value
  const sign = usd > 0 ? '+' : ''
  return sign + '$' + Math.abs(usd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
})

const profitPositive = computed(() => {
  const raw = pocketProfits.value[pocketId]
  if (!raw) return true
  return parseFloat(raw) >= 0
})

const timelineDisplay = computed(() => {
  if (!pocket.value?.timeline) return null
  const target = new Date(pocket.value.timeline)
  const now = new Date()
  const diffMs = target.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  const dateStr = target.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  if (diffDays < 0) return { date: dateStr, remaining: 'Past due', overdue: true }
  if (diffDays === 0) return { date: dateStr, remaining: 'Today', overdue: false }
  return { date: dateStr, remaining: `${diffDays} days left`, overdue: false }
})

// ---- Feature 1: Goal status ----
const expectedProgress = computed(() => {
  if (!pocket.value?.timeline || !pocket.value?.target_amount) return null
  const start = new Date(pocket.value.created_at).getTime()
  const end = new Date(pocket.value.timeline).getTime()
  const now = Date.now()
  const total = end - start
  if (total <= 0) return 1
  return Math.min(Math.max((now - start) / total, 0), 1)
})

const goalStatus = computed(() => {
  if (expectedProgress.value == null || !pocket.value?.target_amount) return null
  const actual = usdValue.value / pocket.value.target_amount
  const diff = actual - expectedProgress.value
  if (diff > 0.05) return { label: 'Ahead', color: 'text-primary', bg: 'bg-primary/10' }
  if (diff < -0.05) return { label: 'Behind', color: 'text-red-500', bg: 'bg-red-500/10' }
  return { label: 'On track', color: 'text-blue-500', bg: 'bg-blue-500/10' }
})

// ---- Feature 2: Confidence indicators ----
const tvlRaw = computed(() => profileStore.getStrategyTvl(pocket.value?.strategy_key ?? ''))
const apyDetails = computed(() => profileStore.getStrategyApyDetails(pocket.value?.strategy_key ?? ''))

// TVL is in asset terms (e.g. 7043 ETH), multiply by asset price to get USD
const tvlUsd = computed(() => {
  if (!tvlRaw.value) return null
  const num = parseFloat(tvlRaw.value)
  if (isNaN(num)) return null
  return num * assetPrice.value
})

const apyStability = computed(() => {
  const d = apyDetails.value
  if (!d) return null
  const vals = [d['1d'], d['7d'], d['30d']].filter(Boolean).map(Number).filter(v => !isNaN(v))
  if (vals.length < 2) return null
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length
  if (avg === 0) return null
  return (max - min) / avg > 0.3 ? 'Volatile' : 'Stable'
})

function formatTvl(value: number | null): string {
  if (value == null || value === 0) return '—'
  if (value >= 1_000_000_000) return '$' + (value / 1_000_000_000).toFixed(1) + 'B'
  if (value >= 1_000_000) return '$' + (value / 1_000_000).toFixed(1) + 'M'
  if (value >= 1_000) return '$' + (value / 1_000).toFixed(0) + 'K'
  return '$' + value.toFixed(0)
}

// ---- Feature 3: Earnings breakdown ----
const principal = computed(() => {
  if (history.value.length === 0) return 0
  let total = 0
  for (const tx of history.value) {
    const amt = parseFloat(tx.amount)
    if (isNaN(amt)) continue
    if (tx.type === 'deposit') total += amt
    else total -= amt
  }
  return Math.max(total, 0)
})

const yieldEarned = computed(() => {
  if (assetValue.value === 0 || principal.value === 0) return 0
  return Math.max(assetValue.value - principal.value, 0)
})

const yieldPercentContribution = computed(() => {
  if (assetValue.value === 0) return 0
  return (yieldEarned.value / assetValue.value) * 100
})

const estimatedOneYearValue = computed(() => {
  if (assetValue.value === 0 || !pocket.value) return 0
  const apy = parseFloat(profileStore.getStrategyApy(pocket.value.strategy_key) ?? '0')
  if (isNaN(apy) || apy === 0) return assetValue.value
  return assetValue.value * (1 + apy / 100)
})

// ---- Feature 4: Strategy switch simulation ----
const alternativeStrategies = computed(() =>
  STRATEGY_LIST.filter(s => s.key !== pocket.value?.strategy_key),
)

const strategySimulations = computed(() => {
  if (usdValue.value === 0 || !pocket.value) return []
  const currentApy = parseFloat(profileStore.getStrategyApy(pocket.value.strategy_key) ?? '0')
  const currentProjected = usdValue.value * (1 + (isNaN(currentApy) ? 0 : currentApy) / 100)

  return alternativeStrategies.value.map(s => {
    const altApy = parseFloat(profileStore.getStrategyApy(s.key) ?? '0')
    const projectedUsd = usdValue.value * (1 + (isNaN(altApy) ? 0 : altApy) / 100)
    return {
      strategy: s,
      apy: isNaN(altApy) ? 0 : altApy,
      projectedUsd,
      diffUsd: projectedUsd - currentProjected,
    }
  })
})

function displayUsd(value: number): string {
  if (value === 0) return '$0.00'
  return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatTxDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const TX_TYPE_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  deposit: { label: 'Deposit', icon: 'lucide:arrow-down-to-line', color: 'text-primary' },
  withdraw: { label: 'Withdraw', icon: 'lucide:arrow-up-from-line', color: 'text-orange-500' },
  redeem: { label: 'Redeem', icon: 'lucide:arrow-up-from-line', color: 'text-orange-500' },
  switch: { label: 'Switch Vault', icon: 'lucide:repeat-2', color: 'text-blue-400' },
}

// ---- Export functions ----
function exportCSV() {
  if (!pocket.value || history.value.length === 0) return

  const headers = ['Date', 'Type', 'Amount', 'Asset', 'TX Hash']
  const rows = history.value.map(tx => [
    formatTxDate(tx.timestamp),
    TX_TYPE_CONFIG[tx.type]?.label ?? tx.type,
    tx.amount,
    tx.assetSymbol || strategy.value?.assetSymbol || '',
    tx.txHash,
  ])

  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${pocket.value.name.replace(/\s+/g, '_')}_transactions.csv`
  link.click()
  URL.revokeObjectURL(url)
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
        asset_symbol: strategy.value?.assetSymbol ?? '',
        apy: apyFormatted.value ?? 'N/A',
        current_value: displayUsd(usdValue.value),
        profit: profitFormatted.value ?? '$0.00',
      },
      responseType: 'blob',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${pocket.value.name.replace(/\s+/g, '_')}_transactions.pdf`
    link.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    console.error('[exportPDF] failed:', e)
  } finally {
    exportingPDF.value = false
  }
}

function exportTaxCSV() {
  if (!pocket.value || history.value.length === 0) return

  const asset = strategy.value?.assetSymbol ?? ''
  const deposits = history.value.filter(tx => tx.type === 'deposit')
  const withdrawals = history.value.filter(tx => tx.type === 'withdraw' || tx.type === 'redeem')
  const switches = history.value.filter(tx => tx.type === 'switch')

  const headers = ['Deposit Date', 'Withdraw Date', 'Amount', 'Yield Earned', 'Asset', 'TX Hash']
  const rows: string[][] = []

  for (const tx of deposits) {
    rows.push([formatTxDate(tx.timestamp), '', tx.amount, '', tx.assetSymbol || asset, tx.txHash])
  }
  for (const tx of withdrawals) {
    rows.push(['', formatTxDate(tx.timestamp), tx.amount, '', tx.assetSymbol || asset, tx.txHash])
  }
  for (const tx of switches) {
    rows.push([formatTxDate(tx.timestamp), '', tx.amount, '', 'Switch', tx.txHash])
  }

  // Summary row
  const yieldStr = yieldEarned.value > 0 ? yieldEarned.value.toFixed(6) : '0'
  const yieldUsd = yieldEarned.value > 0 ? (yieldEarned.value * assetPrice.value).toFixed(2) : '0'
  rows.push([])
  rows.push(['Total Yield Earned', '', '', `${yieldStr} ${asset} (~$${yieldUsd})`, asset, ''])

  const csvContent = [headers, ...rows]
    .map(row => (row as string[]).map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${pocket.value.name.replace(/\s+/g, '_')}_tax_report.csv`
  link.click()
  URL.revokeObjectURL(url)
}

// ---- Smart Insight Engine ----
const insights = computed(() => {
  const list: { icon: string; text: string }[] = []

  // Goal progress insight
  if (goalStatus.value?.label === 'Ahead') {
    const ahead = Math.round((progressRaw.value / (expectedProgress.value! * 100) - 1) * 100)
    list.push({ icon: 'lucide:trophy', text: `You're ${ahead > 0 ? ahead + '% ' : ''}ahead of your target. Keep it up!` })
  } else if (goalStatus.value?.label === 'Behind' && pocket.value?.target_amount) {
    const remaining = pocket.value.target_amount - usdValue.value
    const months = pocket.value.timeline
      ? Math.max(Math.ceil((new Date(pocket.value.timeline).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30)), 1)
      : 12
    const monthly = remaining / months
    list.push({ icon: 'lucide:target', text: `Adding ${displayUsd(monthly)}/month keeps you on track.` })
  }

  // Strategy comparison
  if (strategySimulations.value.length > 0) {
    const best = strategySimulations.value.reduce((a, b) => a.diffUsd > b.diffUsd ? a : b)
    if (best.diffUsd > 1) {
      list.push({ icon: 'lucide:arrow-right-left', text: `Switching to ${best.strategy.label} could earn you +${displayUsd(best.diffUsd)}/year.` })
    }
  }

  // Yield insight
  if (yieldEarned.value > 0) {
    list.push({ icon: 'lucide:sparkles', text: `Your money has earned ${displayUsd(yieldEarned.value * assetPrice.value)} in yield so far.` })
  }

  // APY stability
  if (apyStability.value === 'Stable') {
    list.push({ icon: 'lucide:shield-check', text: `This vault's APY has been consistent. A sign of reliability.` })
  }

  return list.slice(0, 2)
})

// ---- Risk Simulation Mode ----
const simulateDownturn = ref(false)

const downturnScenarios = computed(() => {
  return STRATEGY_LIST.map(s => {
    const simulated = usdValue.value * (1 + s.downturnImpact / 100)
    return {
      strategy: s,
      drop: s.downturnImpact,
      simulatedValue: simulated,
      isCurrent: s.key === pocket.value?.strategy_key,
    }
  })
})

// ---- Future Projection Timeline ----
const projections = computed(() => {
  if (usdValue.value === 0 || !pocket.value) return []
  const apy = parseFloat(profileStore.getStrategyApy(pocket.value.strategy_key) ?? '0')
  if (isNaN(apy)) return []
  const years = [1, 2, 3]
  return years.map(y => ({
    year: new Date().getFullYear() + y,
    value: usdValue.value * Math.pow(1 + apy / 100, y),
    reachesTarget: pocket.value?.target_amount ? usdValue.value * Math.pow(1 + apy / 100, y) >= pocket.value.target_amount : false,
  }))
})

// ---- Psychological Layer ----
const motivation = computed(() => {
  if (history.value.length >= 3 && yieldEarned.value > 0) {
    return "You're building discipline. Consistency beats volatility."
  }
  if (history.value.length >= 1 && yieldEarned.value > 0) {
    return 'Your money is working for you. Small deposits, big impact.'
  }
  if (progressRaw.value > 50) {
    return "You're past the halfway mark. The finish line is in sight."
  }
  return 'Every journey starts with a single step. You\'ve already begun.'
})

// ---- Transparency Deep Dive ----
const showVaultDetails = ref(false)
const copiedAddress = ref(false)

function copyAddress(addr: string) {
  navigator.clipboard.writeText(addr)
  copiedAddress.value = true
  setTimeout(() => copiedAddress.value = false, 2000)
}

function truncateAddr(addr: string): string {
  return addr.slice(0, 6) + '...' + addr.slice(-4)
}

// ---- Share card ----
const showShareCard = ref(false)
const shareCardRef = ref<HTMLElement | null>(null)
const generatingImage = ref(false)

const STRATEGY_COLORS: Record<string, string> = {
  conservative: 'emerald',
  balanced: 'blue',
  aggressive: 'violet',
}

async function downloadShareCard() {
  if (!shareCardRef.value) return
  generatingImage.value = true
  try {
    const dataUrl = await toPng(shareCardRef.value, {
      quality: 1,
      pixelRatio: 2,
      backgroundColor: '#09090b',
    })
    const link = document.createElement('a')
    link.download = `${pocket.value?.name ?? 'pocket'}-${BRAND.name.toLowerCase()}.png`
    link.href = dataUrl
    link.click()
  } catch (e) {
    console.error('[shareCard] capture failed:', e)
  } finally {
    generatingImage.value = false
  }
}

async function nativeShare() {
  const name = pocket.value?.name ?? 'My pocket'
  const text = `Check out my savings pocket "${name}" on ${BRAND.name}.`
  const url = BRAND.siteUrl
  if (navigator.share) {
    await navigator.share({ text, url })
  } else {
    await navigator.clipboard.writeText(`${text}\n${url}`)
  }
}

// ---- Edit dialog ----
const showEditDialog = ref(false)

function handleSaved() {
  profileStore.refreshPockets()
}

// ---- Fetch history on load ----
watch(pocket, () => {
  if (pocket.value) fetchHistory()
}, { immediate: true })

// Redirect if disconnected (skip during session restoration)
watch([isConnected, isReady], ([connected, ready]) => {
  if (ready && !connected) navigateTo('/app')
}, { immediate: true })

// Contextual tour
const { showPocketTour } = useTour()
onMounted(() => showPocketTour())
</script>

<template>
  <div class="min-h-screen bg-background">
    <!-- Header -->
    <header class="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b">
      <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center gap-3">
        <Button variant="ghost" size="sm" class="h-8 w-8 p-0" @click="navigateTo('/app')">
          <Icon name="lucide:arrow-left" class="w-4 h-4" />
        </Button>
        <h1 class="text-sm font-semibold truncate">{{ pocket?.name || 'Pocket' }}</h1>
        <div class="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" class="h-8" data-tour="pocket-share" @click="showShareCard = true">
            <Icon name="lucide:share-2" class="w-4 h-4 mr-1" />
            Share
          </Button>
          <Button variant="ghost" size="sm" class="h-8" data-tour="pocket-edit" @click="showEditDialog = true">
            <Icon name="lucide:pencil" class="w-4 h-4 mr-1" />
            Edit
          </Button>
        </div>
      </div>
    </header>

    <!-- Loading state -->
    <div v-if="!pocket" class="flex items-center justify-center py-20">
      <Icon name="lucide:loader-2" class="w-6 h-6 animate-spin text-muted-foreground" />
    </div>

    <main v-else class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
      <!-- Hero: Current value -->
      <div class="text-center lg:text-left mb-8">
        <p class="text-sm text-muted-foreground mb-1">Current value</p>
        <template v-if="loadingPositions">
          <Skeleton class="h-10 w-40 mx-auto lg:mx-0 mb-1" />
          <Skeleton class="h-4 w-32 mx-auto lg:mx-0" />
        </template>
        <template v-else>
          <h2 class="text-4xl font-bold tracking-tight mb-1">{{ displayUsd(usdValue) }}</h2>
          <p class="text-sm text-muted-foreground">
            {{ currentValueFormatted }} {{ strategy?.assetLabel }}
          </p>
        </template>
      </div>

      <!-- Stats row -->
      <div class="grid grid-cols-3 gap-3 lg:gap-4 mb-6" data-tour="pocket-stats">
        <Card>
          <CardContent class="p-4 lg:p-5 text-center">
            <p class="text-xs text-muted-foreground mb-1">APY</p>
            <Skeleton v-if="loadingPositions" class="h-6 w-16 mx-auto" />
            <p v-else class="text-lg lg:text-xl font-semibold">{{ apyFormatted || '—' }}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent class="p-4 lg:p-5 text-center">
            <p class="text-xs text-muted-foreground mb-1">Profit</p>
            <Skeleton v-if="loadingPositions" class="h-6 w-20 mx-auto" />
            <p
              v-else
              class="text-lg lg:text-xl font-semibold"
              :class="profitPositive ? 'text-primary' : 'text-red-500'"
            >
              {{ profitFormatted || '—' }}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent class="p-4 lg:p-5 text-center">
            <p class="text-xs text-muted-foreground mb-1">Strategy</p>
            <p class="text-lg lg:text-xl font-semibold">
              {{ STRATEGY_LABELS[pocket.strategy_key] || pocket.strategy_key }}
            </p>
            <p class="text-xs" :class="RISK_LABELS[pocket.strategy_key]?.color">
              {{ RISK_LABELS[pocket.strategy_key]?.label }}
            </p>
          </CardContent>
        </Card>
      </div>

      <!-- Two-column layout on desktop -->
      <div class="flex flex-col lg:grid lg:grid-cols-5 lg:gap-6">
        <!-- Left column: Analytics -->
        <div class="contents lg:flex lg:flex-col lg:col-span-3">
          <!-- Confidence Indicators -->
          <Card class="mb-6 order-4 lg:order-1">
            <CardContent class="p-5">
              <h3 class="text-sm font-semibold mb-3" data-tour="pocket-confidence">Vault Confidence</h3>
              <div class="grid grid-cols-2 gap-3">
                <div class="flex items-center gap-2.5 p-3 rounded-xl bg-muted/50">
                  <div class="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon name="lucide:vault" class="w-4 h-4 text-primary" />
                  </div>
                  <div class="min-w-0">
                    <p class="text-[11px] text-muted-foreground">TVL</p>
                    <Skeleton v-if="loadingPositions" class="h-4 w-14 mt-0.5" />
                    <p v-else class="text-sm font-semibold truncate">{{ formatTvl(tvlUsd) }}</p>
                  </div>
                </div>
                <div class="flex items-center gap-2.5 p-3 rounded-xl bg-muted/50">
                  <div class="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                    <Icon name="lucide:activity" class="w-4 h-4 text-blue-500" />
                  </div>
                  <div class="min-w-0">
                    <p class="text-[11px] text-muted-foreground">APY Stability</p>
                    <Skeleton v-if="loadingPositions" class="h-4 w-14 mt-0.5" />
                    <p
                      v-else
                      class="text-sm font-semibold"
                      :class="apyStability === 'Stable' ? 'text-primary' : apyStability === 'Volatile' ? 'text-amber-500' : ''"
                    >
                      {{ apyStability || '—' }}
                    </p>
                  </div>
                </div>
                <div class="flex items-center gap-2.5 p-3 rounded-xl bg-muted/50">
                  <div class="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                    <Icon name="lucide:link" class="w-4 h-4 text-violet-500" />
                  </div>
                  <div>
                    <p class="text-[11px] text-muted-foreground">Chain</p>
                    <p class="text-sm font-semibold">Base</p>
                  </div>
                </div>
                <div class="flex items-center gap-2.5 p-3 rounded-xl bg-muted/50">
                  <div class="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon name="lucide:shield-check" class="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p class="text-[11px] text-muted-foreground">Contract</p>
                    <p class="text-sm font-semibold text-primary">Verified</p>
                  </div>
                </div>
              </div>

              <!-- Transparency Deep Dive -->
              <button
                class="w-full mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1"
                @click="showVaultDetails = !showVaultDetails"
              >
                {{ showVaultDetails ? 'Hide' : 'View' }} details
                <Icon
                  name="lucide:chevron-down"
                  class="w-3.5 h-3.5 transition-transform"
                  :class="showVaultDetails ? 'rotate-180' : ''"
                />
              </button>

              <div v-if="showVaultDetails && strategy" class="mt-3 pt-3 border-t space-y-2.5">
                <div class="flex items-center justify-between">
                  <span class="text-xs text-muted-foreground">Vault address</span>
                  <button
                    class="text-xs font-mono text-foreground hover:text-primary transition-colors flex items-center gap-1"
                    @click.stop="copyAddress(strategy.vaultAddress)"
                  >
                    {{ truncateAddr(strategy.vaultAddress) }}
                    <Icon :name="copiedAddress ? 'lucide:check' : 'lucide:copy'" class="w-3 h-3" />
                  </button>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-xs text-muted-foreground">Asset address</span>
                  <span class="text-xs font-mono text-foreground">{{ truncateAddr(strategy.assetAddress) }}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-xs text-muted-foreground">Standard</span>
                  <Badge variant="outline" class="text-[10px] h-5">ERC-4626</Badge>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-xs text-muted-foreground">Protocol</span>
                  <span class="text-xs font-medium">Managed strategy rails</span>
                </div>
                <a
                  :href="`https://basescan.org/address/${strategy.vaultAddress}`"
                  target="_blank"
                  rel="noopener"
                  class="flex items-center justify-center gap-1.5 text-xs text-primary hover:underline pt-1"
                >
                  View on Basescan
                  <Icon name="lucide:external-link" class="w-3 h-3" />
                </a>
              </div>
            </CardContent>
          </Card>

          <!-- Smart Insight Engine -->
          <Card v-if="!loadingPositions && insights.length > 0" class="mb-6 order-8 lg:order-5">
            <CardContent class="p-5">
              <div class="flex items-center gap-2 mb-3">
                <Icon name="lucide:lightbulb" class="w-4 h-4 text-amber-500" />
                <h3 class="text-sm font-semibold">Insights</h3>
              </div>
              <div class="space-y-2.5">
                <div
                  v-for="(insight, i) in insights"
                  :key="i"
                  class="flex items-start gap-2.5 p-3 rounded-xl bg-muted/50"
                >
                  <Icon :name="insight.icon" class="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  <p class="text-sm text-foreground/90 leading-relaxed">{{ insight.text }}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <!-- Earnings Breakdown -->
          <Card v-if="!loadingPositions && !loadingHistory && assetValue > 0" class="mb-6 order-2 lg:order-2" data-tour="pocket-earnings">
            <CardContent class="p-5">
              <h3 class="text-sm font-semibold mb-3">Earnings Breakdown</h3>
              <div class="space-y-3">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <div class="w-2 h-2 rounded-full bg-muted-foreground" />
                    <p class="text-sm text-muted-foreground">Principal deposited</p>
                  </div>
                  <div class="text-right">
                    <p class="text-sm font-medium font-mono">{{ principal.toLocaleString('en-US', { maximumFractionDigits: 6 }) }} {{ strategy?.assetSymbol }}</p>
                    <p class="text-[11px] text-muted-foreground">{{ displayUsd(principal * assetPrice) }}</p>
                  </div>
                </div>
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <div class="w-2 h-2 rounded-full bg-primary" />
                    <p class="text-sm text-muted-foreground">Yield earned</p>
                  </div>
                  <div class="text-right">
                    <p class="text-sm font-medium font-mono text-primary">+{{ yieldEarned.toLocaleString('en-US', { maximumFractionDigits: 6 }) }} {{ strategy?.assetSymbol }}</p>
                    <p class="text-[11px] text-muted-foreground">{{ displayUsd(yieldEarned * assetPrice) }}</p>
                  </div>
                </div>
                <div class="h-px bg-border" />
                <div class="flex items-center justify-between">
                  <p class="text-sm text-muted-foreground">Yield contribution</p>
                  <p class="text-sm font-semibold">{{ yieldPercentContribution.toFixed(1) }}%</p>
                </div>
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-1.5">
                    <Icon name="lucide:trending-up" class="w-3.5 h-3.5 text-muted-foreground" />
                    <p class="text-sm text-muted-foreground">Est. 1-year value</p>
                  </div>
                  <p class="text-sm font-semibold">{{ displayUsd(estimatedOneYearValue * assetPrice) }}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <!-- Why This Strategy? -->
          <Card v-if="strategy" class="mb-6 order-6 lg:order-6">
            <CardContent class="p-5">
              <h3 class="text-sm font-semibold mb-3">Why {{ strategy.label }}?</h3>
              <p class="text-xs text-muted-foreground leading-relaxed mb-3">{{ strategy.historicalContext }}</p>
              <div class="space-y-2.5">
                <div class="flex items-start gap-2.5 p-3 rounded-xl bg-primary/5">
                  <Icon name="lucide:check-circle" class="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p class="text-xs font-medium text-primary mb-0.5">Best for</p>
                    <p class="text-xs text-muted-foreground">{{ strategy.bestFor }}</p>
                  </div>
                </div>
                <div class="flex items-start gap-2.5 p-3 rounded-xl bg-muted/50">
                  <Icon name="lucide:alert-circle" class="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <p class="text-xs font-medium mb-0.5">Not ideal for</p>
                    <p class="text-xs text-muted-foreground">{{ strategy.notIdealFor }}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <!-- Strategy Switch Simulation -->
          <Card v-if="!loadingPositions && usdValue > 0 && strategySimulations.length > 0" class="mb-6 order-7 lg:order-4">
            <CardContent class="p-5">
              <h3 class="text-sm font-semibold mb-1">What if I switched?</h3>
              <p class="text-xs text-muted-foreground mb-3">Projected value after 1 year with {{ displayUsd(usdValue) }} invested</p>
              <div class="grid grid-cols-2 gap-3">
                <div
                  v-for="sim in strategySimulations"
                  :key="sim.strategy.key"
                  class="p-4 rounded-xl border bg-card"
                >
                  <div class="flex items-center gap-2 mb-2">
                    <div
                      class="w-7 h-7 rounded-lg flex items-center justify-center"
                      :class="{
                        'bg-emerald-500/10': sim.strategy.key === 'conservative',
                        'bg-blue-500/10': sim.strategy.key === 'balanced',
                        'bg-violet-500/10': sim.strategy.key === 'aggressive',
                      }"
                    >
                      <Icon
                        :name="sim.strategy.icon"
                        class="w-3.5 h-3.5"
                        :class="{
                          'text-emerald-500': sim.strategy.key === 'conservative',
                          'text-blue-500': sim.strategy.key === 'balanced',
                          'text-violet-500': sim.strategy.key === 'aggressive',
                        }"
                      />
                    </div>
                    <div>
                      <p class="text-xs font-medium">{{ sim.strategy.label }}</p>
                      <p class="text-[11px] text-muted-foreground">{{ sim.apy.toFixed(2) }}% APY</p>
                    </div>
                  </div>
                  <p class="text-base font-bold">{{ displayUsd(sim.projectedUsd) }}</p>
                  <p
                    class="text-xs font-medium"
                    :class="sim.diffUsd >= 0 ? 'text-primary' : 'text-red-500'"
                  >
                    {{ sim.diffUsd >= 0 ? '+' : '' }}{{ displayUsd(Math.abs(sim.diffUsd)) }}
                    {{ sim.diffUsd >= 0 ? 'more' : 'less' }}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <!-- Risk Simulation Mode -->
          <Card v-if="!loadingPositions && usdValue > 0" class="mb-6 order-5 lg:order-3">
            <CardContent class="p-5">
              <div class="flex items-center justify-between mb-3">
                <h3 class="text-sm font-semibold">Stress Test</h3>
                <label class="flex items-center gap-2 cursor-pointer">
                  <span class="text-xs text-muted-foreground">Simulate -20% crash</span>
                  <button
                    class="relative w-9 h-5 rounded-full transition-colors"
                    :class="simulateDownturn ? 'bg-primary' : 'bg-muted'"
                    @click="simulateDownturn = !simulateDownturn"
                  >
                    <span
                      class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform"
                      :class="simulateDownturn ? 'translate-x-4' : ''"
                    />
                  </button>
                </label>
              </div>

              <div v-if="simulateDownturn" class="space-y-2">
                <div
                  v-for="scenario in downturnScenarios"
                  :key="scenario.strategy.key"
                  class="flex items-center justify-between p-3 rounded-xl border"
                  :class="scenario.isCurrent ? 'border-primary/40 bg-primary/5' : 'bg-card'"
                >
                  <div class="flex items-center gap-2">
                    <Icon
                      :name="scenario.strategy.icon"
                      class="w-4 h-4"
                      :class="{
                        'text-emerald-500': scenario.strategy.key === 'conservative',
                        'text-blue-500': scenario.strategy.key === 'balanced',
                        'text-violet-500': scenario.strategy.key === 'aggressive',
                      }"
                    />
                    <div>
                      <p class="text-xs font-medium">
                        {{ scenario.strategy.label }}
                        <span v-if="scenario.isCurrent" class="text-primary">(yours)</span>
                      </p>
                      <p class="text-[11px] text-muted-foreground">{{ scenario.drop }}% impact</p>
                    </div>
                  </div>
                  <div class="text-right">
                    <p class="text-sm font-semibold">{{ displayUsd(scenario.simulatedValue) }}</p>
                    <p class="text-[11px] text-red-500">{{ displayUsd(scenario.simulatedValue - usdValue) }}</p>
                  </div>
                </div>
              </div>
              <p v-else class="text-xs text-muted-foreground">
                Toggle above to see how your investment would perform in a market downturn.
              </p>
            </CardContent>
          </Card>
        </div>

        <!-- Right column: Goal + History -->
        <div class="contents lg:block lg:col-span-2">
          <!-- Goal: Circular Progress Ring -->
          <Card v-if="pocket.target_amount || pocket.timeline" class="mb-6 order-1 lg:order-0" data-tour="pocket-goal">
            <CardContent class="p-5">
              <div class="flex items-center justify-between mb-3">
                <div>
                  <p class="text-sm font-medium">Goal</p>
                  <Skeleton v-if="loadingPositions && pocket.target_amount" class="h-3.5 w-28 mt-0.5" />
                  <p v-else-if="pocket.target_amount" class="text-xs text-muted-foreground">
                    {{ displayUsd(usdValue) }} of {{ displayUsd(pocket.target_amount) }}
                  </p>
                </div>
                <Badge
                  v-if="goalStatus && !loadingPositions"
                  variant="outline"
                  class="text-xs"
                  :class="[goalStatus.color, goalStatus.bg]"
                >
                  {{ goalStatus.label }}
                </Badge>
              </div>
              <div v-if="pocket.target_amount" class="flex flex-col items-center gap-4">
                <!-- SVG Ring -->
                <div class="relative">
                  <svg width="120" height="120" viewBox="0 0 100 100">
                    <circle
                      cx="50" cy="50" r="42"
                      fill="none"
                      stroke="currentColor"
                      class="text-muted"
                      stroke-width="6"
                    />
                    <circle
                      v-if="!loadingPositions"
                      cx="50" cy="50" r="42"
                      fill="none"
                      stroke-width="6"
                      stroke-linecap="round"
                      class="transition-all duration-700"
                      :class="{
                        'stroke-emerald-500': pocket.strategy_key === 'conservative',
                        'stroke-blue-500': pocket.strategy_key === 'balanced',
                        'stroke-violet-500': pocket.strategy_key === 'aggressive',
                      }"
                      :stroke-dasharray="CIRCUMFERENCE"
                      :stroke-dashoffset="CIRCUMFERENCE - (CIRCUMFERENCE * progressRaw / 100)"
                      transform="rotate(-90 50 50)"
                    />
                  </svg>
                  <div class="absolute inset-0 flex items-center justify-center">
                    <Skeleton v-if="loadingPositions" class="h-5 w-10" />
                    <span v-else class="text-xl font-bold">{{ progress }}%</span>
                  </div>
                </div>
                <!-- Details -->
                <div class="w-full space-y-1.5">
                  <div class="flex justify-between text-sm">
                    <span class="text-muted-foreground">Saved</span>
                    <Skeleton v-if="loadingPositions" class="h-4 w-16" />
                    <span v-else class="font-medium">{{ displayUsd(usdValue) }}</span>
                  </div>
                  <div class="flex justify-between text-sm">
                    <span class="text-muted-foreground">Target</span>
                    <span class="font-medium">{{ displayUsd(pocket.target_amount) }}</span>
                  </div>
                  <div class="flex justify-between text-sm">
                    <span class="text-muted-foreground">Remaining</span>
                    <Skeleton v-if="loadingPositions" class="h-4 w-16" />
                    <span v-else class="font-medium">{{ displayUsd(Math.max(pocket.target_amount - usdValue, 0)) }}</span>
                  </div>
                </div>
              </div>
              <div v-if="timelineDisplay" class="mt-3 pt-3 border-t flex items-center justify-between">
                <p class="text-xs text-muted-foreground">Timeline</p>
                <div class="text-right">
                  <p class="text-xs font-medium">{{ timelineDisplay.date }}</p>
                  <p
                    class="text-[11px]"
                    :class="timelineDisplay.overdue ? 'text-red-500' : 'text-muted-foreground'"
                  >
                    {{ timelineDisplay.remaining }}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <!-- Future Projection Timeline -->
          <Card v-if="!loadingPositions && projections.length > 0 && usdValue > 0" class="mb-6 order-3 lg:order-none">
            <CardContent class="p-5">
              <h3 class="text-sm font-semibold mb-3">Projection</h3>
              <div class="relative pl-4">
                <div class="absolute left-1.75 top-1 bottom-1 w-px bg-border" />
                <div
                  v-for="(p, i) in projections"
                  :key="p.year"
                  class="relative pb-2 last:pb-0"
                >
                  <div
                    class="absolute -left-3.25 top-1 w-3 h-3 rounded-full border-2"
                    :class="p.reachesTarget
                      ? 'bg-primary border-primary'
                      : 'bg-background border-muted-foreground/30'"
                  />
                  <div class="flex items-center justify-between">
                    <div>
                      <p class="text-sm font-medium">{{ p.year }}</p>
                      <p class="text-[11px] text-muted-foreground">Year {{ i + 1 }}</p>
                    </div>
                    <div class="text-right">
                      <p class="text-sm font-semibold">{{ displayUsd(p.value) }}</p>
                      <Badge
                        v-if="p.reachesTarget"
                        variant="outline"
                        class="text-[10px] h-4 border-primary/30 text-primary"
                      >
                        Target reached
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
              <p class="text-[11px] text-muted-foreground mt-3">Based on current APY. Actual returns may vary.</p>
            </CardContent>
          </Card>

          <!-- Transaction history -->
          <div class="mb-6 order-9 lg:order-none" data-tour="pocket-history">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-semibold">Transaction History</h3>
              <div v-if="history.length > 0" class="flex items-center gap-1" data-tour="pocket-export">
                <Button variant="ghost" size="sm" class="h-7 text-xs gap-1 no-print" @click="exportTaxCSV">
                  <Icon name="lucide:file-spreadsheet" class="w-3 h-3" />
                  Tax
                </Button>
                <Button variant="ghost" size="sm" class="h-7 text-xs gap-1 no-print" @click="exportCSV">
                  <Icon name="lucide:download" class="w-3 h-3" />
                  CSV
                </Button>
                <Button variant="ghost" size="sm" class="h-7 text-xs gap-1 no-print" :disabled="exportingPDF" @click="exportPDF">
                  <Icon v-if="exportingPDF" name="lucide:loader-2" class="w-3 h-3 animate-spin" />
                  <Icon v-else name="lucide:file-text" class="w-3 h-3" />
                  PDF
                </Button>
              </div>
            </div>

            <div v-if="loadingHistory" class="space-y-2">
              <div v-for="i in 3" :key="i" class="flex items-center gap-3 p-4">
                <Skeleton class="w-9 h-9 rounded-lg shrink-0" />
                <div class="flex-1">
                  <Skeleton class="h-4 w-20 mb-1.5" />
                  <Skeleton class="h-3 w-32" />
                </div>
                <div class="text-right">
                  <Skeleton class="h-4 w-24 mb-1.5 ml-auto" />
                  <Skeleton class="h-3 w-14 ml-auto" />
                </div>
              </div>
            </div>

            <div v-else-if="history.length === 0" class="text-center py-8">
              <p class="text-sm text-muted-foreground">No transactions yet</p>
            </div>

            <div v-else class="space-y-2">
              <Card v-for="(tx, i) in history" :key="i">
                <CardContent class="p-4 flex items-center gap-3">
                  <div
                    class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    :class="{
                      'bg-primary/10': tx.type === 'deposit',
                      'bg-blue-500/10': tx.type === 'switch',
                      'bg-orange-500/10': tx.type !== 'deposit' && tx.type !== 'switch',
                    }"
                  >
                    <Icon
                      :name="TX_TYPE_CONFIG[tx.type]?.icon || 'lucide:circle'"
                      class="w-4 h-4"
                      :class="TX_TYPE_CONFIG[tx.type]?.color"
                    />
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium">{{ TX_TYPE_CONFIG[tx.type]?.label || tx.type }}</p>
                    <p class="text-xs text-muted-foreground">{{ formatTxDate(tx.timestamp) }}</p>
                  </div>
                  <div class="text-right shrink-0">
                    <p class="text-sm font-medium font-mono">
                      <template v-if="tx.type === 'switch'">{{ tx.amount }}</template>
                      <template v-else>{{ tx.type === 'deposit' ? '+' : '-' }}{{ tx.amount }} {{ tx.assetSymbol || strategy?.assetSymbol }}</template>
                    </p>
                    <a
                      :href="`https://basescan.org/tx/${tx.txHash}`"
                      target="_blank"
                      class="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      @click.stop
                    >
                      View tx
                      <Icon name="lucide:external-link" class="w-3 h-3 inline ml-0.5" />
                    </a>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <!-- Psychological Layer -->
          <div v-if="!loadingPositions && assetValue > 0" class="flex items-start gap-2 px-1 mb-6 order-10 lg:order-none">
            <Icon name="lucide:sparkles" class="w-3.5 h-3.5 text-muted-foreground/60 shrink-0 mt-0.5" />
            <p class="text-xs text-muted-foreground/80 italic leading-relaxed">{{ motivation }}</p>
          </div>
        </div>
      </div>

      <!-- Trust footer -->
      <div class="mt-8 pt-6 border-t border-border/50">
        <div class="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground/60">
          <span class="flex items-center gap-1.5">
            <Icon name="lucide:shield-check" class="w-3.5 h-3.5" />
            Funds remain in your wallet
          </span>
          <span class="flex items-center gap-1.5">
            <Icon name="lucide:link" class="w-3.5 h-3.5" />
            Powered by curated onchain earning rails
          </span>
          <span class="flex items-center gap-1.5">
            <Icon name="lucide:activity" class="w-3.5 h-3.5" />
            Returns are variable
          </span>
        </div>
      </div>
    </main>

    <!-- Edit Dialog -->
    <AppEditPocketDialog
      v-if="pocket"
      v-model:open="showEditDialog"
      :pocket="pocket"
      @saved="handleSaved"
    />

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
              :asset-symbol="strategy?.assetSymbol ?? ''"
              :current-value-usd="displayUsd(usdValue)"
              :profit-formatted="profitFormatted"
              :profit-positive="profitPositive"
              :apy-formatted="apyFormatted"
            />
          </div>

          <div class="flex gap-3">
            <Button @click="downloadShareCard" :disabled="generatingImage">
              <Icon name="lucide:download" class="w-4 h-4 mr-2" />
              {{ generatingImage ? 'Generating...' : 'Save' }}
            </Button>
            <Button variant="outline" @click="nativeShare">
              <Icon name="lucide:share-2" class="w-4 h-4 mr-2" />
              Share
            </Button>
            <DialogClose as-child>
              <Button variant="ghost">Close</Button>
            </DialogClose>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>
