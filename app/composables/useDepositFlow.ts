import { parseUnits } from 'viem'
import { STRATEGIES, type StrategyKey, type Strategy } from '~/config/strategies'
import type { DbPocket } from '~/types/database'
import type { ZapQuote } from '~/composables/useEnso'
import type { WalletToken } from '~/composables/useWalletTokens'

export interface DepositFlowDeps {
  address: Ref<`0x${string}` | undefined>
  deposit: (strategy: Strategy, amount: bigint) => Promise<void>
  redeem: (strategy: Strategy, amount: bigint) => Promise<void>
  zapDeposit: (strategy: Strategy, tokenIn: `0x${string}`, amountWei: string) => Promise<void>
  zapWithdraw: (strategy: Strategy, shares: bigint, tokenOut: `0x${string}`) => Promise<void>
  reset: () => void
  getZapQuote: (tokenIn: `0x${string}`, strategy: Strategy, amountWei: string, sender: `0x${string}`) => Promise<ZapQuote | null>
  getZapWithdrawQuote: (strategy: Strategy, tokenOut: `0x${string}`, shares: string, sender: `0x${string}`) => Promise<ZapQuote | null>
  NATIVE_TOKEN: string
  walletTokens: Ref<WalletToken[]>
  fetchWalletTokens: () => Promise<void>
  fetchPocketPosition: (pocket: DbPocket) => void
}

