export const NATIVE_TOKEN = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' as const

export interface TokenBalance {
  amount: string
  decimals: number
  token: string
  price: string
  name: string
  symbol: string
  logoUri: string
}

export function useEnso() {
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
    getWalletBalances,
    NATIVE_TOKEN,
  }
}
