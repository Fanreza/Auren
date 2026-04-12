<script setup lang="ts">
import { parseUnits, formatUnits } from 'viem'
import { STRATEGIES, STRATEGY_LIST, type StrategyKey } from '~/config/strategies'
import type { DbPocket } from '~/types/database'
import { BRAND } from '~/config/brand'
import { usePrivyAuth } from '~/composables/usePrivy'
import { useVault } from '~/composables/useVault'
import { useCoinGecko } from '~/composables/useCoinGecko'
import { useWalletTokens } from '~/composables/useWalletTokens'
import { useTransactionRecorder } from '~/composables/useTransactionRecorder'
import { useDashboardStats } from '~/composables/useDashboardStats'
import { useAchievements } from '~/composables/useAchievements'
import { useStreak } from '~/composables/useStreak'
import { useTour } from '~/composables/useTour'
import { useApyDriftAlert } from '~/composables/useApyDriftAlert'
import { useNotifications } from '~/composables/useNotifications'
import { storeToRefs } from 'pinia'
import { useProfileStore } from '~/stores/useProfileStore'
import { toast } from 'vue-sonner'

// ---- Wallet ----
const { isConnected, address, isReady, logout } = usePrivyAuth()

async function handleLogout() {
  await logout()
  navigateTo('/')
}

const showFundDialog = ref(false)

const showConnectModal = ref(false)

// ---- Profile Store ----
const profileStore = useProfileStore()
const {
  currentUser, pockets, loading: loadingPockets,
  pocketPositions, loadingPositions,
  totalPortfolioFormatted, lifiVaultAddresses,
} = storeToRefs(profileStore)

const profileDisplayName = computed(() =>
  address.value ? profileStore.displayName(address.value) : '',
)
const pocketCount = computed(() => pockets.value.length)

// ---- Dashboard stats (declared early so refetchAll can reference fetchAllTransactions) ----
const {
  allTransactions,
  loadingTx,
  fetchAllTransactions,
  totalValueUsd: dashTotalValueUsd,
  netContributedUsd,
  unrealizedPnlUsd,
  pnlPercent,
  avgApy: dashAvgApy,
  projectedAnnualUsd,
  allocation,
  chartSeries,
} = useDashboardStats()

// ---- Vault ----
const { txState, txHash, txError, deposit: directDeposit, lifiDeposit, reset } = useVault()
const { getTokenPrices } = useCoinGecko()

// ---- Wallet tokens (direct RPC, no Enso) ----
const { walletTokens, loadingTokens, fetchWalletTokens } = useWalletTokens(
  address, null, getTokenPrices,
)

// ---- Pocket actions ----
// "Add" on pocket → open create dialog at step 3 with strategy pre-selected
const depositPocketKey = ref<StrategyKey | null>(null)
// "Explore strategy" card → open create dialog at step 1 with strategy pre-filled
const newPocketStrategy = ref<StrategyKey | null>(null)

function handleExploreStrategy(key: StrategyKey) {
  // Only 1 pocket per strategy for now — multi-vault per strategy is still WIP.
  // If the user already has a pocket for this strategy, block creation and show why.
  const existing = pockets.value.find(p => p.strategy_key === key)
  if (existing) {
    toast.info('Multi-vault per strategy is still in development. You already have a pocket for this strategy — use its "Add" button to deposit more.')
    return
  }
  depositPocketKey.value = null
  newPocketStrategy.value = key
  showCreateDialog.value = true
}

// Set of strategy keys user has already created a pocket for
const usedStrategyKeys = computed(() => {
  const set = new Set<StrategyKey>()
  for (const p of pockets.value) set.add(p.strategy_key as StrategyKey)
  return set
})

function handleNewPocketClick() {
  if (usedStrategyKeys.value.size >= STRATEGY_LIST.length) {
    toast.info('You already have a pocket for every strategy. Multi-vault per strategy is still in development.')
    return
  }
  depositPocketKey.value = null
  newPocketStrategy.value = null
  showCreateDialog.value = true
}

