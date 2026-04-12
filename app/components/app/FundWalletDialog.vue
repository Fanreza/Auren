<script setup lang="ts">
import { parseUnits } from 'viem'
import { usePrivyAuth } from '~/composables/usePrivy'
import { getPrivy } from '~/config/privy'
import { getCoinbaseOnRampUrl } from '@privy-io/js-sdk-core'
import type { PickedToken } from '~/components/app/AppTokenChainPicker.vue'

const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{
  funded: []
}>()

const props = defineProps<{
  address: string
  walletTokens?: any[]
  defaultTab?: 'transfer' | 'buy' | 'withdraw' | 'swap'
}>()

const { eoaWalletAddress, getPublicClient, getWalletClient } = usePrivyAuth()

const copied = ref(false)
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const

function copyAddress() {
  navigator.clipboard.writeText(props.address)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}
function truncate(addr: string) {
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`
}

// ── Mode ─────────────────────────────────────────────────────────────────────
const mode = ref<'transfer' | 'buy' | 'withdraw' | 'swap'>('transfer')

// ── Transfer: token picker + LI.FI swap ──────────────────────────────────────
const fromToken = ref<PickedToken | null>(null)
const amount = ref('')
const showPicker = ref(false)
const transferring = ref(false)
const transferStep = ref<'idle' | 'approving' | 'swapping' | 'confirming' | 'done'>('idle')
const transferError = ref('')
const transferDone = ref(false)
const showConfetti = ref(false)

// Quote state
const quote = ref<any>(null)
const quotesLoading = ref(false)
let quoteTimer: ReturnType<typeof setTimeout> | null = null

const fromBalance = computed(() => fromToken.value?.balance ?? null)

const amountUsd = computed(() => {
  if (!amount.value || !fromToken.value?.priceUSD) return null
  const v = parseFloat(amount.value) * fromToken.value.priceUSD
  return v > 0 ? '$' + v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : null
})

const amountError = computed(() => {
  if (!amount.value || !fromToken.value) return null
  const val = parseFloat(amount.value)
  if (isNaN(val) || val <= 0) return 'Enter a valid amount'
  if (fromBalance.value && val > parseFloat(fromBalance.value)) return 'Insufficient balance'
  return null
})

const canTransfer = computed(() =>
  !!fromToken.value && !!amount.value && !amountError.value &&
  parseFloat(amount.value) > 0,
)

const isDirectUsdc = computed(() =>
  fromToken.value?.address?.toLowerCase() === USDC_BASE.toLowerCase() &&
  fromToken.value?.chainId === 8453,
)

const estimatedOutput = computed(() => {
  if (!quote.value?.estimate?.toAmount) return null
  const dec = 6 // USDC decimals
  return (Number(quote.value.estimate.toAmount) / 10 ** dec).toFixed(2)
})

function setMax() {
  if (fromBalance.value) amount.value = fromBalance.value
}

function handleTokenSelected(t: PickedToken) {
  fromToken.value = t
  amount.value = ''
  quote.value = null
}

// Fetch quote when amount/token changes
watch([amount, fromToken], () => {
  quote.value = null
  if (quoteTimer) clearTimeout(quoteTimer)
  if (!amount.value || !fromToken.value) return
  if (parseFloat(amount.value) <= 0 || amountError.value) return
  if (isDirectUsdc.value) return
  // Use EOA as fromAddress, fall back to smart account address
  quoteTimer = setTimeout(fetchQuote, 800)
})

async function fetchQuote() {
  if (!fromToken.value || !amount.value) return
  const sender = eoaWalletAddress.value ?? props.address
  quotesLoading.value = true
  try {
    const decimals = fromToken.value.decimals
    const amtStr = String(amount.value)
    const parts = amtStr.split('.')
    const truncated = parts[1] ? `${parts[0]}.${parts[1].slice(0, decimals)}` : parts[0]
    const wei = parseUnits(truncated, decimals).toString()
    // Normalize native token address for LI.FI
    let tokenAddr = fromToken.value.address
    if (tokenAddr === '0x0000000000000000000000000000000000000000') {
      tokenAddr = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
    }
    quote.value = await $fetch<any>('/api/lifi/quote', {
      query: {
        fromChain: fromToken.value.chainId,
        toChain: 8453,
        fromToken: tokenAddr,
        toToken: USDC_BASE,
        fromAmount: wei,
        fromAddress: sender,
        toAddress: props.address,
        slippage: 0.005,
      },
    })
  } catch (e) {
    console.error('[fund] quote failed:', e)
    quote.value = null
  } finally {
    quotesLoading.value = false
  }
}

async function executeTransfer() {
  if (!eoaWalletAddress.value || !fromToken.value || !amount.value) return
  transferring.value = true
  transferStep.value = 'idle'
  transferError.value = ''
  transferDone.value = false

  try {
    const provider = typeof window !== 'undefined' ? (window as any).ethereum : null
    if (!provider) { transferError.value = 'No wallet provider'; return }

    const token = fromToken.value
    const amtStr = String(amount.value)
    const pts = amtStr.split('.')
    const truncated = pts[1] ? `${pts[0]}.${pts[1].slice(0, token.decimals)}` : pts[0]
    const wei = parseUnits(truncated, token.decimals).toString()

    if (isDirectUsdc.value) {
      transferStep.value = 'swapping'
      const { encodeFunctionData, parseAbi } = await import('viem')
      const data = encodeFunctionData({
        abi: parseAbi(['function transfer(address to, uint256 amount) returns (bool)']),
        functionName: 'transfer',
        args: [props.address as `0x${string}`, BigInt(wei)],
      })
      const hash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{ from: eoaWalletAddress.value, to: USDC_BASE, data }],
      })
      transferStep.value = 'confirming'
      await getPublicClient().waitForTransactionReceipt({ hash })
    } else {
      if (!quote.value?.transactionRequest) {
        transferError.value = 'No route found. Try a different token.'
        return
      }

      // Approve if needed (skip native ETH)
      const isNative = token.address === '0x0000000000000000000000000000000000000000' || token.address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
      if (!isNative && quote.value.estimate?.approvalAddress) {
        transferStep.value = 'approving'
        const { encodeFunctionData, parseAbi } = await import('viem')
        const pub = getPublicClient()
        const allowance = await pub.readContract({
          address: token.address as `0x${string}`,
          abi: parseAbi(['function allowance(address,address) view returns (uint256)']),
          functionName: 'allowance',
          args: [eoaWalletAddress.value, quote.value.estimate.approvalAddress as `0x${string}`],
        })
        if (BigInt(allowance) < BigInt(wei)) {
          const data = encodeFunctionData({
            abi: parseAbi(['function approve(address,uint256) returns (bool)']),
            functionName: 'approve',
            args: [quote.value.estimate.approvalAddress as `0x${string}`, BigInt(2) ** BigInt(256) - BigInt(1)],
          })
          const hash = await provider.request({
            method: 'eth_sendTransaction',
            params: [{ from: eoaWalletAddress.value, to: token.address, data }],
          })
          await getPublicClient().waitForTransactionReceipt({ hash })
        }
      }

      // Execute swap
      transferStep.value = 'swapping'
      const tx = quote.value.transactionRequest
      const hash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: eoaWalletAddress.value,
          to: tx.to,
          data: tx.data,
          value: tx.value ? `0x${BigInt(tx.value).toString(16)}` : '0x0',
        }],
      })
      transferStep.value = 'confirming'
      await getPublicClient().waitForTransactionReceipt({ hash })
    }

    // Success
    transferStep.value = 'done'
    transferDone.value = true
    showConfetti.value = true
    emit('funded')

    setTimeout(() => {
      open.value = false
      showConfetti.value = false
    }, 3000)
  } catch (e: any) {
    console.error('[fund] transfer failed:', e)
    transferError.value = e.shortMessage || e.message || 'Transfer failed'
    transferStep.value = 'idle'
  } finally {
    transferring.value = false
  }
}

// ── Withdraw: send from smart account to EOA or custom address ───────────────
const withdrawAmount = ref('')
const withdrawTo = ref('eoa') // 'eoa' or 'custom'
const withdrawCustomAddr = ref('')
const withdrawing = ref(false)
const withdrawStep = ref<'idle' | 'sending' | 'confirming' | 'done'>('idle')
const withdrawError = ref('')
const withdrawDone = ref(false)

// Smart account USDC balance
const smartBalance = ref<string | null>(null)
const loadingSmartBalance = ref(false)

async function fetchSmartBalance() {
  if (!props.address) return
  loadingSmartBalance.value = true
  try {
    const { parseAbi } = await import('viem')
    const pub = getPublicClient()
    const raw = await pub.readContract({
      address: USDC_BASE,
      abi: parseAbi(['function balanceOf(address) view returns (uint256)']),
      functionName: 'balanceOf',
      args: [props.address as `0x${string}`],
    })
    smartBalance.value = (Number(raw) / 1e6).toFixed(2)
  } catch (e) {
    console.error('[fund] balance fetch failed:', e)
    smartBalance.value = '0'
  } finally {
    loadingSmartBalance.value = false
  }
}

// Estimate gas cost in USDC from Pimlico using exact formula:
// maxCostInToken = ((totalGas + postOpGas) * maxFeePerGas * exchangeRate) / 1e18
const gasReserveUsdc = ref(0)

async function estimateGasReserve() {
  try {
    const { createPimlicoClient } = await import('permissionless/clients/pimlico')
    const { http } = await import('viem')
    const { entryPoint07Address } = await import('viem/account-abstraction')
    const { base } = await import('viem/chains')
    const config = useRuntimeConfig()
    const pimlicoApiKey = (config.public.pimlicoApiKey as string)?.trim()
    if (!pimlicoApiKey) return

    const pimlicoClient = createPimlicoClient({
      chain: base,
      transport: http(`https://api.pimlico.io/v2/base/rpc?apikey=${pimlicoApiKey}`),
      entryPoint: { address: entryPoint07Address, version: '0.7' },
    })

    const [quotes, gasPrice] = await Promise.all([
      pimlicoClient.getTokenQuotes({ tokens: [USDC_BASE] }),
      pimlicoClient.getUserOperationGasPrice(),
    ])

    if (quotes.length) {
      const q = quotes[0]
      const maxFee = gasPrice.fast.maxFeePerGas

      // Typical UserOp gas for ERC-20 transfer on Base:
      // preVerificationGas (~50k) + callGasLimit (~100k) + verificationGasLimit (~70k)
      // + paymasterVerificationGasLimit (~30k) + paymasterPostOpGasLimit (~70k)
      // Total ~320k for first tx (includes account deployment)
      // Subsequent txs ~150k
      const totalGas = 320000n
      const postOpGas = q.postOpGas

      // Pimlico formula: maxCostInToken = ((totalGas + postOpGas) * maxFeePerGas * exchangeRate) / 1e18
      const costInToken = ((totalGas + postOpGas) * maxFee * q.exchangeRate) / (10n ** 18n)
      const usdcAmount = Number(costInToken) / 1e6

      gasReserveUsdc.value = usdcAmount
      console.log(`[fund] gas reserve: $${usdcAmount.toFixed(6)} USDC (postOpGas=${q.postOpGas}, maxFee=${maxFee}, rate=${q.exchangeRate})`)
    }
  } catch (e) {
    console.warn('[fund] gas estimate failed:', e)
    gasReserveUsdc.value = 0.01 // safe fallback for Base
  }
}

