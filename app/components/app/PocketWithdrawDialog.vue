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

// Per-allocation metadata — withdraw works on ONE allocation at a time so
// mixed-asset multi-vault pockets (e.g. USDC + WETH) display correct balances
// and execute against the right vault/asset.
interface WithdrawAlloc {
  address: string
  protocol: string
  assetAddress: string
  assetSymbol: string
  vaultSymbol: string
  decimals: number
}

// Phase 4: STRICT — withdraw only touches vaults that belong to THIS pocket.
//   1. If pocket has explicit allocations → use those, ignore everything else.
//   2. Else if pocket has vault_address (Phase 1 single-vault) → use that only.
//   3. Else fall back to legacy snapshot/LEGACY_VAULTS for pre-Phase-1 pockets.
const allocs = computed<WithdrawAlloc[]>(() => {
  if (!props.pocket) return []

  // Phase 4 — explicit per-pocket allocations are authoritative
  if (props.pocket.allocations?.length) {
    return props.pocket.allocations.map(a => ({
      address: a.vault_address,
      protocol: a.protocol ?? '',
      assetAddress: a.asset_address ?? strategy.value?.assetAddress ?? '',
      assetSymbol: a.asset_symbol ?? strategy.value?.assetSymbol ?? '',
      vaultSymbol: a.vault_symbol ?? a.asset_symbol ?? '',
      decimals: decimalsForAsset(a.asset_address ?? '', a.asset_symbol ?? ''),
    }))
  }

  // Phase 1 — single-vault cache column
  if (props.pocket.vault_address) {
    return [{
      address: props.pocket.vault_address,
      protocol: props.pocket.vault_protocol ?? '',
      assetAddress: props.pocket.vault_asset ?? strategy.value?.assetAddress ?? '',
      assetSymbol: strategy.value?.assetSymbol ?? '',
      vaultSymbol: props.pocket.vault_symbol ?? '',
      decimals: strategy.value?.decimals ?? 6,
    }]
  }

  // Pre-Phase-1 legacy fallback (very old pockets) — strategy snapshot + hardcoded
  const key = props.pocket.strategy_key as StrategyKey
  const active = profileStore.lifiVaultAddresses[key] ?? []
  const legacy = (LEGACY_VAULTS[key] ?? []).map(v => ({ address: v.address, protocol: v.protocol }))
  const merged: Array<{ address: string; protocol: string }> = [
    ...active.map(a => ({ address: a.address, protocol: a.protocol })),
    ...legacy,
  ]
  const seen = new Set<string>()
  return merged.filter(a => {
    const k = a.address.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  }).map(a => ({
    address: a.address,
    protocol: a.protocol,
    assetAddress: strategy.value?.assetAddress ?? '',
    assetSymbol: strategy.value?.assetSymbol ?? '',
    vaultSymbol: '',
    decimals: strategy.value?.decimals ?? 6,
  }))
})

// Asset decimals lookup — OUTPUT_TOKENS covers the common ones; falls back to
// 18 for unknown tokens (safe default for most ERC20s).
function decimalsForAsset(addr: string, symbol: string): number {
  const lower = addr.toLowerCase()
  const byAddr = OUTPUT_TOKENS.find(t => t.address.toLowerCase() === lower)
  if (byAddr) return byAddr.decimals
  const bySym = OUTPUT_TOKENS.find(t => t.symbol === symbol)
  if (bySym) return bySym.decimals
  if (symbol === 'USDC' || symbol === 'USDT') return 6
  if (symbol === 'cbBTC' || symbol === 'WBTC') return 8
  return 18
}

// Currently-selected allocation for this withdraw operation. Always points to
// one specific vault — for single-vault pockets it's the only alloc, for
// multi-vault pockets the user picks via the allocation picker.
const selectedAllocAddress = ref<string | null>(null)
const selectedAlloc = computed<WithdrawAlloc | null>(() => {
  if (!allocs.value.length) return null
  if (selectedAllocAddress.value) {
    const match = allocs.value.find(a => a.address === selectedAllocAddress.value)
    if (match) return match
  }
  return allocs.value[0] ?? null
})

