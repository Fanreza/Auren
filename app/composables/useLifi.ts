// ─── LI.FI Type Definitions ─────────────────────────────────────────────────

export interface LifiVault {
  /** lpTokens[0].address — use as toToken in Composer deposits */
  address: string
  chainId: number
  name: string
  slug: string
  /** Friendly protocol name, normalised by server e.g. "Morpho", "Aave V3" */
  protocol: string
  /** lpTokens[0].symbol — vault token symbol e.g. "re7USDC" */
  vaultSymbol: string
  underlyingTokens: Array<{
    address: string
    symbol: string
    decimals: number
    weight?: number
  }>
  lpTokens: Array<{
    address: string
    symbol: string
    decimals: number
    priceUsd?: string
  }>
  analytics: {
    apy: { base: number; reward: number | null; total: number } | null
    apy1d?: number
    apy7d?: number
    apy30d?: number
    tvl: { usd: string; native: string } | null
  }
  /** Decimal APY, normalised by server: 0.0534 = 5.34% */
  apy: number
  /** TVL in USD, normalised by server */
  tvl: number
  isTransactional: boolean
  isRedeemable: boolean
  tags?: string[]
  timeLock?: number
}

export interface LifiVaultsResponse {
  vaults: LifiVault[]
  nextPage?: number
}

export interface LifiPosition {
  vault: LifiVault
  shares: string
  assetsValue: number          // USD value
  chainId: number
  userAddress: string
}

export interface LifiPortfolioResponse {
  positions: LifiPosition[]
}

export interface LifiToken {
  address: string
  chainId: number
  symbol: string
  decimals: number
  name: string
  logoURI?: string
}

export interface LifiQuoteAction {
  fromChainId: number
  toChainId: number
  fromToken: LifiToken
  toToken: LifiToken
  fromAmount: string
  slippage: number
}

export interface LifiQuoteEstimate {
  approvalAddress: string
  fromAmount: string
  toAmount: string
  toAmountMin: string
  gasCosts: Array<{
    amount: string
    amountUSD: string
    token: LifiToken
    estimate: string
    type: string
  }>
  feeCosts?: Array<{
    amount: string
    amountUSD: string
    token: LifiToken
    name: string
    description: string
  }>
  executionDuration: number    // seconds
  fromAmountUSD?: string
  toAmountUSD?: string
}

export interface LifiTransactionRequest {
  to: string
  data: string
  value: string
  gasLimit: string
  gasPrice?: string
  from: string
  chainId: number
}

export interface LifiQuote {
  id: string
  type: string
  tool: string
  toolDetails: {
    key: string
    name: string
    logoURI?: string
  }
  action: LifiQuoteAction
  estimate: LifiQuoteEstimate
  transactionRequest: LifiTransactionRequest
  steps?: any[]
}

export type LifiTransferStatus = 'NOT_FOUND' | 'PENDING' | 'DONE' | 'FAILED' | 'PARTIAL'

export interface LifiStatusResponse {
  status: LifiTransferStatus
  substatus?: string
  substatusMessage?: string
  sending?: {
    txHash: string
    chainId: number
    amount: string
    amountUSD?: string
  }
  receiving?: {
    txHash?: string
    chainId: number
    amount?: string
    amountUSD?: string
  }
}

// ─── Composable ─────────────────────────────────────────────────────────────

// Supported chains for crosschain deposits
export const LIFI_SUPPORTED_CHAINS = [
  { id: 1,     name: 'Ethereum',  symbol: 'ETH',   color: '#627EEA' },
  { id: 42161, name: 'Arbitrum',  symbol: 'ARB',   color: '#28A0F0' },
  { id: 10,    name: 'Optimism',  symbol: 'OP',    color: '#FF0420' },
  { id: 137,   name: 'Polygon',   symbol: 'MATIC', color: '#8247E5' },
  { id: 8453,  name: 'Base',      symbol: 'BASE',  color: '#0052FF' },
  { id: 56,    name: 'BNB Chain', symbol: 'BNB',   color: '#F3BA2F' },
  { id: 43114, name: 'Avalanche', symbol: 'AVAX',  color: '#E84142' },
] as const

export type LifiChainId = typeof LIFI_SUPPORTED_CHAINS[number]['id']