const maxWithdrawable = computed(() => {
  const bal = parseFloat(smartBalance.value ?? '0')
  return Math.max(bal - gasReserveUsdc.value, 0)
})

const withdrawDest = computed(() => {
  if (withdrawTo.value === 'eoa') return eoaWalletAddress.value ?? null
  const addr = withdrawCustomAddr.value.trim()
  return addr.startsWith('0x') && addr.length === 42 ? addr : null
})

const canWithdraw = computed(() => {
  const amt = parseFloat(withdrawAmount.value)
  return !isNaN(amt) && amt > 0 && amt <= maxWithdrawable.value && !!withdrawDest.value
})

const withdrawBalanceError = computed(() => {
  const bal = parseFloat(smartBalance.value ?? '0')
  if (bal === 0) return 'No USDC in savings account'
  const gasFmt = gasReserveUsdc.value < 0.01 ? gasReserveUsdc.value.toFixed(4) : gasReserveUsdc.value.toFixed(2)
  if (maxWithdrawable.value <= 0.001) return `Balance too low — need ~$${gasFmt} for gas`
  const amt = parseFloat(withdrawAmount.value)
  if (amt > maxWithdrawable.value) return `Max: $${maxWithdrawable.value.toFixed(4)} ($${gasFmt} reserved for gas)`
  return null
})

