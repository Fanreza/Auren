import { usePrivyAuth } from '~/composables/usePrivy'
import type { Strategy } from '~/config/strategies'
import { useEnso } from './useEnso'
import { createYoClient, YO_GATEWAY_ADDRESS, formatTokenAmount } from '@yo-protocol/core'
import type { MerklChainRewards } from '@yo-protocol/core'
import { encodeFunctionData, parseAbi } from 'viem'

export interface VaultSnapshotResult {
  yield: {
    '1d': string | null
    '7d': string | null
    '30d': string | null
  }
  tvl: string | null
}

export interface UserHistoryEntry {
  type: 'deposit' | 'withdraw' | 'redeem'
  timestamp: number
  assets: { raw: string; formatted: string }
  shares: { raw: string; formatted: string }
  txHash: string
}

export interface UserPerformanceResult {
  realized: { raw: string; formatted: string }
  unrealized: { raw: string; formatted: string }
}

export interface PreviewResult {
  shares: bigint
  assets: bigint
}

export interface ClaimableReward {
  tokenAddress: string
  tokenSymbol: string
  tokenDecimals: number
  claimable: bigint
  claimableFormatted: string
}

export interface RewardsInfo {
  rewards: ClaimableReward[]
  hasClaimable: boolean
  raw: MerklChainRewards | null
}

export type TxState =
  | 'idle'
  | 'preparing'
  | 'approving'
  | 'awaiting_signature'
  | 'pending'
  | 'confirmed'
  | 'failed'

const BASE_CHAIN_ID = 8453

