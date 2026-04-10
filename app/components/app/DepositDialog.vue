<script setup lang="ts">
import { parseUnits, formatUnits } from 'viem'
import { STRATEGIES, type StrategyKey } from '~/config/strategies'
import type { DbPocket } from '~/types/database'
import type { TxState } from '~/composables/useVault'
import type { ZapQuote } from '~/composables/useEnso'
import type { WalletToken } from '~/composables/useWalletTokens'
import { useVault } from '~/composables/useVault'

// ---- Props ----
const props = defineProps<{
  pocket: DbPocket | null
  position: { shares: bigint; value: bigint }
  txState: TxState
  txHash: `0x${string}` | null
  txError: string
  walletTokens: WalletToken[]
  loadingTokens: boolean
  loadingPosition: boolean
  fetchingQuote: boolean
  zapQuote: ZapQuote | null
  nativeToken: string
  assetPrice: number
  withdrawZapQuote: ZapQuote | null
  fetchingWithdrawQuote: boolean
  isDirectWithdraw: boolean
}>()

const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{
  deposit: [payload: { tokenIn: `0x${string}`; amount: string; isDirect: boolean }]
  withdraw: [payload: { amount: string; tokenOut?: `0x${string}` }]
  reset: []
  fetchTokens: []
  fetchPosition: []
  selectToken: [token: `0x${string}`]
  selectWithdrawToken: [token: `0x${string}`]
  updateAmount: [amount: string]
  changeMode: [mode: 'deposit' | 'withdraw']
}>()

// ---- Local state ----
const mode = ref<'deposit' | 'withdraw'>('deposit')
const view = ref<'select-token' | 'amount'>('select-token')
const amount = ref('')
const selectedTokenAddr = ref<`0x${string}` | null>(null)
const selectedWithdrawTokenAddr = ref<`0x${string}` | null>(null)
const tokenSearch = ref('')

// ---- Computed ----
const strategy = computed(() =>
  props.pocket ? STRATEGIES[props.pocket.strategy_key as StrategyKey] : null,
)

const riskLabel = computed(() => {
  const labels: Record<string, string> = {
    conservative: 'Low risk',
    balanced: 'Medium risk',
    aggressive: 'High risk',
  }
  return labels[props.pocket?.strategy_key || ''] || ''
})

const strategyLabel = computed(() => {
  const labels: Record<string, string> = {
    conservative: 'Savings',
    balanced: 'Growth',
    aggressive: 'High Growth',
  }
  return labels[props.pocket?.strategy_key || ''] || ''
})

const selectedTokenBalance = computed<WalletToken | null>(() => {
  if (!selectedTokenAddr.value) return null
  return props.walletTokens.find(
    t => t.token?.toLowerCase() === selectedTokenAddr.value?.toLowerCase(),
  ) ?? null
})

const selectedWithdrawTokenInfo = computed<WalletToken | null>(() => {
  if (!selectedWithdrawTokenAddr.value) return null
  return props.walletTokens.find(
    t => t.token?.toLowerCase() === selectedWithdrawTokenAddr.value?.toLowerCase(),
  ) ?? null
})

function isDirectToken(tokenAddr: string): boolean {
  if (!strategy.value) return false
  const vaultAsset = strategy.value.type === 'native'
    ? props.nativeToken
    : strategy.value.assetAddress
  return tokenAddr.toLowerCase() === vaultAsset.toLowerCase()
}

const isDirectDeposit = computed(() => {
  if (!selectedTokenAddr.value || !strategy.value) return true
  return isDirectToken(selectedTokenAddr.value)
})

const isVaultToken = (tokenAddr: string): boolean => {
  if (!strategy.value) return false
  return tokenAddr.toLowerCase() === strategy.value.vaultAddress.toLowerCase()
}

const availableTokens = computed(() =>
  props.walletTokens.filter(t => !isVaultToken(t.token)),
)

const directDepositTokens = computed(() =>
  availableTokens.value.filter(t => isDirectToken(t.token)),
)