export function useLifi() {
  /**
   * Fetch the best vaults for a given underlying asset symbol.
   * sortBy: 'apy' | 'tvl'
   */
  async function getBestVaults(
    assetSymbol: string,
    options?: { chainId?: number; limit?: number; sortBy?: string },
  ): Promise<LifiVault[]> {
    try {
      const query: Record<string, string | number> = {
        asset: assetSymbol,
        sortBy: options?.sortBy ?? 'apy',
        limit: options?.limit ?? 5,
      }
      if (options?.chainId) query.chainId = options.chainId

      const result = await $fetch<LifiVaultsResponse>('/api/lifi/vaults', { query })
      const vaults = result?.vaults ?? []

      // Debug: log raw vault shape so we can see actual field names
      if (vaults.length && import.meta.dev) {
        const v = vaults[0] as any
        console.log(`[LI.FI] vault sample for "${assetSymbol}":`, JSON.stringify(v).slice(0, 500))
      }

      return vaults
    } catch (e) {
      console.error('[useLifi] getBestVaults failed:', e)
      return []
    }
  }

  /**
   * Get the single best vault (highest APY) for an asset symbol.
   */
  async function getBestVault(
    assetSymbol: string,
    options?: { chainId?: number },
  ): Promise<LifiVault | null> {
    const vaults = await getBestVaults(assetSymbol, { ...options, limit: 1 })
    return vaults[0] ?? null
  }

  /**
   * Get all active positions for a wallet from LI.FI Earn Portfolio API.
   */
  async function getPortfolioPositions(wallet: string): Promise<LifiPosition[]> {
    try {
      const result = await $fetch<LifiPortfolioResponse>('/api/lifi/portfolio', {
        query: { wallet },
      })
      return result?.positions ?? []
    } catch (e) {
      console.error('[useLifi] getPortfolioPositions failed:', e)
      return []
    }
  }

  /**
   * Get a LI.FI Composer quote for depositing into a vault.
   * Set toToken = LifiVault.address to activate Composer automatically.
   */
  async function getDepositQuote(params: {
    fromChain: number
    fromToken: string
    fromAmount: string
    fromAddress: string
    toChain: number
    vaultAddress: string
    slippage?: number
  }): Promise<LifiQuote | null> {
    try {
      return await $fetch<LifiQuote>('/api/lifi/quote', {
        query: {
          fromChain: params.fromChain,
          toChain: params.toChain,
          fromToken: params.fromToken,
          toToken: params.vaultAddress,
          fromAmount: params.fromAmount,
          fromAddress: params.fromAddress,
          // toAddress REQUIRED for same-chain Composer deposits — otherwise LI.FI routes as swap
          toAddress: params.fromAddress,
          slippage: params.slippage ?? 0.005,
          order: 'RECOMMENDED',
        },
      })
    } catch (e) {
      console.error('[useLifi] getDepositQuote failed:', e)
      return null
    }
  }

  /**
   * Get a LI.FI Composer quote for withdrawing from a vault.
   * fromToken = vault token address, toToken = desired output token.
   */
  async function getWithdrawQuote(params: {
    fromChain: number           // vault chain
    vaultAddress: string        // vault token (fromToken)
    fromAmount: string          // shares amount in smallest units
    fromAddress: string
    toChain: number             // destination chain
    toToken: string             // desired output token
    slippage?: number
  }): Promise<LifiQuote | null> {
    try {
      return await $fetch<LifiQuote>('/api/lifi/quote', {
        query: {
          fromChain: params.fromChain,
          toChain: params.toChain,
          fromToken: params.vaultAddress,
          toToken: params.toToken,
          fromAmount: params.fromAmount,
          fromAddress: params.fromAddress,
          slippage: params.slippage ?? 0.005,
        },
      })
    } catch (e) {
      console.error('[useLifi] getWithdrawQuote failed:', e)
      return null
    }
  }

  /**
   * Poll LI.FI transfer status until DONE/FAILED or maxAttempts exhausted.
   * Calls onUpdate on each poll so the UI can show live progress.
   */
  async function pollTransferStatus(
    txHash: string,
    fromChain: number,
    toChain: number,
    options?: {
      intervalMs?: number
      maxAttempts?: number
      onUpdate?: (status: LifiStatusResponse) => void
    },
  ): Promise<LifiTransferStatus> {
    const intervalMs = options?.intervalMs ?? 5000
    const maxAttempts = options?.maxAttempts ?? 72   // ~6 minutes
    let attempts = 0

    while (attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, intervalMs))
      try {
        const result = await $fetch<LifiStatusResponse>('/api/lifi/status', {
          query: { txHash, fromChain, toChain },
        })
        options?.onUpdate?.(result)
        if (result.status === 'DONE' || result.status === 'FAILED' || result.status === 'PARTIAL') {
          return result.status
        }
      } catch {
        // Transient fetch error — continue polling
      }
      attempts++
    }

    return 'PENDING'    // timed out — treat as still pending
  }

  /**
   * Format APY from LI.FI decimal (0.048) to display string ("4.80%")
   */
  function formatApy(apy: number): string {
    return (apy * 100).toFixed(2) + '%'
  }

  /**
   * Format TVL from USD number to display string ("$12.4M")
   */
  function formatTvl(tvl: number): string {
    if (tvl >= 1_000_000_000) return '$' + (tvl / 1_000_000_000).toFixed(1) + 'B'
    if (tvl >= 1_000_000) return '$' + (tvl / 1_000_000).toFixed(1) + 'M'
    if (tvl >= 1_000) return '$' + (tvl / 1_000).toFixed(0) + 'K'
    return '$' + tvl.toFixed(0)
  }

  /**
   * Get chain metadata by chainId
   */
  function getChainInfo(chainId: number) {
    return LIFI_SUPPORTED_CHAINS.find(c => c.id === chainId) ?? null
  }

  return {
    getBestVault,
    getBestVaults,
    getPortfolioPositions,
    getDepositQuote,
    getWithdrawQuote,
    pollTransferStatus,
    formatApy,
    formatTvl,
    getChainInfo,
    LIFI_SUPPORTED_CHAINS,
  }
}
