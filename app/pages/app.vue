<script setup lang="ts">
import { parseUnits, formatUnits } from 'viem'
import { STRATEGIES, type StrategyKey } from '~/config/strategies'
import type { DbPocket } from '~/types/database'
import { BRAND } from '~/config/brand'
import { usePrivyAuth } from '~/composables/usePrivy'
import { useBalances } from '~/composables/useBalances'
import { useVault } from '~/composables/useVault'
import { useEnso } from '~/composables/useEnso'
import { useCoinGecko } from '~/composables/useCoinGecko'
import { useWalletTokens } from '~/composables/useWalletTokens'
import { useDepositFlow } from '~/composables/useDepositFlow'
import { useTransactionRecorder } from '~/composables/useTransactionRecorder'
import { storeToRefs } from 'pinia'
import { useProfileStore } from '~/stores/useProfileStore'
import { toast } from 'vue-sonner'

// ---- Wallet ----
const { isConnected, address, isBase, isReady } = usePrivyAuth()

const showFundDialog = ref(false)

const showConnectModal = ref(false)

// ---- Profile Store ----
const profileStore = useProfileStore()
const {
  currentUser, pockets, loading: loadingPockets,
  pocketPositions, pocketProfits, loadingPositions,
  totalPortfolioFormatted,
} = storeToRefs(profileStore)

const profileDisplayName = computed(() =>
  address.value ? profileStore.displayName(address.value) : '',
)
const pocketCount = computed(() => pockets.value.length)

// ---- Balances & Vault ----
const { ethBalance, fetchBalances, loading: loadingBalances } = useBalances()
const { txState, txHash, txError, deposit, redeem, zapDeposit, zapWithdraw, switchVault, getClaimableRewards, claimRewards, reset } = useVault()
import type { RewardsInfo } from '~/composables/useVault'
const { getZapQuote, getZapWithdrawQuote, getWalletBalances, NATIVE_TOKEN } = useEnso()
const { getTokenPrices } = useCoinGecko()

// ---- Wallet tokens ----
const { walletTokens, loadingTokens, fetchWalletTokens } = useWalletTokens(
  address, getWalletBalances, getTokenPrices,
)

// ---- Deposit / Withdraw flow ----
const {
  selectedPocket, showDepositDialog, zapQuote, withdrawZapQuote, fetchingQuote, fetchingWithdrawQuote,
  selectedStrategy, lastTxType, lastTxAmount, isDirectWithdraw,
  openDepositDialog, handleDeposit, handleWithdraw,
  handleSelectToken, handleSelectWithdrawToken, handleUpdateAmount, handleChangeMode,
} = useDepositFlow({
  address, deposit, redeem, zapDeposit, zapWithdraw, reset,
  getZapQuote, getZapWithdrawQuote, NATIVE_TOKEN, walletTokens, fetchWalletTokens,
  fetchPocketPosition: (p) => profileStore.fetchPocketPosition(p),
})

const pocketPosition = computed(() => {
  if (!selectedPocket.value) return { shares: 0n, value: 0n }
  return pocketPositions.value[selectedPocket.value.id] || { shares: 0n, value: 0n }
})

// ---- Transaction recording ----
useTransactionRecorder({
  txState, txHash, reset,
  selectedPocket, selectedStrategy,
  lastTxType, lastTxAmount, showDepositDialog,
  address, fetchBalances, fetchWalletTokens,
  fetchAllPositions: (addr) => profileStore.fetchAllPositions(addr),
  refreshPockets: () => profileStore.refreshPockets(),
})

// ---- Create pocket ----
const showCreateDialog = ref(false)
const creatingPocket = ref(false)

async function handleCreatePocket(payload: {
  name: string
  purpose?: string
  target_amount?: number
  timeline?: string
  strategy_key: StrategyKey
}) {
  if (!currentUser.value) return
  creatingPocket.value = true
  try {
    const pocket = await profileStore.createPocket({
      user_id: currentUser.value.id,
      ...payload,
    })
    if (pocket) {
      showCreateDialog.value = false
      openDepositDialog(pocket)
    }
  } finally {
    creatingPocket.value = false
  }
}

