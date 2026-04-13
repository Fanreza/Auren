<script setup lang="ts">
import { formatUnits } from 'viem'
import { usePrivyAuth } from '~/composables/usePrivy'
import { useProfileStore } from '~/stores/useProfileStore'
import { useUserData } from '~/composables/useUserData'
import { STRATEGIES, LEGACY_VAULTS, type StrategyKey } from '~/config/strategies'
import type { DbPocket } from '~/types/database'

const open = defineModel<boolean>('open', { required: true })

const props = defineProps<{
  pocket: DbPocket | null
}>()

const emit = defineEmits<{
  done: []
}>()

const { address, getPublicClient, getWalletClient } = usePrivyAuth()
const profileStore = useProfileStore()
const { recordTransaction } = useUserData()

const strategy = computed(() =>
  props.pocket ? STRATEGIES[props.pocket.strategy_key as StrategyKey] : null,
)

// The withdraw flow needs to inspect every vault that might still hold shares
// for this pocket: the currently-committed vault (from DB), the top-APY
// snapshot for the strategy (in case DB is out of date), and any legacy vaults.
// Priority matters — the pocket's own vault_address comes FIRST so we always
// redeem from the authoritative location before falling back.
const allocs = computed<Array<{ address: string; protocol: string }>>(() => {
  if (!props.pocket) return []
  const key = props.pocket.strategy_key as StrategyKey
  const own = props.pocket.vault_address
    ? [{
        address: props.pocket.vault_address,
        protocol: props.pocket.vault_protocol ?? '',
      }]
    : []
  const active = profileStore.lifiVaultAddresses[key] ?? []
  const legacy = (LEGACY_VAULTS[key] ?? []).map(v => ({ address: v.address, protocol: v.protocol }))
  const merged: Array<{ address: string; protocol: string }> = [
    ...own,
    ...active.map(a => ({ address: a.address, protocol: a.protocol })),
    ...legacy,
  ]
  // Dedupe by address (first occurrence wins → pocket vault stays at the top)
  const seen = new Set<string>()
  return merged.filter(a => {
    const k = a.address.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
})

// ── Output token options (same network = Base) ──────────────────────────────
const OUTPUT_TOKENS = [
  { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', decimals: 6, logo: 'https://assets.coingecko.com/coins/images/6319/standard/usdc.png' },
  { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', decimals: 18, logo: 'https://assets.coingecko.com/coins/images/2518/standard/weth.png' },
  { address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', symbol: 'cbBTC', decimals: 8, logo: 'https://assets.coingecko.com/coins/images/1/standard/bitcoin.png' },
  { address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', symbol: 'ETH', decimals: 18, logo: 'https://assets.coingecko.com/coins/images/279/standard/ethereum.png' },
]

const selectedOutput = ref(OUTPUT_TOKENS[0])

// Default output = same token as vault asset
watch(() => strategy.value?.assetSymbol, (sym) => {
  if (!sym) return
  const match = OUTPUT_TOKENS.find(t => t.symbol === sym)
  if (match) selectedOutput.value = match
}, { immediate: true })

// ── Vault balance ────────────────────────────────────────────────────────────
const vaultShares = ref<Map<string, bigint>>(new Map())
const vaultBalance = ref('0')
const loadingBalance = ref(false)

const usdcForGas = ref<string>('0')

async function fetchUsdcBalance() {
  if (!address.value) return
  try {
    const pub = getPublicClient()
    const { parseAbi } = await import('viem')
    const raw = await pub.readContract({
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`,
      abi: parseAbi(['function balanceOf(address) view returns (uint256)']),
      functionName: 'balanceOf',
      args: [address.value!],
    })
    usdcForGas.value = (Number(raw) / 1e6).toFixed(4)
  } catch { usdcForGas.value = '0' }
}

const hasGas = computed(() => parseFloat(usdcForGas.value) > 0.001)

async function fetchVaultBalance() {
  if (!address.value || !allocs.value.length) return
  loadingBalance.value = true
  try {
    const pub = getPublicClient()
    let total = 0n
    const sharesMap = new Map<string, bigint>()

    for (const alloc of allocs.value) {
      try {
        const shares = await pub.readContract({
          address: alloc.address as `0x${string}`,
          abi: [{ name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: '', type: 'address' }], outputs: [{ type: 'uint256' }] }],
          functionName: 'balanceOf',
          args: [address.value!],
        })
        sharesMap.set(alloc.address, shares)
        if (shares > 0n) {
          try {
            total += await pub.readContract({
              address: alloc.address as `0x${string}`,
              abi: [{ name: 'convertToAssets', type: 'function', stateMutability: 'view', inputs: [{ name: '', type: 'uint256' }], outputs: [{ type: 'uint256' }] }],
              functionName: 'convertToAssets',
              args: [shares],
            })
          } catch { total += shares }
        }
      } catch { /* skip */ }
    }
    vaultShares.value = sharesMap
    vaultBalance.value = formatUnits(total, strategy.value?.decimals ?? 6)
  } catch {
    vaultBalance.value = '0'
  } finally {
    loadingBalance.value = false
  }
}

// ── Amount + quote ───────────────────────────────────────────────────────────
const amount = ref('')
const quote = ref<any>(null)
const quotesLoading = ref(false)
let quoteTimer: ReturnType<typeof setTimeout> | null = null

const isSameToken = computed(() => {
  if (!strategy.value) return true
  return selectedOutput.value.symbol === strategy.value.assetSymbol ||
    (selectedOutput.value.symbol === 'ETH' && strategy.value.assetSymbol === 'WETH')
})

// Minimum withdraw in USD terms (below this, gas costs more than the withdraw)
const MIN_WITHDRAW_USD = 0.10

const balanceTooSmall = computed(() => {
  const bal = parseFloat(vaultBalance.value)
  if (bal <= 0) return true
  // Check if value is dust (< $0.01 equivalent)
  // cbBTC: 8 decimals, ~$84k/BTC → 0.00000012 = ~$0.01
  // WETH: 18 decimals, ~$3k/ETH → 0.000003 = ~$0.01
  // USDC: 6 decimals → 0.01 = $0.01
  const decimals = strategy.value?.decimals ?? 6
  const minAmount = decimals >= 18 ? 0.000001 : decimals >= 8 ? 0.0000001 : 0.001
  return bal < minAmount
})

const amountError = computed(() => {
  if (!amount.value) return null
  const val = parseFloat(amount.value)
  if (isNaN(val) || val <= 0) return 'Enter a valid amount'
  if (val > parseFloat(vaultBalance.value)) return 'Exceeds balance'
  return null
})

const canWithdraw = computed(() =>
  !!amount.value && !amountError.value && parseFloat(amount.value) > 0 &&
  (isSameToken.value || !!quote.value),
)

// ── Opportunity cost preview ────────────────────────────────────────────────
// Show how much yield user would forfeit by withdrawing now vs holding 1 more month.
const opportunityCost = computed(() => {
  if (!strategy.value || !amount.value) return null
  const amt = parseFloat(amount.value)
  if (isNaN(amt) || amt <= 0) return null
  const apyStr = profileStore.getStrategyApy(strategy.value.key)
  if (!apyStr) return null
  const apy = parseFloat(apyStr) / 100
  if (apy <= 0) return null
  // 30-day yield = principal × (1 + apy)^(30/365) - principal
  const monthYield = amt * (Math.pow(1 + apy, 30 / 365) - 1)
  // Convert to USD (USDC = 1, others use price)
  const price = profileStore.getAssetPrice(strategy.value.key) || 0
  return {
    monthUsd: monthYield * price,
    yearUsd: amt * apy * price,
  }
})

function setMax() { amount.value = vaultBalance.value }

// Fetch quote when output token differs from vault token
watch([amount, selectedOutput], () => {
  quote.value = null
  if (quoteTimer) clearTimeout(quoteTimer)
  if (!amount.value || !allocs.value.length || !address.value) return
  if (parseFloat(amount.value) <= 0 || amountError.value) return
  if (isSameToken.value) return
  quoteTimer = setTimeout(fetchQuote, 800)
})

async function fetchQuote() {
  if (!address.value || !allocs.value.length || !amount.value) return
  quotesLoading.value = true
  try {
    // Use first vault that has shares
    let targetAlloc = allocs.value[0]
    let targetShares = 0n
    for (const alloc of allocs.value) {
      const s = vaultShares.value.get(alloc.address) ?? 0n
      if (s > 0n) { targetAlloc = alloc; targetShares = s; break }
    }
    if (targetShares === 0n) { quotesLoading.value = false; return }

    // Calculate shares to redeem — proportional to requested amount
    const totalBal = parseFloat(vaultBalance.value)
    if (totalBal <= 0) { quotesLoading.value = false; return }
    const pct = Math.min(parseFloat(amount.value) / totalBal, 1)
    const shareAmount = pct >= 0.999
      ? targetShares  // MAX — use all shares
      : (targetShares * BigInt(Math.round(pct * 1e9))) / BigInt(1e9)
    if (shareAmount === 0n) { quotesLoading.value = false; return }

    console.log(`[withdraw] quote: vault=${targetAlloc.address}, shares=${shareAmount}, output=${selectedOutput.value.symbol}`)

    quote.value = await $fetch<any>('/api/lifi/quote', {
      query: {
        fromChain: 8453,
        toChain: 8453,
        fromToken: targetAlloc.address,
        toToken: selectedOutput.value.address,
        fromAmount: shareAmount.toString(),
        fromAddress: address.value,
        slippage: 0.005,
      },
    })
  } catch (e) {
    console.error('[withdraw] quote failed:', e)
    quote.value = null
  } finally {
    quotesLoading.value = false
  }
}

const estimatedOutput = computed(() => {
  if (isSameToken.value) return amount.value || '0'
  if (!quote.value?.estimate?.toAmount) return null
  return (Number(quote.value.estimate.toAmount) / 10 ** selectedOutput.value.decimals).toFixed(6)
})

// ── Execute ──────────────────────────────────────────────────────────────────
const withdrawing = ref(false)
const withdrawStep = ref<'idle' | 'redeeming' | 'confirming' | 'done'>('idle')
const withdrawError = ref('')

async function executeWithdraw() {
  if (!address.value || !canWithdraw.value || !strategy.value || !props.pocket) return
  withdrawing.value = true
  withdrawStep.value = 'redeeming'
  withdrawError.value = ''

  // Track the last successful tx hash so we can record it to DB
  let lastHash: `0x${string}` | null = null

  try {
    const pub = getPublicClient()

    const { encodeFunctionData, parseAbi } = await import('viem')
    const client = await getWalletClient()

    async function send(to: string, data: string, value?: string): Promise<`0x${string}`> {
      return await client.sendTransaction({
        to: to as `0x${string}`,
        data: data as `0x${string}`,
        value: value ? BigInt(value) : 0n,
      })
    }

    if (isSameToken.value) {
      // Direct vault redeem — handle both ERC-4626 and Aave aTokens
      for (const alloc of allocs.value) {
        const shares = vaultShares.value.get(alloc.address) ?? 0n
        if (shares === 0n) continue

        const totalBal = parseFloat(vaultBalance.value)
        const pct = Math.min(parseFloat(amount.value) / totalBal, 1)
        const redeemAmount = pct >= 0.999
          ? shares
          : (shares * BigInt(Math.round(pct * 1e9))) / BigInt(1e9)
        if (redeemAmount === 0n) continue

        let data: `0x${string}`
        const isAave = alloc.protocol.toLowerCase().includes('aave')

        if (isAave) {
          // Aave: aToken balance = underlying amount (1:1)
          // Withdraw via Aave Pool contract
          const AAVE_POOL_BASE = '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5' as `0x${string}`
          // Use max uint256 to withdraw all, or specific amount
          const withdrawAmount = pct >= 0.999
            ? BigInt(2) ** BigInt(256) - BigInt(1) // type(uint256).max = withdraw all
            : redeemAmount
          data = encodeFunctionData({
            abi: parseAbi(['function withdraw(address asset, uint256 amount, address to) returns (uint256)']),
            functionName: 'withdraw',
            args: [strategy.value!.assetAddress, withdrawAmount, address.value!],
          })
          const hash = await send(AAVE_POOL_BASE, data)
          lastHash = hash
          withdrawStep.value = 'confirming'
          await pub.waitForTransactionReceipt({ hash })
        } else {
          // ERC-4626: redeem shares
          data = encodeFunctionData({
            abi: parseAbi(['function redeem(uint256 shares, address receiver, address owner) returns (uint256)']),
            functionName: 'redeem',
            args: [redeemAmount, address.value!, address.value!],
          })
          const hash = await send(alloc.address, data)
          lastHash = hash
          withdrawStep.value = 'confirming'
          await pub.waitForTransactionReceipt({ hash })
        }
      }
    } else {
      // Swap via LI.FI
      if (!quote.value?.transactionRequest) {
        withdrawError.value = 'No route found'
        withdrawStep.value = 'idle'
        return
      }

      // Pre-approve vault token to LI.FI router in a SEPARATE tx
      // This must happen before the swap tx, otherwise the batch simulation fails
      const alloc = allocs.value[0]
      const shares = vaultShares.value.get(alloc.address) ?? 0n
      if (shares > 0n && quote.value.estimate?.approvalAddress) {
        const spender = quote.value.estimate.approvalAddress as `0x${string}`
        const allowance = await pub.readContract({
          address: alloc.address as `0x${string}`,
          abi: parseAbi(['function allowance(address,address) view returns (uint256)']),
          functionName: 'allowance',
          args: [address.value!, spender],
        })
        if (allowance < shares) {
          console.log('[withdraw] approving vault token to LI.FI router...')
          const approveData = encodeFunctionData({
            abi: parseAbi(['function approve(address,uint256) returns (bool)']),
            functionName: 'approve',
            args: [spender, BigInt(2) ** BigInt(256) - BigInt(1)],
          })
          const approveHash = await send(alloc.address, approveData)
          await pub.waitForTransactionReceipt({ hash: approveHash })
          console.log('[withdraw] vault token approved')
        }
      }

      const tx = quote.value.transactionRequest
      const hash = await send(tx.to, tx.data, tx.value)
      lastHash = hash
      withdrawStep.value = 'confirming'
      await pub.waitForTransactionReceipt({ hash })
    }

    // Record withdrawal to DB so dashboard PnL stays accurate.
    // `amount` is stored as USD decimal (matches recorder convention for deposits).
    if (lastHash) {
      const assetPrice = profileStore.getAssetPrice(props.pocket.strategy_key) || 0
      const withdrawnTokens = parseFloat(amount.value) || 0
      const usdValue = withdrawnTokens * assetPrice
      await recordTransaction({
        pocket_id: props.pocket.id,
        type: 'redeem',
        amount: usdValue.toFixed(6),
        asset_symbol: strategy.value.assetSymbol,
        tx_hash: lastHash,
        timestamp: Math.floor(Date.now() / 1000),
      }).catch((e: any) => console.warn('[withdraw] recordTransaction failed:', e))
    }

    // Invalidate position cache immediately so the UI drops the stale balance
    // while we wait for the onchain read. Refetch this pocket's balance right
    // away — don't rely solely on the parent's @done handler, which runs a
    // full multi-pocket refetch that can race with dialog close.
    profileStore.pocketPositions[props.pocket.id] = { shares: 0n, value: 0n }
    try {
      await profileStore.fetchPocketPosition(props.pocket)
    } catch (e) {
      console.warn('[withdraw] post-tx position fetch failed:', e)
    }
    // Also refresh the pocket row (tx history + metadata)
    await profileStore.refreshPockets().catch(() => {})

    withdrawStep.value = 'done'
    emit('done')
    setTimeout(() => { open.value = false }, 2500)
  } catch (e: any) {
    console.error('[withdraw] failed:', e)
    withdrawError.value = e.shortMessage || e.message || 'Withdrawal failed'
    withdrawStep.value = 'idle'
  } finally {
    withdrawing.value = false
  }
}

// ── Lifecycle ────────────────────────────────────────────────────────────────
watch(open, (v) => {
  if (v) {
    amount.value = ''
    quote.value = null
    withdrawError.value = ''
    withdrawStep.value = 'idle'
    // Default output to vault's own token
    if (strategy.value) {
      const match = OUTPUT_TOKENS.find(t => t.symbol === strategy.value!.assetSymbol)
      if (match) selectedOutput.value = match
    }
    fetchVaultBalance()
    fetchUsdcBalance()
  }
})

// Refetch when the active vault list grows (e.g. snapshots load after dialog opens)
// or when the smart account address becomes available.
watch([() => allocs.value.map(a => a.address).join(','), address], () => {
  if (open.value) fetchVaultBalance()
})
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-md p-0 gap-0">
      <div class="px-5 pt-5 pb-4 border-b border-border/40">
        <DialogHeader>
          <DialogTitle class="text-base">
            {{ withdrawStep === 'done' ? 'Withdrawn!' : `Withdraw ${strategy?.assetSymbol ?? ''}` }}
          </DialogTitle>
          <DialogDescription class="sr-only">Withdraw from vault</DialogDescription>
        </DialogHeader>
      </div>

      <!-- Done -->
      <div v-if="withdrawStep === 'done'" class="px-6 py-10 flex flex-col items-center text-center">
        <div class="w-16 h-16 rounded-full bg-primary/15 flex items-center justify-center mb-4">
          <Icon name="lucide:check" class="w-8 h-8 text-primary" />
        </div>
        <h3 class="text-lg font-bold mb-1">Tokens returned</h3>
        <p class="text-sm text-muted-foreground">
          {{ estimatedOutput }} {{ selectedOutput.symbol }} is back in your wallet.
        </p>
        <p class="text-xs text-muted-foreground/40 mt-4">Closing automatically…</p>
      </div>

      <!-- Form -->
      <div v-else class="px-5 py-5 space-y-2">

        <!-- FROM: vault -->
        <div class="rounded-2xl bg-muted/40 border border-border/40 p-4">
          <div class="flex items-center justify-between mb-2">
            <p class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">From vault</p>
            <span v-if="!loadingBalance" class="text-[11px] text-muted-foreground">
              {{ parseFloat(vaultBalance).toLocaleString('en-US', { maximumFractionDigits: 6 }) }} {{ strategy?.assetSymbol }}
              <button v-if="parseFloat(vaultBalance) > 0" class="text-primary font-semibold ml-1" @click="setMax">MAX</button>
            </span>
            <Skeleton v-else class="h-3 w-20" />
          </div>
          <template v-if="balanceTooSmall">
            <p class="text-sm text-muted-foreground py-2">
              Balance too small to withdraw. Deposit more to this pocket first.
            </p>
          </template>
          <template v-else>
            <div class="flex items-end gap-3">
              <div class="flex-1 min-w-0">
                <input
                  v-model="amount"
                  type="number"
                  inputmode="decimal"
                  placeholder="0"
                  :disabled="withdrawing"
                  class="w-full bg-transparent text-3xl font-bold outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
              <div class="flex items-center gap-2 bg-background/60 rounded-xl px-3 py-2 border border-border/60">
                <img v-if="strategy?.vaultLogo" :src="strategy.vaultLogo" class="w-6 h-6 rounded-full" />
                <span class="font-bold text-sm">{{ strategy?.assetSymbol }}</span>
              </div>
            </div>
            <p v-if="amountError" class="text-xs text-destructive mt-1.5">{{ amountError }}</p>
          </template>
        </div>

        <!-- Arrow -->
        <div class="flex justify-center -my-1 relative z-10">
          <div class="w-8 h-8 rounded-lg border-2 border-border bg-background flex items-center justify-center">
            <Icon name="lucide:arrow-down" class="w-3.5 h-3.5 text-muted-foreground" />
          </div>
        </div>

        <!-- TO: wallet + output token picker -->
        <div class="rounded-2xl bg-muted/40 border border-border/40 p-4">
          <p class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Receive as</p>
          <div class="flex items-end gap-3">
            <div class="flex-1 min-w-0">
              <p class="text-3xl font-bold" :class="estimatedOutput && estimatedOutput !== '0' ? 'text-foreground' : 'text-muted-foreground/40'">
                {{ quotesLoading ? '...' : estimatedOutput ?? '0' }}
              </p>
              <p class="text-[11px] text-muted-foreground/50 mt-0.5">to your wallet</p>
            </div>

            <!-- Output token selector -->
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="t in OUTPUT_TOKENS" :key="t.symbol"
                class="flex items-center gap-1 px-2 py-1.5 rounded-lg border text-xs transition-colors"
                :class="selectedOutput.symbol === t.symbol
                  ? 'border-primary bg-primary/10 font-semibold'
                  : 'border-border hover:border-primary/40 text-muted-foreground'"
                @click="selectedOutput = t"
              >
                <img :src="t.logo" class="w-4 h-4 rounded-full" />
                {{ t.symbol }}
              </button>
            </div>
          </div>
        </div>

        <!-- Detailed transaction preview -->
        <AppTxPreview
          v-if="!isSameToken && amount && (quotesLoading || quote)"
          :quote="quote"
          :loading="quotesLoading"
          title="Withdraw Preview"
          :subtitle="`${strategy?.assetSymbol ?? ''} vault → ${selectedOutput.symbol}`"
        />

        <!-- Same-token withdraw: manual preview (direct vault redeem) -->
        <AppTxPreview
          v-else-if="isSameToken && amount && parseFloat(amount) > 0 && strategy"
          :manual="{
            fromChainId: 8453,
            fromChainName: 'Base',
            fromTokenSymbol: `${strategy.assetSymbol} vault shares`,
            fromTokenLogo: strategy.vaultLogo,
            fromAmount: amount,
            toChainId: 8453,
            toChainName: 'Base',
            toTokenSymbol: strategy.assetSymbol,
            toTokenLogo: strategy.vaultLogo,
            toAmount: amount,
            steps: [
              { label: 'Redeem', via: allocs[0]?.protocol ?? 'vault contract' },
            ],
            estTimeSeconds: 5,
          }"
          title="Withdraw Preview"
          :subtitle="`Direct redeem from ${strategy?.assetSymbol} vault`"
        />

        <div v-else-if="!isSameToken && amount && parseFloat(amount) > 0 && !quotesLoading && !quote" class="text-[11px] text-amber-400 px-1">
          No route found — try a different output token
        </div>

        <!-- Progress -->
        <div v-if="withdrawing" class="rounded-2xl bg-muted/40 border border-border/40 p-4 space-y-3">
          <div class="flex items-center gap-3">
            <Icon
              :name="withdrawStep === 'redeeming' ? 'lucide:loader-2' : 'lucide:check-circle-2'"
              class="w-4 h-4 shrink-0"
              :class="withdrawStep === 'redeeming' ? 'text-primary animate-spin' : 'text-primary'"
            />
            <span class="text-sm">{{ isSameToken ? 'Redeeming from vault' : 'Swapping via LI.FI' }}</span>
          </div>
          <div class="flex items-center gap-3">
            <Icon
              :name="withdrawStep === 'confirming' ? 'lucide:loader-2' : 'lucide:circle'"
              class="w-4 h-4 shrink-0"
              :class="withdrawStep === 'confirming' ? 'text-primary animate-spin' : 'text-muted-foreground/40'"
            />
            <span class="text-sm" :class="withdrawStep === 'confirming' ? 'text-foreground' : 'text-muted-foreground/40'">Confirming</span>
          </div>
        </div>

        <!-- Opportunity cost warning -->
        <div
          v-if="opportunityCost && opportunityCost.monthUsd >= 0.001 && !withdrawing"
          class="rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-2.5 flex items-start gap-2"
        >
          <Icon name="lucide:trending-up" class="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          <div class="flex-1 text-[11px] text-amber-200/90 leading-relaxed">
            <p class="font-semibold">You'll forfeit ~${{ opportunityCost.monthUsd.toFixed(2) }} in yield</p>
            <p class="text-amber-200/60 mt-0.5">
              by withdrawing now instead of holding 1 more month
              ({{ '~$' + opportunityCost.yearUsd.toFixed(2) }} per year)
            </p>
          </div>
        </div>

        <!-- No gas warning -->
        <div v-if="!hasGas && !withdrawing" class="rounded-xl bg-amber-400/10 border border-amber-400/20 px-4 py-3 text-center">
          <p class="text-xs text-amber-400 font-medium mb-1">No USDC for gas fees</p>
          <p class="text-[11px] text-muted-foreground">
            Fund your wallet with a small amount of USDC first. Go to Fund → Transfer In or Buy.
          </p>
        </div>

        <!-- CTA -->
        <Button
          v-if="!withdrawing"
          class="w-full h-12 text-sm font-bold rounded-2xl"
          :disabled="!canWithdraw || !hasGas"
          @click="executeWithdraw"
        >
          {{ !hasGas ? 'Need USDC for gas' : !amount ? 'Enter amount' : amountError ?? (isSameToken ? `Withdraw ${strategy?.assetSymbol}` : `Swap to ${selectedOutput.symbol}`) }}
        </Button>

        <p v-if="withdrawError" class="text-xs text-destructive text-center">{{ withdrawError }}</p>
        <p v-if="hasGas" class="text-[11px] text-muted-foreground/40 text-center">
          Gas: {{ usdcForGas }} USDC available
        </p>
      </div>
    </DialogContent>
  </Dialog>
</template>