// TVL formatter ($12M, $340K, etc)
function formatTvl(raw: string | null): string {
  if (!raw) return '—'
  const n = parseFloat(raw)
  if (isNaN(n) || n <= 0) return '—'
  if (n >= 1_000_000_000) return '$' + (n / 1_000_000_000).toFixed(1) + 'B'
  if (n >= 1_000_000)     return '$' + (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)         return '$' + (n / 1_000).toFixed(0) + 'K'
  return '$' + n.toFixed(0)
}

function handlePocketDeposit(pocket: DbPocket) {
  depositPocketKey.value = pocket.strategy_key as StrategyKey
  showCreateDialog.value = true
}

// "Withdraw" on pocket → open withdraw dialog
const fundDefaultTab = ref<'transfer' | 'buy' | 'withdraw'>('transfer')
const showWithdrawDialog = ref(false)
const withdrawPocket = ref<DbPocket | null>(null)

function handlePocketWithdraw(pocket: DbPocket) {
  withdrawPocket.value = pocket
  showWithdrawDialog.value = true
}

// Central refetch — call after ANY action (deposit, withdraw, fund, etc.)
async function refetchAll() {
  await fetchWalletTokens()
  if (address.value) await profileStore.fetchAllPositions(address.value)
  await profileStore.refreshPockets()
  await fetchAllTransactions()
}

// Funded event handler — RPC state can be stale for a few seconds after a tx confirms,
// and cross-chain bridges may take 10-60s to deliver. Poll a few times to catch the new balance.
async function handleFunded() {
  await refetchAll()                                  // immediate
  setTimeout(() => { refetchAll() }, 3000)            // ~RPC cache window
  setTimeout(() => { refetchAll() }, 10_000)          // bridge delivery window
  setTimeout(() => { refetchAll() }, 30_000)          // slow bridge fallback
}


// Track for transaction recorder
const selectedPocket = ref<DbPocket | null>(null)
const lastTxType = ref<string | null>(null)
const lastTxAmount = ref<string | null>(null)
const showDepositDialog = ref(false)

const selectedStrategy = computed(() =>
  selectedPocket.value ? STRATEGIES[selectedPocket.value.strategy_key as StrategyKey] : null,
)

// ---- Transaction recording ----
useTransactionRecorder({
  txState, txHash, reset,
  selectedPocket, selectedStrategy,
  lastTxType, lastTxAmount, showDepositDialog,
  address, fetchBalances: refetchAll, fetchWalletTokens: refetchAll,
  fetchAllPositions: async () => { await refetchAll() },
  refreshPockets: async () => { await refetchAll() },
})

// ---- Create pocket ----
const showCreateDialog = ref(false)
const creatingPocket = ref(false)

// Refetch when any dialog closes
watch(showWithdrawDialog, (v) => { if (!v) refetchAll() })
watch(showCreateDialog, (v) => { if (!v) { depositPocketKey.value = null; refetchAll() } })

interface PocketVaultPayload {
  vault_address: string
  vault_chain_id: number
  vault_protocol: string
  vault_symbol: string
  vault_asset: string
}

async function handleCreatePocket(payload: {
  name: string
  purpose?: string
  target_amount?: number
  timeline?: string
  strategy_key: StrategyKey
  vault: PocketVaultPayload
}) {
  if (!currentUser.value) return
  creatingPocket.value = true
  try {
    const pocket = await profileStore.createPocket({
      user_id: currentUser.value.id,
      name: payload.name,
      purpose: payload.purpose,
      target_amount: payload.target_amount,
      timeline: payload.timeline,
      strategy_key: payload.strategy_key,
      vault_address: payload.vault.vault_address,
      vault_chain_id: payload.vault.vault_chain_id,
      vault_protocol: payload.vault.vault_protocol,
      vault_symbol: payload.vault.vault_symbol,
      vault_asset: payload.vault.vault_asset,
    })
    if (pocket) {
      showCreateDialog.value = false
      await refetchAll()
    }
  } catch (e: any) {
    toast.error(e?.data?.message ?? e?.message ?? 'Failed to create pocket')
  } finally {
    creatingPocket.value = false
  }
}