const filteredTokens = computed(() => {
  const q = tokenSearch.value.toLowerCase().trim()
  if (!q) return availableTokens.value
  return availableTokens.value.filter(t =>
    t.symbol.toLowerCase().includes(q)
    || t.name.toLowerCase().includes(q)
    || t.token.toLowerCase().includes(q),
  )
})

const parsedAmount = computed(() => {
  if (!strategy.value || !amount.value) return 0n
  try { return parseUnits(amount.value, strategy.value.decimals) }
  catch { return 0n }
})

const canSubmit = computed(() => {
  if (props.txState !== 'idle') return false
  if (!amount.value) return false
  if (mode.value === 'withdraw') {
    if (parsedAmount.value === 0n) return false
    if (selectedWithdrawTokenAddr.value && !props.isDirectWithdraw) return !!props.withdrawZapQuote
    return true
  }
  if (isDirectDeposit.value) return parsedAmount.value > 0n
  return !!props.zapQuote
})

// ---- Preview estimates ----
const { previewDeposit, previewRedeem } = useVault()
const previewValue = ref<bigint>(0n)
const loadingPreview = ref(false)
let previewTimer: ReturnType<typeof setTimeout> | null = null

const previewFormatted = computed(() => {
  if (!strategy.value || previewValue.value === 0n) return ''
  const val = Number(previewValue.value) / Math.pow(10, strategy.value.decimals)
  if (val < 0.000001) return '<0.000001'
  if (val < 1) return val.toPrecision(4)
  return val.toLocaleString('en-US', { maximumFractionDigits: 6 })
})

watch([amount, mode], () => {
  if (previewTimer) clearTimeout(previewTimer)
  previewValue.value = 0n
  if (!strategy.value || !amount.value || parsedAmount.value === 0n) return
  if (mode.value === 'deposit' && !isDirectDeposit.value) return

  loadingPreview.value = true
  previewTimer = setTimeout(async () => {
    try {
      if (mode.value === 'deposit') {
        previewValue.value = await previewDeposit(strategy.value!, parsedAmount.value)
      } else {
        previewValue.value = await previewRedeem(strategy.value!, parsedAmount.value)
      }
    } catch {
      previewValue.value = 0n
    } finally {
      loadingPreview.value = false
    }
  }, 500)
})

const isTxActive = computed(() =>
  !['idle', 'confirmed', 'failed'].includes(props.txState),
)

const withdrawableFormatted = computed(() => {
  if (!strategy.value || props.position.shares === 0n) return 0
  return Number(props.position.shares) / Math.pow(10, strategy.value.decimals)
})

const withdrawValueFormatted = computed(() => {
  if (!strategy.value || props.position.value === 0n) return 0
  return Number(props.position.value) / Math.pow(10, strategy.value.decimals)
})

const positionUsdValue = computed(() => {
  if (!strategy.value || props.position.value === 0n) return 0
  const val = parseFloat(formatUnits(props.position.value, strategy.value.decimals))
  return val * props.assetPrice
})

const TX_STATUS_LABEL: Record<TxState, string> = {
  idle: '',
  preparing: 'Getting ready...',
  approving: 'Setting up...',
  awaiting_signature: 'Please confirm',
  pending: 'Almost there...',
  confirmed: 'All done!',
  failed: 'Something went wrong',
}

// ---- Methods ----
function formatTokenBal(t: TokenBalance): string {
  const raw = BigInt(t.amount)
  const formatted = Number(raw) / Math.pow(10, t.decimals)
  if (formatted < 0.000001) return '<0.000001'
  if (formatted < 1) return formatted.toPrecision(4)
  return formatted.toLocaleString('en-US', { maximumFractionDigits: 6 })
}

