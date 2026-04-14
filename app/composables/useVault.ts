import { usePrivyAuth } from '~/composables/usePrivy'
import type { Strategy } from '~/config/strategies'
import { useLifi, type LifiQuote } from './useLifi'
import { encodeFunctionData, parseAbi, createPublicClient, http } from 'viem'
import { base, mainnet, arbitrum, optimism, polygon } from 'viem/chains'

export type TxState =
  | 'idle'
  | 'preparing'
  | 'approving'
  | 'awaiting_signature'
  | 'pending'
  | 'confirmed'
  | 'failed'

// Cross-chain transfer status — exposed for UI progress display
export type CrossChainStatus = 'idle' | 'bridging' | 'done' | 'failed' | 'partial'

const ERC20_ABI = parseAbi([
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
])

const ERC4626_ABI = parseAbi([
  'function deposit(uint256 assets, address receiver) returns (uint256 shares)',
  'function redeem(uint256 shares, address receiver, address owner) returns (uint256 assets)',
  'function convertToAssets(uint256 shares) view returns (uint256)',
  'function previewDeposit(uint256 assets) view returns (uint256)',
  'function previewRedeem(uint256 shares) view returns (uint256)',
])

export function useVault() {
  const { address, getPublicClient, getWalletClient } = usePrivyAuth()

  const txState = ref<TxState>('idle')
  const txHash = ref<`0x${string}` | null>(null)
  const txError = ref('')
  const gasEstimate = ref('')
  const crossChainStatus = ref<CrossChainStatus>('idle')
  const crossChainTxHash = ref<`0x${string}` | null>(null)

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

  // ---- Direct ERC-4626 deposit (fallback when no LI.FI vault available) ----
  async function deposit(strategy: Strategy, amount: bigint) {
    if (!address.value || amount === 0n) return
    try {
      txState.value = 'preparing'
      txError.value = ''
      txHash.value = null

      const publicClient = getPublicClient()

      // Approve asset to vault if needed
      txState.value = 'approving'
      const allowance = await publicClient.readContract({
        address: strategy.assetAddress,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [address.value, strategy.vaultAddress],
      })

      if (allowance < amount) {
        const approveData = encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [strategy.vaultAddress, 2n ** 256n - 1n],
        })
        const approveHash = await sendTx({ to: strategy.assetAddress, data: approveData })
        const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveHash })
        if (approveReceipt.status !== 'success') {
          txError.value = 'Approval failed'
          txState.value = 'failed'
          return
        }
      }

      txState.value = 'awaiting_signature'
      const depositData = encodeFunctionData({
        abi: ERC4626_ABI,
        functionName: 'deposit',
        args: [amount, address.value],
      })
      const hash = await sendTx({ to: strategy.vaultAddress, data: depositData })
      txHash.value = hash
      txState.value = 'pending'

      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      txState.value = receipt.status === 'success' ? 'confirmed' : 'failed'
      if (receipt.status !== 'success') txError.value = 'Transaction reverted'
    } catch (e: any) {
      console.error('[useVault] deposit error:', e)
      txState.value = 'failed'
      txError.value = e.shortMessage || e.message || 'Transaction failed'
    }
  }

  // ---- Direct ERC-4626 redeem ----
  async function redeem(strategy: Strategy, shares: bigint) {
    if (!address.value || shares === 0n) return
    try {
      txState.value = 'awaiting_signature'
      txError.value = ''
      txHash.value = null

      const redeemData = encodeFunctionData({
        abi: ERC4626_ABI,
        functionName: 'redeem',
        args: [shares, address.value, address.value],
      })
      const hash = await sendTx({ to: strategy.vaultAddress, data: redeemData })
      txHash.value = hash
      txState.value = 'pending'

      const publicClient = getPublicClient()
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      txState.value = receipt.status === 'success' ? 'confirmed' : 'failed'
      if (receipt.status !== 'success') txError.value = 'Transaction reverted'
    } catch (e: any) {
      console.error('[useVault] redeem error:', e)
      txState.value = 'failed'
      txError.value = e.shortMessage || e.message || 'Transaction failed'
    }
  }

  // ---- Read vault position (ERC-20 balanceOf + ERC-4626 convertToAssets) ----
  async function getShareBalance(strategy: Strategy): Promise<bigint> {
    if (!address.value) return 0n
    try {
      const publicClient = getPublicClient()
      return await publicClient.readContract({
        address: strategy.vaultAddress,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address.value],
      })
    } catch (e) {
      console.error(`[vault] getShareBalance(${strategy.vaultSymbol}) failed:`, e)
      return 0n
    }
  }

  async function getShareValue(strategy: Strategy, shares: bigint): Promise<bigint> {
    if (shares === 0n) return 0n
    try {
      const publicClient = getPublicClient()
      return await publicClient.readContract({
        address: strategy.vaultAddress,
        abi: ERC4626_ABI,
        functionName: 'convertToAssets',
        args: [shares],
      })
    } catch (e) {
      console.error(`[vault] convertToAssets(${strategy.vaultSymbol}) failed:`, e)
      return 0n
    }
  }

  // ---- Preview estimates ----
  async function previewDeposit(strategy: Strategy, amount: bigint): Promise<bigint> {
    if (amount === 0n) return 0n
    try {
      const publicClient = getPublicClient()
      return await publicClient.readContract({
        address: strategy.vaultAddress,
        abi: ERC4626_ABI,
        functionName: 'previewDeposit',
        args: [amount],
      })
    } catch (e) {
      console.error(`[vault] previewDeposit(${strategy.vaultSymbol}) failed:`, e)
      return 0n
    }
  }

  async function previewRedeem(strategy: Strategy, shares: bigint): Promise<bigint> {
    if (shares === 0n) return 0n
    try {
      const publicClient = getPublicClient()
      return await publicClient.readContract({
        address: strategy.vaultAddress,
        abi: ERC4626_ABI,
        functionName: 'previewRedeem',
        args: [shares],
      })
    } catch (e) {
      console.error(`[vault] previewRedeem(${strategy.vaultSymbol}) failed:`, e)
      return 0n
    }
  }

  // ── Chain helpers ───────────────────────────────────────────────────────────
  const CHAINS: Record<number, any> = {
    [base.id]: base, [mainnet.id]: mainnet,
    [arbitrum.id]: arbitrum, [optimism.id]: optimism, [polygon.id]: polygon,
  }

  function getPublicClientForChain(chainId: number) {
    const chain = CHAINS[chainId] ?? base
    return createPublicClient({ chain, transport: http() })
  }

  // ── LI.FI Composer Deposit ──────────────────────────────────────────────────
  async function lifiDeposit(params: {
    fromChain: number
    fromToken: string
    fromAmount: string
    vaultAddress: string
    vaultChainId: number
    /** Underlying asset address of the vault (e.g. cbBTC for the Balanced pocket).
     *  Used to validate fallback deposits: direct deposit only works when fromToken == asset. */
    vaultAssetAddress?: string
    /** Protocol name (e.g. 'morpho-v1', 'aave-v3'). Aave uses Pool.supply() not vault.deposit(). */
    vaultProtocol?: string
    quote?: LifiQuote
  }) {
    if (!address.value) return

    const NATIVE = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
    const { getDepositQuote, pollTransferStatus } = useLifi()

    try {
      txState.value = 'preparing'
      txError.value = ''
      txHash.value = null
      crossChainStatus.value = 'idle'
      crossChainTxHash.value = null

      // address.value = smart account address (tokens live here, gas paid via paymaster)
      const fromAddress = address.value as string
      const send = sendTx

      let quote: LifiQuote | null = params.quote ?? null
      if (!quote) {
        quote = await getDepositQuote({
          fromChain: params.fromChain,
          fromToken: params.fromToken,
          fromAmount: params.fromAmount,
          fromAddress,
          toChain: params.vaultChainId,
          vaultAddress: params.vaultAddress,
        })
      }

      // If LI.FI route is NOT composer (e.g. falls back to swap), use direct ERC-4626 deposit
      // Swapping into a vault token at market price loses ~70% vs actual NAV
      const isComposer = (quote as any)?.tool === 'composer'
      const isSameChain = params.fromChain === params.vaultChainId

      if (!isComposer && isSameChain) {
        const tool = (quote as any)?.tool ?? 'unknown'
        const fromTokenAddr = params.fromToken as `0x${string}`
        const vaultAddr = params.vaultAddress as `0x${string}`
        const vaultAssetAddr = params.vaultAssetAddress as `0x${string}` | undefined
        const fromLower = fromTokenAddr.toLowerCase()
        const isSameAsset = vaultAssetAddr && fromLower === vaultAssetAddr.toLowerCase()
        const isAave = (params.vaultProtocol ?? '').toLowerCase().includes('aave')
        const pub = getPublicClientForChain(params.fromChain)

        console.log(`[lifiDeposit] tool=${tool}, sameAsset=${isSameAsset}, protocol=${params.vaultProtocol}`)

        // ── Cross-asset path: swap fromToken → vaultAsset via LI.FI, then deposit ──
        let depositTokenAddr: `0x${string}` = fromTokenAddr
        let depositAmount: bigint = BigInt(params.fromAmount)

        if (!isSameAsset) {
          if (!vaultAssetAddr) {
            txError.value = 'Vault asset address not provided for cross-token deposit'
            txState.value = 'failed'
            return
          }

          // Request a swap-only quote (toToken = underlying asset, NOT vault share token)
          const swapQuote = await getDepositQuote({
            fromChain: params.fromChain,
            fromToken: params.fromToken,
            fromAmount: params.fromAmount,
            fromAddress,
            toChain: params.vaultChainId,
            vaultAddress: vaultAssetAddr, // swap destination = underlying asset
          })
          if (!swapQuote?.transactionRequest) {
            txError.value = 'No swap route found to vault asset'
            txState.value = 'failed'
            return
          }

          // Approve fromToken → LI.FI router
          txState.value = 'approving'
          const spender = swapQuote.estimate.approvalAddress as `0x${string}`
          const allowance = await pub.readContract({
            address: fromTokenAddr,
            abi: ERC20_ABI,
            functionName: 'allowance',
            args: [fromAddress as `0x${string}`, spender],
          })
          if (allowance < depositAmount) {
            const approveData = encodeFunctionData({
              abi: ERC20_ABI,
              functionName: 'approve',
              args: [spender, BigInt(2) ** BigInt(256) - BigInt(1)],
            })
            const approveHash = await send({ to: fromTokenAddr, data: approveData })
            await pub.waitForTransactionReceipt({ hash: approveHash })
          }

          // Execute swap tx
          txState.value = 'awaiting_signature'
          const swapTxReq = swapQuote.transactionRequest
          const swapHash = await send({
            to: swapTxReq.to as `0x${string}`,
            data: swapTxReq.data as `0x${string}`,
            value: swapTxReq.value ? BigInt(swapTxReq.value) : 0n,
          })
          txHash.value = swapHash
          const swapReceipt = await pub.waitForTransactionReceipt({ hash: swapHash })
          if (swapReceipt.status !== 'success') {
            txError.value = 'Swap reverted'
            txState.value = 'failed'
            return
          }

          // Parse the receipt logs for the Transfer event where the vault
          // asset lands at our address. This is atomic — no dependency on
          // RPC state propagation, so the "first attempt always fails"
          // behavior from balanceOf lag goes away.
          const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
          const fromAddrLower = fromAddress.toLowerCase()
          const vaultAssetLower = vaultAssetAddr.toLowerCase()
          let received = 0n
          for (const log of swapReceipt.logs) {
            if (log.address.toLowerCase() !== vaultAssetLower) continue
            if (log.topics[0] !== TRANSFER_TOPIC) continue
            // topics[2] = indexed `to` address (left-padded to 32 bytes)
            const toTopic = log.topics[2]
            if (!toTopic) continue
            const toAddr = ('0x' + toTopic.slice(26)).toLowerCase()
            if (toAddr !== fromAddrLower) continue
            // Sum all Transfers to our address (multi-hop swaps may emit more than one)
            received += BigInt(log.data)
          }
          if (received <= 0n) {
            txError.value = 'Swap produced no output'
            txState.value = 'failed'
            return
          }

          // Now deposit the received amount of the vault asset
          depositTokenAddr = vaultAssetAddr
          depositAmount = received
          console.log(`[lifiDeposit] swap complete, got ${received} of asset, now depositing`)
        }

        // ── Deposit path: either original same-asset OR post-swap asset ──
        if (isAave) {
          // Aave v3 Pool.supply(asset, amount, onBehalfOf, referralCode)
          const AAVE_POOL_BASE = '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5' as `0x${string}`

          txState.value = 'approving'
          const allowance = await pub.readContract({
            address: depositTokenAddr,
            abi: ERC20_ABI,
            functionName: 'allowance',
            args: [fromAddress as `0x${string}`, AAVE_POOL_BASE],
          })
          if (allowance < depositAmount) {
            const approveData = encodeFunctionData({
              abi: ERC20_ABI,
              functionName: 'approve',
              args: [AAVE_POOL_BASE, BigInt(2) ** BigInt(256) - BigInt(1)],
            })
            const approveHash = await send({ to: depositTokenAddr, data: approveData })
            await pub.waitForTransactionReceipt({ hash: approveHash })
          }

          txState.value = 'awaiting_signature'
          const supplyAbi = parseAbi([
            'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)',
          ])
          const supplyData = encodeFunctionData({
            abi: supplyAbi,
            functionName: 'supply',
            args: [depositTokenAddr, depositAmount, fromAddress as `0x${string}`, 0],
          })
          const hash = await send({ to: AAVE_POOL_BASE, data: supplyData })
          txHash.value = hash
          txState.value = 'pending'
          const receipt = await pub.waitForTransactionReceipt({ hash })
          txState.value = receipt.status === 'success' ? 'confirmed' : 'failed'
          if (receipt.status !== 'success') txError.value = 'Aave supply reverted'
          return
        }

        // ERC-4626 path (Morpho, etc): approve asset → vault then deposit()
        txState.value = 'approving'
        const allowance = await pub.readContract({
          address: depositTokenAddr,
          abi: ERC20_ABI,
          functionName: 'allowance',
          args: [fromAddress as `0x${string}`, vaultAddr],
        })
        if (allowance < depositAmount) {
          const approveData = encodeFunctionData({
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [vaultAddr, BigInt(2) ** BigInt(256) - BigInt(1)],
          })
          const approveHash = await send({ to: depositTokenAddr, data: approveData })
          await pub.waitForTransactionReceipt({ hash: approveHash })
        }

        txState.value = 'awaiting_signature'
        const depositData = encodeFunctionData({
          abi: ERC4626_ABI,
          functionName: 'deposit',
          args: [depositAmount, fromAddress as `0x${string}`],
        })
        const hash = await send({ to: vaultAddr, data: depositData })
        txHash.value = hash
        txState.value = 'pending'
        const receipt = await pub.waitForTransactionReceipt({ hash })
        txState.value = receipt.status === 'success' ? 'confirmed' : 'failed'
        if (receipt.status !== 'success') txError.value = 'Vault deposit reverted'
        return
      }

      if (!quote?.transactionRequest) {
        txError.value = 'No route found for this deposit. Try a different token or chain.'
        txState.value = 'failed'
        return
      }

      // ERC-20 approval if needed
      const isNative = params.fromToken.toLowerCase() === NATIVE
      if (!isNative) {
        txState.value = 'approving'
        const pub = getPublicClientForChain(params.fromChain)
        const spender = quote.estimate.approvalAddress as `0x${string}`
        const required = BigInt(params.fromAmount)

        const allowance = await pub.readContract({
          address: params.fromToken as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'allowance',
          args: [fromAddress as `0x${string}`, spender],
        })

        if (allowance < required) {
          const approveData = encodeFunctionData({
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [spender, 2n ** 256n - 1n],
          })
          const approveHash = await send({ to: params.fromToken as `0x${string}`, data: approveData })
          const approveReceipt = await pub.waitForTransactionReceipt({ hash: approveHash })
          if (approveReceipt.status !== 'success') {
            txError.value = 'Token approval failed'
            txState.value = 'failed'
            return
          }
        }
      }

      // Execute deposit tx
      txState.value = 'awaiting_signature'
      const { transactionRequest } = quote
      const hash = await send({
        to: transactionRequest.to as `0x${string}`,
        data: transactionRequest.data as `0x${string}`,
        value: BigInt(transactionRequest.value || '0'),
      })

      txHash.value = hash
      txState.value = 'pending'

      // Wait for confirmation
      const pub = getPublicClientForChain(params.fromChain)

      if (isSameChain) {
        const receipt = await pub.waitForTransactionReceipt({ hash })
        txState.value = receipt.status === 'success' ? 'confirmed' : 'failed'
        if (receipt.status !== 'success') txError.value = 'Transaction reverted'
      } else {
        await pub.waitForTransactionReceipt({ hash })
        crossChainStatus.value = 'bridging'

        const finalStatus = await pollTransferStatus(hash, params.fromChain, params.vaultChainId, {
          onUpdate(statusResult) {
            if (statusResult.receiving?.txHash) {
              crossChainTxHash.value = statusResult.receiving.txHash as `0x${string}`
            }
          },
        })

        if (finalStatus === 'DONE') {
          crossChainStatus.value = 'done'
          txState.value = 'confirmed'
        } else if (finalStatus === 'FAILED') {
          crossChainStatus.value = 'failed'
          txState.value = 'failed'
          txError.value = 'Cross-chain transfer failed'
        } else if (finalStatus === 'PARTIAL') {
          crossChainStatus.value = 'partial'
          txState.value = 'confirmed'
          txError.value = 'Tokens arrived on destination chain but vault deposit may need manual action.'
        } else {
          crossChainStatus.value = 'done'
          txState.value = 'confirmed'
        }
      }
    } catch (e: any) {
      console.error('[useVault] lifiDeposit error:', e)
      txState.value = 'failed'
      crossChainStatus.value = 'idle'
      txError.value = e.shortMessage || e.message || 'Deposit failed'
    }
  }

  function reset() {
    txState.value = 'idle'
    txHash.value = null
    txError.value = ''
    gasEstimate.value = ''
    crossChainStatus.value = 'idle'
    crossChainTxHash.value = null
  }

  return {
    txState,
    txHash,
    txError,
    gasEstimate,
    crossChainStatus,
    crossChainTxHash,
    deposit,
    redeem,
    lifiDeposit,
    getShareBalance,
    getShareValue,
    previewDeposit,
    previewRedeem,
    reset,
  }
}