// ── Output token options (same network = Base) ──────────────────────────────
const OUTPUT_TOKENS = [
  { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', decimals: 6, logo: 'https://assets.coingecko.com/coins/images/6319/standard/usdc.png' },
  { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', decimals: 18, logo: 'https://assets.coingecko.com/coins/images/2518/standard/weth.png' },
  { address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', symbol: 'cbBTC', decimals: 8, logo: 'https://assets.coingecko.com/coins/images/1/standard/bitcoin.png' },
  { address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', symbol: 'ETH', decimals: 18, logo: 'https://assets.coingecko.com/coins/images/279/standard/ethereum.png' },
]

const selectedOutput = ref(OUTPUT_TOKENS[0])

// Default output = the selected alloc's own asset (so "same token" withdraw
// is the default for single-asset). When the user swaps the selected alloc in
// a mixed-asset pocket, the output follows.
watch(() => selectedAlloc.value?.assetSymbol, (sym) => {
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

// Per-allocation balances (raw shares + underlying assets in that alloc's
// native decimals). The dialog displays whichever alloc is currently selected.
const vaultAssets = ref<Map<string, bigint>>(new Map())

async function fetchVaultBalance() {
  if (!address.value || !allocs.value.length) return
  loadingBalance.value = true
  try {
    const pub = getPublicClient()
    const sharesMap = new Map<string, bigint>()
    const assetsMap = new Map<string, bigint>()

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
          let assets: bigint
          try {
            assets = await pub.readContract({
              address: alloc.address as `0x${string}`,
              abi: [{ name: 'convertToAssets', type: 'function', stateMutability: 'view', inputs: [{ name: '', type: 'uint256' }], outputs: [{ type: 'uint256' }] }],
              functionName: 'convertToAssets',
              args: [shares],
            })
          } catch {
            // Aave aTokens: balance is 1:1 underlying
            assets = shares
          }
          assetsMap.set(alloc.address, assets)
        } else {
          assetsMap.set(alloc.address, 0n)
        }
      } catch { /* skip */ }
    }
    vaultShares.value = sharesMap
    vaultAssets.value = assetsMap

    // Auto-select the alloc with the largest balance on first load
    if (!selectedAllocAddress.value) {
      let best: { addr: string; bal: bigint } | null = null
      for (const alloc of allocs.value) {
        const a = assetsMap.get(alloc.address) ?? 0n
        if (!best || a > best.bal) best = { addr: alloc.address, bal: a }
      }
      if (best) selectedAllocAddress.value = best.addr
    }
    refreshSelectedBalance()
  } catch {
    vaultBalance.value = '0'
  } finally {
    loadingBalance.value = false
  }
}

function refreshSelectedBalance() {
  const sel = selectedAlloc.value
  if (!sel) { vaultBalance.value = '0'; return }
  const assets = vaultAssets.value.get(sel.address) ?? 0n
  vaultBalance.value = formatUnits(assets, sel.decimals)
}

// Multi-vault detection — drives whether amount input is USD (pocket-wide)
// or native asset units (single-vault only).
const isMultiVault = computed(() => allocs.value.length > 1)

// Pocket-wide total USD across all allocs (for multi-vault display + MAX)
const totalPocketUsd = computed(() => {
  if (!props.pocket) return 0
  const pos = profileStore.pocketPositions[props.pocket.id]
  return pos?.usdValue ?? 0
})

// ── Amount + quote ───────────────────────────────────────────────────────────
const amount = ref('')
const quote = ref<any>(null)
const quotesLoading = ref(false)
let quoteTimer: ReturnType<typeof setTimeout> | null = null

const isSameToken = computed(() => {
  const sel = selectedAlloc.value
  if (!sel) return true
  return selectedOutput.value.symbol === sel.assetSymbol ||
    (selectedOutput.value.symbol === 'ETH' && sel.assetSymbol === 'WETH')
})

// Multi-vault helpers: per-alloc same-as-output check + expected tx count
function sameAsOutput(alloc: WithdrawAlloc): boolean {
  const out = selectedOutput.value.symbol
  return out === alloc.assetSymbol || (out === 'ETH' && alloc.assetSymbol === 'WETH')
}
const swapCount = computed(() => {
  let count = allocs.value.length  // always N redeems
  for (const a of allocs.value) {
    if (!sameAsOutput(a)) count++  // + swap when alloc asset ≠ output
  }
  return count
})

// Minimum withdraw in USD terms (below this, gas costs more than the withdraw)
const MIN_WITHDRAW_USD = 0.10

const balanceTooSmall = computed(() => {
  if (isMultiVault.value) return totalPocketUsd.value < 0.01
  const bal = parseFloat(vaultBalance.value)
  if (bal <= 0) return true
  const decimals = selectedAlloc.value?.decimals ?? 6
  const minAmount = decimals >= 18 ? 0.000001 : decimals >= 8 ? 0.0000001 : 0.001
  return bal < minAmount
})

const amountError = computed(() => {
  if (!amount.value) return null
  const val = parseFloat(amount.value)
  if (isNaN(val) || val <= 0) return 'Enter a valid amount'
  if (isMultiVault.value) {
    if (val > totalPocketUsd.value + 0.0001) return 'Exceeds balance'
  } else {
    if (val > parseFloat(vaultBalance.value)) return 'Exceeds balance'
  }
  return null
})

// Percentage to redeem from each alloc — for multi-vault, derived from the USD
// input vs total pocket USD. For single-vault, from amount vs vault balance.
const withdrawPct = computed(() => {
  const val = parseFloat(amount.value)
  if (isNaN(val) || val <= 0) return 0
  if (isMultiVault.value) {
    if (totalPocketUsd.value <= 0) return 0
    return Math.min(val / totalPocketUsd.value, 1)
  }
  const bal = parseFloat(vaultBalance.value)
  if (bal <= 0) return 0
  return Math.min(val / bal, 1)
})

const canWithdraw = computed(() => {
  if (!amount.value || amountError.value) return false
  if (parseFloat(amount.value) <= 0) return false
  // Multi-vault always redeems same-token per alloc → no quote required
  if (isMultiVault.value) return true
  return isSameToken.value || !!quote.value
})

// ── Opportunity cost preview ────────────────────────────────────────────────
// Show how much yield user would forfeit by withdrawing now vs holding 1 more month.
const opportunityCost = computed(() => {
  if (!strategy.value || !amount.value || !selectedAlloc.value) return null
  const amt = parseFloat(amount.value)
  if (isNaN(amt) || amt <= 0) return null
  const apyStr = profileStore.getStrategyApy(strategy.value.key)
  if (!apyStr) return null
  const apy = parseFloat(apyStr) / 100
  if (apy <= 0) return null
  const monthYield = amt * (Math.pow(1 + apy, 30 / 365) - 1)
  // Price for the selected alloc's asset (falls back to strategy price for
  // legacy single-vault pockets where the strategy price is canonical)
  const price = (profileStore.assetPrices as Record<string, number>)[selectedAlloc.value.assetAddress.toLowerCase()]
    ?? profileStore.getAssetPrice(strategy.value.key)
    ?? 0
  return {
    monthUsd: monthYield * price,
    yearUsd: amt * apy * price,
  }
})

function setMax() {
  amount.value = isMultiVault.value
    ? totalPocketUsd.value.toFixed(6)
    : vaultBalance.value
}

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
  if (!address.value || !selectedAlloc.value || !amount.value) return
  quotesLoading.value = true
  try {
    const targetAlloc = selectedAlloc.value
    const targetShares = vaultShares.value.get(targetAlloc.address) ?? 0n
    if (targetShares === 0n) { quotesLoading.value = false; return }

    const totalBal = parseFloat(vaultBalance.value)
    if (totalBal <= 0) { quotesLoading.value = false; return }
    const pct = Math.min(parseFloat(amount.value) / totalBal, 1)
    const shareAmount = pct >= 0.999
      ? targetShares
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

// Multi-vault progress tracking. `progress` holds the human-readable label for
// what's happening right now (e.g. "Redeeming 1/2 · BBQUSDC"). Cleared when
// withdrawing goes idle.
const progress = ref<{ label: string; step: number; total: number } | null>(null)

async function redeemOneAlloc(
  alloc: WithdrawAlloc,
  pct: number,
  send: (to: string, data: string, value?: string) => Promise<`0x${string}`>,
  pub: ReturnType<typeof getPublicClient>,
  encodeFunctionData: typeof import('viem').encodeFunctionData,
  parseAbi: typeof import('viem').parseAbi,
): Promise<{ hash: `0x${string}`; receipt: Awaited<ReturnType<typeof pub.waitForTransactionReceipt>> } | null> {
  const shares = vaultShares.value.get(alloc.address) ?? 0n
  if (shares === 0n) return null
  const redeemAmount = pct >= 0.999
    ? shares
    : (shares * BigInt(Math.round(pct * 1e9))) / BigInt(1e9)
  if (redeemAmount === 0n) return null

  const isAave = alloc.protocol.toLowerCase().includes('aave')
  let data: `0x${string}`
  let to: `0x${string}`

  if (isAave) {
    const AAVE_POOL_BASE = '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5' as `0x${string}`
    const withdrawAmount = pct >= 0.999
      ? BigInt(2) ** BigInt(256) - BigInt(1)
      : redeemAmount
    data = encodeFunctionData({
      abi: parseAbi(['function withdraw(address asset, uint256 amount, address to) returns (uint256)']),
      functionName: 'withdraw',
      args: [alloc.assetAddress as `0x${string}`, withdrawAmount, address.value!],
    })
    to = AAVE_POOL_BASE
  } else {
    data = encodeFunctionData({
      abi: parseAbi(['function redeem(uint256 shares, address receiver, address owner) returns (uint256)']),
      functionName: 'redeem',
      args: [redeemAmount, address.value!, address.value!],
    })
    to = alloc.address as `0x${string}`
  }

  const hash = await send(to, data)
  const receipt = await pub.waitForTransactionReceipt({ hash })
  return { hash, receipt }
}

async function executeWithdraw() {
  if (!address.value || !canWithdraw.value || !props.pocket) return
  withdrawing.value = true
  withdrawStep.value = 'redeeming'
  withdrawError.value = ''

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

    // Approve `amount` of `token` to `spender` if current allowance < amount.
    async function ensureApproval(token: string, spender: string, amount: bigint): Promise<void> {
      const current = await pub.readContract({
        address: token as `0x${string}`,
        abi: parseAbi(['function allowance(address,address) view returns (uint256)']),
        functionName: 'allowance',
        args: [address.value!, spender as `0x${string}`],
      })
      if (current >= amount) return
      const data = encodeFunctionData({
        abi: parseAbi(['function approve(address,uint256) returns (bool)']),
        functionName: 'approve',
        args: [spender as `0x${string}`, BigInt(2) ** BigInt(256) - BigInt(1)],
      })
      const hash = await send(token, data)
      await pub.waitForTransactionReceipt({ hash })
    }

    const pct = withdrawPct.value
    const outputSym = selectedOutput.value.symbol
    const outputAddr = selectedOutput.value.address

    // Multi-vault: loop every allocation. For each alloc:
    //   1. Redeem shares → receive native underlying asset
    //   2. If native asset ≠ requested output token, swap the actual redeemed
    //      balance via LI.FI (one quote per alloc, fetched with real amount)
    // Partial failures are tolerated — each alloc is independent.
    if (isMultiVault.value) {
      const totalSteps = swapCount.value  // N redeems + M swaps
      let stepIdx = 0
      for (let i = 0; i < allocs.value.length; i++) {
        const alloc = allocs.value[i]!
        const allocLabel = alloc.vaultSymbol || alloc.assetSymbol
        try {
          const sameOut = alloc.assetSymbol === outputSym
            || (outputSym === 'ETH' && alloc.assetSymbol === 'WETH')

          // Step 1: Redeem
          stepIdx++
          progress.value = { label: `Redeeming ${allocLabel}`, step: stepIdx, total: totalSteps }
          withdrawStep.value = 'redeeming'
          const redeemResult = await redeemOneAlloc(alloc, pct, send, pub, encodeFunctionData, parseAbi)
          if (!redeemResult) continue
          lastHash = redeemResult.hash
          withdrawStep.value = 'confirming'

          if (sameOut) continue

          // Step 2: parse redeem receipt logs for Transfer(to=user) of the
          // underlying asset — atomic, no dependency on RPC state propagation.
          const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
          const userLower = address.value!.toLowerCase()
          const assetLower = alloc.assetAddress.toLowerCase()
          let delta = 0n
          for (const log of redeemResult.receipt.logs) {
            if (log.address.toLowerCase() !== assetLower) continue
            if (log.topics[0] !== TRANSFER_TOPIC) continue
            const toTopic = log.topics[2]
            if (!toTopic) continue
            const toAddr = ('0x' + toTopic.slice(26)).toLowerCase()
            if (toAddr !== userLower) continue
            delta += BigInt(log.data)
          }
          if (delta <= 0n) {
            console.warn(`[withdraw] ${alloc.assetSymbol}: no Transfer to user in redeem receipt, skipping swap`)
            continue
          }

          stepIdx++
          progress.value = { label: `Swapping ${alloc.assetSymbol} → ${outputSym}`, step: stepIdx, total: totalSteps }
          withdrawStep.value = 'redeeming'
          const swapQuote = await $fetch<any>('/api/lifi/quote', {
            query: {
              fromChain: 8453,
              toChain: 8453,
              fromToken: alloc.assetAddress,
              toToken: outputAddr,
              fromAmount: delta.toString(),
              fromAddress: address.value,
              slippage: 0.005,
            },
          }).catch((e) => {
            console.warn(`[withdraw] swap quote ${alloc.assetSymbol}→${outputSym} failed:`, e)
            return null
          })

          if (!swapQuote?.transactionRequest) {
            withdrawError.value = `Swap ${alloc.assetSymbol}→${outputSym} unavailable — kept as ${alloc.assetSymbol}`
            continue
          }

          if (swapQuote.estimate?.approvalAddress) {
            await ensureApproval(alloc.assetAddress, swapQuote.estimate.approvalAddress, delta)
          }
          const swapTx = swapQuote.transactionRequest
          const swapHash = await send(swapTx.to, swapTx.data, swapTx.value)
          lastHash = swapHash
          withdrawStep.value = 'confirming'
          await pub.waitForTransactionReceipt({ hash: swapHash })
        } catch (e: any) {
          console.error(`[withdraw] alloc ${alloc.address} failed:`, e)
          withdrawError.value = `${allocLabel} failed: ${e.shortMessage || e.message || 'unknown'}`
          // Continue with remaining allocs even if one fails
        }
      }
      progress.value = null

      if (!lastHash) {
        withdrawStep.value = 'idle'
        if (!withdrawError.value) withdrawError.value = 'Nothing to withdraw'
        return
      }
    } else if (isSameToken.value) {
      // Single-vault, same-token direct redeem
      const alloc = selectedAlloc.value!
      const shares = vaultShares.value.get(alloc.address) ?? 0n
      if (shares === 0n) {
        withdrawError.value = 'No balance in selected vault'
        withdrawStep.value = 'idle'
        return
      }
      const result = await redeemOneAlloc(alloc, pct, send, pub, encodeFunctionData, parseAbi)
      if (result) {
        lastHash = result.hash
        withdrawStep.value = 'confirming'
      }
    } else {
      // Single-vault, cross-token swap via LI.FI
      const alloc = selectedAlloc.value!
      const shares = vaultShares.value.get(alloc.address) ?? 0n
      if (!quote.value?.transactionRequest) {
        withdrawError.value = 'No route found'
        withdrawStep.value = 'idle'
        return
      }

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
      let usdValue: number
      let assetSymbol: string
      if (isMultiVault.value) {
        // Multi-vault: user's input is ALREADY in USD (whole-pocket amount)
        usdValue = parseFloat(amount.value) || 0
        assetSymbol = 'MIXED'
      } else {
        const alloc = selectedAlloc.value!
        const priceForAlloc = (profileStore.assetPrices as Record<string, number>)[alloc.assetAddress.toLowerCase()]
          ?? profileStore.getAssetPrice(props.pocket.strategy_key)
          ?? 0
        const withdrawnTokens = parseFloat(amount.value) || 0
        usdValue = withdrawnTokens * priceForAlloc
        assetSymbol = alloc.assetSymbol
      }
      await recordTransaction({
        pocket_id: props.pocket.id,
        type: 'redeem',
        amount: usdValue.toFixed(6),
        asset_symbol: assetSymbol,
        tx_hash: lastHash,
        timestamp: Math.floor(Date.now() / 1000),
      }).catch((e: any) => console.warn('[withdraw] recordTransaction failed:', e))
    }

    // Invalidate position cache immediately so the UI drops the stale balance
    // while we wait for the onchain read. Refetch this pocket's balance right
    // away — don't rely solely on the parent's @done handler, which runs a
    // full multi-pocket refetch that can race with dialog close.
    profileStore.pocketPositions[props.pocket.id] = { shares: 0n, value: 0n, usdValue: 0 }
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
    progress.value = null
  }
}

// ── Lifecycle ────────────────────────────────────────────────────────────────
watch(open, (v) => {
  if (v) {
    amount.value = ''
    quote.value = null
    withdrawError.value = ''
    withdrawStep.value = 'idle'
    selectedAllocAddress.value = null  // re-pick largest alloc on each open
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
            <template v-if="withdrawStep === 'done'">Withdrawn!</template>
            <template v-else-if="allocs.length > 1">Withdraw from {{ pocket?.name ?? 'pocket' }}</template>
            <template v-else>Withdraw {{ selectedAlloc?.assetSymbol ?? '' }}</template>
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
        <p v-if="isMultiVault" class="text-sm text-muted-foreground">
          Funds from {{ allocs.length }} vaults are back in your wallet.
        </p>
        <p v-else class="text-sm text-muted-foreground">
          {{ estimatedOutput }} {{ selectedOutput.symbol }} is back in your wallet.
        </p>
        <p class="text-xs text-muted-foreground/40 mt-4">Closing automatically…</p>
      </div>

      <!-- Form -->
      <div v-else class="px-5 py-5 space-y-2">

        <!-- FROM: pocket (multi-vault) OR vault (single) -->
        <div class="rounded-2xl bg-muted/40 border border-border/40 p-4">
          <div class="flex items-center justify-between mb-2">
            <p class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {{ isMultiVault ? 'From pocket' : 'From vault' }}
            </p>
            <span v-if="!loadingBalance" class="text-[11px] text-muted-foreground">
              <template v-if="isMultiVault">
                ${{ totalPocketUsd.toLocaleString('en-US', { maximumFractionDigits: 2 }) }} total
              </template>
              <template v-else>
                {{ parseFloat(vaultBalance).toLocaleString('en-US', { maximumFractionDigits: 6 }) }} {{ selectedAlloc?.assetSymbol }}
              </template>
              <button
                v-if="(isMultiVault ? totalPocketUsd : parseFloat(vaultBalance)) > 0"
                class="text-primary font-semibold ml-1"
                @click="setMax"
              >MAX</button>
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
                <span class="font-bold text-sm">{{ isMultiVault ? 'USD' : (selectedAlloc?.assetSymbol ?? '') }}</span>
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

        <!-- TO: multi-vault — output token picker + per-alloc breakdown -->
        <div v-if="isMultiVault" class="rounded-2xl bg-muted/40 border border-border/40 p-4 space-y-3">
          <div class="flex items-center justify-between gap-3 flex-wrap">
            <p class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Receive as</p>
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
          <div class="space-y-1.5">
            <div
              v-for="alloc in allocs" :key="alloc.address"
              class="flex items-center gap-2 px-3 py-2 rounded-xl bg-background/40 border border-border/40"
            >
              <div class="flex-1 min-w-0">
                <p class="text-sm font-semibold truncate">{{ alloc.vaultSymbol || alloc.assetSymbol }}</p>
                <p class="text-[10px] text-muted-foreground/60 truncate">
                  redeem {{ alloc.assetSymbol }}<span v-if="!sameAsOutput(alloc)"> → swap to {{ selectedOutput.symbol }}</span>
                </p>
              </div>
              <div class="text-right shrink-0">
                <p class="text-sm font-bold tabular-nums text-primary">
                  ~{{ parseFloat(formatUnits(
                    (vaultAssets.get(alloc.address) ?? 0n) * BigInt(Math.round(withdrawPct * 1e9)) / BigInt(1e9),
                    alloc.decimals
                  )).toLocaleString('en-US', { maximumFractionDigits: 6 }) }}
                </p>
                <p class="text-[9px] text-muted-foreground/50">{{ alloc.assetSymbol }}</p>
              </div>
            </div>
          </div>
          <p class="text-[10px] text-muted-foreground/60 text-center">
            Fires {{ swapCount }} tx: {{ allocs.length }} redeem{{ swapCount > allocs.length ? ' + ' + (swapCount - allocs.length) + ' swap' : '' }}
          </p>
        </div>

        <!-- TO: single-vault wallet + output token picker -->
        <div v-else class="rounded-2xl bg-muted/40 border border-border/40 p-4">
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

        <!-- Detailed transaction preview (single-vault only — multi-vault uses breakdown above) -->
        <AppTxPreview
          v-if="!isMultiVault && !isSameToken && amount && (quotesLoading || quote)"
          :quote="quote"
          :loading="quotesLoading"
          title="Withdraw Preview"
          :subtitle="`${selectedAlloc?.vaultSymbol || selectedAlloc?.assetSymbol || ''} → ${selectedOutput.symbol}`"
        />

        <!-- Same-token withdraw: manual preview (direct vault redeem) -->
        <AppTxPreview
          v-else-if="!isMultiVault && isSameToken && amount && parseFloat(amount) > 0 && selectedAlloc"
          :manual="{
            fromChainId: 8453,
            fromChainName: 'Base',
            fromTokenSymbol: `${selectedAlloc.vaultSymbol || selectedAlloc.assetSymbol} shares`,
            fromAmount: amount,
            toChainId: 8453,
            toChainName: 'Base',
            toTokenSymbol: selectedAlloc.assetSymbol,
            toAmount: amount,
            steps: [
              { label: 'Redeem', via: selectedAlloc.protocol || 'vault contract' },
            ],
            estTimeSeconds: 5,
          }"
          title="Withdraw Preview"
          :subtitle="`Direct redeem from ${selectedAlloc?.vaultSymbol || selectedAlloc?.assetSymbol}`"
        />

        <div v-else-if="!isSameToken && amount && parseFloat(amount) > 0 && !quotesLoading && !quote" class="text-[11px] text-amber-400 px-1">
          No route found — try a different output token
        </div>

        <!-- Progress -->
        <div v-if="withdrawing" class="rounded-2xl bg-muted/40 border border-border/40 p-4 space-y-3">
          <!-- Multi-vault: per-step counter + label -->
          <template v-if="isMultiVault && progress">
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Step {{ progress.step }} / {{ progress.total }}
              </span>
              <span class="text-[11px] text-muted-foreground/60">
                {{ withdrawStep === 'confirming' ? 'confirming…' : 'sending…' }}
              </span>
            </div>
            <div class="flex items-center gap-3">
              <Icon name="lucide:loader-2" class="w-4 h-4 shrink-0 text-primary animate-spin" />
              <span class="text-sm font-semibold">{{ progress.label }}</span>
            </div>
            <!-- Progress bar -->
            <div class="h-1 rounded-full bg-muted overflow-hidden">
              <div
                class="h-full bg-primary transition-all duration-300"
                :style="{ width: `${(progress.step / progress.total) * 100}%` }"
              />
            </div>
          </template>
          <!-- Single-vault: original two-line indicator -->
          <template v-else>
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
          </template>
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
          {{
            !hasGas ? 'Need USDC for gas'
            : !amount ? 'Enter amount'
            : amountError ?? (
              isMultiVault ? `Withdraw from ${allocs.length} vaults`
              : isSameToken ? `Withdraw ${selectedAlloc?.assetSymbol ?? ''}`
              : `Swap to ${selectedOutput.symbol}`
            )
          }}
        </Button>

        <p v-if="withdrawError" class="text-xs text-destructive text-center">{{ withdrawError }}</p>
        <p v-if="hasGas" class="text-[11px] text-muted-foreground/40 text-center">
          Gas: {{ usdcForGas }} USDC available
        </p>
      </div>
    </DialogContent>
  </Dialog>
</template>