async function executeWithdraw() {
  if (!withdrawDest.value || !withdrawAmount.value) return
  withdrawing.value = true
  withdrawStep.value = 'sending'
  withdrawError.value = ''
  withdrawDone.value = false

  try {
    const { getWalletClient } = usePrivyAuth()
    const client = await getWalletClient()
    const { encodeFunctionData, parseAbi } = await import('viem')

    // prepareUserOperationForErc20Paymaster in useSmartAccount.ts
    // auto-handles paymaster USDC approval — no manual approve needed
    const data = encodeFunctionData({
      abi: parseAbi(['function transfer(address to, uint256 amount) returns (bool)']),
      functionName: 'transfer',
      args: [withdrawDest.value as `0x${string}`, parseUnits(String(withdrawAmount.value), 6)],
    })

    const hash = await client.sendTransaction({
      to: USDC_BASE as `0x${string}`,
      data: data as `0x${string}`,
    })

    withdrawStep.value = 'confirming'
    await getPublicClient().waitForTransactionReceipt({ hash })

    withdrawStep.value = 'done'
    withdrawDone.value = true
    showConfetti.value = true
    fetchSmartBalance()
    emit('funded')

    setTimeout(() => {
      open.value = false
      showConfetti.value = false
    }, 3000)
  } catch (e: any) {
    console.error('[fund] withdraw failed:', e)
    withdrawError.value = e.shortMessage || e.message || 'Withdrawal failed'
    withdrawStep.value = 'idle'
  } finally {
    withdrawing.value = false
  }
}

