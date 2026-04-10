import type { Strategy } from '~/config/strategies'

const NATIVE_TOKEN = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' as const

export interface TokenBalance {
  amount: string
  decimals: number
  token: string
  price: string
  name: string
  symbol: string
  logoUri: string
}

export interface ZapQuote {
  amountOut: string
  gas: string
  tx: {
    to: string
    data: string
    from: string
    value: string
  }
  route: any[]
  priceImpact: string | null
}

export function useEnso() {
  const loading = ref(false)
  const error = ref('')

  function tokenAddress(strategy: Strategy): `0x${string}` {
    return strategy.type === 'native' ? NATIVE_TOKEN : strategy.assetAddress
  }

  async function getZapQuote(
    tokenIn: `0x${string}`,
    strategy: Strategy,
    amountIn: string,
    fromAddress: `0x${string}`,
  ): Promise<ZapQuote | null> {
    loading.value = true
    error.value = ''

    try {
      const vaultAsset = tokenAddress(strategy)

      // If tokenIn is the same as vault underlying, no zap needed
      if (tokenIn.toLowerCase() === vaultAsset.toLowerCase()) {
        return null
      }

      return await $fetch<ZapQuote>('/api/enso/route', {
        method: 'POST',
        body: {
          fromAddress,
          amountIn,
          tokenIn,
          tokenOut: strategy.vaultAddress,
          slippage: '300',
        },
      })
    } catch (e: any) {
      error.value = e.message || 'Failed to get zap quote'
      console.error('[useEnso] getZapQuote error:', e)
      return null
    } finally {
      loading.value = false
    }
  }

  async function getZapWithdrawQuote(
    strategy: Strategy,
    tokenOut: `0x${string}`,
    shares: string,
    fromAddress: `0x${string}`,
  ): Promise<ZapQuote | null> {
    loading.value = true
    error.value = ''

    try {
      const vaultAsset = tokenAddress(strategy)

      // If withdrawing to the vault's underlying asset, no zap needed
      if (tokenOut.toLowerCase() === vaultAsset.toLowerCase()) {
        return null
      }

      return await $fetch<ZapQuote>('/api/enso/route', {
        method: 'POST',
        body: {
          fromAddress,
          amountIn: shares,
          tokenIn: strategy.vaultAddress,
          tokenOut,
          slippage: '300',
        },
      })
    } catch (e: any) {
      error.value = e.message || 'Failed to get withdraw quote'
      console.error('[useEnso] getZapWithdrawQuote error:', e)
      return null
    } finally {
      loading.value = false
    }
  }

  async function getApprovalTx(
    tokenIn: `0x${string}`,
    amount: string,
    fromAddress: `0x${string}`,
  ) {
    try {
      return await $fetch('/api/enso/approval', {
        method: 'POST',
        body: { fromAddress, tokenAddress: tokenIn, amount },
      })
    } catch (e: any) {
      console.error('[useEnso] getApprovalTx error:', e)
      return null
    }
  }

  async function getWalletBalances(address: `0x${string}`): Promise<TokenBalance[]> {
    try {
      return await $fetch<TokenBalance[]>('/api/enso/balances', {
        query: { address },
      })
    } catch (e: any) {
      console.error('[useEnso] getWalletBalances error:', e)
      return []
    }
  }

  return {
    loading,
    error,
    getZapQuote,
    getZapWithdrawQuote,
    getApprovalTx,
    getWalletBalances,
    NATIVE_TOKEN,
  }
}