export function useVault() {
  const { address, getPublicClient, getWalletClient } = usePrivyAuth()

  const txState = ref<TxState>('idle')
  const txHash = ref<`0x${string}` | null>(null)
  const txError = ref('')
  const gasEstimate = ref('')

  // Send a transaction through the wallet client
  // Gas estimation, signing, and broadcasting are handled by the provider wrapper in usePrivy
  async function sendTx(params: {
    to: `0x${string}`
    data: `0x${string}`
    value?: bigint
  }): Promise<`0x${string}`> {
    const walletClient = await getWalletClient()
    return walletClient.sendTransaction({
      to: params.to,
      data: params.data,
      value: params.value ?? 0n,
    })
  }

  // Create a Yo client with wallet for write operations
  async function getYoClient() {
    const walletClient = await getWalletClient()
    const publicClient = getPublicClient()
    return createYoClient({ chainId: BASE_CHAIN_ID, walletClient, publicClients: { [BASE_CHAIN_ID]: publicClient }, partnerId: 9999 })
  }

  // Read-only Yo client (no wallet needed)
  function getReadClient() {
    const publicClient = getPublicClient()
    return createYoClient({ chainId: BASE_CHAIN_ID, publicClients: { [BASE_CHAIN_ID]: publicClient } })
  }

  // ---- Gas estimation ----
  async function estimateDepositGas(_strategy: Strategy, _amount: bigint) {
    // Yo SDK handles gas estimation internally
    gasEstimate.value = ''
  }

  // ---- Deposit via Yo Gateway ----
  async function deposit(strategy: Strategy, amount: bigint) {
    if (!address.value || amount === 0n) return
    try {
      txState.value = 'preparing'
      txError.value = ''
      txHash.value = null

      const client = await getYoClient()

      // Check if vault is paused
      const paused = await client.isPaused(strategy.vaultAddress)
      if (paused) {
        txError.value = 'This vault is currently paused'
        txState.value = 'failed'
        return
      }

      // Check on-chain allowance and approve max if needed
      txState.value = 'approving'
      const publicClient = getPublicClient()
      const allowance = await publicClient.readContract({
        address: strategy.assetAddress as `0x${string}`,
        abi: [{ name: 'allowance', type: 'function', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' }],
        functionName: 'allowance',
        args: [address.value, YO_GATEWAY_ADDRESS as `0x${string}`],
      }) as bigint

      if (allowance < amount) {
        const MAX_UINT256 = 2n ** 256n - 1n
        const approveData = encodeFunctionData({
          abi: [{ name: 'approve', type: 'function', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] }],
          functionName: 'approve',
          args: [YO_GATEWAY_ADDRESS as `0x${string}`, MAX_UINT256],
        })
        const approveHash = await sendTx({
          to: strategy.assetAddress as `0x${string}`,
          data: approveData,
        })
        const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveHash })
        if (approveReceipt.status !== 'success') {
          txError.value = 'Approval failed'
          txState.value = 'failed'
          return
        }
      }

      txState.value = 'awaiting_signature'
      const preparedTx = await client.prepareDeposit({
        vault: strategy.vaultAddress,
        amount,
        recipient: address.value,
      })

      const hash = await sendTx({
        to: preparedTx.to as `0x${string}`,
        data: preparedTx.data as `0x${string}`,
        value: preparedTx.value,
      })

      txHash.value = hash
      txState.value = 'pending'

      const depositReceipt = await publicClient.waitForTransactionReceipt({ hash })
      txState.value = depositReceipt.status === 'success' ? 'confirmed' : 'failed'
      if (depositReceipt.status !== 'success') txError.value = 'Transaction reverted'
    } catch (e: any) {
      console.error('[useVault] deposit error:', e)
      txState.value = 'failed'
      txError.value = e.shortMessage || e.message || 'Transaction failed'
    }
  }

  // ---- Redeem: try Yo Gateway first, fall back to direct vault redeem ----
  async function redeem(strategy: Strategy, shares: bigint) {
    if (!address.value || shares === 0n) return
    try {
      txState.value = 'preparing'
      txError.value = ''
      txHash.value = null

      const publicClient = getPublicClient()
      const vaultAbi = parseAbi([
        'function maxRedeem(address) view returns (uint256)',
        'function redeem(uint256 shares, address receiver, address owner) returns (uint256)',
      ])

      // Check if the gateway can redeem from this vault
      const gatewayMaxRedeem = await publicClient.readContract({
        address: strategy.vaultAddress as `0x${string}`,
        abi: vaultAbi,
        functionName: 'maxRedeem',
        args: [YO_GATEWAY_ADDRESS as `0x${string}`],
      })

      if (gatewayMaxRedeem > 0n) {
        // Gateway can redeem — use Yo Gateway flow
        await redeemViaGateway(strategy, shares)
      } else {
        // Gateway maxRedeem=0 — redeem directly from the vault
        await redeemDirect(strategy, shares)
      }
    } catch (e: any) {
      console.error('[useVault] redeem error:', e)
      txState.value = 'failed'
      txError.value = e.shortMessage || e.message || 'Transaction failed'
    }
  }

  // Redeem via Yo Gateway (original flow)
  async function redeemViaGateway(strategy: Strategy, shares: bigint) {
    const client = await getYoClient()

    txState.value = 'approving'
    const hasAllowance = await client.hasEnoughAllowance(
      strategy.vaultAddress,
      address.value!,
      YO_GATEWAY_ADDRESS,
      shares,
    )

    if (!hasAllowance) {
      const approveTx = client.prepareApprove({
        token: strategy.vaultAddress as `0x${string}`,
        spender: YO_GATEWAY_ADDRESS as `0x${string}`,
        amount: shares,
      })
      const approveHash = await sendTx({
        to: approveTx.to,
        data: approveTx.data,
        value: approveTx.value,
      })
      await client.waitForTransaction(approveHash)
    }

    txState.value = 'awaiting_signature'
    const preparedTx = await client.prepareRedeem({
      vault: strategy.vaultAddress,
      shares,
      recipient: address.value!,
    })

    const hash = await sendTx({
      to: preparedTx.to as `0x${string}`,
      data: preparedTx.data as `0x${string}`,
      value: preparedTx.value,
    })

    txHash.value = hash
    txState.value = 'pending'

    const publicClient = getPublicClient()
    const txReceipt = await publicClient.waitForTransactionReceipt({ hash })
    if (txReceipt.status !== 'success') {
      txState.value = 'failed'
      txError.value = 'Transaction reverted'
      return
    }

    try {
      const receipt = await client.waitForRedeemReceipt(hash)
      txState.value = 'confirmed'
      if (!receipt.instant) {
        txError.value = 'Your withdrawal is queued and will be processed shortly.'
      }
    } catch {
      txState.value = 'confirmed'
    }
  }

  // Redeem directly from the vault (ERC-4626 redeem)
  async function redeemDirect(strategy: Strategy, shares: bigint) {
    txState.value = 'awaiting_signature'

    const data = encodeFunctionData({
      abi: parseAbi(['function redeem(uint256 shares, address receiver, address owner) returns (uint256)']),
      functionName: 'redeem',
      args: [shares, address.value!, address.value!],
    })

    const hash = await sendTx({
      to: strategy.vaultAddress as `0x${string}`,
      data,
    })

    txHash.value = hash
    txState.value = 'pending'

    const publicClient = getPublicClient()
    const txReceipt = await publicClient.waitForTransactionReceipt({ hash })
    txState.value = txReceipt.status === 'success' ? 'confirmed' : 'failed'
    if (txReceipt.status !== 'success') txError.value = 'Transaction reverted'
  }

  // ---- Read vault position via Yo SDK ----
  async function getShareBalance(strategy: Strategy): Promise<bigint> {
    if (!address.value) return 0n
    try {
      const client = getReadClient()
      const shares = await client.getShareBalance(strategy.vaultAddress, address.value)
      console.log(`[vault] getShareBalance(${strategy.vaultSymbol}, ${address.value}):`, shares.toString())
      return shares
    } catch (e) {
      console.error(`[vault] getShareBalance(${strategy.vaultSymbol}) failed:`, e)
      return 0n
    }
  }

  async function getShareValue(strategy: Strategy, shares: bigint): Promise<bigint> {
    if (shares === 0n) return 0n
    try {
      const client = getReadClient()
      const value = await client.convertToAssets(strategy.vaultAddress, shares)
      console.log(`[vault] convertToAssets(${strategy.vaultSymbol}, ${shares}):`, value.toString())
      return value
    } catch (e) {
      console.error(`[vault] convertToAssets(${strategy.vaultSymbol}) failed:`, e)
      return 0n
    }
  }

  // ---- Zap Deposit (via Enso) ----
  async function zapDeposit(strategy: Strategy, tokenIn: `0x${string}`, amount: string) {
    if (!address.value) return
    const { getZapQuote, NATIVE_TOKEN } = useEnso()

    try {
      txState.value = 'preparing'
      txError.value = ''
      txHash.value = null

      const quote = await getZapQuote(tokenIn, strategy, amount, address.value)
      if (!quote) {
        txError.value = 'Could not find a route for this swap'
        txState.value = 'failed'
        return
      }

      // Approve token spend if not native ETH
      if (tokenIn.toLowerCase() !== NATIVE_TOKEN.toLowerCase()) {
        txState.value = 'approving'
        const spender = quote.tx.to as `0x${string}`
        const MAX_UINT256 = 2n ** 256n - 1n
        const erc20ApproveData = encodeFunctionData({
          abi: [{ name: 'approve', type: 'function', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] }],
          functionName: 'approve',
          args: [spender, MAX_UINT256],
        })
        const approveHash = await sendTx({
          to: tokenIn as `0x${string}`,
          data: erc20ApproveData,
        })
        const publicClient = getPublicClient()
        const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveHash })
        if (approveReceipt.status !== 'success') {
          txError.value = 'Approval failed'
          txState.value = 'failed'
          return
        }
      }

      txState.value = 'awaiting_signature'
      const freshQuote = await $fetch<any>('/api/enso/route', {
        method: 'POST',
        body: {
          fromAddress: address.value,
          amountIn: amount,
          tokenIn,
          tokenOut: strategy.vaultAddress,
          slippage: '300',
        },
      })

      const execQuote = freshQuote?.tx ? freshQuote : quote
      const hash = await sendTx({
        to: execQuote.tx.to as `0x${string}`,
        data: execQuote.tx.data as `0x${string}`,
        value: BigInt(execQuote.tx.value || '0'),
      })

      txHash.value = hash
      txState.value = 'pending'

      const pc = getPublicClient()
      const receipt = await pc.waitForTransactionReceipt({ hash })
      txState.value = receipt.status === 'success' ? 'confirmed' : 'failed'
      if (receipt.status !== 'success') txError.value = 'Transaction reverted'
    } catch (e: any) {
      console.error('[useVault] zapDeposit error:', e)
      txState.value = 'failed'
      txError.value = e.shortMessage || e.message || 'Transaction failed'
    }
  }

  // ---- Zap Withdraw (redeem vault → any token via Enso) ----
  async function zapWithdraw(strategy: Strategy, shares: bigint, tokenOut: `0x${string}`) {
    if (!address.value || shares === 0n) return

    try {
      txState.value = 'preparing'
      txError.value = ''
      txHash.value = null

      // Get Enso route: vault token → desired output token
      const quote = await $fetch<any>('/api/enso/route', {
        method: 'POST',
        body: {
          fromAddress: address.value,
          amountIn: shares.toString(),
          tokenIn: strategy.vaultAddress,
          tokenOut,
          slippage: '300',
        },
      })

      if (!quote?.tx) {
        txError.value = 'Could not find a route for this withdrawal'
        txState.value = 'failed'
        return
      }

      // Approve vault shares to Enso router (max approval)
      txState.value = 'approving'
      const spender = quote.tx.to as `0x${string}`
      const MAX_UINT256 = 2n ** 256n - 1n
      const erc20ApproveData = encodeFunctionData({
        abi: [{ name: 'approve', type: 'function', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] }],
        functionName: 'approve',
        args: [spender, MAX_UINT256],
      })
      console.log('[vault] zapWithdraw: approving vault shares to', spender)
      const approveHash = await sendTx({
        to: strategy.vaultAddress as `0x${string}`,
        data: erc20ApproveData,
      })
      console.log('[vault] zapWithdraw: approval tx hash', approveHash)
      const publicClient = getPublicClient()
      const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveHash })
      console.log('[vault] zapWithdraw: approval status', approveReceipt.status)
      if (approveReceipt.status !== 'success') {
        txError.value = 'Approval failed'
        txState.value = 'failed'
        return
      }

      txState.value = 'awaiting_signature'
      const freshQuote = await $fetch<any>('/api/enso/route', {
        method: 'POST',
        body: {
          fromAddress: address.value,
          amountIn: shares.toString(),
          tokenIn: strategy.vaultAddress,
          tokenOut,
          slippage: '300',
        },
      })

      const execQuote = freshQuote?.tx ? freshQuote : quote
      const hash = await sendTx({
        to: execQuote.tx.to as `0x${string}`,
        data: execQuote.tx.data as `0x${string}`,
        value: BigInt(execQuote.tx.value || '0'),
      })

      txHash.value = hash
      txState.value = 'pending'

      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      txState.value = receipt.status === 'success' ? 'confirmed' : 'failed'
      if (receipt.status !== 'success') txError.value = 'Transaction reverted'
    } catch (e: any) {
      console.error('[useVault] zapWithdraw error:', e)
      txState.value = 'failed'
      txError.value = e.shortMessage || e.message || 'Withdrawal failed'
    }
  }

  // ---- Vault Snapshot (APY data) ----
  // Call Yo API directly — the SDK's Zod schema has a bug where
  // idleBalances[].raw is expected as string but API returns number
  async function getVaultSnapshot(strategy: Strategy): Promise<VaultSnapshotResult | null> {
    try {
      const res = await fetch(
        `https://api.yo.xyz/api/v1/vault/base/${strategy.vaultAddress}`,
      )
      if (!res.ok) {
        console.error(`[vault] snapshot API ${res.status} for ${strategy.vaultSymbol}`)
        return null
      }
      const json = await res.json()
      const yld = json.data?.stats?.yield
      const tvlRaw = json.data?.stats?.tvl
      return {
        yield: {
          '1d': yld?.['1d'] ?? null,
          '7d': yld?.['7d'] ?? null,
          '30d': yld?.['30d'] ?? null,
        },
        tvl: tvlRaw?.formatted ?? (tvlRaw?.raw != null ? String(tvlRaw.raw) : null),
      }
    } catch (e) {
      console.error(`[vault] getVaultSnapshot(${strategy.vaultSymbol}) failed:`, e)
      return null
    }
  }

  // ---- User Transaction History ----
  // Call Yo API directly — SDK schema expects lowercase type + different field names
  async function getUserHistory(strategy: Strategy, userAddress: string): Promise<UserHistoryEntry[]> {
    try {
      const res = await fetch(
        `https://api.yo.xyz/api/v1/history/user/base/${strategy.vaultAddress}/${userAddress}`,
      )
      if (!res.ok) return []
      const json = await res.json()
      const items = json.data ?? []
      return items.map((item: any) => ({
        type: (item.type as string).toLowerCase() as 'deposit' | 'withdraw' | 'redeem',
        timestamp: item.blockTimestamp,
        assets: { raw: String(item.assets?.raw ?? '0'), formatted: item.assets?.formatted ?? '0' },
        shares: { raw: String(item.shares?.raw ?? '0'), formatted: item.shares?.formatted ?? '0' },
        txHash: item.transactionHash,
      }))
    } catch (e) {
      console.error(`[vault] getUserHistory(${strategy.vaultSymbol}) failed:`, e)
      return []
    }
  }

  // ---- User Performance (profit) ----
  // Call Yo API directly — SDK schema expects raw as string but API returns number
  async function getUserPerformance(strategy: Strategy, userAddress: string): Promise<UserPerformanceResult | null> {
    try {
      const res = await fetch(
        `https://api.yo.xyz/api/v1/performance/user/base/${strategy.vaultAddress}/${userAddress}`,
      )
      if (!res.ok) return null
      const json = await res.json()
      const data = json.data
      if (!data) return null
      return {
        realized: { raw: String(data.realized?.raw ?? '0'), formatted: data.realized?.formatted ?? '0' },
        unrealized: { raw: String(data.unrealized?.raw ?? '0'), formatted: data.unrealized?.formatted ?? '0' },
      }
    } catch (e) {
      console.error(`[vault] getUserPerformance(${strategy.vaultSymbol}) failed:`, e)
      return null
    }
  }

  // ---- Switch Vault: swap old vault shares → new vault shares via Enso ----
  async function switchVault(
    fromStrategy: Strategy,
    toStrategy: Strategy,
    shares: bigint,
  ) {
    if (!address.value || shares === 0n) return
    try {
      txState.value = 'preparing'
      txError.value = ''
      txHash.value = null

      // Get Enso route: old vault token → new vault token
      const quote = await $fetch<any>('/api/enso/route', {
        method: 'POST',
        body: {
          fromAddress: address.value,
          amountIn: shares.toString(),
          tokenIn: fromStrategy.vaultAddress,
          tokenOut: toStrategy.vaultAddress,
          slippage: '300',
        },
      })

      if (!quote?.tx) {
        txError.value = 'Could not find a route for this switch'
        txState.value = 'failed'
        return
      }

      // Approve old vault shares to Enso router (max approval)
      txState.value = 'approving'
      const spender = quote.tx.to as `0x${string}`
      const publicClient = getPublicClient()
      const allowance = await publicClient.readContract({
        address: fromStrategy.vaultAddress as `0x${string}`,
        abi: [{ name: 'allowance', type: 'function', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' }],
        functionName: 'allowance',
        args: [address.value, spender],
      }) as bigint

      if (allowance < shares) {
        const MAX_UINT256 = 2n ** 256n - 1n
        const approveData = encodeFunctionData({
          abi: [{ name: 'approve', type: 'function', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] }],
          functionName: 'approve',
          args: [spender, MAX_UINT256],
        })
        const approveHash = await sendTx({
          to: fromStrategy.vaultAddress as `0x${string}`,
          data: approveData,
        })
        const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveHash })
        if (approveReceipt.status !== 'success') {
          txError.value = 'Approval failed'
          txState.value = 'failed'
          return
        }
      }

      txState.value = 'awaiting_signature'
      const freshQuote = await $fetch<any>('/api/enso/route', {
        method: 'POST',
        body: {
          fromAddress: address.value,
          amountIn: shares.toString(),
          tokenIn: fromStrategy.vaultAddress,
          tokenOut: toStrategy.vaultAddress,
          slippage: '300',
        },
      })

      const execQuote = freshQuote?.tx ? freshQuote : quote
      const hash = await sendTx({
        to: execQuote.tx.to as `0x${string}`,
        data: execQuote.tx.data as `0x${string}`,
        value: BigInt(execQuote.tx.value || '0'),
      })

      txHash.value = hash
      txState.value = 'pending'

      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      txState.value = receipt.status === 'success' ? 'confirmed' : 'failed'
      if (receipt.status !== 'success') txError.value = 'Transaction reverted'
    } catch (e: any) {
      console.error('[useVault] switchVault error:', e)
      txState.value = 'failed'
      txError.value = e.shortMessage || e.message || 'Switch vault failed'
    }
  }

  // ---- Preview Deposit/Redeem (estimates before tx) ----
  async function previewDeposit(strategy: Strategy, amount: bigint): Promise<bigint> {
    if (amount === 0n) return 0n
    try {
      const client = getReadClient()
      return await client.previewDeposit(strategy.vaultAddress, amount)
    } catch (e) {
      console.error(`[vault] previewDeposit(${strategy.vaultSymbol}) failed:`, e)
      return 0n
    }
  }

  async function previewRedeem(strategy: Strategy, shares: bigint): Promise<bigint> {
    if (shares === 0n) return 0n
    try {
      const client = getReadClient()
      return await client.previewRedeem(strategy.vaultAddress, shares)
    } catch (e) {
      console.error(`[vault] previewRedeem(${strategy.vaultSymbol}) failed:`, e)
      return 0n
    }
  }

  // ---- Merkl Rewards ----
  async function getClaimableRewards(): Promise<RewardsInfo> {
    const empty: RewardsInfo = { rewards: [], hasClaimable: false, raw: null }
    if (!address.value) return empty
    try {
      const client = getReadClient()
      const chainRewards = await client.getClaimableRewards(address.value)
      if (!chainRewards || !client.hasMerklClaimableRewards(chainRewards)) {
        return empty
      }

      const rewards: ClaimableReward[] = []
      for (const r of chainRewards.rewards) {
        const claimable = client.getMerklClaimableAmount(r)
        if (claimable > 0n) {
          rewards.push({
            tokenAddress: r.token.address,
            tokenSymbol: r.token.symbol,
            tokenDecimals: r.token.decimals,
            claimable,
            claimableFormatted: formatTokenAmount(claimable, r.token.decimals),
          })
        }
      }

      return { rewards, hasClaimable: rewards.length > 0, raw: chainRewards }
    } catch (e) {
      console.error('[vault] getClaimableRewards failed:', e)
      return empty
    }
  }

  async function claimRewards(chainRewards: MerklChainRewards) {
    if (!address.value) return
    try {
      txState.value = 'awaiting_signature'
      txError.value = ''
      txHash.value = null

      const client = await getYoClient()
      const preparedTx = client.prepareClaimMerklRewards(address.value, chainRewards)

      const hash = await sendTx({
        to: preparedTx.to as `0x${string}`,
        data: preparedTx.data as `0x${string}`,
        value: preparedTx.value,
      })

      txHash.value = hash
      txState.value = 'pending'

      const publicClient = getPublicClient()
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      txState.value = receipt.status === 'success' ? 'confirmed' : 'failed'
      if (receipt.status !== 'success') txError.value = 'Claim transaction reverted'
    } catch (e: any) {
      console.error('[useVault] claimRewards error:', e)
      txState.value = 'failed'
      txError.value = e.shortMessage || e.message || 'Claim failed'
    }
  }

  function reset() {
    txState.value = 'idle'
    txHash.value = null
    txError.value = ''
    gasEstimate.value = ''
  }

  return {
    txState,
    txHash,
    txError,
    gasEstimate,
    deposit,
    redeem,
    zapDeposit,
    zapWithdraw,
    switchVault,
    estimateDepositGas,
    getShareBalance,
    getShareValue,
    getVaultSnapshot,
    getUserHistory,
    getUserPerformance,
    previewDeposit,
    previewRedeem,
    getClaimableRewards,
    claimRewards,
    reset,
  }
}
