import { parseUnits } from 'viem'
import { STRATEGIES, type StrategyKey, type Strategy } from '~/config/strategies'
import type { DbPocket } from '~/types/database'
import type { LifiQuote } from '~/composables/useLifi'
import type { WalletToken } from '~/composables/useWalletTokens'

export interface DepositFlowDeps {
  address: Ref<`0x${string}` | undefined>
  deposit: (strategy: Strategy, amount: bigint) => Promise<void>
  redeem: (strategy: Strategy, amount: bigint) => Promise<void>
  lifiDeposit: (params: {
    fromChain: number
    fromToken: string
    fromAmount: string
    vaultAddress: string
    vaultChainId: number
    quote?: LifiQuote
  }) => Promise<void>
  reset: () => void
  getLifiDepositQuote: (params: {
    fromChain: number
    fromToken: string
    fromAmount: string
    fromAddress: string
    toChain: number
    vaultAddress: string
  }) => Promise<LifiQuote | null>
  NATIVE_TOKEN: string
  walletTokens: Ref<WalletToken[]>
  fetchWalletTokens: () => Promise<void>
  fetchPocketPosition: (pocket: DbPocket) => void
  lifiVaultAddress: Ref<string | null>
  lifiVaultChainId: Ref<number | null>
}

export function useDepositFlow(deps: DepositFlowDeps) {
  const selectedPocket = ref<DbPocket | null>(null)
  const showDepositDialog = ref(false)

  const selectedTokenIn = ref<`0x${string}` | null>(null)
  const selectedFromChain = ref<number>(1)
  const depositAmount = ref('')
  const lifiQuote = ref<LifiQuote | null>(null)
  const fetchingQuote = ref(false)
  const lastTxType = ref<'deposit' | 'withdraw' | 'redeem'>('deposit')
  const lastTxAmount = ref('')

  const selectedStrategy = computed(() =>
    selectedPocket.value
      ? STRATEGIES[selectedPocket.value.strategy_key as StrategyKey]
      : null,
  )

  const isDirectDeposit = computed(() => {
    if (!selectedTokenIn.value || !selectedStrategy.value) return true
    const vaultAsset = selectedStrategy.value.type === 'native'
      ? deps.NATIVE_TOKEN
      : selectedStrategy.value.assetAddress
    return selectedTokenIn.value.toLowerCase() === vaultAsset.toLowerCase()
  })

  const useLifiForDeposit = computed(() => !!deps.lifiVaultAddress.value)

  function openDepositDialog(pocket: DbPocket, mode: 'deposit' | 'withdraw' = 'deposit') {
    selectedPocket.value = pocket
    depositAmount.value = ''
    selectedTokenIn.value = null
    selectedFromChain.value = 1
    lifiQuote.value = null
    deps.reset()
    showDepositDialog.value = true
    deps.fetchPocketPosition(pocket)
    if (mode === 'deposit') deps.fetchWalletTokens()
  }

  // ── Deposit quote debouncing ───────────────────────────────────────────────
  let quoteTimeout: ReturnType<typeof setTimeout> | null = null
  watch([selectedTokenIn, selectedFromChain, depositAmount], () => {
    lifiQuote.value = null
    if (quoteTimeout) clearTimeout(quoteTimeout)
    if (!selectedTokenIn.value || !depositAmount.value || !selectedStrategy.value || !deps.address.value) return
    if (isDirectDeposit.value || !useLifiForDeposit.value) return

    quoteTimeout = setTimeout(async () => {
      fetchingQuote.value = true
      try {
        const tokenBal = deps.walletTokens.value.find(
          t => t.token?.toLowerCase() === selectedTokenIn.value?.toLowerCase(),
        )
        const decimals = tokenBal?.decimals ?? 18
        const amountWei = parseUnits(depositAmount.value, decimals).toString()

        if (deps.lifiVaultAddress.value && deps.lifiVaultChainId.value) {
          lifiQuote.value = await deps.getLifiDepositQuote({
            fromChain: selectedFromChain.value,
            fromToken: selectedTokenIn.value!,
            fromAmount: amountWei,
            fromAddress: deps.address.value!,
            toChain: deps.lifiVaultChainId.value,
            vaultAddress: deps.lifiVaultAddress.value,
          })
        }
      } finally {
        fetchingQuote.value = false
      }
    }, 800)
  })

  // ── Deposit handler ────────────────────────────────────────────────────────
  async function handleDeposit(payload: { tokenIn: `0x${string}`; amount: string; isDirect: boolean }) {
    const strategy = selectedStrategy.value
    if (!strategy || !deps.address.value || !selectedPocket.value) return

    lastTxType.value = 'deposit'

    // Path 1: LI.FI Composer (crosschain or same-chain non-direct)
    if (useLifiForDeposit.value && deps.lifiVaultAddress.value && deps.lifiVaultChainId.value) {
      const tokenBal = deps.walletTokens.value.find(
        t => t.token?.toLowerCase() === payload.tokenIn.toLowerCase(),
      )
      const decimals = tokenBal?.decimals ?? 18
      const amountWei = parseUnits(payload.amount, decimals).toString()

      lastTxAmount.value = lifiQuote.value?.estimate?.toAmountUSD
        ? lifiQuote.value.estimate.toAmountUSD
        : payload.amount

      await deps.lifiDeposit({
        fromChain: selectedFromChain.value,
        fromToken: payload.tokenIn,
        fromAmount: amountWei,
        vaultAddress: deps.lifiVaultAddress.value,
        vaultChainId: deps.lifiVaultChainId.value,
        quote: lifiQuote.value ?? undefined,
      })
      return
    }

    // Path 2: Direct Yo deposit (same chain, same token)
    lastTxAmount.value = payload.amount
    const parsed = parseUnits(payload.amount, strategy.decimals)
    if (parsed === 0n) return
    await deps.deposit(strategy, parsed)
  }

  // ── Withdraw handler ───────────────────────────────────────────────────────
  async function handleWithdraw(payload: { amount: string }) {
    const strategy = selectedStrategy.value
    if (!strategy || !deps.address.value || !selectedPocket.value) return

    lastTxType.value = 'redeem'
    lastTxAmount.value = payload.amount

    const parsed = parseUnits(payload.amount, strategy.decimals)
    if (parsed === 0n) return

    await deps.redeem(strategy, parsed)
  }

  // ── Event handlers ─────────────────────────────────────────────────────────
  function handleSelectToken(token: `0x${string}`) {
    selectedTokenIn.value = token
    depositAmount.value = ''
    lifiQuote.value = null
  }

  function handleSelectFromChain(chainId: number) {
    selectedFromChain.value = chainId
    lifiQuote.value = null
  }

  function handleUpdateAmount(amount: string) {
    depositAmount.value = amount
  }

  function handleChangeMode(mode: 'deposit' | 'withdraw') {
    depositAmount.value = ''
    selectedTokenIn.value = null
    selectedFromChain.value = 1
    lifiQuote.value = null
    if (mode === 'deposit' || mode === 'withdraw') deps.fetchWalletTokens()
  }

  return {
    selectedPocket,
    showDepositDialog,
    selectedTokenIn,
    selectedFromChain,
    depositAmount,
    lifiQuote,
    fetchingQuote,
    lastTxType,
    lastTxAmount,
    selectedStrategy,
    isDirectDeposit,
    useLifiForDeposit,
    openDepositDialog,
    handleDeposit,
    handleWithdraw,
    handleSelectToken,
    handleSelectFromChain,
    handleUpdateAmount,
    handleChangeMode,
  }
}