export function useDepositFlow(deps: DepositFlowDeps) {
  const selectedPocket = ref<DbPocket | null>(null)
  const showDepositDialog = ref(false)
  const selectedTokenIn = ref<`0x${string}` | null>(null)
  const depositAmount = ref('')
  const zapQuote = ref<ZapQuote | null>(null)
  const fetchingQuote = ref(false)
  const lastTxType = ref<'deposit' | 'withdraw' | 'redeem'>('deposit')
  const lastTxAmount = ref('')

  const selectedWithdrawToken = ref<`0x${string}` | null>(null)
  const withdrawZapQuote = ref<ZapQuote | null>(null)
  const fetchingWithdrawQuote = ref(false)

  const selectedStrategy = computed(() =>
    selectedPocket.value
      ? STRATEGIES[selectedPocket.value.strategy_key as StrategyKey]
      : null,
  )

  function openDepositDialog(pocket: DbPocket, mode: 'deposit' | 'withdraw' = 'deposit') {
    selectedPocket.value = pocket
    depositAmount.value = ''
    selectedTokenIn.value = null
    zapQuote.value = null
    deps.reset()
    showDepositDialog.value = true
    deps.fetchPocketPosition(pocket)
    if (mode === 'deposit') deps.fetchWalletTokens()
  }

  // Zap quote debouncing
  const isDirectDeposit = computed(() => {
    if (!selectedTokenIn.value || !selectedStrategy.value) return true
    const vaultAsset = selectedStrategy.value.type === 'native'
      ? deps.NATIVE_TOKEN
      : selectedStrategy.value.assetAddress
    return selectedTokenIn.value.toLowerCase() === vaultAsset.toLowerCase()
  })

  const isDirectWithdraw = computed(() => {
    if (!selectedWithdrawToken.value || !selectedStrategy.value) return true
    const vaultAsset = selectedStrategy.value.type === 'native'
      ? deps.NATIVE_TOKEN
      : selectedStrategy.value.assetAddress
    return selectedWithdrawToken.value.toLowerCase() === vaultAsset.toLowerCase()
  })

  // Withdraw quote debouncing
  let withdrawQuoteTimeout: ReturnType<typeof setTimeout> | null = null
  watch([selectedWithdrawToken, depositAmount], () => {
    withdrawZapQuote.value = null
    if (withdrawQuoteTimeout) clearTimeout(withdrawQuoteTimeout)
    if (!selectedWithdrawToken.value || !depositAmount.value || !selectedStrategy.value || !deps.address.value) return
    if (isDirectWithdraw.value) return

    withdrawQuoteTimeout = setTimeout(async () => {
      fetchingWithdrawQuote.value = true
      try {
        const shares = parseUnits(depositAmount.value, selectedStrategy.value!.decimals).toString()
        withdrawZapQuote.value = await deps.getZapWithdrawQuote(
          selectedStrategy.value!,
          selectedWithdrawToken.value!,
          shares,
          deps.address.value!,
        )
      } finally {
        fetchingWithdrawQuote.value = false
      }
    }, 800)
  })

  let quoteTimeout: ReturnType<typeof setTimeout> | null = null
  watch([selectedTokenIn, depositAmount], () => {
    zapQuote.value = null
    if (quoteTimeout) clearTimeout(quoteTimeout)
    if (!selectedTokenIn.value || !depositAmount.value || !selectedStrategy.value || !deps.address.value) return
    if (isDirectDeposit.value) return

    const tokenBal = deps.walletTokens.value.find(
      t => t.token?.toLowerCase() === selectedTokenIn.value?.toLowerCase(),
    )

    quoteTimeout = setTimeout(async () => {
      fetchingQuote.value = true
      try {
        const decimals = tokenBal?.decimals ?? 18
        const amountWei = parseUnits(depositAmount.value, decimals).toString()
        zapQuote.value = await deps.getZapQuote(selectedTokenIn.value!, selectedStrategy.value!, amountWei, deps.address.value!)
      } finally {
        fetchingQuote.value = false
      }
    }, 800)
  })

  async function handleDeposit(payload: { tokenIn: `0x${string}`; amount: string; isDirect: boolean }) {
    const strategy = selectedStrategy.value
    if (!strategy || !deps.address.value || !selectedPocket.value) return

    lastTxType.value = 'deposit'

    if (payload.isDirect) {
      lastTxAmount.value = payload.amount
      const parsed = parseUnits(payload.amount, strategy.decimals)
      if (parsed === 0n) return
      await deps.deposit(strategy, parsed)
    } else if (zapQuote.value) {
      // Record the estimated vault asset amount (e.g. USDC), not the input token amount
      const amountOutFloat = parseFloat(zapQuote.value.amountOut) / 10 ** strategy.decimals
      lastTxAmount.value = amountOutFloat > 0 ? amountOutFloat.toString() : payload.amount
      const tokenBal = deps.walletTokens.value.find(
        t => t.token?.toLowerCase() === payload.tokenIn.toLowerCase(),
      )
      const decimals = tokenBal?.decimals ?? 18
      const amountWei = parseUnits(payload.amount, decimals).toString()
      await deps.zapDeposit(strategy, payload.tokenIn, amountWei)
    }
  }

  async function handleWithdraw(payload: { amount: string; tokenOut?: `0x${string}` }) {
    const strategy = selectedStrategy.value
    if (!strategy || !deps.address.value || !selectedPocket.value) return

    lastTxType.value = 'redeem'
    // Always record in vault asset units (the shares amount maps 1:1 to asset for recording)
    lastTxAmount.value = payload.amount

    const parsed = parseUnits(payload.amount, strategy.decimals)
    if (parsed === 0n) return

    // If a non-default token is selected and we have a zap quote, use zapWithdraw
    if (payload.tokenOut && !isDirectWithdraw.value) {
      await deps.zapWithdraw(strategy, parsed, payload.tokenOut)
    } else {
      await deps.redeem(strategy, parsed)
    }
  }

  function handleSelectToken(token: `0x${string}`) {
    selectedTokenIn.value = token
    depositAmount.value = ''
    zapQuote.value = null
  }

  function handleUpdateAmount(amount: string) {
    depositAmount.value = amount
  }

  function handleSelectWithdrawToken(token: `0x${string}`) {
    selectedWithdrawToken.value = token
    depositAmount.value = ''
    withdrawZapQuote.value = null
  }

  function handleChangeMode(mode: 'deposit' | 'withdraw') {
    depositAmount.value = ''
    selectedTokenIn.value = null
    selectedWithdrawToken.value = null
    zapQuote.value = null
    withdrawZapQuote.value = null
    if (mode === 'deposit' || mode === 'withdraw') deps.fetchWalletTokens()
  }

  return {
    selectedPocket,
    showDepositDialog,
    selectedTokenIn,
    selectedWithdrawToken,
    depositAmount,
    zapQuote,
    withdrawZapQuote,
    fetchingQuote,
    fetchingWithdrawQuote,
    lastTxType,
    lastTxAmount,
    selectedStrategy,
    isDirectWithdraw,
    openDepositDialog,
    handleDeposit,
    handleWithdraw,
    handleSelectToken,
    handleSelectWithdrawToken,
    handleUpdateAmount,
    handleChangeMode,
  }
}