// ---- Switch vault ----
const showSwitchDialog = ref(false)
const switchPocket = ref<DbPocket | null>(null)
const switchLoading = ref(false)

function openSwitchDialog(pocket: DbPocket) {
  switchPocket.value = pocket
  showSwitchDialog.value = true
}

async function handleSwitchVault(toStrategyKey: StrategyKey) {
  if (!switchPocket.value || switchLoading.value) return
  const fromStrategy = STRATEGIES[switchPocket.value.strategy_key as StrategyKey]
  const toStrategy = STRATEGIES[toStrategyKey]
  if (!fromStrategy || !toStrategy) return

  switchLoading.value = true
  try {
    const { recordTransaction } = useUserData()
    const pos = pocketPositions.value[switchPocket.value.id]
    const hasBalance = pos && pos.shares > 0n

    if (hasBalance) {
      await switchVault(fromStrategy, toStrategy, pos.shares)
      if (txState.value !== 'confirmed') return

      if (txHash.value) {
        await recordTransaction({
          pocket_id: switchPocket.value.id,
          type: 'switch',
          amount: `${fromStrategy.vaultSymbol} → ${toStrategy.vaultSymbol}`,
          asset_symbol: toStrategy.assetSymbol,
          tx_hash: txHash.value,
          timestamp: Math.floor(Date.now() / 1000),
        })
      }
    }

    await $fetch(`/api/pockets/${switchPocket.value.id}`, {
      method: 'PATCH',
      body: { strategy_key: toStrategyKey },
    })
    await profileStore.refreshPockets()
    if (address.value) await profileStore.fetchAllPositions(address.value)

    showSwitchDialog.value = false
    switchPocket.value = null
    reset()
    toast.success('Vault switched!', {
      description: `${fromStrategy.label} → ${toStrategy.label}`,
    })
  } finally {
    switchLoading.value = false
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

// Fetch wallet tokens on connect
watch(isConnected, (connected) => {
  if (connected) fetchWalletTokens()
}, { immediate: true })

// ---- Merkl Rewards ----
const rewardsInfo = ref<RewardsInfo>({ rewards: [], hasClaimable: false, raw: null })
const loadingRewards = ref(false)
const claimingRewards = ref(false)

async function fetchRewards() {
  loadingRewards.value = true
  try {
    rewardsInfo.value = await getClaimableRewards()
  } finally {
    loadingRewards.value = false
  }
}

async function handleClaimRewards() {
  if (!rewardsInfo.value.raw) return
  claimingRewards.value = true
  try {
    await claimRewards(rewardsInfo.value.raw)
    if (txState.value === 'confirmed') {
      toast.success('Rewards claimed!')
      await fetchRewards()
      reset()
    }
  } finally {
    claimingRewards.value = false
  }
}

// Fetch rewards when address changes (covers connect + wallet switch)
// Delayed to avoid rate-limiting the public RPC alongside position fetches
let rewardsTimeout: ReturnType<typeof setTimeout> | null = null
watch(address, (addr) => {
  if (rewardsTimeout) clearTimeout(rewardsTimeout)
  if (addr) {
    rewardsTimeout = setTimeout(() => fetchRewards(), 3000)
  } else {
    rewardsInfo.value = { rewards: [], hasClaimable: false, raw: null }
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
const lowGas = computed(() => !loadingBalances.value && ethBalance.value < parseUnits('0.0005', 18))

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
  <div class="min-h-screen bg-background">
    <!-- Loading -->
    <template v-if="!isReady">
      <div class="h-dvh flex flex-col items-center justify-center overflow-hidden gap-6">
        <img src="/logo.png" :alt="BRAND.name" class="w-20 h-20 animate-pulse" />
        <p class="text-sm text-muted-foreground/70 max-w-xs text-center px-6">
          {{ loadingTip }}
        </p>
      </div>
    </template>

    <template v-else>
    <!-- Header -->
    <AppHeader
      :is-connected="isConnected"
      :is-base="isBase"
      :display-name="profileDisplayName"
      @sign-in="showConnectModal = true"
      @go-profile="navigateTo('/profile')"
    />

    <!-- Not connected -->
    <AppHero v-if="!isConnected" @connect="showConnectModal = true" />

    <!-- Connected: Pocket Dashboard -->
    <main v-else class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
      <!-- Alerts -->
      <Alert v-if="lowGas" class="mb-4">
        <Icon name="lucide:info" class="w-4 h-4" />
        <AlertTitle>Low balance for fees</AlertTitle>
        <AlertDescription>
          You'll need a small amount of ETH to cover processing fees.
        </AlertDescription>
      </Alert>

      <Alert v-if="!loadingTokens && totalWalletUsd > 0" class="mb-4 border-primary/30 bg-primary/5 [&>svg]:text-primary">
        <Icon name="lucide:wallet" class="w-4 h-4" />
        <AlertTitle class="text-primary">{{ totalWalletFormatted }} available in your wallet</AlertTitle>
        <AlertDescription>
          You have funds ready to deposit into your pockets.
        </AlertDescription>
      </Alert>

      <!-- Merkl Rewards -->
      <div
        v-if="loadingRewards && !rewardsInfo.hasClaimable"
        class="mb-4 rounded-xl border border-border/50 bg-muted/30 p-4"
      >
        <div class="flex items-center gap-3">
          <Skeleton class="w-10 h-10 rounded-xl shrink-0" />
          <div class="space-y-2 flex-1">
            <Skeleton class="h-4 w-32" />
            <Skeleton class="h-3 w-48" />
          </div>
        </div>
      </div>

      <div
        v-if="rewardsInfo.hasClaimable"
        class="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-3">
            <img
              src="https://storage.googleapis.com/merkl-static-assets/tokens/YO.svg"
              alt="Reward token"
              class="w-10 h-10 rounded-xl shrink-0"
            >
            <div>
              <p class="text-sm font-semibold">Rewards available</p>
              <div class="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                <span
                  v-for="r in rewardsInfo.rewards"
                  :key="r.tokenAddress"
                  class="text-xs text-muted-foreground font-mono"
                >
                  {{ r.claimableFormatted }} {{ r.tokenSymbol }}
                </span>
              </div>
            </div>
          </div>
          <Button
            size="sm"
            class="shrink-0 bg-amber-500 text-white hover:bg-amber-600"
            :disabled="claimingRewards || (txState !== 'idle' && txState !== 'confirmed' && txState !== 'failed')"
            @click="handleClaimRewards"
          >
            <Icon v-if="claimingRewards" name="lucide:loader-2" class="w-3.5 h-3.5 mr-1.5 animate-spin" />
            <Icon v-else name="lucide:sparkles" class="w-3.5 h-3.5 mr-1.5" />
            Claim
          </Button>
        </div>
      </div>

      <!-- Portfolio summary -->
      <div class="mb-8" data-tour="total-balance">
        <p class="text-sm text-muted-foreground mb-1">Total balance</p>
        <Skeleton v-if="loadingPositions" class="h-10 w-40 mb-1" />
        <h1 v-else class="text-4xl font-bold tracking-tight">{{ totalPortfolioFormatted }}</h1>
        <div class="flex items-center gap-3 mt-1">
          <p class="text-sm text-muted-foreground">
            {{ pocketCount }} pocket{{ pocketCount !== 1 ? 's' : '' }}
          </p>
          <Button
            variant="outline"
            size="sm"
            class="h-7 text-xs"
            data-tour="fund-wallet"
            @click="showFundDialog = true"
          >
            <Icon name="lucide:download" class="w-3.5 h-3.5 mr-1" />
            Fund Wallet
          </Button>
        </div>
      </div>

      <!-- Yield comparison -->
      <AppYieldComparisonCard
        v-if="!loadingPositions && pockets.length > 0"
        :total-value-usd="totalPortfolioUsd"
        :average-apy="averageApy"
        class="mb-6"
      />

      <div class="flex items-center justify-between mb-5">
        <h2 class="text-lg font-semibold">Pockets</h2>
        <Button
          class="bg-primary text-primary-foreground hover:bg-primary/90"
          data-tour="create-pocket"
          @click="showCreateDialog = true"
        >
          <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" />
          Create Pocket
        </Button>
      </div>

      <!-- Loading -->
      <div v-if="loadingPockets" class="flex items-center justify-center py-20">
        <Icon name="lucide:loader-2" class="w-6 h-6 animate-spin text-muted-foreground" />
      </div>

      <!-- Empty state -->
      <div
        v-else-if="pockets.length === 0"
        class="rounded-2xl bg-linear-to-br from-primary/5 via-background to-primary/5 border border-dashed border-primary/20 p-14 flex flex-col items-center justify-center text-center"
      >
        <div class="relative mb-6">
          <div class="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Icon name="lucide:piggy-bank" class="w-10 h-10 text-primary" />
          </div>
          <div class="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Icon name="lucide:sparkles" class="w-4 h-4 text-primary" />
          </div>
        </div>
        <h3 class="text-xl font-semibold mb-2">Start saving</h3>
        <p class="text-sm text-muted-foreground max-w-xs mb-8">
          Create your first pocket to begin growing your money automatically.
        </p>
        <Button
          size="lg"
          class="bg-primary text-primary-foreground hover:bg-primary/90"
          @click="showCreateDialog = true"
        >
          <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" />
          Create Pocket
        </Button>
      </div>

      <!-- Pocket cards -->
      <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AppPocketCard
          v-for="pocket in pockets"
          :key="pocket.id"
          :pocket="pocket"
          :position="pocketPositions[pocket.id] || { shares: 0n, value: 0n }"
          :asset-price="profileStore.getAssetPrice(pocket.strategy_key)"
          :apy="profileStore.getStrategyApy(pocket.strategy_key)"
          :profit="pocketProfits[pocket.id] ?? null"
          :loading="loadingPositions"
          @click="navigateTo(`/pocket/${pocket.id}`)"
          @deposit="openDepositDialog(pocket, 'deposit')"
          @withdraw="openDepositDialog(pocket, 'withdraw')"
          @schedule="openScheduleDialog(pocket)"
          @switch="openSwitchDialog(pocket)"
          @delete="deleteDialogRef?.requestDelete(pocket)"
        />
      </div>

      <!-- Trust footer -->
      <div class="mt-12 pt-6 border-t border-border/50">
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

    <!-- Onboarding story (first-time users) -->
    <AppOnboardingStory v-if="isConnected" />

    <!-- Dialogs -->
    <AppConnectModal v-model:open="showConnectModal" />

    <AppCreatePocketDialog
      v-model:open="showCreateDialog"
      :creating="creatingPocket"
      @create="handleCreatePocket"
    />

    <AppDepositDialog
      v-model:open="showDepositDialog"
      :pocket="selectedPocket"
      :position="pocketPosition"
      :tx-state="txState"
      :tx-hash="txHash"
      :tx-error="txError"
      :wallet-tokens="walletTokens"
      :loading-tokens="loadingTokens"
      :loading-position="loadingPositions"
      :fetching-quote="fetchingQuote"
      :fetching-withdraw-quote="fetchingWithdrawQuote"
      :zap-quote="zapQuote"
      :withdraw-zap-quote="withdrawZapQuote"
      :is-direct-withdraw="isDirectWithdraw"
      :native-token="NATIVE_TOKEN"
      :asset-price="selectedPocket ? profileStore.getAssetPrice(selectedPocket.strategy_key) : 0"
      @deposit="handleDeposit"
      @withdraw="handleWithdraw"
      @reset="reset"
      @fetch-tokens="fetchWalletTokens"
      @fetch-position="selectedPocket && profileStore.fetchPocketPosition(selectedPocket)"
      @select-token="handleSelectToken"
      @select-withdraw-token="handleSelectWithdrawToken"
      @update-amount="handleUpdateAmount"
      @change-mode="handleChangeMode"
    />

    <AppSwitchVaultDialog
      v-model:open="showSwitchDialog"
      :pocket="switchPocket"
      :position="switchPocket ? (pocketPositions[switchPocket.id] || { shares: 0n, value: 0n }) : { shares: 0n, value: 0n }"
      :asset-price="switchPocket ? profileStore.getAssetPrice(switchPocket.strategy_key) : 0"
      :tx-state="txState"
      :tx-hash="txHash"
      :tx-error="txError"
      :loading="switchLoading"
      @confirm="handleSwitchVault"
      @reset="reset"
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
    />
    </template>
  </div>
</template>