// ── Swap: swap tokens inside smart account via LI.FI ────────────────────────
// FROM = any token in smart account (picker), TO = USDC/WETH/cbBTC/ETH on Base.
// Gas paid in USDC by Pimlico paymaster (via smart account client middleware).
const SWAP_OUTPUTS = [
  { address: USDC_BASE, symbol: 'USDC', decimals: 6, logo: 'https://assets.coingecko.com/coins/images/6319/standard/usdc.png' },
  { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', decimals: 18, logo: 'https://assets.coingecko.com/coins/images/2518/standard/weth.png' },
  { address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', symbol: 'cbBTC', decimals: 8, logo: 'https://assets.coingecko.com/coins/images/1/standard/bitcoin.png' },
  { address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', symbol: 'ETH', decimals: 18, logo: 'https://assets.coingecko.com/coins/images/279/standard/ethereum.png' },
]

const swapFromToken = ref<PickedToken | null>(null)
const swapToToken = ref<{ address: string; symbol: string; decimals: number; logo?: string }>(SWAP_OUTPUTS[0])
const swapAmount = ref('')
const showSwapPicker = ref(false)
const showSwapToPicker = ref(false)
const swapQuote = ref<any>(null)
const swapQuoteLoading = ref(false)
let swapQuoteTimer: ReturnType<typeof setTimeout> | null = null
const swapping = ref(false)
const swapStep = ref<'idle' | 'approving' | 'swapping' | 'confirming' | 'done'>('idle')
const swapError = ref('')
const swapDone = ref(false)

const swapFromBalance = computed(() => swapFromToken.value?.balance ?? null)

const swapAmountError = computed(() => {
  if (!swapAmount.value || !swapFromToken.value) return null
  const val = parseFloat(swapAmount.value)
  if (isNaN(val) || val <= 0) return 'Enter a valid amount'
  if (swapFromBalance.value && val > parseFloat(swapFromBalance.value)) return 'Insufficient balance'
  return null
})

const swapIsSameToken = computed(() => {
  if (!swapFromToken.value) return false
  const from = swapFromToken.value.address.toLowerCase()
  const to = swapToToken.value.address.toLowerCase()
  if (from === to) return true
  // Native ETH ↔ WETH treated as same (no swap needed to wrap/unwrap for display)
  return false
})

const swapEstimatedOutput = computed(() => {
  if (!swapQuote.value?.estimate?.toAmount) return null
  return (Number(swapQuote.value.estimate.toAmount) / 10 ** swapToToken.value.decimals).toFixed(6)
})

const canSwap = computed(() =>
  !!swapFromToken.value && !!swapAmount.value && !swapAmountError.value &&
  parseFloat(swapAmount.value) > 0 && !swapIsSameToken.value && !!swapQuote.value,
)

function setSwapMax() {
  if (swapFromBalance.value) swapAmount.value = swapFromBalance.value
}

function handleSwapTokenSelected(t: PickedToken) {
  swapFromToken.value = t
  swapAmount.value = ''
  swapQuote.value = null
}

function handleSwapToTokenSelected(t: PickedToken) {
  swapToToken.value = {
    address: t.address,
    symbol: t.symbol,
    decimals: t.decimals,
    logo: t.logoURI,
  }
  swapQuote.value = null
}

watch([swapAmount, swapFromToken, swapToToken], () => {
  swapQuote.value = null
  if (swapQuoteTimer) clearTimeout(swapQuoteTimer)
  if (!swapAmount.value || !swapFromToken.value) return
  if (parseFloat(swapAmount.value) <= 0 || swapAmountError.value) return
  if (swapIsSameToken.value) return
  swapQuoteTimer = setTimeout(fetchSwapQuote, 800)
})

async function fetchSwapQuote() {
  if (!swapFromToken.value || !swapAmount.value) return
  swapQuoteLoading.value = true
  try {
    const decimals = swapFromToken.value.decimals
    const parts = String(swapAmount.value).split('.')
    const truncated = parts[1] ? `${parts[0]}.${parts[1].slice(0, decimals)}` : parts[0]
    const wei = parseUnits(truncated, decimals).toString()

    let fromAddr = swapFromToken.value.address
    if (fromAddr === '0x0000000000000000000000000000000000000000') {
      fromAddr = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
    }

    swapQuote.value = await $fetch<any>('/api/lifi/quote', {
      query: {
        fromChain: 8453,
        toChain: 8453,
        fromToken: fromAddr,
        toToken: swapToToken.value.address,
        fromAmount: wei,
        fromAddress: props.address,
        toAddress: props.address,
        slippage: 0.005,
      },
    })
  } catch (e) {
    console.error('[swap] quote failed:', e)
    swapQuote.value = null
  } finally {
    swapQuoteLoading.value = false
  }
}

async function executeSwap() {
  if (!canSwap.value || !swapFromToken.value || !swapQuote.value?.transactionRequest) return
  swapping.value = true
  swapStep.value = 'idle'
  swapError.value = ''
  swapDone.value = false

  try {
    const { encodeFunctionData, parseAbi } = await import('viem')
    const pub = getPublicClient()
    const client = await getWalletClient()  // smart account client — gas via paymaster

    const token = swapFromToken.value
    const parts = String(swapAmount.value).split('.')
    const truncated = parts[1] ? `${parts[0]}.${parts[1].slice(0, token.decimals)}` : parts[0]
    const wei = parseUnits(truncated, token.decimals)

    const isNative = token.address === '0x0000000000000000000000000000000000000000' ||
      token.address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'

    // Approve LI.FI router if ERC-20
    if (!isNative && swapQuote.value.estimate?.approvalAddress) {
      swapStep.value = 'approving'
      const spender = swapQuote.value.estimate.approvalAddress as `0x${string}`
      const allowance = await pub.readContract({
        address: token.address as `0x${string}`,
        abi: parseAbi(['function allowance(address,address) view returns (uint256)']),
        functionName: 'allowance',
        args: [props.address as `0x${string}`, spender],
      })
      if (BigInt(allowance) < wei) {
        const approveData = encodeFunctionData({
          abi: parseAbi(['function approve(address,uint256) returns (bool)']),
          functionName: 'approve',
          args: [spender, BigInt(2) ** BigInt(256) - BigInt(1)],
        })
        const approveHash = await client.sendTransaction({
          to: token.address as `0x${string}`,
          data: approveData,
        })
        await pub.waitForTransactionReceipt({ hash: approveHash })
      }
    }

    // Execute swap tx
    swapStep.value = 'swapping'
    const tx = swapQuote.value.transactionRequest
    const hash = await client.sendTransaction({
      to: tx.to as `0x${string}`,
      data: tx.data as `0x${string}`,
      value: tx.value ? BigInt(tx.value) : 0n,
    })
    swapStep.value = 'confirming'
    await pub.waitForTransactionReceipt({ hash })

    swapStep.value = 'done'
    swapDone.value = true
    showConfetti.value = true
    emit('funded')

    setTimeout(() => {
      open.value = false
      showConfetti.value = false
    }, 3000)
  } catch (e: any) {
    console.error('[swap] failed:', e)
    swapError.value = e.shortMessage || e.message || 'Swap failed'
    swapStep.value = 'idle'
  } finally {
    swapping.value = false
  }
}

// ── Onramp ───────────────────────────────────────────────────────────────────
const onrampLoading = ref<string | null>(null)

async function openCoinbaseOnramp() {
  onrampLoading.value = 'coinbase'
  try {
    const privy = getPrivy()
    const session = await privy.funding.coinbase.initOnRampSession({
      addresses: [{ address: props.address, blockchains: ['base'] }],
      assets: ['USDC'],
    })
    const { url } = getCoinbaseOnRampUrl({
      appId: session.app_id, input: session,
      amount: '50', blockchain: 'base', asset: 'USDC', experience: 'buy',
    })
    window.open(url.toString(), '_blank', 'width=460,height=700')
  } catch (e: any) {
    console.error('[fund] Coinbase onramp failed:', e)
  } finally { onrampLoading.value = null }
}

// Dialog title changes per active tab
const dialogTitle = computed(() => {
  switch (mode.value) {
    case 'transfer': return 'Transfer In'
    case 'buy':      return 'Buy USDC'
    case 'swap':     return 'Swap Tokens'
    case 'withdraw': return 'Withdraw'
    default:         return 'Fund Your Wallet'
  }
})

async function openMoonpayOnramp() {
  onrampLoading.value = 'moonpay'
  try {
    const privy = getPrivy()
    const { signedUrl } = await privy.funding.moonpay.sign({
      address: props.address,
      config: { currencyCode: 'USDC_BASE', uiConfig: { theme: 'dark', accentColor: '#86B238' } },
    })
    window.open(signedUrl, '_blank', 'width=460,height=700')
  } catch (e: any) {
    console.error('[fund] MoonPay onramp failed:', e)
  } finally { onrampLoading.value = null }
}

// ── Lifecycle ────────────────────────────────────────────────────────────────
watch(open, (val) => {
  if (val) {
    copied.value = false
    transferDone.value = false
    transferError.value = ''
    withdrawDone.value = false
    withdrawError.value = ''
    withdrawAmount.value = ''
    withdrawStep.value = 'idle'
    mode.value = props.defaultTab ?? 'transfer'
    fromToken.value = null
    amount.value = ''
    quote.value = null
    swapFromToken.value = null
    swapAmount.value = ''
    swapQuote.value = null
    swapDone.value = false
    swapError.value = ''
    swapStep.value = 'idle'
    fetchSmartBalance()
    estimateGasReserve()
  }
})

// Refetch balance when switching to withdraw tab
watch(mode, (val) => {
  if (val === 'withdraw') fetchSmartBalance()
})
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-md p-0 gap-0 max-h-[90dvh] overflow-y-auto">

      <!-- Header -->
      <div class="px-5 pt-5 pb-3 border-b border-border/40">
        <DialogHeader>
          <DialogTitle>{{ dialogTitle }}</DialogTitle>
          <DialogDescription class="sr-only">Transfer tokens or buy USDC to fund your savings account.</DialogDescription>
        </DialogHeader>
        <!-- Mode tabs -->
        <div class="flex gap-1 mt-3 bg-muted/40 rounded-lg p-1">
          <button
            v-for="tab in [
              { key: 'transfer', label: 'Transfer In' },
              { key: 'buy', label: 'Buy' },
              { key: 'swap', label: 'Swap' },
              { key: 'withdraw', label: 'Withdraw' },
            ]" :key="tab.key"
            class="flex-1 text-xs font-medium py-2 rounded-md transition-colors"
            :class="mode === tab.key ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'"
            @click="mode = tab.key as any"
          >
            {{ tab.label }}
          </button>
        </div>
      </div>

      <!-- ── Transfer mode ── -->
      <div v-if="mode === 'transfer'" class="px-5 py-5 space-y-2">

        <!-- FROM card -->
        <div class="rounded-2xl bg-muted/40 border border-border/40 p-4">
          <div class="flex items-center justify-between mb-2">
            <p class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">From your wallet</p>
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
              :class="fromToken ? 'bg-background/60 border-border/60 hover:border-primary/40' : 'bg-primary/10 border-primary/30 hover:bg-primary/15'"
              @click="showPicker = true"
            >
              <template v-if="fromToken">
                <div class="relative shrink-0">
                  <img v-if="fromToken.logoURI" :src="fromToken.logoURI" class="w-6 h-6 rounded-full" @error="($event.target as HTMLImageElement).style.display='none'" />
                  <img v-if="fromToken.chainLogoURI" :src="fromToken.chainLogoURI" class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border border-background bg-background" @error="($event.target as HTMLImageElement).style.display='none'" />
                </div>
                <span class="font-bold text-sm">{{ fromToken.symbol }}</span>
              </template>
              <template v-else>
                <Icon name="lucide:coins" class="w-4 h-4 text-primary" />
                <span class="font-semibold text-sm text-primary">Select</span>
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

        <!-- TO card -->
        <div class="rounded-2xl bg-muted/40 border border-border/40 p-4">
          <p class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">To your savings account</p>
          <div class="flex items-center gap-3">
            <div class="flex-1">
              <p class="text-3xl font-bold" :class="estimatedOutput || isDirectUsdc ? 'text-foreground' : 'text-muted-foreground/40'">
                {{ quotesLoading ? '...' : isDirectUsdc ? amount || '0' : estimatedOutput ?? '0' }}
              </p>
              <p class="text-xs text-muted-foreground/60 mt-0.5">USDC on Base</p>
            </div>
            <div class="flex items-center gap-2 bg-background/60 rounded-xl px-3 py-2 border border-border/60">
              <div class="w-6 h-6 rounded-full bg-[#2775CA]/20 flex items-center justify-center">
                <span class="text-[10px] font-bold text-[#2775CA]">$</span>
              </div>
              <span class="font-bold text-sm">USDC</span>
            </div>
          </div>
          <p class="text-[11px] text-muted-foreground/50 mt-2 font-mono">{{ truncate(address) }}</p>
        </div>

        <!-- Route info -->
        <div v-if="quotesLoading" class="flex items-center gap-1.5 text-xs text-muted-foreground px-1">
          <Icon name="lucide:loader-2" class="w-3 h-3 animate-spin" /> Finding best route...
        </div>
        <div v-else-if="quote && !isDirectUsdc" class="flex items-center gap-3 text-[11px] text-muted-foreground/60 px-1">
          <span v-if="fromToken?.chainId !== 8453" class="flex items-center gap-1 text-amber-400">
            <Icon name="lucide:zap" class="w-3 h-3" /> Cross-chain
          </span>
          <span>via LI.FI</span>
        </div>

        <!-- Progress steps (during transfer) -->
        <div v-if="transferring || transferDone" class="rounded-2xl bg-muted/40 border border-border/40 p-4">
          <div class="space-y-3">
            <div class="flex items-center gap-3">
              <Icon
                :name="transferStep === 'approving' ? 'lucide:loader-2' : 'lucide:check-circle-2'"
                class="w-4 h-4 shrink-0"
                :class="transferStep === 'approving' ? 'text-primary animate-spin' : 'text-primary'"
              />
              <span class="text-sm" :class="transferStep === 'approving' ? 'text-foreground' : 'text-muted-foreground'">
                Token approval
              </span>
            </div>
            <div class="flex items-center gap-3">
              <Icon
                :name="transferStep === 'swapping' ? 'lucide:loader-2' : transferStep === 'confirming' || transferStep === 'done' ? 'lucide:check-circle-2' : 'lucide:circle'"
                class="w-4 h-4 shrink-0"
                :class="transferStep === 'swapping' ? 'text-primary animate-spin' : transferStep === 'confirming' || transferStep === 'done' ? 'text-primary' : 'text-muted-foreground/40'"
              />
              <span class="text-sm" :class="['swapping', 'confirming', 'done'].includes(transferStep) ? 'text-foreground' : 'text-muted-foreground/40'">
                {{ isDirectUsdc ? 'Sending USDC' : 'Swapping to USDC' }}
              </span>
            </div>
            <div class="flex items-center gap-3">
              <Icon
                :name="transferStep === 'confirming' ? 'lucide:loader-2' : transferStep === 'done' ? 'lucide:check-circle-2' : 'lucide:circle'"
                class="w-4 h-4 shrink-0"
                :class="transferStep === 'confirming' ? 'text-primary animate-spin' : transferStep === 'done' ? 'text-primary' : 'text-muted-foreground/40'"
              />
              <span class="text-sm" :class="['confirming', 'done'].includes(transferStep) ? 'text-foreground' : 'text-muted-foreground/40'">
                Confirming on chain
              </span>
            </div>
          </div>
        </div>

        <!-- Success with confetti -->
        <div v-if="transferDone" class="relative text-center py-3">
          <div v-if="showConfetti" class="absolute inset-0 flex justify-center pointer-events-none overflow-hidden">
            <span v-for="i in 12" :key="i"
              class="absolute text-lg animate-confetti"
              :style="{
                left: `${10 + Math.random() * 80}%`,
                animationDelay: `${Math.random() * 0.5}s`,
                animationDuration: `${1 + Math.random() * 0.5}s`,
              }"
            >{{ ['🎉', '✨', '🎊', '💰', '🟢'][i % 5] }}</span>
          </div>
          <div class="flex flex-col items-center gap-1">
            <div class="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center mb-1">
              <Icon name="lucide:check" class="w-6 h-6 text-primary" />
            </div>
            <p class="text-base font-bold">Funds received!</p>
            <p class="text-xs text-muted-foreground">Closing automatically...</p>
          </div>
        </div>

        <!-- CTA (hidden during transfer/done) -->
        <template v-if="!transferring && !transferDone">
          <Button
            class="w-full h-12 text-sm font-bold rounded-2xl"
            :disabled="!canTransfer || (!isDirectUsdc && !quote)"
            @click="executeTransfer"
          >
            {{ !fromToken ? 'Select a token' : !amount ? 'Enter amount' : isDirectUsdc ? 'Transfer USDC' : 'Swap to USDC' }}
          </Button>

          <p v-if="transferError" class="text-xs text-destructive text-center">{{ transferError }}</p>

          <p class="text-[11px] text-muted-foreground/40 text-center">
            Your wallet pays a small gas fee for this transaction.
          </p>
        </template>
      </div>

      <!-- ── Buy mode ── -->
      <div v-else-if="mode === 'buy'" class="px-5 py-5 space-y-3">
        <div class="flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-3 mb-2">
          <div class="flex-1 min-w-0">
            <p class="text-xs text-muted-foreground mb-0.5">USDC will be sent to</p>
            <p class="text-sm font-mono truncate">{{ truncate(address) }}</p>
          </div>
          <Button variant="outline" size="sm" @click="copyAddress">
            <Icon :name="copied ? 'lucide:check' : 'lucide:copy'" class="w-3.5 h-3.5 mr-1.5" />
            {{ copied ? 'Copied' : 'Copy' }}
          </Button>
        </div>

        <button
          class="w-full flex items-center gap-3 rounded-xl border border-border p-4 hover:bg-muted/50 transition-colors text-left"
          :disabled="!!onrampLoading"
          @click="openCoinbaseOnramp"
        >
          <div class="w-10 h-10 rounded-full bg-[#0052FF]/10 flex items-center justify-center shrink-0">
            <Icon v-if="onrampLoading === 'coinbase'" name="lucide:loader-2" class="w-5 h-5 text-[#0052FF] animate-spin" />
            <Icon v-else name="simple-icons:coinbase" class="w-5 h-5 text-[#0052FF]" />
          </div>
          <div class="flex-1">
            <p class="text-sm font-medium">Coinbase</p>
            <p class="text-xs text-muted-foreground">Balance or bank account</p>
          </div>
          <Icon name="lucide:external-link" class="w-4 h-4 text-muted-foreground" />
        </button>

        <button
          class="w-full flex items-center gap-3 rounded-xl border border-border p-4 hover:bg-muted/50 transition-colors text-left"
          :disabled="!!onrampLoading"
          @click="openMoonpayOnramp"
        >
          <div class="w-10 h-10 rounded-full bg-[#7D00FF]/10 flex items-center justify-center shrink-0">
            <Icon v-if="onrampLoading === 'moonpay'" name="lucide:loader-2" class="w-5 h-5 text-[#7D00FF] animate-spin" />
            <Icon v-else name="lucide:credit-card" class="w-5 h-5 text-[#7D00FF]" />
          </div>
          <div class="flex-1">
            <p class="text-sm font-medium">Card / Bank</p>
            <p class="text-xs text-muted-foreground">Debit, credit, or bank transfer via MoonPay</p>
          </div>
          <Icon name="lucide:external-link" class="w-4 h-4 text-muted-foreground" />
        </button>

        <div class="rounded-xl border border-dashed border-border/50 p-4">
          <div class="flex items-start gap-3">
            <Icon name="lucide:send" class="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p class="text-sm font-medium">Send from exchange</p>
              <p class="text-xs text-muted-foreground mt-0.5">
                Send <strong>USDC</strong> on Base to the address above.
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Withdraw mode ── -->
      <div v-else-if="mode === 'withdraw'" class="px-5 py-5 space-y-2">

        <!-- FROM: smart account -->
        <div class="rounded-2xl bg-muted/40 border border-border/40 p-4">
          <div class="flex items-center justify-between mb-2">
            <p class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">From savings account</p>
            <span v-if="smartBalance" class="text-[11px] text-muted-foreground">
              Bal: {{ smartBalance }} USDC
              <button v-if="maxWithdrawable > 0.001" class="text-primary font-semibold ml-1" @click="withdrawAmount = maxWithdrawable.toFixed(6)">MAX</button>
            </span>
          </div>
          <div class="flex items-end gap-3">
            <div class="flex-1 min-w-0">
              <input
                v-model="withdrawAmount"
                type="number"
                inputmode="decimal"
                placeholder="0"
                class="w-full bg-transparent text-3xl font-bold outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
              <p class="text-xs text-muted-foreground/60 mt-0.5">
                {{ withdrawAmount ? '$' + parseFloat(withdrawAmount).toLocaleString('en-US', { maximumFractionDigits: 2 }) : '$0.00' }}
              </p>
            </div>
            <div class="flex items-center gap-2 bg-background/60 rounded-xl px-3 py-2 border border-border/60">
              <div class="w-6 h-6 rounded-full bg-[#2775CA]/20 flex items-center justify-center">
                <span class="text-[10px] font-bold text-[#2775CA]">$</span>
              </div>
              <span class="font-bold text-sm">USDC</span>
            </div>
          </div>
        </div>

        <!-- Arrow -->
        <div class="flex justify-center -my-1 relative z-10">
          <div class="w-8 h-8 rounded-lg border-2 border-border bg-background flex items-center justify-center">
            <Icon name="lucide:arrow-down" class="w-3.5 h-3.5 text-muted-foreground" />
          </div>
        </div>

        <!-- TO: destination -->
        <div class="rounded-2xl bg-muted/40 border border-border/40 p-4">
          <p class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Send to</p>

          <!-- Destination toggle -->
          <div class="flex gap-2 mb-3">
            <button
              class="flex-1 text-xs font-medium py-2 rounded-lg border transition-colors"
              :class="withdrawTo === 'eoa' ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground'"
              @click="withdrawTo = 'eoa'"
            >
              My wallet
            </button>
            <button
              class="flex-1 text-xs font-medium py-2 rounded-lg border transition-colors"
              :class="withdrawTo === 'custom' ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground'"
              @click="withdrawTo = 'custom'"
            >
              Other address
            </button>
          </div>

          <div v-if="withdrawTo === 'eoa' && eoaWalletAddress" class="flex items-center gap-2 p-2.5 rounded-lg bg-background/60 border border-border/40">
            <Icon name="lucide:wallet" class="w-4 h-4 text-muted-foreground shrink-0" />
            <span class="text-sm font-mono truncate">{{ truncate(eoaWalletAddress) }}</span>
          </div>

          <input
            v-if="withdrawTo === 'custom'"
            v-model="withdrawCustomAddr"
            placeholder="0x..."
            class="w-full h-10 bg-background border border-border rounded-lg px-3 text-sm font-mono outline-none focus:border-primary"
          />
        </div>

        <!-- Progress -->
        <div v-if="withdrawing || withdrawDone" class="rounded-2xl bg-muted/40 border border-border/40 p-4 space-y-3">
          <div class="flex items-center gap-3">
            <Icon
              :name="withdrawStep === 'sending' ? 'lucide:loader-2' : 'lucide:check-circle-2'"
              class="w-4 h-4 shrink-0"
              :class="withdrawStep === 'sending' ? 'text-primary animate-spin' : 'text-primary'"
            />
            <span class="text-sm">Sending USDC</span>
          </div>
          <div class="flex items-center gap-3">
            <Icon
              :name="withdrawStep === 'confirming' ? 'lucide:loader-2' : withdrawStep === 'done' ? 'lucide:check-circle-2' : 'lucide:circle'"
              class="w-4 h-4 shrink-0"
              :class="withdrawStep === 'confirming' ? 'text-primary animate-spin' : withdrawStep === 'done' ? 'text-primary' : 'text-muted-foreground/40'"
            />
            <span class="text-sm" :class="['confirming', 'done'].includes(withdrawStep) ? 'text-foreground' : 'text-muted-foreground/40'">
              Confirming on chain
            </span>
          </div>
        </div>

        <!-- Success -->
        <div v-if="withdrawDone" class="relative text-center py-3">
          <div v-if="showConfetti" class="absolute inset-0 flex justify-center pointer-events-none overflow-hidden">
            <span v-for="i in 12" :key="i"
              class="absolute text-lg animate-confetti"
              :style="{ left: `${10 + Math.random() * 80}%`, animationDelay: `${Math.random() * 0.5}s`, animationDuration: `${1 + Math.random() * 0.5}s` }"
            >{{ ['🎉', '✨', '💸', '🟢', '✅'][i % 5] }}</span>
          </div>
          <div class="flex flex-col items-center gap-1">
            <div class="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center mb-1">
              <Icon name="lucide:check" class="w-6 h-6 text-primary" />
            </div>
            <p class="text-base font-bold">Withdrawal complete!</p>
            <p class="text-xs text-muted-foreground">Closing automatically...</p>
          </div>
        </div>

        <!-- CTA -->
        <template v-if="!withdrawing && !withdrawDone">
          <p v-if="withdrawBalanceError" class="text-xs text-amber-400 text-center py-1">
            {{ withdrawBalanceError }}
          </p>
          <Button
            class="w-full h-12 text-sm font-bold rounded-2xl"
            :disabled="!canWithdraw"
            @click="executeWithdraw"
          >
            Withdraw USDC
          </Button>
          <p v-if="withdrawError" class="text-xs text-destructive text-center">{{ withdrawError }}</p>
          <p class="text-[11px] text-muted-foreground/40 text-center">
            Gas is paid in USDC — no ETH needed.
          </p>
        </template>
      </div>

      <!-- ── Swap mode ── -->
      <div v-else-if="mode === 'swap'" class="px-5 py-5 space-y-2">

        <!-- FROM: smart account token -->
        <div class="rounded-2xl bg-muted/40 border border-border/40 p-4">
          <div class="flex items-center justify-between mb-2">
            <p class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">From savings account</p>
            <span v-if="swapFromBalance" class="text-[11px] text-muted-foreground">
              Bal: {{ parseFloat(swapFromBalance).toLocaleString('en-US', { maximumFractionDigits: 6 }) }}
              <button class="text-primary font-semibold ml-1" @click="setSwapMax">MAX</button>
            </span>
          </div>
          <div class="flex items-end gap-3">
            <div class="flex-1 min-w-0">
              <input
                v-model="swapAmount"
                type="number"
                inputmode="decimal"
                placeholder="0"
                :disabled="swapping"
                class="w-full bg-transparent text-3xl font-bold outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
            <button
              class="flex items-center gap-2 rounded-xl px-3 py-2 border transition-colors shrink-0"
              :class="swapFromToken ? 'bg-background/60 border-border/60 hover:border-primary/40' : 'bg-primary/10 border-primary/30 hover:bg-primary/15'"
              @click="showSwapPicker = true"
            >
              <template v-if="swapFromToken">
                <img v-if="swapFromToken.logoURI" :src="swapFromToken.logoURI" class="w-6 h-6 rounded-full" @error="($event.target as HTMLImageElement).style.display='none'" />
                <span class="font-bold text-sm">{{ swapFromToken.symbol }}</span>
              </template>
              <template v-else>
                <Icon name="lucide:coins" class="w-4 h-4 text-primary" />
                <span class="font-semibold text-sm text-primary">Select</span>
              </template>
              <Icon name="lucide:chevron-down" class="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
          <p v-if="swapAmountError" class="text-xs text-destructive mt-1.5">{{ swapAmountError }}</p>
        </div>

        <!-- Arrow -->
        <div class="flex justify-center -my-1 relative z-10">
          <div class="w-8 h-8 rounded-lg border-2 border-border bg-background flex items-center justify-center">
            <Icon name="lucide:arrow-down" class="w-3.5 h-3.5 text-muted-foreground" />
          </div>
        </div>

        <!-- TO: output token picker -->
        <div class="rounded-2xl bg-muted/40 border border-border/40 p-4">
          <p class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Receive</p>
          <div class="flex items-end gap-3">
            <div class="flex-1 min-w-0">
              <p class="text-3xl font-bold" :class="swapEstimatedOutput ? 'text-foreground' : 'text-muted-foreground/40'">
                {{ swapQuoteLoading ? '...' : swapEstimatedOutput ?? '0' }}
              </p>
              <p class="text-[11px] text-muted-foreground/50 mt-0.5">back into savings account</p>
            </div>
            <button
              class="flex items-center gap-2 rounded-xl px-3 py-2 border transition-colors shrink-0 bg-background/60 border-border/60 hover:border-primary/40"
              @click="showSwapToPicker = true"
            >
              <img v-if="swapToToken.logo" :src="swapToToken.logo" class="w-6 h-6 rounded-full" @error="($event.target as HTMLImageElement).style.display='none'" />
              <span class="font-bold text-sm">{{ swapToToken.symbol }}</span>
              <Icon name="lucide:chevron-down" class="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
        </div>

        <!-- Route info -->
        <div v-if="swapQuoteLoading" class="flex items-center gap-1.5 text-xs text-muted-foreground px-1">
          <Icon name="lucide:loader-2" class="w-3 h-3 animate-spin" /> Finding best route...
        </div>
        <div v-else-if="swapQuote" class="text-[11px] text-muted-foreground/50 px-1">
          via LI.FI · slippage 0.5%
        </div>
        <div v-else-if="swapAmount && parseFloat(swapAmount) > 0 && !swapQuoteLoading && !swapIsSameToken" class="text-[11px] text-amber-400 px-1">
          No route found — try a different pair
        </div>
        <div v-else-if="swapIsSameToken" class="text-[11px] text-amber-400 px-1">
          FROM and TO are the same token
        </div>

        <!-- Progress -->
        <div v-if="swapping || swapDone" class="rounded-2xl bg-muted/40 border border-border/40 p-4 space-y-3">
          <div class="flex items-center gap-3">
            <Icon
              :name="swapStep === 'approving' ? 'lucide:loader-2' : ['swapping','confirming','done'].includes(swapStep) ? 'lucide:check-circle-2' : 'lucide:circle'"
              class="w-4 h-4 shrink-0"
              :class="swapStep === 'approving' ? 'text-primary animate-spin' : ['swapping','confirming','done'].includes(swapStep) ? 'text-primary' : 'text-muted-foreground/40'"
            />
            <span class="text-sm">Token approval</span>
          </div>
          <div class="flex items-center gap-3">
            <Icon
              :name="swapStep === 'swapping' ? 'lucide:loader-2' : ['confirming','done'].includes(swapStep) ? 'lucide:check-circle-2' : 'lucide:circle'"
              class="w-4 h-4 shrink-0"
              :class="swapStep === 'swapping' ? 'text-primary animate-spin' : ['confirming','done'].includes(swapStep) ? 'text-primary' : 'text-muted-foreground/40'"
            />
            <span class="text-sm">Swapping via LI.FI</span>
          </div>
          <div class="flex items-center gap-3">
            <Icon
              :name="swapStep === 'confirming' ? 'lucide:loader-2' : swapStep === 'done' ? 'lucide:check-circle-2' : 'lucide:circle'"
              class="w-4 h-4 shrink-0"
              :class="swapStep === 'confirming' ? 'text-primary animate-spin' : swapStep === 'done' ? 'text-primary' : 'text-muted-foreground/40'"
            />
            <span class="text-sm">Confirming on chain</span>
          </div>
        </div>

        <!-- Success -->
        <div v-if="swapDone" class="relative text-center py-3">
          <div v-if="showConfetti" class="absolute inset-0 flex justify-center pointer-events-none overflow-hidden">
            <span v-for="i in 12" :key="i"
              class="absolute text-lg animate-confetti"
              :style="{ left: `${10 + Math.random() * 80}%`, animationDelay: `${Math.random() * 0.5}s`, animationDuration: `${1 + Math.random() * 0.5}s` }"
            >{{ ['🔄', '✨', '💱', '🟢', '✅'][i % 5] }}</span>
          </div>
          <div class="flex flex-col items-center gap-1">
            <div class="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center mb-1">
              <Icon name="lucide:check" class="w-6 h-6 text-primary" />
            </div>
            <p class="text-base font-bold">Swap complete!</p>
            <p class="text-xs text-muted-foreground">Closing automatically...</p>
          </div>
        </div>

        <!-- CTA -->
        <template v-if="!swapping && !swapDone">
          <Button
            class="w-full h-12 text-sm font-bold rounded-2xl"
            :disabled="!canSwap"
            @click="executeSwap"
          >
            {{ !swapFromToken ? 'Select a token' : !swapAmount ? 'Enter amount' : swapAmountError ?? (swapIsSameToken ? 'Same token' : !swapQuote ? 'Finding route...' : `Swap to ${swapToToken.symbol}`) }}
          </Button>
          <p v-if="swapError" class="text-xs text-destructive text-center">{{ swapError }}</p>
          <p class="text-[11px] text-muted-foreground/40 text-center">
            Gas paid in USDC from savings account — no ETH needed.
          </p>
        </template>
      </div>

    </DialogContent>
  </Dialog>

  <!-- Token picker for Transfer In — EOA tokens across chains (crosschain via LI.FI) -->
  <AppTokenChainPicker
    v-model:open="showPicker"
    :user-address="eoaWalletAddress"
    @select="handleTokenSelected"
  />

  <!-- Token picker for Swap FROM — smart account tokens on Base (via direct RPC, not Enso) -->
  <AppTokenChainPicker
    v-model:open="showSwapPicker"
    :user-address="address"
    :wallet-tokens="walletTokens"
    :locked-chain-id="8453"
    @select="handleSwapTokenSelected"
  />

  <!-- Token picker for Swap RECEIVE — full LI.FI token list on Base -->
  <AppTokenChainPicker
    v-model:open="showSwapToPicker"
    source="list"
    :locked-chain-id="8453"
    @select="handleSwapToTokenSelected"
  />
</template>