function formatUsd(v: number): string {
  if (v < 0.01) return '<$0.01'
  return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

function formatCompactBal(val: number): string {
  if (val === 0) return '0'
  if (val < 0.0001) return val.toPrecision(2)
  if (val < 1) return val.toPrecision(4)
  if (val < 1000) return val.toFixed(2)
  return val.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

function displayNum(value: string, maxDec = 6): string {
  const n = parseFloat(value)
  if (isNaN(n) || n === 0) return '0'
  if (n < 1 / Math.pow(10, maxDec)) return n.toPrecision(2)
  return n.toLocaleString('en-US', { maximumFractionDigits: maxDec })
}

function selectToken(token: WalletToken) {
  selectedTokenAddr.value = token.token as `0x${string}`
  amount.value = ''
  view.value = 'amount'
  emit('selectToken', token.token as `0x${string}`)
}

function autoSelectToken() {
  if (mode.value !== 'deposit') return
  if (props.walletTokens.length === 0) return
  const direct = directDepositTokens.value
  const pick = direct.length > 0 ? direct[0] : availableTokens.value[0]
  if (!pick) return
  selectedTokenAddr.value = pick.token as `0x${string}`
  emit('selectToken', pick.token as `0x${string}`)
}

watch(() => props.walletTokens, () => {
  if (open.value && mode.value === 'deposit' && !selectedTokenAddr.value) {
    autoSelectToken()
  }
})

function setMaxAmount() {
  if (!selectedTokenBalance.value) return
  amount.value = selectedTokenBalance.value.formattedBal.toString()
}

function setPercentAmount(pct: number) {
  if (!selectedTokenBalance.value) return
  amount.value = (selectedTokenBalance.value.formattedBal * (pct / 100)).toString()
}

function setWithdrawMax() {
  if (!strategy.value || props.position.shares === 0n) return
  amount.value = formatUnits(props.position.shares, strategy.value.decimals)
}

function setWithdrawPercent(pct: number) {
  if (!strategy.value || props.position.shares === 0n) return
  const total = Number(props.position.shares)
  const portion = BigInt(Math.floor(total * (pct / 100)))
  amount.value = formatUnits(portion, strategy.value.decimals)
}

function selectWithdrawToken(token: WalletToken) {
  selectedWithdrawTokenAddr.value = token.token as `0x${string}`
  amount.value = ''
  view.value = 'amount'
  emit('selectWithdrawToken', token.token as `0x${string}`)
}

function resetForm() {
  mode.value = 'deposit'
  view.value = 'select-token'
  amount.value = ''
  selectedTokenAddr.value = null
  selectedWithdrawTokenAddr.value = null
  tokenSearch.value = ''
}

watch(open, (v) => {
  if (!v) {
    resetForm()
    emit('reset')
  }
})

function switchMode(newMode: 'deposit' | 'withdraw') {
  mode.value = newMode
  amount.value = ''
  selectedTokenAddr.value = null
  selectedWithdrawTokenAddr.value = null
  view.value = newMode === 'withdraw' ? 'amount' : 'select-token'
  emit('changeMode', newMode)
  emit('reset')
  if (newMode === 'deposit') autoSelectToken()
}

function handleAction() {
  if (props.txState === 'confirmed' || props.txState === 'failed') {
    emit('reset')
    return
  }
  if (mode.value === 'withdraw') {
    emit('withdraw', {
      amount: amount.value,
      tokenOut: selectedWithdrawTokenAddr.value || undefined,
    })
  } else {
    emit('deposit', {
      tokenIn: selectedTokenAddr.value!,
      amount: amount.value,
      isDirect: isDirectDeposit.value,
    })
  }
}

watch(amount, (v) => emit('updateAmount', v))

function openFor(pocket: DbPocket, openMode: 'deposit' | 'withdraw' = 'deposit') {
  mode.value = openMode
  view.value = 'amount'
  amount.value = ''
  selectedTokenAddr.value = null
  tokenSearch.value = ''
  open.value = true
  if (openMode === 'deposit') autoSelectToken()
}

defineExpose({ openFor })
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-md p-0 gap-0 overflow-hidden max-h-[85dvh] sm:max-h-[90vh] flex flex-col">
      <!-- Header — sticky -->
      <div class="px-5 pt-5 pb-3 shrink-0">
        <DialogHeader>
          <DialogTitle class="text-lg">{{ pocket?.name }}</DialogTitle>
          <DialogDescription>
            {{ strategyLabel }} · {{ riskLabel }}
          </DialogDescription>
        </DialogHeader>

        <!-- Current position -->
        <div v-if="loadingPosition" class="mt-3 p-3 bg-muted/60 rounded-xl">
          <Skeleton class="h-3 w-24 mb-1.5" />
          <Skeleton class="h-6 w-36 mb-1" />
          <Skeleton class="h-4 w-16" />
        </div>
        <div v-else-if="position.value > 0n && strategy" class="mt-3 p-3 bg-muted/60 rounded-xl">
          <p class="text-xs text-muted-foreground mb-0.5">Your balance</p>
          <p class="text-lg font-semibold font-mono">
            {{ displayNum(formatUnits(position.value, strategy.decimals), 4) }}
            {{ strategy.assetLabel }}
          </p>
          <p v-if="positionUsdValue > 0" class="text-sm text-muted-foreground font-mono">
            {{ formatUsd(positionUsdValue) }}
          </p>
        </div>

        <!-- Mode tabs -->
        <Tabs class="mt-4" :default-value="mode" @update:model-value="(v: any) => switchMode(v)">
          <TabsList class="w-full h-11">
            <TabsTrigger value="deposit" class="flex-1 text-sm">Deposit</TabsTrigger>
            <TabsTrigger value="withdraw" class="flex-1 text-sm">Withdraw</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <!-- Scrollable content area -->
      <div class="flex-1 overflow-y-auto overscroll-contain">
        <!-- ===== VIEW: SELECT TOKEN (deposit mode) ===== -->
        <div v-if="mode === 'deposit' && view === 'select-token'" class="px-5 pb-5">
          <p class="text-sm font-medium text-center mb-3">What do you want to deposit?</p>

          <!-- Search -->
          <div class="relative mb-4">
            <Icon name="lucide:search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              v-model="tokenSearch"
              placeholder="Search tokens..."
              class="pl-9 h-11 text-sm"
            />
          </div>

          <!-- Loading -->
          <div v-if="loadingTokens" class="space-y-4">
            <div>
              <Skeleton class="h-3.5 w-32 mb-2" />
              <div class="flex gap-2">
                <Skeleton class="h-11 w-28 rounded-xl" />
              </div>
            </div>
            <div>
              <Skeleton class="h-3.5 w-24 mb-2" />
              <div class="space-y-1">
                <div v-for="i in 3" :key="i" class="flex items-center gap-3 px-3 py-3">
                  <Skeleton class="w-9 h-9 rounded-full shrink-0" />
                  <div class="flex-1">
                    <Skeleton class="h-4 w-16 mb-1" />
                    <Skeleton class="h-3 w-10" />
                  </div>
                  <div class="text-right">
                    <Skeleton class="h-4 w-14 mb-1 ml-auto" />
                    <Skeleton class="h-3 w-20 ml-auto" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <template v-else>
            <!-- Recommended tokens (direct deposit) -->
            <div v-if="directDepositTokens.length > 0 && !tokenSearch" class="mb-4">
              <p class="text-xs font-medium text-muted-foreground mb-2">Best option</p>
              <div class="flex gap-2 flex-wrap">
                <button
                  v-for="t in directDepositTokens"
                  :key="t.token"
                  class="flex items-center gap-2 px-3.5 min-h-11 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 active:bg-primary/15 transition-all"
                  @click="selectToken(t)"
                >
                  <img
                    v-if="t.logoUri"
                    :src="t.logoUri"
                    :alt="t.symbol"
                    class="w-5 h-5 rounded-full"
                    @error="($event.target as HTMLImageElement).style.display = 'none'"
                  >
                  <span class="text-sm font-medium">{{ t.symbol }}</span>
                </button>
              </div>
            </div>

            <!-- All tokens -->
            <div>
              <p class="text-xs font-medium text-muted-foreground mb-2">Your tokens</p>
              <div class="space-y-0.5 max-h-[45dvh] sm:max-h-64 overflow-y-auto -mx-1 px-1">
                <button
                  v-for="token in filteredTokens"
                  :key="token.token"
                  class="w-full flex items-center gap-3 px-3 min-h-13 py-2.5 rounded-xl transition-all hover:bg-muted/60 active:bg-muted"
                  @click="selectToken(token)"
                >
                  <img
                    v-if="token.logoUri"
                    :src="token.logoUri"
                    :alt="token.symbol"
                    class="w-9 h-9 rounded-full shrink-0"
                    @error="($event.target as HTMLImageElement).style.display = 'none'"
                  >
                  <div v-else class="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <span class="text-xs font-bold text-muted-foreground">{{ token.symbol?.charAt(0) }}</span>
                  </div>
                  <div class="flex-1 text-left min-w-0">
                    <div class="flex items-center gap-2">
                      <p class="text-sm font-semibold">{{ token.symbol }}</p>
                      <span
                        v-if="isDirectToken(token.token)"
                        class="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium"
                      >
                        Fastest
                      </span>
                    </div>
                    <p class="text-[11px] text-muted-foreground">on Base</p>
                  </div>
                  <div class="text-right shrink-0">
                    <p class="text-sm font-semibold">{{ formatUsd(token.usdValue) }}</p>
                    <p class="text-[11px] text-muted-foreground font-mono">{{ formatTokenBal(token) }}</p>
                  </div>
                </button>

                <p v-if="filteredTokens.length === 0" class="text-sm text-muted-foreground text-center py-8">
                  {{ tokenSearch ? 'No tokens found' : 'No tokens in your wallet' }}
                </p>
              </div>
            </div>
          </template>
        </div>

        <!-- ===== VIEW: AMOUNT INPUT ===== -->
        <div v-else class="px-5 pb-5 space-y-4">
          <!-- Deposit: loading tokens placeholder -->
          <div v-if="mode === 'deposit' && !selectedTokenBalance && (loadingTokens || walletTokens.length === 0)" class="space-y-3">
            <p class="text-sm font-medium text-muted-foreground text-center">Loading your tokens...</p>
            <div class="flex items-center gap-3 p-3.5 rounded-xl border">
              <Skeleton class="w-10 h-10 rounded-full shrink-0" />
              <div>
                <Skeleton class="h-4 w-20 mb-1" />
                <Skeleton class="h-3 w-14" />
              </div>
              <div class="flex-1 text-right">
                <Skeleton class="h-7 w-16 ml-auto mb-1" />
                <Skeleton class="h-3 w-24 ml-auto" />
              </div>
            </div>
            <div class="grid grid-cols-5 gap-2">
              <Skeleton v-for="i in 5" :key="i" class="h-11 rounded-xl" />
            </div>
          </div>

          <!-- Selected token display + amount (deposit mode) -->
          <div v-if="mode === 'deposit' && selectedTokenBalance" class="space-y-3">
            <p class="text-sm font-medium text-muted-foreground text-center">How much?</p>
            <div class="flex items-center gap-3 p-3.5 rounded-xl border">
              <!-- Token selector trigger -->
              <button
                class="flex items-center gap-2.5 min-w-0 shrink-0 min-h-11 -my-1"
                @click="view = 'select-token'; tokenSearch = ''"
              >
                <img
                  v-if="selectedTokenBalance.logoUri"
                  :src="selectedTokenBalance.logoUri"
                  :alt="selectedTokenBalance.symbol"
                  class="w-10 h-10 rounded-full"
                  @error="($event.target as HTMLImageElement).style.display = 'none'"
                >
                <div v-else class="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                  <span class="text-xs font-bold">{{ selectedTokenBalance.symbol?.charAt(0) }}</span>
                </div>
                <div class="text-left">
                  <p class="text-sm font-semibold">{{ selectedTokenBalance.symbol }}</p>
                  <p class="text-[11px] text-muted-foreground">Base</p>
                </div>
                <Icon name="lucide:chevron-down" class="w-4 h-4 text-muted-foreground" />
              </button>

              <!-- Amount input -->
              <div class="flex-1 text-right">
                <input
                  v-model="amount"
                  type="text"
                  inputmode="decimal"
                  placeholder="0"
                  class="w-full text-right font-semibold font-mono bg-transparent outline-none placeholder:text-muted-foreground"
                  :class="amount && amount.length > 12 ? 'text-sm' : 'text-xl'"
                  :disabled="txState !== 'idle'"
                >
                <p class="text-[11px] text-muted-foreground font-mono mt-0.5">
                  {{ amount ? formatUsd(Number(amount || 0) * (selectedTokenBalance.usdPrice || 0)) : '$0.00' }}
                </p>
              </div>
            </div>

            <!-- Percentage buttons -->
            <div class="grid grid-cols-5 gap-2">
              <button
                v-for="pct in [10, 25, 50, 75]"
                :key="pct"
                class="min-h-11 rounded-xl border text-sm font-medium transition-all hover:border-primary/30 hover:bg-primary/5 active:bg-primary/10"
                :disabled="txState !== 'idle'"
                @click="setPercentAmount(pct)"
              >
                {{ pct }}%
              </button>
              <button
                class="min-h-11 rounded-xl border text-sm font-medium transition-all hover:border-primary/30 hover:bg-primary/5 active:bg-primary/10 flex flex-col items-center justify-center"
                :disabled="txState !== 'idle'"
                @click="setMaxAmount"
              >
                <span class="font-bold text-xs">MAX</span>
                <span class="text-[10px] text-muted-foreground font-mono leading-tight">{{ formatCompactBal(selectedTokenBalance.formattedBal) }}</span>
              </button>
            </div>
          </div>

          <!-- Withdraw amount input -->
          <div v-if="mode === 'withdraw' && strategy" class="space-y-3">
            <p class="text-sm font-medium text-muted-foreground text-center">How much?</p>

            <!-- Loading position -->
            <div v-if="loadingPosition" class="space-y-3">
              <div class="flex items-center gap-3 p-3.5 rounded-xl border">
                <Skeleton class="w-10 h-10 rounded-full shrink-0" />
                <div>
                  <Skeleton class="h-4 w-20 mb-1" />
                  <Skeleton class="h-3 w-14" />
                </div>
                <div class="flex-1 text-right">
                  <Skeleton class="h-7 w-16 ml-auto mb-1" />
                  <Skeleton class="h-3 w-24 ml-auto" />
                </div>
              </div>
              <div class="grid grid-cols-5 gap-2">
                <Skeleton v-for="i in 5" :key="i" class="h-11 rounded-xl" />
              </div>
            </div>

            <!-- Vault token + amount input -->
            <div v-else class="flex items-center gap-3 p-3.5 rounded-xl border">
              <div class="flex items-center gap-2.5 shrink-0">
                <img
                  v-if="strategy.vaultLogo"
                  :src="strategy.vaultLogo"
                  :alt="strategy.vaultSymbol"
                  class="w-10 h-10 rounded-full"
                  @error="($event.target as HTMLImageElement).style.display = 'none'"
                >
                <div v-else class="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                  <Icon :name="strategy.icon" class="w-5 h-5" />
                </div>
                <div class="text-left">
                  <p class="text-sm font-semibold">{{ strategy.assetLabel }}</p>
                  <p class="text-[11px] text-muted-foreground">{{ strategy.vaultSymbol }}</p>
                </div>
              </div>

              <div class="flex-1 text-right">
                <input
                  v-model="amount"
                  type="text"
                  inputmode="decimal"
                  placeholder="0"
                  class="w-full text-right font-semibold font-mono bg-transparent outline-none placeholder:text-muted-foreground"
                  :class="amount && amount.length > 12 ? 'text-sm' : 'text-xl'"
                  :disabled="txState !== 'idle'"
                >
                <p class="text-[11px] text-muted-foreground font-mono mt-0.5">
                  {{ withdrawableFormatted > 0 ? displayNum(withdrawValueFormatted.toString(), 4) + ' ' + strategy.assetSymbol : '0' }}
                </p>
              </div>
            </div>

            <!-- Percentage buttons -->
            <div v-if="!loadingPosition" class="grid grid-cols-5 gap-2">
              <button
                v-for="pct in [10, 25, 50, 75]"
                :key="pct"
                class="min-h-11 rounded-xl border text-sm font-medium transition-all hover:border-primary/30 hover:bg-primary/5 active:bg-primary/10"
                :disabled="txState !== 'idle' || position.shares === 0n"
                @click="setWithdrawPercent(pct)"
              >
                {{ pct }}%
              </button>
              <button
                class="min-h-11 rounded-xl border text-sm font-medium transition-all hover:border-primary/30 hover:bg-primary/5 active:bg-primary/10 flex flex-col items-center justify-center"
                :disabled="txState !== 'idle' || position.shares === 0n"
                @click="setWithdrawMax"
              >
                <span class="font-bold text-xs">MAX</span>
                <span class="text-[10px] text-muted-foreground font-mono leading-tight">{{ formatCompactBal(withdrawableFormatted) }}</span>
              </button>
            </div>

            <!-- Withdraw to token selector -->
            <div v-if="!loadingPosition && position.shares > 0n">
              <p class="text-xs font-medium text-muted-foreground mb-2">Get paid in</p>
              <div class="flex gap-2 flex-wrap">
                <button
                  class="flex items-center gap-2 px-3.5 min-h-10 rounded-xl border transition-all"
                  :class="!selectedWithdrawTokenAddr ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/30 hover:bg-primary/5'"
                  :disabled="txState !== 'idle'"
                  @click="selectedWithdrawTokenAddr = null; emit('selectWithdrawToken', strategy!.assetAddress as `0x${string}`)"
                >
                  <span class="text-sm font-medium">{{ strategy!.assetSymbol }}</span>
                  <span class="text-[10px] text-muted-foreground">Default</span>
                </button>
                <button
                  v-for="t in availableTokens.filter(tok => !isDirectToken(tok.token)).slice(0, 5)"
                  :key="t.token"
                  class="flex items-center gap-2 px-3.5 min-h-10 rounded-xl border transition-all"
                  :class="selectedWithdrawTokenAddr?.toLowerCase() === t.token.toLowerCase() ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/30 hover:bg-primary/5'"
                  :disabled="txState !== 'idle'"
                  @click="selectWithdrawToken(t)"
                >
                  <img
                    v-if="t.logoUri"
                    :src="t.logoUri"
                    :alt="t.symbol"
                    class="w-4 h-4 rounded-full"
                    @error="($event.target as HTMLImageElement).style.display = 'none'"
                  >
                  <span class="text-sm font-medium">{{ t.symbol }}</span>
                </button>
              </div>
            </div>

            <!-- No balance notice -->
            <p v-if="!loadingPosition && position.shares === 0n" class="text-sm text-muted-foreground text-center py-4">
              You haven't deposited yet. Add money first to start earning.
            </p>
          </div>

          <!-- Preview estimate (direct deposit) -->
          <div
            v-if="mode === 'deposit' && isDirectDeposit && previewFormatted && txState === 'idle'"
            class="p-3 bg-muted/60 rounded-xl flex items-center justify-between"
          >
            <span class="text-xs text-muted-foreground">You'll get approximately</span>
            <span class="text-sm font-medium font-mono">
              <Icon v-if="loadingPreview" name="lucide:loader-2" class="w-3.5 h-3.5 animate-spin inline mr-1" />
              ~{{ previewFormatted }} {{ strategy?.vaultSymbol }}
            </span>
          </div>

          <!-- Preview estimate (withdraw - direct) -->
          <div
            v-if="mode === 'withdraw' && isDirectWithdraw && previewFormatted && txState === 'idle'"
            class="p-3 bg-muted/60 rounded-xl flex items-center justify-between"
          >
            <span class="text-xs text-muted-foreground">You'll get approximately</span>
            <span class="text-sm font-medium font-mono">
              <Icon v-if="loadingPreview" name="lucide:loader-2" class="w-3.5 h-3.5 animate-spin inline mr-1" />
              ~{{ previewFormatted }} {{ strategy?.assetSymbol }}
            </span>
          </div>

          <!-- Zap withdraw estimate -->
          <div
            v-if="withdrawZapQuote && !isDirectWithdraw && mode === 'withdraw'"
            class="p-3 bg-muted/60 rounded-xl flex items-center justify-between"
          >
            <span class="text-xs text-muted-foreground">You'll get approximately</span>
            <span class="text-sm font-medium font-mono">
              ~{{ displayNum(formatUnits(BigInt(withdrawZapQuote.amountOut), selectedWithdrawTokenInfo?.decimals ?? 18), 4) }}
              {{ selectedWithdrawTokenInfo?.symbol }}
            </span>
          </div>

          <div v-if="fetchingWithdrawQuote" class="flex items-center justify-center gap-2 text-xs text-muted-foreground py-1">
            <Icon name="lucide:loader-2" class="w-3.5 h-3.5 animate-spin" />
            Calculating...
          </div>

          <!-- Zap deposit estimate -->
          <div
            v-if="zapQuote && !isDirectDeposit && mode === 'deposit'"
            class="p-3 bg-muted/60 rounded-xl flex items-center justify-between"
          >
            <span class="text-xs text-muted-foreground">You'll get approximately</span>
            <span class="text-sm font-medium font-mono">
              ~{{ displayNum(formatUnits(BigInt(zapQuote.amountOut), strategy?.decimals ?? 18), 4) }}
              {{ strategy?.vaultSymbol }}
            </span>
          </div>

          <div v-if="fetchingQuote" class="flex items-center justify-center gap-2 text-xs text-muted-foreground py-1">
            <Icon name="lucide:loader-2" class="w-3.5 h-3.5 animate-spin" />
            Calculating...
          </div>

          <!-- Confetti on success -->
          <div v-if="txState === 'confirmed'" class="relative flex justify-center -mb-2">
            <div class="absolute inset-x-0 flex justify-center pointer-events-none">
              <span
                v-for="i in 12"
                :key="i"
                class="absolute w-2 h-2 rounded-full animate-confetti"
                :class="[
                  ['bg-primary', 'bg-emerald-400', 'bg-blue-400', 'bg-violet-400', 'bg-amber-400', 'bg-pink-400'][i % 6],
                ]"
                :style="{
                  left: `${15 + (i * 70 / 12)}%`,
                  animationDelay: `${i * 0.08}s`,
                  transform: `rotate(${i * 30}deg)`,
                }"
              />
            </div>
          </div>

          <!-- Action button -->
          <Button
            class="w-full h-13 text-base font-semibold rounded-xl"
            :class="txState !== 'failed' ? 'bg-primary text-primary-foreground hover:bg-primary/90' : ''"
            :variant="txState === 'failed' ? 'destructive' : 'default'"
            :disabled="!canSubmit && txState === 'idle'"
            @click="handleAction"
          >
            <template v-if="isTxActive">
              <Icon name="lucide:loader-2" class="w-4 h-4 mr-2 animate-spin" />
              {{ TX_STATUS_LABEL[txState] }}
            </template>
            <template v-else-if="txState === 'confirmed'">
              <Icon name="lucide:check-circle" class="w-4 h-4 mr-2" />
              All done!
            </template>
            <template v-else-if="txState === 'failed'">
              <Icon name="lucide:rotate-ccw" class="w-4 h-4 mr-2" />
              Try again
            </template>
            <template v-else>
              {{ mode === 'deposit' ? 'Deposit' : 'Withdraw' }}
            </template>
          </Button>

          <!-- TX STATUS -->
          <div v-if="txState !== 'idle'" class="space-y-2 pt-1">
            <div class="flex items-center gap-2 text-sm">
              <span
                class="w-2 h-2 rounded-full shrink-0"
                :class="{
                  'bg-amber-400 animate-pulse': isTxActive,
                  'bg-primary': txState === 'confirmed',
                  'bg-destructive': txState === 'failed',
                }"
              />
              <span
                :class="{
                  'text-muted-foreground': isTxActive,
                  'text-primary': txState === 'confirmed',
                  'text-destructive': txState === 'failed',
                }"
              >
                {{ TX_STATUS_LABEL[txState] }}
              </span>
            </div>

            <p v-if="txError" class="text-xs text-destructive">
              {{ txError }}
            </p>

            <a
              v-if="txHash"
              :href="`https://basescan.org/tx/${txHash}`"
              target="_blank"
              rel="noopener"
              class="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              View receipt
              <Icon name="lucide:external-link" class="w-3 h-3" />
            </a>
          </div>

          <!-- Trust micro-copy -->
          <div class="flex items-center justify-center gap-1.5 pt-2 pb-1 text-[11px] text-muted-foreground/50">
            <Icon name="lucide:shield-check" class="w-3 h-3" />
            Your funds stay in your wallet
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