async function handleCreateAndDeposit(payload: {
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
    quote?: any
  }>
}) {
  if (!currentUser.value) return
  creatingPocket.value = true
  try {
    // If depositing to existing pocket (via "Add" button), skip creation
    let pocket: DbPocket | null = null
    if (depositPocketKey.value) {
      pocket = pockets.value.find(p => p.strategy_key === depositPocketKey.value) ?? null
    }
    if (!pocket) {
      pocket = await profileStore.createPocket({
        user_id: currentUser.value.id,
        name: payload.name,
        purpose: payload.purpose,
        target_amount: payload.target_amount,
        timeline: payload.timeline,
        strategy_key: payload.strategy_key,
        vault_address: payload.vault.vault_address,
        vault_chain_id: payload.vault.vault_chain_id,
        vault_protocol: payload.vault.vault_protocol,
        vault_symbol: payload.vault.vault_symbol,
        vault_asset: payload.vault.vault_asset,
      })
    }
    if (!pocket) {
      creatingPocket.value = false
      toast.error('Failed to create pocket')
      return
    }

    selectedPocket.value = pocket
    lastTxType.value = 'deposit'
    lastTxAmount.value = payload.totalAmount

    // Execute each allocation's deposit sequentially via LI.FI Composer
    const strategy = STRATEGIES[payload.strategy_key]
    for (const alloc of payload.allocations) {
      reset()
      const amtFixed = Number(alloc.amount).toFixed(payload.fromTokenDecimals)
      const amtWei = parseUnits(amtFixed, payload.fromTokenDecimals).toString()

      // Always fetch fresh quote at execute time — cached quotes go stale
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

    // Release the dialog immediately so success state renders while refetch runs in background
    creatingPocket.value = false
    await refetchAll()
  } catch (e) {
    creatingPocket.value = false
    throw e
  }
}

// ---- Schedule dialog ----
const showScheduleDialog = ref(false)
const schedulePocket = ref<DbPocket | null>(null)
const savingSchedule = ref(false)

function openScheduleDialog(pocket: DbPocket) {
  schedulePocket.value = pocket
  showScheduleDialog.value = true
}

async function handleSaveSchedule(payload: { recurring_day: number; recurring_amount: string; recurring_next_due: string }) {
  if (!schedulePocket.value) return
  savingSchedule.value = true
  try {
    await profileStore.updatePocket(schedulePocket.value.id, payload)
    await profileStore.refreshPockets()
    showScheduleDialog.value = false
    toast.success('Deposit reminder set!')
  } finally {
    savingSchedule.value = false
  }
}

async function handleRemoveSchedule() {
  if (!schedulePocket.value) return
  savingSchedule.value = true
  try {
    await profileStore.updatePocket(schedulePocket.value.id, {
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

// ---- Delete pocket ----
const deleteDialogRef = ref<InstanceType<typeof import('~/components/app/DeletePocketDialog.vue').default> | null>(null)
const showDeleteConfirm = ref(false)

async function handlePocketDeleted(id: string) {
  const ok = await profileStore.deletePocket(id)
  if (ok && selectedPocket.value?.id === id) {
    selectedPocket.value = null
    showDepositDialog.value = false
  }
}

// ---- Wallet available balance ----
const vaultAddresses = new Set(
  Object.values(STRATEGIES).map(s => s.vaultAddress.toLowerCase()),
)
const totalWalletUsd = computed(() =>
  walletTokens.value
    .filter(t => !vaultAddresses.has(t.token.toLowerCase()))
    .reduce((sum, t) => sum + t.usdValue, 0),
)
const totalWalletFormatted = computed(() =>
  totalWalletUsd.value.toLocaleString('en-US', { style: 'currency', currency: 'USD' }),
)

// Refetch wallet tokens when address changes (EOA → smart account)
// Only fetch once smart account is ready (skip EOA intermediate state)
const { smartAccountAddress } = usePrivyAuth()
watch([() => address.value, () => smartAccountAddress.value], ([addr, smart]) => {
  // Wait for smart account init — if smart is set, addr = smart account (correct)
  // If smart is undefined but addr exists, we're still in EOA phase — skip
  if (addr && smart) fetchWalletTokens()
  else if (addr && !smart) {
    // No smart account support (fallback) — fetch with whatever address we have
    // Delay slightly to allow initSmartAccount to complete
    setTimeout(() => {
      if (!smartAccountAddress.value && address.value) fetchWalletTokens()
    }, 3000)
  }
}, { immediate: true })

// ---- Loading tips ----
const tips = [
  'Your funds stay in your wallet — always.',
  'Yield starts accruing the moment you deposit.',
  'You can withdraw anytime, no lock-ups.',
  'Base fees are usually less than $0.01.',
  'Create multiple pockets for different goals.',
  'Switch strategies anytime in one tap.',
  'Deposit any token — we handle the swap.',
  'Set reminders to keep your savings on track.',
  'Rewards may appear as bonus incentives on selected strategies.',
  `${BRAND.name} never asks for your seed phrase.`,
]
const loadingTip = tips[Math.floor(Math.random() * tips.length)]

// ---- Helpers ----
// ---- Yield comparison data ----
const totalPortfolioUsd = computed(() => {
  let total = 0
  for (const pocket of pockets.value) {
    const pos = pocketPositions.value[pocket.id]
    if (!pos || pos.value === 0n) continue
    const strategy = STRATEGIES[pocket.strategy_key as StrategyKey]
    if (!strategy) continue
    const val = parseFloat(formatUnits(pos.value, strategy.decimals))
    total += val * profileStore.getAssetPrice(pocket.strategy_key)
  }
  return total
})

// Auto-fetch tx history when pockets load or positions change
watch([pockets, pocketPositions], async () => {
  if (pockets.value.length) await fetchAllTransactions()
}, { immediate: true, deep: true })

// ---- First-time user tour ----
const { showDashboardTour } = useTour()
watch(isConnected, (connected) => {
  if (connected) {
    // Run after pockets/UI render
    setTimeout(() => showDashboardTour(), 1500)
  }
}, { immediate: true })

// ---- Daily APY drift check ----
const { runCheck: runApyDriftCheck } = useApyDriftAlert()
watch(pockets, (list) => {
  if (list.length) setTimeout(() => runApyDriftCheck(), 3000)
}, { immediate: true })

// ---- Reminder notifications ----
// Fires browser notifications for pockets with reminders due today/tomorrow.
const { fire: fireNotification } = useNotifications()
watch(pockets, (list) => {
  if (!list.length) return
  setTimeout(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    for (const p of list) {
      if (!p.recurring_next_due) continue
      const due = new Date(p.recurring_next_due + 'T00:00:00')
      const days = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      if (days === 0) {
        fireNotification({
          title: `${p.name} reminder due today`,
          body: p.recurring_amount ? `Time to add $${p.recurring_amount} to your savings goal` : 'Time to make your scheduled deposit',
          tag: `reminder-${p.id}-due`,
          url: `/pocket/${p.id}`,
        })
      } else if (days === 1) {
        fireNotification({
          title: `${p.name} reminder tomorrow`,
          body: 'Heads up — your scheduled deposit is due tomorrow',
          tag: `reminder-${p.id}-tomorrow`,
          url: `/pocket/${p.id}`,
        })
      }
    }
  }, 5000)
}, { immediate: true })

// ---- Achievements ----
const streak = useStreak()
const achievements = useAchievements(() => ({
  totalSavedUsd: dashTotalValueUsd.value,
  yieldEarnedUsd: unrealizedPnlUsd.value,
  streakDays: streak.current.value,
  pocketCount: pockets.value.length,
  uniqueStrategies: new Set(pockets.value.map(p => p.strategy_key)).size,
  hasGoal: pockets.value.some(p => !!p.target_amount),
  hasReminder: pockets.value.some(p => p.recurring_day != null),
  depositCount: allTransactions.value.filter(t => t.type === 'deposit').length,
}))

const averageApy = computed(() => {
  const apys: number[] = []
  for (const pocket of pockets.value) {
    const apy = profileStore.getStrategyApy(pocket.strategy_key)
    if (apy) apys.push(parseFloat(apy))
  }
  if (apys.length === 0) return 0
  return apys.reduce((a, b) => a + b, 0) / apys.length
})

</script>

<template>
  <div class="min-h-dvh bg-background">

    <!-- Loading splash -->
    <template v-if="!isReady">
      <div class="h-dvh flex flex-col items-center justify-center gap-4">
        <div class="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center ring-1 ring-primary/20">
          <img src="/new.jpeg" :alt="BRAND.name" class="w-8 h-8 rounded-xl" />
        </div>
        <p class="text-xs text-muted-foreground max-w-50 text-center">{{ loadingTip }}</p>
      </div>
    </template>

    <template v-else>
      <AppHeader
        :is-connected="isConnected"
        :is-base="true"
        :display-name="profileDisplayName"
        :address="address"
        @sign-in="showConnectModal = true"
        @go-profile="navigateTo('/profile')"
        @logout="handleLogout"
      />
      <AppTabBar v-if="isConnected" class="mt-3" />

      <!-- Not connected -->
      <AppHero v-if="!isConnected" @connect="showConnectModal = true" />

      <!-- Connected -->
      <main v-else class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-16">
        <div class="lg:grid lg:grid-cols-[320px_1fr] lg:gap-10 lg:items-start">

          <!-- ── LEFT: Portfolio panel ── -->
          <aside class="lg:sticky lg:top-20 pb-6 lg:pb-0">
            <div class="pt-4 lg:pt-8">
              <p class="text-xs text-muted-foreground uppercase tracking-widest mb-3 font-medium">Total saved</p>
              <Skeleton v-if="loadingPositions" class="h-12 w-44 mb-2" />
              <h1 v-else class="text-5xl font-bold tracking-tight tabular-nums leading-none mb-2">
                {{ totalPortfolioFormatted }}
              </h1>
              <p class="text-sm text-muted-foreground">
                {{ pocketCount }} pocket{{ pocketCount !== 1 ? 's' : '' }}
                <template v-if="averageApy > 0">
                  · avg <span class="text-primary font-medium">{{ averageApy.toFixed(1) }}% APY</span>
                </template>
              </p>

              <!-- Action buttons -->
              <div class="flex gap-3 mt-6">
                <Button
                  class="flex-1 h-11 rounded-2xl font-semibold"
                  data-tour="create-pocket"
                  :disabled="usedStrategyKeys.size >= STRATEGY_LIST.length"
                  @click="handleNewPocketClick"
                >
                  <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" />
                  New pocket
                </Button>
                <Button
                  variant="secondary"
                  class="h-11 px-5 rounded-2xl"
                  data-tour="fund-wallet"
                  @click="fundDefaultTab = 'transfer'; showFundDialog = true"
                >
                  <Icon name="lucide:credit-card" class="w-4 h-4 mr-1.5" />
                  Fund
                </Button>
              </div>

              <!-- Wallet balance nudge -->
              <div
                v-if="!loadingTokens && totalWalletUsd > 0.01"
                class="mt-3 flex items-center justify-between text-xs bg-primary/8 rounded-xl px-3 py-2.5 cursor-pointer hover:bg-primary/12 transition-colors"
                @click="fundDefaultTab = 'transfer'; showFundDialog = true"
              >
                <div class="flex items-center gap-2 text-primary">
                  <Icon name="lucide:wallet" class="w-3.5 h-3.5 shrink-0" />
                  <span><span class="font-semibold">{{ totalWalletFormatted }}</span> in your wallet</span>
                </div>
                <Icon name="lucide:arrow-right" class="w-3.5 h-3.5 text-primary/60" />
              </div>

              <!-- Help & Resources — desktop only -->
              <div class="hidden lg:block mt-8 pt-6 border-t border-border/50">
                <p class="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-3">
                  Help &amp; resources
                </p>
                <div class="grid grid-cols-2 gap-1.5">
                  <NuxtLink
                    to="/learn"
                    class="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-muted/30 hover:bg-muted/60 transition-colors text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Icon name="lucide:book-open" class="w-3.5 h-3.5 shrink-0" />
                    <span>Learn</span>
                  </NuxtLink>
                  <NuxtLink
                    to="/risks"
                    class="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-muted/30 hover:bg-muted/60 transition-colors text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Icon name="lucide:triangle-alert" class="w-3.5 h-3.5 shrink-0" />
                    <span>Risks</span>
                  </NuxtLink>
                  <NuxtLink
                    to="/terms"
                    class="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-muted/30 hover:bg-muted/60 transition-colors text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Icon name="lucide:file-text" class="w-3.5 h-3.5 shrink-0" />
                    <span>Terms</span>
                  </NuxtLink>
                  <a
                    :href="BRAND.supportX"
                    target="_blank" rel="noopener"
                    class="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-muted/30 hover:bg-muted/60 transition-colors text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Icon name="lucide:message-circle" class="w-3.5 h-3.5 shrink-0" />
                    <span>Support</span>
                  </a>
                </div>

                <!-- Rotating tip -->
                <div class="mt-4 rounded-lg bg-primary/5 border border-primary/10 p-3">
                  <div class="flex items-start gap-2">
                    <Icon name="lucide:lightbulb" class="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                    <p class="text-[11px] text-muted-foreground leading-relaxed">{{ loadingTip }}</p>
                  </div>
                </div>
              </div>
            </div>
          </aside>

          <!-- ── RIGHT: Pockets ── -->
          <section class="pt-4 lg:pt-8">
            <p class="text-xs text-muted-foreground uppercase tracking-widest mb-4 font-medium">Pockets</p>

            <!-- Loading skeleton -->
            <div v-if="loadingPockets" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div
                v-for="i in 2" :key="i"
                class="rounded-2xl border border-border/60 bg-muted/20 p-5 space-y-4"
              >
                <div class="flex items-start justify-between">
                  <div class="flex items-center gap-3">
                    <Skeleton class="w-9 h-9 rounded-xl" />
                    <div class="space-y-1">
                      <Skeleton class="h-4 w-24" />
                      <Skeleton class="h-3 w-16" />
                    </div>
                  </div>
                  <Skeleton class="h-5 w-16 rounded-full" />
                </div>
                <Skeleton class="h-8 w-32" />
                <Skeleton class="h-3 w-40" />
                <Skeleton class="h-1.5 w-full rounded-full" />
                <div class="flex gap-2 pt-2">
                  <Skeleton class="flex-1 h-9 rounded-xl" />
                  <Skeleton class="flex-1 h-9 rounded-xl" />
                  <Skeleton class="w-9 h-9 rounded-xl" />
                  <Skeleton class="w-9 h-9 rounded-xl" />
                </div>
              </div>
            </div>

            <!-- Empty state -->
            <div
              v-else-if="pockets.length === 0"
              class="rounded-2xl border border-dashed border-border/60 p-12 flex flex-col items-center text-center"
            >
              <div class="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
                <Icon name="lucide:piggy-bank" class="w-7 h-7 text-muted-foreground" />
              </div>
              <p class="font-semibold mb-1">No pockets yet</p>
              <p class="text-sm text-muted-foreground mb-6 max-w-55">
                Create a pocket to start saving toward a goal.
              </p>
              <Button class="rounded-xl" @click="showCreateDialog = true">
                <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" />
                Create first pocket
              </Button>
            </div>

            <!-- Pocket cards: 1 col mobile, 2 col desktop -->
            <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <AppPocketCard
                v-for="pocket in pockets"
                :key="pocket.id"
                :pocket="pocket"
                :position="pocketPositions[pocket.id] || { shares: 0n, value: 0n }"
                :asset-price="profileStore.getAssetPrice(pocket.strategy_key)"
                :apy="profileStore.getStrategyApy(pocket.strategy_key)"
                :loading="loadingPositions"
                @click="navigateTo(`/pocket/${pocket.id}`)"
                @deposit="handlePocketDeposit(pocket)"
                @withdraw="handlePocketWithdraw(pocket)"
                @schedule="openScheduleDialog(pocket)"
                @delete="deleteDialogRef?.requestDelete(pocket)"
              />
            </div>

            <!-- ── Explore strategies ── -->
            <div class="mt-10">
              <div class="flex items-baseline justify-between mb-4 gap-2 flex-wrap">
                <p class="text-xs text-muted-foreground uppercase tracking-widest font-medium">Explore strategies</p>
                <div class="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    class="h-7 text-[11px] text-primary"
                    @click="navigateTo('/strategy')"
                  >
                    <Icon name="lucide:compass" class="w-3 h-3 mr-1" />
                    Explore marketplace
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="h-7 text-[11px] text-primary"
                    @click="navigateTo('/strategy/create')"
                  >
                    <Icon name="lucide:plus" class="w-3 h-3 mr-1" />
                    Create your own
                  </Button>
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  v-for="strategy in STRATEGY_LIST" :key="strategy.key"
                  class="group relative text-left rounded-2xl border bg-muted/20 transition-all p-4 overflow-hidden"
                  :class="usedStrategyKeys.has(strategy.key)
                    ? 'border-border/40 opacity-60 cursor-not-allowed'
                    : 'border-border/60 hover:bg-muted/40 hover:border-primary/40 cursor-pointer'"
                  @click="handleExploreStrategy(strategy.key)"
                >
                  <!-- Already-used badge -->
                  <span
                    v-if="usedStrategyKeys.has(strategy.key)"
                    class="absolute top-2 right-2 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 leading-none"
                  >
                    Multi-vault coming soon
                  </span>

                  <!-- Top row: icon + APY badge -->
                  <div class="flex items-start justify-between mb-3">
                    <div class="w-10 h-10 rounded-xl flex items-center justify-center" :style="{ backgroundColor: strategy.assetColor + '20' }">
                      <Icon :name="strategy.icon" class="w-5 h-5" :style="{ color: strategy.assetColor }" />
                    </div>
                    <div class="text-right" :class="{ 'mt-4': usedStrategyKeys.has(strategy.key) }">
                      <p class="text-xs text-muted-foreground/70 leading-none mb-1">APY</p>
                      <p class="text-lg font-bold tabular-nums leading-none">
                        <span v-if="profileStore.getStrategyApy(strategy.key)" class="text-primary">
                          {{ profileStore.getStrategyApy(strategy.key) }}%
                        </span>
                        <span v-else class="text-muted-foreground/40 text-sm">—</span>
                      </p>
                    </div>
                  </div>

                  <!-- Name + description -->
                  <p class="font-semibold text-sm mb-0.5">{{ strategy.name }}</p>
                  <p class="text-xs text-muted-foreground mb-3 line-clamp-2">{{ strategy.subtitle }}</p>

                  <!-- Bottom meta -->
                  <div class="flex items-center justify-between pt-3 border-t border-border/40">
                    <div class="flex items-center gap-1.5">
                      <img :src="strategy.vaultLogo" class="w-4 h-4 rounded-full" @error="($event.target as HTMLImageElement).style.display='none'" />
                      <span class="text-[11px] font-medium text-muted-foreground">{{ strategy.assetSymbol }}</span>
                    </div>
                    <span class="text-[11px] text-muted-foreground/60 tabular-nums">
                      TVL {{ formatTvl(profileStore.getStrategyTvl(strategy.key)) }}
                    </span>
                  </div>

                </button>
              </div>
            </div>

            <!-- ── Dashboard: KPI + Chart + Activity + Allocation ── -->
            <div v-if="pockets.length > 0" class="mt-10 space-y-6">
              <div class="flex items-baseline justify-between">
                <p class="text-xs text-muted-foreground uppercase tracking-widest font-medium">Dashboard</p>
                <p class="text-[11px] text-muted-foreground/50">Live · refreshes on every action</p>
              </div>

              <!-- Today's snapshot + streak -->
              <AppTodayCard
                :total-value-usd="dashTotalValueUsd"
                :avg-apy="dashAvgApy"
              />

              <!-- KPI strip -->
              <AppDashboardKpi
                :total-value-usd="dashTotalValueUsd"
                :net-contributed-usd="netContributedUsd"
                :unrealized-pnl-usd="unrealizedPnlUsd"
                :pnl-percent="pnlPercent"
                :avg-apy="dashAvgApy"
                :projected-annual-usd="projectedAnnualUsd"
                :loading="loadingPositions"
              />

              <!-- Chart (full width) -->
              <AppDashboardChart
                :series="chartSeries"
                :current-value-usd="dashTotalValueUsd"
                :loading="loadingTx"
              />

              <!-- Achievements grid -->
              <AppAchievements
                :unlocks="achievements.unlocks.value"
                :unlocked-count="achievements.unlockedCount.value"
                :total-count="achievements.totalCount.value"
              />

              <!-- Allocation + Activity (side-by-side on desktop) -->
              <div class="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-4">
                <AppDashboardAllocation
                  :items="allocation"
                  :total-usd="dashTotalValueUsd"
                />
                <AppDashboardActivity
                  :items="allTransactions"
                  :loading="loadingTx"
                  :limit="8"
                />
              </div>
            </div>
          </section>

        </div>
      </main>

      <LandingFooter v-if="isConnected" />

      <AppOnboardingStory v-if="isConnected" />

      <!-- Dialogs -->
      <AppConnectModal v-model:open="showConnectModal" />

      <AppCreatePocketDialog
        v-model:open="showCreateDialog"
        :creating="creatingPocket"
        :tx-state="txState"
        :tx-error="txError"
        :wallet-tokens="walletTokens"
        :loading-tokens="loadingTokens"
        :user-address="address"
        :pre-select-strategy="depositPocketKey"
        :initial-strategy="newPocketStrategy"
        @create="handleCreatePocket"
        @create-and-deposit="handleCreateAndDeposit"
        @fetch-tokens="fetchWalletTokens"
      />


      <AppDeletePocketDialog
        ref="deleteDialogRef"
        v-model:open="showDeleteConfirm"
        :pocket-positions="pocketPositions"
        @confirmed="handlePocketDeleted"
      />

      <AppScheduleDialog
        v-model:open="showScheduleDialog"
        :pocket="schedulePocket"
        :asset-price="schedulePocket ? profileStore.getAssetPrice(schedulePocket.strategy_key) : 0"
        :saving="savingSchedule"
        @save="handleSaveSchedule"
        @remove="handleRemoveSchedule"
      />

      <AppFundWalletDialog
        v-if="address"
        v-model:open="showFundDialog"
        :address="address"
        :wallet-tokens="walletTokens"
        :default-tab="fundDefaultTab"
        @funded="handleFunded"
      />

      <AppPocketWithdrawDialog
        v-model:open="showWithdrawDialog"
        :pocket="withdrawPocket"
        @done="refetchAll"
      />
    </template>
  </div>
</template>
